// きめとく（仮）プロトタイプの型定義。
// エンジン（src/engine）、データ（src/data）、UI（src/ui）、サーバー（server）がすべてこの型を共有する。
// ここを変えるときは DESIGN.md も直すこと。

export type ISODate = string; // 'YYYY-MM-DD'（タイムゾーンなしの暦日）
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = 日曜

// ---------------------------------------------------------------------------
// マスタデータ
// ---------------------------------------------------------------------------

/** アレルゲン。特定原材料（表示義務）と、特定原材料に準ずるもの（表示推奨）。 */
export type AllergenId =
  // 特定原材料（表示義務）
  | 'shrimp' | 'crab' | 'walnut' | 'wheat' | 'buckwheat' | 'egg' | 'milk' | 'peanut' | 'cashew'
  // 特定原材料に準ずるもの（表示推奨）
  | 'almond' | 'abalone' | 'squid' | 'salmon_roe' | 'orange' | 'kiwi' | 'beef' | 'sesame' | 'salmon'
  | 'mackerel' | 'soy' | 'chicken' | 'banana' | 'pork' | 'macadamia' | 'peach' | 'yam' | 'apple' | 'gelatin';

export interface AllergenInfo {
  id: AllergenId;
  name: string; // 表示名（例：'卵'）
  mandatory: boolean; // 表示義務があるか
  note?: string; // 例：カシューナッツの経過措置
}

/** 売り場。買い物リストはこの順に並べる（AISLE_ORDER）。 */
export type Aisle =
  | 'produce' // 野菜・果物
  | 'meat' // 肉
  | 'fish' // 魚
  | 'dairy_egg' // 卵・乳製品
  | 'tofu' // 豆腐・練り物・大豆製品
  | 'dry' // 乾物・缶詰
  | 'seasoning' // 調味料
  | 'frozen' // 冷凍食品
  | 'deli' // 惣菜
  | 'staple' // 主食（米・パン・麺）
  | 'other';

export const AISLE_ORDER: Aisle[] = [
  'produce', 'meat', 'fish', 'dairy_egg', 'tofu', 'dry', 'seasoning', 'frozen', 'deli', 'staple', 'other',
];

export const AISLE_LABEL: Record<Aisle, string> = {
  produce: '野菜・果物', meat: '肉', fish: '魚', dairy_egg: '卵・乳製品', tofu: '豆腐・大豆製品',
  dry: '乾物・缶詰', seasoning: '調味料', frozen: '冷凍食品', deli: '惣菜', staple: '主食', other: 'その他',
};

/** レシピ上の分量の単位。DishIngredient.amount はこの単位で書く。 */
export type Unit = 'g' | 'ml' | 'piece' | 'sheet' | 'pack' | 'bag' | 'block' | 'tbsp' | 'tsp';

export const UNIT_LABEL: Record<Unit, string> = {
  g: 'g', ml: 'ml', piece: '個', sheet: '枚', pack: 'パック', bag: '袋', block: '丁', tbsp: '大さじ', tsp: '小さじ',
};

export type IngredientKind =
  | 'chicken' | 'pork' | 'beef' | 'ground' | 'fish' | 'seafood' | 'egg' | 'tofu'
  | 'vegetable' | 'mushroom' | 'seaweed' | 'dairy' | 'grain' | 'noodle' | 'seasoning'
  | 'processed' | 'fruit' | 'other';

export interface Ingredient {
  id: string; // 'chicken_thigh'
  name: string; // '鶏もも肉'
  aliases: string[]; // 話し言葉の照合用（'鶏もも', 'とりもも', 'もも肉'）
  kind: IngredientKind;
  aisle: Aisle;
  unit: Unit;
  /** 買うときの単位。size は unit での量。未設定なら量をそのまま表示する。 */
  pack?: { size: number; label: string }; // 例：{ size: 300, label: '1パック（約300g）' }
  /** 冷蔵で、買ってから調理までに置いてよい日数（控えめに）。 */
  shelfLifeDays: number;
  freezable: boolean;
  /** 常備品（調味料など）。買い物リストには載せず「家にあるか確認」に出す。 */
  pantry: boolean;
  /** 含まれるアレルゲン。派生原材料も含める（例：醤油 → wheat, soy）。 */
  allergens: AllergenId[];
  /** 銘柄で原材料が変わる加工品（ルウ、ドレッシング、冷凍食品など）。除外の判定は「要確認」になる。 */
  uncertain: boolean;
  seasonMonths?: number[]; // 旬（1〜12）
  /** 特売などで置き換えられる食材の id（例：鶏もも ↔ 鶏むね）。 */
  substitutes?: string[];
  /**
   * 総称（「鶏肉」「豚肉」「きのこ」など）。特売・在庫の書き込み（「鶏肉が安い」）で、この食材を代表として当てるときだけ使う。
   * 除外の判定・検索には使わない（総称で1つの食材だけを除外してしまわないように）。
   */
  genericAliases?: string[];
  /**
   * 冷凍した物の戻し方。'fridge'（既定）：前日の夜に冷蔵室へ移して解凍。'from_frozen'：凍ったまま加熱する（貝・冷凍野菜・きのこ・惣菜など）。
   */
  thaw?: 'fridge' | 'from_frozen';
}

export type DishRole = 'main' | 'side' | 'soup' | 'raku'; // raku = ラク日用（冷凍食品・惣菜・5分メニュー）
export type Protein = 'chicken' | 'pork' | 'beef' | 'ground' | 'fish' | 'seafood' | 'egg' | 'tofu' | 'none';
export type Genre = 'wa' | 'yo' | 'chu' | 'other'; // 和・洋・中・その他

export const PROTEIN_LABEL: Record<Protein, string> = {
  chicken: '鶏肉', pork: '豚肉', beef: '牛肉', ground: 'ひき肉', fish: '魚', seafood: '魚介', egg: '卵', tofu: '豆腐・大豆', none: 'なし',
};
export const GENRE_LABEL: Record<Genre, string> = { wa: '和', yo: '洋', chu: '中', other: 'その他' };

export interface DishIngredient {
  ingredientId: string;
  amount: number; // 大人1人分。単位は Ingredient.unit
}

export interface Dish {
  id: string;
  name: string;
  role: DishRole;
  protein: Protein;
  genre: Genre;
  minutes: number; // 調理時間の目安
  ingredients: DishIngredient[];
  seasonMonths?: number[]; // 設定があれば、その月だけ提案する
  kidFriendly: boolean;
  spicy: boolean;
  tags: string[];
  sourceUrl?: string; // 作り方の出典（任意）
  custom?: boolean; // 家庭が自由入力した定番（材料がわからないことがある）
}

export interface Catalog {
  dishes: Dish[];
  ingredients: Ingredient[];
  allergens: AllergenInfo[];
  dishById: Map<string, Dish>;
  ingredientById: Map<string, Ingredient>;
}

// ---------------------------------------------------------------------------
// 世帯
// ---------------------------------------------------------------------------

export type AgeBand = 'adult' | 'teen' | 'child' | 'preschool' | 'infant';

export const AGE_BAND_LABEL: Record<AgeBand, string> = {
  adult: '大人', teen: '中高生', child: '小学生', preschool: '幼児（1〜5歳）', infant: '乳児（1歳未満）',
};

/** 1人分に対する量の重み。乳児は献立の「食べる人」に含めない（0）。 */
export const SERVING_WEIGHT: Record<AgeBand, number> = {
  adult: 1, teen: 1, child: 0.7, preschool: 0.5, infant: 0,
};

export type Exclusion =
  | { type: 'allergen'; id: AllergenId; severe?: boolean } // severe = アナフィラキシーの経験など（MVPの対象外）
  | { type: 'ingredient'; id: string } // 食材マスタの id
  | { type: 'text'; text: string }; // マスタにない語。食材名・別名に含まれていれば除外する

export interface Member {
  id: string;
  nickname: string;
  ageBand: AgeBand;
  role?: 'parent' | 'partner' | 'child' | 'other'; // 「夫」「妻」などの照合に使う
  exclusions: Exclusion[];
}

export interface FavoriteDish {
  dishId: string;
  note?: string;
  overrides?: DishIngredient[]; // うちの材料メモ（設定があれば dish.ingredients の代わりに使う）
}

export interface HouseholdSettings {
  plan: 'free' | 'paid'; // 有料版：担当者への配信（プロトタイプでは配信メッセージの表示で再現）
  dinnerWeekdays: Weekday[]; // 献立を作る曜日（既定は月〜金）
  shoppingWeekdays: Weekday[]; // 買い物の曜日（複数可）
  rakuPerWeek: number; // ラク日の数（既定1）
  newPerWeek: number; // 新しい料理の数（既定1、最大2）
  sidePolicy: 'side_or_soup' | 'side_and_soup' | 'main_only';
  maxMinutes: Partial<Record<Weekday, number>>; // 曜日ごとの調理時間の上限（任意）
  allowUncertainWithExclusions: boolean; // 除外食材のある世帯で「要確認」の料理を出すか（既定 false）
}

export interface Household {
  id: string;
  members: Member[];
  favorites: FavoriteDish[];
  customDishes: Dish[]; // マスタにない定番
  settings: HouseholdSettings;
  createdAt: ISODate;
}

// ---------------------------------------------------------------------------
// 献立・記録・在庫・買い物
// ---------------------------------------------------------------------------

export type MealStatus = 'planned' | 'cooked' | 'skipped' | 'unconfirmed';

export interface PlannedMeal {
  date: ISODate;
  dishIds: string[]; // 通常：[主菜, 副菜/汁物...]。ラク日：[ラク日用の料理...]
  kind: 'normal' | 'raku';
  servings: number; // SERVING_WEIGHT の合計（欠席者を除く）
  absentMemberIds: string[];
  reasons: string[]; // 一言の理由（コードで作る）
  warnings: string[]; // 「要確認」などの注意
  notes: string[]; // 「鶏ももは買ったら冷凍」など
  status: MealStatus;
  newDishIds: string[]; // この世帯にとって新しい料理
  changedBy?: 'user' | 'replan' | 'sale' | 'absence';
}

export type Reaction = 'great' | 'ok' | 'meh'; // ◎○△

export interface MealRecord {
  date: ISODate;
  dishIds: string[];
  status: 'cooked' | 'skipped';
  reactions: { memberId: string | 'household'; reaction: Reaction }[];
}

export type StockLevel = 'plenty' | 'some' | 'none';

export interface InventoryItem {
  ingredientId: string;
  level: StockLevel;
  acquiredOn: ISODate;
  frozen: boolean;
}

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  aisle: Aisle;
  amount: number; // 必要量（unit）
  unit: Unit;
  packs: number | null; // pack があるときの個数
  label: string; // 表示用（例：'鶏もも肉 1パック（約300g）'）
  forDates: ISODate[]; // どの日の献立に使うか
  checked: boolean;
  notes: string[]; // '買ったら冷凍' など
  uncertain: boolean; // 要確認の加工品
  /**
   * このリストで、もう買った量（unit）。チェックしたときに記録する。
   * 買ったあとで要る量が増えたら、チェックを外して、足りない分だけを amount・packs・label にする（「さば あと1パック」）。
   */
  bought?: number;
}

export interface ShoppingList {
  date: ISODate; // 買い物の日
  items: ShoppingItem[];
  pantry: string[]; // 家にあるか確認する常備品の名前
}

// ---------------------------------------------------------------------------
// 会話（UIのトーク画面と LINE の両方で使う）
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'open_week' }
  | { type: 'open_today' }
  | { type: 'open_shopping' }
  | { type: 'cooked'; date: ISODate }
  | { type: 'not_cooked'; date: ISODate }
  | { type: 'request_alternatives'; date: ISODate }
  | { type: 'choose_alternative'; date: ISODate; dishIds: string[] }
  | { type: 'today_impossible'; date: ISODate }
  | { type: 'accept_proposal'; proposalId: string }
  | { type: 'reject_proposal'; proposalId: string }
  | { type: 'react'; date: ISODate; memberId: string | 'household'; reaction: Reaction }
  | { type: 'check_item'; shoppingDate: ISODate; ingredientId: string; checked: boolean }
  /**
   * keepSafe：家族の変更（アレルギー・年齢・人の追加や削除）のとき。今の家族でも出せる日は残し、出せなくなった日だけを作り直す
   * （人数・注意・買い物リストは直す）。なければ、自分で替えた日・特売で替えた日だけを残して作り直す（献立の曜日やラク日の数を変えたとき）。
   */
  | { type: 'regenerate_week'; weekStart: ISODate; keepSafe?: boolean };

export interface ActionButton {
  label: string;
  action: Action;
}

export type Card =
  | { kind: 'week'; weekStart: ISODate } // その週の献立一覧
  | { kind: 'meal'; date: ISODate } // 1日の献立
  | { kind: 'shopping'; date: ISODate } // 買い物リスト
  | { kind: 'alternatives'; date: ISODate; options: string[][] } // 差し替えの候補
  | { kind: 'summary'; weekStart: ISODate } // 週の振り返り
  | { kind: 'notice'; level: 'info' | 'warning'; lines: string[] };

export interface ChatMessage {
  id: string;
  from: 'user' | 'bot';
  text: string;
  at: string; // ISO 日時
  card?: Card;
  actions?: ActionButton[];
  /** 有料版の配信（push）として送ったもの。無料版では作らない。 */
  push?: boolean;
}

export interface Proposal {
  id: string;
  /** alternative：「別のに」で案が1つだけのとき（［替える］［そのまま］で選ぶ）。 */
  kind: 'sale_swap' | 'stock_swap' | 'request' | 'alternative';
  date: ISODate;
  fromDishIds: string[];
  toDishIds: string[];
  text: string;
}

/**
 * 話し言葉の解釈結果。ルールベースの parseMessage と、サーバーの LLM の両方がこの形を返す。
 * 任意の欄（?）は、なくても動く（LLM は使わなくてよい）。
 */
export type ParsedCommand =
  | { type: 'show_week' }
  /** date：今日以外の日の献立を聞かれた（「明日の夕飯なに？」）。 */
  | { type: 'show_today'; date?: ISODate }
  /** date：その日の買い物を聞かれた（「明日何買えばいい？」）。 */
  | { type: 'show_shopping'; date?: ISODate }
  | { type: 'today_impossible' }
  /** dishId：「キーマカレー飽きた」のように料理で指したとき（date がなければ、その料理の日を探す）。 */
  | { type: 'want_alternatives'; date?: ISODate; dishId?: string }
  /**
   * memberRef：ニックネームか「夫」「妻」など（空なら「誰がいないか」を聞き返す）。
   * cancel：欠席の取り消し（「木曜ははるといる」「お泊まりなくなった」）。
   * tentative：まだ欠席と決まっていない（献立は変えずに、決まったときの送り方を返す）。
   *   'late'：遅くなるだけ（「水曜ははるとが塾」「パパは残業」。あとで家で食べることが多いので、人数も除外もそのまま）。
   *   'maybe'：予定が決まっていない（「明日パパ飲み会かも」）。
   */
  | { type: 'absence'; date: ISODate; memberRef: string; cancel?: boolean; tentative?: 'late' | 'maybe' }
  | { type: 'sale'; ingredientId: string }
  /** question：在庫を聞かれた（「卵って切れてる？」）。状態は変えずに答える。 */
  | { type: 'out_of_stock'; ingredientId: string; question?: boolean }
  /** question：在庫を聞かれた・頼まれた（「豆腐あったっけ？」「豆腐買ってきて」）。frozen：「〇〇冷凍した」。 */
  | { type: 'have'; ingredientId: string; question?: boolean; frozen?: boolean }
  /**
   * ingredientId：食材を名指ししたリクエスト（「明日はさばがいい」）。その食材を使う主菜を先に探す。
   * dishIds：あいまいな言い方（「塩焼きがいい」「肉がいい」）で当たる料理の候補。候補から選んでもらう。
   */
  | { type: 'request'; date?: ISODate; dishId?: string; protein?: Protein; genre?: Genre; ingredientId?: string; dishIds?: string[] }
  | { type: 'help' }
  | { type: 'unknown'; text: string };

export interface ParseContext {
  today: ISODate;
  members: Member[];
  catalog: Catalog;
  /** 書き込んだ人（member の id。画面の「送る人」）。人を書かない「明日飲み会」「今日はいらない」を、この人の欠席として読む。 */
  senderId?: string;
}

// ---------------------------------------------------------------------------
// アプリ全体の状態（JSON でそのまま保存できること）
// ---------------------------------------------------------------------------

export interface AppState {
  version: 1;
  today: ISODate; // プロトタイプでは「翌日へ進む」で動かせる
  household: Household;
  meals: PlannedMeal[]; // 日付順。今週と、作ってあれば来週
  history: MealRecord[];
  inventory: InventoryItem[];
  shopping: ShoppingList[];
  chat: ChatMessage[];
  proposals: Proposal[];
  seq: number; // id の採番
}

export interface StepResult {
  state: AppState;
  replies: ChatMessage[]; // 新しく追加した bot のメッセージ（state.chat にも追加済み）
}

/** 初回の質問の答え。 */
export interface OnboardingInput {
  members: Omit<Member, 'id'>[];
  shoppingWeekdays: Weekday[];
  favoriteDishIds: string[];
  customFavoriteNames: string[]; // マスタにない料理名
  plan: 'free' | 'paid';
}

export interface SafetyResult {
  status: 'ok' | 'excluded' | 'uncertain';
  hits: { ingredientId: string; reason: string }[]; // 例：{ ingredientId: 'soy_sauce', reason: '小麦（派生原材料）' }
}

export interface Notice {
  level: 'info' | 'warning';
  text: string;
}

export interface WeeklySummary {
  weekStart: ISODate;
  plannedDays: number;
  decidedWithoutThinking: number; // 提案のまま、または差し替えで作った日
  skippedOrImpossible: number;
  topDishIds: string[]; // ◎の多かった料理
  usedUpIngredientIds: string[];
  /** 過ぎた献立日のうち、「作った」「作らなかった」の記録がない日（分からない日。0日とは数えない）。 */
  unconfirmedDays?: number;
}
