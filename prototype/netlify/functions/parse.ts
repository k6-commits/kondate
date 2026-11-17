// ホーム画面に置く版（Netlify）の、書き込みの AI 読み取り（GET・POST /api/parse）。中身は server/parse-api.ts。
// - 鍵は Netlify の環境変数 KIMETOKU_ANTHROPIC_API_KEY（主催者の Anthropic のアカウントの API キー）。ないときは AI を使わない
//   （GET は llm: false、POST は 503。画面はルールで読む）。
// - ANTHROPIC_API_KEY・ANTHROPIC_BASE_URL は読まない：Netlify の AI Gateway が自動で入れる鍵で呼ぶと、Netlify のクレジット
//   （無料のプランは月300）を使い、使い切るとサイトが止まるため。いつも api.anthropic.com に、主催者の鍵で送る。
// - モデルは KIMETOKU_MODEL（なければ server/llm.ts の DEFAULT_MODEL）。
// - 同じ人（IP）からは1分に20回まで（Netlify のレート制限）。費用の上限は、Anthropic のコンソールの使用上限で決める。
import Anthropic from '@anthropic-ai/sdk';
import { defaultCatalog } from '../../src/data/index';
import { createLlmInterpreter, type LlmInterpreter } from '../../server/llm';
import { consoleLogger } from '../../server/log';
import { createParseHandler } from '../../server/parse-api';

let cached: LlmInterpreter | null | undefined;

function llm(): LlmInterpreter | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.KIMETOKU_ANTHROPIC_API_KEY?.trim();
  cached = apiKey
    ? createLlmInterpreter({
        client: new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com' }),
        catalog: defaultCatalog,
        model: process.env.KIMETOKU_MODEL,
        logger: consoleLogger,
      })
    : null;
  return cached;
}

export default createParseHandler({ llm, catalog: defaultCatalog, logger: consoleLogger });

export const config = {
  path: '/api/parse',
  method: ['GET', 'POST'],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
