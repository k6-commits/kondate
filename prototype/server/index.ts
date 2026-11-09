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

const port = parsePort(value('PORT'));
const dataDir = value('DATA_DIR') ?? '.data';
const lineChannelSecret = value('LINE_CHANNEL_SECRET');
const lineAccessToken = value('LINE_CHANNEL_ACCESS_TOKEN');
const anthropicApiKey = value('ANTHROPIC_API_KEY');
const cronSecret = value('CRON_SECRET');
const corsOrigin = value('CORS_ORIGIN') ?? 'http://localhost:5173';

const catalog = defaultCatalog;
const queue = createDeferQueue(logger);
const store = createFileStore({ dir: dataDir, logger });
const line = lineAccessToken ? createLineClient({ accessToken: lineAccessToken, logger }) : null;
// ANTHROPIC_API_KEY があるときだけ、書き込みの解釈に LLM を使う（なければルールベース）。
const llm = anthropicApiKey
  ? createLlmInterpreter({
      client: new Anthropic({ apiKey: anthropicApiKey }),
      catalog,
      model: value('KIMETOKU_MODEL') ?? DEFAULT_MODEL,
      logger,
    })
  : null;

const app = createApp({
  store,
  catalog,
  line,
  llm,
  now: () => new Date(),
  config: { lineChannelSecret, cronSecret, corsOrigin },
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
logger.info(`保存先：${dataDir}`);

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`待ち受けています：http://localhost:${info.port}`);
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info(`${signal} を受け取ったので、止めます`);
  server.close();
  // 返信や保存の途中のものは、少しだけ待つ。
  await Promise.race([queue.idle(), new Promise((r) => setTimeout(r, 10_000))]);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
