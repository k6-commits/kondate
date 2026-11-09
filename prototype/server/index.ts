// きめとく（仮）プロトタイプのサーバー。環境変数を読んで deps を作り、@hono/node-server で待ち受ける。
// 起動：npm run server（.env があれば読み込む。すでにある環境変数は上書きしない）。
// 環境変数の説明は .env.example を参照。
import { existsSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { defaultCatalog } from '../src/data/index';
import { createApp } from './app';
import { createDeferQueue } from './defer';
import { createLineClient } from './line';
import { DEFAULT_MODEL, createLlmInterpreter } from './llm';
import { consoleLogger, errorKind } from './log';
import { createFileStore } from './store';

const logger = consoleLogger;

if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch (e) {
    logger.warn('.env を読めませんでした', { error: errorKind(e) });
  }
}

const env = process.env;
const value = (name: string): string | undefined => {
  const v = env[name]?.trim();
  return v ? v : undefined;
};

function parsePort(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8787;
}

/** 1・true・yes・on なら有効。 */
const flag = (name: string): boolean => /^(1|true|yes|on)$/i.test(value(name) ?? '');

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

const port = parsePort(value('PORT'));
const dataDir = value('DATA_DIR') ?? '.data';
const lineChannelSecret = value('LINE_CHANNEL_SECRET');
const lineAccessToken = value('LINE_CHANNEL_ACCESS_TOKEN');
const anthropicApiKey = value('ANTHROPIC_API_KEY');
const cronSecret = value('CRON_SECRET');
const corsOrigin = value('CORS_ORIGIN') ?? 'http://localhost:5173';
// /api/parse は開発用の口で、認証がない（呼ばれるたびに LLM の費用がかかる）。既定では使えない。
const parseApiEnabled = flag('PARSE_API_ENABLED');
// 待ち受けるアドレス。未設定なら、/api/parse を有効にしたときは 127.0.0.1（このマシンからだけ）、
// そうでなければすべてのアドレス（LINE の webhook を、コンテナやクラウドでも受けられるように）。
const host = value('HOST') ?? (parseApiEnabled ? '127.0.0.1' : undefined);

const catalog = defaultCatalog;
const queue = createDeferQueue(logger);
const store = createFileStore({ dir: dataDir, logger });
const line = lineAccessToken ? createLineClient({ accessToken: lineAccessToken, logger }) : null;
// 止めるときに、途中の LLM の解釈を打ち切る（その書き込みはルールで読んで、保存と返信まで済ませる）。
const stopLlm = new AbortController();
// ANTHROPIC_API_KEY があるときだけ、書き込みの解釈に LLM を使う（なければルールベース）。
const llm = anthropicApiKey
  ? createLlmInterpreter({
      client: new Anthropic({ apiKey: anthropicApiKey }),
      catalog,
      model: value('KIMETOKU_MODEL') ?? DEFAULT_MODEL,
      logger,
      stopSignal: stopLlm.signal,
    })
  : null;

const app = createApp({
  store,
  catalog,
  line,
  llm,
  now: () => new Date(),
  config: { lineChannelSecret, cronSecret, parseApiEnabled, corsOrigin },
  defer: queue.defer,
  logger,
});

// 設定の有無だけをログに出す（値は出さない）。
const yesNo = (v: unknown) => (v ? 'あり' : 'なし');
logger.info(`LLM（ANTHROPIC_API_KEY）：${yesNo(llm)}${llm ? '' : '（書き込みはルールベースで解釈します）'}`);
logger.info(
  `LINE：チャネルシークレット ${yesNo(lineChannelSecret)}、アクセストークン ${yesNo(line)}` +
    (lineChannelSecret ? '' : '（/line/webhook は 503 を返します）') +
    (line ? '' : '（返信と配信はしません）'),
);
logger.info(`CRON_SECRET：${yesNo(cronSecret)}${cronSecret ? '' : '（/cron/evening は 503 を返します）'}`);
logger.info(
  parseApiEnabled
    ? `/api/parse：有効（開発用。許可するオリジン：${corsOrigin}）`
    : '/api/parse：無効（開発で画面から使うときは PARSE_API_ENABLED=1）',
);
if (parseApiEnabled && !(host && LOOPBACK.has(host))) {
  logger.warn('/api/parse には認証がありません。ほかのマシンからも呼べるので、手元だけで使うときは HOST=127.0.0.1 にしてください');
}
logger.info(`保存先：${dataDir}`);

const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  logger.info(
    host
      ? `待ち受けています：http://${host.includes(':') ? `[${host}]` : host}:${info.port}`
      : `待ち受けています：http://localhost:${info.port}（すべてのアドレスで受けます。HOST で変えられます）`,
  );
});

/**
 * 止めるときに、受け取ったイベントの処理（保存・返信）を待つ時間の上限。LLM の解釈は止めてルールに戻すので、
 * 残るのは保存と LINE への返信（1回10秒まで）。LLM の全体の上限（LLM_TOTAL_TIMEOUT_MS）より長くとる。
 */
const SHUTDOWN_WAIT_MS = 20_000;

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info(`${signal} を受け取ったので、止めます`);
  server.close();
  stopLlm.abort();
  const timer = setTimeout(() => {
    logger.warn('処理の途中のイベントを待ちきれずに止めます', { pending: queue.size });
    process.exit(0);
  }, SHUTDOWN_WAIT_MS);
  await queue.idle();
  clearTimeout(timer);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
