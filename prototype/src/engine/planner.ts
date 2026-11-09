// 献立を組む（DESIGN.md 3-2・3-3）。点数をつけて日に割り当て、足りなければ制約を段階的にゆるめる。
// 安全・旬・7日以内の重複の3つは決してゆるめない。
import type {
  AppState,
  Catalog,
  Dish,
  DishIngredient,
  DishRole,
  Genre,
  Household,
  HouseholdSettings,
  ISODate,
  Ingredient,
  InventoryItem,
  Member,
  PlannedMeal,
  Reaction,
  SafetyResult,
  Unit,
} from './types';
import { addDays, diffDays, formatJa, monthOf, weekStartOf, weekdayOf } from './dates';
import { createRng, seedFrom } from './rng';
import {
  allDishes,
  dinnerDatesOfWeek,
  eatingMembers,
  everyoneOut,
  findDishIn,
  hasKids,
  ingredientsOf,
  isFavorite,
  isMeat,
  isNewDish,
  mealOn,
  servingsFor,
  shoppingDateFor,
} from './context';
import { NOTICE_FOOD_SAFETY, checkDishSafetyFor, isAllowed, uncertainWarning, usesHoney } from './safety';
import { normalizeJa, uniq } from './util';

export interface Factor {
  text: string;
  priority: number;
}

export interface Scored {
  dish: Dish;
  score: number;
  factors: Factor[];
}

export interface Slot {
  date: ISODate;
  absent: string[];
  eaters: Member[];
  kids: boolean;
}

export interface PlanEnv {
  state: AppState;
  catalog: Catalog;
  household: Household;
  settings: HouseholdSettings;
  today: ISODate;
  rng: () => number;
  /** 料理 id → 食べた（食べる予定の）日。 */
  eaten: Map<string, ISODate[]>;
  /** 日付 → その日の料理（先頭が主菜またはラク日用の料理）。 */
  byDate: Map<ISODate, { kind: 'normal' | 'raku'; dishes: Dish[] }>;
  inventory: Map<string, InventoryItem>;
  safetyCache: Map<string, SafetyResult>;
  mains: Dish[];
  sides: Dish[];
  rakus: Dish[];
}

export interface Constraints {
  newQuotaLeft: number;
  genreCount: Map<Genre, number>;
  /** その週に同じジャンルを入れてよい数（家庭の定番のジャンルの割合に合わせる）。 */
  genreCap: (g: Genre) => number;
  isNew: (d: Dish) => boolean;
}

/**
 * ジャンルの上限。週の6割までを基本にし、定番の多くが同じジャンル（和食中心など）の家庭は、その割合まで認める。
 * 定番が和食ばかりの家庭で、ジャンルをばらすために新しい料理が増えないようにする。
 */
export function genreCapFor(household: Household, catalog: Catalog, normalDays: number): (g: Genre) => number {
  const favs = household.favorites
    .map((f) => findDishIn(household, catalog, f.dishId))
    .filter((d): d is Dish => !!d && d.role === 'main');
  for (const d of household.customDishes) if (d.role === 'main' && !favs.includes(d)) favs.push(d);
  return (g) => {
    const share = favs.length > 0 ? favs.filter((d) => d.genre === g).length / favs.length : 0;
    return Math.max(2, Math.ceil(normalDays * Math.max(0.6, share)));
  };
}

const REACTION_VALUE: Record<Reaction, number> = { great: 2, ok: 0.5, meh: -4 };

export const RAKU_FALLBACK_WARNING = '条件に合う主菜が見つからなかったので、この日はラク日にしました';
export const NOTHING_FOUND_WARNING = '条件に合う料理が見つかりませんでした。家で食べられる定番を足すと、組みやすくなります';
/** newPerWeek の範囲で入れた新しい料理の理由。 */
export const NEW_DISH_REASON = '今週の新しい料理';
/** newPerWeek を超えて新しい料理を入れたとき、最初の1日だけに付ける理由。 */
export const EXTRA_NEW_DISH_REASON = '定番が少ないので、新しい料理を多めにしました';

export function rakuReason(dish: Dish): string {
  return `ラクする日。${dish.name}で十分`;
}

// ---------------------------------------------------------------------------
// 文脈
// ---------------------------------------------------------------------------

function addEaten(env: PlanEnv, dishId: string, date: ISODate): void {
  const xs = env.eaten.get(dishId);
  if (xs) xs.push(date);
  else env.eaten.set(dishId, [date]);
}

/** state から計画の文脈を作る。exclude の日は「これから決める日」として文脈に入れない。 */
export function makeEnv(state: AppState, catalog: Catalog, exclude: Set<ISODate>, seed: number): PlanEnv {
  const household = state.household;
  const all = allDishes(household, catalog);
  const env: PlanEnv = {
    state,
    catalog,
    household,
    settings: household.settings,
    today: state.today,
    rng: createRng(seed),
    eaten: new Map(),
    byDate: new Map(),
    inventory: new Map(state.inventory.map((i) => [i.ingredientId, i])),
    safetyCache: new Map(),
    mains: all.filter((d) => d.role === 'main'),
    sides: all.filter((d) => d.role === 'side' || d.role === 'soup'),
    rakus: all.filter((d) => d.role === 'raku'),
  };
  for (const r of state.history) {
    if (r.status !== 'cooked' || exclude.has(r.date)) continue;
    for (const id of r.dishIds) addEaten(env, id, r.date);
  }
  for (const m of state.meals) {
    // 作らなかった日と、みんな外で食べて過ぎた日は、食べていない（その主菜は、また献立に入れられる）。
    // これからのみんな外で食べる日は、家で食べることになったら戻るので、予定として数える。
    if (exclude.has(m.date) || m.status === 'skipped' || (m.date < state.today && everyoneOut(household, m))) continue;
    const dishes = m.dishIds.map((id) => findDishIn(household, catalog, id)).filter((d): d is Dish => !!d);
    env.byDate.set(m.date, { kind: m.kind, dishes });
    for (const id of m.dishIds) addEaten(env, id, m.date);
  }
  return env;
}

export function makeSlot(env: PlanEnv, date: ISODate, absent: string[] = []): Slot {
  const eaters = eatingMembers(env.household, absent);
  return { date, absent: [...absent], eaters, kids: hasKids(eaters) };
}

export function safetyFor(env: PlanEnv, dish: Dish, eaters: Member[]): SafetyResult {
  const key = `${dish.id}|${eaters.map((m) => m.id).join(',')}`;
  let r = env.safetyCache.get(key);
  if (!r) {
    r = checkDishSafetyFor(dish, eaters, env.household, env.catalog);
    env.safetyCache.set(key, r);
  }
  return r;
}

export function inSeason(dish: Dish, date: ISODate): boolean {
  return !dish.seasonMonths || dish.seasonMonths.length === 0 || dish.seasonMonths.includes(monthOf(date));
}

/** 安全と旬（ゆるめない条件）。 */
export function allowedOn(env: PlanEnv, dish: Dish, slot: Slot): boolean {
  return inSeason(dish, slot.date) && isAllowed(safetyFor(env, dish, slot.eaters), env.household);
}

/** 同じ料理を食べた（食べる予定の）日との最短の間隔。その日自身は数えない。 */
export function nearestGap(env: PlanEnv, dishId: string, date: ISODate): number | null {
  let best: number | null = null;
  for (const d of env.eaten.get(dishId) ?? []) {
    if (d === date) continue;
    const g = Math.abs(diffDays(date, d));
    if (best === null || g < best) best = g;
  }
  return best;
}

function headOn(env: PlanEnv, date: ISODate): Dish | undefined {
  return env.byDate.get(date)?.dishes[0];
}

function ingredientObjs(env: PlanEnv, dish: Dish): Ingredient[] {
  return ingredientsOf(env.household, dish)
    .map((di) => env.catalog.ingredientById.get(di.ingredientId))
    .filter((i): i is Ingredient => !!i);
}

/**
 * 1人あたりの量の目安。reason：理由に書いてよい量（1人3gの薬味は理由にしない）。
 * side：副菜・汁物の主な材料。main：主菜の主な材料（付け合わせのキャベツ50gなどは含めない）。
 */
const AMOUNT_AT_LEAST: Record<'reason' | 'side' | 'main', Partial<Record<Unit, number>>> = {
  reason: { g: 20, ml: 20, piece: 0.1, sheet: 0.25, block: 0.1, pack: 0.25, bag: 0.25 },
  side: { g: 40, ml: 40, piece: 0.25, sheet: 0.25, block: 0.1, pack: 0.25, bag: 0.25 },
  main: { g: 70, ml: 70, piece: 0.5, sheet: 0.5, block: 0.3, pack: 0.5, bag: 0.5 },
};

/**
 * その料理で、1人あたりの量が目安以上の食材（調味料・常備品は除く）。
 * 主な材料（side・main）は、料理名に名前が出ている食材も含める（「鶏むねとブロッコリーの塩炒め」のブロッコリー）。
 */
function ingredientsAtLeast(env: PlanEnv, dish: Dish, level: keyof typeof AMOUNT_AT_LEAST): Map<string, DishIngredient> {
  const out = new Map<string, DishIngredient>();
  const dishName = normalizeJa(dish.name);
  for (const di of ingredientsOf(env.household, dish)) {
    const ing = env.catalog.ingredientById.get(di.ingredientId);
    if (!ing || ing.pantry) continue;
    const min = AMOUNT_AT_LEAST[level][ing.unit];
    const named =
      level !== 'reason' &&
      [ing.name, ...ing.aliases].map(normalizeJa).some((n) => (n.length >= 2 || /[\u4e00-\u9fff]/.test(n)) && dishName.includes(n));
    if ((min !== undefined && di.amount >= min) || named) out.set(ing.id, di);
  }
  return out;
}

/** 買う日から使う日までの日数。惣菜はその日に買う（帰りに買う）ので 0。 */
function shopGap(env: PlanEnv, ing: Ingredient, date: ISODate): number {
  if (ing.aisle === 'deli') return 0;
  return diffDays(date, shoppingDateFor(env.settings, env.today, date));
}

type StockState = 'perishable' | 'fresh' | 'frozen';

/** 在庫の状態（その日に使えるか）。期限切れや「なし」は null。 */
export function stockState(env: PlanEnv, ing: Ingredient, date: ISODate): StockState | null {
  const it = env.inventory.get(ing.id);
  if (!it || it.level === 'none') return null;
  if (it.frozen) return 'frozen';
  const remaining = ing.shelfLifeDays - diffDays(date, it.acquiredOn);
  if (remaining < 0) return null;
  return ing.shelfLifeDays <= 4 || remaining <= 2 ? 'perishable' : 'fresh';
}

function reactionInfo(env: PlanEnv, dishId: string, eaters: Member[], date: ISODate): { score: number; great: number } {
  const paid = env.settings.plan === 'paid';
  const ids = new Set(eaters.map((m) => m.id));
  let score = 0;
  let great = 0;
  for (const r of env.state.history) {
    if (r.status !== 'cooked' || r.reactions.length === 0 || !r.dishIds.includes(dishId)) continue;
    let rs = r.reactions;
    if (paid) {
      const mine = rs.filter((x) => x.memberId !== 'household' && ids.has(x.memberId));
      if (mine.length > 0) rs = mine;
    }
    const age = Math.max(0, diffDays(date, r.date));
    const w = age <= 14 ? 1 : age <= 42 ? 0.6 : 0.3; // 直近の反応ほど重く
    score += (w * rs.reduce((a, x) => a + REACTION_VALUE[x.reaction], 0)) / rs.length;
    great += rs.filter((x) => x.reaction === 'great').length;
  }
  return { score: Math.max(-8, Math.min(6, score)), great };
}

/** 最近「作らなかった」料理なら、その日付を返す（まだ食べていないものに限る）。 */
function skippedRecently(env: PlanEnv, dishId: string, date: ISODate): ISODate | null {
  const hit = env.state.history.find((r) => {
    if (r.status !== 'skipped' || r.dishIds[0] !== dishId) return false;
    const age = diffDays(date, r.date);
    if (age < 1 || age > 10) return false;
    return !(env.eaten.get(dishId) ?? []).some((d) => d > r.date && d !== date);
  });
  return hit ? hit.date : null;
}

/** 買い物日から離れすぎて持たない食材。 */
function freshnessRisk(env: PlanEnv, dish: Dish, date: ISODate): { penalty: number; freeze: Ingredient[]; spoil: Ingredient[] } {
  const freeze: Ingredient[] = [];
  const spoil: Ingredient[] = [];
  for (const ing of ingredientObjs(env, dish)) {
    if (ing.pantry || stockState(env, ing, date)) continue;
    if (shopGap(env, ing, date) > ing.shelfLifeDays) (ing.freezable ? freeze : spoil).push(ing);
  }
  return { penalty: spoil.length > 0 ? -4 : freeze.length > 0 ? -1 : 0, freeze, spoil };
}

// ---------------------------------------------------------------------------
// 点数
// ---------------------------------------------------------------------------

export function scoreMain(env: PlanEnv, slot: Slot, dish: Dish): Scored {
  const factors: Factor[] = [];
  const date = slot.date;
  let score = 0;
  if (isFavorite(env.household, dish.id)) {
    score += 3;
    // 定番であることは、旬（3）や使い回し（2）より先に伝える。
    factors.push({ text: 'うちの定番', priority: 3.5 });
  }
  const r = reactionInfo(env, dish.id, slot.eaters, date);
  score += r.score;
  if (r.great > 0 && r.score > 0) factors.push({ text: `家族に人気（◎${r.great}）`, priority: 5 });
  const gap = nearestGap(env, dish.id, date);
  if (gap !== null) score -= gap <= 7 ? 6 : gap <= 14 ? 2 : 0;
  const prev = headOn(env, addDays(date, -1));
  const next = headOn(env, addDays(date, 1));
  for (const nb of [prev, next]) {
    if (!nb) continue;
    if (dish.protein !== 'none' && nb.protein === dish.protein) score -= 3;
    if (nb.genre === dish.genre) score -= 1;
  }
  // 週の中で同じたんぱく源が重ならないように（肉・魚の偏りを減らす）。
  if (dish.protein !== 'none') {
    const ws = weekStartOf(date);
    let same = 0;
    for (const [d, v] of env.byDate) {
      if (d !== date && v.kind === 'normal' && v.dishes[0]?.protein === dish.protein && weekStartOf(d) === ws) same += 1;
    }
    score -= 1.5 * same;
  }
  if (prev && isMeat(prev.protein) && (dish.protein === 'fish' || dish.protein === 'seafood')) {
    factors.push({ text: '前日が肉なので魚に', priority: 4 });
  }
  const ings = ingredientObjs(env, dish);
  const month = monthOf(date);
  // 理由に書くのは、1人あたりの量がある程度ある食材だけ（薬味の3gを「旬の」「使い切る」の理由にしない）。
  const enough = ingredientsAtLeast(env, dish, 'reason');
  const seasonal = ings.find((i) => !i.pantry && i.seasonMonths?.includes(month));
  if (seasonal) {
    score += 1;
    const named = ings.find((i) => !i.pantry && i.seasonMonths?.includes(month) && enough.has(i.id));
    if (named) factors.push({ text: `旬の${named.name}`, priority: 3 });
  }
  let usedUp: Ingredient | undefined;
  let frozen: Ingredient | undefined;
  for (const i of ings) {
    if (i.pantry) continue;
    const st = stockState(env, i, date);
    if (st === 'perishable') usedUp ??= i;
    if (st === 'frozen') frozen ??= i;
  }
  if (usedUp) {
    score += 2;
    if (enough.has(usedUp.id)) factors.push({ text: `${usedUp.name}を使い切るため`, priority: 6 });
  } else if (frozen) {
    score += 1;
    if (enough.has(frozen.id)) factors.push({ text: `冷凍の${frozen.name}を使うため`, priority: 4 });
  }
  const max = env.settings.maxMinutes[weekdayOf(date)];
  if (max !== undefined) {
    if (dish.minutes > max) score -= 5;
    else factors.push({ text: `${dish.minutes}分でできる`, priority: 3 });
  }
  if (slot.kids) {
    if (dish.kidFriendly) {
      score += 0.5;
      factors.push({ text: '子どもも食べやすい', priority: 0 });
    }
    if (dish.spicy) score -= 2;
  }
  score += freshnessRisk(env, dish, date).penalty;
  const skippedOn = skippedRecently(env, dish.id, date);
  if (skippedOn) {
    score += 2;
    // 同じ週のうちなら「先週」ではないので、日付で言う。
    const when = weekStartOf(skippedOn) === weekStartOf(date) ? `${formatJa(skippedOn)}に` : '先週';
    factors.push({ text: `${when}できなかった${dish.name}`, priority: 5 });
  }
  score += env.rng() * 0.5; // 同点を崩す
  return { dish, score, factors };
}

export function scoreRaku(env: PlanEnv, slot: Slot, dish: Dish): Scored {
  const factors: Factor[] = [];
  let score = 0;
  if (isFavorite(env.household, dish.id)) score += 3;
  score += reactionInfo(env, dish.id, slot.eaters, slot.date).score;
  const gap = nearestGap(env, dish.id, slot.date);
  if (gap !== null && gap <= 7) score -= 3;
  const ings = ingredientObjs(env, dish).filter((i) => !i.pantry);
  let inStock = 0;
  let frozen: Ingredient | undefined;
  let have: Ingredient | undefined;
  for (const i of ings) {
    const st = stockState(env, i, slot.date);
    if (!st) continue;
    inStock += 1;
    if (st === 'frozen' || i.aisle === 'frozen') frozen ??= i;
    else have ??= i;
  }
  score += 2 * Math.min(2, inStock); // 在庫や冷凍で済むものを優先
  if (ings.length > 0 && inStock === ings.length) {
    score += 2;
    factors.push({ text: '買い足しなしでできる', priority: 4 });
  }
  if (frozen) factors.push({ text: `冷凍庫の${frozen.name}で済みます`, priority: 5 });
  else if (have) factors.push({ text: `家にある${have.name}を使って`, priority: 5 });
  for (const nb of [headOn(env, addDays(slot.date, -1)), headOn(env, addDays(slot.date, 1))]) {
    if (nb && dish.protein !== 'none' && nb.protein === dish.protein) score -= 3;
  }
  if (slot.kids) {
    if (dish.kidFriendly) score += 0.5;
    if (dish.spicy) score -= 2;
  }
  score -= dish.minutes / 10;
  score += env.rng() * 0.5;
  return { dish, score, factors };
}

function scoreSide(env: PlanEnv, slot: Slot, side: Dish, main: Dish, mainIngIds: Set<string>): Scored {
  const factors: Factor[] = [];
  let score = 0;
  if (side.genre === main.genre) score += 2;
  else if (side.genre === 'other' || main.genre === 'other') score += 0.5;
  const ings = ingredientObjs(env, side).filter((i) => !i.pantry);
  // 主菜の主な材料を、副菜・汁物の主な材料にもう一度使う組み合わせ（肉じゃが＋じゃがいもの味噌汁、かに玉＋たまごスープ）は避ける。
  // 使い回しの加点は、片方では少量（付け合わせ・パックの残り）のときだけ。
  const mainMain = ingredientsAtLeast(env, main, 'main');
  const sideMain = ingredientsAtLeast(env, side, 'side');
  const family = (id: string) => [id, ...(env.catalog.ingredientById.get(id)?.substitutes ?? [])];
  const doubled = [...sideMain.keys()].filter((id) => family(id).some((x) => mainMain.has(x)));
  const shared = ings.filter((i) => mainIngIds.has(i.id) && !doubled.includes(i.id));
  score -= 4 * Math.min(2, doubled.length);
  if (shared.length > 0) {
    score += 1.5 * Math.min(2, shared.length);
    const enough = ingredientsAtLeast(env, side, 'reason');
    const named = shared.find((i) => enough.has(i.id));
    if (named) factors.push({ text: `${named.name}を${side.role === 'soup' ? '汁物' : '副菜'}でも使い回し`, priority: 2 });
  }
  const month = monthOf(slot.date);
  for (const i of ings) {
    const st = stockState(env, i, slot.date);
    if (st === 'perishable' || st === 'fresh') {
      score += st === 'perishable' ? 2 : 0.5;
      if (st === 'perishable') factors.push({ text: `${i.name}を使い切るため`, priority: 6 });
    } else if (!mainIngIds.has(i.id) && !st) {
      score -= 0.4; // 買う物が増える
    }
  }
  const seasonal = ings.find((i) => i.seasonMonths?.includes(month));
  if (seasonal) {
    score += 1;
    if (ingredientsAtLeast(env, side, 'reason').has(seasonal.id)) factors.push({ text: `旬の${seasonal.name}`, priority: 3 });
  }
  const gap = nearestGap(env, side.id, slot.date);
  if (gap !== null) score -= gap <= 2 ? 3 : gap <= 6 ? 1.5 : 0;
  if (isFavorite(env.household, side.id)) score += 1.5;
  if (slot.kids) {
    if (side.spicy) score -= 2;
    if (side.kidFriendly) score += 0.3;
  }
  const max = env.settings.maxMinutes[weekdayOf(slot.date)];
  if (side.minutes > 20) score -= 1;
  if (max !== undefined && max <= 20 && side.minutes > 10) score -= 1.5;
  // 豚の主菜に豚汁、卵の主菜にたまごスープ、などを避ける（使い回しとジャンルの加点より強く）。
  if (side.protein !== 'none' && side.protein === main.protein) score -= 6;
  score += env.rng() * 0.3;
  return { dish: side, score, factors };
}

// ---------------------------------------------------------------------------
// 候補の絞り込みと順位
// ---------------------------------------------------------------------------

/** level 0：すべての条件／1：新しい料理の数をゆるめる／2：ジャンルの重複もゆるめる／3：前日と同じたんぱく源もゆるめる。 */
export function passes(env: PlanEnv, slot: Slot, dish: Dish, level: number, cons: Constraints): boolean {
  if (!allowedOn(env, dish, slot)) return false;
  const gap = nearestGap(env, dish.id, slot.date);
  if (gap !== null && gap <= 7) return false;
  if (level < 1 && cons.newQuotaLeft <= 0 && cons.isNew(dish)) return false;
  if (level < 2 && (cons.genreCount.get(dish.genre) ?? 0) >= cons.genreCap(dish.genre)) return false;
  if (level < 3 && dish.protein !== 'none') {
    const prev = headOn(env, addDays(slot.date, -1));
    const next = headOn(env, addDays(slot.date, 1));
    if (prev?.protein === dish.protein || next?.protein === dish.protein) return false;
  }
  return true;
}

export function rankMains(
  env: PlanEnv,
  slot: Slot,
  cons: Constraints,
  filter?: (d: Dish) => boolean,
  minCount = 1,
  maxLevel = 3,
): { ranked: Scored[]; level: number } {
  for (let level = 0; level <= maxLevel; level++) {
    const pool = env.mains.filter((d) => (!filter || filter(d)) && passes(env, slot, d, level, cons));
    if (pool.length >= minCount || (level === maxLevel && pool.length > 0)) {
      const ranked = pool.map((d) => scoreMain(env, slot, d)).sort((a, b) => b.score - a.score);
      return { ranked, level };
    }
  }
  return { ranked: [], level: maxLevel + 1 };
}

export function rankRaku(env: PlanEnv, slot: Slot): Scored[] {
  const pool = env.rakus.filter((d) => allowedOn(env, d, slot));
  const strict = pool.filter((d) => {
    if (d.protein === 'none') return true;
    const prev = headOn(env, addDays(slot.date, -1));
    const next = headOn(env, addDays(slot.date, 1));
    return prev?.protein !== d.protein && next?.protein !== d.protein;
  });
  const use = strict.length > 0 ? strict : pool;
  return use.map((d) => scoreRaku(env, slot, d)).sort((a, b) => b.score - a.score);
}

export function pickSides(
  env: PlanEnv,
  slot: Slot,
  main: Dish,
  isRaku: boolean,
  exclude: string[] = [],
): { sides: Dish[]; factors: Factor[] } {
  const policy = env.settings.sidePolicy;
  if (policy === 'main_only') return { sides: [], factors: [] };
  // 'complete'（納豆ごはんと味噌汁など、それだけで1食）は何も足さない。'soupy'（汁のある麺・シチュー・鍋）には汁物を足さない。
  if (main.tags.includes('complete')) return { sides: [], factors: [] };
  const soupy = main.tags.includes('soupy');
  const base: DishRole[][] = !isRaku && policy === 'side_and_soup' ? [['side'], ['soup']] : [['side', 'soup']];
  const groups = base.map((g) => (soupy ? g.filter((r) => r !== 'soup') : g)).filter((g) => g.length > 0);
  const mainIngIds = new Set(ingredientObjs(env, main).filter((i) => !i.pantry).map((i) => i.id));
  const sides: Dish[] = [];
  const factors: Factor[] = [];
  for (const roles of groups) {
    let pool = env.sides.filter(
      (d) => roles.includes(d.role) && !sides.includes(d) && !exclude.includes(d.id) && allowedOn(env, d, slot),
    );
    if (isRaku) {
      // ラク日の副菜は、10分以内で、買ってから冷凍・解凍しなくてよい物だけ（なければ付けない）。
      pool = pool.filter((d) => {
        if (d.minutes > 10) return false;
        const risk = freshnessRisk(env, d, slot.date);
        return risk.freeze.length === 0 && risk.spoil.length === 0;
      });
    }
    if (pool.length === 0) continue;
    const best = pool.map((d) => scoreSide(env, slot, d, main, mainIngIds)).sort((a, b) => b.score - a.score)[0];
    sides.push(best.dish);
    factors.push(...best.factors);
  }
  return { sides, factors };
}

/** その日の前後の献立から、制約（新しい料理の残り、ジャンルの数）を作る。 */
export function constraintsForDate(env: PlanEnv, date: ISODate): Constraints {
  const ws = weekStartOf(date);
  const weekMeals = env.state.meals.filter((m) => weekStartOf(m.date) === ws && m.date !== date && m.status !== 'skipped');
  const genreCount = new Map<Genre, number>();
  for (const m of weekMeals) {
    const d = m.kind === 'normal' ? findDishIn(env.household, env.catalog, m.dishIds[0] ?? '') : undefined;
    if (d) genreCount.set(d.genre, (genreCount.get(d.genre) ?? 0) + 1);
  }
  const normalCount = weekMeals.filter((m) => m.kind === 'normal').length + 1;
  const used = weekMeals.reduce((a, m) => a + m.newDishIds.length, 0);
  return {
    newQuotaLeft: Math.max(0, Math.min(2, env.settings.newPerWeek) - used),
    genreCount,
    genreCap: genreCapFor(env.household, env.catalog, normalCount),
    isNew: (d) => isNewDish(env.state, d),
  };
}

// ---------------------------------------------------------------------------
// 1食の組み立て（理由・注意・メモ）
// ---------------------------------------------------------------------------

function pickReasons(factors: Factor[], forced: string[] = []): string[] {
  const out = [...forced];
  // 決まった理由と同じ日付に触れる理由（「11/9(月)の分を移しました」と「11/9(月)にできなかった…」）は重ねない。
  const forcedDates = new Set(forced.flatMap((r) => r.match(/\d{1,2}\/\d{1,2}\([日月火水木金土]\)/g) ?? []));
  const sorted = [...factors].sort((a, b) => b.priority - a.priority);
  for (const f of sorted) {
    if (out.length >= 2) break;
    if ([...forcedDates].some((d) => f.text.includes(d))) continue;
    if (!out.includes(f.text)) out.push(f.text);
  }
  if (out.length === 0) out.push('今週のバランスを見て');
  return out.slice(0, 2);
}

/** 注意（要確認・はちみつ・辛さ）とメモ（買ったら冷凍・解凍・期限）。 */
export function mealExtras(env: PlanEnv, date: ISODate, dishes: Dish[], eaters: Member[]): { warnings: string[]; notes: string[] } {
  const warnings: string[] = [];
  const notes: string[] = [];
  const hasInfant = env.household.members.some((m) => m.ageBand === 'infant');
  for (const d of dishes) {
    const res = safetyFor(env, d, eaters);
    if (res.status === 'uncertain') warnings.push(uncertainWarning(d, res, env.catalog));
    if (hasInfant && usesHoney(d, env.household, env.catalog)) {
      warnings.push(`${d.name}にははちみつを使います。1歳未満の子には与えないでください`);
    }
    if (d.spicy && hasKids(eaters)) warnings.push(`${d.name}は辛い料理です。子どもの分は辛みを入れる前に取り分けてください`);
  }
  const shop = shoppingDateFor(env.settings, env.today, date);
  let foodSafety = false;
  const seen = new Set<string>();
  for (const d of dishes) {
    for (const ing of ingredientObjs(env, d)) {
      if (ing.pantry || seen.has(ing.id)) continue;
      seen.add(ing.id);
      const inv = env.inventory.get(ing.id);
      const st = stockState(env, ing, date);
      // 貝・きのこ・冷凍野菜・惣菜などは、凍ったまま加熱する（冷蔵室で解凍しない）。
      const thaw = ing.thaw === 'from_frozen' ? '凍ったまま加熱してください' : '前日の夜に冷蔵室へ移して解凍';
      if (st === 'frozen') {
        notes.push(`冷凍の${ing.name}は、${thaw}`);
        foodSafety = true;
        continue;
      }
      if (st === 'perishable' && inv) {
        if (ing.shelfLifeDays - diffDays(date, inv.acquiredOn) <= 1) {
          notes.push(`${ing.name}は消費期限を確かめてから使ってください`);
          foodSafety = true;
        }
        continue;
      }
      if (st === 'fresh') continue;
      if (date >= env.today && shopGap(env, ing, date) > ing.shelfLifeDays) {
        if (ing.freezable) notes.push(`${ing.name}は${formatJa(shop)}に買ったら冷凍。${thaw}`);
        else notes.push(`${ing.name}は${formatJa(date)}まで持たないかもしれません。消費期限を確かめてください`);
        foodSafety = true;
      }
    }
  }
  if (foodSafety) notes.push(NOTICE_FOOD_SAFETY);
  return { warnings: uniq(warnings), notes: uniq(notes) };
}

export function composeMeal(
  env: PlanEnv,
  slot: Slot,
  kind: 'normal' | 'raku',
  dishes: Dish[],
  factors: Factor[],
  extra: { reasons?: string[]; warnings?: string[]; changedBy?: PlannedMeal['changedBy'] } = {},
): PlannedMeal {
  const ex = mealExtras(env, slot.date, dishes, slot.eaters);
  const meal: PlannedMeal = {
    date: slot.date,
    dishIds: dishes.map((d) => d.id),
    kind,
    servings: servingsFor(env.household, slot.absent),
    absentMemberIds: [...slot.absent],
    reasons: pickReasons(factors, extra.reasons),
    warnings: uniq([...(extra.warnings ?? []), ...ex.warnings]),
    notes: ex.notes,
    status: 'planned',
    newDishIds: dishes.filter((d) => isNewDish(env.state, d)).map((d) => d.id),
  };
  if (extra.changedBy) meal.changedBy = extra.changedBy;
  return meal;
}

function fishFactor(env: PlanEnv, date: ISODate): Factor {
  const gap = diffDays(date, shoppingDateFor(env.settings, env.today, date));
  if (gap === 0) return { text: '買い物の日なので魚に', priority: 4 };
  if (gap === 1) return { text: '買い物の翌日なので魚に', priority: 4 };
  return { text: '今週の魚の日', priority: 2 };
}

/**
 * 決まった料理で1食を作り直す（差し替え・提案の承諾・組み直しで使う）。
 * 理由・注意・メモ・人数は、その時点の state から計算し直す。
 */
export function rebuildMeal(
  state: AppState,
  catalog: Catalog,
  date: ISODate,
  dishIds: string[],
  opts: { kind?: 'normal' | 'raku'; changedBy?: PlannedMeal['changedBy']; reasons?: string[]; warnings?: string[]; absent?: string[] } = {},
): PlannedMeal {
  const env = makeEnv(state, catalog, new Set([date]), seedFrom(`${state.household.id}${date}rebuild`));
  const prev = mealOn(state, date);
  const slot = makeSlot(env, date, opts.absent ?? prev?.absentMemberIds ?? []);
  const dishes = dishIds.map((id) => findDishIn(state.household, catalog, id)).filter((d): d is Dish => !!d);
  const kind = opts.kind ?? (dishes[0]?.role === 'raku' ? 'raku' : 'normal');
  let factors: Factor[] = [];
  const head = dishes[0];
  if (head) {
    factors = kind === 'raku' ? scoreRaku(env, slot, head).factors : scoreMain(env, slot, head).factors;
    if (kind === 'normal' && (head.protein === 'fish' || head.protein === 'seafood')) {
      const f = fishFactor(env, date);
      if (f.priority >= 4) factors.push(f);
    }
  }
  const forced = opts.reasons ?? (kind === 'raku' && head ? [rakuReason(head)] : []);
  return composeMeal(env, slot, kind, dishes, factors, { reasons: forced, warnings: opts.warnings, changedBy: opts.changedBy });
}

// ---------------------------------------------------------------------------
// 週の献立
// ---------------------------------------------------------------------------

function chooseRakuDates(env: PlanEnv, slots: Slot[], count: number): Set<ISODate> {
  const picked = new Set<ISODate>();
  if (count <= 0) return picked;
  const ranked = slots
    .map((s) => {
      const wd = weekdayOf(s.date);
      const wdM = wd === 0 ? 7 : wd;
      let p = 10 - Math.abs(wdM - 3) * 2; // 週の中ほど（水曜）を優先
      const max = env.settings.maxMinutes[wd];
      if (max !== undefined) p += Math.max(0, (45 - max) / 3); // 調理時間の上限が短い曜日を優先
      return { date: s.date, p: p + env.rng() * 0.1 };
    })
    .sort((a, b) => b.p - a.p);
  for (const r of ranked) {
    if (picked.size >= count) break;
    const adjacent = [...picked].some((d) => Math.abs(diffDays(d, r.date)) === 1);
    if (!adjacent) picked.add(r.date);
  }
  for (const r of ranked) {
    if (picked.size >= count) break;
    picked.add(r.date);
  }
  return picked;
}

function chooseFishDate(env: PlanEnv, slots: Slot[], cons: Constraints): ISODate | null {
  const candidates = slots.filter((s) => env.mains.some((d) => d.protein === 'fish' && passes(env, s, d, 0, cons)));
  if (candidates.length === 0) return null;
  const gapOf = (s: Slot) => diffDays(s.date, shoppingDateFor(env.settings, env.today, s.date));
  const near = candidates.filter((s) => gapOf(s) <= 1); // 買い物日の当日か翌日
  const pool = near.length > 0 ? near : candidates;
  return [...pool].sort((a, b) => gapOf(a) - gapOf(b) || (a.date < b.date ? -1 : 1))[0].date;
}

function chooseNewDate(env: PlanEnv, slots: Slot[], fishDate: ISODate | null, cons: Constraints): ISODate | null {
  const candidates = slots.filter(
    (s) => s.date !== fishDate && env.mains.some((d) => cons.isNew(d) && passes(env, s, d, 0, cons)),
  );
  if (candidates.length === 0) return null;
  const first = slots[0]?.date;
  let best: { date: ISODate; p: number } | null = null;
  for (const s of candidates) {
    const max = env.settings.maxMinutes[weekdayOf(s.date)];
    const gap = diffDays(s.date, shoppingDateFor(env.settings, env.today, s.date));
    const p =
      (max === undefined || max >= 30 ? 2 : 0) +
      (gap <= 1 ? 1 : 0) +
      (s.date === first && slots.length >= 3 ? -3 : 0) +
      env.rng() * 0.5;
    if (!best || p > best.p) best = { date: s.date, p };
  }
  return best?.date ?? null;
}

/**
 * weekStart の週の献立を作る（fromDate より前の日は作らない）。salt は「作り直す」で別の結果にしたいときに使う。
 */
export function planWeek(
  state: AppState,
  catalog: Catalog,
  weekStart: ISODate,
  fromDate?: ISODate,
  salt = '',
  keepDates: Set<ISODate> = new Set(),
): PlannedMeal[] {
  const settings = state.household.settings;
  const from = fromDate && fromDate > weekStart ? fromDate : weekStart;
  const weekDates = dinnerDatesOfWeek(settings, weekStart);
  // keepDates の日（自分で替えた日など）は作り直さず、決まった献立として扱う。
  const dates = weekDates.filter((d) => d >= from && !keepDates.has(d));
  if (dates.length === 0) return [];
  const dateSet = new Set(dates);
  const env = makeEnv(state, catalog, dateSet, seedFrom(state.household.id + weekStart + salt));
  const existing = state.meals.filter((m) => weekDates.includes(m.date) && !dateSet.has(m.date));
  const prevAbsent = new Map(state.meals.filter((m) => dateSet.has(m.date)).map((m) => [m.date, m.absentMemberIds]));
  const slots = dates.map((d) => makeSlot(env, d, prevAbsent.get(d) ?? []));

  // ラク日と新しい料理の数（途中からの週は日数に合わせる）
  const existingRaku = existing.filter((m) => m.kind === 'raku').length;
  let rakuCount =
    existing.length > 0
      ? settings.rakuPerWeek - existingRaku
      : Math.round((settings.rakuPerWeek * dates.length) / Math.max(1, weekDates.length));
  rakuCount = Math.max(0, Math.min(dates.length, rakuCount));
  const existingNew = existing.reduce((a, m) => a + m.newDishIds.length, 0);
  let newQuota = Math.max(0, Math.min(2, settings.newPerWeek) - existingNew);
  if (dates.length < 3 && existing.length === 0) newQuota = 0;

  const rakuDates = chooseRakuDates(env, slots, rakuCount);
  const normalSlots = slots.filter((s) => !rakuDates.has(s.date));

  const genreCount = new Map<Genre, number>();
  for (const m of existing) {
    const d = m.kind === 'normal' ? findDishIn(state.household, catalog, m.dishIds[0] ?? '') : undefined;
    if (d) genreCount.set(d.genre, (genreCount.get(d.genre) ?? 0) + 1);
  }
  const totalNormal = normalSlots.length + existing.filter((m) => m.kind === 'normal').length;
  const cons: Constraints = {
    newQuotaLeft: newQuota,
    genreCount,
    genreCap: genreCapFor(state.household, catalog, totalNormal),
    isNew: (d) => isNewDish(state, d),
  };

  const weekHasFish = existing.some((m) => {
    const d = findDishIn(state.household, catalog, m.dishIds[0] ?? '');
    return m.kind === 'normal' && d?.protein === 'fish';
  });
  const fishDate = weekHasFish ? null : chooseFishDate(env, normalSlots, cons);
  const newDate = cons.newQuotaLeft > 0 ? chooseNewDate(env, normalSlots, fishDate, cons) : null;

  const order = [...normalSlots].sort((a, b) => {
    const pa = a.date === fishDate ? 0 : a.date === newDate ? 1 : 2;
    const pb = b.date === fishDate ? 0 : b.date === newDate ? 1 : 2;
    return pa - pb || (a.date < b.date ? -1 : 1);
  });

  const chosenMain = new Map<ISODate, Dish>();
  const fallback = new Set<ISODate>();
  // 新しい料理として数えた日（newPerWeek の範囲）。超えた分は「多めにしました」と最初の1日だけに書く。
  const countedNew = new Set<ISODate>();
  const countNew = (date: ISODate, dish: Dish) => {
    if (!cons.isNew(dish)) return;
    if (cons.newQuotaLeft > 0) countedNew.add(date);
    cons.newQuotaLeft -= 1;
  };
  const assign = (date: ISODate, dish: Dish, kind: 'normal' | 'raku') => {
    env.byDate.set(date, { kind, dishes: [dish] });
    addEaten(env, dish.id, date);
  };
  for (const slot of order) {
    let pick: Scored | undefined;
    if (slot.date === fishDate) pick = rankMains(env, slot, cons, (d) => d.protein === 'fish', 1, 0).ranked[0];
    else if (slot.date === newDate && cons.newQuotaLeft > 0) pick = rankMains(env, slot, cons, cons.isNew, 1, 0).ranked[0];
    pick ??= rankMains(env, slot, cons).ranked[0];
    if (!pick) {
      fallback.add(slot.date);
      continue;
    }
    assign(slot.date, pick.dish, 'normal');
    chosenMain.set(slot.date, pick.dish);
    countNew(slot.date, pick.dish);
    cons.genreCount.set(pick.dish.genre, (cons.genreCount.get(pick.dish.genre) ?? 0) + 1);
  }

  const chosenRaku = new Map<ISODate, Dish>();
  for (const slot of slots) {
    if (!rakuDates.has(slot.date) && !fallback.has(slot.date)) continue;
    const raku = rankRaku(env, slot)[0];
    if (raku) {
      assign(slot.date, raku.dish, 'raku');
      chosenRaku.set(slot.date, raku.dish);
      continue;
    }
    if (rakuDates.has(slot.date)) {
      // ラク日用の料理が使えない世帯（除外が多いなど）は、短時間の主菜にする
      const quick =
        rankMains(env, slot, cons, (d) => d.minutes <= 20).ranked[0] ?? rankMains(env, slot, cons).ranked[0];
      if (quick) {
        assign(slot.date, quick.dish, 'normal');
        chosenMain.set(slot.date, quick.dish);
        countNew(slot.date, quick.dish);
      }
    }
  }

  const meals: PlannedMeal[] = [];
  let extraNewNoted = false;
  for (const slot of slots) {
    const main = chosenMain.get(slot.date);
    if (main) {
      const { sides, factors } = pickSides(env, slot, main, false);
      for (const sd of sides) addEaten(env, sd.id, slot.date);
      env.byDate.set(slot.date, { kind: 'normal', dishes: [main, ...sides] });
      const all = [...scoreMain(env, slot, main).factors, ...factors];
      if (slot.date === fishDate && main.protein === 'fish') all.push(fishFactor(env, slot.date));
      if (cons.isNew(main)) {
        if (countedNew.has(slot.date)) all.push({ text: NEW_DISH_REASON, priority: 4 });
        else if (!extraNewNoted) {
          all.push({ text: EXTRA_NEW_DISH_REASON, priority: 5 });
          extraNewNoted = true;
        }
      }
      meals.push(composeMeal(env, slot, 'normal', [main, ...sides], all));
      continue;
    }
    const raku = chosenRaku.get(slot.date);
    if (raku) {
      const { sides, factors } = pickSides(env, slot, raku, true);
      for (const sd of sides) addEaten(env, sd.id, slot.date);
      env.byDate.set(slot.date, { kind: 'raku', dishes: [raku, ...sides] });
      const all = [...scoreRaku(env, slot, raku).factors, ...factors];
      meals.push(
        composeMeal(env, slot, 'raku', [raku, ...sides], all, {
          reasons: [rakuReason(raku)],
          warnings: fallback.has(slot.date) ? [RAKU_FALLBACK_WARNING] : [],
        }),
      );
      continue;
    }
    meals.push(
      composeMeal(env, slot, 'raku', [], [], {
        reasons: ['この日は外食や買ってきたもので'],
        warnings: [NOTHING_FOUND_WARNING],
      }),
    );
  }
  return meals;
}

/** 公開API：weekStart（月曜）の週の献立を作る。 */
export function generateWeekMeals(state: AppState, catalog: Catalog, weekStart: ISODate, fromDate?: ISODate): PlannedMeal[] {
  return planWeek(state, catalog, weekStart, fromDate);
}

/** 公開API：その日の差し替え候補（既定2つ）。主菜のたんぱく源が重ならないようにする。みんな外で食べる日は候補なし。 */
export function alternativesFor(state: AppState, catalog: Catalog, date: ISODate, count = 2): string[][] {
  const meal = mealOn(state, date);
  if (!meal || count <= 0 || everyoneOut(state.household, meal)) return [];
  const env = makeEnv(state, catalog, new Set([date]), seedFrom(`${state.household.id}${date}alt`));
  const slot = makeSlot(env, date, meal.absentMemberIds);
  const current = meal.dishIds[0];
  if (meal.kind === 'raku') {
    const ranked = rankRaku(env, slot).filter((r) => r.dish.id !== current);
    return ranked.slice(0, count).map((r) => [r.dish.id, ...pickSides(env, slot, r.dish, true).sides.map((d) => d.id)]);
  }
  const cons = constraintsForDate(env, date);
  const { ranked } = rankMains(env, slot, cons, (d) => d.id !== current, count);
  const rest = ranked.map((r) => r.dish);
  const picks: Dish[] = [];
  while (picks.length < count && rest.length > 0) {
    const used = new Set(picks.map((p) => p.protein));
    const idx = rest.findIndex((d) => !used.has(d.protein));
    picks.push(rest.splice(idx >= 0 ? idx : 0, 1)[0]);
  }
  return picks.map((d) => [d.id, ...pickSides(env, slot, d, false).sides.map((s) => s.id)]);
}

/** 今日を含む週の中で、ラク日用の料理を選ぶ（「今日は無理」で使う）。 */
export function bestRakuFor(state: AppState, catalog: Catalog, date: ISODate, absent: string[], salt = ''): Scored[] {
  const env = makeEnv(state, catalog, new Set([date]), seedFrom(`${state.household.id}${date}raku${salt}`));
  return rankRaku(env, makeSlot(env, date, absent));
}

/** その日に食べる人の条件で、料理を出してよいか（ユーザーの指定でも安全はゆるめない）。 */
export function isSafeOn(state: AppState, catalog: Catalog, dish: Dish, absent: string[]): SafetyResult {
  return checkDishSafetyFor(dish, eatingMembers(state.household, absent), state.household, catalog);
}

/** 1つの料理の主菜としての点数（特売やリクエストの提案で使う）。 */
export function scoreMainOn(
  state: AppState,
  catalog: Catalog,
  date: ISODate,
  dish: Dish,
): { score: number; allowed: boolean; recent: boolean; factors: Factor[] } {
  const meal = mealOn(state, date);
  const env = makeEnv(state, catalog, new Set([date]), seedFrom(`${state.household.id}${date}one`));
  const slot = makeSlot(env, date, meal?.absentMemberIds ?? []);
  const s = scoreMain(env, slot, dish);
  const gap = nearestGap(env, dish.id, date);
  return { score: s.score, allowed: allowedOn(env, dish, slot), recent: gap !== null && gap <= 7, factors: s.factors };
}

/** 主菜に合う副菜・汁物を選ぶ（提案で使う）。 */
export function sidesFor(state: AppState, catalog: Catalog, date: ISODate, main: Dish, exclude: string[] = []): string[] {
  const meal = mealOn(state, date);
  const env = makeEnv(state, catalog, new Set([date]), seedFrom(`${state.household.id}${date}sides`));
  const slot = makeSlot(env, date, meal?.absentMemberIds ?? []);
  return pickSides(env, slot, main, main.role === 'raku', exclude).sides.map((d) => d.id);
}
