// 1週間の試用の記録。試してくれた家族が、主催者に送るもの（LINE の1通に収まる大きさ。LINE の上限は5000字なので、4500字まで）。
// 名前は入れず、数を数える。読み取れなかった書き込みの文は、送る人が選んだとき（includeTexts）だけ入れ、その文の中の
// 家族の呼び名も「〇〇」に置き換える。集計ページ（src/report）は parseTrialReports で、貼り付けた文から記録を取り出す。
//
// ■ 数える範囲
// state.meals に残っている献立の日のうち、過ぎた日と、作った・作らなかったを記録した今日（advanceDay は先週より前の献立を
// 消すので、1週間の試用なら全部入る。2週間より前の週は数えない。history だけでは、記録のない日やみんな外で食べた日が
// 分からないため）。範囲は from〜to。反応は、その範囲の history の記録から数える。
//
// ■ weeklySummary（振り返り）との関係：範囲の週ごとの weeklySummary を足したもの（過ぎた日の分）と、次のように合う。
// - days.dinner − days.everyoneOut ＝ plannedDays（料理のある献立の日のうち、みんな外で食べた日を除く。数え方は同じ）。
// - days.cooked ＝ decidedWithoutThinking（作った日。今日は無理でラク日にして、そのラク日を作った日も入る）。
// - days.skipped は「作らなかった」を記録した日だけ。skippedOrImpossible は、今日は無理でラク日にした日も入れる（ラク日を
//   作っても）ので、skippedOrImpossible ＝ skipped と todayImpossible の日を合わせた日数（重なりは1日に数える）。
// - days.unconfirmed は、作った・作らなかったの記録がない過ぎた日。今日は無理でラク日にして、そのラク日を作ったかどうかの記録が
//   ない日は、ここでは unconfirmed（今の献立＝ラク日の結果が分からない）、weeklySummary では skippedOrImpossible に入る
//   （元の献立は作らなかった）。そのため unconfirmed ＝ unconfirmedDays ＋ そういう日の数。
// - どの過ぎた日も、everyoneOut・cooked・skipped・unconfirmed のどれか1つに入る（dinner はその合計。checkTrialReport で確かめる）。
//
// ■ 「そのまま」と「替えて」（作った日の内訳）
// - 替えて（cookedChanged）：家族が替えた日（changedBy が user：別のに・リクエスト・今日は無理のラク日）と、特売で替えた日（sale）。
// - そのまま（cookedAsPlanned）：アプリの献立どおりの日。アプリが組み直した日（replan：欠席の取り消しで安全のために替えた日・
//   在庫の提案で替えた日、absence：欠席で人数を直した日）も、エンジンが家族の選択として残さない日なので、そのままに数える。
// - 今日は無理で、元の料理を移された日（同じ週のあとのラク日。changedBy は user になる）は「そのまま」に数える：その日について
//   家族は何も選んでおらず、アプリが自分の献立を後ろへ移しただけ（料理もアプリの提案のまま）。今日は無理と言った日のほうは
//   「替えて」と todayImpossible に数える。
// - もともとラク日の日に「今日は無理」と言った日（献立は変わらないが changedBy が user になる）は、見分けられないので「替えて」に入る。
//
// ■ todayImpossible：「今日は無理」でラク日にした日（元の献立を作らなかった記録が history に残り、今はラク日の日）。
//   cooked・skipped・unconfirmed とは別の数え方（重なる）。もともとラク日の日の「今日は無理」は、献立が変わらないので数えない。
//
// ■ 除外の違反：範囲の始めから、この先の献立まで。過ぎた日は、その日が終わったとき（advanceDay）の家族で確かめた数
//   （PlannedMeal.safetyAtDayEnd）を使う。週の途中で家族や除外を足しても、足す前に過ぎた日は違反にしない（そのときアプリは
//   知らなかった）。足したあとの日（今日・これから）は、今の家族で確かめる。その日の夕食のあと、日付が進む前に足した
//   ときだけは、その日も今の家族で確かめる（日の終わりの確認が、足したあとになるため）。
//
// ■ トーク：state.chat に残っている分（新しい400件まで）。ボタンを押した発言（tap）は書き込みに数えず、taps に数える。
//   読み取れなかった書き込み：「すみません、うまく読み取れませんでした。」（UNREADABLE_REPLY）の返事のすぐ前の書き込み。

import type { AgeBand, AppState, Catalog, ChatMessage, ISODate, PlannedMeal } from './types';
import { formatJa, isISODate, weekStartOf } from './dates';
import { everyoneOut } from './context';
import { excludedDishCount } from './safety';
import { checkinsOf } from './checkin';
import { UNREADABLE_REPLY } from './conversation';

export const TRIAL_REPORT_VERSION = 1;
/** 記録の最後の行の始まり。集計ページは、この印のあとの JSON を読む。 */
export const TRIAL_REPORT_MARKER = 'きめとく試用データ:';
/** 読み取れなかった書き込みは、新しいものから 20件・1件 60字まで。 */
export const TRIAL_MAX_TEXTS = 20;
export const TRIAL_MAX_TEXT_LENGTH = 60;
/** 送る文の長さの上限（LINE の1通は5000字まで。余裕を見る）。超えるときは、古い書き込みの文から外す。 */
export const TRIAL_MAX_REPORT_LENGTH = 4500;
/** 週末の質問の答えは、新しい週から8週分まで入れる。 */
export const TRIAL_MAX_CHECKINS = 8;
/** 除外の違反の日は、10日分まで入れる。 */
const MAX_VIOLATION_DAYS = 10;

/** 日付の進め方。calendar：本物の日付（画面の試用モード）。demo：［翌日へ進む］。unknown：分からない（サーバーなど）。 */
export type TrialClock = 'calendar' | 'demo' | 'unknown';

export interface TrialReport {
  v: 1;
  /** 記録の範囲：最初に数えた献立の日から、最後に数えた日まで（まだ数える日がなければ、どちらも null）。 */
  from: ISODate | null;
  to: ISODate | null;
  /** 記録を作った日（state.today）。 */
  madeOn: ISODate;
  clock: TrialClock;
  plan: 'free' | 'paid';
  /** 年齢帯ごとの人数と、除外のある人の数。名前は入れない。 */
  family: Record<AgeBand, number> & { withExclusions: number };
  /**
   * 範囲の中の献立の日（料理のある日）。dinner = everyoneOut + cooked + skipped + unconfirmed。
   * cooked = cookedAsPlanned + cookedChanged（数え方はファイルの先頭）。todayImpossible は別の数え方（重なる）。
   */
  days: {
    dinner: number;
    everyoneOut: number;
    cooked: number;
    cookedAsPlanned: number;
    cookedChanged: number;
    skipped: number;
    unconfirmed: number;
    todayImpossible: number;
  };
  /** ◎○△の数（有料版はメンバーごと、無料版は世帯で1つ）。 */
  reactions: { great: number; ok: number; meh: number };
  /** 週末の質問の答え（週の順。新しい8週分まで）。plannedDays は聞いたときの日数（みんな外で食べた日を除く）。 */
  checkins: { weekStart: ISODate; plannedDays: number; thoughtDays: number }[];
  /** 除外の違反：その日に食べる家族の除外に当たる料理が、献立に入っていた件数（範囲の始めから、この先の献立まで。目標 0）。 */
  safetyViolations: number;
  /** 除外の違反があった日（10日分まで。過ぎた日は、その日が終わったときの家族で確かめる）。 */
  safetyViolationDays?: ISODate[];
  /**
   * トークの書き込みの数（ボタンを押した発言は除く）と、読み取れなかった数。taps：ボタンを押した数。
   * unreadableTexts は、送る人が選んだときだけ入れる（呼び名は「〇〇」に置き換える。新しい順）。
   */
  talk: { messages: number; unreadable: number; taps?: number; unreadableTexts?: string[] };
}

export interface TrialReportOptions {
  /** 読み取れなかった書き込みの文を入れるか（既定 false：送る人が選んだときだけ入れる）。 */
  includeTexts?: boolean;
  /** 日付の進め方（画面の試用モード）。既定 unknown。 */
  clock?: TrialClock;
}

const AGE_BANDS: AgeBand[] = ['adult', 'teen', 'child', 'preschool', 'infant'];
const AGE_LABEL: Record<AgeBand, string> = { adult: '大人', teen: '中高生', child: '小学生', preschool: '幼児', infant: '乳児' };

/** 数える日：料理のある献立の日のうち、過ぎた日と、作った・作らなかったを記録した今日。日付順。 */
function countedMeals(state: AppState): PlannedMeal[] {
  return state.meals
    .filter((m) => m.dishIds.length > 0 && (m.date < state.today || (m.date === state.today && (m.status === 'cooked' || m.status === 'skipped'))))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

const sameDishes = (a: string[], b: string[]) => a.join(',') === b.join(',');

/** 今日は無理でラク日にした日か（元の献立を作らなかった記録があり、今はラク日）。その記録を返す。 */
function impossibleRecord(state: AppState, m: PlannedMeal) {
  if (m.kind !== 'raku' || m.changedBy !== 'user') return undefined;
  return state.history.find((r) => r.date === m.date && r.status === 'skipped' && r.dishIds.length > 0 && !sameDishes(r.dishIds, m.dishIds));
}

/** 今日は無理で、元の料理を移された日か（同じ週の前の日の「今日は無理」で作らなかった主菜が、そのまま入っている）。 */
function movedHere(state: AppState, m: PlannedMeal): boolean {
  if (m.kind !== 'normal' || m.changedBy !== 'user' || m.dishIds.length === 0) return false;
  return state.meals.some((t) => {
    if (t.date >= m.date || weekStartOf(t.date) !== weekStartOf(m.date)) return false;
    const r = impossibleRecord(state, t);
    return !!r && r.dishIds[0] === m.dishIds[0];
  });
}

// ---------------------------------------------------------------------------
// 読み取れなかった書き込みの文
// ---------------------------------------------------------------------------

const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const toKatakana = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 家族の呼び名を「〇〇」に置き換える（ひらがな・カタカナ・全角半角・大文字小文字を区別しない。長い名前を先に）。
 * かな1文字の呼び名は、ほかの言葉の一部に当たりやすいので置き換えない（サーバーの maskableNickname と同じ決まり）。
 */
function maskNicknames(text: string, nicknames: string[]): string {
  const words = new Set<string>();
  for (const n of nicknames) {
    const base = n.normalize('NFKC').trim();
    if (!base || ([...base].length === 1 && /^[぀-ヿ]$/u.test(base))) continue;
    for (const w of [base, toHiragana(base), toKatakana(base)]) words.add(w);
  }
  if (words.size === 0) return text;
  const pattern = new RegExp([...words].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'giu');
  return text.replace(pattern, '〇〇');
}

/**
 * 送る文に入れる形にする：NFKC、先頭の「@きめとく」を外す、制御文字・見えない文字・対になっていないサロゲートを外す、
 * 空白をまとめる、呼び名を「〇〇」に、記録の印（きめとく試用データ:）は全角のコロンに（集計ページの読み取りを壊さないように）、
 * 60字（コードポイント）まで。
 */
function cleanText(text: string, nicknames: string[]): string {
  let t = text.normalize('NFKC').replace(/^\s*[@＠]\s*(きめとく|キメトク|kimetoku)/iu, '');
  t = t.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/[\uD800-\uDFFF]/gu, '');
  t = maskNicknames(t.replace(/\s+/gu, ' ').trim(), nicknames);
  t = t.split(TRIAL_REPORT_MARKER).join(TRIAL_REPORT_MARKER.replace(':', '：'));
  const chars = [...t];
  return chars.length > TRIAL_MAX_TEXT_LENGTH ? `${chars.slice(0, TRIAL_MAX_TEXT_LENGTH - 1).join('')}…` : t;
}

/** トークの数：書き込み（ボタンを押した発言を除く）、読み取れなかった書き込み（古い順）、ボタンを押した数。 */
function talkOf(chat: ChatMessage[]): { messages: number; taps: number; unreadable: string[] } {
  let messages = 0;
  let taps = 0;
  const unreadable: string[] = [];
  let lastUser: string | null = null;
  for (const msg of chat) {
    if (msg.from === 'user') {
      if (msg.tap) {
        taps += 1;
        lastUser = null;
      } else {
        messages += 1;
        lastUser = msg.text;
      }
      continue;
    }
    if (lastUser !== null && msg.text.startsWith(UNREADABLE_REPLY)) unreadable.push(lastUser);
    lastUser = null;
  }
  return { messages, taps, unreadable };
}

// ---------------------------------------------------------------------------
// 記録を作る
// ---------------------------------------------------------------------------

/** 試用の記録を作る（純粋関数）。数え方はファイルの先頭。 */
export function trialReport(state: AppState, catalog: Catalog, opts: TrialReportOptions = {}): TrialReport {
  const h = state.household;
  const meals = countedMeals(state);
  const from = meals[0]?.date ?? null;
  const to = meals.at(-1)?.date ?? null;

  const days = { dinner: 0, everyoneOut: 0, cooked: 0, cookedAsPlanned: 0, cookedChanged: 0, skipped: 0, unconfirmed: 0, todayImpossible: 0 };
  for (const m of meals) {
    days.dinner += 1;
    if (everyoneOut(h, m)) {
      days.everyoneOut += 1;
      continue;
    }
    if (impossibleRecord(state, m)) days.todayImpossible += 1;
    if (m.status === 'cooked') {
      days.cooked += 1;
      const changed = (m.changedBy === 'user' || m.changedBy === 'sale') && !movedHere(state, m);
      if (changed) days.cookedChanged += 1;
      else days.cookedAsPlanned += 1;
    } else if (m.status === 'skipped') days.skipped += 1;
    else days.unconfirmed += 1;
  }

  const reactions = { great: 0, ok: 0, meh: 0 };
  if (from && to) {
    for (const r of state.history) {
      if (r.date < from || r.date > to) continue;
      for (const x of r.reactions) if (x.reaction in reactions) reactions[x.reaction] += 1;
    }
  }

  // 除外の違反：範囲の始めから、この先の献立まで（まだ数える日がなければ、今ある献立すべて）。みんな外で食べる日は除く。
  // 過ぎた日は、その日が終わったときの確認（safetyAtDayEnd）で数える（あとから家族や除外を足しても、足す前の日を
  // 違反にしない）。確認がない（前の版の状態）か、そのあと献立が変わった日と、今日・これからの日は、今の家族で確かめる。
  let safetyViolations = 0;
  const violationDays: ISODate[] = [];
  for (const m of state.meals) {
    if (from && m.date < from) continue;
    const atEnd = m.date < state.today && m.safetyAtDayEnd && sameDishes(m.safetyAtDayEnd.dishIds, m.dishIds) ? m.safetyAtDayEnd.excluded : null;
    const count = atEnd ?? excludedDishCount(h, catalog, m);
    if (count <= 0) continue;
    safetyViolations += count;
    if (!violationDays.includes(m.date)) violationDays.push(m.date);
  }

  const family = { adult: 0, teen: 0, child: 0, preschool: 0, infant: 0, withExclusions: 0 };
  for (const member of h.members) {
    if (member.ageBand in family) family[member.ageBand] += 1;
    if (member.exclusions.length > 0) family.withExclusions += 1;
  }

  const talk = talkOf(state.chat);
  const nicknames = h.members.map((m) => m.nickname);
  const texts: string[] = [];
  for (const raw of [...talk.unreadable].reverse()) {
    const t = cleanText(raw, nicknames);
    if (t && !texts.includes(t)) texts.push(t);
    if (texts.length >= TRIAL_MAX_TEXTS) break;
  }

  const checkins = [...checkinsOf(state)]
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
    .slice(-TRIAL_MAX_CHECKINS)
    .map((c) => ({ weekStart: c.weekStart, plannedDays: c.plannedDays, thoughtDays: c.thoughtDays }));

  return {
    v: TRIAL_REPORT_VERSION,
    from,
    to,
    madeOn: state.today,
    clock: opts.clock ?? 'unknown',
    plan: h.settings.plan,
    family,
    days,
    reactions,
    checkins,
    safetyViolations,
    ...(violationDays.length > 0 ? { safetyViolationDays: violationDays.sort().slice(0, MAX_VIOLATION_DAYS) } : {}),
    talk: {
      messages: talk.messages,
      unreadable: talk.unreadable.length,
      taps: talk.taps,
      ...(opts.includeTexts === true ? { unreadableTexts: texts } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// 送る文
// ---------------------------------------------------------------------------

const CLOCK_LABEL: Record<TrialClock, string> = { calendar: 'カレンダーどおり', demo: '［翌日へ進む］で進めた', unknown: '進め方は不明' };

function reportLines(report: TrialReport): string[] {
  const d = report.days;
  const familyText = AGE_BANDS.filter((b) => report.family[b] > 0)
    .map((b) => `${AGE_LABEL[b]}${report.family[b]}`)
    .join('・');
  const violations = report.safetyViolationDays?.length ? `（${report.safetyViolationDays.map(formatJa).join('・')}）` : '';
  const taps = report.talk.taps !== undefined ? `／ボタン：${report.talk.taps}回` : '';
  const lines = [
    `きめとく 試用の記録（${formatJa(report.madeOn)}に作成）`,
    report.from && report.to
      ? `期間：${formatJa(report.from)}〜${formatJa(report.to)}（${CLOCK_LABEL[report.clock]}）`
      : `期間：まだ過ぎた献立の日がありません（${CLOCK_LABEL[report.clock]}）`,
    `家族：${familyText || 'なし'}（除外のある人 ${report.family.withExclusions}人）／${report.plan === 'paid' ? '有料版' : '無料版'}`,
    `献立の日：${d.dinner}日（みんな外で食べた日 ${d.everyoneOut}日）`,
    `作った：${d.cooked}日（そのまま ${d.cookedAsPlanned}日・替えて ${d.cookedChanged}日）／作らなかった：${d.skipped}日／記録なし：${d.unconfirmed}日`,
    `「今日は無理」でラク日にした日：${d.todayImpossible}日`,
    ...(report.checkins.length > 0
      ? report.checkins.map((c) => `週末の質問（${formatJa(c.weekStart)}〜の週）：自分で考えた日 ${c.thoughtDays}日／${c.plannedDays}日`)
      : ['週末の質問：まだ答えていません']),
    `家族の反応：◎${report.reactions.great} ○${report.reactions.ok} △${report.reactions.meh}`,
    `除外の違反：${report.safetyViolations}件${violations}`,
    `トークの書き込み：${report.talk.messages}件（読み取れなかった ${report.talk.unreadable}件）${taps}`,
  ];
  if (report.talk.unreadableTexts && report.talk.unreadableTexts.length > 0) {
    lines.push('読み取れなかった書き込み（新しい順）：', ...report.talk.unreadableTexts.map((t) => `・「${t}」`));
  }
  lines.push(`${TRIAL_REPORT_MARKER}${JSON.stringify(report)}`);
  return lines;
}

/**
 * 送る文にする：読める行と、最後に集計ページが読む1行（印 + JSON）。TRIAL_MAX_REPORT_LENGTH（4500字）を超えるときは、
 * 読み取れなかった書き込みの文を古いものから外し、それでも超えれば古い週の答えを外す（読める行と JSON は同じものを出す）。
 */
export function formatTrialReport(report: TrialReport): string {
  let r = report;
  let text = reportLines(r).join('\n');
  while (text.length > TRIAL_MAX_REPORT_LENGTH) {
    const texts = r.talk.unreadableTexts;
    if (texts && texts.length > 0) r = { ...r, talk: { ...r.talk, unreadableTexts: texts.slice(0, -1) } };
    else if (r.checkins.length > 1) r = { ...r, checkins: r.checkins.slice(1) };
    else break;
    text = reportLines(r).join('\n');
  }
  return text;
}

// ---------------------------------------------------------------------------
// 集計ページで読む
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isDate = (v: unknown): v is ISODate => typeof v === 'string' && isISODate(v);

/** 記録の形を確かめる。使えなければ、わけを返す。 */
export function checkTrialReport(d: unknown): string | null {
  if (!isRecord(d)) return '記録の形が違います';
  if (d.v !== TRIAL_REPORT_VERSION) return `記録の版が ${TRIAL_REPORT_VERSION} ではありません（${String(d.v)}）`;
  if (!isDate(d.madeOn)) return '日付が正しくありません';
  if (!((d.from === null && d.to === null) || (isDate(d.from) && isDate(d.to) && d.from <= d.to))) return '期間が正しくありません';
  if (d.clock !== 'calendar' && d.clock !== 'demo' && d.clock !== 'unknown') return '日付の進め方が正しくありません';
  if (d.plan !== 'free' && d.plan !== 'paid') return 'プランが正しくありません';
  const f = d.family;
  if (!isRecord(f) || ![...AGE_BANDS, 'withExclusions'].every((k) => isCount(f[k]))) return '家族の人数が正しくありません';
  const days = d.days;
  const dayKeys = ['dinner', 'everyoneOut', 'cooked', 'cookedAsPlanned', 'cookedChanged', 'skipped', 'unconfirmed', 'todayImpossible'];
  if (!isRecord(days) || !dayKeys.every((k) => isCount(days[k]))) return '日数が正しくありません';
  const n = days as Record<string, number>;
  if (n.cooked !== n.cookedAsPlanned + n.cookedChanged || n.dinner !== n.everyoneOut + n.cooked + n.skipped + n.unconfirmed) {
    return '日数の合計が合いません';
  }
  if (n.todayImpossible > n.dinner - n.everyoneOut) return '日数の合計が合いません';
  const r = d.reactions;
  if (!isRecord(r) || !['great', 'ok', 'meh'].every((k) => isCount(r[k]))) return '反応の数が正しくありません';
  const okCheckin = (c: unknown) =>
    isRecord(c) && isDate(c.weekStart) && isCount(c.plannedDays) && isCount(c.thoughtDays) && c.thoughtDays <= c.plannedDays;
  if (!Array.isArray(d.checkins) || !d.checkins.every(okCheckin)) return '週末の質問の答えが正しくありません';
  if (!isCount(d.safetyViolations)) return '除外の違反の数が正しくありません';
  if (d.safetyViolationDays !== undefined && !(Array.isArray(d.safetyViolationDays) && d.safetyViolationDays.every(isDate))) {
    return '除外の違反の日が正しくありません';
  }
  const t = d.talk;
  if (!isRecord(t) || !isCount(t.messages) || !isCount(t.unreadable) || t.unreadable > t.messages) return 'トークの数が正しくありません';
  if (t.taps !== undefined && !isCount(t.taps)) return 'トークの数が正しくありません';
  if (t.unreadableTexts !== undefined && !(Array.isArray(t.unreadableTexts) && t.unreadableTexts.every((x) => typeof x === 'string'))) {
    return '読み取れなかった書き込みが正しくありません';
  }
  return null;
}

/** 文の先頭の JSON のオブジェクト（{ から、対になる } まで）。文字列の中の { } は数えない。なければ null。 */
function leadingObject(text: string): string | null {
  const start = text.search(/\S/);
  if (start < 0 || text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** 印のあとの文から、記録の JSON を読む。読めなければ undefined。 */
function readJson(part: string): unknown {
  // そのまま → メッセージアプリが途中で入れた改行（CR だけ・行区切り文字も）と幅のない文字を外す → LINE のトーク履歴の
  // 書き出し（" が "" になる）を戻す、の順に試す。記録の文字列には改行も幅のない文字も入れないので（cleanText）、外してよい。
  const joined = part.replace(/\r\n|[\r\n\u2028\u2029\u200b-\u200d\u2060\ufeff]/g, '');
  for (const candidate of [part, joined, joined.replace(/""/g, '"')]) {
    const json = leadingObject(candidate);
    if (json === null) continue;
    try {
      return JSON.parse(json) as unknown;
    } catch {
      // 次の読み方を試す
    }
  }
  return undefined;
}

/**
 * 貼り付けた文から、記録をすべて取り出す（何家族分を続けて貼ってもよい）。
 * 印（きめとく試用データ:）のあとの JSON を読む。メッセージアプリが途中で改行していても、つないで読む。
 * 読めないもの・形の違うもの・版の違うものは、何件目かとわけを errors に入れる。
 */
export function parseTrialReports(text: string): { reports: TrialReport[]; errors: string[] } {
  const reports: TrialReport[] = [];
  const errors: string[] = [];
  const parts = text.split(TRIAL_REPORT_MARKER).slice(1);
  parts.forEach((part, i) => {
    const parsed = readJson(part);
    if (parsed === undefined) {
      errors.push(`${i + 1}件目：記録の数字の行を読めませんでした（途中で切れているかもしれません）`);
      return;
    }
    const problem = checkTrialReport(parsed);
    if (problem) errors.push(`${i + 1}件目：${problem}`);
    else reports.push(parsed as TrialReport);
  });
  return { reports, errors };
}
