// テスト用の道具。
import type { AllergenId, AppState, Catalog, Dish, PlannedMeal } from '../types';
import { findDish } from '../index';

/** 入力を変更していないことを確かめるために、深く凍結する（凍結した物に書くと strict mode で例外になる）。 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

export function dishesOf(state: AppState, catalog: Catalog, meal: PlannedMeal): Dish[] {
  return meal.dishIds.map((id) => findDish(state, catalog, id)).filter((d): d is Dish => !!d);
}

export function mainOf(state: AppState, catalog: Catalog, meal: PlannedMeal): Dish | undefined {
  return findDish(state, catalog, meal.dishIds[0] ?? '');
}

/** 料理にそのアレルゲン（派生原材料を含む）が入っているか。 */
export function dishHasAllergen(dish: Dish, catalog: Catalog, allergen: AllergenId): boolean {
  return dish.ingredients.some((di) => catalog.ingredientById.get(di.ingredientId)?.allergens.includes(allergen));
}

export function dishUsesIngredient(dish: Dish, ingredientId: string): boolean {
  return dish.ingredients.some((di) => di.ingredientId === ingredientId);
}
