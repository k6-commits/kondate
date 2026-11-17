import type { Catalog, Dish, Ingredient, AllergenInfo } from '../engine/types';
import { ALLERGENS } from './allergens';
import { INGREDIENTS } from './ingredients';
import { DISHES } from './dishes';
import { WORLD_DISHES, WORLD_INGREDIENTS } from './world';
import { EXTRA_DISHES, EXTRA_INGREDIENTS } from './extras';
import { PRICES } from './prices';

/**
 * 料理・食材のマスタから Catalog を作る。extras は夕食のほかの食事（朝ごはん・お弁当・家の昼）。夕食の献立と読み取りには使わない。
 */
export function buildCatalog(dishes: Dish[], ingredients: Ingredient[], allergens: AllergenInfo[] = ALLERGENS, extras: Dish[] = []): Catalog {
  return {
    dishes,
    ingredients,
    allergens,
    dishById: new Map(dishes.map((d) => [d.id, d])),
    ingredientById: new Map(ingredients.map((i) => [i.id, i])),
    extras,
    extraById: new Map(extras.map((d) => [d.id, d])),
  };
}

/** 値段の目安を付ける（食材に書いてあればそれを、なければ prices.ts の表を使う）。 */
function withPrice(i: Ingredient): Ingredient {
  if (i.price) return i;
  const p = PRICES[i.id];
  return p ? { ...i, price: p } : i;
}

/** 標準の料理（日本の家庭の定番）と、世界の料理（world.ts）。 */
export const ALL_DISHES: Dish[] = [...DISHES, ...WORLD_DISHES];
/** 標準の食材と、世界の料理・朝ごはん・お弁当のための食材。値段の目安つき。 */
export const ALL_INGREDIENTS: Ingredient[] = [...INGREDIENTS, ...WORLD_INGREDIENTS, ...EXTRA_INGREDIENTS].map(withPrice);

/** アプリで使う標準の料理マスタ・食材マスタ。 */
export const defaultCatalog: Catalog = buildCatalog(ALL_DISHES, ALL_INGREDIENTS, ALLERGENS, EXTRA_DISHES);

export { ALLERGENS, INGREDIENTS, DISHES, WORLD_DISHES, WORLD_INGREDIENTS, EXTRA_DISHES, EXTRA_INGREDIENTS, PRICES };
export { DEMO_ONBOARDING } from './demo';
