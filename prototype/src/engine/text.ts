// 文面を作る道具（会話・カード・LINE で共通）。
import type { AppState, Catalog, Dish, ISODate, PlannedMeal } from './types';
import { WEEKDAY_JA, addDays, formatJa, weekdayOf } from './dates';
import { eatingMembers, findDishIn, memberName } from './context';

export function dishesOf(state: AppState, catalog: Catalog, ids: string[]): Dish[] {
  return ids.map((id) => findDishIn(state.household, catalog, id)).filter((d): d is Dish => !!d);
}

export function dishName(state: AppState, catalog: Catalog, id: string): string {
  return findDishIn(state.household, catalog, id)?.name ?? id;
}

/** 料理名を「／」でつなぐ。 */
export function namesLine(state: AppState, catalog: Catalog, ids: string[]): string {
  return dishesOf(state, catalog, ids)
    .map((d) => d.name)
    .join('／');
}

/** 主役の料理名（主菜、またはラク日の料理）。 */
export function mealTitle(state: AppState, catalog: Catalog, meal: PlannedMeal): string {
  return meal.dishIds.length > 0 ? dishName(state, catalog, meal.dishIds[0]) : '外食や買ってきたもの';
}

/** 1食の目安時間：いちばん長い料理＋並行で作る分。 */
export function mealMinutes(state: AppState, catalog: Catalog, meal: PlannedMeal): number {
  const ds = dishesOf(state, catalog, meal.dishIds);
  if (ds.length === 0) return 0;
  return Math.max(...ds.map((d) => d.minutes)) + 5 * (ds.length - 1);
}

export function statusLabel(meal: PlannedMeal): string {
  switch (meal.status) {
    case 'cooked':
      return '（作った）';
    case 'skipped':
      return '（作らなかった）';
    case 'unconfirmed':
      return '（確認待ち）';
    default:
      return '';
  }
}

/** 例：'鶏の照り焼き／キャベツの塩もみ（25分）'、ラク日は 'ラク日：冷凍ぎょうざ／もやしナムル（10分）'。 */
export function mealLine(state: AppState, catalog: Catalog, meal: PlannedMeal): string {
  const names = meal.dishIds.length > 0 ? namesLine(state, catalog, meal.dishIds) : '外食や買ってきたもの';
  const minutes = mealMinutes(state, catalog, meal);
  return `${meal.kind === 'raku' ? 'ラク日：' : ''}${names}${minutes > 0 ? `（${minutes}分）` : ''}`;
}

/**
 * 量の表示（画面の servingsLabel と同じ考え方）。食べる人数（乳児と欠席の人を除く）を主にし、
 * 小学生・幼児がいて大人換算と違うときだけ換算を添える。例：'4人分（大人換算3.2）'、大人だけなら '2人分'。
 * inParens：返事の文のかっこの中に置くときの形（'3人分、大人換算2.2'）。
 */
export function servingsText(state: AppState, meal: PlannedMeal, inParens = false): string {
  const eaters = eatingMembers(state.household, meal.absentMemberIds).length;
  const n = Number.isInteger(meal.servings) ? String(meal.servings) : meal.servings.toFixed(1);
  if (Math.abs(meal.servings - eaters) < 0.05) return `${eaters}人分`;
  return inParens ? `${eaters}人分、大人換算${n}` : `${eaters}人分（大人換算${n}）`;
}

/** 新しい料理（はじめて作る料理）の作り方の手がかり。アプリは作り方の本文を持たない。献立が planned の日だけ。 */
export function newDishHint(state: AppState, catalog: Catalog, meal: PlannedMeal): string {
  if (meal.status !== 'planned') return '';
  const names = meal.dishIds.filter((id) => meal.newDishIds.includes(id)).map((id) => dishName(state, catalog, id));
  if (names.length === 0) return '';
  return `${names.map((n) => `「${n}」`).join('')}ははじめての料理です。作り方は、料理名でレシピを探してください。`;
}

export function absentText(state: AppState, meal: PlannedMeal): string {
  if (meal.absentMemberIds.length === 0) return '';
  return `${meal.absentMemberIds.map((id) => memberName(state.household, id)).join('・')}はいません`;
}

/** 週の献立の行（曜日つき）。 */
export function weekLines(state: AppState, catalog: Catalog, weekStart: ISODate): string[] {
  const end = addDays(weekStart, 6);
  const meals = state.meals.filter((m) => m.date >= weekStart && m.date <= end);
  const lines: string[] = [];
  for (const m of meals) {
    lines.push(`${WEEKDAY_JA[weekdayOf(m.date)]} ${mealLine(state, catalog, m)}${statusLabel(m)}`);
    const freeze = m.notes.find((n) => n.includes('買ったら冷凍') || n.startsWith('冷凍の'));
    if (m.warnings.length > 0) lines.push(`　注意：${m.warnings[0]}`);
    if (freeze) lines.push(`　※${freeze}`);
  }
  return lines;
}

export function dateLabel(today: ISODate, date: ISODate): string {
  if (date === today) return '今日';
  if (date === addDays(today, 1)) return '明日';
  return formatJa(date);
}
