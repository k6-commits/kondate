// LINE Messaging API：署名の検証、「@きめとく」の判定、返信メッセージの組み立て、reply / push。
import { randomUUID } from 'node:crypto';
import {
  SERVING_WEIGHT,
  formatJa,
  renderCardText,
  type Action,
  type AppState,
  type Catalog,
  type ChatMessage,
  type ISODate,
} from '../src/engine/index';
import { errorKind, silentLogger, type Logger } from './log';
import { hmacSha256Base64, safeEqual } from './security';

export const LINE_API_BASE = 'https://api.line.me/v2/bot';

/** LINE の上限（Messaging API の仕様）。 */
export const LINE_LIMITS = {
  messagesPerRequest: 5,
  textLength: 5000,
  quickReplyItems: 13,
  labelLength: 20,
  postbackData: 300,
  displayText: 300,
} as const;

export interface LinePostbackAction {
  type: 'postback';
  label: string;
  data: string;
  displayText: string;
}

export interface LineQuickReplyItem {
  type: 'action';
  action: LinePostbackAction;
}

export interface LineTextMessage {
  type: 'text';
  text: string;
  quickReply?: { items: LineQuickReplyItem[] };
}

export type LineMessage = LineTextMessage;

// ---------------------------------------------------------------------------
// 署名
// ---------------------------------------------------------------------------

/** x-line-signature を確かめる。生の本文（JSON にする前のバイト列）の HMAC-SHA256（base64）と一定時間で比べる。 */
export function verifySignature(secret: string, rawBody: Uint8Array, signature: string | null | undefined): boolean {
  if (!secret || !signature) return false;
  return safeEqual(signature.trim(), hmacSha256Base64(secret, rawBody));
}

// ---------------------------------------------------------------------------
// 「@きめとく」とメンション
// ---------------------------------------------------------------------------

export interface Mentionee {
  index: number;
  length: number;
  isSelf?: boolean;
  type?: string;
}

/** 先頭の「@きめとく」（全角の＠も可、前後の空白を許す）。 */
const TRIGGER = /^\s*[@＠]\s*(?:きめとく|キメトク)/;

/** bot 自身へのメンション（mentionees の isSelf）があるか。 */
export function mentionsBot(mentionees: Mentionee[] | undefined): boolean {
  return !!mentionees?.some((m) => m.isSelf === true);
}

/** グループ・ルームで処理する発言か：「@きめとく」で始まるか、bot へのメンションがある。 */
export function isAddressedToBot(text: string, mentionees: Mentionee[] | undefined): boolean {
  return TRIGGER.test(text) || mentionsBot(mentionees);
}

/**
 * 「@きめとく」とメンションの部分を取り除く。
 * - 先頭の「@きめとく」と、bot へのメンション（isSelf）は取り除く。
 * - ほかの人へのメンション（「@」と LINE の表示名）は、renameOther が返す文字に置き換える（既定は取り除く）。
 *   表示名は本名のこともあるので、そのままでは保存も LLM への送信もしない。
 */
export function stripMentions(
  text: string,
  mentionees: Mentionee[] | undefined,
  renameOther: (mentionText: string) => string = () => '',
): string {
  let out = text;
  const spans = (mentionees ?? [])
    .filter(
      (m) =>
        Number.isInteger(m.index) &&
        Number.isInteger(m.length) &&
        m.index >= 0 &&
        m.length > 0 &&
        m.index + m.length <= text.length &&
        // 位置がずれていないこと（メンションの部分は「@」で始まる）
        /^[@＠]/.test(text.slice(m.index, m.index + m.length)),
    )
    .sort((a, b) => b.index - a.index);
  let lastStart = Infinity;
  for (const m of spans) {
    if (m.index + m.length > lastStart) continue; // 重なっているものは飛ばす
    const replacement = m.isSelf === true ? '' : renameOther(text.slice(m.index, m.index + m.length));
    out = out.slice(0, m.index) + replacement + out.slice(m.index + m.length);
    lastStart = m.index;
  }
  return out.replace(TRIGGER, '').trim();
}

// ---------------------------------------------------------------------------
// 返信メッセージの組み立て
// ---------------------------------------------------------------------------

/** max 文字を超えたら切って「…」を付ける（サロゲートペアは分けない）。 */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = max - 1;
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return `${text.slice(0, cut)}…`;
}

/** ChatMessage の本文：text と、card があれば空行のあとに renderCardText。 */
export function chatMessageText(state: AppState, catalog: Catalog, message: ChatMessage): string {
  const parts = [message.text.trim()];
  if (message.card) {
    try {
      parts.push(renderCardText(state, catalog, message.card).trim());
    } catch {
      // カードを文字にできなくても、本文だけは届ける。
    }
  }
  return parts.filter((p) => p.length > 0).join('\n\n');
}

/**
 * もう使えない提案のボタンか（state.proposals にない提案）。押しても「その提案は、もう使えません。」になるだけなので、
 * クイックリプライには入れない。エンジンは同じ返信の中で同じ日に2つ目の提案を出さない（あとの案は別の日を選ぶか、
 * 重なると伝える）が、念のため、ここでも外す。
 */
function isGoneProposal(action: Action, state: AppState): boolean {
  if (action.type !== 'accept_proposal' && action.type !== 'reject_proposal') return false;
  return !state.proposals.some((p) => p.id === action.proposalId);
}

/** その日の献立を作る・替えるボタン（作った・作らなかった・別のに・案を選ぶ・今日は無理）。 */
const DAY_ACTIONS: ReadonlySet<Action['type']> = new Set<Action['type']>([
  'cooked',
  'not_cooked',
  'request_alternatives',
  'choose_alternative',
  'today_impossible',
]);

/**
 * みんな外で食べる日（家で食べる人がいない日）の、作る・替えるボタンか。夕食を作らない日なので出さない
 * （同じ返信の中で、前のメッセージのボタンの日が、あとの欠席でみんな外で食べる日になったときなど）。画面の visibleActions と同じ。
 */
function isNoDinnerDayAction(action: Action, state: AppState): boolean {
  if (!DAY_ACTIONS.has(action.type) || !('date' in action)) return false;
  const meal = state.meals.find((m) => m.date === action.date);
  if (!meal) return false;
  return !state.household.members.some((m) => SERVING_WEIGHT[m.ageBand] > 0 && !meal.absentMemberIds.includes(m.id));
}

/** ボタンの日付（見分けるために付ける）。提案（替える・そのまま）は、state.proposals の提案の日。 */
function actionDate(action: Action, state: AppState): ISODate | null {
  switch (action.type) {
    case 'cooked':
    case 'not_cooked':
    case 'request_alternatives':
    case 'choose_alternative':
    case 'today_impossible':
    case 'react':
      return action.date;
    case 'check_item':
      return action.shoppingDate;
    case 'regenerate_week':
      return action.weekStart;
    case 'accept_proposal':
    case 'reject_proposal':
      return state.proposals.find((p) => p.id === action.proposalId)?.date ?? null;
    default:
      return null;
  }
}

interface QuickButton {
  label: string;
  data: string;
  date: ISODate | null;
}

/**
 * ボタン（actions）をクイックリプライにする。最後のメッセージのボタンを先に、前のメッセージのボタンを後ろに並べる
 * （LINE ではクイックリプライは最後のメッセージにしか出ないため）。
 * - 13個まで。入れるかどうかはメッセージ単位で決める（「作った／作らなかった」「替える／そのまま」の組を割らない）。
 *   最後のメッセージだけで13個を超えるときは、その先頭から13個。
 * - ラベルは20文字まで（超えたら「…」）。displayText はラベル。
 * - postback の data は JSON.stringify(action)。300文字を超えるものは入れない。同じ data は1つに（後ろのメッセージのものを残す）。
 *   もう state.proposals にない提案（片づいた提案など）の［替える］［そのまま］と、みんな外で食べる日の
 *   ［作った］［作らなかった］［別のに］［今日は無理］も入れない。
 * - 同じラベルのボタンが2つ以上のメッセージにあるときは、それらのメッセージの日付のあるボタンに日付を付けて見分ける
 *   （例：「11/8(日) 作った」「11/8(日) 作らなかった」、提案が2つなら「11/10(火) 替える」「11/12(木) 替える」）。
 *   今日のボタンには付けない（日付のないボタンは今日のこと）。見分けられないボタンは入れない。
 */
export function quickReplyItems(messages: ChatMessage[], state: AppState): LineQuickReplyItem[] {
  // 後ろのメッセージから順に、メッセージごとのボタンを集める。
  const seenData = new Set<string>();
  const groups: QuickButton[][] = [];
  for (const message of [...messages].reverse()) {
    const group: QuickButton[] = [];
    for (const button of message.actions ?? []) {
      const label = button.label.trim();
      const data = JSON.stringify(button.action);
      if (label.length === 0 || data.length > LINE_LIMITS.postbackData || seenData.has(data)) continue;
      if (isGoneProposal(button.action, state) || isNoDinnerDayAction(button.action, state)) continue;
      seenData.add(data);
      group.push({ label, data, date: actionDate(button.action, state) });
    }
    if (group.length > 0) groups.push(group);
  }
  // 2つ以上のメッセージに出てくるラベル。
  const messagesByLabel = new Map<string, number>();
  for (const group of groups) {
    for (const label of new Set(group.map((b) => b.label))) messagesByLabel.set(label, (messagesByLabel.get(label) ?? 0) + 1);
  }

  const max = LINE_LIMITS.quickReplyItems;
  const items: LineQuickReplyItem[] = [];
  const usedLabels = new Set<string>();
  for (const group of groups) {
    const shared = group.some((b) => (messagesByLabel.get(b.label) ?? 0) > 1);
    let buttons: QuickButton[] = [];
    for (const b of group) {
      const label = shared && b.date && b.date !== state.today ? `${formatJa(b.date)} ${b.label}` : b.label;
      if (usedLabels.has(label) || buttons.some((x) => x.label === label)) continue;
      buttons.push({ ...b, label });
    }
    if (buttons.length === 0) continue;
    if (items.length + buttons.length > max) {
      if (items.length > 0) continue; // 組を割らないように、このメッセージのボタンは入れない
      buttons = buttons.slice(0, max);
    }
    for (const b of buttons) {
      usedLabels.add(b.label);
      items.push({
        type: 'action',
        action: {
          type: 'postback',
          label: truncateText(b.label, LINE_LIMITS.labelLength),
          data: b.data,
          displayText: truncateText(b.label, LINE_LIMITS.displayText),
        },
      });
    }
  }
  return items;
}

/**
 * bot のメッセージを LINE のテキストメッセージにする。
 * 1件 → 1件。5件を超えるときは、5件目以降を1つにまとめる。本文は5000文字で切る。
 * ボタンは最後のメッセージのクイックリプライにする。
 */
export function toLineMessages(state: AppState, catalog: Catalog, messages: ChatMessage[]): LineTextMessage[] {
  const texts = messages.map((m) => chatMessageText(state, catalog, m)).filter((t) => t.length > 0);
  if (texts.length === 0) return [];
  const max = LINE_LIMITS.messagesPerRequest;
  const merged = texts.length > max ? [...texts.slice(0, max - 1), texts.slice(max - 1).join('\n\n')] : texts;
  const out: LineTextMessage[] = merged.map((text) => ({ type: 'text', text: truncateText(text, LINE_LIMITS.textLength) }));
  const items = quickReplyItems(messages, state);
  if (items.length > 0) out[out.length - 1].quickReply = { items };
  return out;
}

// ---------------------------------------------------------------------------
// reply / push
// ---------------------------------------------------------------------------

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface LineClient {
  /** 応答メッセージ（通数に数えない）。成功したら true。 */
  reply(replyToken: string, messages: LineMessage[]): Promise<boolean>;
  /** プッシュメッセージ（有料版の配信）。成功したら true。 */
  push(to: string, messages: LineMessage[]): Promise<boolean>;
}

export interface LineClientOptions {
  accessToken: string;
  /** テストで差し替える。既定は globalThis.fetch。 */
  fetch?: FetchLike;
  logger?: Logger;
  baseUrl?: string;
  timeoutMs?: number;
  /** push を再送するまでの待ち時間（ミリ秒）。 */
  retryDelayMs?: number;
}

type Outcome = 'ok' | 'duplicate' | 'retryable' | 'failed';

/** LINE のエラーの message（宛先や本文は入っていない）を短くして返す。 */
async function lineErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    const message = (body as { message?: unknown } | null)?.message;
    return typeof message === 'string' ? message.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

export function createLineClient(opts: LineClientOptions): LineClient {
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  const base = opts.baseUrl ?? LINE_API_BASE;
  const logger = opts.logger ?? silentLogger;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const retryDelayMs = opts.retryDelayMs ?? 500;

  async function send(kind: 'reply' | 'push', body: unknown, headers: Record<string, string> = {}): Promise<Outcome> {
    let res: Response;
    try {
      res = await doFetch(`${base}/message/${kind}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.accessToken}`,
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      logger.warn(`LINE の ${kind} を送れませんでした`, { error: errorKind(e) });
      return 'retryable';
    }
    if (res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return 'ok';
    }
    // 同じ再送キーの push が受け付け済み（前の送信は届いている）。
    if (kind === 'push' && res.status === 409) return 'duplicate';
    logger.warn(`LINE の ${kind} に失敗しました`, { status: res.status, detail: await lineErrorMessage(res) });
    return res.status >= 500 ? 'retryable' : 'failed';
  }

  return {
    async reply(replyToken, messages) {
      if (!replyToken || messages.length === 0) return false;
      const outcome = await send('reply', { replyToken, messages: messages.slice(0, LINE_LIMITS.messagesPerRequest) });
      return outcome === 'ok';
    },

    async push(to, messages) {
      if (!to || messages.length === 0) return false;
      // 再送しても重複して届かないように、同じ X-Line-Retry-Key で1回だけ再送する。
      const retryKey = randomUUID();
      const body = { to, messages: messages.slice(0, LINE_LIMITS.messagesPerRequest) };
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0 && retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
        const outcome = await send('push', body, { 'X-Line-Retry-Key': retryKey });
        if (outcome === 'ok' || outcome === 'duplicate') return true;
        if (outcome === 'failed') return false;
      }
      return false;
    },
  };
}
