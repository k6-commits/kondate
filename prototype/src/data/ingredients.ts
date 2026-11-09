import type { AllergenId, Aisle, Ingredient, IngredientKind, Unit } from '../engine/types';

// 食材マスタ。
// - allergens には派生原材料も入れる（例：醤油 → 小麦・大豆）。迷ったら多めに入れる。
// - uncertain は、銘柄で原材料が変わる加工品（ルウ、市販のたれ、冷凍食品、惣菜、練り物、ハム・ソーセージなど）。
//   わかっている代表的なアレルゲンは、uncertain の食材にも入れる。
// - shelfLifeDays は冷蔵で買ってから調理までの目安（控えめ）。冷凍食品・乾物・缶詰は保存できる日数の目安。
// - pantry（常備品）は買い物リストに載せず「家にあるか確認」に出すので、pack を持たない。

interface Spec {
  aliases?: string[];
  /** [size, label]。size は unit での量。 */
  pack?: [number, string];
  shelf: number;
  freeze?: boolean;
  allergens?: AllergenId[];
  uncertain?: boolean;
  pantry?: boolean;
  season?: number[];
  subs?: string[];
}

function make(id: string, name: string, kind: IngredientKind, aisle: Aisle, unit: Unit, s: Spec): Ingredient {
  const item: Ingredient = {
    id,
    name,
    aliases: s.aliases ?? [],
    kind,
    aisle,
    unit,
    shelfLifeDays: s.shelf,
    freezable: s.freeze ?? false,
    pantry: s.pantry ?? false,
    allergens: s.allergens ?? [],
    uncertain: s.uncertain ?? false,
  };
  if (s.pack) item.pack = { size: s.pack[0], label: s.pack[1] };
  if (s.season) item.seasonMonths = s.season;
  if (s.subs) item.substitutes = s.subs;
  return item;
}

/** from 月から to 月まで（年をまたいでよい）。例：months(12, 2) → [12, 1, 2] */
function months(from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === to) return out;
  }
}

// 精肉は g で量り、冷凍できる。
const meat = (id: string, name: string, kind: IngredientKind, s: Spec) =>
  make(id, name, kind, 'meat', 'g', { freeze: true, ...s });

// ---------------------------------------------------------------------------
// 肉
// ---------------------------------------------------------------------------

const MEAT: Ingredient[] = [
  meat('chicken_thigh', '鶏もも肉', 'chicken', {
    aliases: ['鶏もも', 'とりもも', 'もも肉', '鶏モモ', 'とりモモ', '鶏肉', 'とり肉', 'チキン'],
    pack: [300, '1パック（約300g）'], shelf: 2, allergens: ['chicken'], subs: ['chicken_breast'],
  }),
  meat('chicken_breast', '鶏むね肉', 'chicken', {
    aliases: ['鶏むね', 'むね肉', '胸肉', 'とりむね', '鶏胸肉', '鶏ムネ', 'とりムネ', 'ムネ肉'],
    pack: [300, '1パック（約300g）'], shelf: 2, allergens: ['chicken'], subs: ['chicken_thigh', 'chicken_tender'],
  }),
  meat('chicken_tender', '鶏ささみ', 'chicken', {
    aliases: ['ささみ', 'ササミ', 'ささ身', 'とりささみ'],
    pack: [200, '1パック（4本・約200g）'], shelf: 2, allergens: ['chicken'], subs: ['chicken_breast'],
  }),
  meat('chicken_drumette', '鶏手羽元', 'chicken', {
    aliases: ['手羽元', 'てばもと', '手羽'],
    pack: [400, '1パック（6〜8本・約400g）'], shelf: 2, allergens: ['chicken'], subs: ['chicken_wing', 'chicken_thigh'],
  }),
  meat('chicken_wing', '鶏手羽先', 'chicken', {
    aliases: ['手羽先', 'てばさき'],
    pack: [300, '1パック（6本・約300g）'], shelf: 2, allergens: ['chicken'], subs: ['chicken_drumette'],
  }),
  meat('ground_chicken', '鶏ひき肉', 'ground', {
    aliases: ['鶏ひき', '鶏ミンチ', 'とりひき', '鶏挽き肉', 'とりミンチ'],
    pack: [250, '1パック（約250g）'], shelf: 1, allergens: ['chicken'], subs: ['ground_pork'],
  }),
  meat('pork_komagire', '豚こま切れ肉', 'pork', {
    aliases: ['豚こま', '豚小間', '豚こま切れ', 'こま切れ', '豚切り落とし', '豚の切り落とし', '豚肉', 'ぶた肉'],
    pack: [300, '1パック（約300g）'], shelf: 2, allergens: ['pork'], subs: ['pork_belly', 'pork_loin_sliced'],
  }),
  meat('pork_belly', '豚バラ薄切り肉', 'pork', {
    aliases: ['豚バラ', '豚ばら', '豚バラ肉', 'バラ肉', '豚三枚肉', '豚バラ薄切り'],
    pack: [200, '1パック（約200g）'], shelf: 2, allergens: ['pork'], subs: ['pork_komagire'],
  }),
  meat('pork_loin_sliced', '豚ロース薄切り肉', 'pork', {
    aliases: ['豚ロース', 'ロース薄切り', '生姜焼き用', 'しょうが焼き用', '豚しゃぶ用', 'しゃぶしゃぶ用'],
    pack: [250, '1パック（約250g）'], shelf: 3, allergens: ['pork'], subs: ['pork_komagire', 'pork_belly'],
  }),
  meat('pork_loin_cutlet', '豚ロース厚切り肉', 'pork', {
    aliases: ['とんかつ用', 'トンカツ用', '豚ロース厚切り', 'ポークソテー用', '厚切り肉'],
    pack: [240, '1パック（2枚・約240g）'], shelf: 3, allergens: ['pork'], subs: ['pork_loin_sliced'],
  }),
  meat('ground_pork', '豚ひき肉', 'ground', {
    aliases: ['豚ひき', '豚ミンチ', 'ぶたひき', '豚挽き肉'],
    pack: [250, '1パック（約250g）'], shelf: 1, allergens: ['pork'], subs: ['ground_mixed', 'ground_chicken'],
  }),
  meat('ground_mixed', '合いびき肉', 'ground', {
    aliases: ['合いびき', '合挽き', '合い挽き肉', 'あいびき', '合挽肉', 'ひき肉', 'ミンチ', '挽き肉'],
    pack: [300, '1パック（約300g）'], shelf: 1, allergens: ['beef', 'pork'], subs: ['ground_pork'],
  }),
  meat('beef_komagire', '牛こま切れ肉', 'beef', {
    aliases: ['牛こま', '牛小間', '牛切り落とし', '牛の切り落とし', '牛肉', 'ぎゅう肉'],
    pack: [200, '1パック（約200g）'], shelf: 2, allergens: ['beef'], subs: ['beef_sliced', 'pork_komagire'],
  }),
  meat('beef_sliced', '牛薄切り肉', 'beef', {
    aliases: ['牛薄切り', '牛肩ロース', 'すき焼き用', '牛ロース薄切り', '牛もも薄切り'],
    pack: [200, '1パック（約200g）'], shelf: 2, allergens: ['beef'], subs: ['beef_komagire'],
  }),
  // 加工肉は銘柄で原材料が違う（乳・卵・大豆を使う商品が多い）。
  make('bacon', 'ベーコン', 'processed', 'meat', 'g', {
    aliases: ['べーこん', 'ハーフベーコン'],
    pack: [70, '1パック（約70g）'], shelf: 7, freeze: true, allergens: ['pork', 'soy'], uncertain: true,
  }),
  make('ham', 'ハム', 'processed', 'meat', 'sheet', {
    aliases: ['ロースハム', 'はむ'],
    pack: [4, '1パック（4枚）'], shelf: 5, freeze: true, allergens: ['pork', 'egg', 'milk', 'soy'], uncertain: true,
  }),
  make('sausage', 'ウインナー', 'processed', 'meat', 'piece', {
    aliases: ['ウィンナー', 'ソーセージ', 'ウインナーソーセージ', 'ウィンナーソーセージ'],
    pack: [6, '1袋（約6本）'], shelf: 7, freeze: true, allergens: ['pork', 'milk', 'soy'], uncertain: true,
  }),
];

// 魚の切り身・刺身は当日〜翌日。冷凍できる（刺身用は除く）。
const fish = (id: string, name: string, kind: IngredientKind, unit: Unit, s: Spec) =>
  make(id, name, kind, 'fish', unit, { freeze: true, ...s });

// ---------------------------------------------------------------------------
// 魚介・缶詰・練り物
// ---------------------------------------------------------------------------

const SEAFOOD: Ingredient[] = [
  fish('salmon', '生鮭', 'fish', 'piece', {
    aliases: ['鮭', 'さけ', 'しゃけ', 'サケ', 'シャケ', '秋鮭', '甘塩鮭', '鮭の切り身', 'サーモン'],
    pack: [2, '1パック（2切れ）'], shelf: 1, allergens: ['salmon'], season: months(9, 11), subs: ['cod', 'swordfish'],
  }),
  fish('mackerel', 'さば', 'fish', 'piece', {
    aliases: ['鯖', 'サバ', 'さばの切り身', '真さば', '塩さば'],
    pack: [2, '1パック（2切れ）'], shelf: 1, allergens: ['mackerel'], season: months(10, 2), subs: ['saury', 'horse_mackerel', 'salmon'],
  }),
  fish('yellowtail', 'ぶり', 'fish', 'piece', {
    aliases: ['鰤', 'ブリ', '寒ぶり', 'はまち', 'ハマチ', 'ぶりの切り身'],
    pack: [2, '1パック（2切れ）'], shelf: 1, season: months(12, 2), subs: ['swordfish', 'salmon'],
  }),
  fish('cod', '生たら', 'fish', 'piece', {
    aliases: ['たら', '鱈', 'タラ', '真だら', '生だら', 'たらの切り身'],
    pack: [2, '1パック（2切れ）'], shelf: 1, season: months(12, 2), subs: ['salmon', 'flounder'],
  }),
  fish('saury', 'さんま', 'fish', 'piece', {
    aliases: ['秋刀魚', 'サンマ'],
    pack: [1, '1尾'], shelf: 1, season: [9, 10], subs: ['mackerel', 'horse_mackerel'],
  }),
  fish('horse_mackerel', 'あじ', 'fish', 'piece', {
    aliases: ['鯵', 'アジ', '真あじ', 'あじの開き', 'フライ用あじ'],
    pack: [2, '1パック（2尾）'], shelf: 1, season: [5, 6, 7], subs: ['mackerel', 'saury'],
  }),
  fish('swordfish', 'めかじき', 'fish', 'piece', {
    aliases: ['かじき', 'メカジキ', 'カジキ', 'めかじきの切り身'],
    pack: [2, '1パック（2切れ）'], shelf: 1, subs: ['yellowtail', 'salmon'],
  }),
  fish('flounder', 'かれい', 'fish', 'piece', {
    aliases: ['鰈', 'カレイ', '子持ちかれい', 'かれいの切り身'],
    pack: [2, '1パック（2切れ）'], shelf: 1, subs: ['cod'],
  }),
  fish('sawara', 'さわら', 'fish', 'piece', {
    aliases: ['鰆', 'サワラ', 'さわらの切り身'],
    pack: [2, '1パック（2切れ）'], shelf: 1, season: [3, 4, 5], subs: ['salmon', 'yellowtail'],
  }),
  fish('hokke', 'ほっけの開き', 'fish', 'piece', {
    aliases: ['ほっけ', 'ホッケ', 'ほっけの干物'],
    pack: [1, '1枚'], shelf: 2, subs: ['mackerel'],
  }),
  fish('tuna_sashimi', 'まぐろ（刺身用）', 'fish', 'g', {
    aliases: ['まぐろ', 'マグロ', '鮪', 'まぐろの刺身', '刺身'],
    pack: [150, '1さく（約150g）'], shelf: 1, freeze: false,
  }),
  fish('shrimp', 'えび', 'seafood', 'g', {
    aliases: ['エビ', '海老', 'むきえび', 'むき海老', 'ブラックタイガー', 'バナメイえび'],
    pack: [150, '1パック（約150g）'], shelf: 1, allergens: ['shrimp'], subs: ['squid'],
  }),
  fish('squid', 'いか', 'seafood', 'g', {
    aliases: ['イカ', '烏賊', 'するめいか', 'スルメイカ', 'いかの胴'],
    pack: [250, '1杯（約250g）'], shelf: 1, allergens: ['squid'], subs: ['shrimp'],
  }),
  fish('clam', 'あさり', 'seafood', 'g', {
    aliases: ['アサリ', '浅蜊', 'あさりの砂抜き'],
    pack: [200, '1パック（約200g）'], shelf: 1, season: [3, 4, 5],
  }),
  fish('octopus', 'ゆでだこ', 'seafood', 'g', {
    aliases: ['たこ', 'タコ', '蛸', 'ゆでダコ'],
    pack: [100, '1パック（約100g）'], shelf: 2,
  }),
  // しらすは、えび・かにが混ざる漁法でとることがあるため、えび・かにを入れておく。
  fish('shirasu', 'しらす', 'fish', 'g', {
    aliases: ['しらす干し', 'ちりめん', 'ちりめんじゃこ', 'シラス', 'じゃこ'],
    pack: [50, '1パック（約50g）'], shelf: 2, allergens: ['shrimp', 'crab'],
  }),
  // 缶詰（乾物・缶詰の売り場）
  make('tuna_can', 'ツナ缶', 'fish', 'dry', 'piece', {
    aliases: ['ツナ', 'シーチキン', 'ツナ缶詰', 'まぐろ缶'],
    pack: [1, '1缶（約70g）'], shelf: 180, allergens: ['soy'], uncertain: true,
  }),
  make('mackerel_can', 'さば水煮缶', 'fish', 'dry', 'piece', {
    aliases: ['さば缶', 'サバ缶', '鯖缶', 'さばの水煮'],
    pack: [1, '1缶（約190g）'], shelf: 180, allergens: ['mackerel'],
  }),
  // 練り物（豆腐・練り物の売り場）。卵白・小麦を使う商品が多い。
  make('chikuwa', 'ちくわ', 'processed', 'tofu', 'piece', {
    aliases: ['竹輪', 'チクワ', '焼きちくわ'],
    pack: [4, '1袋（4本）'], shelf: 5, freeze: true, allergens: ['egg', 'wheat'], uncertain: true,
  }),
  make('kamaboko', 'かまぼこ', 'processed', 'tofu', 'piece', {
    aliases: ['蒲鉾', 'カマボコ', '板かまぼこ'],
    pack: [1, '1本'], shelf: 7, allergens: ['egg', 'wheat'], uncertain: true,
  }),
  make('crab_stick', 'かにかま', 'processed', 'tofu', 'piece', {
    aliases: ['カニカマ', 'かに風味かまぼこ', 'カニかま'],
    pack: [8, '1パック（約8本）'], shelf: 5, allergens: ['crab', 'egg', 'wheat', 'soy'], uncertain: true,
  }),
];

// ---------------------------------------------------------------------------
// 卵・乳製品
// ---------------------------------------------------------------------------

const EGG_DAIRY: Ingredient[] = [
  make('egg', '卵', 'egg', 'dairy_egg', 'piece', {
    aliases: ['たまご', '玉子', 'タマゴ', '鶏卵', '生卵'],
    pack: [10, '1パック（10個）'], shelf: 14, allergens: ['egg'],
  }),
  make('milk', '牛乳', 'dairy', 'dairy_egg', 'ml', {
    aliases: ['ミルク', 'ぎゅうにゅう', '牛にゅう'],
    pack: [1000, '1本（1L）'], shelf: 5, allergens: ['milk'],
  }),
  make('butter', 'バター', 'dairy', 'dairy_egg', 'g', {
    aliases: ['ばたー', '有塩バター'],
    shelf: 30, freeze: true, pantry: true, allergens: ['milk'],
  }),
  make('cheese_pizza', 'ピザ用チーズ', 'dairy', 'dairy_egg', 'g', {
    aliases: ['チーズ', 'とろけるチーズ', 'シュレッドチーズ', 'ミックスチーズ', 'ピザチーズ'],
    pack: [200, '1袋（約200g）'], shelf: 7, freeze: true, allergens: ['milk'], subs: ['cheese_slice'],
  }),
  make('cheese_slice', 'スライスチーズ', 'dairy', 'dairy_egg', 'sheet', {
    aliases: ['とろけるスライスチーズ', 'チーズスライス'],
    pack: [7, '1パック（7枚）'], shelf: 14, allergens: ['milk'], subs: ['cheese_pizza'],
  }),
  make('parmesan', '粉チーズ', 'dairy', 'dairy_egg', 'tbsp', {
    aliases: ['パルメザンチーズ', 'パルメザン'],
    shelf: 60, pantry: true, allergens: ['milk'],
  }),
];

// ---------------------------------------------------------------------------
// 豆腐・大豆製品・こんにゃく・漬物（豆腐・練り物の売り場）
// ---------------------------------------------------------------------------

const TOFU_ETC: Ingredient[] = [
  make('tofu_firm', '木綿豆腐', 'tofu', 'tofu', 'block', {
    aliases: ['豆腐', 'とうふ', 'もめん', '木綿', 'もめん豆腐', 'トウフ'],
    pack: [1, '1丁'], shelf: 5, allergens: ['soy'], subs: ['tofu_silken'],
  }),
  make('tofu_silken', '絹ごし豆腐', 'tofu', 'tofu', 'block', {
    aliases: ['絹豆腐', 'きぬごし', '絹ごし', 'きぬ豆腐'],
    pack: [1, '1丁'], shelf: 5, allergens: ['soy'], subs: ['tofu_firm'],
  }),
  make('abura_age', '油揚げ', 'tofu', 'tofu', 'sheet', {
    aliases: ['あぶらあげ', '油あげ', 'うす揚げ', 'お揚げ'],
    pack: [2, '1袋（2枚）'], shelf: 4, freeze: true, allergens: ['soy'],
  }),
  make('atsuage', '厚揚げ', 'tofu', 'tofu', 'sheet', {
    aliases: ['生揚げ', 'あつあげ', '厚あげ'],
    pack: [2, '1パック（2枚）'], shelf: 4, freeze: true, allergens: ['soy'], subs: ['tofu_firm'],
  }),
  // 付属のたれは醤油（小麦・大豆）を使うことが多い。
  make('natto', '納豆', 'tofu', 'tofu', 'piece', {
    aliases: ['なっとう', 'ナットウ', 'ひきわり納豆', 'ひきわり'],
    pack: [3, '1パック（3個入り）'], shelf: 7, freeze: true, allergens: ['soy', 'wheat'],
  }),
  make('konnyaku', 'こんにゃく', 'other', 'tofu', 'g', {
    aliases: ['蒟蒻', 'コンニャク', '板こんにゃく'],
    pack: [250, '1枚（約250g）'], shelf: 14,
  }),
  make('shirataki', 'しらたき', 'other', 'tofu', 'g', {
    aliases: ['白滝', '糸こんにゃく', 'シラタキ'],
    pack: [200, '1袋（約200g）'], shelf: 14,
  }),
  // キムチは、えびの塩辛・りんご・ごまなどを使う商品が多い。
  make('kimchi', '白菜キムチ', 'processed', 'tofu', 'g', {
    aliases: ['キムチ', 'きむち'],
    pack: [300, '1パック（約300g）'], shelf: 14, allergens: ['shrimp', 'apple', 'sesame', 'soy'], uncertain: true,
  }),
];

// ---------------------------------------------------------------------------
// 乾物・缶詰・海藻
// ---------------------------------------------------------------------------

const DRY: Ingredient[] = [
  make('kiriboshi', '切り干し大根', 'vegetable', 'dry', 'g', {
    aliases: ['切干大根', 'きりぼし', '切り干し'],
    pack: [40, '1袋（約40g）'], shelf: 60,
  }),
  make('hijiki', '芽ひじき（乾燥）', 'seaweed', 'dry', 'g', {
    aliases: ['ひじき', 'ヒジキ', '芽ひじき', '長ひじき'],
    pack: [30, '1袋（約30g）'], shelf: 90,
  }),
  make('harusame', '春雨', 'other', 'dry', 'g', {
    aliases: ['はるさめ', 'ハルサメ', '緑豆春雨'],
    pack: [100, '1袋（約100g）'], shelf: 180,
  }),
  make('koya_dofu', '高野豆腐', 'tofu', 'dry', 'piece', {
    aliases: ['凍り豆腐', 'こうや豆腐', '高野どうふ'],
    pack: [5, '1袋（5個）'], shelf: 90, allergens: ['soy'],
  }),
  make('fu', 'お麩', 'other', 'dry', 'g', {
    aliases: ['麩', '焼き麩', '車麩', 'おふ'],
    pack: [30, '1袋（約30g）'], shelf: 90, allergens: ['wheat'],
  }),
  make('canned_tomato', 'カットトマト缶', 'vegetable', 'dry', 'g', {
    aliases: ['トマト缶', 'ホールトマト', 'トマトの水煮', 'カットトマト'],
    pack: [400, '1缶（400g）'], shelf: 180,
  }),
  make('canned_corn', 'コーン缶', 'vegetable', 'dry', 'g', {
    aliases: ['コーン', 'ホールコーン', 'スイートコーン', 'クリームコーン'],
    pack: [120, '1缶（約120g）'], shelf: 180,
  }),
  make('dried_wakame', 'カットわかめ（乾燥）', 'seaweed', 'dry', 'g', {
    aliases: ['わかめ', 'ワカメ', 'カットわかめ', '乾燥わかめ'],
    shelf: 180, pantry: true,
  }),
  make('nori', '焼きのり', 'seaweed', 'dry', 'sheet', {
    aliases: ['のり', '海苔', 'ノリ', 'きざみのり', '焼き海苔'],
    shelf: 180, pantry: true,
  }),
  make('sesame', 'いりごま', 'seasoning', 'dry', 'tbsp', {
    aliases: ['ごま', '胡麻', 'ゴマ', '白ごま', 'すりごま', '黒ごま'],
    shelf: 180, pantry: true, allergens: ['sesame'],
  }),
  make('katsuobushi', 'かつお節', 'seasoning', 'dry', 'g', {
    aliases: ['かつおぶし', '鰹節', 'おかか', '削り節'],
    shelf: 180, pantry: true,
  }),
];

const veg = (id: string, name: string, unit: Unit, s: Spec) => make(id, name, 'vegetable', 'produce', unit, s);
// きのこは旬が秋。冷凍できる。
const mushroom = (id: string, name: string, unit: Unit, s: Spec) =>
  make(id, name, 'mushroom', 'produce', unit, { freeze: true, season: months(9, 11), ...s });

// ---------------------------------------------------------------------------
// 野菜・きのこ・果物
// ---------------------------------------------------------------------------

const PRODUCE: Ingredient[] = [
  veg('onion', '玉ねぎ', 'piece', {
    aliases: ['たまねぎ', 'タマネギ', '玉葱', 'オニオン'],
    pack: [3, '1袋（3個）'], shelf: 30, subs: ['new_onion'],
  }),
  veg('new_onion', '新玉ねぎ', 'piece', {
    aliases: ['新たまねぎ', '新タマネギ'],
    pack: [2, '1袋（2個）'], shelf: 7, season: months(3, 5), subs: ['onion'],
  }),
  veg('carrot', 'にんじん', 'piece', { aliases: ['人参', 'ニンジン', 'キャロット'], pack: [3, '1袋（3本）'], shelf: 14 }),
  veg('potato', 'じゃがいも', 'piece', {
    aliases: ['ジャガイモ', 'じゃが芋', '馬鈴薯', 'ポテト', 'メークイン', '男爵いも'],
    pack: [4, '1袋（4個）'], shelf: 30,
  }),
  veg('cabbage', 'キャベツ', 'g', { aliases: ['きゃべつ', '春キャベツ'], pack: [500, '1/2玉（約500g）'], shelf: 7 }),
  veg('chinese_cabbage', '白菜', 'g', {
    aliases: ['はくさい', 'ハクサイ'], pack: [500, '1/4株（約500g）'], shelf: 7, season: months(11, 2),
  }),
  veg('daikon', '大根', 'g', {
    aliases: ['だいこん', 'ダイコン'], pack: [500, '1/2本（約500g）'], shelf: 10, season: months(11, 2),
  }),
  veg('turnip', 'かぶ', 'piece', { aliases: ['蕪', 'カブ', 'かぶら'], pack: [3, '1束（3個）'], shelf: 5, season: [10, 11, 12] }),
  veg('spinach', 'ほうれん草', 'g', {
    aliases: ['ほうれんそう', 'ホウレンソウ', 'ほうれん'],
    pack: [200, '1袋（約200g）'], shelf: 3, freeze: true, season: months(11, 2), subs: ['komatsuna'],
  }),
  veg('komatsuna', '小松菜', 'g', {
    aliases: ['こまつな', 'コマツナ'],
    pack: [200, '1袋（約200g）'], shelf: 3, freeze: true, season: months(12, 2), subs: ['spinach', 'bok_choy'],
  }),
  veg('bok_choy', 'チンゲン菜', 'g', {
    aliases: ['ちんげん菜', 'チンゲンサイ', '青梗菜'], pack: [200, '1袋（2株・約200g）'], shelf: 3, freeze: true, subs: ['komatsuna'],
  }),
  veg('shungiku', '春菊', 'g', {
    aliases: ['しゅんぎく', 'シュンギク', '菊菜'], pack: [150, '1袋（約150g）'], shelf: 3, freeze: true, season: months(11, 2),
  }),
  veg('mizuna', '水菜', 'g', { aliases: ['みずな', 'ミズナ'], pack: [200, '1袋（約200g）'], shelf: 3, season: months(11, 2) }),
  veg('lettuce', 'レタス', 'g', { aliases: ['れたす', 'サラダ菜'], pack: [300, '1玉（約300g）'], shelf: 4 }),
  veg('bean_sprouts', 'もやし', 'g', { aliases: ['モヤシ', '緑豆もやし'], pack: [200, '1袋（約200g）'], shelf: 2, freeze: true }),
  veg('pea_shoots', '豆苗', 'g', { aliases: ['とうみょう', 'トウミョウ'], pack: [100, '1袋（約100g）'], shelf: 3 }),
  veg('green_onion', '長ねぎ', 'g', {
    aliases: ['ねぎ', 'ネギ', '白ねぎ', '長ネギ', '葱', '根深ねぎ'],
    pack: [100, '1本（約100g）'], shelf: 7, freeze: true, season: months(11, 2), subs: ['scallion'],
  }),
  veg('scallion', '小ねぎ', 'g', {
    aliases: ['青ねぎ', '万能ねぎ', '細ねぎ', '小ネギ', '九条ねぎ', '青ネギ'],
    pack: [100, '1袋（約100g）'], shelf: 5, freeze: true, subs: ['green_onion'],
  }),
  veg('chinese_chives', 'にら', 'g', { aliases: ['ニラ', '韮'], pack: [100, '1束（約100g）'], shelf: 3, freeze: true }),
  veg('cucumber', 'きゅうり', 'piece', { aliases: ['キュウリ', '胡瓜'], pack: [3, '1袋（3本）'], shelf: 5, season: months(6, 8) }),
  veg('tomato', 'トマト', 'piece', {
    aliases: ['とまと', '完熟トマト'], pack: [3, '1袋（3個）'], shelf: 5, season: months(6, 8), subs: ['cherry_tomato'],
  }),
  veg('cherry_tomato', 'ミニトマト', 'piece', {
    aliases: ['プチトマト', 'みにとまと'], pack: [12, '1パック（約12個）'], shelf: 5, season: months(6, 8), subs: ['tomato'],
  }),
  veg('eggplant', 'なす', 'piece', { aliases: ['茄子', 'ナス', 'なすび'], pack: [3, '1袋（3本）'], shelf: 4, season: months(6, 9) }),
  veg('green_pepper', 'ピーマン', 'piece', {
    aliases: ['ぴーまん'], pack: [5, '1袋（5個）'], shelf: 7, season: months(6, 9), subs: ['paprika'],
  }),
  veg('paprika', 'パプリカ', 'piece', { aliases: ['赤パプリカ', '黄パプリカ'], pack: [1, '1個'], shelf: 7, subs: ['green_pepper'] }),
  veg('bitter_melon', 'ゴーヤ', 'piece', { aliases: ['にがうり', 'ゴーヤー', '苦瓜'], pack: [1, '1本'], shelf: 5, season: months(6, 8) }),
  veg('zucchini', 'ズッキーニ', 'piece', { aliases: ['ずっきーに'], pack: [1, '1本'], shelf: 5, season: months(6, 8) }),
  veg('okra', 'オクラ', 'piece', { aliases: ['おくら'], pack: [8, '1袋（約8本）'], shelf: 4, freeze: true, season: months(6, 9) }),
  veg('green_beans', 'さやいんげん', 'g', {
    aliases: ['いんげん', 'インゲン', 'さやインゲン'], pack: [100, '1袋（約100g）'], shelf: 4, freeze: true, season: months(6, 9),
  }),
  veg('snap_peas', 'スナップえんどう', 'g', { aliases: ['スナップエンドウ', 'スナップ'], pack: [100, '1袋（約100g）'], shelf: 4, season: [4, 5, 6] }),
  veg('asparagus', 'アスパラガス', 'g', { aliases: ['アスパラ', 'あすぱら'], pack: [100, '1束（約100g）'], shelf: 3, season: [4, 5, 6] }),
  veg('broccoli', 'ブロッコリー', 'g', {
    aliases: ['ぶろっこりー'], pack: [250, '1株（約250g）'], shelf: 4, freeze: true, season: months(11, 3),
  }),
  veg('pumpkin', 'かぼちゃ', 'g', {
    aliases: ['カボチャ', '南瓜'], pack: [400, '1/4個（約400g）'], shelf: 5, freeze: true, season: months(7, 10),
  }),
  veg('corn', 'とうもろこし', 'piece', {
    aliases: ['トウモロコシ', 'とうきび', '生のとうもろこし'], pack: [1, '1本'], shelf: 2, freeze: true, season: [6, 7, 8],
  }),
  veg('edamame', '枝豆', 'g', {
    aliases: ['えだまめ', 'エダマメ'], pack: [200, '1袋（約200g）'], shelf: 2, freeze: true, season: [7, 8, 9], allergens: ['soy'],
  }),
  veg('sweet_potato', 'さつまいも', 'g', {
    aliases: ['サツマイモ', 'さつま芋', '薩摩芋'], pack: [300, '1本（約300g）'], shelf: 14, season: months(9, 11),
  }),
  veg('taro', '里芋', 'g', { aliases: ['さといも', 'サトイモ', '里いも'], pack: [400, '1袋（約400g）'], shelf: 10, season: months(9, 12) }),
  veg('nagaimo', '長いも', 'g', {
    aliases: ['長芋', 'ながいも', '山芋', 'やまいも', 'とろろ'], pack: [300, '1/2本（約300g）'], shelf: 7, allergens: ['yam'],
  }),
  veg('burdock', 'ごぼう', 'g', { aliases: ['牛蒡', 'ゴボウ'], pack: [150, '1本（約150g）'], shelf: 7, season: months(11, 2) }),
  veg('lotus_root', 'れんこん', 'g', { aliases: ['蓮根', 'レンコン'], pack: [200, '1節（約200g）'], shelf: 5, season: months(11, 2) }),
  veg('bamboo_shoot', 'たけのこ（水煮）', 'g', {
    aliases: ['たけのこ', '筍', 'タケノコ', 'ゆでたけのこ'], pack: [200, '1パック（約200g）'], shelf: 3, season: months(3, 5),
  }),
  veg('shiso', '大葉', 'sheet', { aliases: ['しそ', '青じそ', 'シソ', '青紫蘇'], pack: [10, '1袋（10枚）'], shelf: 4, season: months(6, 9) }),
  veg('mitsuba', '三つ葉', 'g', { aliases: ['みつば', 'ミツバ'], pack: [40, '1袋（約40g）'], shelf: 3 }),
  veg('myoga', 'みょうが', 'piece', { aliases: ['茗荷', 'ミョウガ'], pack: [3, '1パック（3個）'], shelf: 5, season: months(6, 9) }),
  veg('nanohana', '菜の花', 'g', { aliases: ['なのはな', '菜花'], pack: [150, '1束（約150g）'], shelf: 2, season: [2, 3] }),
  // にんにく・しょうがは常備（チューブでもよい）。
  veg('garlic', 'にんにく', 'tsp', {
    aliases: ['ニンニク', 'にんにくチューブ', 'おろしにんにく', 'ガーリック'], shelf: 30, pantry: true,
  }),
  veg('ginger', 'しょうが', 'tsp', {
    aliases: ['生姜', 'ショウガ', 'しょうがチューブ', 'おろし生姜', 'おろししょうが'], shelf: 30, pantry: true,
  }),
  make('avocado', 'アボカド', 'fruit', 'produce', 'piece', { aliases: ['あぼかど'], pack: [1, '1個'], shelf: 4 }),
  make('lemon', 'レモン', 'fruit', 'produce', 'piece', { aliases: ['れもん', 'レモン汁'], pack: [1, '1個'], shelf: 14 }),

  mushroom('shimeji', 'しめじ', 'g', {
    aliases: ['ぶなしめじ', 'シメジ', 'きのこ'], pack: [100, '1パック（約100g）'], shelf: 4, subs: ['maitake', 'eringi'],
  }),
  mushroom('enoki', 'えのき', 'g', { aliases: ['えのきだけ', 'エノキ', 'えのき茸'], pack: [200, '1袋（約200g）'], shelf: 4, subs: ['shimeji'] }),
  mushroom('shiitake', '生しいたけ', 'piece', {
    aliases: ['しいたけ', '椎茸', 'シイタケ'], pack: [6, '1パック（約6個）'], shelf: 4, subs: ['shimeji'],
  }),
  mushroom('maitake', 'まいたけ', 'g', { aliases: ['舞茸', 'マイタケ'], pack: [100, '1パック（約100g）'], shelf: 4, subs: ['shimeji'] }),
  mushroom('eringi', 'エリンギ', 'g', { aliases: ['えりんぎ'], pack: [100, '1パック（約100g）'], shelf: 5, subs: ['shimeji'] }),
];

// ---------------------------------------------------------------------------
// 主食（米・麺・パン・皮）
// ---------------------------------------------------------------------------

const STAPLES: Ingredient[] = [
  make('rice', '米', 'grain', 'staple', 'g', {
    aliases: ['ごはん', 'ご飯', 'お米', '白米', 'こめ', 'ライス'], shelf: 60, pantry: true,
  }),
  make('udon', 'ゆでうどん', 'noodle', 'staple', 'piece', {
    aliases: ['うどん', 'うどん玉', 'ゆで麺'], pack: [3, '1袋（3玉）'], shelf: 5, freeze: true, allergens: ['wheat'], subs: ['frozen_udon'],
  }),
  // 生の中華麺は卵を使う商品があり、スープの原材料も銘柄で違う。
  make('chuka_men', '中華麺（生・スープ付き）', 'noodle', 'staple', 'piece', {
    aliases: ['中華麺', 'ラーメン', '生ラーメン', '中華そば', '冷やし中華の麺'],
    pack: [3, '1袋（3人前）'], shelf: 5, freeze: true, allergens: ['wheat', 'soy', 'sesame'], uncertain: true,
  }),
  make('yakisoba_men', '焼きそば麺（ソース付き）', 'noodle', 'staple', 'piece', {
    aliases: ['焼きそば麺', '焼そば麺', 'やきそば麺', '蒸し麺', '蒸し中華麺'],
    pack: [3, '1袋（3玉）'], shelf: 5, freeze: true, allergens: ['wheat', 'soy', 'apple'], uncertain: true,
  }),
  make('pasta', 'スパゲッティ', 'noodle', 'staple', 'g', {
    aliases: ['パスタ', 'スパゲティ', 'スパゲッティー', 'スパゲティー'], pack: [500, '1袋（500g）'], shelf: 180, allergens: ['wheat'],
  }),
  make('somen', 'そうめん', 'noodle', 'staple', 'g', {
    aliases: ['素麺', 'ソーメン', 'ひやむぎ'], pack: [300, '1袋（約300g）'], shelf: 180, allergens: ['wheat'],
  }),
  make('soba', 'そば（乾麺）', 'noodle', 'staple', 'g', {
    aliases: ['そば', '蕎麦', 'ソバ', '日本そば', 'ざるそば'], pack: [200, '1袋（約200g）'], shelf: 180, allergens: ['buckwheat', 'wheat'],
  }),
  // 食パンは乳・大豆を使うことが多く、卵を使う商品もある。
  make('bread', '食パン', 'grain', 'staple', 'sheet', {
    aliases: ['パン', 'しょくぱん', 'トースト', '6枚切り'],
    pack: [6, '1斤（6枚切り）'], shelf: 3, freeze: true, allergens: ['wheat', 'milk', 'soy'], uncertain: true,
  }),
  make('gyoza_skin', 'ぎょうざの皮', 'grain', 'staple', 'sheet', {
    aliases: ['餃子の皮', 'ギョーザの皮', 'ぎょうざのかわ'], pack: [24, '1袋（24枚）'], shelf: 5, freeze: true, allergens: ['wheat'],
  }),
  make('harumaki_skin', '春巻きの皮', 'grain', 'staple', 'sheet', {
    aliases: ['春巻の皮', 'はるまきの皮'], pack: [10, '1袋（10枚）'], shelf: 5, freeze: true, allergens: ['wheat'],
  }),
];

// 常備の調味料・油・粉類。買い物リストには載せない。
const pantry = (id: string, name: string, unit: Unit, s: Partial<Spec>) =>
  make(id, name, 'seasoning', 'seasoning', unit, { shelf: 180, pantry: true, ...s });

// ---------------------------------------------------------------------------
// 調味料・粉・ルウ
// ---------------------------------------------------------------------------

const SEASONINGS: Ingredient[] = [
  pantry('soy_sauce', '醤油', 'tbsp', { aliases: ['しょうゆ', 'しょう油', '濃口醤油', 'こいくち', 'ショウユ', '醬油'], allergens: ['wheat', 'soy'] }),
  pantry('miso', '味噌', 'tbsp', { aliases: ['みそ', 'ミソ', '合わせ味噌', '白みそ', '赤みそ', '西京味噌'], allergens: ['soy'] }),
  pantry('sugar', '砂糖', 'tbsp', { aliases: ['さとう', '上白糖', 'きび砂糖'] }),
  pantry('salt', '塩', 'tsp', { aliases: ['しお', '食塩', 'あら塩'] }),
  pantry('pepper', 'こしょう', 'tsp', { aliases: ['コショウ', '胡椒', '黒こしょう', 'ブラックペッパー'] }),
  pantry('mirin', 'みりん', 'tbsp', { aliases: ['本みりん', '味醂', 'ミリン'] }),
  pantry('sake', '料理酒', 'tbsp', { aliases: ['酒', '日本酒', 'お酒', '清酒'] }),
  // 穀物酢は小麦を使う商品が多い（米酢なら小麦なし）。安全側で小麦を入れる。
  pantry('vinegar', '酢', 'tbsp', { aliases: ['お酢', '穀物酢', '米酢'], allergens: ['wheat'] }),
  // サラダ油は大豆油を使う商品が多い。
  pantry('salad_oil', 'サラダ油', 'tbsp', { aliases: ['油', 'サラダオイル', 'キャノーラ油', '植物油', '揚げ油'], allergens: ['soy'] }),
  pantry('sesame_oil', 'ごま油', 'tbsp', { aliases: ['ゴマ油', '胡麻油', 'ごまあぶら'], allergens: ['sesame'] }),
  pantry('olive_oil', 'オリーブオイル', 'tbsp', { aliases: ['オリーブ油', 'エキストラバージンオリーブオイル'] }),
  pantry('mayonnaise', 'マヨネーズ', 'tbsp', { aliases: ['マヨ', 'まよねーず'], allergens: ['egg', 'soy', 'apple'], shelf: 30 }),
  pantry('ketchup', 'ケチャップ', 'tbsp', { aliases: ['トマトケチャップ', 'けちゃっぷ'] }),
  pantry('sauce', 'ソース（中濃）', 'tbsp', {
    aliases: ['ソース', '中濃ソース', 'とんかつソース', 'ウスターソース', 'お好みソース'], allergens: ['wheat', 'soy', 'apple'], uncertain: true,
  }),
  pantry('ponzu', 'ポン酢', 'tbsp', { aliases: ['ぽん酢', 'ポンズ', 'ポン酢しょうゆ'], allergens: ['wheat', 'soy'], uncertain: true }),
  pantry('mentsuyu', 'めんつゆ', 'tbsp', { aliases: ['麺つゆ', 'そばつゆ', 'つゆの素'], allergens: ['wheat', 'soy', 'mackerel'], uncertain: true }),
  // だし汁は、かつお節・昆布でとったものを想定。顆粒だしは銘柄で原材料が違う。
  pantry('dashi', 'だし汁', 'ml', { aliases: ['だし', '出汁', 'かつおだし', '昆布だし', 'お出汁'] }),
  pantry('chicken_stock', '鶏ガラスープの素', 'tsp', {
    aliases: ['鶏がらスープの素', '鶏ガラ', 'ガラスープ', '中華スープの素', '鶏がらスープ'],
    allergens: ['chicken', 'pork', 'wheat', 'milk', 'soy', 'sesame'], uncertain: true,
  }),
  pantry('consomme', 'コンソメ', 'tsp', {
    aliases: ['固形コンソメ', '顆粒コンソメ', 'ブイヨン', 'コンソメスープの素'],
    allergens: ['wheat', 'milk', 'soy', 'chicken', 'pork', 'beef'], uncertain: true,
  }),
  pantry('oyster_sauce', 'オイスターソース', 'tbsp', { aliases: ['かき油', '牡蠣油', 'オイスター'], allergens: ['wheat', 'soy'], uncertain: true }),
  pantry('doubanjiang', '豆板醤', 'tsp', { aliases: ['トウバンジャン', 'とうばんじゃん'], allergens: ['soy', 'wheat'], uncertain: true }),
  pantry('tianmianjiang', '甜麺醤', 'tbsp', { aliases: ['テンメンジャン', 'てんめんじゃん'], allergens: ['wheat', 'soy'], uncertain: true }),
  pantry('yakiniku_tare', '焼き肉のたれ', 'tbsp', {
    aliases: ['焼肉のたれ', '焼き肉のタレ', '焼肉のタレ'], allergens: ['wheat', 'soy', 'sesame', 'apple'], uncertain: true,
  }),
  pantry('dressing', 'ドレッシング', 'tbsp', {
    aliases: ['ごまドレッシング', '和風ドレッシング', 'フレンチドレッシング', 'ごまドレ'],
    allergens: ['wheat', 'soy', 'sesame', 'egg', 'apple'], uncertain: true,
  }),
  pantry('nampla', 'ナンプラー', 'tsp', { aliases: ['魚醤', 'ナンプラ'] }),
  pantry('curry_powder', 'カレー粉', 'tsp', { aliases: ['カレーパウダー'] }),
  pantry('flour', '小麦粉', 'tbsp', { aliases: ['薄力粉', 'メリケン粉', 'こむぎこ', '強力粉'], allergens: ['wheat'] }),
  pantry('katakuriko', '片栗粉', 'tbsp', { aliases: ['かたくり粉', 'でんぷん', '片栗'] }),
  pantry('panko', 'パン粉', 'tbsp', { aliases: ['ぱん粉', '生パン粉', '乾燥パン粉'], allergens: ['wheat', 'soy'], uncertain: true }),
  // ルウ・粉は使うときに買うことが多いので、常備品にしない。
  make('curry_roux', 'カレールウ', 'seasoning', 'seasoning', 'g', {
    aliases: ['カレールー', 'カレーのルウ', 'カレーの素'],
    pack: [200, '1箱（約10皿分）'], shelf: 180, uncertain: true,
    allergens: ['wheat', 'milk', 'soy', 'pork', 'beef', 'chicken', 'apple', 'banana', 'gelatin'],
  }),
  make('stew_roux', 'シチューのルウ（クリーム）', 'seasoning', 'seasoning', 'g', {
    aliases: ['シチューのルー', 'クリームシチューのルウ', 'シチューの素', 'シチュールウ'],
    pack: [180, '1箱（約8皿分）'], shelf: 180, uncertain: true, allergens: ['wheat', 'milk', 'soy', 'chicken', 'pork'],
  }),
  make('okonomiyaki_flour', 'お好み焼き粉', 'grain', 'seasoning', 'g', {
    aliases: ['お好み焼きの粉', 'お好み焼き用粉', 'お好み焼きミックス'],
    pack: [400, '1袋（約400g）'], shelf: 180, uncertain: true, allergens: ['wheat', 'soy', 'yam', 'mackerel'],
  }),
];

// ---------------------------------------------------------------------------
// 冷凍食品・惣菜・レトルト（銘柄・店で原材料が違うので、すべて要確認）
// ---------------------------------------------------------------------------

const FROZEN_DELI: Ingredient[] = [
  make('frozen_gyoza', '冷凍ぎょうざ', 'processed', 'frozen', 'piece', {
    aliases: ['冷凍餃子', '冷凍ギョーザ', '冷凍のぎょうざ'],
    pack: [12, '1袋（12個）'], shelf: 60, freeze: true, uncertain: true,
    allergens: ['wheat', 'pork', 'chicken', 'soy', 'sesame', 'gelatin'],
  }),
  make('frozen_udon', '冷凍うどん', 'noodle', 'frozen', 'piece', {
    aliases: ['冷凍讃岐うどん', '冷凍のうどん'],
    pack: [5, '1袋（5玉）'], shelf: 60, freeze: true, allergens: ['wheat'], uncertain: true, subs: ['udon'],
  }),
  make('frozen_karaage', '冷凍唐揚げ', 'processed', 'frozen', 'g', {
    aliases: ['冷凍からあげ', '冷凍のから揚げ', '冷凍から揚げ'],
    pack: [300, '1袋（約300g）'], shelf: 60, freeze: true, allergens: ['chicken', 'wheat', 'soy', 'egg'], uncertain: true,
    subs: ['deli_karaage'],
  }),
  make('frozen_mixed_veg', '冷凍ミックスベジタブル', 'vegetable', 'frozen', 'g', {
    aliases: ['ミックスベジタブル', 'ミックスベジ'], pack: [300, '1袋（約300g）'], shelf: 60, freeze: true,
  }),
  make('deli_karaage', '唐揚げ（惣菜）', 'processed', 'deli', 'g', {
    aliases: ['惣菜の唐揚げ', '惣菜のからあげ', 'お惣菜の唐揚げ'],
    pack: [300, '1パック（約300g）'], shelf: 1, freeze: true, allergens: ['chicken', 'wheat', 'soy', 'egg'], uncertain: true,
    subs: ['frozen_karaage'],
  }),
  make('deli_potato_salad', 'ポテトサラダ（惣菜）', 'processed', 'deli', 'g', {
    aliases: ['惣菜のポテトサラダ', 'ポテサラ', 'お惣菜のポテトサラダ'],
    pack: [200, '1パック（約200g）'], shelf: 1, allergens: ['egg', 'soy', 'apple', 'pork'], uncertain: true,
  }),
  make('deli_croquette', 'コロッケ（惣菜）', 'processed', 'deli', 'piece', {
    aliases: ['惣菜のコロッケ', 'コロッケ', 'お惣菜のコロッケ'],
    pack: [4, '1パック（4個）'], shelf: 1, freeze: true, allergens: ['wheat', 'milk', 'egg', 'soy', 'beef', 'pork'], uncertain: true,
  }),
  make('retort_curry', 'レトルトカレー', 'processed', 'dry', 'piece', {
    aliases: ['レトルトのカレー', 'カレーのレトルト'],
    pack: [1, '1箱（1人前）'], shelf: 180, uncertain: true, allergens: ['wheat', 'milk', 'soy', 'pork', 'beef', 'chicken', 'apple'],
  }),
  make('pasta_sauce', 'パスタソース（レトルト）', 'processed', 'dry', 'piece', {
    aliases: ['パスタソース', 'ミートソース', 'レトルトのパスタソース'],
    pack: [2, '1箱（2人前）'], shelf: 180, uncertain: true, allergens: ['wheat', 'milk', 'soy', 'beef', 'pork', 'chicken'],
  }),
];

/** 食材マスタ（肉 → 魚介 → 卵・乳 → 大豆製品 → 乾物 → 野菜 → 主食 → 調味料 → 冷凍・惣菜）。 */
export const INGREDIENTS: Ingredient[] = [
  ...MEAT,
  ...SEAFOOD,
  ...EGG_DAIRY,
  ...TOFU_ETC,
  ...DRY,
  ...PRODUCE,
  ...STAPLES,
  ...SEASONINGS,
  ...FROZEN_DELI,
];
