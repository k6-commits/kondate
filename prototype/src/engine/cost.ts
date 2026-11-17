// 値段の目安（食材マスタの price）から、料理・献立・買い物リストの金額の目安を出す。
// 値段は全国の平均くらいの目安（地域・季節・店で変わる）。値段のない食材と常備品（調味料など）は数えない。
import type { AppState, Catalog, Dish, Household, Ingredient, ISODate, PlannedMeal, ShoppingList } from './types';
import { addDays } from './dates';
import { everyoneOut, ingredientsOf, findDishIn, servingsFor } from './context';
import { extraCandidates, extraSlotsOf, extrasOn, slotServings } from './extras';
import { capacityOf } from './shopping';
import { budgetOf } from './settings';

/** 量（食材の unit）の値段の目安（円）。値段のない食材は null。 */
export function ingredientCost(ing: Ingredient, amount: number): number | null {
  if (!ing.price || ing.price.per <= 0) return null;
  return (amount * ing.price.yen) / ing.price.per;
}

/** 料理の大人1人分の材料費の目安（円。常備品は除く）。値段のわかる材料がひとつもなければ null。 */
export function dishCost(dish: Dish, household: Household, catalog: Catalog): number | null {
  let yen = 0;
  let known = false;
  for (const di of ingredientsOf(household, dish)) {
    const ing = catalog.ingredientById.get(di.ingredientId);
    if (!ing || ing.pantry || di.amount <= 0) continue;
    const c = ingredientCost(ing, di.amount);
    if (c === null) continue;
    yen += c;
    known = true;
  }
  return known ? yen : null;
}

/** 1日分の夕食（主菜・副菜・汁物）の材料費の目安（人数をかける）。みんな外で食べる日・作らなかった日は0。 */
export function mealCost(meal: PlannedMeal, household: Household, catalog: Catalog): number {
  if (meal.status === 'skipped' || meal.servings <= 0 || everyoneOut(household, meal)) return 0;
  let yen = 0;
  for (const id of meal.dishIds) {
    const dish = findDishIn(household, catalog, id);
    if (!dish) continue;
    yen += (dishCost(dish, household, catalog) ?? 0) * meal.servings;
  }
  return yen;
}

export interface WeekCost {
  /** 夕食の分。 */
  dinners: number;
  /** 朝ごはん・お弁当・お昼の分。 */
  extras: number;
  total: number;
}

/** その週（weekStart から7日）の食費の目安（材料費。献立のある日の分）。 */
export function weekCost(state: AppState, catalog: Catalog, weekStart: ISODate): WeekCost {
  const end = addDays(weekStart, 6);
  const household = state.household;
  let dinners = 0;
  let extras = 0;
  for (const m of state.meals) {
    if (m.date < weekStart || m.date > end) continue;
    dinners += mealCost(m, household, catalog);
    for (const x of extrasOn(household, catalog, m.date)) extras += (dishCost(x.dish, household, catalog) ?? 0) * x.servings;
  }
  return { dinners, extras, total: dinners + extras };
}

/**
 * 買い物リストの合計の目安（買う量＝パックの数×1パック。チェックした行も含める）。値段のない品は missing に数える。
 */
export function listCost(list: ShoppingList, catalog: Catalog): { yen: number; missing: number } {
  let yen = 0;
  let missing = 0;
  for (const item of list.items) {
    const ing = catalog.ingredientById.get(item.ingredientId);
    const c = ing ? ingredientCost(ing, capacityOf(item, ing)) : null;
    if (c === null) {
      missing += 1;
      continue;
    }
    yen += c;
  }
  return { yen, missing };
}

/**
 * 予算に合わせた献立のための、夕食1回・大人1人分の目安（円）。予算がなければ null。
 * 予算から朝ごはん・お弁当・お昼の見込み（出せる組み合わせの平均×人数×日数）を引き、残りを献立の日数と人数で割る
 * （ほかの食事が予算の大半になっても、夕食に3割は残す）。
 */
export function dinnerBudgetPerServing(household: Household, catalog: Catalog): number | null {
  const budget = budgetOf(household.settings);
  if (budget === null) return null;
  const days = household.settings.dinnerWeekdays.length || 5;
  const servings = servingsFor(household) || 1;
  let extrasWeek = 0;
  for (const slot of extraSlotsOf(household)) {
    const costs = extraCandidates(household, catalog, slot)
      .map((d) => dishCost(d, household, catalog))
      .filter((c): c is number => c !== null);
    if (costs.length === 0) continue;
    extrasWeek += (costs.reduce((a, b) => a + b, 0) / costs.length) * slotServings(household, slot) * days;
  }
  const forDinners = Math.max(budget * 0.3, budget - extrasWeek);
  return forDinners / (days * servings);
}

/** 画面に出す金額（10円単位に丸める）。 */
export function roundYen(yen: number): number {
  return Math.round(yen / 10) * 10;
}

/** 「約3,240円」。 */
export function yenText(yen: number): string {
  return `約${roundYen(yen).toLocaleString('ja-JP')}円`;
}
