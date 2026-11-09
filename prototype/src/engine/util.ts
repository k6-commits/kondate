// エンジン内部の小さな道具（公開APIではない）。
import type { ActionButton, AppState, Card, ChatMessage } from './types';

/** 入力の state を変更しないために、最初に必ず複製する。 */
export function clone<T>(v: T): T {
  return structuredClone(v);
}

/** id を採番する（state.seq を進める。複製した state にだけ使う）。 */
export function nextId(s: AppState, prefix: string): string {
  s.seq += 1;
  return `${prefix}_${s.seq}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 決定的な時刻。純粋関数にするため現在時刻は使わず、日付と採番から作る。 */
export function stamp(s: AppState, hour = 8): string {
  const minutes = Math.min(23 * 60 + 59, hour * 60 + (s.seq % 360));
  return `${s.today}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00+09:00`;
}

const MAX_CHAT = 400;

function trimChat(s: AppState): void {
  if (s.chat.length > MAX_CHAT) s.chat = s.chat.slice(s.chat.length - MAX_CHAT);
}

export interface BotMessageOptions {
  card?: Card;
  actions?: ActionButton[];
  push?: boolean;
  hour?: number;
}

export function addBotMessage(s: AppState, text: string, opts: BotMessageOptions = {}): ChatMessage {
  const id = nextId(s, 'msg');
  const msg: ChatMessage = { id, from: 'bot', text, at: stamp(s, opts.hour ?? (opts.push ? 17 : 8)) };
  if (opts.card) msg.card = opts.card;
  if (opts.actions && opts.actions.length > 0) msg.actions = opts.actions;
  if (opts.push) msg.push = true;
  s.chat.push(msg);
  trimChat(s);
  return msg;
}

export function addUserMessage(s: AppState, text: string): ChatMessage {
  const id = nextId(s, 'msg');
  const msg: ChatMessage = { id, from: 'user', text, at: stamp(s) };
  s.chat.push(msg);
  trimChat(s);
  return msg;
}

/** 照合用の正規化：NFKC、カタカナ→ひらがな、空白の除去、小文字化。 */
export function normalizeJa(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** 安定した順序のための比較（日本語の名前）。 */
export function compareJa(a: string, b: string): number {
  return a.localeCompare(b, 'ja');
}

/** 処理の前にあった chat の id（あとで新しい bot のメッセージだけを取り出すため）。 */
export function chatIds(s: AppState): Set<string> {
  return new Set(s.chat.map((m) => m.id));
}

export function newBotMessages(s: AppState, before: Set<string>): ChatMessage[] {
  return s.chat.filter((m) => m.from === 'bot' && !before.has(m.id));
}
