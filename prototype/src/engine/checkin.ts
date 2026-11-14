// 週末の質問（北極星「今週、自分で考えた夕食は何日？」。企画書 12章）。
// - その週の最後の献立の日の翌日に、advanceDay が1回だけ聞く（「作りましたか？」のあと）。有料版も配信（push）ではなく、
//   「作りましたか？」と同じふつうのメッセージ（LINE では、無料版は次の返信の先頭に、有料版は夕方の配信に添えて届く）。
// - 答えはボタン（weekly_checkin）か文字（「2」「2日」「全部」など。conversation.ts の handleUserText）で受け、
//   state.checkins に週ごとに1つ記録する（答え直したら置き換える）。画面と LINE で同じに動く。
// - 聞く日は weeklySummary の plannedDays と同じ数え方：その週の料理のある献立の日のうち、みんな外で食べた日を除いた日。
//   献立は献立の曜日（dinnerWeekdays）にだけ作るので「献立の曜日のうち、献立のある日」と同じ。始めた週は、最初の献立の日からの日だけ。

import type { Action, ActionButton, AppState, ChatMessage, ISODate, PlannedMeal, WeeklyCheckin } from './types';
import { addDays, formatJa, isISODate, weekStartOf } from './dates';
import { everyoneOut } from './context';
import { addBotMessage } from './util';

type CheckinAction = Extract<Action, { type: 'weekly_checkin' }>;

/** 週末の質問で聞く週。 */
export interface CheckinWeek {
  weekStart: ISODate;
  /** 聞く日：料理のある献立の日のうち、みんな外で食べる日を除いた日（日付順。weeklySummary の plannedDays と同じ日）。 */
  days: ISODate[];
  /** みんな外で食べた日（料理のある献立の日のうち）。 */
  outDays: ISODate[];
  /** その週の最後の献立の日（みんな外で食べる日・料理のない日も含む）。この日の翌日に聞く。 */
  last: ISODate;
}

/** 記録した答え（前の版の状態には checkins がないので、空とみなす）。 */
export function checkinsOf(s: AppState): WeeklyCheckin[] {
  return Array.isArray(s.checkins) ? s.checkins : [];
}

/** その週の答え。 */
export function checkinFor(s: AppState, weekStart: ISODate): WeeklyCheckin | undefined {
  return checkinsOf(s).find((c) => c.weekStart === weekStart);
}

/** その週（月〜日）の献立から、聞く日を数える。献立がなければ null。 */
export function checkinWeek(s: AppState, weekStart: ISODate): CheckinWeek | null {
  const end = addDays(weekStart, 6);
  const meals: PlannedMeal[] = s.meals.filter((m) => m.date >= weekStart && m.date <= end).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (meals.length === 0) return null;
  const withDishes = meals.filter((m) => m.dishIds.length > 0);
  return {
    weekStart,
    days: withDishes.filter((m) => !everyoneOut(s.household, m)).map((m) => m.date),
    outDays: withDishes.filter((m) => everyoneOut(s.household, m)).map((m) => m.date),
    last: meals[meals.length - 1].date,
  };
}

function checkinActions(m: ChatMessage): CheckinAction[] {
  return (m.actions ?? []).flatMap((a) => (a.action.type === 'weekly_checkin' ? [a.action] : []));
}

/** 週末の質問のメッセージ（［0日］…のボタンのある bot のメッセージ）なら、その週の月曜。 */
export function checkinQuestionWeek(m: ChatMessage): ISODate | undefined {
  if (m.from !== 'bot') return undefined;
  return checkinActions(m)[0]?.weekStart;
}

/** その週の質問（いちばん新しいもの。範囲の外の答えに出し直したものも含む）。 */
function latestQuestion(s: AppState, weekStart: ISODate): ChatMessage | undefined {
  for (let i = s.chat.length - 1; i >= 0; i--) {
    if (checkinQuestionWeek(s.chat[i]) === weekStart) return s.chat[i];
  }
  return undefined;
}

/** ［0日］…［N日］。 */
export function checkinButtons(weekStart: ISODate, total: number): ActionButton[] {
  return Array.from({ length: total + 1 }, (_, i) => ({
    label: `${i}日`,
    action: { type: 'weekly_checkin' as const, weekStart, thoughtDays: i },
  }));
}

/**
 * 質問の文。範囲は聞く日の最初から最後まで（始めた週は最初の献立の日から。端のみんな外で食べた日は範囲に入れない）。
 * 範囲の中に、みんな外で食べた日があれば、その日も数えないと添える（ボタンの数が範囲の日数より少ないため）。
 * 範囲の中に献立のない日（献立の曜日でない日。月・水・金の家族の火・木など）があれば、範囲ではなく聞く日を並べる
 * （範囲で聞くと、献立のない日に自分で考えた夕食まで数えてしまい、ボタンの数とも合わないため）。
 */
function questionText(week: CheckinWeek): string {
  const first = week.days[0];
  const last = week.days[week.days.length - 1];
  const spanned = new Set([...week.days, ...week.outDays]);
  let gap = false;
  for (let d = first; d < last; d = addDays(d, 1)) if (!spanned.has(d)) gap = true;
  const range = first === last ? formatJa(first) : gap ? week.days.map(formatJa).join('・') : `${formatJa(first)}〜${formatJa(last)}`;
  const lines = [`${range}の夕食で、自分で献立を考えた日は何日ありましたか？`, 'アプリの献立どおりの日や、アプリで替えた日は数えません。'];
  const inside = gap ? [] : week.outDays.filter((d) => d > first && d < last);
  if (inside.length > 0) lines.push(`みんな外で食べた日（${inside.map(formatJa).join('・')}）も数えません。`);
  return lines.join('\n');
}

/**
 * advanceDay から（日付を進めたあと、「作りましたか？」のあと）：昨日の週の最後の献立の日を過ぎていて、その週に聞く日があり、
 * まだ答えも質問もなければ、週末の質問を1回だけ出す。どの日もみんな外で食べた週には聞かない。
 * 「最後の献立の日の翌日」ちょうどでなくても、同じ週のうちなら聞く（週の途中で献立の曜日を減らしたとき）。
 */
export function askCheckinIfDue(s: AppState, yesterday: ISODate): void {
  const week = checkinWeek(s, weekStartOf(yesterday));
  if (!week || week.days.length === 0 || week.last >= s.today) return;
  if (checkinFor(s, week.weekStart) || latestQuestion(s, week.weekStart)) return;
  addBotMessage(s, questionText(week), { actions: checkinButtons(week.weekStart, week.days.length) });
}

/**
 * その週の答えの上限（聞いた日数）。質問があれば、その質問のボタンの数（聞いたときの日数）。質問がなければ、今の献立から数える
 * （週の献立の日がまだ終わっていなければ not_over）。月曜でない日・献立も質問もない週は none。
 */
export function checkinTotal(s: AppState, weekStart: ISODate): number | 'not_over' | 'none' {
  if (!isISODate(weekStart) || weekStartOf(weekStart) !== weekStart) return 'none';
  const question = latestQuestion(s, weekStart);
  if (question) {
    const total = Math.max(...checkinActions(question).map((a) => a.thoughtDays));
    if (Number.isInteger(total) && total >= 1 && total <= 7) return total;
  }
  const week = checkinWeek(s, weekStart);
  if (!week || week.days.length === 0) return 'none';
  if (week.last >= s.today) return 'not_over';
  return week.days.length;
}

/** 記録したときの返事の書き出し（答えたすぐあとの数を、答え直しとして読むために使う）。 */
const REPLY_HEADS = ['ありがとうございます。記録しました（自分で考えた日：', '答えを直しました（自分で考えた日：', 'もう記録してあります（自分で考えた日：'];

/** 週末の質問の答えを記録したときの返事か。 */
export function isCheckinReply(m: ChatMessage): boolean {
  return m.from === 'bot' && REPLY_HEADS.some((h) => m.text.startsWith(h));
}

/** 振り返りの「自分で考えた日」の見出し（画面の振り返り・LINE の文・次の週の献立のメッセージで同じ言い方にする）。 */
export const CHECKIN_SUMMARY_LABEL = '自分で考えた日（週末の質問）';

/** 振り返りに添える1行（「自分で考えた日（週末の質問）：2日／5日」。画面の振り返りのカード・LINE の文で同じ）。 */
export function checkinLine(c: Pick<WeeklyCheckin, 'plannedDays' | 'thoughtDays'>): string {
  return `${CHECKIN_SUMMARY_LABEL}：${c.thoughtDays}日／${c.plannedDays}日`;
}

/**
 * 週末の質問の答えを記録する（ボタン・文字の答えで共通。返事を chat に足す）。
 * 使えない答え（まだ終わっていない週・これからの週・月曜でない日・献立のない週・0〜N日の外）は記録せず、短く返す。
 * 範囲の外の数には、ボタンを出し直す。同じ週にもう答えがあれば置き換えて、直したと言う。
 */
export function answerCheckin(s: AppState, weekStart: ISODate, thoughtDays: number): void {
  const total = checkinTotal(s, weekStart);
  if (total === 'not_over') {
    addBotMessage(s, 'その週の夕食がまだ終わっていないので、記録できませんでした。');
    return;
  }
  if (total === 'none') {
    addBotMessage(s, 'その週の献立が見つからないので、記録できませんでした。');
    return;
  }
  if (!Number.isInteger(thoughtDays) || thoughtDays < 0 || thoughtDays > total) {
    const range = total === 1 ? '「0日」か「1日」' : `0日から${total}日まで`;
    addBotMessage(s, `${range}で答えてください。`, { actions: checkinButtons(weekStart, total) });
    return;
  }
  const prev = checkinFor(s, weekStart);
  const counts = `自分で考えた日：${thoughtDays}日／${total}日`;
  const same = !!prev && prev.thoughtDays === thoughtDays;
  // 同じ数の答え直しは、記録を変えない（聞いた日数だけが違えば、日数だけ直す）。
  if (!same || prev.plannedDays !== total) {
    const entry: WeeklyCheckin = { weekStart, plannedDays: total, thoughtDays, answeredOn: s.today };
    s.checkins = [...checkinsOf(s).filter((c) => c.weekStart !== weekStart), entry].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  }
  const text = same
    ? `もう記録してあります（${counts}）。`
    : prev
      ? `答えを直しました（${counts}。前の答えは${prev.thoughtDays}日）。`
      : `ありがとうございます。記録しました（${counts}）。`;
  addBotMessage(s, text);
}

// ---------------------------------------------------------------------------
// 文字の答え
// ---------------------------------------------------------------------------

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
/** かなの読み。「いつか」（5日・いつか）と「なのか」（7日・なのか？）は、ほかの意味に読めるので入れない。 */
const KANA_DAYS: Record<string, number> = { いちにち: 1, ふつか: 2, みっか: 3, よっか: 4, むいか: 6 };

/**
 * 前に付ける言葉（「たぶん2日」「だいたい3日」、質問をなぞった「自分で考えた日は2日」、答え直しの「やっぱり3日」
 * 「ごめんなさい、3日」）。
 */
const LEAD =
  /^((えっと|えーと|うーん|んー|たぶん|多分|だいたい|大体|約|およそ|(自分で)?(献立を)?考えた(の|日)は|やっぱり|やっぱ|いや|いえ|訂正|ていせい|ごめんなさい|ごめん|すみません|すいません|まちがえました|間違えました|まちがえた|間違えた|正しくは|ただしくは)[、,:：]?)+/u;
/**
 * 後ろに付ける言葉（「2日です」「3日くらい」「1日だけ」「2日かな」、質問をなぞった「2日考えました」、
 * 答え直しの「3日に直して」）。「考えてない」は付けない（「2日考えてない」は、考えた日の数とは読めない）。
 */
const TAIL =
  /(です|でした|だけ|のみ|くらい|ぐらい|位|ほど|程度|かな|かも|ね|よ|ー|(自分で)?(献立を)?(考えた|考えました|考えてた|考えていた|考えてました|考えていました)|かと思います|と思います|と思う|に直して|になおして|に直します|に訂正|に変更|に変えて|でお願いします|でおねがいします|でお願い)+$/u;
/** 0日の言い方（「なし」「ない」「1日もない」「ゼロ」「考えてない」）。 */
const ZERO =
  /^(((1|一|いち)日|いちにち)も)?(ない|無い|なし|無し|なかった|無かった|ありません|ありませんでした|ないです|考えて(い)?ない|考えなかった|考えてません|考えません|考えませんでした)$|^ぜろ$/u;
/** N日（その週の全部）の言い方。 */
const ALL = /^(全部|ぜんぶ|全て|すべて|毎日|まいにち|全日|全部の日)$/u;
/** 1けたの数（「12日」のような2けたは、日付のことが多いので読まない）。「5日とも」「5日全部」も、その数。 */
const NUMBER = /^(\d|[〇零一二三四五六七八九])(日|日間|にち|回)?(とも|全部|ぜんぶ)?$/u;
const KANA = /^(いちにち|ふつか|みっか|よっか|むいか)(かん)?(とも|全部|ぜんぶ)?$/u;

/**
 * 週末の質問への文字の答えを日数にする（「2」「2日」「２日」「二日」「ふつか」→2、「0」「なし」「ない」「1日もない」→0、
 * 「全部」「毎日」→total）。数の答えでなければ null。範囲の外の数（「6日」）もそのまま返す（呼ぶ側が範囲を伝える）。
 * body は、照合用に正規化した書き込み（conversation.ts の bodyOf と plainAnswer のあと。ひらがな・空白なし・文末の記号なし）。
 */
export function parseDayCount(body: string, total: number): number | null {
  const t = body.replace(LEAD, '').replace(TAIL, '');
  if (!t) return null;
  if (ALL.test(t)) return total;
  if (ZERO.test(t)) return 0;
  const num = NUMBER.exec(t);
  if (num) return /^\d$/.test(num[1]) ? Number(num[1]) : KANJI_DIGIT[num[1]];
  const kana = KANA.exec(t);
  if (kana) return KANA_DAYS[kana[1]];
  return null;
}
