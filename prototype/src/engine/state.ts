// 状態の作成・時間の進行・在庫（DESIGN.md 3-1・3-7・3-10）。
import type {
  AppState,
  Catalog,
  Dish,
  FavoriteDish,
  Household,
  HouseholdSettings,
  ISODate,
  Member,
  OnboardingInput,
  PlannedMeal,
  StepResult,
  StockLevel,
} from './types';
import { addDays, formatJa, weekStartOf, weekdayOf } from './dates';
import { seedFrom } from './rng';
import { dinnerDatesOfWeek, findDishIn, ingredientsOf, mealOn, sortMeals } from './context';
import { planWeek } from './planner';
import { buildShoppingLists, FREEZE_NOTE } from './shopping';
import { householdNotices } from './safety';
import { addBotMessage, chatIds, clone, newBotMessages, normalizeJa, uniq } from './util';
import { addMealMessage, addWeekMessage, BTN_SHOPPING, BTN_TODAY, lastWeekSummaryText } from './messages';
import { mealTitle } from './text';

export function defaultSettings(input: Pick<OnboardingInput, 'plan' | 'shoppingWeekdays'>): HouseholdSettings {
  return {
    plan: input.plan,
    dinnerWeekdays: [1, 2, 3, 4, 5],
    shoppingWeekdays: uniq(input.shoppingWeekdays).sort(),
    rakuPerWeek: 1,
    newPerWeek: 1,
    sidePolicy: 'side_or_soup',
    maxMinutes: {},
    allowUncertainWithExclusions: false,
  };
}

/** 自由入力の定番（材料がわからない主菜）。 */
export function customDish(id: string, name: string): Dish {
  return {
    id,
    name,
    role: 'main',
    protein: 'none',
    genre: 'wa',
    minutes: 30,
    ingredients: [],
    kidFriendly: true,
    spicy: false,
    tags: ['custom'],
    custom: true,
  };
}

function buildHousehold(input: OnboardingInput, catalog: Catalog, today: ISODate): Household {
  const members: Member[] = input.members.map((m, i) => ({
    ...clone(m),
    id: `member_${i + 1}`,
  }));
  const favorites: FavoriteDish[] = uniq(input.favoriteDishIds)
    .filter((id) => catalog.dishById.has(id))
    .map((dishId) => ({ dishId }));
  const customDishes: Dish[] = [];
  const byName = new Map(catalog.dishes.map((d) => [normalizeJa(d.name), d.id]));
  for (const raw of input.customFavoriteNames) {
    const name = raw.trim();
    if (!name) continue;
    const known = byName.get(normalizeJa(name));
    if (known) {
      if (!favorites.some((f) => f.dishId === known)) favorites.push({ dishId: known });
      continue;
    }
    if (customDishes.some((d) => d.name === name)) continue;
    const dish = customDish(`custom_${customDishes.length + 1}`, name);
    customDishes.push(dish);
    favorites.push({ dishId: dish.id }); // 「うちの材料メモ」（overrides）をあとで付けられるように
  }
  return {
    id: `h_${seedFrom(JSON.stringify(input) + today).toString(36)}`,
    members,
    favorites,
    customDishes,
    settings: defaultSettings(input),
    createdAt: today,
  };
}

/** 来週の献立を作る日：来週の最初の献立日の材料を買う日の前日。 */
export function planDateForWeek(state: AppState, weekStart: ISODate): ISODate | null {
  const settings = state.household.settings;
  const dinners = dinnerDatesOfWeek(settings, weekStart);
  if (dinners.length === 0) return null;
  const first = dinners[0];
  let shop: ISODate = first; // 買い物日がなければ、献立日の当日を買い物日として扱う
  for (let i = 0; i <= 6; i++) {
    const d = addDays(first, -i);
    if (settings.shoppingWeekdays.includes(weekdayOf(d))) {
      shop = d;
      break;
    }
  }
  return addDays(shop, -1);
}

/**
 * 必要なら来週の献立を作る（state を書き換える）。作った週の月曜を返す。
 * now を付けると、作る日（最初の買い物日の前日）を待たずに作る（初回で今週の献立日が残っていないとき）。
 */
export function ensureUpcomingWeek(s: AppState, catalog: Catalog, now = false): ISODate | null {
  const next = addDays(weekStartOf(s.today), 7);
  if (s.meals.some((m) => weekStartOf(m.date) === next)) return null;
  const planDate = planDateForWeek(s, next);
  if (!planDate || (!now && s.today < planDate)) return null;
  const meals = planWeek(s, catalog, next);
  if (meals.length === 0) return null;
  s.meals = sortMeals([...s.meals, ...meals]);
  return next;
}

/** 今週の献立がまったくない（読み込んだ状態など）ときは、今日以降の分を作る。 */
function ensureCurrentWeek(s: AppState, catalog: Catalog): ISODate | null {
  const ws = weekStartOf(s.today);
  if (s.meals.some((m) => weekStartOf(m.date) === ws)) return null;
  const meals = planWeek(s, catalog, ws, s.today);
  if (meals.length === 0) return null;
  s.meals = sortMeals([...s.meals, ...meals]);
  return ws;
}

// ---------------------------------------------------------------------------
// 在庫
// ---------------------------------------------------------------------------

/** 在庫を設定する。plenty にするときは acquiredOn を今日にする。 */
export function setStock(s: AppState, ingredientId: string, level: StockLevel, frozen = false): void {
  const it = s.inventory.find((i) => i.ingredientId === ingredientId);
  if (it) {
    it.level = level;
    if (level === 'plenty') {
      it.acquiredOn = s.today;
      it.frozen = frozen;
    }
    if (level === 'none') it.frozen = false;
  } else {
    s.inventory.push({ ingredientId, level, acquiredOn: s.today, frozen: level === 'none' ? false : frozen });
  }
}

/** 「作った」→ その日の材料の在庫を1段階下げる。 */
export function lowerStockForMeal(s: AppState, catalog: Catalog, meal: PlannedMeal): void {
  const ids = new Set<string>();
  for (const dishId of meal.dishIds) {
    const dish = findDishIn(s.household, catalog, dishId);
    if (!dish) continue;
    for (const di of ingredientsOf(s.household, dish)) ids.add(di.ingredientId);
  }
  for (const it of s.inventory) {
    if (!ids.has(it.ingredientId)) continue;
    const ing = catalog.ingredientById.get(it.ingredientId);
    if (ing?.pantry) continue;
    if (it.level === 'plenty') it.level = 'some';
    else if (it.level === 'some') {
      it.level = 'none';
      it.frozen = false;
    }
  }
}

/** その献立日に、冷凍室から出す必要がある食材の名前。 */
export function frozenIngredientNames(s: AppState, catalog: Catalog, meal: PlannedMeal): string[] {
  const names: string[] = [];
  for (const dishId of meal.dishIds) {
    const dish = findDishIn(s.household, catalog, dishId);
    if (!dish) continue;
    for (const di of ingredientsOf(s.household, dish)) {
      const ing = catalog.ingredientById.get(di.ingredientId);
      if (!ing || ing.pantry || names.includes(ing.name)) continue;
      const inv = s.inventory.find((i) => i.ingredientId === ing.id);
      const frozenStock = !!inv && inv.level !== 'none' && inv.frozen;
      const toldToFreeze = s.shopping.some((l) =>
        l.items.some(
          (it) =>
            it.ingredientId === ing.id &&
            it.forDates.includes(meal.date) &&
            it.notes.some((n) => n === FREEZE_NOTE || (n.startsWith(FREEZE_NOTE) && n.includes(formatJa(meal.date)))),
        ),
      );
      if (frozenStock || toldToFreeze) names.push(ing.name);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// 初回と時間の進行
// ---------------------------------------------------------------------------

/** 公開API：初回の質問の答えから状態を作る。 */
export function createInitialState(input: OnboardingInput, catalog: Catalog, today: ISODate): AppState {
  const household = buildHousehold(input, catalog, today);
  const s: AppState = {
    version: 1,
    today,
    household,
    meals: [],
    history: [],
    inventory: [],
    shopping: [],
    chat: [],
    proposals: [],
    seq: 0,
  };
  const ws = weekStartOf(today);
  s.meals = sortMeals(planWeek(s, catalog, ws, today));
  // 今週の献立日が残っていない（土曜に始めた など）ときは、すぐに来週の献立を作る（「すぐに献立が出る」体験のため）。
  const upcoming = ensureUpcomingWeek(s, catalog, s.meals.length === 0);
  s.shopping = buildShoppingLists(s, catalog);

  const thisWeek = s.meals.filter((m) => weekStartOf(m.date) === ws);
  const shownWeek = thisWeek.length > 0 ? ws : upcoming;
  const count = s.meals.filter((m) => weekStartOf(m.date) === shownWeek).length;
  const greeting = ['はじめまして。きめとくです。'];
  if (shownWeek) {
    greeting.push(
      `${shownWeek === ws ? '今週' : '来週'}の夕食${count}日分を決めておきました。何もしなければ、このまま確定します。`,
    );
    greeting.push('変えたい日は「別のに」、作れない日は「今日は無理」と送ってください。');
  } else {
    greeting.push('献立を作る日が近づいたら、夕食を決めてお知らせします。');
  }
  addBotMessage(s, greeting.join('\n'), { actions: [BTN_TODAY, BTN_SHOPPING] });

  const notices = householdNotices(household);
  addBotMessage(s, 'はじめに、大切なお知らせです。', {
    card: {
      kind: 'notice',
      level: notices.some((n) => n.level === 'warning') ? 'warning' : 'info',
      lines: notices.map((n) => n.text),
    },
  });
  if (shownWeek) addWeekMessage(s, catalog, shownWeek, { push: household.settings.plan === 'paid' ? true : undefined });
  return s;
}

/** 公開API：1日進める。 */
export function advanceDay(state: AppState, catalog: Catalog): StepResult {
  const s = clone(state);
  const before = chatIds(s);
  const yesterday = s.today;
  s.today = addDays(s.today, 1);
  const paid = s.household.settings.plan === 'paid';

  // 古い献立と、過ぎた提案を片づける（先週分は振り返りのために残す）。
  const keepFrom = addDays(weekStartOf(s.today), -7);
  s.meals = s.meals.filter((m) => m.date >= keepFrom);
  s.proposals = s.proposals.filter((p) => p.date >= s.today);

  // 前日の確認：無反応を「作った」とみなさない。1問だけ聞く。
  const ym = mealOn(s, yesterday);
  const askAbout = ym && ym.status === 'planned' && ym.dishIds.length > 0 ? ym : undefined;
  if (askAbout) askAbout.status = 'unconfirmed';

  ensureCurrentWeek(s, catalog);
  const generated = ensureUpcomingWeek(s, catalog);
  s.shopping = buildShoppingLists(s, catalog);

  if (askAbout) {
    addBotMessage(s, `昨日の${mealTitle(s, catalog, askAbout)}は作りましたか？`, {
      card: { kind: 'meal', date: yesterday },
      actions: [
        { label: '作った', action: { type: 'cooked', date: yesterday } },
        { label: '作らなかった', action: { type: 'not_cooked', date: yesterday } },
      ],
    });
  }

  if (paid) {
    if (generated) {
      addWeekMessage(s, catalog, generated, { push: true, summary: lastWeekSummaryText(s, catalog) || undefined });
    }
    const todayMeal = mealOn(s, s.today);
    if (todayMeal && todayMeal.status === 'planned') addMealMessage(s, catalog, s.today, { push: true });
    const tomorrow = mealOn(s, addDays(s.today, 1));
    if (tomorrow && tomorrow.status === 'planned') {
      const names = frozenIngredientNames(s, catalog, tomorrow);
      if (names.length > 0) {
        addBotMessage(
          s,
          `明日の${mealTitle(s, catalog, tomorrow)}用に、${names.join('と')}を冷凍室から冷蔵室へ移しておいてください。`,
          { card: { kind: 'meal', date: tomorrow.date }, push: true, hour: 20 },
        );
      }
    }
  }
  return { state: s, replies: newBotMessages(s, before) };
}
