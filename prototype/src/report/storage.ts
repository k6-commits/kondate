// 集計ページの保存：貼り付けた文・家族につけた名前・外した記録を、このブラウザの localStorage にだけ置く。
// 使えないブラウザ（プライベートウィンドウ・サイトデータを止めている・プレビュー）では、アクセスするだけで例外になることがあるので、
// 読むのも書くのも try/catch の中で行い、使えなくてもページは動く（閉じると消えるだけ）。

export const REPORT_STORAGE_KEY = 'kimetoku-report';
/** 家族の名前の長さの上限（入力欄と、読み込むとき）。 */
export const MAX_NAME_LENGTH = 20;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedReport {
  /** 貼り付けた文。 */
  text: string;
  /** 記録の鍵 → 家族につけた名前。 */
  names: Record<string, string>;
  /** 外した記録の鍵。 */
  removed: string[];
}

export const EMPTY_SAVED: SavedReport = { text: '', names: {}, removed: [] };

/** ブラウザの localStorage（使えなければ null）。 */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = window.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 保存した内容を読む（なければ・読めなければ、空）。 */
export function loadSaved(storage: StorageLike | null): SavedReport {
  if (!storage) return EMPTY_SAVED;
  try {
    const raw = storage.getItem(REPORT_STORAGE_KEY);
    if (!raw) return EMPTY_SAVED;
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.v !== 1) return EMPTY_SAVED;
    const names: Record<string, string> = {};
    if (isRecord(data.names)) {
      for (const [k, v] of Object.entries(data.names)) {
        if (typeof v === 'string' && v.trim()) names[k] = [...v].slice(0, MAX_NAME_LENGTH).join('');
      }
    }
    return {
      text: typeof data.text === 'string' ? data.text : '',
      names,
      removed: Array.isArray(data.removed) ? data.removed.filter((k): k is string => typeof k === 'string') : [],
    };
  } catch {
    return EMPTY_SAVED;
  }
}

/** 保存する（空なら消す）。保存できなければ false。 */
export function saveSaved(storage: StorageLike | null, page: SavedReport): boolean {
  if (!storage) return false;
  try {
    const names = Object.fromEntries(Object.entries(page.names).filter(([, v]) => v.trim() !== ''));
    if (!page.text && Object.keys(names).length === 0 && page.removed.length === 0) {
      storage.removeItem(REPORT_STORAGE_KEY);
    } else {
      storage.setItem(REPORT_STORAGE_KEY, JSON.stringify({ v: 1, text: page.text, names, removed: page.removed }));
    }
    return true;
  } catch {
    return false;
  }
}
