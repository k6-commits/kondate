// 世帯・料理・食材を引くための内部の道具。
import type {
  AllergenId,
  AppState,
  Catalog,
  Dish,
  DishIngredient,
  Exclusion,
  Household,
  HouseholdSettings,
  ISODate,
  IngredientKind,
  Member,
  PlannedMeal,
  Protein,
} from './types';
import { SERVING_WEIGHT } from './types';
import { addDays, weekdayOf } from './dates';
import { normalizeJa } from './util';

/** 料理を引く（マスタ → 世帯の自由入力の定番）。 */
export function findDishIn(household: Household, catalog: Catalog, id: string): Dish | undefined {
  return catalog.dishById.get(id) ?? household.customDishes.find((d) => d.id === id);
}

export function allDishes(household: Household, catalog: Catalog): Dish[] {
  return [...catalog.dishes, ...household.customDishes];
}

/** 料理の材料。定番に「うちの材料メモ」（overrides）があればそちらを使う。 */
export function ingredientsOf(household: Household, dish: Dish): DishIngredient[] {
  const fav = household.favorites.find((f) => f.dishId === dish.id);
  if (fav?.overrides && fav.overrides.length > 0) return fav.overrides;
  return dish.ingredients;
}

/** その日に食べるメンバー（欠席者と乳児を除く）。 */
export function eatingMembers(household: Household, absent: string[] = []): Member[] {
  return household.members.filter((m) => m.ageBand !== 'infant' && !absent.includes(m.id));
}

/** SERVING_WEIGHT の合計（欠席者を除く。乳児は 0）。 */
export function servingsFor(household: Household, absent: string[] = []): number {
  const sum = household.members
    .filter((m) => !absent.includes(m.id))
    .reduce((acc, m) => acc + SERVING_WEIGHT[m.ageBand], 0);
  return Math.round(sum * 10) / 10;
}

export function hasKids(members: Member[]): boolean {
  return members.some((m) => m.ageBand === 'child' || m.ageBand === 'preschool');
}

/**
 * アレルゲンの呼び方（表示名と、よくある書き方）。自由入力の除外（text）がこれと一致したら、
 * アレルゲンの除外としても扱う（「鶏肉」と書いたのに鶏むね肉や鶏ガラスープの素が出る、を防ぐ）。
 */
const ALLERGEN_WORDS: Record<AllergenId, string[]> = {
  shrimp: ['えび', '海老', '蝦', 'シュリンプ'],
  crab: ['かに', '蟹'],
  walnut: ['くるみ', '胡桃'],
  wheat: ['小麦', 'こむぎ', 'グルテン'],
  buckwheat: ['そば', '蕎麦'],
  egg: ['卵', 'たまご', '玉子', '鶏卵', '卵白', '卵黄', 'らんぱく', 'らんおう', '全卵'],
  milk: ['乳', '牛乳', '乳製品', 'ミルク', '乳成分', 'ぎゅうにゅう'],
  peanut: ['落花生', 'らっかせい', 'ピーナッツ', 'ピーナツ'],
  cashew: ['カシューナッツ', 'カシュー'],
  almond: ['アーモンド'],
  abalone: ['あわび', '鮑'],
  squid: ['いか', '烏賊'],
  salmon_roe: ['いくら', '筋子', 'すじこ'],
  orange: ['オレンジ'],
  kiwi: ['キウイフルーツ', 'キウイ', 'キーウィ'],
  beef: ['牛肉', 'ぎゅうにく', 'ぎゅう肉', '牛', 'ビーフ'],
  sesame: ['ごま', '胡麻'],
  salmon: ['さけ', '鮭', 'しゃけ', 'サーモン'],
  mackerel: ['さば', '鯖'],
  soy: ['大豆', 'だいず'],
  chicken: ['鶏肉', 'とりにく', 'とり肉', '鳥肉', '鶏', '鳥', 'チキン'],
  banana: ['バナナ'],
  pork: ['豚肉', 'ぶたにく', 'ぶた肉', '豚', 'ポーク'],
  macadamia: ['マカダミアナッツ', 'マカデミアナッツ', 'マカダミア', 'マカデミア'],
  peach: ['もも', '桃'],
  yam: ['やまいも', '山芋', '山いも', '長芋', '長いも', 'ながいも'],
  apple: ['りんご', '林檎'],
  gelatin: ['ゼラチン'],
};

/**
 * まとめた呼び方（「甲殻類」「ナッツ」「肉」「魚」）。
 * 「肉」「魚」は、鶏肉・豚肉・牛肉、さけ・さば・いくらのアレルゲンとしても扱う（ルウ・コンソメ・めんつゆなどの派生原材料に当てるため）。
 */
const ALLERGEN_GROUPS: [string, AllergenId[]][] = [
  ['甲殻類', ['shrimp', 'crab']],
  ['甲殻', ['shrimp', 'crab']],
  ['えびかに', ['shrimp', 'crab']],
  ['ナッツ', ['walnut', 'cashew', 'almond', 'macadamia', 'peanut']],
  ['木の実', ['walnut', 'cashew', 'almond', 'macadamia']],
  ['魚卵', ['salmon_roe']],
  ['肉', ['chicken', 'pork', 'beef']],
  ['お肉', ['chicken', 'pork', 'beef']],
  ['にく', ['chicken', 'pork', 'beef']],
  ['魚', ['salmon', 'mackerel', 'salmon_roe']],
  ['お魚', ['salmon', 'mackerel', 'salmon_roe']],
  ['さかな', ['salmon', 'mackerel', 'salmon_roe']],
  ['魚介', ['salmon', 'mackerel', 'salmon_roe', 'shrimp', 'crab', 'squid', 'abalone']],
  ['海鮮', ['salmon', 'mackerel', 'salmon_roe', 'shrimp', 'crab', 'squid', 'abalone']],
  ['シーフード', ['salmon', 'mackerel', 'salmon_roe', 'shrimp', 'crab', 'squid', 'abalone']],
  ['貝', ['abalone']],
];

let allergenByWord: Map<string, AllergenId[]> | undefined;

function allergenWordMap(): Map<string, AllergenId[]> {
  if (allergenByWord) return allergenByWord;
  const map = new Map<string, AllergenId[]>();
  for (const [id, words] of Object.entries(ALLERGEN_WORDS) as [AllergenId, string[]][]) {
    for (const w of [ALLERGEN_NAME[id], ...words]) map.set(normalizeJa(w), [id]);
  }
  for (const [w, ids] of ALLERGEN_GROUPS) map.set(normalizeJa(w), ids);
  allergenByWord = map;
  return map;
}

/** 自由入力の除外を語に分ける区切り（「卵、ピーマン」「えび・かに」「しいたけ／パクチー」）。 */
export const TEXT_SEPARATORS = /[・、,，/／()（）「」『』;；。\s]+/;

/** 「〇〇アレルギー」「〇〇のアレルギー持ち」の「アレルギー」の部分（normalizeJa した語に使う）。 */
const ALLERGY_SUFFIX = /(の)?あれるぎー(あり|もち|持ち|体質|です)?$/u;
/** 「〇〇類」「〇〇全般」「〇〇製品」などのまとめの語尾。 */
const GROUP_SUFFIX = /(全般|全部|すべて|類|系|など|製品|料理)+$/u;
/** 「〇〇が苦手」「〇〇嫌い」などの語尾。 */
const DISLIKE_SUFFIX = /(が|は)?(苦手|にがて|嫌い|きらい|だめ|ng)$/u;

const isOneKana = (k: string) => k.length === 1 && /[぀-ゟ]/.test(k);

/**
 * 自由入力の語の照合用の形（normalizeJa のあと、「アレルギー」「苦手」「類」などの語尾を外したもの）を、外す段階ごとに返す。
 * 1つ目はそのまま、2つ目は「アレルギー」「苦手」を外した形、3つ目はさらに「類・全般・製品」まで外した形。
 * 外した結果が空やひらがな1文字になる段階は使わない。
 */
export function textKeys(part: string): string[] {
  const raw = normalizeJa(part);
  if (!raw) return [];
  const keys = [raw];
  const noAllergy = raw.replace(ALLERGY_SUFFIX, '').replace(DISLIKE_SUFFIX, '');
  if (noAllergy && !isOneKana(noAllergy)) keys.push(noAllergy);
  const noGroup = keys[keys.length - 1].replace(GROUP_SUFFIX, '');
  if (noGroup && !isOneKana(noGroup)) keys.push(noGroup);
  return [...new Set(keys)];
}

/** 名前で照合するときの語（語尾をいちばん外した形）。 */
export function textNameKey(part: string): string {
  const keys = textKeys(part);
  return keys[keys.length - 1] ?? '';
}

/**
 * 自由入力の語がアレルゲンの名前なら、その id（「えび・かに」のように並べてあれば、それぞれ）。
 * 「卵アレルギー」「甲殻類アレルギー」「甲殻類のアレルギー」「乳製品全般」のような書き方も受け付ける。
 * 語尾は段階的に外して引く（「甲殻類アレルギー」→「甲殻類」で引けたら、そこで止める）。
 * 部分一致はしない（「鶏もも」は鶏肉の除外にしない）。
 */
export function allergensOfText(text: string): AllergenId[] {
  const map = allergenWordMap();
  const out: AllergenId[] = [];
  for (const part of text.normalize('NFKC').split(TEXT_SEPARATORS)) {
    const hit = textKeys(part)
      .map((k) => map.get(k))
      .find((ids) => !!ids);
    for (const id of hit ?? []) if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * アレルゲンの呼び方（normalizeJa 済み）。材料のわからない料理の名前の照合に使う。
 * ひらがな1文字の語は誤って当たりやすいので入れない（漢字1文字の「鮭」「豚」は入れる）。
 */
export function allergenWords(id: AllergenId, catalog?: Catalog): string[] {
  const words = [ALLERGEN_NAME[id], ...(ALLERGEN_WORDS[id] ?? [])];
  const name = catalog?.allergens.find((a) => a.id === id)?.name;
  if (name) words.push(...name.split(/[()（）]/));
  return [...new Set(words.map(normalizeJa))].filter((w) => w.length >= 2 || (w.length === 1 && !/[぀-ゟ]/.test(w)));
}

/**
 * 分類の語（自由入力の除外で、その種類の食材にも当てる）。
 * kinds：その種類（IngredientKind）の食材に当てる。words：名前・別名にこの語を含む食材にも当てる（練り物・かつお節など）。
 */
interface TextCategory {
  words: string[];
  kinds: IngredientKind[];
  names: string[];
}

const FISH_PRODUCTS = ['ちくわ', '竹輪', 'かまぼこ', '蒲鉾', 'かつお節', 'かつおぶし', '鰹節', 'おかか', '削り節', '魚醤'];
const SHELLFISH = ['あさり', '浅蜊', 'しじみ', '蜆', 'はまぐり', '蛤', 'ほたて', '帆立', 'あわび', '牡蠣', 'かき油', 'オイスター', '貝'];

const TEXT_CATEGORIES: TextCategory[] = [
  { words: ['魚', '魚類', 'さかな', 'お魚', '鮮魚'], kinds: ['fish'], names: FISH_PRODUCTS },
  { words: ['魚介', '魚介類', 'ぎょかい', '海鮮', 'シーフード'], kinds: ['fish', 'seafood'], names: [...FISH_PRODUCTS, ...SHELLFISH] },
  { words: ['貝', '貝類', '二枚貝'], kinds: [], names: SHELLFISH },
  {
    words: ['肉', '肉類', 'お肉', 'にく'],
    kinds: ['chicken', 'pork', 'beef', 'ground'],
    names: ['ベーコン', 'ハム', 'ウインナー', 'ウィンナー', 'ソーセージ', '鶏がら', 'ガラスープ', 'コンソメ', 'ブイヨン'],
  },
  { words: ['ひき肉', '挽き肉', '挽肉', 'ひきにく', 'ミンチ'], kinds: ['ground'], names: [] },
  { words: ['きのこ', '茸', 'きのこ類'], kinds: ['mushroom'], names: [] },
  { words: ['海藻', '海藻類'], kinds: ['seaweed'], names: [] },
];

let categoryByWord: Map<string, { kinds: IngredientKind[]; names: string[] }> | undefined;

/** 自由入力の語（1語）が分類の語なら、その種類と名前の語（normalizeJa 済み）。 */
export function textCategoryOf(part: string): { kinds: IngredientKind[]; names: string[] } | undefined {
  if (!categoryByWord) {
    const map = new Map<string, { kinds: IngredientKind[]; names: string[] }>();
    for (const c of TEXT_CATEGORIES) {
      for (const w of c.words) map.set(normalizeJa(w), { kinds: c.kinds, names: c.names.map(normalizeJa) });
    }
    categoryByWord = map;
  }
  for (const k of textKeys(part)) {
    const hit = categoryByWord.get(k);
    if (hit) return hit;
  }
  return undefined;
}

/** メンバーの除外条件。自由入力（text）がアレルゲンの名前なら、そのアレルゲンの除外も加える（text の判定も残す）。 */
export function effectiveExclusions(member: Member): Exclusion[] {
  const out: Exclusion[] = [...member.exclusions];
  for (const ex of member.exclusions) {
    if (ex.type !== 'text') continue;
    for (const id of allergensOfText(ex.text)) {
      if (!out.some((e) => e.type === 'allergen' && e.id === id)) out.push({ type: 'allergen', id });
    }
  }
  return out;
}

export function hasAllergenExclusion(household: Household): boolean {
  return household.members.some((m) => m.ageBand !== 'infant' && effectiveExclusions(m).some((e) => e.type === 'allergen'));
}

export function isFavorite(household: Household, dishId: string): boolean {
  return household.favorites.some((f) => f.dishId === dishId) || household.customDishes.some((d) => d.id === dishId);
}

/** この世帯にとって新しい料理か（定番帳になく、作った記録もない主菜）。 */
export function isNewDish(state: AppState, dish: Dish): boolean {
  if (dish.role !== 'main') return false;
  if (isFavorite(state.household, dish.id)) return false;
  if (state.history.some((r) => r.status === 'cooked' && r.dishIds.includes(dish.id))) return false;
  return !state.meals.some((m) => m.status === 'cooked' && m.dishIds.includes(dish.id));
}

export function proteinOfKind(kind: IngredientKind): Protein {
  switch (kind) {
    case 'chicken':
    case 'pork':
    case 'beef':
    case 'ground':
    case 'fish':
    case 'seafood':
    case 'egg':
    case 'tofu':
      return kind;
    default:
      return 'none';
  }
}

export function isMeat(p: Protein): boolean {
  return p === 'chicken' || p === 'pork' || p === 'beef' || p === 'ground';
}

/** その週の献立日（月曜始まり）。 */
export function dinnerDatesOfWeek(settings: HouseholdSettings, weekStart: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (settings.dinnerWeekdays.includes(weekdayOf(d))) out.push(d);
  }
  return out;
}

/**
 * その献立日の材料を買う日：today 以降でその日以前の、最も近い買い物日。
 * なければ today（献立より前に買い物日がない場合）。
 */
export function shoppingDateFor(settings: HouseholdSettings, today: ISODate, date: ISODate): ISODate {
  if (date < today) return date;
  for (let d = date; d >= today; d = addDays(d, -1)) {
    if (settings.shoppingWeekdays.includes(weekdayOf(d))) return d;
  }
  return today;
}

export function mealOn(state: AppState, date: ISODate): PlannedMeal | undefined {
  return state.meals.find((m) => m.date === date);
}

export function sortMeals(meals: PlannedMeal[]): PlannedMeal[] {
  return [...meals].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** アレルゲンの表示名（マスタになければ内蔵の名前）。 */
const ALLERGEN_NAME: Record<AllergenId, string> = {
  shrimp: 'えび', crab: 'かに', walnut: 'くるみ', wheat: '小麦', buckwheat: 'そば', egg: '卵', milk: '乳',
  peanut: '落花生', cashew: 'カシューナッツ', almond: 'アーモンド', abalone: 'あわび', squid: 'いか',
  salmon_roe: 'いくら', orange: 'オレンジ', kiwi: 'キウイフルーツ', beef: '牛肉', sesame: 'ごま', salmon: 'さけ',
  mackerel: 'さば', soy: '大豆', chicken: '鶏肉', banana: 'バナナ', pork: '豚肉', macadamia: 'マカダミアナッツ',
  peach: 'もも', yam: 'やまいも', apple: 'りんご', gelatin: 'ゼラチン',
};

export function allergenName(catalog: Catalog, id: AllergenId): string {
  return catalog.allergens.find((a) => a.id === id)?.name ?? ALLERGEN_NAME[id] ?? id;
}

/** メンバーの呼び名。 */
export function memberName(household: Household, id: string): string {
  return household.members.find((m) => m.id === id)?.nickname ?? id;
}
