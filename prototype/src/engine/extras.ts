// 夕食のほかの食事（朝ごはん・お弁当・家で食べるお昼）。決まった組み合わせ（Catalog.extras）から、日ごとに順に選ぶ。
// 記録には書かない（世帯・設定・日付から、いつも同じに決まる）。夕食の献立・トークの読み取り・試用の記録には入れない。
import type { Catalog, Dish, Household, ISODate } from './types';
import { diffDays, weekStartOf, weekdayOf } from './dates';
import { eatingMembers, servingsFor } from './context';
import { checkDishSafetyFor, isAllowed } from './safety';
import { createRng, seedFrom } from './rng';
import { breakfastStyleOf, lunchCountOf, lunchStyleOf, mealsOf, spiceOf } from './settings';

export type ExtraSlot = 'breakfast' | 'bento' | 'lunch';

export const EXTRA_SLOT_LABEL: Record<ExtraSlot, string> = { breakfast: '朝ごはん', bento: 'お弁当', lunch: 'お昼' };

export interface ExtraMeal {
  date: ISODate;
  slot: ExtraSlot;
  dish: Dish;
  /** 人数（SERVING_WEIGHT の合計。お弁当・お昼は人数そのまま）。 */
  servings: number;
}

/** その世帯で作る、夕食のほかの食事の枠（食事の設定から。夕食だけなら空）。 */
export function extraSlotsOf(household: Household): ExtraSlot[] {
  const meals = mealsOf(household.settings);
  if (meals === 'dinner') return [];
  if (meals === 'dinner_bento') return ['bento'];
  return ['breakfast', lunchStyleOf(household.settings) === 'home' ? 'lunch' : 'bento'];
}

/** 枠の人数。朝ごはんは家族みんな（乳児は除く）、お弁当・お昼は設定の人数。 */
export function slotServings(household: Household, slot: ExtraSlot): number {
  return slot === 'breakfast' ? servingsFor(household) : lunchCountOf(household.settings);
}

/**
 * その枠で出してよい組み合わせ。家族みんなの除外に当たるものは出さない（お弁当・お昼をだれが食べるかはわからないので、
 * 全員の除外で見る）。「辛くないものだけ」なら辛いものも出さない。
 */
export function extraCandidates(household: Household, catalog: Catalog, slot: ExtraSlot): Dish[] {
  const members = eatingMembers(household);
  const mild = spiceOf(household.settings) === 'mild';
  return catalog.extras.filter(
    (d) => d.role === slot && !(mild && d.spicy) && isAllowed(checkDishSafetyFor(d, members, household, catalog), household),
  );
}

/** その日の朝ごはんの主食（ごはん＝'wa'、パン＝'yo'）。日替わりは、週の何日目かで交互にする。 */
function breakfastGenre(household: Household, date: ISODate): 'wa' | 'yo' {
  const style = breakfastStyleOf(household.settings);
  if (style === 'rice') return 'wa';
  if (style === 'bread') return 'yo';
  return diffDays(date, weekStartOf(date)) % 2 === 0 ? 'wa' : 'yo';
}

/**
 * その日の、夕食のほかの食事（献立を作る曜日だけ）。組み合わせは、世帯と週で決まる順に、週の何日目かで選ぶ
 * （同じ週に同じ組み合わせが続かない。候補が少ないときだけ繰り返す）。出せる組み合わせがない枠は出さない。
 */
export function extrasOn(household: Household, catalog: Catalog, date: ISODate): ExtraMeal[] {
  if (!household.settings.dinnerWeekdays.includes(weekdayOf(date))) return [];
  const out: ExtraMeal[] = [];
  const weekStart = weekStartOf(date);
  const day = diffDays(date, weekStart);
  for (const slot of extraSlotsOf(household)) {
    let pool = extraCandidates(household, catalog, slot);
    if (slot === 'breakfast') {
      const genre = breakfastGenre(household, date);
      const byStyle = pool.filter((d) => d.genre === genre);
      if (byStyle.length > 0) pool = byStyle;
    }
    if (pool.length === 0) continue;
    const rng = createRng(seedFrom(`${household.id}|${slot}|${weekStart}`));
    const order = [...pool]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((d) => ({ d, k: rng() }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.d);
    out.push({ date, slot, dish: order[day % order.length], servings: slotServings(household, slot) });
  }
  return out;
}
