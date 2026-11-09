// 送り元（LINE のユーザー・グループ・ルーム）ごとの状態を、DATA_DIR に JSON ファイルで保存する。
// - ファイル名は送り元のキーの SHA-256（LINE の ID はファイル名に使わない）。
// - 書き込みは一時ファイルに書いてから rename する（途中で落ちても、古いか新しいかのどちらかが残る）。
// - 同じキーの更新は、このプロセスの中で1つずつ順に行う（同じ送り元のイベントが同時に来ても壊れない）。
//   複数のプロセスから同じ DATA_DIR を使うことは想定していない。
import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { isISODate, type AppState, type ChatMessage } from '../src/engine/index';
import { errorKind, silentLogger, type Logger } from './log';
import { sha256Hex } from './security';

export type SourceType = 'user' | 'group' | 'room';

export interface StoredRecord {
  /** 送り元のキー（groupId ?? roomId ?? userId）。 */
  key: string;
  sourceType: SourceType;
  /** push の宛先（LINE の ID）。 */
  sourceId: string;
  state: AppState;
  /** 有料版の配信（push）で、まだ送っていないもの。今日の日付のものだけを残す。 */
  pendingPush: ChatMessage[];
  /**
   * 次の返信の先頭に添える、まだ届けていない bot のメッセージ（cron の日付の同期でできた「昨日の〇〇は作りましたか？」など）。
   * 今日の日付のものだけを使う。古い保存データにはない（読み込みで [] にする）。
   */
  pendingReply: ChatMessage[];
  updatedAt: string;
}

export type Updater = (current: StoredRecord | null) => StoredRecord | null | Promise<StoredRecord | null>;

export interface Store {
  get(key: string): Promise<StoredRecord | null>;
  /**
   * 同じキーの中で1つずつ順に、読み込み → fn → 書き込みを行う。
   * fn が null を返したら書き込まない。書き込んだレコード（updatedAt つき）か null を返す。
   * 読み込んだファイルが壊れていたら、ログを出して fn には null を渡す（新しく作れるように）。
   */
  update(key: string, fn: Updater): Promise<StoredRecord | null>;
  /** 保存されているすべてのレコード（壊れたものは飛ばす）。 */
  list(): Promise<StoredRecord[]>;
}

export interface FileStoreOptions {
  dir: string;
  logger?: Logger;
  now?: () => Date;
}

const FILE_NAME = /^[0-9a-f]{64}\.json$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isChatMessage(v: unknown): v is ChatMessage {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    typeof v.text === 'string' &&
    typeof v.at === 'string' &&
    (v.from === 'bot' || v.from === 'user')
  );
}

function isAppState(s: unknown): s is AppState {
  if (!isObj(s)) return false;
  if (s.version !== 1 || typeof s.today !== 'string' || !isISODate(s.today) || typeof s.seq !== 'number') return false;
  const h = s.household;
  if (!isObj(h) || !Array.isArray(h.members) || !Array.isArray(h.favorites) || !Array.isArray(h.customDishes)) return false;
  if (!isObj(h.settings)) return false;
  return (['meals', 'history', 'inventory', 'shopping', 'chat', 'proposals'] as const).every((k) => Array.isArray(s[k]));
}

/** 読み込んだ JSON を確かめて StoredRecord にする。形が違えば null。 */
export function asStoredRecord(v: unknown): StoredRecord | null {
  if (!isObj(v)) return null;
  const { key, sourceType, sourceId, state, pendingPush, pendingReply, updatedAt } = v;
  if (typeof key !== 'string' || key.length === 0) return null;
  if (sourceType !== 'user' && sourceType !== 'group' && sourceType !== 'room') return null;
  if (typeof sourceId !== 'string' || sourceId.length === 0) return null;
  if (!isAppState(state)) return null;
  if (pendingPush !== undefined && !Array.isArray(pendingPush)) return null;
  if (pendingReply !== undefined && !Array.isArray(pendingReply)) return null;
  return {
    key,
    sourceType,
    sourceId,
    state,
    pendingPush: (pendingPush ?? []).filter(isChatMessage),
    pendingReply: (pendingReply ?? []).filter(isChatMessage),
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
  };
}

export function createFileStore(opts: FileStoreOptions): Store {
  const dir = path.resolve(opts.dir);
  const logger = opts.logger ?? silentLogger;
  const now = opts.now ?? (() => new Date());
  const locks = new Map<string, Promise<void>>();
  let dirReady: Promise<void> | null = null;

  const fileOf = (key: string) => path.join(dir, `${sha256Hex(key)}.json`);
  const shortName = (file: string) => path.basename(file).slice(0, 12);

  function ensureDir(): Promise<void> {
    dirReady ??= mkdir(dir, { recursive: true, mode: 0o700 }).then(
      () => undefined,
      (e: unknown) => {
        dirReady = null;
        throw e;
      },
    );
    return dirReady;
  }

  /** 一時ファイルに書いて fsync し、rename で置き換える。 */
  async function writeAtomic(file: string, data: string): Promise<void> {
    await ensureDir();
    const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
    let handle: FileHandle | undefined;
    try {
      handle = await open(tmp, 'wx', 0o600);
      await handle.writeFile(data, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(tmp, file);
    } catch (e) {
      if (handle) await handle.close().catch(() => undefined);
      await unlink(tmp).catch(() => undefined);
      throw e;
    }
  }

  /** 壊れたファイルは .broken に移して残す（次の書き込みで上書きしないように）。 */
  async function setAside(file: string): Promise<void> {
    await rename(file, `${file}.broken`).catch(() => undefined);
  }

  async function readRecord(file: string, opts: { key?: string; setAside: boolean }): Promise<StoredRecord | null> {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      value = undefined;
    }
    const record = asStoredRecord(value);
    if (record && (opts.key === undefined || record.key === opts.key) && fileOf(record.key) === file) return record;
    if (opts.setAside) {
      logger.warn('保存データが壊れていたので、新しく作ります', { file: shortName(file) });
      await setAside(file);
    } else {
      logger.warn('壊れた保存データを飛ばしました', { file: shortName(file) });
    }
    return null;
  }

  function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    const run = prev.then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    locks.set(key, tail);
    void tail.then(() => {
      if (locks.get(key) === tail) locks.delete(key);
    });
    return run;
  }

  return {
    async get(key) {
      return readRecord(fileOf(key), { key, setAside: false });
    },

    update(key, fn) {
      return withLock(key, async () => {
        const file = fileOf(key);
        const current = await readRecord(file, { key, setAside: true });
        const next = await fn(current);
        if (!next) return null;
        if (next.key !== key) throw new Error('保存するレコードのキーが違います');
        const saved: StoredRecord = { ...next, updatedAt: now().toISOString() };
        await writeAtomic(file, JSON.stringify(saved));
        return saved;
      });
    },

    async list() {
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw e;
      }
      const out: StoredRecord[] = [];
      for (const name of names.filter((n) => FILE_NAME.test(n)).sort()) {
        try {
          const record = await readRecord(path.join(dir, name), { setAside: false });
          if (record) out.push(record);
        } catch (e) {
          logger.warn('保存データを読めませんでした', { file: name.slice(0, 12), kind: errorKind(e) });
        }
      }
      return out;
    },
  };
}
