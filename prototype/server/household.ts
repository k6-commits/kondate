// 送り元ごとの状態の作成と、日付の同期（webhook と cron で共通）。
import { randomUUID } from 'node:crypto';
import { ALLERGENS, DEMO_ONBOARDING } from '../src/data/index';
import {
  addDays,
  advanceDay,
  applyAction,
  createInitialState,
  diffDays,
  type AgeBand,
  type AppState,
  type Catalog,
  type ChatMessage,
  type ISODate,
  type OnboardingInput,
} from '../src/engine/index';
import type { SourceType, StoredRecord } from './store';

/** これより長く間が空いた状態は、日付を進めずにデモの家族で作り直す。 */
export const MAX_SYNC_DAYS = 31;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の今日（日本には夏時間がない）。 */
export function jstToday(now: Date): ISODate {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 日本時間の日時（例：'2026-11-09T12:00:00+09:00'）。 */
export function jstTimestamp(now: Date): string {
  return `${new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}

export interface SourceRef {
  key: string;
  sourceType: SourceType;
  sourceId: string;
}

// ---------------------------------------------------------------------------
// サーバーが添える文言（短く、やさしく、責めない）
// ---------------------------------------------------------------------------

export const GROUP_HINT = 'グループでは「@きめとく 今日は無理」のように、はじめに @きめとく を付けて送ってください。';
export const RESET_NOTE = 'しばらく間が空いたので、献立を新しく作り直しました。';
export const WELCOME_BACK = 'おかえりなさい。前の献立の続きから使えます。';

const AGE_SHORT: Record<AgeBand, string> = {
  adult: '大人',
  teen: '中高生',
  child: '小学生',
  preschool: '幼児',
  infant: '乳児',
};

/** 試作版なので、家族はデモの家族であることを伝える一言（DEMO_ONBOARDING から作る）。 */
export function demoFamilyNote(catalog: Catalog, input: OnboardingInput = DEMO_ONBOARDING): string {
  const people = input.members.map((m) => {
    const notes: string[] = [];
    if (m.ageBand !== 'adult') notes.push(AGE_SHORT[m.ageBand]);
    for (const ex of m.exclusions) {
      if (ex.type === 'allergen') notes.push(`${ALLERGENS.find((a) => a.id === ex.id)?.name ?? ex.id}アレルギー`);
      else if (ex.type === 'ingredient') notes.push(`${catalog.ingredientById.get(ex.id)?.name ?? ex.id}なし`);
      else notes.push(`${ex.text}なし`);
    }
    return notes.length > 0 ? `${m.nickname}（${notes.join('、')}）` : m.nickname;
  });
  return `試作版のため、家族は「デモの家族」で始めています。\n${people.join('・')}`;
}

/** サーバーが返信に添えるメッセージ（state.chat には入れない）。 */
export function serverMessage(text: string, now: Date): ChatMessage {
  return { id: `srv_${randomUUID()}`, from: 'bot', text, at: jstTimestamp(now) };
}

/**
 * 新しく作った状態のあいさつ：createInitialState が chat に入れた bot のメッセージ（あいさつ・お知らせ・週の献立）。
 * 最初のメッセージに、デモの家族の一言（とグループでの送り方）を添える。
 */
export function introMessages(
  state: AppState,
  catalog: Catalog,
  sourceType: SourceType,
  created: 'new' | 'reset',
): ChatMessage[] {
  const bots = state.chat.filter((m) => m.from === 'bot');
  if (bots.length === 0) return [];
  const [first, ...rest] = bots;
  const lines =
    created === 'reset' ? [RESET_NOTE, first.text.replace(/^はじめまして。きめとくです。\n?/, '')] : [first.text];
  lines.push(demoFamilyNote(catalog));
  if (sourceType !== 'user') lines.push(GROUP_HINT);
  return [{ ...first, text: lines.filter((l) => l.length > 0).join('\n') }, ...rest];
}

// ---------------------------------------------------------------------------
// 日付の同期
// ---------------------------------------------------------------------------

const dayOf = (m: ChatMessage): ISODate => m.at.slice(0, 10);
const onDate = (today: ISODate) => (m: ChatMessage) => dayOf(m) === today;

/**
 * まだ届ける意味のある配信か：今日の配信と、届けそびれた週の献立（その週が終わるまで）。
 * 週の献立は「最初の買い物日の前日」（土日のこともある）にできるので、cron を呼べなかった日があっても落とさない。
 */
const deliverable = (today: ISODate) => (m: ChatMessage) =>
  dayOf(m) === today || (m.card?.kind === 'week' && dayOf(m) < today && addDays(m.card.weekStart, 6) >= today);

/**
 * state.today が今日より前なら、今日まで advanceDay を繰り返す。
 * - 同期でできた bot のメッセージのうち push でないもの（「昨日の〇〇は作りましたか？」など）は、
 *   最後の1日分だけを pendingReply に入れる（次の返信の先頭に添える）。今日の日付のものだけを残す。
 * - push のもの（有料版の配信）は pendingPush にためる。今日の日付のものと、届けそびれた週の献立（その週が終わるまで）を残す。
 *   文面は送るときに今の state で作り直す（pushesToSend）。
 * MAX_SYNC_DAYS より古ければ null（呼ぶ側で作り直す）。
 */
export function syncRecord(record: StoredRecord, catalog: Catalog, today: ISODate): StoredRecord | null {
  const gap = diffDays(today, record.state.today);
  if (gap > MAX_SYNC_DAYS) return null;
  let state = record.state;
  let lastDay: ChatMessage[] | null = null;
  const pushed: ChatMessage[] = [];
  for (let i = 0; i < gap; i++) {
    const step = advanceDay(state, catalog);
    state = step.state;
    lastDay = step.replies.filter((m) => !m.push);
    pushed.push(...step.replies.filter((m) => m.push));
  }
  return {
    ...record,
    state,
    pendingPush: [...record.pendingPush, ...pushed].filter(deliverable(today)),
    pendingReply: (lastDay ?? record.pendingReply).filter(onDate(today)),
  };
}

/**
 * たまっている配信（pendingPush）を、送る直前の state で組み立て直す（有料版の夕方の配信）。
 * ためたときの文面のままだと、そのあと献立を変えたとき（今日は無理・別のに など）に、本文とカードが食い違うため。
 * - 今日の献立と明日の解凍の連絡（献立のカードの配信）は、今の献立で作り直す。エンジンが今日の配信を作る
 *   advanceDay を、前日からもう一度進めて使う（返ってきた state は使わない）。作った・作らなかった日や、
 *   解凍が要らなくなった日の分は入らない。
 * - 週の献立は、今日できたものはそのまま（カードは送るときの state から作る）。前の日にできて届けそびれたものは、
 *   今日の言い方（今週・来週）で作り直す（「今週の献立」のボタンの返事のうち、同じ週のもの）。
 * たまっているものがなければ、何も送らない（その日の配信は済んでいる）。
 */
export function pushesToSend(state: AppState, catalog: Catalog, queued: ChatMessage[]): ChatMessage[] {
  if (queued.length === 0) return [];
  const today = state.today;
  let shown: ChatMessage[] | null = null;
  const weeks: ChatMessage[] = [];
  for (const m of queued) {
    if (m.card?.kind !== 'week') continue;
    if (dayOf(m) >= today) {
      weeks.push(m);
      continue;
    }
    const weekStart = m.card.weekStart;
    shown ??= applyAction(state, catalog, { type: 'open_week' }).replies;
    const fresh = shown.find((r) => r.card?.kind === 'week' && r.card.weekStart === weekStart);
    if (fresh) weeks.push({ ...fresh, push: true });
  }
  const meals = advanceDay({ ...state, today: addDays(today, -1) }, catalog).replies.filter(
    (m) => m.push === true && m.card?.kind === 'meal',
  );
  return [...weeks, ...meals];
}

/** デモの家族で新しい状態を作る（作り直すときは、前のプランを引き継ぐ）。 */
export function freshRecord(source: SourceRef, catalog: Catalog, today: ISODate, plan?: 'free' | 'paid'): StoredRecord {
  const input: OnboardingInput = { ...DEMO_ONBOARDING, plan: plan ?? DEMO_ONBOARDING.plan };
  return {
    key: source.key,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    state: createInitialState(input, catalog, today),
    pendingPush: [],
    pendingReply: [],
    updatedAt: '',
  };
}

export interface Prepared {
  /** 日付を今日まで進めたレコード（pendingReply は carry に移して空にしてある）。 */
  record: StoredRecord;
  /** 新しく作った・作り直したときのあいさつ。 */
  intro: ChatMessage[];
  /** 今回の返信の先頭に添える、同期でできた push でないメッセージ。 */
  carry: ChatMessage[];
  created: 'new' | 'reset' | null;
}

/** イベントを処理する前の準備：状態がなければ作り、あれば日付を今日まで進める。 */
export function prepareRecord(current: StoredRecord | null, source: SourceRef, catalog: Catalog, today: ISODate): Prepared {
  if (!current) {
    const record = freshRecord(source, catalog, today);
    return { record, intro: introMessages(record.state, catalog, source.sourceType, 'new'), carry: [], created: 'new' };
  }
  const synced = syncRecord(current, catalog, today);
  if (!synced) {
    const record = freshRecord(source, catalog, today, current.state.household.settings.plan);
    return { record, intro: introMessages(record.state, catalog, source.sourceType, 'reset'), carry: [], created: 'reset' };
  }
  return { record: { ...synced, pendingReply: [] }, intro: [], carry: synced.pendingReply, created: null };
}
