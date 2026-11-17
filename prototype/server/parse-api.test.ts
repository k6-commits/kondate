// /api/parse の中身（Netlify の関数と開発用のサーバーで共通）：Request → Response。
import { describe, expect, it } from 'vitest';
import { DEMO_ONBOARDING, defaultCatalog } from '../src/data/index';
import type { ParsedCommand } from '../src/engine/index';
import type { InterpretInput, LlmInterpreter } from './llm';
import { MAX_PARSE_BYTES, createParseHandler } from './parse-api';

const SITE = 'https://kimetoku.example';
const TODAY = '2026-11-16';
const members = DEMO_ONBOARDING.members.map((m, i) => ({ ...m, id: `member_${i + 1}` }));

function fakeLlm(reply: ParsedCommand[] | null): LlmInterpreter & { inputs: InterpretInput[] } {
  const inputs: InterpretInput[] = [];
  return {
    model: 'test-model',
    inputs,
    async interpret(input) {
      inputs.push(input);
      return reply;
    },
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('/api/parse（Request → Response）', () => {
  it('GET：鍵があるかだけを返す（LLM は呼ばない。キャッシュさせない）', async () => {
    const llm = fakeLlm([]);
    const on = createParseHandler({ llm: () => llm, catalog: defaultCatalog });
    const res = await on(new Request(`${SITE}/api/parse`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, llm: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(llm.inputs).toHaveLength(0);
    const off = createParseHandler({ llm: () => null, catalog: defaultCatalog });
    expect(await (await off(new Request(`${SITE}/api/parse`))).json()).toEqual({ ok: true, llm: false });
  });

  it('POST：LLM で読めたら確かめた commands を source llm で返す（家族の名前はそのまま LLM の層に渡す。置き換えは llm.ts）', async () => {
    const llm = fakeLlm([{ type: 'show_week' }]);
    const handler = createParseHandler({ llm: () => llm, catalog: defaultCatalog });
    const res = await handler(post({ text: '今日は無理', today: TODAY, members }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ commands: [{ type: 'show_week' }], source: 'llm' });
    expect(llm.inputs[0]).toMatchObject({ text: '今日は無理', today: TODAY });
  });

  it('POST：LLM で読めなければ、ルールで読んだもの（source rules）', async () => {
    const handler = createParseHandler({ llm: () => fakeLlm(null), catalog: defaultCatalog });
    const res = await handler(post({ text: '今日は無理', today: TODAY, members }));
    const body = (await res.json()) as { source: string; commands: unknown[] };
    expect(body.source).toBe('rules');
  });

  it('鍵がなければ 503（LLM を呼ばない）。ほかのサイトのページからは 403、JSON でなければ 415、形が違えば 400', async () => {
    const none = createParseHandler({ llm: () => null, catalog: defaultCatalog });
    expect((await none(post({ text: 'x', today: TODAY, members }))).status).toBe(503);
    const llm = fakeLlm([]);
    const handler = createParseHandler({ llm: () => llm, catalog: defaultCatalog });
    expect((await handler(post({ text: 'x', today: TODAY, members }, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await handler(post({ text: 'x', today: TODAY, members }, { 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await handler(post('{not json'))).status).toBe(400);
    expect((await handler(post({ text: 'x'.repeat(501), today: TODAY, members }))).status).toBe(400);
    expect((await handler(post({ text: 'x', today: '11/16', members }))).status).toBe(400);
    expect(llm.inputs).toHaveLength(0);
  });

  it('大きすぎる本文は 413、ほかのメソッドは 405。Origin のない呼び出し（ブラウザの外）は通す', async () => {
    const handler = createParseHandler({ llm: () => fakeLlm([]), catalog: defaultCatalog });
    expect((await handler(post('x'.repeat(MAX_PARSE_BYTES + 1)))).status).toBe(413);
    expect((await handler(new Request(`${SITE}/api/parse`, { method: 'DELETE' }))).status).toBe(405);
    const noOrigin = new Request(`${SITE}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '今日は無理', today: TODAY, members }),
    });
    expect((await handler(noOrigin)).status).toBe(200);
  });

  it('途中で例外になっても 500 を返し、中身は出さない', async () => {
    const broken: LlmInterpreter = {
      model: 'x',
      interpret: () => {
        throw new Error('secret detail');
      },
    };
    const handler = createParseHandler({ llm: () => broken, catalog: defaultCatalog });
    const res = await handler(post({ text: '今日は無理', today: TODAY, members }));
    // interpretWithLlm が例外を null にするので、ルールで読む（落ちない）
    expect(res.status).toBe(200);
    const bad = createParseHandler({
      llm: () => {
        throw new Error('secret detail');
      },
      catalog: defaultCatalog,
    });
    const r2 = await bad(post({ text: 'x', today: TODAY, members }));
    expect(r2.status).toBe(500);
    expect(await r2.text()).not.toContain('secret');
  });
});
