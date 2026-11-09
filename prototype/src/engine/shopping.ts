// 買い物リスト（DESIGN.md 3-6）。集約・換算・丸め・在庫の差し引きはすべてコードで行う。
import type { AppState, Catalog, ISODate, Ingredient, ShoppingItem, ShoppingList, StockLevel, Unit } from './types';
import { AISLE_ORDER, UNIT_LABEL } from './types';
import { diffDays, formatJa, weekdayOf } from './dates';
import { findDishIn, hasAllergenExclusion, ingredientsOf, shoppingDateFor } from './context';
import { compareJa } from './util';

export const FREEZE_NOTE = '買ったら冷凍';

interface Use {
  date: ISODate; // 献立の日
  shopDate: ISODate; // 買う日
  amount: number; // unit での量（人数換算済み）
}

/** g・ml は10単位、個などは0.5単位、大さじ・小さじは1単位で切り上げる。 */
export function roundAmount(amount: number, unit: Unit): number {
  const eps = 1e-9;
  switch (unit) {
    case 'g':
    case 'ml':
      return Math.max(10, Math.ceil(amount / 10 - eps) * 10);
    case 'tbsp':
    case 'tsp':
      return Math.max(1, Math.ceil(amount - eps));
    default:
      return Math.max(0.5, Math.ceil(amount * 2 - eps) / 2);
  }
}

export function formatAmount(amount: number, unit: Unit): string {
  const n = Number.isInteger(amount) ? String(amount) : amount.toFixed(1).replace(/\.0$/, '');
  if (unit === 'tbsp' || unit === 'tsp') return `${UNIT_LABEL[unit]}${n}`;
  return `${n}${UNIT_LABEL[unit]}`;
}

/**
 * パックの数。重さ・量（g・ml）は「約300g」のように幅があるので、1割までの超過は同じパック数にする。
 * 個数で数える物（卵など）は足りなくならないよう、そのまま切り上げる。
 */
export function packCount(need: number, ing: Ingredient): number | null {
  if (!ing.pack || ing.pack.size <= 0) return null;
  const tolerance = ing.unit === 'g' || ing.unit === 'ml' ? 1.1 : 1;
  return Math.max(1, Math.ceil(need / (ing.pack.size * tolerance) - 1e-9));
}

export function itemLabel(ing: Ingredient, amount: number, packs: number | null): string {
  if (ing.pack && packs !== null) return `${ing.name} ${ing.pack.label}${packs > 1 ? `×${packs}` : ''}`;
  return `${ing.name} ${formatAmount(amount, ing.unit)}`;
}

function usableLevel(state: AppState, ing: Ingredient, date: ISODate): StockLevel {
  const it = state.inventory.find((i) => i.ingredientId === ing.id);
  if (!it || it.level === 'none') return 'none';
  if (!it.frozen && diffDays(date, it.acquiredOn) > ing.shelfLifeDays) return 'none';
  return it.level;
}

/** 公開API：献立と在庫から買い物リストを作り直す。既存リストのチェック状態は引き継ぐ。 */
export function buildShoppingLists(state: AppState, catalog: Catalog): ShoppingList[] {
  const { household, today } = state;
  const settings = household.settings;
  const markUncertain = hasAllergenExclusion(household);

  // 過ぎた買い物日のリストは、まだ先の献立の分があるあいだ残す（買った物を二重に載せない）。
  const past = state.shopping.filter((l) => l.date < today && l.items.some((i) => i.forDates.some((d) => d >= today)));
  const covered = new Set<string>();
  for (const l of past) for (const it of l.items) for (const d of it.forDates) if (d >= today) covered.add(`${it.ingredientId}|${d}`);
  const prevChecked = new Set<string>();
  for (const l of state.shopping) for (const it of l.items) if (it.checked) prevChecked.add(`${l.date}|${it.ingredientId}`);

  const uses = new Map<string, Use[]>();
  const pantry = new Map<ISODate, Set<string>>();
  const shopDates = new Set<ISODate>();
  // 「切れた」と言われた常備品（在庫が none）は、最初に使う日の買い物リストに「買い足し」として載せる。
  const refills = new Map<string, { shopDate: ISODate; dates: ISODate[] }>();
  const outOfStock = (ingId: string) => state.inventory.some((i) => i.ingredientId === ingId && i.level === 'none');
  const meals = state.meals
    .filter((m) => m.date >= today && m.status === 'planned' && m.servings > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const meal of meals) {
    const shopDate = shoppingDateFor(settings, today, meal.date);
    const pantryNames: string[] = [];
    let fresh = 0;
    let coveredCount = 0;
    for (const dishId of meal.dishIds) {
      const dish = findDishIn(household, catalog, dishId);
      if (!dish) continue;
      for (const di of ingredientsOf(household, dish)) {
        const ing = catalog.ingredientById.get(di.ingredientId);
        if (!ing || di.amount <= 0) continue;
        if (ing.pantry) {
          const r = refills.get(ing.id);
          if (covered.has(`${ing.id}|${meal.date}`)) continue; // 前のリストで買い足し済み（または載っている）
          if (r) {
            if (!r.dates.includes(meal.date)) r.dates.push(meal.date);
          } else if (outOfStock(ing.id) || prevChecked.has(`${shopDate}|${ing.id}`)) {
            refills.set(ing.id, { shopDate, dates: [meal.date] });
          } else {
            pantryNames.push(ing.name);
          }
          continue;
        }
        if (covered.has(`${ing.id}|${meal.date}`)) {
          coveredCount += 1;
          continue;
        }
        fresh += 1;
        // 惣菜は日持ちしないので、その日の分は当日に買う（帰りに買う）。数日前に買って冷凍・解凍させない。
        const buyOn = ing.aisle === 'deli' ? meal.date : shopDate;
        const list = uses.get(ing.id) ?? [];
        list.push({ date: meal.date, shopDate: buyOn, amount: di.amount * meal.servings });
        uses.set(ing.id, list);
      }
    }
    // 前の買い物日にまとめて買った献立は、常備品の確認も前のリストで済んでいる。
    if (pantryNames.length > 0 && !(fresh === 0 && coveredCount > 0)) {
      const set = pantry.get(shopDate) ?? new Set<string>();
      for (const name of pantryNames) set.add(name);
      pantry.set(shopDate, set);
      shopDates.add(shopDate);
    }
  }

  const itemsByDate = new Map<ISODate, ShoppingItem[]>();
  for (const [ingId, list] of uses) {
    const ing = catalog.ingredientById.get(ingId);
    if (!ing) continue;
    const checkedDates = new Set(list.map((u) => u.shopDate).filter((d) => prevChecked.has(`${d}|${ingId}`)));
    // チェックで在庫になった分は、そのリストの献立で使う前提にする（ほかのリストからは差し引かない）。
    let level: StockLevel = checkedDates.size > 0 ? 'none' : usableLevel(state, ing, list[0].date);
    const groups = new Map<ISODate, Use[]>();
    for (const u of list) groups.set(u.shopDate, [...(groups.get(u.shopDate) ?? []), u]);
    for (const shopDate of [...groups.keys()].sort()) {
      const group = groups.get(shopDate)!.sort((a, b) => (a.date < b.date ? -1 : 1));
      const checked = checkedDates.has(shopDate);
      let need = 0;
      const forDates: ISODate[] = [];
      for (const u of group) {
        let amount = u.amount;
        if (!checked && level !== 'none' && usableLevel(state, ing, u.date) !== 'none') {
          if (level === 'plenty') {
            amount = 0;
            level = 'some';
          } else {
            amount = Math.max(0, amount - (ing.pack ? ing.pack.size / 2 : amount / 2));
            level = 'none';
          }
        }
        if (amount > 1e-9) {
          need += amount;
          if (!forDates.includes(u.date)) forDates.push(u.date);
        }
      }
      if (need <= 1e-9) continue;
      const amount = roundAmount(need, ing.unit);
      const packs = packCount(need, ing);
      const late = forDates.filter((d) => diffDays(d, shopDate) > ing.shelfLifeDays);
      const notes: string[] = [];
      if (late.length > 0) {
        if (ing.freezable) {
          notes.push(late.length === forDates.length ? FREEZE_NOTE : `${FREEZE_NOTE}（${late.map(formatJa).join('・')}の分）`);
        } else {
          notes.push(`日持ちに注意（${late.map(formatJa).join('・')}に使う）`);
        }
      }
      const item: ShoppingItem = {
        ingredientId: ing.id,
        name: ing.name,
        aisle: ing.aisle,
        amount,
        unit: ing.unit,
        packs,
        label: itemLabel(ing, amount, packs),
        forDates: forDates.sort(),
        checked,
        notes,
        uncertain: ing.uncertain && markUncertain,
      };
      itemsByDate.set(shopDate, [...(itemsByDate.get(shopDate) ?? []), item]);
      shopDates.add(shopDate);
    }
  }

  for (const [ingId, r] of refills) {
    const ing = catalog.ingredientById.get(ingId);
    if (!ing) continue;
    const item: ShoppingItem = {
      ingredientId: ing.id,
      name: ing.name,
      aisle: ing.aisle,
      amount: 1,
      unit: ing.unit,
      packs: null,
      label: `${ing.name} 買い足し`,
      forDates: [...r.dates].sort(),
      checked: prevChecked.has(`${r.shopDate}|${ing.id}`),
      notes: [],
      uncertain: ing.uncertain && markUncertain,
    };
    itemsByDate.set(r.shopDate, [...(itemsByDate.get(r.shopDate) ?? []), item]);
    shopDates.add(r.shopDate);
  }

  const fresh: ShoppingList[] = [...shopDates].sort().map((date) => ({
    date,
    items: (itemsByDate.get(date) ?? []).sort(
      (a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || compareJa(a.name, b.name),
    ),
    pantry: [...(pantry.get(date) ?? [])].sort(compareJa),
  }));
  // 常備品の確認だけのリストは、買い物の曜日だけ出す（買う物がない日にリストは要らない）。
  const useful = (l: ShoppingList) =>
    l.items.length > 0 || (l.pantry.length > 0 && settings.shoppingWeekdays.includes(weekdayOf(l.date)));
  return [...past, ...fresh.filter(useful)].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/** その献立日の材料が載っているリスト（あれば）。 */
export function listsForMeal(state: AppState, date: ISODate): ShoppingList[] {
  return state.shopping.filter((l) => l.items.some((i) => i.forDates.includes(date)));
}
