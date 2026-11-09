// エンジンのテスト用の小さなマスタ（src/data には依存しない）。
// 卵・乳・小麦を含む料理、銘柄で原材料が変わる加工品（uncertain）、ラク日用、魚、旬のもの、
// pack・shelfLifeDays・substitutes を一通り含める。
import type { AllergenInfo, Catalog, Dish, Ingredient, OnboardingInput } from '../types';

type I = Omit<Ingredient, 'aliases' | 'allergens' | 'uncertain' | 'pantry' | 'freezable'> &
  Partial<Pick<Ingredient, 'aliases' | 'allergens' | 'uncertain' | 'pantry' | 'freezable'>>;

function ing(x: I): Ingredient {
  return { aliases: [], allergens: [], uncertain: false, pantry: false, freezable: false, ...x };
}

function pantry(id: string, name: string, unit: Ingredient['unit'], allergens: Ingredient['allergens'] = [], aliases: string[] = []): Ingredient {
  return ing({ id, name, aliases, kind: 'seasoning', aisle: 'seasoning', unit, shelfLifeDays: 180, pantry: true, allergens });
}

export const INGREDIENTS: Ingredient[] = [
  // 野菜・果物
  ing({ id: 'cabbage', name: 'キャベツ', kind: 'vegetable', aisle: 'produce', unit: 'g', pack: { size: 500, label: '1/2玉（約500g）' }, shelfLifeDays: 7 }),
  ing({ id: 'hakusai', name: '白菜', aliases: ['はくさい'], kind: 'vegetable', aisle: 'produce', unit: 'g', pack: { size: 600, label: '1/4株（約600g）' }, shelfLifeDays: 5, seasonMonths: [11, 12, 1, 2] }),
  ing({ id: 'daikon', name: '大根', aliases: ['だいこん'], kind: 'vegetable', aisle: 'produce', unit: 'g', pack: { size: 500, label: '1/2本（約500g）' }, shelfLifeDays: 7, seasonMonths: [11, 12, 1, 2] }),
  ing({ id: 'spinach', name: 'ほうれん草', aliases: ['ほうれんそう'], kind: 'vegetable', aisle: 'produce', unit: 'g', pack: { size: 200, label: '1束（約200g）' }, shelfLifeDays: 3, freezable: true, seasonMonths: [11, 12, 1, 2] }),
  ing({ id: 'komatsuna', name: '小松菜', aliases: ['こまつな'], kind: 'vegetable', aisle: 'produce', unit: 'g', pack: { size: 200, label: '1束（約200g）' }, shelfLifeDays: 3, freezable: true, seasonMonths: [12, 1, 2] }),
  ing({ id: 'onion', name: '玉ねぎ', aliases: ['たまねぎ', '玉葱'], kind: 'vegetable', aisle: 'produce', unit: 'piece', pack: { size: 3, label: '1袋（3個）' }, shelfLifeDays: 30 }),
  ing({ id: 'carrot', name: 'にんじん', aliases: ['人参'], kind: 'vegetable', aisle: 'produce', unit: 'piece', pack: { size: 3, label: '1袋（3本）' }, shelfLifeDays: 14 }),
  ing({ id: 'potato', name: 'じゃがいも', aliases: ['じゃが芋'], kind: 'vegetable', aisle: 'produce', unit: 'piece', pack: { size: 4, label: '1袋（4個）' }, shelfLifeDays: 30 }),
  ing({ id: 'green_onion', name: '長ねぎ', aliases: ['ねぎ', '長ネギ'], kind: 'vegetable', aisle: 'produce', unit: 'g', pack: { size: 200, label: '2本（約200g）' }, shelfLifeDays: 7, freezable: true }),
  ing({ id: 'bean_sprouts', name: 'もやし', kind: 'vegetable', aisle: 'produce', unit: 'g', pack: { size: 200, label: '1袋（200g）' }, shelfLifeDays: 2 }),
  ing({ id: 'tomato', name: 'トマト', kind: 'vegetable', aisle: 'produce', unit: 'piece', shelfLifeDays: 5 }),
  ing({ id: 'cucumber', name: 'きゅうり', aliases: ['胡瓜'], kind: 'vegetable', aisle: 'produce', unit: 'piece', pack: { size: 3, label: '1袋（3本）' }, shelfLifeDays: 4 }),
  ing({ id: 'shimeji', name: 'しめじ', aliases: ['ぶなしめじ'], kind: 'mushroom', aisle: 'produce', unit: 'g', pack: { size: 100, label: '1パック（約100g）' }, shelfLifeDays: 4, freezable: true }),
  // 肉
  ing({ id: 'chicken_thigh', name: '鶏もも肉', aliases: ['鶏もも', 'とりもも', 'もも肉'], kind: 'chicken', aisle: 'meat', unit: 'g', pack: { size: 300, label: '1パック（約300g）' }, shelfLifeDays: 2, freezable: true, allergens: ['chicken'], substitutes: ['chicken_breast'] }),
  ing({ id: 'chicken_breast', name: '鶏むね肉', aliases: ['鶏むね', 'とりむね', 'むね肉', '鶏胸肉'], kind: 'chicken', aisle: 'meat', unit: 'g', pack: { size: 300, label: '1パック（約300g）' }, shelfLifeDays: 2, freezable: true, allergens: ['chicken'], substitutes: ['chicken_thigh'] }),
  ing({ id: 'pork_koma', name: '豚こま切れ肉', aliases: ['豚こま', '豚小間', 'こま切れ'], kind: 'pork', aisle: 'meat', unit: 'g', pack: { size: 250, label: '1パック（約250g）' }, shelfLifeDays: 2, freezable: true, allergens: ['pork'], substitutes: ['pork_belly', 'pork_loin'] }),
  ing({ id: 'pork_belly', name: '豚バラ肉', aliases: ['豚バラ', '豚ばら', 'バラ肉'], kind: 'pork', aisle: 'meat', unit: 'g', pack: { size: 200, label: '1パック（約200g）' }, shelfLifeDays: 2, freezable: true, allergens: ['pork'], substitutes: ['pork_koma'] }),
  ing({ id: 'pork_loin', name: '豚ロース肉', aliases: ['豚ロース', 'しょうが焼き用'], kind: 'pork', aisle: 'meat', unit: 'g', pack: { size: 250, label: '1パック（約250g）' }, shelfLifeDays: 2, freezable: true, allergens: ['pork'], substitutes: ['pork_koma'] }),
  ing({ id: 'beef_koma', name: '牛こま切れ肉', aliases: ['牛こま', '牛小間', '牛肉'], kind: 'beef', aisle: 'meat', unit: 'g', pack: { size: 250, label: '1パック（約250g）' }, shelfLifeDays: 2, freezable: true, allergens: ['beef'] }),
  ing({ id: 'ground_mix', name: '合いびき肉', aliases: ['合いびき', '合挽き', 'あいびき肉'], kind: 'ground', aisle: 'meat', unit: 'g', pack: { size: 300, label: '1パック（約300g）' }, shelfLifeDays: 1, freezable: true, allergens: ['beef', 'pork'], substitutes: ['ground_pork'] }),
  ing({ id: 'ground_pork', name: '豚ひき肉', aliases: ['豚ひき', '豚挽き肉', 'ひき肉'], kind: 'ground', aisle: 'meat', unit: 'g', pack: { size: 200, label: '1パック（約200g）' }, shelfLifeDays: 1, freezable: true, allergens: ['pork'], substitutes: ['ground_mix'] }),
  // 魚
  ing({ id: 'salmon', name: '生鮭', aliases: ['鮭', 'さけ', 'しゃけ', '秋鮭'], kind: 'fish', aisle: 'fish', unit: 'piece', pack: { size: 2, label: '2切れ' }, shelfLifeDays: 2, freezable: true, allergens: ['salmon'], seasonMonths: [9, 10, 11] }),
  ing({ id: 'saba', name: 'さば', aliases: ['鯖'], kind: 'fish', aisle: 'fish', unit: 'piece', pack: { size: 2, label: '2切れ' }, shelfLifeDays: 2, freezable: true, allergens: ['mackerel'], seasonMonths: [10, 11, 12, 1, 2] }),
  ing({ id: 'buri', name: 'ぶり', aliases: ['鰤'], kind: 'fish', aisle: 'fish', unit: 'piece', pack: { size: 2, label: '2切れ' }, shelfLifeDays: 2, freezable: true, seasonMonths: [12, 1, 2] }),
  ing({ id: 'sanma', name: 'さんま', aliases: ['秋刀魚'], kind: 'fish', aisle: 'fish', unit: 'piece', shelfLifeDays: 1, freezable: true, seasonMonths: [9, 10] }),
  ing({ id: 'shrimp', name: 'むきえび', aliases: ['えび', '海老'], kind: 'seafood', aisle: 'fish', unit: 'g', pack: { size: 150, label: '1パック（約150g）' }, shelfLifeDays: 1, freezable: true, allergens: ['shrimp'] }),
  // 卵・乳製品
  ing({ id: 'egg', name: '卵', aliases: ['たまご', '玉子', '鶏卵'], kind: 'egg', aisle: 'dairy_egg', unit: 'piece', pack: { size: 10, label: '1パック（10個）' }, shelfLifeDays: 14, allergens: ['egg'] }),
  ing({ id: 'milk', name: '牛乳', aliases: ['ミルク', 'ぎゅうにゅう'], kind: 'dairy', aisle: 'dairy_egg', unit: 'ml', pack: { size: 1000, label: '1本（1L）' }, shelfLifeDays: 7, allergens: ['milk'] }),
  ing({ id: 'butter', name: 'バター', kind: 'dairy', aisle: 'dairy_egg', unit: 'g', shelfLifeDays: 60, pantry: true, allergens: ['milk'] }),
  // 豆腐・大豆製品
  ing({ id: 'tofu', name: '豆腐', aliases: ['とうふ', '木綿豆腐', '絹豆腐'], kind: 'tofu', aisle: 'tofu', unit: 'block', pack: { size: 1, label: '1丁' }, shelfLifeDays: 3, allergens: ['soy'] }),
  ing({ id: 'natto', name: '納豆', aliases: ['なっとう'], kind: 'tofu', aisle: 'tofu', unit: 'pack', pack: { size: 3, label: '1パック（3個入り）' }, shelfLifeDays: 7, freezable: true, allergens: ['soy', 'wheat'] }),
  ing({ id: 'aburaage', name: '油揚げ', aliases: ['油あげ', 'あぶらあげ'], kind: 'tofu', aisle: 'tofu', unit: 'sheet', pack: { size: 2, label: '1袋（2枚）' }, shelfLifeDays: 4, freezable: true, allergens: ['soy'] }),
  // 乾物・調味料（常備品）
  ing({ id: 'wakame', name: '乾燥わかめ', aliases: ['わかめ'], kind: 'seaweed', aisle: 'dry', unit: 'g', shelfLifeDays: 365, pantry: true }),
  pantry('soy_sauce', '醤油', 'tbsp', ['wheat', 'soy'], ['しょうゆ', 'しょう油']),
  pantry('miso', '味噌', 'tbsp', ['soy'], ['みそ']),
  pantry('mirin', 'みりん', 'tbsp'),
  pantry('salt', '塩', 'tsp'),
  pantry('mayonnaise', 'マヨネーズ', 'tbsp', ['egg'], ['マヨ']),
  pantry('sesame_oil', 'ごま油', 'tbsp', ['sesame']),
  pantry('honey', 'はちみつ', 'tbsp', [], ['蜂蜜']),
  pantry('ponzu', 'ポン酢', 'tbsp', ['wheat', 'soy']),
  pantry('dashi', '顆粒だし', 'tsp', [], ['ほんだし']),
  pantry('doubanjiang', '豆板醤', 'tsp', ['soy']),
  pantry('ginger', 'しょうが', 'g', [], ['生姜']),
  pantry('flour', '小麦粉', 'g', ['wheat'], ['薄力粉']),
  // ルウ・冷凍食品・惣菜（銘柄で原材料が変わる）
  ing({ id: 'curry_roux', name: 'カレールウ', aliases: ['カレールー'], kind: 'seasoning', aisle: 'seasoning', unit: 'g', pack: { size: 200, label: '1箱（約200g）' }, shelfLifeDays: 365, uncertain: true, allergens: ['wheat', 'milk', 'soy', 'beef', 'pork', 'apple'] }),
  ing({ id: 'frozen_gyoza', name: '冷凍ぎょうざ', aliases: ['冷凍餃子'], kind: 'processed', aisle: 'frozen', unit: 'piece', pack: { size: 12, label: '1袋（12個）' }, shelfLifeDays: 60, freezable: true, uncertain: true, allergens: ['wheat', 'pork', 'soy', 'sesame'] }),
  ing({ id: 'frozen_udon', name: '冷凍うどん', aliases: ['うどん'], kind: 'noodle', aisle: 'frozen', unit: 'piece', pack: { size: 5, label: '1袋（5玉）' }, shelfLifeDays: 60, freezable: true, allergens: ['wheat'] }),
  ing({ id: 'deli_karaage', name: '惣菜のからあげ', kind: 'processed', aisle: 'deli', unit: 'g', pack: { size: 300, label: '1パック（約300g）' }, shelfLifeDays: 1, uncertain: true, allergens: ['wheat', 'soy', 'chicken'] }),
];

type D = Omit<Dish, 'tags' | 'kidFriendly' | 'spicy' | 'ingredients'> & {
  tags?: string[];
  kidFriendly?: boolean;
  spicy?: boolean;
  ing: [string, number][];
};

function dish(x: D): Dish {
  const { ing: list, ...rest } = x;
  return {
    tags: [],
    kidFriendly: true,
    spicy: false,
    ...rest,
    ingredients: list.map(([ingredientId, amount]) => ({ ingredientId, amount })),
  };
}

export const DISHES: Dish[] = [
  // 主菜
  dish({ id: 'teriyaki_chicken', name: '鶏の照り焼き', role: 'main', protein: 'chicken', genre: 'wa', minutes: 20, ing: [['chicken_thigh', 100], ['soy_sauce', 1], ['mirin', 1]] }),
  dish({ id: 'karaage', name: '鶏のから揚げ', role: 'main', protein: 'chicken', genre: 'wa', minutes: 30, ing: [['chicken_thigh', 120], ['soy_sauce', 1], ['ginger', 3], ['flour', 10]] }),
  dish({ id: 'chicken_honey', name: '鶏むねのはちみつ照り焼き', role: 'main', protein: 'chicken', genre: 'wa', minutes: 20, ing: [['chicken_breast', 100], ['honey', 0.5], ['soy_sauce', 1]] }),
  dish({ id: 'mune_negishio', name: '鶏むねのねぎ塩焼き', role: 'main', protein: 'chicken', genre: 'chu', minutes: 15, ing: [['chicken_breast', 100], ['green_onion', 20], ['salt', 0.5], ['sesame_oil', 0.5]] }),
  dish({ id: 'chicken_cream', name: 'チキンのクリーム煮', role: 'main', protein: 'chicken', genre: 'yo', minutes: 30, ing: [['chicken_thigh', 100], ['milk', 100], ['onion', 0.25], ['shimeji', 25], ['butter', 5], ['flour', 5]] }),
  dish({ id: 'oyakodon', name: '親子丼', role: 'main', protein: 'chicken', genre: 'wa', minutes: 20, ing: [['chicken_thigh', 80], ['egg', 1.5], ['onion', 0.25], ['soy_sauce', 1], ['mirin', 1], ['dashi', 0.5]] }),
  dish({ id: 'chicken_nanban', name: 'チキン南蛮', role: 'main', protein: 'chicken', genre: 'wa', minutes: 30, ing: [['chicken_thigh', 100], ['egg', 0.5], ['flour', 10], ['mayonnaise', 1]] }),
  dish({ id: 'shogayaki', name: '豚の生姜焼き', role: 'main', protein: 'pork', genre: 'wa', minutes: 20, ing: [['pork_loin', 100], ['onion', 0.25], ['ginger', 3], ['soy_sauce', 1], ['mirin', 1]] }),
  dish({ id: 'pork_hakusai', name: '豚こまと白菜の味噌炒め', role: 'main', protein: 'pork', genre: 'wa', minutes: 20, ing: [['pork_koma', 80], ['hakusai', 100], ['miso', 1], ['mirin', 0.5]] }),
  dish({ id: 'millefeuille_nabe', name: '白菜と豚バラのミルフィーユ鍋', role: 'main', protein: 'pork', genre: 'wa', minutes: 25, ing: [['pork_belly', 80], ['hakusai', 150], ['dashi', 1], ['ponzu', 1]] }),
  dish({ id: 'pork_shabu_salad', name: '豚しゃぶサラダ', role: 'main', protein: 'pork', genre: 'wa', minutes: 15, ing: [['pork_belly', 80], ['cabbage', 50], ['tomato', 0.3], ['ponzu', 1]] }),
  dish({ id: 'curry', name: 'カレーライス', role: 'main', protein: 'pork', genre: 'yo', minutes: 40, ing: [['pork_koma', 70], ['potato', 1], ['carrot', 0.3], ['onion', 0.5], ['curry_roux', 20]] }),
  dish({ id: 'nikujaga', name: '肉じゃが', role: 'main', protein: 'beef', genre: 'wa', minutes: 35, ing: [['beef_koma', 70], ['potato', 1], ['onion', 0.5], ['carrot', 0.3], ['soy_sauce', 1.5], ['mirin', 1.5]] }),
  dish({ id: 'gyudon', name: '牛丼', role: 'main', protein: 'beef', genre: 'wa', minutes: 15, ing: [['beef_koma', 80], ['onion', 0.5], ['soy_sauce', 1.5], ['mirin', 1.5]] }),
  dish({ id: 'hamburg', name: 'ハンバーグ', role: 'main', protein: 'ground', genre: 'yo', minutes: 35, ing: [['ground_mix', 100], ['onion', 0.25], ['egg', 0.25], ['milk', 10]] }),
  dish({ id: 'mapo_tofu', name: '麻婆豆腐', role: 'main', protein: 'tofu', genre: 'chu', minutes: 20, spicy: true, kidFriendly: false, ing: [['tofu', 0.33], ['ground_pork', 50], ['green_onion', 20], ['doubanjiang', 0.5], ['soy_sauce', 0.5]] }),
  dish({ id: 'tofu_steak', name: '豆腐ステーキ', role: 'main', protein: 'tofu', genre: 'wa', minutes: 15, ing: [['tofu', 0.5], ['soy_sauce', 1], ['flour', 5]] }),
  dish({ id: 'tomato_egg', name: 'トマトと卵の炒め物', role: 'main', protein: 'egg', genre: 'chu', minutes: 10, ing: [['egg', 2], ['tomato', 1], ['salt', 0.3]] }),
  dish({ id: 'salmon_foil', name: '鮭のホイル焼き', role: 'main', protein: 'fish', genre: 'wa', minutes: 25, ing: [['salmon', 1], ['shimeji', 30], ['onion', 0.2], ['butter', 5], ['soy_sauce', 0.5]] }),
  dish({ id: 'saba_miso', name: 'さばの味噌煮', role: 'main', protein: 'fish', genre: 'wa', minutes: 25, ing: [['saba', 1], ['ginger', 3], ['miso', 1], ['mirin', 1]] }),
  dish({ id: 'buri_teri', name: 'ぶりの照り焼き', role: 'main', protein: 'fish', genre: 'wa', minutes: 20, ing: [['buri', 1], ['soy_sauce', 1], ['mirin', 1]] }),
  dish({ id: 'sanma_shioyaki', name: 'さんまの塩焼き', role: 'main', protein: 'fish', genre: 'wa', minutes: 20, seasonMonths: [9, 10], ing: [['sanma', 1], ['daikon', 50], ['salt', 0.5]] }),
  dish({ id: 'ebi_chili', name: 'えびチリ', role: 'main', protein: 'seafood', genre: 'chu', minutes: 20, spicy: true, kidFriendly: false, ing: [['shrimp', 70], ['green_onion', 20], ['doubanjiang', 0.5]] }),
  // 副菜
  dish({ id: 'komatsuna_ohitashi', name: '小松菜のおひたし', role: 'side', protein: 'none', genre: 'wa', minutes: 10, ing: [['komatsuna', 50], ['soy_sauce', 0.5], ['dashi', 0.3]] }),
  dish({ id: 'spinach_namul', name: 'ほうれん草のナムル', role: 'side', protein: 'none', genre: 'chu', minutes: 10, ing: [['spinach', 50], ['sesame_oil', 0.5], ['salt', 0.3]] }),
  dish({ id: 'moyashi_namul', name: 'もやしナムル', role: 'side', protein: 'none', genre: 'chu', minutes: 5, ing: [['bean_sprouts', 50], ['sesame_oil', 0.5], ['salt', 0.3]] }),
  dish({ id: 'cabbage_shiomomi', name: 'キャベツの塩もみ', role: 'side', protein: 'none', genre: 'wa', minutes: 5, ing: [['cabbage', 50], ['salt', 0.3]] }),
  dish({ id: 'potato_salad', name: 'ポテトサラダ', role: 'side', protein: 'none', genre: 'yo', minutes: 20, ing: [['potato', 0.7], ['cucumber', 0.2], ['carrot', 0.1], ['mayonnaise', 1.5]] }),
  dish({ id: 'cucumber_sunomono', name: 'きゅうりとわかめの酢の物', role: 'side', protein: 'none', genre: 'wa', minutes: 5, ing: [['cucumber', 0.3], ['wakame', 1], ['salt', 0.2]] }),
  dish({ id: 'daikon_salad', name: '大根サラダ', role: 'side', protein: 'none', genre: 'wa', minutes: 5, ing: [['daikon', 60], ['ponzu', 0.5]] }),
  dish({ id: 'tomato_salad', name: 'トマトのサラダ', role: 'side', protein: 'none', genre: 'yo', minutes: 5, ing: [['tomato', 0.5], ['salt', 0.2]] }),
  // 汁物
  dish({ id: 'miso_tofu_wakame', name: '豆腐とわかめの味噌汁', role: 'soup', protein: 'none', genre: 'wa', minutes: 10, ing: [['tofu', 0.15], ['wakame', 1], ['miso', 1], ['dashi', 0.5]] }),
  dish({ id: 'egg_soup', name: '卵スープ', role: 'soup', protein: 'none', genre: 'chu', minutes: 10, ing: [['egg', 0.5], ['green_onion', 10], ['salt', 0.3]] }),
  dish({ id: 'tonjiru', name: '豚汁', role: 'soup', protein: 'pork', genre: 'wa', minutes: 20, ing: [['pork_belly', 30], ['daikon', 40], ['carrot', 0.2], ['aburaage', 0.25], ['miso', 1]] }),
  dish({ id: 'daikon_miso', name: '大根と油揚げの味噌汁', role: 'soup', protein: 'none', genre: 'wa', minutes: 10, ing: [['daikon', 40], ['aburaage', 0.25], ['miso', 1], ['dashi', 0.5]] }),
  // ラク日用
  dish({ id: 'raku_gyoza', name: '冷凍ぎょうざ', role: 'raku', protein: 'pork', genre: 'chu', minutes: 10, ing: [['frozen_gyoza', 6]] }),
  dish({ id: 'raku_karaage', name: '惣菜のからあげ', role: 'raku', protein: 'chicken', genre: 'wa', minutes: 5, ing: [['deli_karaage', 100]] }),
  dish({ id: 'raku_udon', name: '冷凍うどん（かけ）', role: 'raku', protein: 'none', genre: 'wa', minutes: 10, ing: [['frozen_udon', 1], ['green_onion', 10], ['dashi', 1], ['soy_sauce', 1]] }),
  dish({ id: 'raku_natto', name: '納豆ごはんと冷ややっこ', role: 'raku', protein: 'tofu', genre: 'wa', minutes: 5, ing: [['natto', 1], ['tofu', 0.25], ['soy_sauce', 0.5]] }),
  dish({ id: 'raku_pork_moyashi', name: '豚こまともやしのレンジ蒸し', role: 'raku', protein: 'pork', genre: 'wa', minutes: 10, tags: ['complete'], ing: [['pork_koma', 70], ['bean_sprouts', 100], ['ponzu', 1]] }),
];

export const ALLERGENS: AllergenInfo[] = [
  { id: 'egg', name: '卵', mandatory: true },
  { id: 'milk', name: '乳', mandatory: true },
  { id: 'wheat', name: '小麦', mandatory: true },
  { id: 'shrimp', name: 'えび', mandatory: true },
  { id: 'soy', name: '大豆', mandatory: false },
  { id: 'sesame', name: 'ごま', mandatory: false },
  { id: 'pork', name: '豚肉', mandatory: false },
  { id: 'beef', name: '牛肉', mandatory: false },
  { id: 'chicken', name: '鶏肉', mandatory: false },
  { id: 'salmon', name: 'さけ', mandatory: false },
  { id: 'mackerel', name: 'さば', mandatory: false },
  { id: 'apple', name: 'りんご', mandatory: false },
];

export function makeCatalog(dishes: Dish[] = DISHES, ingredients: Ingredient[] = INGREDIENTS): Catalog {
  return {
    dishes,
    ingredients,
    allergens: ALLERGENS,
    dishById: new Map(dishes.map((d) => [d.id, d])),
    ingredientById: new Map(ingredients.map((i) => [i.id, i])),
  };
}

export const catalog: Catalog = makeCatalog();

/** 2026-11-09 は月曜。 */
export const MONDAY = '2026-11-09';

/** デモの家族：大人2、小学生1（卵アレルギー）、幼児1。買い物は日・水。 */
export function demoInput(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    members: [
      { nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
      { nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] },
      { nickname: 'たろう', ageBand: 'child', role: 'child', exclusions: [{ type: 'allergen', id: 'egg' }] },
      { nickname: 'はな', ageBand: 'preschool', role: 'child', exclusions: [] },
    ],
    shoppingWeekdays: [0, 3],
    favoriteDishIds: [
      'teriyaki_chicken', 'karaage', 'shogayaki', 'pork_hakusai', 'nikujaga', 'salmon_foil', 'curry', 'hamburg', 'gyudon', 'tofu_steak',
    ],
    customFavoriteNames: ['ばあばの煮物'],
    plan: 'free',
    ...overrides,
  };
}

