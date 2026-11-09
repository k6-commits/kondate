// bot のメッセージの組み立て（DESIGN.md 3-9）。短く、やさしく、責めない。絵文字は使わない。
import type { ActionButton, AppState, Catalog, ChatMessage, ISODate, PlannedMeal, Reaction } from './types';
import { addDays, formatJa, weekStartOf } from './dates';
import { eatingMembers, everyoneOut, mealOn } from './context';
import { addBotMessage } from './util';
import { NO_DINNER_TEXT, backHomeHint, dateLabel, mealMinutes, mealTitle, namesLine } from './text';
import { summaryText, summaryWeekFor, weeklySummary } from './summary';

export const BTN_WEEK: ActionButton = { label: '今週の献立', action: { type: 'open_week' } };
export const BTN_TODAY: ActionButton = { label: '今日のごはん', action: { type: 'open_today' } };
export const BTN_SHOPPING: ActionButton = { label: '買い物リスト', action: { type: 'open_shopping' } };

export const HELP_EXAMPLES = ['今日のごはん', '鶏むねが安い', '水曜は夫が飲み会', '卵切れた', '今日は無理'];

/** 1日の献立のボタン。みんな外で食べる日は、作る・替えるボタンを出さない（夕食なし）。 */
export function mealActions(s: AppState, date: ISODate): ActionButton[] {
  const meal = mealOn(s, date);
  if (meal && everyoneOut(s.household, meal)) return [];
  if (!meal || meal.dishIds.length === 0) return [{ label: '別のに', action: { type: 'request_alternatives', date } }];
  // 作らない日にした日：もう替えられないので［別のに］は出さない（作ったなら［作った］で直せる）。
  if (meal.status === 'skipped') return date <= s.today ? [{ label: '作った', action: { type: 'cooked', date } }] : [];
  const btns: ActionButton[] = [];
  if (date <= s.today) btns.push({ label: '作った', action: { type: 'cooked', date } });
  btns.push({ label: '別のに', action: { type: 'request_alternatives', date } });
  if (date === s.today && meal.kind !== 'raku') btns.push({ label: '今日は無理', action: { type: 'today_impossible', date } });
  return btns;
}

const MARKS: [Reaction, string][] = [
  ['great', '◎'],
  ['ok', '○'],
  ['meh', '△'],
];

/** ◎○△のボタン。無料版は世帯として、有料版はメンバーごと。 */
export function reactionActions(s: AppState, date: ISODate): ActionButton[] {
  if (s.household.settings.plan === 'paid') {
    const meal = mealOn(s, date);
    const members = s.household.members.filter((m) => m.ageBand !== 'infant' && !meal?.absentMemberIds.includes(m.id));
    return members.flatMap((m) =>
      MARKS.map(([reaction, mark]) => ({
        label: `${m.nickname} ${mark}`,
        action: { type: 'react' as const, date, memberId: m.id, reaction },
      })),
    );
  }
  return MARKS.map(([reaction, mark]) => ({
    label: mark,
    action: { type: 'react' as const, date, memberId: 'household', reaction },
  }));
}

/** 1日の献立の文面（「今日は〇〇（20分）。理由。」）。みんな外で食べる日は「夕食なし」と、戻し方。 */
export function mealText(s: AppState, catalog: Catalog, meal: PlannedMeal): string {
  const when = dateLabel(s.today, meal.date);
  if (everyoneOut(s.household, meal)) {
    const solo = eatingMembers(s.household).length <= 1;
    return [`${when}は${NO_DINNER_TEXT}です。`, ...(meal.date >= s.today ? [backHomeHint(s.today, meal.date, solo)] : [])].join('\n');
  }
  if (meal.dishIds.length === 0) return `${when}は外食や買ってきたものでどうでしょう。`;
  if (meal.status === 'skipped') {
    return meal.date < s.today ? `${when}は作らなかった日です。` : `${when}は作らない日にしています。外食や買ってきたもので済ませてください。`;
  }
  const lines: string[] = [];
  const minutes = mealMinutes(s, catalog, meal);
  if (meal.kind === 'raku') {
    lines.push(`${when}はラク日です。${namesLine(s, catalog, meal.dishIds)}（${minutes}分）で十分です。`);
  } else {
    const reason = meal.reasons[0];
    lines.push(`${when}は${namesLine(s, catalog, meal.dishIds)}（${minutes}分）。${reason ? `${reason}。` : ''}`);
  }
  if (meal.warnings.length > 0) lines.push(`注意：${meal.warnings[0]}`);
  const freeze = meal.notes.find((n) => n.startsWith('冷凍の') || n.includes('買ったら冷凍'));
  if (freeze) lines.push(freeze);
  return lines.join('\n');
}

export function addMealMessage(s: AppState, catalog: Catalog, date: ISODate, opts: { push?: boolean; intro?: string } = {}): ChatMessage {
  const meal = mealOn(s, date);
  if (!meal) return addBotMessage(s, `${formatJa(date)}の献立はありません。`, { actions: [BTN_WEEK] });
  const text = opts.intro ? `${opts.intro}\n${mealText(s, catalog, meal)}` : mealText(s, catalog, meal);
  return addBotMessage(s, text, { card: { kind: 'meal', date }, actions: mealActions(s, date), push: opts.push });
}

/** 週の献立のメッセージ。振り返りの一文を添えられる。 */
export function addWeekMessage(
  s: AppState,
  catalog: Catalog,
  weekStart: ISODate,
  opts: { push?: boolean; intro?: string; summary?: string } = {},
): ChatMessage {
  const isThis = weekStart === weekStartOf(s.today);
  const isNext = weekStart === addDays(weekStartOf(s.today), 7);
  const label = isThis ? '今週' : isNext ? '来週' : `${formatJa(weekStart)}からの週`;
  const lines = [opts.intro ?? `${label}の夕食です。何もしなければ、このまま確定します。`];
  if (opts.summary) lines.push(opts.summary);
  return addBotMessage(s, lines.join('\n'), {
    card: { kind: 'week', weekStart },
    actions: [BTN_SHOPPING, BTN_TODAY],
    push: opts.push,
  });
}

/** 振り返り（終わった週）の一文。献立がなかった週は空文字。 */
export function lastWeekSummaryText(s: AppState, catalog: Catalog): string {
  const { weekStart, label } = summaryWeekFor(s);
  return summaryText(s, catalog, weeklySummary(s, catalog, weekStart), label);
}

export function mealTitleOn(s: AppState, catalog: Catalog, date: ISODate): string {
  const meal = mealOn(s, date);
  return meal ? mealTitle(s, catalog, meal) : '';
}
