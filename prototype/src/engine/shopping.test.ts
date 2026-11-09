import type { AppState, PlannedMeal, ShoppingList } from './index';
import { AISLE_ORDER, advanceDay, applyAction, buildShoppingLists, createInitialState } from './index';
import { MONDAY, catalog, demoInput } from './__fixtures__/catalog';

function meal(date: string, dishIds: string[], servings = 3.2): PlannedMeal {
  return {
    date, dishIds, kind: 'normal', servings, absentMemberIds: [], reasons: [], warnings: [], notes: [], status: 'planned', newDishIds: [],
  };
}

/** デモの家族の状態から、献立・在庫・リストだけを差し替える。 */
function withMeals(meals: PlannedMeal[], over: Partial<AppState> = {}): AppState {
  const s = structuredClone(createInitialState(demoInput(), catalog, MONDAY));
  s.meals = meals;
  s.inventory = [];
  s.shopping = [];
  return { ...s, ...over };
}

const item = (lists: ShoppingList[], date: string, id: string) => lists.find((l) => l.date === date)?.items.find((i) => i.ingredientId === id);

describe('買い物リスト（デモの家族）', () => {
  const state = createInitialState(demoInput(), catalog, MONDAY);

  it('献立日の材料を、その日以前で最も近い買い物日に入れる（それより前に買い物日がなければ今日）', () => {
    expect(state.shopping.map((l) => l.date)).toEqual(['2026-11-09', '2026-11-11']);
    for (const l of state.shopping) {
      for (const it of l.items) {
        for (const d of it.forDates) {
          if (d <= '2026-11-10') expect(l.date).toBe('2026-11-09');
          else expect(l.date).toBe('2026-11-11');
        }
      }
    }
  });

  it('売り場順（AISLE_ORDER）、同じ売り場の中は名前順に並ぶ', () => {
    for (const l of state.shopping) {
      const idx = l.items.map((i) => AISLE_ORDER.indexOf(i.aisle));
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
      for (let i = 1; i < l.items.length; i++) {
        if (l.items[i].aisle === l.items[i - 1].aisle) {
          expect(l.items[i - 1].name.localeCompare(l.items[i].name, 'ja')).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('常備品はリストに載せず、「家にあるか確認」に名前を出す', () => {
    for (const l of state.shopping) {
      for (const it of l.items) expect(catalog.ingredientById.get(it.ingredientId)?.pantry).toBe(false);
    }
    const pantry = state.shopping.flatMap((l) => l.pantry);
    expect(pantry.length).toBeGreaterThan(0);
    expect(pantry.every((name) => catalog.ingredients.some((i) => i.pantry && i.name === name))).toBe(true);
  });

  it('パックのある食材はパック単位に丸める', () => {
    for (const l of state.shopping) {
      for (const it of l.items) {
        const ing = catalog.ingredientById.get(it.ingredientId)!;
        if (!ing.pack) continue;
        expect(it.packs).not.toBeNull();
        expect(it.packs!).toBeGreaterThanOrEqual(1);
        const tolerance = ing.unit === 'g' || ing.unit === 'ml' ? 1.1 : 1;
        expect(it.packs! * ing.pack.size * tolerance).toBeGreaterThanOrEqual(it.amount - ing.pack.size * 0.1);
        expect(it.label).toBe(`${ing.name} ${ing.pack.label}${it.packs! > 1 ? `×${it.packs}` : ''}`);
      }
    }
  });
});

describe('分量と丸め', () => {
  it('人数換算して集約し、パックに丸める（約300gのパックは1割まで超えても1パック）', () => {
    const lists = buildShoppingLists(withMeals([meal('2026-11-09', ['teriyaki_chicken'])]), catalog);
    const chicken = item(lists, '2026-11-09', 'chicken_thigh')!;
    expect(chicken.amount).toBe(320); // 100g × 3.2人
    expect(chicken.packs).toBe(1);
    expect(chicken.label).toBe('鶏もも肉 1パック（約300g）');
  });

  it('同じ食材を集約する（から揚げ＋照り焼き＝704g → 3パック）', () => {
    const lists = buildShoppingLists(withMeals([meal('2026-11-11', ['karaage']), meal('2026-11-12', ['teriyaki_chicken'])]), catalog);
    const chicken = item(lists, '2026-11-11', 'chicken_thigh')!;
    expect(chicken.amount).toBe(710); // 704g を10g単位に切り上げ
    expect(chicken.packs).toBe(3);
    expect(chicken.label).toBe('鶏もも肉 1パック（約300g）×3');
    expect(chicken.forDates).toEqual(['2026-11-11', '2026-11-12']);
  });

  it('卵 1パック（10個）、キャベツ 1/2玉（約500g）×2 のように表示する', () => {
    const lists = buildShoppingLists(
      withMeals([
        meal('2026-11-11', ['tomato_egg', 'cabbage_shiomomi'], 4),
        meal('2026-11-12', ['pork_shabu_salad'], 4),
        meal('2026-11-13', ['cabbage_shiomomi'], 4),
      ]),
      catalog,
    );
    expect(item(lists, '2026-11-11', 'egg')!.label).toBe('卵 1パック（10個）');
    expect(item(lists, '2026-11-11', 'cabbage')!.label).toBe('キャベツ 1/2玉（約500g）×2');
  });

  it('個数で数える物は足りなくならないように切り上げる（卵11個なら2パック）', () => {
    const lists = buildShoppingLists(withMeals([meal('2026-11-11', ['tomato_egg'], 5.5)]), catalog);
    expect(item(lists, '2026-11-11', 'egg')!.packs).toBe(2);
  });

  it('パックがない食材は量をそのまま表示する', () => {
    const lists = buildShoppingLists(withMeals([meal('2026-11-11', ['tomato_salad'])]), catalog);
    expect(item(lists, '2026-11-11', 'tomato')!.label).toBe('トマト 2個'); // 0.5 × 3.2 = 1.6 → 2
    expect(item(lists, '2026-11-11', 'tomato')!.packs).toBeNull();
  });

  it('欠席で全員いない日（servings 0）は買わない', () => {
    const lists = buildShoppingLists(withMeals([meal('2026-11-11', ['teriyaki_chicken'], 0)]), catalog);
    expect(item(lists, '2026-11-11', 'chicken_thigh')).toBeUndefined();
  });
});

describe('在庫の差し引き', () => {
  const base = [meal('2026-11-11', ['teriyaki_chicken'])];

  it('plenty なら買わない、some なら半パック分を差し引く、none なら差し引かない', () => {
    const inv = (level: 'plenty' | 'some' | 'none') =>
      withMeals(base, { inventory: [{ ingredientId: 'chicken_thigh', level, acquiredOn: MONDAY, frozen: true }] });
    expect(item(buildShoppingLists(inv('plenty'), catalog), '2026-11-11', 'chicken_thigh')).toBeUndefined();
    expect(item(buildShoppingLists(inv('some'), catalog), '2026-11-11', 'chicken_thigh')!.amount).toBe(170); // 320 − 150
    expect(item(buildShoppingLists(inv('none'), catalog), '2026-11-11', 'chicken_thigh')!.amount).toBe(320);
  });

  it('期限が切れる在庫は差し引かない（冷凍は差し引く）', () => {
    const s = withMeals(base, { inventory: [{ ingredientId: 'chicken_thigh', level: 'plenty', acquiredOn: '2026-11-01', frozen: false }] });
    expect(item(buildShoppingLists(s, catalog), '2026-11-11', 'chicken_thigh')!.amount).toBe(320);
  });
});

describe('メモ・要確認・チェック', () => {
  it('買い物日から調理日までが shelfLifeDays を超える食材には「買ったら冷凍」を付ける', () => {
    const s = withMeals([meal('2026-11-14', ['teriyaki_chicken'])]); // 水曜に買って土曜に使う（鶏ももは2日）
    s.household.settings.dinnerWeekdays = [1, 2, 3, 4, 5, 6];
    const chicken = item(buildShoppingLists(s, catalog), '2026-11-11', 'chicken_thigh')!;
    expect(chicken.notes).toContain('買ったら冷凍');
  });

  it('一部の日だけ持たないときは、その日の分だけ冷凍のメモを付ける', () => {
    const s = withMeals([meal('2026-11-11', ['karaage']), meal('2026-11-14', ['teriyaki_chicken'])]);
    const chicken = item(buildShoppingLists(s, catalog), '2026-11-11', 'chicken_thigh')!;
    expect(chicken.notes).toEqual(['買ったら冷凍（11/14(土)の分）']);
  });

  it('銘柄で原材料が変わる食材は、アレルゲンの除外がある世帯では「要確認」', () => {
    const lists = buildShoppingLists(withMeals([meal('2026-11-11', ['curry'])]), catalog);
    expect(item(lists, '2026-11-11', 'curry_roux')!.uncertain).toBe(true);
    expect(item(lists, '2026-11-11', 'pork_koma')!.uncertain).toBe(false);
  });

  it('作り直しても、同じ買い物日・同じ食材のチェック状態を引き継ぐ（在庫になっても消えない）', () => {
    const state = createInitialState(demoInput(), catalog, MONDAY);
    const wed = state.shopping.find((l) => l.date === '2026-11-11')!;
    const target = wed.items[0];
    const checked = applyAction(state, catalog, { type: 'check_item', shoppingDate: wed.date, ingredientId: target.ingredientId, checked: true }).state;
    expect(checked.inventory.find((i) => i.ingredientId === target.ingredientId)?.level).toBe('plenty');
    const rebuilt = buildShoppingLists(checked, catalog);
    const again = item(rebuilt, wed.date, target.ingredientId)!;
    expect(again).toBeDefined();
    expect(again.checked).toBe(true);
    expect(again.amount).toBe(target.amount);
  });

  it('買い物日が過ぎても、まだ先の献立の分があるリストは残し、同じ物を今日のリストに二重に載せない', () => {
    const state = createInitialState(demoInput(), catalog, MONDAY);
    const next = advanceDay(state, catalog).state; // 火曜
    const monday = next.shopping.find((l) => l.date === MONDAY);
    expect(monday).toBeDefined();
    expect(next.shopping.find((l) => l.date === '2026-11-10')).toBeUndefined();
    const after = advanceDay(advanceDay(next, catalog).state, catalog).state; // 木曜
    expect(after.shopping.find((l) => l.date === MONDAY)).toBeUndefined();
  });
});
