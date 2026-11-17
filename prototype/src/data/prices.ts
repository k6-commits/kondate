import type { Price } from '../engine/types';

// 標準の食材（ingredients.ts）の値段の目安。食材の id → { yen, per }（per は食材の unit での量。例：100g あたり → per: 100）。
// 全国の平均くらいの税込みの値段（地域・季節・店で変わる）。常備品（pantry）は買い物リストに載らないので、なくてよい。

export const PRICES: Record<string, Price> = {};
