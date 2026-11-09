import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultCatalog } from '../src/data/index';
import { memoryLogger } from './log';
import { sha256Hex } from './security';
import { createFileStore, type Store, type StoredRecord } from './store';
import { makeTempDir, seedRecord } from './testing';

const NOW = new Date('2026-11-09T03:00:00Z');
const KEY = 'Cgroup0123456789abcdef';

let dir: string;
let cleanup: () => Promise<void>;
let logger: ReturnType<typeof memoryLogger>;
let store: Store;

beforeEach(async () => {
  ({ dir, cleanup } = await makeTempDir('kimetoku-store-'));
  logger = memoryLogger();
  store = createFileStore({ dir, logger, now: () => NOW });
});

afterEach(async () => {
  await cleanup();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('store：書き込みと読み戻し', () => {
  it('書いたレコードを読み戻せる。ファイル名はキーの SHA-256 で、LINE の ID は使わない', async () => {
    const saved = await seedRecord(store, { key: KEY, sourceType: 'group', catalog: defaultCatalog, today: '2026-11-09' });
    expect(saved.updatedAt).toBe(NOW.toISOString());

    const back = await store.get(KEY);
    expect(back).toEqual(saved);
    expect(back?.state.household.members.map((m) => m.nickname)).toEqual(['ママ', 'パパ', 'はると', 'ゆい']);

    const names = await readdir(dir);
    expect(names).toEqual([`${sha256Hex(KEY)}.json`]);
    expect(names.some((n) => n.includes(KEY))).toBe(false);

    const json = JSON.parse(await readFile(path.join(dir, names[0]), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(
      ['key', 'pendingPush', 'pendingReply', 'sourceId', 'sourceType', 'state', 'updatedAt'].sort(),
    );
    expect((await stat(path.join(dir, names[0]))).mode & 0o777).toBe(0o600);
  });

  it('利用者の発言の原文は保存しない（text を空にする。id と時刻は残す）', async () => {
    const saved = await seedRecord(store, { key: KEY, catalog: defaultCatalog, today: '2026-11-09' });
    const userMsg = { id: 'msg_900', from: 'user' as const, text: '電話番号は090-1234-5678', at: '2026-11-09T08:00:00+09:00' };
    const next = await store.update(KEY, (cur) => (cur ? { ...cur, state: { ...cur.state, chat: [...cur.state.chat, userMsg] } } : null));
    expect(next?.state.chat.at(-1)).toEqual({ ...userMsg, text: '' });
    expect(next?.state.chat.filter((m) => m.from === 'bot')).toEqual(saved.state.chat.filter((m) => m.from === 'bot'));
    const raw = await readFile(path.join(dir, `${sha256Hex(KEY)}.json`), 'utf8');
    expect(raw).not.toContain('090-1234-5678');
    expect((await store.get(KEY))?.state.chat.at(-1)).toEqual({ ...userMsg, text: '' });
  });

  it('delete：記録と、壊れて残しておいたファイルを消す。同じキーの更新とは順に行う', async () => {
    await seedRecord(store, { key: KEY, catalog: defaultCatalog, today: '2026-11-09' });
    await seedRecord(store, { key: 'Uother', catalog: defaultCatalog, today: '2026-11-09' });
    await writeFile(path.join(dir, `${sha256Hex(KEY)}.json.broken`), '壊れた {');
    // 更新の途中で delete が来ても、更新が終わってから消す
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const updating = store.update(KEY, async (cur) => {
      await gate;
      return cur;
    });
    const deleting = store.delete(KEY);
    release();
    await updating;
    expect(await deleting).toBe(true);
    expect(await store.get(KEY)).toBeNull();
    expect((await readdir(dir)).sort()).toEqual([`${sha256Hex('Uother')}.json`]);
    expect((await store.list()).map((r) => r.key)).toEqual(['Uother']);
    expect(await store.delete(KEY)).toBe(false); // もうないものは false
    expect(await createFileStore({ dir: path.join(dir, 'not-yet') }).delete(KEY)).toBe(false);
  });

  it('ないキーは null。fn が null を返したら書き込まない', async () => {
    expect(await store.get('Unone')).toBeNull();
    expect(await store.update('Unone', () => null)).toBeNull();
    expect(await readdir(dir).catch(() => [])).toEqual([]);
  });

  it('書き込みに失敗しても、前のファイルはそのまま残り、一時ファイルも残らない', async () => {
    const saved = await seedRecord(store, { key: KEY, catalog: defaultCatalog, today: '2026-11-09' });
    const broken = { ...saved, state: { ...saved.state, seq: 10n } } as unknown as StoredRecord; // BigInt は JSON にできない
    await expect(store.update(KEY, () => broken)).rejects.toThrow();
    expect(await store.get(KEY)).toEqual(saved);
    expect((await readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    // 失敗のあとも、同じキーの更新は続けられる（ロックが外れている）。
    const next = await store.update(KEY, (cur) => (cur ? { ...cur, pendingPush: [] } : null));
    expect(next?.key).toBe(KEY);
  });

  it('書き込みは一時ファイル＋rename：書いている間に読んでも、壊れた JSON は見えない', async () => {
    await seedRecord(store, { key: KEY, catalog: defaultCatalog, today: '2026-11-09' });
    const file = path.join(dir, `${sha256Hex(KEY)}.json`);
    let writing = true;
    let reads = 0;
    const reader = (async () => {
      while (writing) {
        const text = await readFile(file, 'utf8');
        expect(() => JSON.parse(text)).not.toThrow();
        reads += 1;
        await sleep(0);
      }
    })();
    for (let i = 0; i < 30; i++) {
      await store.update(KEY, (cur) => (cur ? { ...cur, state: { ...cur.state, seq: cur.state.seq + 1 } } : null));
    }
    writing = false;
    await reader;
    expect(reads).toBeGreaterThan(0);
    expect((await readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});

describe('store：壊れたファイルからの回復', () => {
  it('JSON として読めないファイルは、ログを出して新しく作る（中身はログに出さない）', async () => {
    const file = path.join(dir, `${sha256Hex(KEY)}.json`);
    await writeFile(file, '{"key": "Cgroup0123456789abcdef", "state": 今日は無理');
    expect(await store.get(KEY)).toBeNull();

    let seen: StoredRecord | null | undefined;
    const saved = await seedRecord(
      {
        ...store,
        update: (key, fn) =>
          store.update(key, (cur) => {
            seen = cur;
            return fn(cur);
          }),
      },
      { key: KEY, catalog: defaultCatalog, today: '2026-11-09' },
    );
    expect(seen).toBeNull();
    expect(await store.get(KEY)).toEqual(saved);
    const names = await readdir(dir);
    expect(names).toContain(`${sha256Hex(KEY)}.json.broken`);
    const logs = logger.lines.join('\n');
    expect(logs).toContain('壊れていた');
    expect(logs).not.toContain('今日は無理');
    expect(logs).not.toContain(KEY);
  });

  it('形が違うファイルや、キーが合わないファイルも壊れたものとして扱う', async () => {
    const file = path.join(dir, `${sha256Hex(KEY)}.json`);
    await writeFile(file, JSON.stringify({ key: KEY, sourceType: 'group', sourceId: KEY, state: { version: 2 } }));
    expect(await store.get(KEY)).toBeNull();

    const other = await seedRecord(store, { key: 'Uother', catalog: defaultCatalog, today: '2026-11-09' });
    await writeFile(file, JSON.stringify(other)); // 別のキーのレコードが、このキーのファイルに入っている
    expect(await store.get(KEY)).toBeNull();
    expect(await store.update(KEY, (cur) => cur)).toBeNull();
  });

  it('list() は壊れたファイルと関係のないファイルを飛ばす', async () => {
    await seedRecord(store, { key: 'Ua', catalog: defaultCatalog, today: '2026-11-09' });
    await seedRecord(store, { key: 'Cb', sourceType: 'group', catalog: defaultCatalog, today: '2026-11-09' });
    await writeFile(path.join(dir, `${sha256Hex('Ubroken')}.json`), 'not json');
    await writeFile(path.join(dir, 'README.txt'), 'hello');
    await writeFile(path.join(dir, `.${sha256Hex('Ua')}.json.123.abc.tmp`), '{');
    const keys = (await store.list()).map((r) => r.key).sort();
    expect(keys).toEqual(['Cb', 'Ua']);
  });

  it('DATA_DIR がまだないときの list() は空', async () => {
    const empty = createFileStore({ dir: path.join(dir, 'not-yet') });
    expect(await empty.list()).toEqual([]);
  });
});

describe('store：同じ送り元の更新は直列になる', () => {
  it('同じキーの同時更新が1つずつ順に行われ、数え漏れがない', async () => {
    await seedRecord(store, { key: KEY, catalog: defaultCatalog, today: '2026-11-09' });
    const start = (await store.get(KEY))!.state.seq;
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        store.update(KEY, async (cur) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await sleep(Math.floor(Math.random() * 3));
          order.push(i);
          active -= 1;
          return cur ? { ...cur, state: { ...cur.state, seq: cur.state.seq + 1 } } : null;
        }),
      ),
    );
    expect(maxActive).toBe(1);
    expect(order).toEqual(Array.from({ length: 25 }, (_, i) => i)); // 来た順
    expect((await store.get(KEY))!.state.seq).toBe(start + 25);
  });

  it('fn が例外を出しても、次の更新は進む', async () => {
    await expect(
      store.update(KEY, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const saved = await seedRecord(store, { key: KEY, catalog: defaultCatalog, today: '2026-11-09' });
    expect(saved.key).toBe(KEY);
  });

  it('違うキーの更新は待たせ合わない', async () => {
    let releaseA!: () => void;
    const aWaits = new Promise<void>((r) => (releaseA = r));
    const a = store.update('Ua', async () => {
      await aWaits; // B が動かないと進まない
      return null;
    });
    const b = store.update('Ub', async () => {
      releaseA();
      return null;
    });
    await expect(Promise.all([a, b])).resolves.toEqual([null, null]);
  });
});
