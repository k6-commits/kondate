// Hono のアプリ（DESIGN.md 5章）。テストしやすいように、外とのつながり（保存・LINE・LLM・時計など）は deps で受け取る。
//   GET  /health        → { ok, llm, line }
//   POST /api/parse     → { commands, source }（画面が開発時に使う。PARSE_API_ENABLED のときだけ。CORS は CORS_ORIGIN だけ）
//   POST /line/webhook  → 署名を確かめて 200 を先に返し、イベントの処理は defer で続ける
//   POST /cron/evening  → Bearer CRON_SECRET。有料版の世帯に、今日の配信を push する
import { Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { isISODate, parseMessage, validateCommands, type Catalog, type Member } from '../src/engine/index';
import type { Defer } from './defer';
import { runEvening } from './evening';
import { interpretWithLlm, minimalState } from './interpret';
import { verifySignature, type LineClient } from './line';
import type { LlmInterpreter } from './llm';
import { errorKind, silentLogger, type Logger } from './log';
import { bearerToken, safeEqual } from './security';
import type { Store } from './store';
import { WebhookBodySchema, createWebhookHandler } from './webhook';

export interface AppConfig {
  /** LINE_CHANNEL_SECRET。なければ /line/webhook は 503。 */
  lineChannelSecret?: string;
  /** CRON_SECRET。なければ /cron/evening は 503。 */
  cronSecret?: string;
  /**
   * /api/parse を使えるようにするか（PARSE_API_ENABLED）。既定は使えない（404）。
   * 開発用の口で認証がなく、ANTHROPIC_API_KEY があれば呼ばれるたびに LLM の費用がかかるので、公開するサーバーでは有効にしない。
   */
  parseApiEnabled?: boolean;
  /** /api/parse を許可するオリジン（CORS_ORIGIN。カンマ区切りで複数も可）。ほかのオリジンからのリクエストは 403。 */
  corsOrigin: string;
}

export interface AppDeps {
  store: Store;
  catalog: Catalog;
  /** reply / push。LINE_CHANNEL_ACCESS_TOKEN がなければ null（返信しない）。 */
  line: LineClient | null;
  /** 書き込みの解釈に使う LLM（任意）。なければルールベース。 */
  llm?: LlmInterpreter | null;
  /** 今の日時（テストで固定する）。日付は日本時間で数える。 */
  now: () => Date;
  config: AppConfig;
  /** webhook の後処理を続ける仕組み（テストでは終わるのを待てるもの）。 */
  defer: Defer;
  logger?: Logger;
}

export const MAX_WEBHOOK_BYTES = 1024 * 1024;
export const MAX_PARSE_BYTES = 64 * 1024;
export const MAX_PARSE_TEXT = 500;

// 画面は state.household.members をそのまま送る（exclusions などの使わない項目は読み捨てる）。
const MemberSchema = z.object({
  id: z.string().min(1).max(100),
  nickname: z.string().max(100),
  ageBand: z.enum(['adult', 'teen', 'child', 'preschool', 'infant']),
  role: z.enum(['parent', 'partner', 'child', 'other']).nullish(),
});

export const ParseRequestSchema = z.object({
  text: z.string().max(MAX_PARSE_TEXT),
  today: z.string().refine(isISODate),
  members: z.array(MemberSchema).max(20),
});

/** Content-Type が application/json か（charset などの付いたものも可）。 */
function isJsonContentType(header: string | undefined): boolean {
  return (header ?? '').split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * /api/parse の前の確認（LLM を呼ぶ前に断る）。
 * - Origin ヘッダーがあって、許可したオリジンでなければ 403（ほかのサイトのページからの呼び出し）。
 * - 本文が JSON（application/json）でなければ 415（ほかのサイトのフォームなど、プリフライトなしで届く送り方）。
 * Origin のないリクエスト（curl など、ブラウザ以外）は通す。
 */
function parseApiGuard(origins: string[]): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined && !origins.includes(origin)) return c.json({ error: 'forbidden_origin' }, 403);
    if (!isJsonContentType(c.req.header('content-type'))) return c.json({ error: 'unsupported_media_type' }, 415);
    await next();
  };
}

export function createApp(deps: AppDeps): Hono {
  const logger = deps.logger ?? silentLogger;
  const llm = deps.llm ?? null;
  const { catalog, config } = deps;
  const origins = config.corsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  const handleEvents = createWebhookHandler({ store: deps.store, catalog, line: deps.line, llm, now: deps.now, logger });
  const webhookBodyLimit = bodyLimit({
    maxSize: MAX_WEBHOOK_BYTES,
    onError: (c) => c.json({ error: 'payload_too_large' }, 413),
  });

  const app = new Hono();

  app.onError((err, c) => {
    logger.error('リクエストの処理に失敗しました', { path: c.req.path, error: errorKind(err) });
    return c.json({ error: 'internal_error' }, 500);
  });

  app.get('/health', (c) =>
    c.json({ ok: true, llm: llm !== null, line: Boolean(config.lineChannelSecret) && deps.line !== null }),
  );

  // ----- /api/parse（PARSE_API_ENABLED のときだけ。なければ 404） -----

  if (config.parseApiEnabled) {
    app.use(
      '/api/*',
      cors({
        origin: (origin) => (origins.includes(origin) ? origin : null),
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        maxAge: 600,
      }),
    );

    app.post(
      '/api/parse',
      parseApiGuard(origins),
      bodyLimit({ maxSize: MAX_PARSE_BYTES, onError: (c) => c.json({ error: 'payload_too_large' }, 413) }),
      async (c) => {
        let body: unknown;
        try {
          body = await c.req.json();
        } catch {
          return c.json({ error: 'invalid_json' }, 400);
        }
        const parsed = ParseRequestSchema.safeParse(body);
        if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
        const { text, today } = parsed.data;
        const members: Member[] = parsed.data.members.map((m) => ({
          id: m.id,
          nickname: m.nickname,
          ageBand: m.ageBand,
          ...(m.role ? { role: m.role } : {}),
          exclusions: [],
        }));
        const state = minimalState(today, members);
        const fromLlm = await interpretWithLlm(llm, catalog, state, text);
        if (fromLlm) return c.json({ commands: fromLlm, source: 'llm' as const });
        const rules = validateCommands(state, catalog, parseMessage(text, { today, members, catalog }));
        return c.json({ commands: rules, source: 'rules' as const });
      },
    );
  }

  // ----- /line/webhook -----

  app.post('/line/webhook', webhookBodyLimit, async (c) => {
    const secret = config.lineChannelSecret;
    if (!secret) return c.json({ error: 'line_not_configured' }, 503);
    const signature = c.req.header('x-line-signature');
    if (!signature) return c.json({ error: 'unauthorized' }, 401);
    // 署名は、JSON にする前の生の本文で確かめる。
    const raw = new Uint8Array(await c.req.arrayBuffer());
    if (!verifySignature(secret, raw, signature)) return c.json({ error: 'unauthorized' }, 401);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = WebhookBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const events = parsed.data.events;
    // 200 を先に返し、イベントの処理（LLM・保存・返信）は後で続ける。
    if (events.length > 0) deps.defer(() => handleEvents(events));
    return c.json({ ok: true });
  });

  // ----- /cron/evening -----

  app.post('/cron/evening', async (c) => {
    const secret = config.cronSecret;
    if (!secret) return c.json({ error: 'cron_not_configured' }, 503);
    const token = bearerToken(c.req.header('authorization'));
    if (!token || !safeEqual(token, secret)) return c.json({ error: 'unauthorized' }, 401);
    const result = await runEvening({ store: deps.store, catalog, line: deps.line, now: deps.now, logger });
    return c.json(result);
  });

  return app;
}
