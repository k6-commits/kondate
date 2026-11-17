import type { Dish, Ingredient } from '../engine/types';

// 世界の料理（韓国・イタリアン・エスニック（タイ・ベトナム・インドなど）・メキシカン）と、そのための食材。
// - 決まりは dishes.ts・ingredients.ts と同じ（材料と量は大人1人分。アレルゲンは派生原材料も。迷ったら多めに）。
// - genre は kr・it・eth・mx。日本の家庭の洋食・中華として定着したもの（カレーライス・ナポリタンなど）は dishes.ts の yo・chu。
// - 食材の id は、標準の食材（ingredients.ts）と重ならないこと。標準の食材で足りるものは、そちらを使う。
// - 新しい食材には price（値段の目安）を付ける（types.ts の Price）。

export const WORLD_INGREDIENTS: Ingredient[] = [];

export const WORLD_DISHES: Dish[] = [];
