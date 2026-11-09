// 受け入れテストの不変条件（DESIGN.md「6. 受け入れ条件」）。
// エンジンの内部は使わず、公開API（src/engine/index.ts）と型だけで、state を外から確かめる。
// どれも「違反の説明」の配列を返す（空なら合格）。テストが落ちたとき、どの日のどの料理かが分かるようにする。
import type { AppState, Catalog, Dish, DishIngredient, ISODate, Ingredient, Member, PlannedMeal } from '../engine/index';
import { AISLE_ORDER, addDays, diffDays, findDish, monthOf, weekStartOf, weekdayOf } from '../engine/index';

/** 照合用の正規化（NFKC、カタカナ→ひらがな、空白の除去）。 */
export function norm(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 自由入力の除外を語に分ける（「ピーマン、しいたけ」→ ぴーまん・しいたけ）。 */
export function textWords(text: string): string[] {
  return text
    .normalize('NFKC')
    .split(/[・、,，/／()（）\s]+/)
    .map(norm)
    .filter((w) => w.length > 0);
}

export function mealOn(s: AppState, date: ISODate): PlannedMeal | undefined {
  return s.meals.find((m) => m.date === date);
}

export function dishesOf(s: AppState, catalog: Catalog, meal: PlannedMeal): Dish[] {
  return meal.dishIds.map((id) => findDish(s, catalog, id)).filter((d): d is Dish => !!d);
}

export function headOf(s: AppState, catalog: Catalog, meal: PlannedMeal | undefined): Dish | undefined {
  return meal && meal.dishIds.length > 0 ? findDish(s, catalog, meal.dishIds[0]) : undefined;
}

/** 料理の材料（定番に「うちの材料メモ」があればそちら）。 */
export function ingredientsOf(s: AppState, dish: Dish): DishIngredient[] {
  const fav = s.household.favorites.find((f) => f.dishId === dish.id);
  return fav?.overrides && fav.overrides.length > 0 ? fav.overrides : dish.ingredients;
}

export function ingredientObjs(s: AppState, catalog: Catalog, dish: Dish): Ingredient[] {
  return ingredientsOf(s, dish)
    .map((di) => catalog.ingredientById.get(di.ingredientId))
    .filter((i): i is Ingredient => !!i);
}

/** その日に食べる人（欠席者と乳児を除く）。 */
export function eatersOf(s: AppState, meal: PlannedMeal): Member[] {
  return s.household.members.filter((m) => m.ageBand !== 'infant' && !meal.absentMemberIds.includes(m.id));
}

const label = (s: AppState, catalog: Catalog, meal: PlannedMeal) =>
  `${meal.date} ${meal.dishIds.map((id) => findDish(s, catalog, id)?.name ?? id).join('／') || '（料理なし）'}`;

/** 献立の対象にする日（作らなかった日は除く）。 */
const liveMeals = (s: AppState) => s.meals.filter((m) => m.status !== 'skipped');

// ---------------------------------------------------------------------------
// 安全
// ---------------------------------------------------------------------------

/**
 * 食べる人の除外に当たる料理が入っていないか。
 * allergen は食材の allergens（派生原材料を含む）、ingredient は食材の id、text は食材の名前・別名で判定する。
 * 除外の条件に allergen があり、要確認を許していなければ、uncertain の食材・材料のわからない料理も入れない。
 */
export function safetyViolations(s: AppState, catalog: Catalog, meals: PlannedMeal[] = liveMeals(s)): string[] {
  const out: string[] = [];
  for (const meal of meals) {
    const exclusions = eatersOf(s, meal).flatMap((m) => m.exclusions);
    if (exclusions.length === 0) continue;
    const strict = exclusions.some((e) => e.type === 'allergen') && !s.household.settings.allowUncertainWithExclusions;
    for (const id of meal.dishIds) {
      const dish = findDish(s, catalog, id);
      if (!dish) {
        out.push(`${meal.date}: 料理 ${id} がマスタにない`);
        continue;
      }
      const ings = ingredientObjs(s, catalog, dish);
      if (strict && ingredientsOf(s, dish).length === 0) out.push(`${label(s, catalog, meal)}: 材料のわからない ${dish.name}`);
      for (const ing of ings) {
        const names = [ing.name, ...ing.aliases].map(norm);
        for (const ex of exclusions) {
          if (ex.type === 'allergen' && ing.allergens.includes(ex.id)) {
            out.push(`${label(s, catalog, meal)}: ${dish.name} の ${ing.name} に ${ex.id}`);
          } else if (ex.type === 'ingredient' && ing.id === ex.id) {
            out.push(`${label(s, catalog, meal)}: ${dish.name} に除外の食材 ${ing.name}`);
          } else if (ex.type === 'text' && textWords(ex.text).some((w) => names.some((n) => n.includes(w)))) {
            out.push(`${label(s, catalog, meal)}: ${dish.name} の ${ing.name} が「${ex.text}」に当たる`);
          }
        }
        if (strict && ing.uncertain) out.push(`${label(s, catalog, meal)}: ${dish.name} に要確認の ${ing.name}`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 重複・たんぱく源・旬
// ---------------------------------------------------------------------------

/** 主菜を食べた（食べる予定の）日。作った記録と、作らなかった日を除く献立から集める。 */
export function mainDates(s: AppState, catalog: Catalog): Map<string, ISODate[]> {
  const byDate = new Map<ISODate, string>();
  for (const r of s.history) {
    if (r.status !== 'cooked' || r.dishIds.length === 0) continue;
    if (findDish(s, catalog, r.dishIds[0])?.role === 'main') byDate.set(r.date, r.dishIds[0]);
  }
  for (const m of liveMeals(s)) {
    if (m.kind !== 'normal' || m.dishIds.length === 0) continue;
    if (findDish(s, catalog, m.dishIds[0])?.role === 'main') byDate.set(m.date, m.dishIds[0]);
  }
  const out = new Map<string, ISODate[]>();
  for (const [date, id] of byDate) out.set(id, [...(out.get(id) ?? []), date]);
  for (const dates of out.values()) dates.sort();
  return out;
}

/** 同じ主菜が7日以内に2回出ない（週をまたいでも）。 */
export function repeatViolations(s: AppState, catalog: Catalog): string[] {
  const out: string[] = [];
  for (const [id, dates] of mainDates(s, catalog)) {
    for (let i = 1; i < dates.length; i++) {
      const gap = diffDays(dates[i], dates[i - 1]);
      if (gap <= 7) out.push(`${findDish(s, catalog, id)?.name ?? id} が ${dates[i - 1]} と ${dates[i]}（${gap}日）`);
    }
  }
  return out;
}

/** 前日と同じたんぱく源が続かない（暦の上で連続する献立の日どうし。たんぱく源 none は数えない）。 */
export function proteinViolations(s: AppState, catalog: Catalog, meals: PlannedMeal[] = liveMeals(s)): string[] {
  const out: string[] = [];
  for (const meal of meals) {
    const prev = mealOn(s, addDays(meal.date, -1));
    if (!prev || prev.status === 'skipped') continue;
    const a = headOf(s, catalog, prev);
    const b = headOf(s, catalog, meal);
    if (a && b && a.protein !== 'none' && a.protein === b.protein) {
      out.push(`${prev.date} ${a.name} と ${meal.date} ${b.name} がどちらも ${a.protein}`);
    }
  }
  return out;
}

/** 旬の料理（seasonMonths のある料理）は、旬の月にしか出ない。 */
export function seasonViolations(s: AppState, catalog: Catalog, meals: PlannedMeal[] = s.meals): string[] {
  const out: string[] = [];
  for (const meal of meals) {
    for (const dish of dishesOf(s, catalog, meal)) {
      if (dish.seasonMonths && dish.seasonMonths.length > 0 && !dish.seasonMonths.includes(monthOf(meal.date))) {
        out.push(`${meal.date} ${dish.name}（旬は ${dish.seasonMonths.join(',')} 月）`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 買い物リスト
// ---------------------------------------------------------------------------

/**
 * 売り場順、常備品が items に載らない、量がパックの単位に丸められている、
 * すべての献立（今日以降、planned、人数 > 0）の食材がどこかのリストに載っている（在庫がある場合を除く）。
 */
export function shoppingViolations(s: AppState, catalog: Catalog): string[] {
  const out: string[] = [];
  const pantryNames = new Set(catalog.ingredients.filter((i) => i.pantry).map((i) => i.name));
  for (const list of s.shopping) {
    const order = list.items.map((i) => AISLE_ORDER.indexOf(i.aisle));
    if (order.some((x, i) => i > 0 && x < order[i - 1])) out.push(`${list.date}: 売り場順になっていない`);
    for (const name of list.pantry) if (!pantryNames.has(name)) out.push(`${list.date}: 常備品でない ${name} が「家にあるか確認」にある`);
    if (new Set(list.items.map((i) => i.ingredientId)).size !== list.items.length) out.push(`${list.date}: 同じ食材が2行ある`);
    for (const item of list.items) {
      const ing = catalog.ingredientById.get(item.ingredientId);
      const where = `${list.date} ${item.label}`;
      if (!ing) {
        out.push(`${where}: 食材マスタにない`);
        continue;
      }
      // 常備品は、「切れた」と言われた（在庫が none）ときだけ「買い足し」として載る。
      const refill = s.inventory.some((i) => i.ingredientId === ing.id && i.level === 'none') || item.checked;
      if (ing.pantry && !refill) out.push(`${where}: 常備品が items に載っている`);
      if (item.aisle !== ing.aisle) out.push(`${where}: 売り場がマスタと違う`);
      if (item.forDates.length === 0) out.push(`${where}: どの日に使うかがない`);
      if (item.forDates.some((d) => d < list.date)) out.push(`${where}: 買い物の日より前の献立に使う`);
      if (!(item.amount > 0)) out.push(`${where}: 量が 0 以下`);
      if (ing.pack) {
        const { size, label: packLabel } = ing.pack;
        const tol = ing.unit === 'g' || ing.unit === 'ml' ? 1.1 : 1;
        const slack = ing.unit === 'g' || ing.unit === 'ml' ? 10 : ing.unit === 'tbsp' || ing.unit === 'tsp' ? 1 : 0.5;
        if (item.packs === null || !Number.isInteger(item.packs) || item.packs < 1) {
          out.push(`${where}: パックの数がない（${item.packs}）`);
        } else {
          if (item.packs * size * tol + slack < item.amount) out.push(`${where}: ${item.packs}パックでは ${item.amount} に足りない`);
          if ((item.packs - 1) * size * tol >= item.amount) out.push(`${where}: ${item.packs}パックは多すぎる（${item.amount}）`);
          if (!item.label.includes(packLabel)) out.push(`${where}: 表示にパックの単位がない`);
          if (item.packs > 1 && !item.label.includes(`×${item.packs}`)) out.push(`${where}: 表示にパックの数がない`);
        }
      } else if (item.packs !== null) {
        out.push(`${where}: パックのない食材にパックの数がある`);
      }
    }
  }
  // すべての献立の食材が、その日以前の買い物リストに載っている（在庫で足りる場合を除く）。
  for (const meal of s.meals) {
    if (meal.date < s.today || meal.status !== 'planned' || meal.servings <= 0) continue;
    for (const dish of dishesOf(s, catalog, meal)) {
      for (const di of ingredientsOf(s, dish)) {
        const ing = catalog.ingredientById.get(di.ingredientId);
        if (!ing || ing.pantry || di.amount <= 0) continue;
        if (s.inventory.some((i) => i.ingredientId === ing.id && i.level !== 'none')) continue;
        const listed = s.shopping.some(
          (l) => l.date <= meal.date && l.items.some((i) => i.ingredientId === ing.id && i.forDates.includes(meal.date)),
        );
        if (!listed) out.push(`${label(s, catalog, meal)}: ${dish.name} の ${ing.name} がどの買い物リストにもない`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 週の献立
// ---------------------------------------------------------------------------

/** 来週の献立を作る日：来週の最初の献立日の材料を買う日（その日以前で最も近い買い物日）の前日。 */
export function planDateForNextWeek(s: AppState): ISODate | null {
  const nextMonday = addDays(weekStartOf(s.today), 7);
  const { dinnerWeekdays, shoppingWeekdays } = s.household.settings;
  const first = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(nextMonday, i)).find((d) => dinnerWeekdays.includes(weekdayOf(d)));
  if (!first) return null;
  for (let i = 0; i <= 6; i++) {
    const d = addDays(first, -i);
    if (shoppingWeekdays.includes(weekdayOf(d))) return addDays(d, -1);
  }
  return addDays(first, -1);
}

export function weekMeals(s: AppState, weekStart: ISODate): PlannedMeal[] {
  return s.meals.filter((m) => weekStartOf(m.date) === weekStart);
}

/** 新しく作った週の条件：ラク日が1日（3日以上あるとき）、新しい料理が newPerWeek 品以内。 */
export function freshWeekViolations(meals: PlannedMeal[], newPerWeek: number): string[] {
  const out: string[] = [];
  const raku = meals.filter((m) => m.kind === 'raku').length;
  if (meals.length >= 3 && raku !== 1) out.push(`${meals[0]?.date}〜 ラク日が ${raku} 日`);
  const fresh = meals.reduce((a, m) => a + m.newDishIds.length, 0);
  if (fresh > newPerWeek) out.push(`${meals[0]?.date}〜 新しい料理が ${fresh} 品`);
  for (const m of meals) if (m.dishIds.length === 0 && m.warnings.length === 0) out.push(`${m.date}: 料理がないのに注意もない`);
  return out;
}

/** 毎日確かめる条件をまとめて。 */
export function dailyViolations(s: AppState, catalog: Catalog): string[] {
  return [
    ...safetyViolations(s, catalog),
    ...repeatViolations(s, catalog),
    ...seasonViolations(s, catalog),
    ...shoppingViolations(s, catalog),
  ];
}
