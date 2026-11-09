import type { Dish, DishRole, Genre, Protein } from '../engine/types';

// 標準料理マスタ（日本の家庭の定番）。
// - 材料と量は大人1人分。単位は食材マスタの unit（調味料は大さじ・小さじ、だし汁は ml）。
// - アレルゲンの判定に使うので、主菜には調味料も入れる。
// - seasonMonths を付けた料理は、その月だけ提案される（旬の料理・季節の麺など）。
// - 作り方は持たない（出典の URL も付けない）。

type Amounts = [ingredientId: string, amount: number][];

interface Extra {
  /** 子どもが食べやすいか。既定は「辛くなければ true」。 */
  kid?: boolean;
  spicy?: boolean;
  season?: number[];
  /** 副菜・汁物のたんぱく源（既定 'none'）。 */
  protein?: Protein;
}

function dish(
  id: string,
  name: string,
  role: DishRole,
  protein: Protein,
  genre: Genre,
  minutes: number,
  ingredients: Amounts,
  tags: string[],
  extra: Extra = {},
): Dish {
  const spicy = extra.spicy ?? false;
  const d: Dish = {
    id,
    name,
    role,
    protein,
    genre,
    minutes,
    ingredients: ingredients.map(([ingredientId, amount]) => ({ ingredientId, amount })),
    kidFriendly: extra.kid ?? !spicy,
    spicy,
    tags,
  };
  if (extra.season) d.seasonMonths = extra.season;
  return d;
}

const main = (id: string, name: string, protein: Protein, genre: Genre, minutes: number, ing: Amounts, tags: string[], extra?: Extra) =>
  dish(id, name, 'main', protein, genre, minutes, ing, tags, extra);
const side = (id: string, name: string, genre: Genre, minutes: number, ing: Amounts, tags: string[], extra: Extra = {}) =>
  dish(id, name, 'side', extra.protein ?? 'none', genre, minutes, ing, tags, extra);
const soup = (id: string, name: string, genre: Genre, minutes: number, ing: Amounts, tags: string[], extra: Extra = {}) =>
  dish(id, name, 'soup', extra.protein ?? 'none', genre, minutes, ing, tags, extra);
const raku = (id: string, name: string, protein: Protein, genre: Genre, minutes: number, ing: Amounts, tags: string[], extra?: Extra) =>
  dish(id, name, 'raku', protein, genre, minutes, ing, tags, extra);

/** from 月から to 月まで（年をまたいでよい）。 */
function months(from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === to) return out;
  }
}

// ---------------------------------------------------------------------------
// 主菜：鶏肉
// ---------------------------------------------------------------------------

const MAIN_CHICKEN: Dish[] = [
  main('chicken_teriyaki', '鶏の照り焼き', 'chicken', 'wa', 20,
    [['chicken_thigh', 120], ['soy_sauce', 1], ['mirin', 1], ['sake', 1], ['sugar', 0.5], ['salad_oil', 0.5]],
    ['定番', '甘辛', 'お弁当にも']),
  main('karaage', '鶏の唐揚げ', 'chicken', 'wa', 30,
    [['chicken_thigh', 130], ['soy_sauce', 1], ['sake', 0.5], ['ginger', 0.5], ['garlic', 0.5], ['katakuriko', 1.5], ['flour', 0.5], ['salad_oil', 2]],
    ['定番', '揚げ物', '子どもに人気']),
  main('oyakodon', '親子丼', 'chicken', 'wa', 20,
    [['chicken_thigh', 80], ['egg', 1.5], ['onion', 0.25], ['mitsuba', 3], ['dashi', 60], ['soy_sauce', 1], ['mirin', 1], ['sugar', 0.5], ['rice', 100]],
    ['丼', '卵', 'ワンボウル']),
  main('chikuzenni', '筑前煮', 'chicken', 'wa', 40,
    [['chicken_thigh', 70], ['carrot', 0.25], ['burdock', 30], ['lotus_root', 30], ['konnyaku', 40], ['shiitake', 1], ['dashi', 80], ['soy_sauce', 1], ['mirin', 1], ['sugar', 0.5], ['sake', 0.5], ['salad_oil', 0.5]],
    ['煮物', '根菜', '作り置き']),
  main('chicken_shioyaki', '鶏ももの塩焼き', 'chicken', 'wa', 20,
    [['chicken_thigh', 130], ['salt', 0.25], ['pepper', 0.1], ['salad_oil', 0.5], ['lemon', 0.125]],
    ['塩味', '焼くだけ']),
  main('chicken_broccoli_shio', '鶏むねとブロッコリーの塩炒め', 'chicken', 'chu', 15,
    [['chicken_breast', 100], ['broccoli', 60], ['katakuriko', 0.5], ['sake', 0.5], ['garlic', 0.25], ['salt', 0.25], ['pepper', 0.1], ['salad_oil', 0.75]],
    ['塩味', '節約', '高たんぱく']),
  main('chicken_tomato_stew', '鶏肉のトマト煮', 'chicken', 'yo', 30,
    [['chicken_thigh', 110], ['canned_tomato', 100], ['onion', 0.25], ['shimeji', 30], ['garlic', 0.25], ['olive_oil', 0.5], ['sugar', 0.25], ['salt', 0.25], ['pepper', 0.1]],
    ['煮込み', 'トマト']),
  main('drumette_pot_au_feu', '手羽元のポトフ', 'chicken', 'yo', 40,
    [['chicken_drumette', 150], ['potato', 0.5], ['carrot', 0.25], ['cabbage', 80], ['onion', 0.25], ['salt', 0.3], ['pepper', 0.1]],
    ['煮込み', 'スープ仕立て', '鍋ひとつ']),
  main('chicken_miso_yaki', '鶏ももの味噌漬け焼き', 'chicken', 'wa', 20,
    [['chicken_thigh', 120], ['miso', 0.75], ['mirin', 0.5], ['sugar', 0.25], ['salad_oil', 0.5]],
    ['味噌', '漬けて焼くだけ']),
  main('cream_stew', 'クリームシチュー', 'chicken', 'yo', 35,
    [['chicken_thigh', 80], ['potato', 0.5], ['carrot', 0.25], ['onion', 0.5], ['broccoli', 30], ['stew_roux', 20], ['milk', 100], ['salad_oil', 0.5]],
    ['煮込み', '子どもに人気', '冬']),
];

// ---------------------------------------------------------------------------
// 主菜：豚肉
// ---------------------------------------------------------------------------

const MAIN_PORK: Dish[] = [
  main('shogayaki', '豚の生姜焼き', 'pork', 'wa', 15,
    [['pork_loin_sliced', 120], ['onion', 0.25], ['ginger', 0.5], ['soy_sauce', 1], ['mirin', 1], ['sake', 0.5], ['sugar', 0.25], ['salad_oil', 0.5], ['cabbage', 50]],
    ['定番', 'ご飯がすすむ']),
  main('buta_kimchi', '豚キムチ炒め', 'pork', 'other', 15,
    [['pork_komagire', 100], ['kimchi', 60], ['onion', 0.25], ['chinese_chives', 20], ['sesame_oil', 0.5], ['soy_sauce', 0.25]],
    ['ピリ辛', '炒め物'], { spicy: true }),
  main('nasu_pork_miso', 'なすと豚肉の味噌炒め', 'pork', 'wa', 20,
    [['pork_komagire', 90], ['eggplant', 1], ['green_pepper', 1], ['miso', 0.75], ['sugar', 0.5], ['sake', 0.5], ['mirin', 0.5], ['ginger', 0.25], ['salad_oil', 1]],
    ['味噌', '炒め物']),
  main('pork_cabbage_miso', '豚キャベツの味噌炒め', 'pork', 'chu', 15,
    [['pork_belly', 80], ['cabbage', 100], ['green_pepper', 0.5], ['miso', 0.75], ['sugar', 0.5], ['sake', 0.5], ['garlic', 0.25], ['salad_oil', 0.5]],
    ['味噌', '回鍋肉風']),
  main('negi_shio_pork', 'ねぎ塩豚', 'pork', 'chu', 15,
    [['pork_belly', 100], ['green_onion', 40], ['garlic', 0.25], ['sake', 0.5], ['salt', 0.25], ['pepper', 0.1], ['sesame_oil', 0.75], ['lemon', 0.1]],
    ['塩味', 'ご飯がすすむ']),
  main('pork_saute', 'ポークソテー', 'pork', 'yo', 20,
    [['pork_loin_cutlet', 120], ['garlic', 0.25], ['salt', 0.25], ['pepper', 0.1], ['salad_oil', 0.5], ['broccoli', 40]],
    ['塩こしょう', '焼くだけ']),
  main('tonkatsu', 'とんかつ', 'pork', 'wa', 30,
    [['pork_loin_cutlet', 120], ['salt', 0.2], ['pepper', 0.1], ['flour', 0.5], ['egg', 0.3], ['panko', 3], ['salad_oil', 2], ['cabbage', 60], ['sauce', 1]],
    ['揚げ物', '定番']),
  main('pork_daikon', '豚バラ大根', 'pork', 'wa', 35,
    [['pork_belly', 80], ['daikon', 120], ['ginger', 0.25], ['dashi', 100], ['soy_sauce', 1], ['mirin', 1], ['sugar', 0.5], ['sake', 0.5]],
    ['煮物', '冬']),
  main('curry_rice', 'カレーライス', 'pork', 'yo', 40,
    [['pork_komagire', 80], ['onion', 0.5], ['carrot', 0.3], ['potato', 0.5], ['curry_roux', 20], ['salad_oil', 0.5], ['rice', 100]],
    ['子どもに人気', '作り置き']),
  main('subuta', '酢豚', 'pork', 'chu', 30,
    [['pork_komagire', 100], ['onion', 0.25], ['green_pepper', 1], ['carrot', 0.25], ['katakuriko', 1], ['ketchup', 1], ['vinegar', 1], ['sugar', 1], ['soy_sauce', 0.5], ['salad_oil', 1]],
    ['甘酢', '子どもに人気']),
  main('hakusai_mille_feuille', '豚バラと白菜のミルフィーユ鍋', 'pork', 'wa', 25,
    [['pork_belly', 100], ['chinese_cabbage', 150], ['dashi', 150], ['sake', 1], ['salt', 0.25], ['ponzu', 1]],
    ['鍋', '冬'], { season: months(11, 2) }),
  main('goya_champuru', 'ゴーヤチャンプルー', 'pork', 'wa', 20,
    [['bitter_melon', 0.3], ['pork_belly', 60], ['tofu_firm', 0.25], ['egg', 0.5], ['soy_sauce', 0.5], ['katsuobushi', 1], ['salt', 0.2], ['salad_oil', 0.5]],
    ['夏', '沖縄'], { season: months(6, 9), kid: false }),
];

// ---------------------------------------------------------------------------
// 主菜：牛肉
// ---------------------------------------------------------------------------

const MAIN_BEEF: Dish[] = [
  main('nikujaga', '肉じゃが', 'beef', 'wa', 35,
    [['beef_komagire', 70], ['potato', 1], ['onion', 0.5], ['carrot', 0.25], ['shirataki', 40], ['dashi', 100], ['soy_sauce', 1.25], ['mirin', 1], ['sugar', 0.75], ['sake', 1], ['salad_oil', 0.5]],
    ['定番', '煮物']),
  main('gyudon', '牛丼', 'beef', 'wa', 15,
    [['beef_komagire', 100], ['onion', 0.5], ['ginger', 0.25], ['dashi', 80], ['soy_sauce', 1], ['mirin', 1], ['sugar', 0.5], ['sake', 1], ['rice', 100]],
    ['丼', '早い']),
  main('chinjao_rosu', '青椒肉絲（チンジャオロース）', 'beef', 'chu', 20,
    [['beef_komagire', 90], ['green_pepper', 2], ['bamboo_shoot', 30], ['katakuriko', 0.5], ['sake', 0.5], ['oyster_sauce', 0.75], ['soy_sauce', 0.5], ['sugar', 0.25], ['salad_oil', 0.75]],
    ['中華', 'ピーマン']),
  main('shio_nikujaga', '塩肉じゃが', 'beef', 'wa', 35,
    [['beef_komagire', 70], ['potato', 1], ['onion', 0.5], ['carrot', 0.25], ['dashi', 100], ['sake', 1], ['mirin', 1], ['salt', 0.3], ['salad_oil', 0.5]],
    ['煮物', '塩味']),
  main('hayashi_rice', 'ハヤシライス', 'beef', 'yo', 30,
    [['beef_sliced', 80], ['onion', 0.5], ['shimeji', 30], ['butter', 5], ['flour', 0.5], ['ketchup', 2], ['sauce', 1.5], ['consomme', 0.5], ['rice', 100]],
    ['洋食', '子どもに人気']),
  main('sukiyaki', 'すき焼き', 'beef', 'wa', 25,
    [['beef_sliced', 120], ['green_onion', 40], ['tofu_firm', 0.25], ['shirataki', 40], ['shiitake', 1], ['shungiku', 30], ['soy_sauce', 1.5], ['sugar', 1], ['mirin', 1], ['sake', 1], ['egg', 1]],
    ['鍋', 'ごちそう']),
  main('beef_pepper_shio', '牛肉とピーマンのにんにく塩炒め', 'beef', 'chu', 15,
    [['beef_komagire', 90], ['green_pepper', 1.5], ['onion', 0.25], ['garlic', 0.25], ['sake', 0.5], ['salt', 0.25], ['pepper', 0.1], ['salad_oil', 0.75]],
    ['塩味', '炒め物']),
  main('bulgogi', 'プルコギ', 'beef', 'other', 20,
    [['beef_komagire', 100], ['onion', 0.25], ['carrot', 0.2], ['chinese_chives', 20], ['soy_sauce', 1], ['sugar', 0.5], ['garlic', 0.25], ['sesame_oil', 0.5], ['sesame', 0.25]],
    ['甘辛', '焼肉風']),
];

// ---------------------------------------------------------------------------
// 主菜：ひき肉
// ---------------------------------------------------------------------------

const MAIN_GROUND: Dish[] = [
  main('hamburg', 'ハンバーグ', 'ground', 'yo', 35,
    [['ground_mixed', 100], ['onion', 0.25], ['panko', 2], ['milk', 15], ['egg', 0.25], ['salt', 0.2], ['pepper', 0.1], ['salad_oil', 0.5], ['ketchup', 1], ['sauce', 1]],
    ['子どもに人気', '洋食']),
  main('gyoza', '手作りぎょうざ', 'ground', 'chu', 40,
    [['ground_pork', 70], ['cabbage', 50], ['chinese_chives', 15], ['gyoza_skin', 8], ['ginger', 0.25], ['garlic', 0.25], ['soy_sauce', 0.5], ['sesame_oil', 0.5], ['katakuriko', 0.25], ['salad_oil', 0.5], ['vinegar', 0.5]],
    ['中華', '子どもに人気', '包む']),
  main('soboro_don', '三色そぼろ丼', 'ground', 'wa', 20,
    [['ground_chicken', 80], ['egg', 1], ['spinach', 30], ['soy_sauce', 1], ['sugar', 0.75], ['mirin', 0.5], ['sake', 0.5], ['ginger', 0.25], ['rice', 100]],
    ['丼', '子どもに人気', 'お弁当にも']),
  main('tsukune_shio', '鶏つくね（塩）', 'ground', 'wa', 25,
    [['ground_chicken', 100], ['green_onion', 15], ['ginger', 0.25], ['katakuriko', 0.5], ['sake', 0.5], ['salt', 0.2], ['salad_oil', 0.5], ['shiso', 1]],
    ['塩味', '焼くだけ']),
  main('taco_rice', 'タコライス', 'ground', 'other', 20,
    [['ground_mixed', 80], ['onion', 0.25], ['garlic', 0.25], ['ketchup', 1.5], ['salt', 0.2], ['pepper', 0.1], ['salad_oil', 0.25], ['lettuce', 30], ['tomato', 0.5], ['rice', 100]],
    ['丼', 'ワンプレート', 'チーズはお好みで']),
  main('keema_curry', 'キーマカレー', 'ground', 'yo', 25,
    [['ground_mixed', 80], ['onion', 0.5], ['carrot', 0.2], ['canned_tomato', 60], ['garlic', 0.25], ['ginger', 0.25], ['curry_powder', 1], ['ketchup', 1], ['salt', 0.25], ['salad_oil', 0.5], ['rice', 100]],
    ['カレー', 'ルウを使わない']),
  main('hikiniku_cabbage_miso', 'ひき肉とキャベツの味噌炒め', 'ground', 'wa', 15,
    [['ground_pork', 70], ['cabbage', 100], ['miso', 0.75], ['sugar', 0.5], ['sake', 0.5], ['garlic', 0.25], ['salad_oil', 0.5]],
    ['味噌', '節約']),
  main('stuffed_pepper', 'ピーマンの肉詰め', 'ground', 'yo', 30,
    [['green_pepper', 1.5], ['ground_mixed', 80], ['onion', 0.15], ['panko', 1], ['egg', 0.2], ['salt', 0.2], ['pepper', 0.1], ['katakuriko', 0.25], ['salad_oil', 0.5], ['ketchup', 1], ['sauce', 1]],
    ['子どもに人気']),
  main('meat_sauce_pasta', 'ミートソーススパゲッティ', 'ground', 'yo', 30,
    [['pasta', 100], ['ground_mixed', 70], ['onion', 0.25], ['carrot', 0.2], ['canned_tomato', 100], ['garlic', 0.25], ['olive_oil', 0.5], ['ketchup', 1], ['sauce', 0.5], ['salt', 0.2], ['pepper', 0.1], ['parmesan', 0.5]],
    ['パスタ', '子どもに人気']),
  main('cabbage_roll', 'ロールキャベツ', 'ground', 'yo', 45,
    [['cabbage', 120], ['ground_mixed', 80], ['onion', 0.15], ['panko', 1], ['egg', 0.2], ['salt', 0.2], ['pepper', 0.1], ['consomme', 1]],
    ['煮込み', '冬']),
];

// ---------------------------------------------------------------------------
// 主菜：魚
// ---------------------------------------------------------------------------

const MAIN_FISH: Dish[] = [
  main('salmon_shioyaki', '鮭の塩焼き', 'fish', 'wa', 15,
    [['salmon', 1], ['salt', 0.2], ['daikon', 30]],
    ['焼き魚', '定番']),
  main('saba_miso', 'さばの味噌煮', 'fish', 'wa', 25,
    [['mackerel', 1], ['miso', 1], ['sugar', 0.75], ['sake', 1], ['mirin', 0.5], ['ginger', 0.5], ['green_onion', 10]],
    ['煮魚', '定番']),
  main('saba_shioyaki', 'さばの塩焼き', 'fish', 'wa', 15,
    [['mackerel', 1], ['salt', 0.2], ['daikon', 30]],
    ['焼き魚']),
  main('sanma_shioyaki', 'さんまの塩焼き', 'fish', 'wa', 20,
    [['saury', 1], ['salt', 0.3], ['daikon', 40]],
    ['旬', '焼き魚'], { season: [9, 10], kid: false }),
  main('buri_teriyaki', 'ぶりの照り焼き', 'fish', 'wa', 20,
    [['yellowtail', 1], ['soy_sauce', 1], ['mirin', 1], ['sake', 1], ['sugar', 0.5], ['salad_oil', 0.5]],
    ['照り焼き', '定番']),
  main('buri_daikon', 'ぶり大根', 'fish', 'wa', 40,
    [['yellowtail', 1], ['daikon', 150], ['ginger', 0.5], ['dashi', 100], ['soy_sauce', 1.25], ['mirin', 1], ['sugar', 0.75], ['sake', 1]],
    ['旬', '煮物'], { season: months(12, 2) }),
  main('salmon_foil', '鮭のホイル焼き', 'fish', 'yo', 25,
    [['salmon', 1], ['onion', 0.15], ['shimeji', 30], ['butter', 5], ['sake', 0.5], ['salt', 0.15], ['pepper', 0.1]],
    ['ホイル焼き', '洗い物少なめ']),
  main('cod_aqua_pazza', 'たらのアクアパッツァ', 'fish', 'yo', 25,
    [['cod', 1], ['clam', 60], ['cherry_tomato', 4], ['garlic', 0.25], ['olive_oil', 0.75], ['sake', 1], ['salt', 0.2], ['pepper', 0.1]],
    ['フライパンひとつ', '見栄え']),
  main('kajiki_tomato', 'めかじきのトマト煮', 'fish', 'yo', 25,
    [['swordfish', 1], ['canned_tomato', 80], ['onion', 0.25], ['garlic', 0.25], ['olive_oil', 0.5], ['sugar', 0.1], ['salt', 0.2], ['pepper', 0.1]],
    ['トマト', '骨がない']),
  main('karei_nitsuke', 'かれいの煮付け', 'fish', 'wa', 25,
    [['flounder', 1], ['ginger', 0.5], ['soy_sauce', 1], ['mirin', 1], ['sake', 1.5], ['sugar', 0.5]],
    ['煮魚']),
  main('aji_fry', 'アジフライ', 'fish', 'wa', 30,
    [['horse_mackerel', 1], ['salt', 0.1], ['flour', 0.5], ['egg', 0.3], ['panko', 3], ['salad_oil', 2], ['cabbage', 50], ['sauce', 1]],
    ['揚げ物']),
  main('sawara_saikyo', 'さわらの西京焼き', 'fish', 'wa', 20,
    [['sawara', 1], ['miso', 1], ['mirin', 0.5], ['sugar', 0.5], ['sake', 0.25]],
    ['味噌', '焼き魚']),
  main('chanchan_yaki', '鮭のちゃんちゃん焼き', 'fish', 'wa', 25,
    [['salmon', 1], ['cabbage', 80], ['onion', 0.25], ['shimeji', 20], ['miso', 1], ['sugar', 0.5], ['sake', 0.5], ['mirin', 0.5], ['butter', 5]],
    ['旬', '味噌', 'フライパンひとつ'], { season: months(9, 11) }),
];

// ---------------------------------------------------------------------------
// 主菜：魚介（えび・いか）
// ---------------------------------------------------------------------------

const MAIN_SEAFOOD: Dish[] = [
  main('ebi_chili', 'えびのチリソース', 'seafood', 'chu', 20,
    [['shrimp', 100], ['green_onion', 20], ['ginger', 0.25], ['garlic', 0.25], ['katakuriko', 0.5], ['ketchup', 1.5], ['doubanjiang', 0.3], ['chicken_stock', 0.3], ['sugar', 0.25], ['sake', 0.5], ['salad_oil', 0.75]],
    ['中華', 'ピリ辛'], { spicy: true }),
  main('ebi_broccoli_shio', 'えびとブロッコリーの塩炒め', 'seafood', 'chu', 15,
    [['shrimp', 90], ['broccoli', 60], ['garlic', 0.25], ['katakuriko', 0.3], ['sake', 0.5], ['salt', 0.2], ['pepper', 0.1], ['salad_oil', 0.75]],
    ['塩味', '彩り']),
  main('ika_daikon', 'いかと大根の煮物', 'seafood', 'wa', 40,
    [['squid', 100], ['daikon', 120], ['ginger', 0.25], ['dashi', 100], ['soy_sauce', 1], ['mirin', 1], ['sugar', 0.5], ['sake', 1]],
    ['煮物']),
  main('ebi_fry', 'エビフライ', 'seafood', 'yo', 30,
    [['shrimp', 100], ['salt', 0.1], ['flour', 0.5], ['egg', 0.3], ['panko', 3], ['salad_oil', 2], ['cabbage', 50], ['mayonnaise', 1]],
    ['揚げ物', '子どもに人気']),
];

// ---------------------------------------------------------------------------
// 主菜：卵
// ---------------------------------------------------------------------------

const MAIN_EGG: Dish[] = [
  main('omurice', 'オムライス', 'egg', 'yo', 25,
    [['egg', 2], ['chicken_thigh', 40], ['onion', 0.25], ['frozen_mixed_veg', 30], ['ketchup', 2.5], ['butter', 5], ['salt', 0.1], ['pepper', 0.05], ['rice', 100]],
    ['子どもに人気', '洋食']),
  main('kanitama', 'かに玉', 'egg', 'chu', 15,
    [['egg', 2], ['crab_stick', 2], ['green_onion', 15], ['shiitake', 1], ['salad_oil', 0.75], ['katakuriko', 0.3], ['soy_sauce', 0.5], ['vinegar', 0.5], ['sugar', 0.5], ['chicken_stock', 0.25]],
    ['中華', '甘酢あん']),
  main('tomato_egg', 'トマトと卵の炒め物', 'egg', 'chu', 10,
    [['egg', 2], ['tomato', 1], ['green_onion', 10], ['salt', 0.15], ['sugar', 0.25], ['salad_oil', 0.75]],
    ['10分', '彩り']),
  main('niratama', 'ニラ玉', 'egg', 'chu', 10,
    [['egg', 2], ['chinese_chives', 40], ['soy_sauce', 0.5], ['sake', 0.25], ['salt', 0.05], ['sesame_oil', 0.5]],
    ['10分', '節約']),
];

// ---------------------------------------------------------------------------
// 主菜：豆腐・大豆製品
// ---------------------------------------------------------------------------

const MAIN_TOFU: Dish[] = [
  main('mabo_tofu', '麻婆豆腐', 'tofu', 'chu', 20,
    [['tofu_firm', 0.5], ['ground_pork', 50], ['green_onion', 20], ['garlic', 0.25], ['ginger', 0.25], ['doubanjiang', 0.3], ['tianmianjiang', 0.5], ['soy_sauce', 0.5], ['chicken_stock', 0.3], ['katakuriko', 0.3], ['salad_oil', 0.5], ['sesame_oil', 0.25]],
    ['中華', 'ピリ辛'], { spicy: true }),
  main('niku_dofu', '肉豆腐', 'tofu', 'wa', 25,
    [['tofu_firm', 0.5], ['beef_komagire', 60], ['green_onion', 30], ['shirataki', 30], ['dashi', 80], ['soy_sauce', 1], ['mirin', 1], ['sugar', 0.5], ['sake', 1]],
    ['煮物', '甘辛']),
  main('atsuage_miso', '厚揚げと野菜の味噌炒め', 'tofu', 'wa', 15,
    [['atsuage', 0.5], ['cabbage', 60], ['green_pepper', 0.5], ['carrot', 0.15], ['miso', 0.75], ['sugar', 0.5], ['sake', 0.5], ['salad_oil', 0.5]],
    ['味噌', '節約']),
  main('tofu_hamburg', '豆腐ハンバーグ', 'tofu', 'wa', 30,
    [['tofu_firm', 0.25], ['ground_chicken', 60], ['onion', 0.15], ['panko', 1], ['egg', 0.2], ['salt', 0.15], ['katakuriko', 0.2], ['salad_oil', 0.5], ['soy_sauce', 0.75], ['mirin', 0.75], ['sugar', 0.25]],
    ['子どもに人気', 'ヘルシー']),
  main('tofu_steak', '豆腐ステーキ', 'tofu', 'wa', 15,
    [['tofu_firm', 0.5], ['katakuriko', 0.5], ['salad_oil', 0.5], ['butter', 4], ['soy_sauce', 0.75], ['mirin', 0.5], ['scallion', 5], ['katsuobushi', 0.5]],
    ['節約', '焼くだけ']),
];

// ---------------------------------------------------------------------------
// 副菜
// ---------------------------------------------------------------------------

const SIDES: Dish[] = [
  side('spinach_ohitashi', 'ほうれん草のおひたし', 'wa', 10,
    [['spinach', 60], ['dashi', 10], ['soy_sauce', 0.25], ['katsuobushi', 0.5]], ['和え物', '作り置き']),
  side('ingen_goma_ae', 'いんげんのごま和え', 'wa', 10,
    [['green_beans', 40], ['sesame', 0.75], ['soy_sauce', 0.25], ['sugar', 0.25]], ['和え物']),
  side('kinpira_gobo', 'きんぴらごぼう', 'wa', 15,
    [['burdock', 40], ['carrot', 0.15], ['soy_sauce', 0.5], ['mirin', 0.5], ['sugar', 0.25], ['sesame_oil', 0.25], ['sesame', 0.1]],
    ['作り置き', '根菜']),
  side('hijiki_ni', 'ひじきの煮物', 'wa', 25,
    [['hijiki', 5], ['abura_age', 0.25], ['carrot', 0.1], ['dashi', 50], ['soy_sauce', 0.5], ['mirin', 0.5], ['sugar', 0.25], ['salad_oil', 0.25]],
    ['作り置き']),
  side('kiriboshi_ni', '切り干し大根の煮物', 'wa', 25,
    [['kiriboshi', 8], ['abura_age', 0.25], ['carrot', 0.1], ['dashi', 60], ['soy_sauce', 0.5], ['mirin', 0.5], ['sugar', 0.25], ['salad_oil', 0.25]],
    ['作り置き']),
  side('potato_salad', 'ポテトサラダ', 'yo', 25,
    [['potato', 1], ['cucumber', 0.25], ['carrot', 0.1], ['ham', 0.5], ['mayonnaise', 1], ['salt', 0.1], ['pepper', 0.05]],
    ['子どもに人気', '作り置き']),
  side('cabbage_shiomomi', 'キャベツの塩もみ', 'wa', 5,
    [['cabbage', 60], ['salt', 0.2], ['sesame_oil', 0.25]], ['5分', '火を使わない']),
  side('moyashi_namul', 'もやしのナムル', 'other', 10,
    [['bean_sprouts', 60], ['garlic', 0.1], ['salt', 0.15], ['sesame_oil', 0.5], ['sesame', 0.25]], ['10分', '節約']),
  side('kyuri_wakame_sunomono', 'きゅうりとわかめの酢の物', 'wa', 10,
    [['cucumber', 0.5], ['dried_wakame', 1], ['vinegar', 1], ['sugar', 0.5], ['salt', 0.1]], ['さっぱり', '火を使わない']),
  side('tamagoyaki', '卵焼き', 'wa', 10,
    [['egg', 1], ['dashi', 10], ['sugar', 0.3], ['salt', 0.05], ['salad_oil', 0.25]], ['子どもに人気', 'お弁当にも'], { protein: 'egg' }),
  side('kabocha_nimono', 'かぼちゃの煮物', 'wa', 20,
    [['pumpkin', 80], ['dashi', 50], ['soy_sauce', 0.5], ['sugar', 0.5], ['mirin', 0.5]], ['甘い', '子どもに人気']),
  side('green_salad', 'グリーンサラダ', 'yo', 5,
    [['lettuce', 30], ['tomato', 0.5], ['cucumber', 0.25], ['dressing', 1]], ['5分', '火を使わない']),
  side('broccoli_okaka', 'ブロッコリーのおかか和え', 'wa', 10,
    [['broccoli', 50], ['katsuobushi', 0.5], ['soy_sauce', 0.25]], ['和え物']),
  side('komatsuna_nibitashi', '小松菜と油揚げの煮びたし', 'wa', 10,
    [['komatsuna', 60], ['abura_age', 0.25], ['dashi', 60], ['soy_sauce', 0.5], ['mirin', 0.5]], ['10分', '作り置き']),
  side('yaki_nasu', '焼きなす', 'wa', 15,
    [['eggplant', 1], ['ginger', 0.25], ['katsuobushi', 0.3], ['soy_sauce', 0.25]], ['夏'], { season: months(6, 9) }),
  side('satoimo_nikorogashi', '里芋の煮っころがし', 'wa', 25,
    [['taro', 80], ['dashi', 60], ['soy_sauce', 0.5], ['sugar', 0.5], ['mirin', 0.5]], ['煮物', '秋冬']),
  side('coleslaw', 'コールスロー', 'yo', 10,
    [['cabbage', 60], ['carrot', 0.1], ['canned_corn', 15], ['mayonnaise', 1], ['vinegar', 0.25], ['sugar', 0.1], ['salt', 0.1]],
    ['子どもに人気']),
  side('sasami_kyuri_goma', 'ささみときゅうりのごま和え', 'wa', 15,
    [['chicken_tender', 30], ['cucumber', 0.3], ['sesame', 0.5], ['soy_sauce', 0.25], ['sugar', 0.2], ['vinegar', 0.25]],
    ['和え物'], { protein: 'chicken' }),
  side('deli_potato_salad_side', 'ポテトサラダ（惣菜）', 'yo', 1,
    [['deli_potato_salad', 60]], ['惣菜', '買うだけ']),
  side('edamame_shioyude', '枝豆の塩ゆで', 'wa', 10,
    [['edamame', 40], ['salt', 0.2]], ['夏', '子どもに人気'], { season: [7, 8, 9] }),
  side('tataki_kyuri', 'たたききゅうり', 'chu', 5,
    [['cucumber', 0.5], ['garlic', 0.1], ['salt', 0.15], ['sesame_oil', 0.25], ['sesame', 0.2]], ['5分', '火を使わない']),
  side('harusame_salad', '春雨サラダ', 'chu', 15,
    [['harusame', 10], ['cucumber', 0.25], ['ham', 0.5], ['carrot', 0.1], ['vinegar', 1], ['sugar', 0.5], ['soy_sauce', 0.5], ['sesame_oil', 0.25]],
    ['子どもに人気']),
  side('tomato_marinade', 'トマトと玉ねぎのマリネ', 'yo', 10,
    [['tomato', 0.5], ['onion', 0.1], ['olive_oil', 0.5], ['vinegar', 0.5], ['sugar', 0.15], ['salt', 0.1]], ['作り置き', 'さっぱり']),
  side('hakusai_asazuke', '白菜の浅漬け', 'wa', 5,
    [['chinese_cabbage', 60], ['salt', 0.2], ['katsuobushi', 0.3]], ['火を使わない', '冬']),
  side('daigaku_imo', '大学いも', 'wa', 25,
    [['sweet_potato', 70], ['sugar', 1], ['salad_oil', 1], ['sesame', 0.25]], ['甘い', '子どもに人気', '秋']),
];

// ---------------------------------------------------------------------------
// 汁物
// ---------------------------------------------------------------------------

const SOUPS: Dish[] = [
  soup('miso_tofu_wakame', '豆腐とわかめの味噌汁', 'wa', 10,
    [['tofu_silken', 0.15], ['dried_wakame', 1], ['green_onion', 5], ['dashi', 150], ['miso', 0.75]], ['定番'], { protein: 'tofu' }),
  soup('miso_daikon_age', '大根と油揚げの味噌汁', 'wa', 10,
    [['daikon', 40], ['abura_age', 0.2], ['dashi', 150], ['miso', 0.75]], ['定番']),
  soup('tonjiru', '豚汁', 'wa', 25,
    [['pork_belly', 30], ['daikon', 30], ['carrot', 0.15], ['burdock', 15], ['konnyaku', 20], ['green_onion', 10], ['dashi', 180], ['miso', 1], ['sesame_oil', 0.25]],
    ['具だくさん', '冬'], { protein: 'pork' }),
  soup('kenchinjiru', 'けんちん汁', 'wa', 25,
    [['tofu_firm', 0.15], ['daikon', 30], ['carrot', 0.1], ['burdock', 15], ['taro', 30], ['dashi', 180], ['soy_sauce', 0.5], ['salt', 0.1], ['sesame_oil', 0.25]],
    ['具だくさん', '冬'], { protein: 'tofu' }),
  soup('kakitama_jiru', 'かき玉汁', 'wa', 10,
    [['egg', 0.5], ['scallion', 3], ['dashi', 160], ['soy_sauce', 0.25], ['salt', 0.1], ['katakuriko', 0.25]], ['やさしい味'], { protein: 'egg' }),
  soup('asari_miso', 'あさりの味噌汁', 'wa', 10,
    [['clam', 60], ['scallion', 3], ['miso', 0.75]], ['春'], { protein: 'seafood' }),
  soup('corn_soup', 'コーンスープ', 'yo', 15,
    [['canned_corn', 40], ['milk', 100], ['onion', 0.1], ['butter', 3], ['consomme', 0.5], ['salt', 0.05]], ['子どもに人気']),
  soup('minestrone', 'ミネストローネ', 'yo', 25,
    [['canned_tomato', 60], ['onion', 0.15], ['carrot', 0.15], ['cabbage', 30], ['potato', 0.25], ['bacon', 10], ['consomme', 0.5], ['olive_oil', 0.25], ['salt', 0.1]],
    ['具だくさん', '野菜たっぷり']),
  soup('wakame_soup', 'わかめスープ', 'chu', 5,
    [['dried_wakame', 1], ['scallion', 3], ['chicken_stock', 0.5], ['soy_sauce', 0.25], ['salt', 0.05], ['sesame_oil', 0.25], ['sesame', 0.25]], ['5分']),
  soup('chinese_egg_soup', '中華風たまごスープ', 'chu', 10,
    [['egg', 0.5], ['green_onion', 5], ['chicken_stock', 0.5], ['salt', 0.05], ['katakuriko', 0.2], ['sesame_oil', 0.25]], ['やさしい味'], { protein: 'egg' }),
  soup('enoki_suimono', 'えのきと三つ葉のすまし汁', 'wa', 10,
    [['enoki', 20], ['mitsuba', 2], ['dashi', 160], ['soy_sauce', 0.25], ['salt', 0.1]], ['さっぱり']),
  soup('potato_onion_miso', 'じゃがいもと玉ねぎの味噌汁', 'wa', 15,
    [['potato', 0.3], ['onion', 0.15], ['dashi', 150], ['miso', 0.75]], ['子どもに人気']),
  soup('kinoko_miso', 'きのこの味噌汁', 'wa', 10,
    [['shimeji', 20], ['enoki', 15], ['dashi', 150], ['miso', 0.75]], ['秋']),
];

// ---------------------------------------------------------------------------
// ラク日用（冷凍食品・惣菜・レトルト・5〜15分のメニュー）
// ---------------------------------------------------------------------------

const RAKU: Dish[] = [
  raku('frozen_gyoza_yaki', '冷凍ぎょうざ', 'ground', 'chu', 10,
    [['frozen_gyoza', 6], ['salad_oil', 0.25], ['soy_sauce', 0.25], ['vinegar', 0.25]], ['冷凍食品', '焼くだけ']),
  raku('tamago_udon', '卵とじうどん（冷凍うどん）', 'egg', 'wa', 10,
    [['frozen_udon', 1], ['egg', 1], ['green_onion', 10], ['mentsuyu', 2], ['katakuriko', 0.25]], ['冷凍食品', '10分']),
  raku('deli_karaage_plate', '惣菜の唐揚げ', 'chicken', 'wa', 5,
    [['deli_karaage', 100], ['cabbage', 40]], ['惣菜', '買うだけ']),
  raku('retort_curry_rice', 'レトルトカレー', 'none', 'yo', 5,
    [['retort_curry', 1], ['rice', 100]], ['レトルト', '5分']),
  raku('natto_gohan_miso', '納豆ごはんと味噌汁', 'tofu', 'wa', 10,
    [['natto', 1], ['rice', 100], ['scallion', 3], ['tofu_silken', 0.15], ['dried_wakame', 1], ['dashi', 150], ['miso', 0.75]],
    ['10分', '火をほとんど使わない']),
  raku('hiyashi_chuka', '冷やし中華', 'egg', 'chu', 15,
    [['chuka_men', 1], ['ham', 1], ['cucumber', 0.3], ['egg', 0.5], ['tomato', 0.25], ['salad_oil', 0.1]],
    ['夏', '麺'], { season: months(6, 9) }),
  raku('yakisoba', 'ソース焼きそば', 'pork', 'other', 15,
    [['yakisoba_men', 1], ['pork_komagire', 50], ['cabbage', 60], ['carrot', 0.1], ['bean_sprouts', 40], ['salad_oil', 0.5]],
    ['麺', 'フライパンひとつ']),
  raku('okonomiyaki', 'お好み焼き', 'pork', 'other', 20,
    [['okonomiyaki_flour', 50], ['egg', 0.5], ['cabbage', 100], ['pork_belly', 40], ['salad_oil', 0.5], ['sauce', 1], ['mayonnaise', 0.5], ['katsuobushi', 0.5]],
    ['粉もの', 'ホットプレート']),
  raku('retort_pasta', 'パスタ（レトルトソース）', 'none', 'yo', 15,
    [['pasta', 100], ['pasta_sauce', 1]], ['レトルト', '麺']),
  raku('pork_moyashi_range', '豚こまともやしのレンジ蒸し', 'pork', 'chu', 10,
    [['pork_komagire', 80], ['bean_sprouts', 100], ['scallion', 3], ['sake', 0.5], ['salt', 0.2], ['pepper', 0.05], ['sesame_oil', 0.5]],
    ['電子レンジ', '10分']),
  raku('sabakan_cabbage_miso', 'さば缶とキャベツの味噌煮', 'fish', 'wa', 10,
    [['mackerel_can', 0.5], ['cabbage', 80], ['miso', 0.5], ['sugar', 0.2], ['ginger', 0.2]], ['缶詰', '10分']),
  raku('shirasu_don', 'しらす丼', 'fish', 'wa', 5,
    [['shirasu', 30], ['rice', 100], ['scallion', 3], ['nori', 0.25], ['sesame', 0.2], ['soy_sauce', 0.25]], ['火を使わない', '5分']),
  raku('kitsune_soba', 'きつねそば', 'tofu', 'wa', 15,
    [['soba', 90], ['abura_age', 0.5], ['green_onion', 10], ['mentsuyu', 2.5], ['sugar', 0.25]], ['麺', '温かい']),
];

/** 標準料理マスタ（主菜 → 副菜 → 汁物 → ラク日用）。 */
export const DISHES: Dish[] = [
  ...MAIN_CHICKEN,
  ...MAIN_PORK,
  ...MAIN_BEEF,
  ...MAIN_GROUND,
  ...MAIN_FISH,
  ...MAIN_SEAFOOD,
  ...MAIN_EGG,
  ...MAIN_TOFU,
  ...SIDES,
  ...SOUPS,
  ...RAKU,
];
