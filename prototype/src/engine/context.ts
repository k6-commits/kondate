// 世帯・料理・食材を引くための内部の道具。
import type {
  AllergenId,
  AppState,
  Catalog,
  Dish,
  DishIngredient,
  Household,
  HouseholdSettings,
  ISODate,
  IngredientKind,
  Member,
  PlannedMeal,
  Protein,
} from './types';
import { SERVING_WEIGHT } from './types';
import { addDays, weekdayOf } from './dates';

/** 料理を引く（マスタ → 世帯の自由入力の定番）。 */
export function findDishIn(household: Household, catalog: Catalog, id: string): Dish | undefined {
  return catalog.dishById.get(id) ?? household.customDishes.find((d) => d.id === id);
}

export function allDishes(household: Household, catalog: Catalog): Dish[] {
  return [...catalog.dishes, ...household.customDishes];
}

/** 料理の材料。定番に「うちの材料メモ」（overrides）があればそちらを使う。 */
export function ingredientsOf(household: Household, dish: Dish): DishIngredient[] {
  const fav = household.favorites.find((f) => f.dishId === dish.id);
  if (fav?.overrides && fav.overrides.length > 0) return fav.overrides;
  return dish.ingredients;
}

/** その日に食べるメンバー（欠席者と乳児を除く）。 */
export function eatingMembers(household: Household, absent: string[] = []): Member[] {
  return household.members.filter((m) => m.ageBand !== 'infant' && !absent.includes(m.id));
}

/** SERVING_WEIGHT の合計（欠席者を除く。乳児は 0）。 */
export function servingsFor(household: Household, absent: string[] = []): number {
  const sum = household.members
    .filter((m) => !absent.includes(m.id))
    .reduce((acc, m) => acc + SERVING_WEIGHT[m.ageBand], 0);
  return Math.round(sum * 10) / 10;
}

export function hasKids(members: Member[]): boolean {
  return members.some((m) => m.ageBand === 'child' || m.ageBand === 'preschool');
}

export function hasAllergenExclusion(household: Household): boolean {
  return household.members.some((m) => m.ageBand !== 'infant' && m.exclusions.some((e) => e.type === 'allergen'));
}

export function isFavorite(household: Household, dishId: string): boolean {
  return household.favorites.some((f) => f.dishId === dishId) || household.customDishes.some((d) => d.id === dishId);
}

/** この世帯にとって新しい料理か（定番帳になく、作った記録もない主菜）。 */
export function isNewDish(state: AppState, dish: Dish): boolean {
  if (dish.role !== 'main') return false;
  if (isFavorite(state.household, dish.id)) return false;
  if (state.history.some((r) => r.status === 'cooked' && r.dishIds.includes(dish.id))) return false;
  return !state.meals.some((m) => m.status === 'cooked' && m.dishIds.includes(dish.id));
}

export function proteinOfKind(kind: IngredientKind): Protein {
  switch (kind) {
    case 'chicken':
    case 'pork':
    case 'beef':
    case 'ground':
    case 'fish':
    case 'seafood':
    case 'egg':
    case 'tofu':
      return kind;
    default:
      return 'none';
  }
}

export function isMeat(p: Protein): boolean {
  return p === 'chicken' || p === 'pork' || p === 'beef' || p === 'ground';
}

/** その週の献立日（月曜始まり）。 */
export function dinnerDatesOfWeek(settings: HouseholdSettings, weekStart: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (settings.dinnerWeekdays.includes(weekdayOf(d))) out.push(d);
  }
  return out;
}

/**
 * その献立日の材料を買う日：today 以降でその日以前の、最も近い買い物日。
 * なければ today（献立より前に買い物日がない場合）。
 */
export function shoppingDateFor(settings: HouseholdSettings, today: ISODate, date: ISODate): ISODate {
  if (date < today) return date;
  for (let d = date; d >= today; d = addDays(d, -1)) {
    if (settings.shoppingWeekdays.includes(weekdayOf(d))) return d;
  }
  return today;
}

export function mealOn(state: AppState, date: ISODate): PlannedMeal | undefined {
  return state.meals.find((m) => m.date === date);
}

export function sortMeals(meals: PlannedMeal[]): PlannedMeal[] {
  return [...meals].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** アレルゲンの表示名（マスタになければ内蔵の名前）。 */
const ALLERGEN_NAME: Record<AllergenId, string> = {
  shrimp: 'えび', crab: 'かに', walnut: 'くるみ', wheat: '小麦', buckwheat: 'そば', egg: '卵', milk: '乳',
  peanut: '落花生', cashew: 'カシューナッツ', almond: 'アーモンド', abalone: 'あわび', squid: 'いか',
  salmon_roe: 'いくら', orange: 'オレンジ', kiwi: 'キウイフルーツ', beef: '牛肉', sesame: 'ごま', salmon: 'さけ',
  mackerel: 'さば', soy: '大豆', chicken: '鶏肉', banana: 'バナナ', pork: '豚肉', macadamia: 'マカダミアナッツ',
  peach: 'もも', yam: 'やまいも', apple: 'りんご', gelatin: 'ゼラチン',
};

export function allergenName(catalog: Catalog, id: AllergenId): string {
  return catalog.allergens.find((a) => a.id === id)?.name ?? ALLERGEN_NAME[id] ?? id;
}

/** メンバーの呼び名。 */
export function memberName(household: Household, id: string): string {
  return household.members.find((m) => m.id === id)?.nickname ?? id;
}
