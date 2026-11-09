// テスト用の道具（server/*.test.ts から使う）。ネットワークには出ない。
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEMO_ONBOARDING } from '../src/data/index';
import { createInitialState, type Catalog, type ISODate, type OnboardingInput } from '../src/engine/index';
import type { FetchLike } from './line';
import type { SourceType, Store, StoredRecord } from './store';

export async function makeTempDir(prefix = 'kimetoku-test-'): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** LINE と同じ方法で署名する（HMAC-SHA256 → base64）。 */
export function signBody(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

export interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** LINE の API の代わり。送られたリクエストを記録し、決めた応答を返す。 */
export function fakeLineFetch(respond: (call: RecordedCall, index: number) => Response | Promise<Response> = () => new Response('{}', { status: 200 })): {
  fetch: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const call: RecordedCall = { url, headers, body: JSON.parse(String(init.body)) as Record<string, unknown> };
    calls.push(call);
    return respond(call, calls.length - 1);
  };
  return { fetch, calls };
}

/** デモの家族で作った状態を、保存しておく（日付の同期や cron のテスト用）。 */
export async function seedRecord(
  store: Store,
  opts: {
    key: string;
    sourceType?: SourceType;
    catalog: Catalog;
    today: ISODate;
    plan?: 'free' | 'paid';
    input?: OnboardingInput;
  },
): Promise<StoredRecord> {
  const input: OnboardingInput = { ...(opts.input ?? DEMO_ONBOARDING), plan: opts.plan ?? 'free' };
  const record: StoredRecord = {
    key: opts.key,
    sourceType: opts.sourceType ?? 'user',
    sourceId: opts.key,
    state: createInitialState(input, opts.catalog, opts.today),
    pendingPush: [],
    pendingReply: [],
    updatedAt: '',
  };
  const saved = await store.update(opts.key, () => record);
  if (!saved) throw new Error('seed failed');
  return saved;
}
