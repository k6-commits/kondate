import type { Price } from '../engine/types';

// 標準の食材（ingredients.ts）の値段の目安。食材の id → { yen, per }（per は食材の unit での量。例：100g あたり → per: 100）。
// - pack のある食材は 1パック（買う単位）の値段（per = pack の size）。pack のない食材は 100g・100ml あたりか、1個（枚・丁）あたり。
// - 全国の平均くらいの税込みの値段。あくまで目安で、地域・季節・店（特売）で変わる。10円単位に丸めた。
// - 常備品（pantry）は買い物リストに載らないので、なくてよい。
//
// 出典（2026年11月に確認）
// - 総務省統計局「小売物価統計調査（動向編）」 https://www.stat.go.jp/data/kouri/doukou/3.html
//   - 第1表「主要品目の都市別小売価格」2026年9月分（2026-10-23 公表）
//     https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040515971&fileKind=0
//   - 第2表「主要品目の東京都区部小売価格」2025年10月〜2026年10月分（2026-10-30 公表）
//     https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040521455&fileKind=0（生鮮食品）
//     https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040521456&fileKind=0（そのほかの食料）
//   - 調査品目と基本銘柄（2026年9月） https://www.stat.go.jp/data/kouri/doukou/zuhyou/202609.xlsx
// - 農林水産省「食品価格動向調査（食肉・鶏卵）」2026年11月分（11/9〜11/11 調査）
//   https://www.maff.go.jp/j/zyukyu/anpo/kouri/k_gyuniku/index.html
//
// 決め方（各行のコメントに、もとにした値を書いた）
// - 小売物価：第1表の 2026年9月の 47都道府県庁所在市（東京は区部）の単純平均を、1パックの量に直した。
//   野菜・きのこ・生の魚は季節で大きく動くので、東京都区部の12か月（2025年10月〜2026年9月）の平均と 2026年9月の比を掛けて、
//   1年の平均くらいに直した（コメントの値は直したあとの値）。
// - 農水省：食品価格動向調査の全国平均（国産の豚ロースは、いまの小売物価の調査品目にないため）。
// - 見積もり：小売物価にない食材。近い品目の値段と、スーパーのふだんの値段から決めた。
// - 量の換算：切り身1切れ 約90g、玉ねぎ1個 約200g、にんじん1本・じゃがいも1個 約150g、きゅうり1本 約100g、トマト1個 約150g、
//   食パン1斤 約340g、豆腐1丁 約350g（地域で 300〜400g）。

export const PRICES: Record<string, Price> = {
  // ---- 肉 ----
  chicken_thigh: { yen: 480, per: 300 }, // 小売物価 鶏肉（もも）159円/100g（農水省 2026年11月は156円）
  chicken_breast: { yen: 300, per: 300 }, // 見積もり 約100円/100g（もも肉の6割くらい）
  chicken_tender: { yen: 260, per: 200 }, // 見積もり 約130円/100g
  chicken_drumette: { yen: 420, per: 400 }, // 見積もり 約105円/100g
  chicken_wing: { yen: 380, per: 300 }, // 見積もり 約125円/100g
  ground_chicken: { yen: 310, per: 250 }, // 見積もり 約125円/100g
  pork_komagire: { yen: 530, per: 300 }, // 見積もり 約175円/100g（国産ロースの6割くらい）
  pork_belly: { yen: 620, per: 200 }, // 小売物価 豚肉（国産品，バラ）308円/100g
  pork_loin_sliced: { yen: 730, per: 250 }, // 農水省 豚肉（ロース）292円/100g
  pork_loin_cutlet: { yen: 700, per: 240 }, // 農水省 豚肉（ロース）292円/100g
  ground_pork: { yen: 440, per: 250 }, // 見積もり 約175円/100g
  ground_mixed: { yen: 540, per: 300 }, // 見積もり 約180円/100g
  beef_komagire: { yen: 600, per: 200 }, // 見積もり 約300円/100g（輸入牛が中心）
  beef_sliced: { yen: 1000, per: 200 }, // 見積もり 約500円/100g（小売物価の輸入牛 443円・国産牛ロース 927円の間）
  bacon: { yen: 190, per: 70 }, // 小売物価 ベーコン 273円/100g
  ham: { yen: 140, per: 4 }, // 小売物価 ハム 229円/100g（4枚 約60g）
  sausage: { yen: 200, per: 6 }, // 小売物価 ソーセージ 196円/100g（6本 約100g）

  // ---- 魚介・缶詰・練り物（生の魚は1年の平均に直した値） ----
  salmon: { yen: 400, per: 2 }, // 見積もり 約220円/100g（2切れ 約180g）
  mackerel: { yen: 310, per: 2 }, // 小売物価 さば（切り身）171円/100g
  yellowtail: { yen: 740, per: 2 }, // 小売物価 ぶり（切り身）411円/100g
  cod: { yen: 380, per: 2 }, // 見積もり 約210円/100g
  saury: { yen: 260, per: 1 }, // 小売物価 さんま 198円/100g（1尾 約130g）
  horse_mackerel: { yen: 390, per: 2 }, // 小売物価 あじ（丸）163円/100g（1尾 約120g）
  swordfish: { yen: 400, per: 2 }, // 見積もり 約220円/100g
  flounder: { yen: 400, per: 2 }, // 見積もり 約220円/100g
  sawara: { yen: 480, per: 2 }, // 見積もり 約270円/100g
  hokke: { yen: 500, per: 1 }, // 見積もり（1枚 約300g）
  tuna_sashimi: { yen: 780, per: 150 }, // 小売物価 まぐろ（刺身用さく）523円/100g
  shrimp: { yen: 520, per: 150 }, // 小売物価 えび（輸入・冷凍）348円/100g
  squid: { yen: 640, per: 250 }, // 小売物価 いか（丸）255円/100g
  clam: { yen: 380, per: 200 }, // 小売物価 あさり 190円/100g
  octopus: { yen: 500, per: 100 }, // 小売物価 たこ 502円/100g
  shirasu: { yen: 360, per: 50 }, // 小売物価 しらす干し 716円/100g
  tuna_can: { yen: 170, per: 1 }, // 小売物価 魚介缶詰（ツナ 70g）168円/缶
  mackerel_can: { yen: 280, per: 1 }, // 見積もり
  chikuwa: { yen: 130, per: 4 }, // 小売物価 ちくわ 119円/100g（4本 約110g）
  kamaboko: { yen: 230, per: 1 }, // 小売物価 かまぼこ 208円/100g（1本 約110g）
  crab_stick: { yen: 150, per: 8 }, // 見積もり

  // ---- 卵・乳製品 ----
  egg: { yen: 320, per: 10 }, // 小売物価 鶏卵 320円/パック（農水省 2026年11月は311円）
  milk: { yen: 270, per: 1000 }, // 小売物価 牛乳 272円/本
  cheese_pizza: { yen: 480, per: 200 }, // 見積もり 約240円/100g
  cheese_slice: { yen: 300, per: 7 }, // 小売物価 チーズ（スライス）266円/100g（7枚 約112g）

  // ---- 豆腐・大豆製品・こんにゃく・漬物 ----
  tofu_firm: { yen: 110, per: 1 }, // 小売物価 豆腐（木綿）306円/kg（1丁 約350g）
  tofu_silken: { yen: 110, per: 1 }, // 木綿と同じ
  abura_age: { yen: 110, per: 2 }, // 小売物価 油揚げ 1,714円/kg（2枚 約65g）
  atsuage: { yen: 140, per: 2 }, // 見積もり
  natto: { yen: 120, per: 3 }, // 小売物価 納豆 124円/パック
  konnyaku: { yen: 110, per: 250 }, // 小売物価 こんにゃく 457円/kg
  shirataki: { yen: 100, per: 200 }, // 見積もり
  kimchi: { yen: 340, per: 300 }, // 小売物価 キムチ 1,129円/kg

  // ---- 乾物・缶詰 ----
  kiriboshi: { yen: 200, per: 40 }, // 見積もり
  hijiki: { yen: 250, per: 30 }, // 見積もり（店で多い輸入品は30g 200〜300円くらい。小売物価は国産品だけで 2,285円/100g＝30g 約690円）
  harusame: { yen: 180, per: 100 }, // 見積もり
  koya_dofu: { yen: 300, per: 5 }, // 見積もり
  fu: { yen: 150, per: 30 }, // 見積もり
  canned_tomato: { yen: 150, per: 400 }, // 見積もり
  canned_corn: { yen: 170, per: 120 }, // 小売物価 野菜缶詰（スイートコーン）1,393円/kg

  // ---- 野菜・きのこ・果物（小売物価は1年の平均に直した値） ----
  onion: { yen: 270, per: 3 }, // 小売物価 たまねぎ 458円/kg（3個 約600g）
  new_onion: { yen: 200, per: 2 }, // 見積もり
  carrot: { yen: 220, per: 3 }, // 小売物価 にんじん 496円/kg（3本 約450g）
  potato: { yen: 330, per: 4 }, // 小売物価 じゃがいも 552円/kg（4個 約600g）
  cabbage: { yen: 100, per: 500 }, // 小売物価 キャベツ 209円/kg
  chinese_cabbage: { yen: 120, per: 500 }, // 小売物価 はくさい 239円/kg
  daikon: { yen: 110, per: 500 }, // 小売物価 だいこん 220円/kg
  turnip: { yen: 200, per: 3 }, // 見積もり
  spinach: { yen: 220, per: 200 }, // 小売物価 ほうれんそう 1,111円/kg
  komatsuna: { yen: 150, per: 200 }, // 見積もり
  bok_choy: { yen: 150, per: 200 }, // 見積もり
  shungiku: { yen: 200, per: 150 }, // 見積もり
  mizuna: { yen: 150, per: 200 }, // 見積もり
  lettuce: { yen: 150, per: 300 }, // 小売物価 レタス 484円/kg
  bean_sprouts: { yen: 40, per: 200 }, // 小売物価 もやし 206円/kg
  pea_shoots: { yen: 100, per: 100 }, // 見積もり
  green_onion: { yen: 90, per: 100 }, // 小売物価 ねぎ 860円/kg
  scallion: { yen: 130, per: 100 }, // 見積もり
  chinese_chives: { yen: 130, per: 100 }, // 見積もり
  cucumber: { yen: 240, per: 3 }, // 小売物価 きゅうり 792円/kg（3本 約300g）
  tomato: { yen: 400, per: 3 }, // 小売物価 トマト 896円/kg（3個 約450g）
  cherry_tomato: { yen: 300, per: 12 }, // 見積もり
  eggplant: { yen: 200, per: 3 }, // 小売物価 なす 838円/kg（3本 約240g）
  green_pepper: { yen: 190, per: 5 }, // 小売物価 ピーマン 1,186円/kg（5個 約160g）
  paprika: { yen: 170, per: 1 }, // 見積もり
  bitter_melon: { yen: 200, per: 1 }, // 見積もり
  zucchini: { yen: 160, per: 1 }, // 見積もり
  okra: { yen: 170, per: 8 }, // 見積もり
  green_beans: { yen: 380, per: 100 }, // 小売物価 さやいんげん 3,764円/kg
  snap_peas: { yen: 220, per: 100 }, // 見積もり
  asparagus: { yen: 240, per: 100 }, // 小売物価 アスパラガス 2,411円/kg
  broccoli: { yen: 190, per: 250 }, // 小売物価 ブロッコリー 743円/kg
  pumpkin: { yen: 250, per: 400 }, // 小売物価 かぼちゃ 615円/kg
  corn: { yen: 180, per: 1 }, // 見積もり
  edamame: { yen: 340, per: 200 }, // 小売物価 えだまめ 1,716円/kg
  sweet_potato: { yen: 220, per: 300 }, // 小売物価 さつまいも 734円/kg
  taro: { yen: 420, per: 400 }, // 小売物価 さといも 1,039円/kg
  nagaimo: { yen: 260, per: 300 }, // 小売物価 ながいも 865円/kg
  burdock: { yen: 150, per: 150 }, // 小売物価 ごぼう 1,022円/kg
  lotus_root: { yen: 260, per: 200 }, // 小売物価 れんこん 1,286円/kg
  bamboo_shoot: { yen: 250, per: 200 }, // 見積もり
  shiso: { yen: 100, per: 10 }, // 見積もり
  mitsuba: { yen: 120, per: 40 }, // 見積もり
  myoga: { yen: 180, per: 3 }, // 見積もり
  nanohana: { yen: 200, per: 150 }, // 見積もり
  avocado: { yen: 180, per: 1 }, // 小売物価 アボカド 1,054円/kg（1個 約170g）
  lemon: { yen: 130, per: 1 }, // 見積もり
  shimeji: { yen: 90, per: 100 }, // 小売物価 しめじ 893円/kg
  enoki: { yen: 140, per: 200 }, // 小売物価 えのきたけ 675円/kg
  shiitake: { yen: 170, per: 6 }, // 小売物価 生しいたけ 1,725円/kg（6個 約100g）
  maitake: { yen: 130, per: 100 }, // 見積もり
  eringi: { yen: 120, per: 100 }, // 見積もり

  // ---- 主食（麺・パン・皮） ----
  udon: { yen: 220, per: 3 }, // 小売物価 ゆでうどん 370円/kg（3玉 約600g。地域差が大きい）
  chuka_men: { yen: 300, per: 3 }, // 見積もり
  yakisoba_men: { yen: 230, per: 3 }, // 小売物価 中華麺（蒸し焼そば 3人前）511円/kg
  pasta: { yen: 340, per: 500 }, // 小売物価 スパゲッティ 672円/kg
  somen: { yen: 390, per: 300 }, // 小売物価 そうめん（手延べ 300g）389円
  soba: { yen: 200, per: 200 }, // 見積もり
  bread: { yen: 190, per: 6 }, // 小売物価 食パン 559円/kg（1斤 約340g）
  gyoza_skin: { yen: 130, per: 24 }, // 見積もり
  harumaki_skin: { yen: 180, per: 10 }, // 見積もり

  // ---- ルウ・粉 ----
  curry_roux: { yen: 320, per: 200 }, // 小売物価 カレールウ 319円/箱
  stew_roux: { yen: 320, per: 180 }, // 見積もり（カレールウと同じくらい）
  okonomiyaki_flour: { yen: 260, per: 400 }, // 見積もり

  // ---- 冷凍食品・惣菜・レトルト ----
  frozen_gyoza: { yen: 270, per: 12 }, // 小売物価 冷凍ぎょうざ 95円/100g（12個 約285g）
  frozen_udon: { yen: 320, per: 5 }, // 見積もり
  frozen_karaage: { yen: 500, per: 300 }, // 見積もり
  frozen_mixed_veg: { yen: 250, per: 300 }, // 見積もり
  deli_karaage: { yen: 770, per: 300 }, // 小売物価 からあげ 257円/100g
  deli_potato_salad: { yen: 360, per: 200 }, // 小売物価 サラダ（ポテトサラダ）179円/100g
  deli_croquette: { yen: 390, per: 4 }, // 小売物価 コロッケ 130円/100g（4個 約300g）
  retort_curry: { yen: 150, per: 1 }, // 小売物価 調理カレー 149円/箱
  pasta_sauce: { yen: 250, per: 2 }, // 小売物価 パスタソース 97円/100g（2人前 約260g）
};
