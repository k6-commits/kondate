import type { AllergenInfo } from '../engine/types';

// 食物アレルギーの表示対象（消費者庁の特定原材料等）。
// 特定原材料（表示義務）9品目と、特定原材料に準ずるもの（表示推奨）。
// 表示が推奨にとどまる品目は、商品に書かれていないことがある（要確認の扱いは食材マスタの uncertain で行う）。
export const ALLERGENS: AllergenInfo[] = [
  // 特定原材料（表示義務）
  { id: 'shrimp', name: 'えび', mandatory: true },
  { id: 'crab', name: 'かに', mandatory: true },
  { id: 'walnut', name: 'くるみ', mandatory: true },
  { id: 'wheat', name: '小麦', mandatory: true },
  { id: 'buckwheat', name: 'そば', mandatory: true },
  { id: 'egg', name: '卵', mandatory: true },
  { id: 'milk', name: '乳', mandatory: true },
  { id: 'peanut', name: '落花生（ピーナッツ）', mandatory: true },
  {
    id: 'cashew',
    name: 'カシューナッツ',
    mandatory: true,
    note: '2026年4月に表示義務の対象に。2028年3月末までは経過措置で旧表示の商品がある',
  },

  // 特定原材料に準ずるもの（表示推奨）
  { id: 'almond', name: 'アーモンド', mandatory: false },
  { id: 'abalone', name: 'あわび', mandatory: false },
  { id: 'squid', name: 'いか', mandatory: false },
  { id: 'salmon_roe', name: 'いくら', mandatory: false },
  { id: 'orange', name: 'オレンジ', mandatory: false },
  { id: 'kiwi', name: 'キウイフルーツ', mandatory: false },
  { id: 'beef', name: '牛肉', mandatory: false },
  { id: 'sesame', name: 'ごま', mandatory: false },
  { id: 'salmon', name: 'さけ', mandatory: false },
  { id: 'mackerel', name: 'さば', mandatory: false },
  { id: 'soy', name: '大豆', mandatory: false },
  { id: 'chicken', name: '鶏肉', mandatory: false },
  { id: 'banana', name: 'バナナ', mandatory: false },
  { id: 'pork', name: '豚肉', mandatory: false },
  { id: 'macadamia', name: 'マカダミアナッツ', mandatory: false },
  { id: 'peach', name: 'もも', mandatory: false },
  { id: 'yam', name: 'やまいも', mandatory: false },
  { id: 'apple', name: 'りんご', mandatory: false },
  { id: 'gelatin', name: 'ゼラチン', mandatory: false },
];
