import type { Catalog, Dish, Ingredient, AllergenInfo } from '../engine/types';
import { ALLERGENS } from './allergens';
import { INGREDIENTS } from './ingredients';
import { DISHES } from './dishes';

export function buildCatalog(dishes: Dish[], ingredients: Ingredient[], allergens: AllergenInfo[] = ALLERGENS): Catalog {
  return {
    dishes,
    ingredients,
    allergens,
    dishById: new Map(dishes.map((d) => [d.id, d])),
    ingredientById: new Map(ingredients.map((i) => [i.id, i])),
  };
}

/** アプリで使う標準の料理マスタ・食材マスタ。 */
export const defaultCatalog: Catalog = buildCatalog(DISHES, INGREDIENTS, ALLERGENS);

export { ALLERGENS, INGREDIENTS, DISHES };
export { DEMO_ONBOARDING } from './demo';
