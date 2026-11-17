// 書き込みの AI 読み取りの口（/api/parse）の中身。開発用のサーバー（app.ts の Hono）と、ホーム画面に置く版の
// Netlify の関数（netlify/functions/parse.ts）で同じものを使う。
// - 名前は送らない（llm.ts が member の id に置き換える）。家族の記録（献立・在庫・トーク）は受け取らない。
// - LLM の結果はエンジンの validateCommands で確かめてから返す。画面も、受け取ったあとでもう一度確かめる。
import { z } from 'zod';
import { isISODate, parseMessage, validateCommands, type Catalog, type Member, type ParsedCommand } from '../src/engine/index';
import { interpretWithLlm, minimalState } from './interpret';
import type { LlmInterpreter } from './llm';
import { errorKind, silentLogger, type Logger } from './log';

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
export function isJsonContentType(header: string | null | undefined): boolean {
  return (header ?? '').split(';')[0].trim().toLowerCase() === 'application/json';
}

export type ParseAnswer =
  | { status: 200; body: { commands: ParsedCommand[]; source: 'llm' | 'rules' } }
  | { status: 400; body: { error: 'invalid_request' } };

/**
 * 本文（JSON を読んだもの）から commands を作る。LLM で読めれば source 'llm'、読めなければルールで読んだもの（'rules'）。
 */
export async function answerParse(body: unknown, llm: LlmInterpreter | null, catalog: Catalog): Promise<ParseAnswer> {
  const parsed = ParseRequestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: 'invalid_request' } };
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
  if (fromLlm) return { status: 200, body: { commands: fromLlm, source: 'llm' } };
  const rules = validateCommands(state, catalog, parseMessage(text, { today, members, catalog }));
  return { status: 200, body: { commands: rules, source: 'rules' } };
}

export interface ParseHandlerDeps {
  /** 使う LLM。鍵がなければ null（そのときは 503 を返し、画面はルールで読む）。呼ばれるたびに読む（関数を温めておくため）。 */
  llm: () => LlmInterpreter | null;
  catalog: Catalog;
  logger?: Logger;
}

const NO_STORE = { 'cache-control': 'no-store' };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Web 標準の Request / Response で動く /api/parse（Netlify の関数）。
 * - GET：AI で読めるか（鍵があるか）だけを返す。LLM は呼ばない（画面が起動したときに1回聞く）。
 * - POST：書き込みを読む。ほかのサイトのページからの呼び出し（Origin が違う）は 403、JSON でなければ 415、
 *   大きすぎれば 413、鍵がなければ 503。
 */
export function createParseHandler(deps: ParseHandlerDeps): (req: Request) => Promise<Response> {
  const logger = deps.logger ?? silentLogger;
  return async (req) => {
    try {
      if (req.method === 'GET') return json({ ok: true, llm: deps.llm() !== null });
      if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      const origin = req.headers.get('origin');
      if (origin !== null && origin !== new URL(req.url).origin) return json({ error: 'forbidden_origin' }, 403);
      if (!isJsonContentType(req.headers.get('content-type'))) return json({ error: 'unsupported_media_type' }, 415);
      const llm = deps.llm();
      if (!llm) return json({ error: 'llm_unavailable' }, 503);
      const declared = Number(req.headers.get('content-length') ?? '0');
      if (declared > MAX_PARSE_BYTES) return json({ error: 'payload_too_large' }, 413);
      const raw = await req.text();
      if (raw.length > MAX_PARSE_BYTES) return json({ error: 'payload_too_large' }, 413);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      const answer = await answerParse(body, llm, deps.catalog);
      return json(answer.body, answer.status);
    } catch (e) {
      logger.error('書き込みの読み取りに失敗しました', { error: errorKind(e) });
      return json({ error: 'internal_error' }, 500);
    }
  };
}
