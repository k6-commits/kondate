// 状態の保存（localStorage）。使えない環境（プライベートウィンドウ、プレビューなど）でも画面は動くように、
// 読み書きはすべて try/catch で包む。
import type { AppState, TrialClock } from '../engine';
import { AGE_BAND_LABEL, isISODate } from '../engine';
import type { AiMode } from './ai';

/**
 * 日付の進め方（画面だけの設定）。calendar：本物の日付（日本時間）に合わせて進める（1週間の試用）。
 * demo：画面の［翌日へ進む］で進める（デモの家族と、前からの使い方）。試用の記録（trialReport の clock）にも書く。
 */
export type ClockMode = Exclude<TrialClock, 'unknown'>;

export const STORAGE_KEY = 'kimetoku:v1';
/** 画面だけの覚え書き（送る人、AIの読み取りの設定、メニューの開閉など）。 */
export const UI_STORAGE_KEY = 'kimetoku:v1:ui';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readStoredState(): AppState | null {
  return parseStoredState(readStoredRaw());
}

/**
 * 保存した状態の文字列そのもの（なければ・読めなければ null）。同じページを2つのタブで開いているとき、
 * ほかのタブが保存したか（このタブが最後に保存した文字列と違うか）を見分けるために使う。
 */
export function readStoredRaw(): string | null {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** 保存した文字列から状態を読む（形が違えば null）。 */
export function parseStoredState(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    return data && checkAppState(data) === null ? (data as AppState) : null;
  } catch {
    return null;
  }
}

export function writeStoredState(state: AppState): boolean {
  return writeJson(STORAGE_KEY, state);
}

export function clearStored(): void {
  try {
    const s = storage();
    s?.removeItem(STORAGE_KEY);
    s?.removeItem(UI_STORAGE_KEY);
  } catch {
    // 消せなくても、画面の状態は作り直す。
  }
}

export interface UiPrefs {
  /** 送る人（member の id）。 */
  sender?: string;
  aiMode?: AiMode;
  menuOpen?: boolean;
  /** 利用者の発言を送った人（メッセージの id → member の id）。 */
  senders?: Record<string, string>;
  /** 案内（このプロトタイプについて）を一度開いたか。開いたら、スマホ幅の「試し方を見る」を出さない。 */
  aboutSeen?: boolean;
  /** 日付の進め方（なければ demo。デモの家族と、前から使っている人は［翌日へ進む］のまま）。 */
  clock?: ClockMode;
}

export function readUiPrefs(): UiPrefs {
  const data = readJson(UI_STORAGE_KEY);
  if (!isRecord(data)) return {};
  const prefs: UiPrefs = {};
  if (typeof data.sender === 'string') prefs.sender = data.sender;
  if (data.aiMode === 'auto' || data.aiMode === 'always' || data.aiMode === 'off') prefs.aiMode = data.aiMode;
  if (typeof data.menuOpen === 'boolean') prefs.menuOpen = data.menuOpen;
  if (typeof data.aboutSeen === 'boolean') prefs.aboutSeen = data.aboutSeen;
  if (data.clock === 'calendar' || data.clock === 'demo') prefs.clock = data.clock;
  if (isRecord(data.senders)) {
    prefs.senders = Object.fromEntries(
      Object.entries(data.senders).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  }
  return prefs;
}

export function writeUiPrefs(prefs: UiPrefs): void {
  writeJson(UI_STORAGE_KEY, prefs);
}

// ---------------------------------------------------------------------------
// 読み込みの検査（最小限。画面が壊れない程度に形を確かめる）
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** AppState として使えるか。使えなければ、わけを返す。 */
export function checkAppState(d: unknown): string | null {
  if (!isRecord(d)) return 'データの形が違います';
  if (d.version !== 1) return 'version が 1 ではありません';
  if (!isStr(d.today) || !isISODate(d.today)) return '今日の日付（today）がありません';
  const h = d.household;
  if (!isRecord(h)) return '世帯（household）がありません';
  if (!Array.isArray(h.members) || h.members.length === 0) return '家族（members）がいません';
  for (const m of h.members) {
    if (!isRecord(m) || !isStr(m.id) || !isStr(m.nickname) || !isStr(m.ageBand) || !(m.ageBand in AGE_BAND_LABEL)) {
      return '家族のデータが正しくありません';
    }
    if (!Array.isArray(m.exclusions)) return '除外（exclusions）が配列ではありません';
  }
  if (!Array.isArray(h.favorites) || !Array.isArray(h.customDishes)) return '定番（favorites）が配列ではありません';
  const st = h.settings;
  if (!isRecord(st)) return '設定（settings）がありません';
  if (st.plan !== 'free' && st.plan !== 'paid') return 'プランが正しくありません';
  if (!Array.isArray(st.dinnerWeekdays) || !Array.isArray(st.shoppingWeekdays)) return '曜日の設定が配列ではありません';
  if (!isNum(st.rakuPerWeek) || !isNum(st.newPerWeek)) return 'ラク日・新しい料理の数がありません';
  if (st.sidePolicy !== 'side_or_soup' && st.sidePolicy !== 'side_and_soup' && st.sidePolicy !== 'main_only') {
    return '副菜の方針が正しくありません';
  }
  if (!isRecord(st.maxMinutes) || typeof st.allowUncertainWithExclusions !== 'boolean') return '設定の項目が足りません';
  for (const key of ['meals', 'history', 'inventory', 'shopping', 'chat', 'proposals']) {
    if (!Array.isArray(d[key])) return `${key} が配列ではありません`;
  }
  if (!isNum(d.seq)) return '番号（seq）がありません';
  for (const m of d.meals as unknown[]) {
    if (
      !isRecord(m) ||
      !isStr(m.date) ||
      !isStrArray(m.dishIds) ||
      !isNum(m.servings) ||
      !isStrArray(m.absentMemberIds) ||
      !isStrArray(m.reasons) ||
      !isStrArray(m.warnings) ||
      !isStrArray(m.notes) ||
      !isStrArray(m.newDishIds) ||
      !isStr(m.status)
    ) {
      return '献立（meals）のデータが正しくありません';
    }
  }
  for (const r of d.history as unknown[]) {
    if (!isRecord(r) || !isStr(r.date) || !isStrArray(r.dishIds) || !Array.isArray(r.reactions)) return '記録（history）のデータが正しくありません';
  }
  for (const l of d.shopping as unknown[]) {
    if (!isRecord(l) || !isStr(l.date) || !Array.isArray(l.items) || !isStrArray(l.pantry)) return '買い物リストのデータが正しくありません';
    for (const it of l.items as unknown[]) {
      if (!isRecord(it) || !isStr(it.ingredientId) || !isStr(it.name) || !isStr(it.label) || !isStr(it.aisle) || !isStrArray(it.notes)) {
        return '買い物リストの品物のデータが正しくありません';
      }
    }
  }
  for (const c of d.chat as unknown[]) {
    if (!isRecord(c) || !isStr(c.id) || (c.from !== 'user' && c.from !== 'bot') || !isStr(c.text) || !isStr(c.at)) {
      return 'トーク（chat）のデータが正しくありません';
    }
  }
  return null;
}

export type ImportResult = { ok: true; state: AppState } | { ok: false; error: string };

/** 書き出したテキスト（JSON）を読み込む。 */
export function parseImportedState(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: '読み込むテキストを貼り付けてください。' };
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'JSON として読めませんでした。書き出したテキストを、そのまま貼り付けてください。' };
  }
  const problem = checkAppState(data);
  if (problem) return { ok: false, error: `読み込めませんでした（${problem}）。` };
  return { ok: true, state: data as AppState };
}
