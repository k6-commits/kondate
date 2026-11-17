import type { Dish, Ingredient, Unit } from '../engine/types';
import { dishMakers } from './dishes';
import { ingredientMakers, type IngredientSpec } from './ingredients';

// 世界の料理（韓国・イタリアン・エスニック（タイ・ベトナム・インドなど）・メキシカン）と、そのための食材。
// - 決まりは dishes.ts・ingredients.ts と同じ（材料と量は大人1人分。アレルゲンは派生原材料も。迷ったら多めに）。
// - genre は kr・it・eth・mx。日本の家庭の洋食・中華として定着したもの（カレーライス・ナポリタンなど）は dishes.ts の yo・chu。
// - 食材の id は、標準の食材（ingredients.ts）と重ならないこと。標準の食材で足りるものは、そちらを使う。
// - 新しい食材には price（値段の目安）を付ける（types.ts の Price）。
// - 白ワインは料理酒で、ライムはレモンで代える（日本の家庭のレシピと同じ。食材を増やさない）。
// - 辛さ（spicy）は、唐辛子・コチュジャン・タイのペーストが味の中心の料理だけ。コチュジャン・スイートチリソースを添えるだけ、
//   甘みに少し使うだけの料理（ビビンバ・サムギョプサル・生春巻き・ナシゴレン）は spicy にしない（子どもの分には添えなければよい）。

const { make, months } = ingredientMakers;
const { main, side, soup } = dishMakers;

// 常備の調味料・香辛料。買い物リストには載せず「家にあるか確認」に出す（標準の常備品と同じく pack・price を持たない）。
const pantry = (id: string, name: string, unit: Unit, s: Partial<IngredientSpec>) =>
  make(id, name, 'seasoning', 'seasoning', unit, { shelf: 180, pantry: true, ...s });

// ---------------------------------------------------------------------------
// 食材
// ---------------------------------------------------------------------------

export const WORLD_INGREDIENTS: Ingredient[] = [
  // 卵・乳製品
  make('fresh_cream', '生クリーム', 'dairy', 'dairy_egg', 'ml', {
    aliases: ['なまクリーム', 'フレッシュクリーム', '純生クリーム'],
    pack: [200, '1パック（200ml）'], shelf: 5, allergens: ['milk'], price: [378, 200],
  }),
  make('mozzarella', 'モッツァレラチーズ', 'dairy', 'dairy_egg', 'g', {
    aliases: ['モッツァレラ', 'モッツアレラ', 'モッツアレラチーズ', 'モッツァレッラ', 'フレッシュモッツァレラ'],
    pack: [100, '1個（約100g）'], shelf: 5, allergens: ['milk'], price: [298, 100],
  }),
  make('plain_yogurt', 'プレーンヨーグルト', 'dairy', 'dairy_egg', 'g', {
    aliases: ['ヨーグルト', '無糖ヨーグルト'],
    pack: [400, '1パック（400g）'], shelf: 7, allergens: ['milk'], price: [198, 400],
  }),

  // 野菜・ハーブ
  make('basil', 'バジル', 'vegetable', 'produce', 'g', {
    aliases: ['バジルの葉', 'スイートバジル', '生バジル'],
    pack: [10, '1パック（約10g）'], shelf: 3, season: months(6, 9), price: [178, 10],
  }),
  make('cilantro', 'パクチー', 'vegetable', 'produce', 'g', {
    aliases: ['香菜', 'シャンツァイ', 'コリアンダー'],
    pack: [20, '1袋（約20g）'], shelf: 3, price: [158, 20],
  }),

  // 魚介（冷凍）。えび・いかに、あさり・ほたてなどが混ざる。冷凍したまま加熱する。中身は銘柄で違う（たこ・かにかまなどを
  // 入れた商品もある）ので要確認にする。別名の「えび・いか・貝のミックス」は、自由入力の除外「貝」を当てるため。
  make('seafood_mix', 'シーフードミックス（冷凍）', 'seafood', 'frozen', 'g', {
    aliases: ['シーフードミックス', '冷凍シーフードミックス', '冷凍シーフード', '海鮮ミックス', 'えび・いか・貝のミックス'],
    pack: [200, '1袋（約200g）'], shelf: 60, freeze: true, thaw: 'from_frozen', allergens: ['shrimp', 'squid'], uncertain: true,
    price: [398, 200],
  }),

  // 乾物・缶詰
  // ココナッツミルクは特定原材料等を含まない。
  make('coconut_milk', 'ココナッツミルク', 'other', 'dry', 'ml', {
    aliases: ['ココナツミルク', 'ココナッツミルク缶'],
    pack: [400, '1缶（400ml）'], shelf: 180, price: [278, 400],
  }),
  // 豆の組み合わせは銘柄で違い、大豆を入れた商品がある。
  make('mixed_beans', 'ミックスビーンズ', 'other', 'dry', 'g', {
    aliases: ['ミックスビーンズ缶', 'ミックス豆', 'キドニービーンズ', 'レッドキドニー', 'ひよこ豆', 'ガルバンゾ'],
    pack: [100, '1袋（約100g）'], shelf: 180, allergens: ['soy'], price: [138, 100],
  }),
  make('peanuts', 'ピーナッツ', 'other', 'dry', 'g', {
    aliases: ['落花生', 'らっかせい', 'ピーナツ', '素焼きピーナッツ'],
    pack: [100, '1袋（約100g）'], shelf: 90, allergens: ['peanut'], price: [198, 100],
  }),

  // 主食（麺・皮）
  make('rice_noodle', 'ライスヌードル', 'noodle', 'staple', 'g', {
    aliases: ['フォー', 'フォーの麺', '米麺', '米粉麺', 'センレック'],
    pack: [200, '1袋（約200g）'], shelf: 180, price: [258, 200],
  }),
  make('rice_paper', 'ライスペーパー', 'grain', 'staple', 'sheet', {
    aliases: ['生春巻きの皮'],
    pack: [10, '1袋（10枚）'], shelf: 180, price: [198, 10],
  }),
  // 小麦粉の皮。乳・大豆を使う商品もある。冷凍したら、凍ったまま温める。
  make('tortilla', 'トルティーヤ', 'grain', 'staple', 'sheet', {
    aliases: ['トルティア', 'フラワートルティーヤ', 'タコスの皮', 'ブリトーの皮'],
    pack: [8, '1袋（8枚）'], shelf: 7, freeze: true, thaw: 'from_frozen', allergens: ['wheat', 'milk', 'soy'], uncertain: true,
    price: [328, 8],
  }),

  // 調味料・ペースト
  // タイカレー・トムヤムクンのペーストは、えび（シュリンプペースト）・大豆油を使う商品が多い。使うときに買うので常備品にしない。
  make('green_curry_paste', 'グリーンカレーペースト', 'seasoning', 'seasoning', 'g', {
    aliases: ['グリーンカレーの素', 'グリーンカレーのペースト'],
    pack: [50, '1袋（約50g）'], shelf: 180, allergens: ['shrimp', 'soy'], uncertain: true, price: [248, 50],
  }),
  make('tom_yum_paste', 'トムヤムクンペースト', 'seasoning', 'seasoning', 'g', {
    aliases: ['トムヤムペースト', 'トムヤムクンの素'],
    pack: [50, '1袋（約50g）'], shelf: 180, allergens: ['shrimp', 'soy'], uncertain: true, price: [248, 50],
  }),
  // コチュジャンは小麦・大豆を使う商品が多い。
  pantry('gochujang', 'コチュジャン', 'tbsp', { aliases: ['コチジャン', '唐辛子みそ', '唐辛子味噌'], allergens: ['wheat', 'soy'], uncertain: true }),
  pantry('sweet_chili_sauce', 'スイートチリソース', 'tbsp', { aliases: ['スウィートチリソース', 'スイートチリ'], uncertain: true }),
  pantry('red_chili', '赤唐辛子', 'piece', {
    aliases: ['唐辛子', 'とうがらし', '鷹の爪', 'たかのつめ', '赤とうがらし', '輪切り唐辛子'],
  }),
  pantry('chili_powder', 'チリパウダー', 'tsp', {}),
];

// ---------------------------------------------------------------------------
// 韓国（標準の豚キムチ炒め・プルコギ・もやしのナムルも kr。わかめスープは dishes.ts の chu）
// ---------------------------------------------------------------------------

const KOREAN: Dish[] = [
  main('bibimbap', 'ビビンバ', 'ground', 'kr', 25,
    [['ground_mixed', 60], ['bean_sprouts', 50], ['spinach', 40], ['carrot', 0.2], ['egg', 1], ['rice', 100], ['soy_sauce', 1], ['sugar', 0.5], ['garlic', 0.25], ['sesame_oil', 1], ['sesame', 0.5], ['salt', 0.15], ['gochujang', 0.75]],
    ['丼', 'ナムル', '野菜たっぷり']),
  main('kaisen_chijimi', '海鮮チヂミ', 'seafood', 'kr', 25,
    [['seafood_mix', 70], ['chinese_chives', 30], ['flour', 3.5], ['katakuriko', 1], ['egg', 0.5], ['salt', 0.1], ['sesame_oil', 1], ['soy_sauce', 1], ['vinegar', 0.75], ['sugar', 0.25], ['sesame', 0.25]],
    ['粉もの', 'フライパンひとつ']),
  main('dakgalbi', 'タッカルビ', 'chicken', 'kr', 25,
    [['chicken_thigh', 120], ['cabbage', 80], ['onion', 0.25], ['sweet_potato', 40], ['gochujang', 1], ['soy_sauce', 0.75], ['sugar', 0.5], ['sake', 0.5], ['garlic', 0.25], ['ginger', 0.25], ['sesame_oil', 0.75]],
    ['ピリ辛', '甘辛', 'ホットプレート'], { spicy: true }),
  main('japchae', 'チャプチェ', 'beef', 'kr', 25,
    [['beef_komagire', 70], ['harusame', 25], ['carrot', 0.2], ['onion', 0.25], ['green_pepper', 1], ['shiitake', 1], ['soy_sauce', 1.25], ['sugar', 0.75], ['sesame_oil', 1], ['garlic', 0.25], ['sesame', 0.5]],
    ['甘辛', '春雨', '子どもに人気']),
  main('sundubu_jjigae', 'スンドゥブチゲ', 'tofu', 'kr', 20,
    [['tofu_silken', 0.5], ['clam', 40], ['pork_belly', 40], ['kimchi', 40], ['green_onion', 15], ['egg', 1], ['gochujang', 0.75], ['chicken_stock', 0.5], ['soy_sauce', 0.5], ['garlic', 0.25], ['sesame_oil', 0.5]],
    ['ピリ辛', '鍋', '温まる', 'soupy'], { spicy: true }),
  main('samgyeopsal', 'サムギョプサル', 'pork', 'kr', 20,
    [['pork_belly', 130], ['lettuce', 50], ['green_onion', 20], ['garlic', 0.5], ['miso', 0.5], ['gochujang', 0.5], ['sugar', 0.25], ['sesame_oil', 0.75], ['sesame', 0.25], ['salt', 0.1], ['pepper', 0.05]],
    ['焼肉風', 'ホットプレート', '包んで食べる']),
  side('choregi_salad', 'チョレギサラダ', 'kr', 5,
    [['lettuce', 40], ['cucumber', 0.3], ['nori', 0.25], ['sesame_oil', 0.75], ['soy_sauce', 0.25], ['vinegar', 0.25], ['garlic', 0.1], ['salt', 0.1], ['sesame', 0.25]],
    ['5分', '火を使わない']),
  soup('kongnamul_guk', 'コンナムルクク（もやしのスープ）', 'kr', 10,
    [['bean_sprouts', 50], ['scallion', 3], ['garlic', 0.1], ['chicken_stock', 0.5], ['soy_sauce', 0.25], ['salt', 0.05], ['sesame_oil', 0.25], ['sesame', 0.2]],
    ['10分', '節約']),
];

// ---------------------------------------------------------------------------
// イタリアン（ミートソース・アクアパッツァ・鶏肉のトマト煮・ミネストローネは dishes.ts の yo）
// ---------------------------------------------------------------------------

const ITALIAN: Dish[] = [
  main('carbonara', 'カルボナーラ', 'egg', 'it', 20,
    [['pasta', 100], ['bacon', 35], ['egg', 1.5], ['fresh_cream', 40], ['parmesan', 2], ['garlic', 0.25], ['olive_oil', 0.5], ['salt', 0.3], ['pepper', 0.2]],
    ['パスタ', '卵', '濃厚']),
  main('cabbage_bacon_peperoncino', 'キャベツとベーコンのペペロンチーノ', 'pork', 'it', 15,
    [['pasta', 100], ['cabbage', 80], ['bacon', 30], ['garlic', 1], ['red_chili', 0.5], ['olive_oil', 1.5], ['salt', 0.3], ['pepper', 0.1]],
    ['パスタ', 'ピリ辛', '節約'], { spicy: true }),
  main('vongole_bianco', 'ボンゴレビアンコ', 'seafood', 'it', 20,
    [['pasta', 100], ['clam', 150], ['garlic', 0.5], ['olive_oil', 1], ['sake', 1], ['salt', 0.2], ['pepper', 0.1]],
    ['パスタ', 'あさり', '春']),
  main('salmon_spinach_cream_pasta', 'サーモンとほうれん草のクリームパスタ', 'fish', 'it', 20,
    [['pasta', 100], ['salmon', 1], ['spinach', 40], ['onion', 0.15], ['fresh_cream', 50], ['milk', 50], ['butter', 5], ['consomme', 0.5], ['salt', 0.2], ['pepper', 0.1]],
    ['パスタ', 'クリーム', '子どもに人気']),
  main('chicken_diavola', 'チキンのディアボラ風', 'chicken', 'it', 25,
    [['chicken_thigh', 130], ['onion', 0.25], ['garlic', 0.25], ['olive_oil', 0.75], ['soy_sauce', 0.75], ['sugar', 0.25], ['salt', 0.2], ['pepper', 0.2]],
    ['焼くだけ', '玉ねぎソース', '子どもに人気']),
  main('meatball_tomato_stew', 'ミートボールのトマト煮込み', 'ground', 'it', 35,
    [['ground_mixed', 90], ['onion', 0.25], ['panko', 1.5], ['milk', 10], ['egg', 0.25], ['canned_tomato', 100], ['garlic', 0.25], ['olive_oil', 0.5], ['consomme', 0.5], ['parmesan', 0.5], ['sugar', 0.25], ['salt', 0.2], ['pepper', 0.1]],
    ['煮込み', 'トマト', '子どもに人気']),
  main('chicken_mushroom_risotto', '鶏肉ときのこのリゾット', 'chicken', 'it', 30,
    [['rice', 80], ['chicken_thigh', 70], ['shimeji', 40], ['onion', 0.15], ['butter', 5], ['olive_oil', 0.5], ['sake', 0.5], ['consomme', 1], ['parmesan', 1.5], ['salt', 0.1], ['pepper', 0.1]],
    ['リゾット', 'きのこ', 'チーズ']),
  side('caprese', 'カプレーゼ', 'it', 5,
    [['tomato', 0.5], ['mozzarella', 40], ['basil', 1], ['olive_oil', 0.5], ['salt', 0.1], ['pepper', 0.05]],
    ['5分', '火を使わない', '見栄え']),
  side('octopus_carpaccio', 'たこのカルパッチョ', 'it', 10,
    [['octopus', 40], ['onion', 0.1], ['cherry_tomato', 2], ['olive_oil', 0.5], ['lemon', 0.1], ['salt', 0.1], ['pepper', 0.05]],
    ['10分', '火を使わない', 'さっぱり'], { protein: 'seafood', kid: false }),
  soup('stracciatella_soup', 'ストラッチャテッラ（イタリア風かき玉スープ）', 'it', 10,
    [['egg', 0.5], ['onion', 0.1], ['parmesan', 0.5], ['consomme', 0.5], ['olive_oil', 0.25], ['salt', 0.05], ['pepper', 0.05]],
    ['10分', 'やさしい味', 'チーズ'], { protein: 'egg' }),
];

// ---------------------------------------------------------------------------
// エスニック（タイ・ベトナム・インド・インドネシア・フィリピン。キーマカレーは dishes.ts の yo）
// ---------------------------------------------------------------------------

const ETHNIC: Dish[] = [
  main('gapao_rice', 'ガパオライス', 'ground', 'eth', 20,
    [['ground_chicken', 90], ['paprika', 0.25], ['green_pepper', 0.5], ['onion', 0.25], ['basil', 2], ['egg', 1], ['rice', 100], ['garlic', 0.25], ['red_chili', 0.5], ['nampla', 1.5], ['oyster_sauce', 0.5], ['sugar', 0.25], ['salad_oil', 0.75]],
    ['ワンプレート', 'ピリ辛', 'タイ'], { spicy: true }),
  main('green_curry', 'グリーンカレー', 'chicken', 'eth', 25,
    [['chicken_thigh', 100], ['eggplant', 0.5], ['bamboo_shoot', 30], ['paprika', 0.25], ['basil', 1], ['green_curry_paste', 12], ['coconut_milk', 120], ['nampla', 1], ['sugar', 0.25], ['salad_oil', 0.5], ['rice', 100]],
    ['カレー', 'ピリ辛', 'タイ', 'soupy'], { spicy: true }),
  main('khao_man_gai', 'カオマンガイ', 'chicken', 'eth', 50,
    [['chicken_thigh', 120], ['rice', 100], ['ginger', 0.5], ['garlic', 0.25], ['green_onion', 10], ['chicken_stock', 0.5], ['sake', 0.5], ['salt', 0.2], ['soy_sauce', 0.75], ['oyster_sauce', 0.25], ['vinegar', 0.5], ['sugar', 0.25], ['cucumber', 0.25]],
    ['炊飯器', 'タイ', 'しっとり']),
  main('beef_pho', '牛肉のフォー', 'beef', 'eth', 20,
    [['rice_noodle', 70], ['beef_sliced', 70], ['bean_sprouts', 40], ['onion', 0.1], ['scallion', 5], ['cilantro', 3], ['lemon', 0.125], ['chicken_stock', 1], ['nampla', 1.5], ['ginger', 0.25], ['salt', 0.1]],
    ['麺', 'ベトナム', 'さっぱり', 'soupy']),
  main('butter_chicken_curry', 'バターチキンカレー', 'chicken', 'eth', 40,
    [['chicken_thigh', 110], ['plain_yogurt', 30], ['canned_tomato', 80], ['onion', 0.25], ['butter', 10], ['fresh_cream', 40], ['curry_powder', 1.5], ['garlic', 0.25], ['ginger', 0.25], ['sugar', 0.25], ['salt', 0.25], ['rice', 100]],
    ['カレー', 'インド', 'マイルド']),
  main('tandoori_chicken', 'タンドリーチキン', 'chicken', 'eth', 25,
    [['chicken_thigh', 130], ['plain_yogurt', 30], ['curry_powder', 1], ['ketchup', 1], ['garlic', 0.25], ['ginger', 0.25], ['salt', 0.2], ['salad_oil', 0.5], ['lemon', 0.125]],
    ['漬けて焼くだけ', 'インド', 'スパイス']),
  main('nasi_goreng', 'ナシゴレン', 'chicken', 'eth', 20,
    [['rice', 100], ['chicken_thigh', 60], ['onion', 0.25], ['paprika', 0.25], ['egg', 1], ['garlic', 0.25], ['ketchup', 1], ['oyster_sauce', 0.5], ['nampla', 1], ['sweet_chili_sauce', 0.5], ['salad_oil', 0.75], ['salt', 0.1], ['pepper', 0.1], ['cucumber', 0.25]],
    ['ワンプレート', 'インドネシア', '炒めごはん']),
  main('pad_thai', 'パッタイ', 'seafood', 'eth', 25,
    [['rice_noodle', 70], ['shrimp', 60], ['bean_sprouts', 40], ['chinese_chives', 20], ['egg', 1], ['peanuts', 8], ['garlic', 0.25], ['nampla', 1.5], ['sugar', 0.75], ['ketchup', 0.5], ['lemon', 0.25], ['salad_oil', 0.75]],
    ['麺', 'タイ', 'フライパンひとつ']),
  main('pork_adobo', '豚肉のアドボ（フィリピン風煮込み）', 'pork', 'eth', 35,
    [['pork_komagire', 110], ['onion', 0.25], ['garlic', 0.5], ['soy_sauce', 1.5], ['vinegar', 1.5], ['sugar', 0.75], ['pepper', 0.1], ['salad_oil', 0.5]],
    ['煮込み', 'フィリピン', '作り置き']),
  side('nama_harumaki', '生春巻き', 'eth', 20,
    [['rice_paper', 2], ['shrimp', 30], ['lettuce', 20], ['cucumber', 0.25], ['carrot', 0.1], ['harusame', 5], ['sweet_chili_sauce', 1]],
    ['包む', 'ベトナム', '見栄え'], { protein: 'seafood' }),
  side('vietnamese_namasu', 'ベトナム風なます', 'eth', 10,
    [['daikon', 60], ['carrot', 0.2], ['vinegar', 1], ['sugar', 0.75], ['nampla', 0.5], ['salt', 0.1]],
    ['作り置き', 'ベトナム', '火を使わない']),
  side('cucumber_raita', 'きゅうりのライタ', 'eth', 5,
    [['cucumber', 0.5], ['tomato', 0.25], ['plain_yogurt', 50], ['salt', 0.15], ['pepper', 0.05]],
    ['5分', 'インド', '火を使わない']),
  soup('tom_yum_kung', 'トムヤムクン', 'eth', 20,
    [['shrimp', 40], ['shimeji', 20], ['cherry_tomato', 2], ['tom_yum_paste', 10], ['nampla', 0.5], ['lemon', 0.125], ['chicken_stock', 0.5], ['sugar', 0.1], ['cilantro', 2]],
    ['ピリ辛', 'タイ', '酸っぱい'], { protein: 'seafood', spicy: true }),
  soup('tom_kha_gai', 'トムカーガイ（ココナッツミルクのスープ）', 'eth', 20,
    [['chicken_breast', 40], ['shimeji', 20], ['coconut_milk', 80], ['chicken_stock', 0.5], ['nampla', 1], ['lemon', 0.125], ['ginger', 0.25], ['sugar', 0.1]],
    ['タイ', 'まろやか'], { protein: 'chicken' }),
];

// ---------------------------------------------------------------------------
// メキシカン（タコライスは dishes.ts の other）
// ---------------------------------------------------------------------------

const MEXICAN: Dish[] = [
  main('tacos', 'タコス', 'ground', 'mx', 25,
    [['tortilla', 2], ['ground_mixed', 80], ['onion', 0.25], ['garlic', 0.25], ['chili_powder', 0.25], ['ketchup', 1], ['sauce', 0.5], ['salt', 0.15], ['pepper', 0.1], ['salad_oil', 0.25], ['lettuce', 30], ['tomato', 0.5], ['cheese_pizza', 20]],
    ['包む', '子どもに人気', 'ワンプレート']),
  main('chili_con_carne', 'チリコンカン', 'ground', 'mx', 30,
    [['ground_mixed', 70], ['mixed_beans', 50], ['canned_tomato', 100], ['onion', 0.25], ['garlic', 0.25], ['chili_powder', 0.75], ['consomme', 0.5], ['ketchup', 1], ['salt', 0.2], ['pepper', 0.1], ['olive_oil', 0.5]],
    ['煮込み', 'ピリ辛', '作り置き'], { spicy: true }),
  main('chicken_quesadilla', 'チキンとチーズのケサディーヤ', 'chicken', 'mx', 20,
    [['tortilla', 2], ['chicken_thigh', 70], ['cheese_pizza', 40], ['onion', 0.15], ['green_pepper', 0.5], ['salt', 0.15], ['pepper', 0.1], ['salad_oil', 0.5]],
    ['チーズ', 'フライパンひとつ', '子どもに人気']),
  main('beef_burrito', 'ビーフブリトー', 'beef', 'mx', 30,
    [['tortilla', 2], ['beef_komagire', 70], ['rice', 40], ['mixed_beans', 30], ['onion', 0.2], ['lettuce', 20], ['cheese_pizza', 20], ['chili_powder', 0.25], ['ketchup', 1], ['sauce', 0.5], ['salt', 0.15], ['pepper', 0.1], ['salad_oil', 0.5]],
    ['包む', 'ボリューム']),
  side('guacamole', 'ワカモレ', 'mx', 10,
    [['avocado', 0.5], ['tomato', 0.25], ['onion', 0.1], ['lemon', 0.125], ['salt', 0.15], ['pepper', 0.05]],
    ['10分', '火を使わない', 'アボカド']),
  side('mexican_bean_salad', '豆とコーンのメキシカンサラダ', 'mx', 10,
    [['mixed_beans', 30], ['canned_corn', 20], ['tomato', 0.25], ['lettuce', 20], ['onion', 0.05], ['lemon', 0.1], ['olive_oil', 0.5], ['salt', 0.1], ['pepper', 0.05]],
    ['10分', '火を使わない', '豆']),
  soup('mexican_bean_soup', '豆とトマトのメキシカンスープ', 'mx', 20,
    [['mixed_beans', 20], ['canned_tomato', 50], ['onion', 0.1], ['canned_corn', 15], ['consomme', 0.5], ['chili_powder', 0.1], ['olive_oil', 0.25], ['salt', 0.1], ['pepper', 0.05]],
    ['具だくさん', '豆']),
];

/**
 * 世界の料理（韓国 → イタリアン → エスニック → メキシカン。それぞれ主菜 → 副菜 → 汁物）。world の印を付ける
 * （国の料理をまだ選んでいない世帯には出さない。types.ts の Dish.world）。
 */
export const WORLD_DISHES: Dish[] = [...KOREAN, ...ITALIAN, ...ETHNIC, ...MEXICAN].map((d) => ({ ...d, world: true }));
