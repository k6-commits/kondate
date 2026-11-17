import type { Dish, Genre, Ingredient, Protein } from '../engine/types';
import type { DishAmounts, DishExtra } from './dishes';
import { dishMakers } from './dishes';
import { ingredientMakers } from './ingredients';

// 夕食のほかの食事：朝ごはん（role 'breakfast'）・お弁当（'bento'）・家で食べるお昼（'lunch'）の、決まった組み合わせ。
// - 1品が「1食分の組み合わせ」（例：「ごはん・味噌汁・卵焼き」）。材料と量は大人1人分。
// - 朝ごはんの genre は、ごはんの組み合わせが 'wa'、パンの組み合わせが 'yo'（主食の好みで選び分ける）。
// - アレルゲンの判定は夕食と同じ（家族の除外に当たる組み合わせは出さない）。
// - 新しい食材には price（値段の目安）を付ける。食材の id は、ほかのマスタと重ならないこと。
// - 決まりは dishes.ts・ingredients.ts と同じ（調味料も量を書く。アレルゲンは派生原材料も。迷ったら多めに）。
//   米は炊く前の量（お茶碗1杯60〜70g・お弁当80g・おにぎり2個80〜90g・丼やチャーハン100g）。同じ食材は1行にまとめる
//   （卵焼きのだし汁と味噌汁のだし汁は、足して1行）。
// - 卵・乳・小麦（派生原材料も）と、銘柄で変わる加工品（要確認）を使わない組み合わせを、どの食事にもいくつか入れる
//   （アレルギーのある家族に出せるもの。数は extras.test.ts で確かめる）。醤油・めんつゆ・酢・納豆のたれは小麦を含む扱い、
//   味噌は大豆だけ。パン・麺・ルウは小麦を含む。
// - 冷凍食品を使う組み合わせには tags に '冷凍食品' を付ける（冷凍食品は要確認の食材）。主食のタグ（'ごはん'・'パン'・'麺'）も付ける。
// - id の頭は役割（breakfast_・bento_・lunch_）。夕食の料理の id と重ならないようにする。

const { dish, months } = dishMakers;
const { make } = ingredientMakers;

// ---------------------------------------------------------------------------
// 食材（標準の食材にないものだけ）
// ---------------------------------------------------------------------------

export const EXTRA_INGREDIENTS: Ingredient[] = [
  // プレーンヨーグルト（plain_yogurt）は、世界の料理の食材（world.ts）にあるものを使う。
  // 豆腐・大豆製品（牛乳の代わりにも使う）。
  make('soy_milk', '豆乳', 'tofu', 'tofu', 'ml', {
    aliases: ['とうにゅう', '調製豆乳', '無調整豆乳'],
    pack: [1000, '1本（1L）'], shelf: 7, allergens: ['soy'], price: [258, 1000],
  }),
  // 果物
  make('banana', 'バナナ', 'fruit', 'produce', 'piece', {
    aliases: ['ばなな'],
    pack: [4, '1房（約4本）'], shelf: 4, allergens: ['banana'], price: [178, 4],
  }),
  // パン・シリアル（主食の売り場）。ロールパンは食パンと同じく乳・卵・大豆を使う商品が多い。
  make('roll_bread', 'ロールパン', 'grain', 'staple', 'piece', {
    aliases: ['バターロール', 'テーブルロール'],
    pack: [6, '1袋（6個）'], shelf: 3, freeze: true, thaw: 'from_frozen',
    allergens: ['wheat', 'milk', 'egg', 'soy'], uncertain: true, subs: ['bread'], price: [198, 6],
  }),
  // 米粉パンは、小麦・卵・乳を使わないと書いてあるもの（アレルギー対応の商品）。小麦グルテン入りの米粉パンもあるので、
  // 買い物リスト（パックの表示）で「不使用」のものと分かるようにする。名前・別名にはアレルゲンの語を入れない
  // （自由入力の除外「小麦」が名前で当たらないように）。大豆を使う商品があるので大豆を入れる。
  make('rice_flour_bread', '米粉パン', 'grain', 'staple', 'piece', {
    aliases: ['米粉の食パン', '米粉食パン', 'こめこパン'],
    pack: [2, '1袋（2個・小麦・卵・乳不使用）'], shelf: 5, freeze: true, thaw: 'from_frozen',
    allergens: ['soy'], price: [398, 2],
  }),
  // グラノーラは銘柄で中身が違う（小麦・乳・大豆・ごま・ナッツ・ドライフルーツ）。
  make('granola', 'グラノーラ', 'grain', 'staple', 'g', {
    aliases: ['フルーツグラノーラ', 'シリアル'],
    pack: [400, '1袋（約400g）'], shelf: 30, uncertain: true,
    allergens: ['wheat', 'milk', 'soy', 'sesame', 'apple', 'banana', 'almond', 'walnut', 'cashew'], price: [598, 400],
  }),
  // 常備品。りんごの果汁を使うジャムがあるので、りんごを入れる。
  make('strawberry_jam', 'いちごジャム', 'processed', 'other', 'tbsp', {
    aliases: ['ジャム', 'イチゴジャム', '苺ジャム'],
    shelf: 60, pantry: true, allergens: ['apple'],
  }),
  // お弁当用の冷凍食品（凍ったまま温める・自然解凍。銘柄で原材料が違うので要確認）。
  make('frozen_mini_hamburg', '冷凍ミニハンバーグ', 'processed', 'frozen', 'piece', {
    aliases: ['冷凍ハンバーグ', 'ミニハンバーグ', 'お弁当用ハンバーグ'],
    pack: [6, '1袋（6個）'], shelf: 60, freeze: true, thaw: 'from_frozen', uncertain: true,
    allergens: ['wheat', 'milk', 'egg', 'soy', 'beef', 'pork', 'chicken', 'apple', 'gelatin'], price: [298, 6],
    subs: ['frozen_karaage'],
  }),
  // グラタン・コロッケ・ほうれん草のソテーなど、何を選ぶかで原材料が違うので、アレルゲンは広めに入れる。
  make('frozen_bento_side', 'お弁当用の冷凍おかず', 'processed', 'frozen', 'piece', {
    aliases: ['冷凍のおかず', '冷凍おかず', '自然解凍のおかず'],
    pack: [6, '1袋（6個）'], shelf: 60, freeze: true, thaw: 'from_frozen', uncertain: true,
    allergens: ['wheat', 'milk', 'egg', 'soy', 'shrimp', 'crab', 'chicken', 'pork', 'beef', 'sesame', 'apple', 'gelatin'],
    price: [278, 6],
  }),
];

// ---------------------------------------------------------------------------
// 組み合わせ
// ---------------------------------------------------------------------------

/** 朝ごはん。genre は主食で決める：ごはん 'wa'、パン 'yo'。5〜15分。 */
const breakfast = (id: string, name: string, protein: Protein, genre: 'wa' | 'yo', minutes: number, ing: DishAmounts, tags: string[], extra?: DishExtra) =>
  dish(id, name, 'breakfast', protein, genre, minutes, ing, tags, extra);
/** お弁当（ごはん＋おかず2〜3品。おにぎり・サンドイッチも）。 */
const bento = (id: string, name: string, protein: Protein, genre: Genre, minutes: number, ing: DishAmounts, tags: string[], extra?: DishExtra) =>
  dish(id, name, 'bento', protein, genre, minutes, ing, tags, extra);
/** 家で食べるお昼（麺・丼・チャーハンなど、1皿で済むもの）。 */
const lunch = (id: string, name: string, protein: Protein, genre: Genre, minutes: number, ing: DishAmounts, tags: string[], extra?: DishExtra) =>
  dish(id, name, 'lunch', protein, genre, minutes, ing, tags, extra);

// 朝ごはん：ごはん（和）
const BREAKFAST_RICE: Dish[] = [
  breakfast('breakfast_tamagoyaki', 'ごはん・卵焼き・豆腐とわかめの味噌汁', 'egg', 'wa', 15,
    [['rice', 70], ['egg', 1], ['sugar', 0.3], ['salt', 0.05], ['salad_oil', 0.25], ['tofu_silken', 0.1], ['dried_wakame', 1], ['scallion', 3], ['dashi', 160], ['miso', 0.75]],
    ['ごはん', '卵', '定番']),
  breakfast('breakfast_natto', '納豆ごはん・大根と油揚げの味噌汁', 'tofu', 'wa', 10,
    [['natto', 1], ['rice', 70], ['scallion', 3], ['daikon', 30], ['abura_age', 0.2], ['dashi', 150], ['miso', 0.75]],
    ['ごはん', '納豆', '定番']),
  breakfast('breakfast_salmon', 'ごはん・焼き鮭・豆腐とわかめの味噌汁', 'fish', 'wa', 15,
    [['rice', 70], ['salmon', 1], ['salt', 0.1], ['tofu_silken', 0.1], ['dried_wakame', 1], ['scallion', 3], ['dashi', 150], ['miso', 0.75]],
    ['ごはん', '焼き魚', '定番']),
  breakfast('breakfast_shirasu', 'しらすごはん・小松菜と油揚げの味噌汁', 'fish', 'wa', 10,
    [['rice', 70], ['shirasu', 20], ['komatsuna', 30], ['abura_age', 0.2], ['dashi', 150], ['miso', 0.75]],
    ['ごはん', '10分']),
  breakfast('breakfast_onigiri', '塩むすび・じゃがいもと玉ねぎの味噌汁', 'none', 'wa', 15,
    [['rice', 80], ['salt', 0.2], ['nori', 0.5], ['potato', 0.3], ['onion', 0.15], ['dashi', 150], ['miso', 0.75]],
    ['ごはん', 'おにぎり']),
  breakfast('breakfast_saba', 'ごはん・塩さば（大根おろし）・わかめの味噌汁', 'fish', 'wa', 15,
    [['rice', 70], ['mackerel', 1], ['salt', 0.1], ['daikon', 30], ['dried_wakame', 1], ['green_onion', 5], ['dashi', 150], ['miso', 0.75]],
    ['ごはん', '焼き魚']),
  breakfast('breakfast_sausage_egg', 'ごはん・目玉焼きとウインナー・キャベツの味噌汁', 'egg', 'wa', 10,
    [['rice', 70], ['egg', 1], ['sausage', 2], ['salad_oil', 0.25], ['salt', 0.05], ['pepper', 0.05], ['cabbage', 30], ['dashi', 150], ['miso', 0.75]],
    ['ごはん', '卵', '子どもに人気']),
  breakfast('breakfast_zosui', '卵雑炊', 'egg', 'wa', 10,
    [['rice', 60], ['egg', 1], ['scallion', 3], ['dashi', 200], ['soy_sauce', 0.5], ['salt', 0.1]],
    ['ごはん', '卵', '温まる'], { season: months(11, 3) }),
];

// 朝ごはん：パン（洋）。米粉パンの組み合わせは、小麦・卵・乳を使わない家族のため。
const BREAKFAST_BREAD: Dish[] = [
  breakfast('breakfast_toast_egg', 'トースト・目玉焼き・ミニトマト', 'egg', 'yo', 10,
    [['bread', 1], ['butter', 5], ['egg', 1], ['salad_oil', 0.25], ['salt', 0.05], ['pepper', 0.05], ['cherry_tomato', 2]],
    ['パン', '卵', '定番']),
  breakfast('breakfast_ham_cheese_toast', 'ハムチーズトースト・牛乳', 'pork', 'yo', 10,
    [['bread', 1], ['ham', 1], ['cheese_slice', 1], ['milk', 150]],
    ['パン', 'トースト']),
  breakfast('breakfast_pizza_toast', 'ピザトースト・ヨーグルト', 'pork', 'yo', 10,
    [['bread', 1], ['ketchup', 0.5], ['sausage', 1], ['green_pepper', 0.25], ['onion', 0.1], ['cheese_pizza', 20], ['plain_yogurt', 80]],
    ['パン', 'トースト', '子どもに人気']),
  breakfast('breakfast_french_toast', 'フレンチトースト・バナナ', 'egg', 'yo', 15,
    [['bread', 1], ['egg', 1], ['milk', 80], ['sugar', 0.5], ['butter', 5], ['banana', 0.5]],
    ['パン', '卵', '甘い']),
  breakfast('breakfast_jam_toast', 'ジャムトースト・バナナヨーグルト', 'none', 'yo', 5,
    [['bread', 1], ['strawberry_jam', 1], ['plain_yogurt', 100], ['banana', 0.5]],
    ['パン', '5分']),
  breakfast('breakfast_granola', 'グラノーラ・牛乳', 'none', 'yo', 5,
    [['granola', 40], ['milk', 150]],
    ['グラノーラ', '5分', '火を使わない']),
  breakfast('breakfast_hotdog', 'ホットドッグ・牛乳', 'pork', 'yo', 10,
    [['roll_bread', 2], ['sausage', 2], ['cabbage', 30], ['salad_oil', 0.25], ['salt', 0.05], ['ketchup', 0.5], ['milk', 150]],
    ['パン', '子どもに人気']),
  breakfast('breakfast_rice_bread_banana', '米粉パン（ジャム）・バナナ・豆乳', 'tofu', 'yo', 5,
    [['rice_flour_bread', 1], ['strawberry_jam', 1], ['banana', 1], ['soy_milk', 150]],
    ['パン', '米粉パン', '5分']),
  breakfast('breakfast_rice_bread_potage', '米粉パン・じゃがいもの豆乳ポタージュ・ミニトマト', 'tofu', 'yo', 15,
    [['rice_flour_bread', 1], ['potato', 0.5], ['onion', 0.15], ['soy_milk', 100], ['olive_oil', 0.25], ['salt', 0.15], ['pepper', 0.05], ['cherry_tomato', 2]],
    ['パン', '米粉パン', 'スープ']),
];

// お弁当
const BENTO: Dish[] = [
  bento('bento_frozen_karaage', 'ごはん・唐揚げ（冷凍）・卵焼き・ブロッコリー', 'chicken', 'wa', 15,
    [['rice', 80], ['frozen_karaage', 60], ['egg', 1], ['sugar', 0.5], ['salt', 0.1], ['salad_oil', 0.25], ['broccoli', 30]],
    ['ごはん', '冷凍食品', '子どもに人気']),
  bento('bento_sausage_tamagoyaki', 'ごはん・ウインナー・卵焼き・ブロッコリー・ミニトマト', 'pork', 'wa', 15,
    [['rice', 80], ['sausage', 2], ['egg', 1], ['sugar', 0.5], ['salt', 0.1], ['salad_oil', 0.5], ['broccoli', 30], ['cherry_tomato', 2]],
    ['ごはん', '定番', '子どもに人気']),
  bento('bento_salmon', 'ごはん・焼き鮭・さつまいもの甘煮・ブロッコリー', 'fish', 'wa', 20,
    [['rice', 80], ['salmon', 1], ['salt', 0.15], ['sweet_potato', 40], ['sugar', 0.5], ['broccoli', 30]],
    ['ごはん', '焼き魚']),
  bento('bento_shio_karaage', 'ごはん・鶏の塩から揚げ・きゅうりの塩もみ・ミニトマト', 'chicken', 'wa', 20,
    [['rice', 80], ['chicken_thigh', 80], ['salt', 0.3], ['sake', 0.5], ['garlic', 0.25], ['katakuriko', 1], ['salad_oil', 1], ['cucumber', 0.3], ['cherry_tomato', 2]],
    ['ごはん', '揚げ物', '子どもに人気']),
  bento('bento_pork_ketchup', 'ごはん・豚こまとピーマンのケチャップ炒め・ブロッコリー', 'pork', 'yo', 15,
    [['rice', 80], ['pork_komagire', 70], ['onion', 0.15], ['green_pepper', 0.5], ['ketchup', 1], ['salt', 0.15], ['pepper', 0.05], ['salad_oil', 0.5], ['broccoli', 30]],
    ['ごはん', 'ケチャップ', '子どもに人気']),
  bento('bento_atsuage_miso', 'ごはん・厚揚げとキャベツの味噌炒め・ミニトマト', 'tofu', 'wa', 15,
    [['rice', 80], ['atsuage', 0.5], ['cabbage', 40], ['carrot', 0.1], ['miso', 0.5], ['sugar', 0.3], ['sake', 0.5], ['salad_oil', 0.5], ['cherry_tomato', 2]],
    ['ごはん', '味噌', '節約']),
  bento('bento_soboro', 'ごはん・三色そぼろ（鶏そぼろ・炒り卵・いんげん）', 'ground', 'wa', 20,
    [['rice', 80], ['ground_chicken', 50], ['soy_sauce', 0.75], ['sugar', 0.75], ['mirin', 0.5], ['sake', 0.5], ['ginger', 0.25], ['egg', 1], ['salt', 0.05], ['salad_oil', 0.25], ['green_beans', 20]],
    ['ごはん', '子どもに人気']),
  bento('bento_teriyaki', 'ごはん・鶏の照り焼き・卵焼き・ほうれん草のおひたし', 'chicken', 'wa', 20,
    [['rice', 80], ['chicken_thigh', 80], ['soy_sauce', 1], ['mirin', 0.75], ['sake', 0.5], ['sugar', 0.75], ['salad_oil', 0.5], ['egg', 1], ['salt', 0.05], ['spinach', 40], ['katsuobushi', 0.3]],
    ['ごはん', '甘辛', '定番']),
  bento('bento_frozen_hamburg', 'ごはん・ミニハンバーグ（冷凍）・冷凍のおかず・ミニトマト', 'ground', 'yo', 5,
    [['rice', 80], ['frozen_mini_hamburg', 2], ['frozen_bento_side', 1], ['cherry_tomato', 2]],
    ['ごはん', '冷凍食品', '5分']),
  bento('bento_onigiri', 'おにぎり（鮭）・ちくわきゅうり・ミニトマト', 'fish', 'wa', 15,
    [['rice', 90], ['salmon', 0.5], ['salt', 0.2], ['nori', 0.5], ['chikuwa', 1], ['cucumber', 0.2], ['cherry_tomato', 2]],
    ['ごはん', 'おにぎり']),
  bento('bento_sandwich', 'サンドイッチ（ハム・卵・きゅうり）', 'egg', 'yo', 20,
    [['bread', 2], ['butter', 5], ['ham', 1], ['egg', 1], ['mayonnaise', 1], ['salt', 0.05], ['pepper', 0.05], ['cucumber', 0.3]],
    ['パン', 'サンドイッチ']),
];

// 家で食べるお昼
const LUNCH: Dish[] = [
  lunch('lunch_niku_udon', '肉うどん（冷凍うどん）', 'beef', 'wa', 10,
    [['frozen_udon', 1], ['beef_komagire', 50], ['green_onion', 15], ['mentsuyu', 2.5], ['sugar', 0.5]],
    ['麺', '冷凍食品', '温かい']),
  lunch('lunch_yakisoba', 'ソース焼きそば', 'pork', 'other', 15,
    [['yakisoba_men', 1], ['pork_komagire', 50], ['cabbage', 60], ['carrot', 0.1], ['bean_sprouts', 40], ['salad_oil', 0.5]],
    ['麺', 'フライパンひとつ']),
  lunch('lunch_fried_rice', '卵チャーハン', 'egg', 'chu', 15,
    [['rice', 100], ['egg', 1], ['ham', 1], ['green_onion', 15], ['salad_oil', 1], ['chicken_stock', 0.25], ['salt', 0.1], ['pepper', 0.05], ['soy_sauce', 0.25]],
    ['ごはん', '炒め物', '子どもに人気']),
  lunch('lunch_oyakodon', '親子丼', 'chicken', 'wa', 20,
    [['rice', 100], ['chicken_thigh', 70], ['egg', 1.5], ['onion', 0.25], ['dashi', 60], ['soy_sauce', 1], ['mirin', 1], ['sugar', 0.5]],
    ['ごはん', '丼', '卵']),
  lunch('lunch_napolitan', 'ナポリタン', 'pork', 'yo', 20,
    [['pasta', 100], ['sausage', 2], ['onion', 0.25], ['green_pepper', 0.5], ['ketchup', 2.5], ['salad_oil', 0.75], ['salt', 0.1], ['pepper', 0.05]],
    ['麺', 'パスタ', '子どもに人気']),
  lunch('lunch_somen', 'そうめん', 'none', 'wa', 10,
    [['somen', 100], ['mentsuyu', 2], ['scallion', 5], ['ginger', 0.25], ['cucumber', 0.25]],
    ['麺', '夏', '冷たい'], { season: months(6, 9) }),
  lunch('lunch_chicken_rice', 'チキンライス', 'chicken', 'yo', 15,
    [['rice', 100], ['chicken_thigh', 50], ['onion', 0.25], ['frozen_mixed_veg', 30], ['ketchup', 2], ['salad_oil', 0.75], ['salt', 0.1], ['pepper', 0.05]],
    ['ごはん', 'ケチャップ', '子どもに人気']),
  lunch('lunch_negi_shio_butadon', 'ねぎ塩豚丼', 'pork', 'wa', 15,
    [['rice', 100], ['pork_belly', 80], ['green_onion', 30], ['garlic', 0.25], ['sake', 0.5], ['salt', 0.25], ['pepper', 0.05], ['sesame_oil', 0.75]],
    ['ごはん', '丼', '塩味'], { kid: false }),
  lunch('lunch_onigiri_tonjiru', 'おにぎり・豚汁', 'pork', 'wa', 20,
    [['rice', 90], ['salt', 0.2], ['nori', 0.5], ['pork_belly', 30], ['daikon', 30], ['carrot', 0.15], ['green_onion', 10], ['dashi', 180], ['miso', 1], ['sesame_oil', 0.25]],
    ['ごはん', 'おにぎり', '具だくさん']),
  lunch('lunch_salmon_mazegohan', '鮭と小松菜の混ぜごはん・豆腐とわかめの味噌汁', 'fish', 'wa', 20,
    [['rice', 100], ['salmon', 0.5], ['komatsuna', 30], ['sesame', 0.5], ['salt', 0.15], ['tofu_silken', 0.1], ['dried_wakame', 1], ['dashi', 150], ['miso', 0.75]],
    ['ごはん', '混ぜごはん']),
];

/** 朝ごはん（ごはん → パン）→ お弁当 → 家の昼。 */
export const EXTRA_DISHES: Dish[] = [...BREAKFAST_RICE, ...BREAKFAST_BREAD, ...BENTO, ...LUNCH];
