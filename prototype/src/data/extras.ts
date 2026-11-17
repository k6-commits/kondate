import type { Dish, Ingredient } from '../engine/types';

// 夕食のほかの食事：朝ごはん（role 'breakfast'）・お弁当（'bento'）・家で食べるお昼（'lunch'）の、決まった組み合わせ。
// - 1品が「1食分の組み合わせ」（例：「ごはん・味噌汁・卵焼き」）。材料と量は大人1人分。
// - 朝ごはんの genre は、ごはんの組み合わせが 'wa'、パンの組み合わせが 'yo'（主食の好みで選び分ける）。
// - アレルゲンの判定は夕食と同じ（家族の除外に当たる組み合わせは出さない）。
// - 新しい食材には price（値段の目安）を付ける。食材の id は、ほかのマスタと重ならないこと。

export const EXTRA_INGREDIENTS: Ingredient[] = [];

export const EXTRA_DISHES: Dish[] = [];
