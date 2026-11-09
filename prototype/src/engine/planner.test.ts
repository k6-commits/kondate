import type { AppState, PlannedMeal } from './index';
import {
  addDays,
  advanceDay,
  alternativesFor,
  applyAction,
  checkDishSafety,
  createInitialState,
  diffDays,
  findDish,
  generateWeekMeals,
  householdNotices,
  weekStartOf,
  weekdayOf,
} from './index';
import { DISHES, MONDAY, catalog, demoInput, makeCatalog } from './__fixtures__/catalog';
import { dishHasAllergen, dishesOf, mainOf } from './__fixtures__/helpers';

const EGG_DISHES = ['oyakodon', 'hamburg', 'tomato_egg', 'chicken_nanban', 'potato_salad', 'egg_soup'];

/** 何日か進めながら、すべての献立を日付ごとに集める（古い週は state から消えるため）。 */
function runDays(start: AppState, days: number): { state: AppState; meals: Map<string, PlannedMeal> } {
  let s = start;
  const meals = new Map<string, PlannedMeal>();
  const collect = () => s.meals.forEach((m) => meals.set(m.date, m));
  collect();
  for (let i = 0; i < days; i++) {
    s = advanceDay(s, catalog).state;
    collect();
  }
  return { state: s, meals };
}

describe('週の献立（デモの家族：大人2・小学生1（卵アレルギー）・幼児1）', () => {
  const state = createInitialState(demoInput(), catalog, MONDAY);

  it('今日（月曜）から金曜までの献立ができる', () => {
    expect(state.meals.map((m) => m.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    for (const m of state.meals) {
      expect(m.dishIds.length).toBeGreaterThan(0);
      expect(m.status).toBe('planned');
    }
  });

  it('卵を含む料理（派生原材料のマヨネーズも）が1つも入らない', () => {
    for (const m of state.meals) {
      for (const d of dishesOf(state, catalog, m)) {
        expect(dishHasAllergen(d, catalog, 'egg')).toBe(false);
        expect(EGG_DISHES).not.toContain(d.id);
      }
    }
  });

  it('ラク日が1日、新しい料理は1品以内', () => {
    expect(state.meals.filter((m) => m.kind === 'raku')).toHaveLength(1);
    expect(state.meals.flatMap((m) => m.newDishIds).length).toBeLessThanOrEqual(1);
  });

  it('ラク日は週の中ほど（水曜）に置く', () => {
    const raku = state.meals.find((m) => m.kind === 'raku')!;
    expect(weekdayOf(raku.date)).toBe(3);
    expect(findDish(state, catalog, raku.dishIds[0])?.role).toBe('raku');
    expect(raku.reasons[0]).toContain('ラクする日');
  });

  it('前日と同じたんぱく源が続かない', () => {
    for (let i = 1; i < state.meals.length; i++) {
      const prev = mainOf(state, catalog, state.meals[i - 1])!;
      const cur = mainOf(state, catalog, state.meals[i])!;
      if (diffDays(state.meals[i].date, state.meals[i - 1].date) !== 1) continue;
      if (prev.protein !== 'none' && cur.protein !== 'none') expect(cur.protein).not.toBe(prev.protein);
    }
  });

  it('通常の日は主菜＋副菜または汁物、理由は1〜2個', () => {
    for (const m of state.meals.filter((x) => x.kind === 'normal')) {
      const ds = dishesOf(state, catalog, m);
      expect(ds[0].role).toBe('main');
      expect(ds).toHaveLength(2);
      expect(['side', 'soup']).toContain(ds[1].role);
      expect(m.reasons.length).toBeGreaterThanOrEqual(1);
      expect(m.reasons.length).toBeLessThanOrEqual(2);
    }
  });

  it('「要確認」の料理（ルウ・冷凍食品・惣菜・材料不明の定番）は出さない', () => {
    const ids = state.meals.flatMap((m) => m.dishIds);
    for (const id of ['curry', 'raku_gyoza', 'raku_karaage', 'custom_1']) expect(ids).not.toContain(id);
    for (const m of state.meals) expect(m.warnings.filter((w) => w.startsWith('要確認'))).toEqual([]);
  });

  it('旬が決まっている料理は、その月以外は出さない（11月にさんまは出ない）', () => {
    expect(state.meals.flatMap((m) => m.dishIds)).not.toContain('sanma_shioyaki');
  });

  it('魚を週に1回は入れ、買い物日の当日か翌日に置く', () => {
    const fish = state.meals.filter((m) => mainOf(state, catalog, m)?.protein === 'fish');
    expect(fish.length).toBeGreaterThanOrEqual(1);
    // 月曜は「今日」が買い物日（それより前に買い物日がない）、水曜は買い物日、木曜はその翌日。
    expect(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']).toContain(fish[0].date);
  });

  it('人数は SERVING_WEIGHT の合計（大人2＋小学生0.7＋幼児0.5）', () => {
    for (const m of state.meals) expect(m.servings).toBe(3.2);
  });

  it('1回の献立作成は数十ms以内', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) generateWeekMeals(state, catalog, addDays(MONDAY, 7));
    expect((performance.now() - t0) / 10).toBeLessThan(50);
  });
});

describe('3週間回しても条件を守る', () => {
  const { meals, state } = runDays(createInitialState(demoInput(), catalog, MONDAY), 20);
  const list = [...meals.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  it('3週分の献立が作られている', () => {
    const weeks = new Set(list.map((m) => weekStartOf(m.date)));
    expect(weeks.size).toBeGreaterThanOrEqual(3);
  });

  it('同じ主菜が7日以内に2回出ない', () => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].kind !== 'normal' || list[j].kind !== 'normal') continue;
        if (list[i].dishIds[0] !== list[j].dishIds[0]) continue;
        expect(Math.abs(diffDays(list[j].date, list[i].date))).toBeGreaterThan(7);
      }
    }
  });

  it('毎週、ラク日は1日、新しい料理は1品以内、卵を含む料理はなし', () => {
    const byWeek = new Map<string, PlannedMeal[]>();
    for (const m of list) byWeek.set(weekStartOf(m.date), [...(byWeek.get(weekStartOf(m.date)) ?? []), m]);
    for (const week of byWeek.values()) {
      expect(week.filter((m) => m.kind === 'raku')).toHaveLength(1);
      expect(week.flatMap((m) => m.newDishIds).length).toBeLessThanOrEqual(1);
      for (const m of week) for (const d of dishesOf(state, catalog, m)) expect(dishHasAllergen(d, catalog, 'egg')).toBe(false);
    }
  });

  it('前日と同じたんぱく源が続かない', () => {
    for (let i = 1; i < list.length; i++) {
      if (diffDays(list[i].date, list[i - 1].date) !== 1) continue;
      const a = mainOf(state, catalog, list[i - 1])!;
      const b = mainOf(state, catalog, list[i])!;
      if (a.protein !== 'none' && b.protein !== 'none') expect(b.protein).not.toBe(a.protein);
    }
  });
});

describe('同じ seed なら同じ献立', () => {
  it('同じ入力から同じ状態ができる', () => {
    const a = createInitialState(demoInput(), catalog, MONDAY);
    const b = createInitialState(demoInput(), catalog, MONDAY);
    expect(b.meals).toEqual(a.meals);
    expect(b.shopping).toEqual(a.shopping);
    expect(b.household.id).toBe(a.household.id);
  });

  it('generateWeekMeals は同じ state なら同じ結果を返す', () => {
    const s = createInitialState(demoInput(), catalog, MONDAY);
    const next = addDays(MONDAY, 7);
    expect(generateWeekMeals(s, catalog, next)).toEqual(generateWeekMeals(s, catalog, next));
  });

  it('fromDate より前の日は作らない', () => {
    const s = createInitialState(demoInput(), catalog, MONDAY);
    const meals = generateWeekMeals(s, catalog, MONDAY, '2026-11-11');
    expect(meals.map((m) => m.date)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
  });

  it('週の途中から始めても、ラク日は日数に合わせる（2日ならラク日なし）', () => {
    const s = createInitialState(demoInput(), catalog, '2026-11-12'); // 木曜
    expect(s.meals.filter((m) => weekStartOf(m.date) === MONDAY).map((m) => m.date)).toEqual(['2026-11-12', '2026-11-13']);
    expect(s.meals.filter((m) => m.kind === 'raku')).toHaveLength(0);
  });
});

describe('候補が足りないとき', () => {
  it('主菜が足りなければラク日にし、warnings に理由を書く（7日以内の重複はゆるめない）', () => {
    const small = makeCatalog(DISHES.filter((d) => d.role !== 'main' || ['teriyaki_chicken', 'shogayaki'].includes(d.id)));
    const s = createInitialState(demoInput({ favoriteDishIds: ['teriyaki_chicken', 'shogayaki'], customFavoriteNames: [] }), small, MONDAY);
    const normal = s.meals.filter((m) => m.kind === 'normal');
    expect(normal).toHaveLength(2);
    expect(new Set(normal.map((m) => m.dishIds[0])).size).toBe(2);
    const fallback = s.meals.filter((m) => m.warnings.some((w) => w.includes('条件に合う主菜が見つからなかった')));
    expect(fallback.length).toBe(2);
    for (const m of fallback) expect(m.kind).toBe('raku');
  });

  it('安全の制約は決してゆるめない（卵の料理しかなくても出さない）', () => {
    const eggOnly = makeCatalog(DISHES.filter((d) => d.role !== 'main' || EGG_DISHES.includes(d.id)));
    const s = createInitialState(demoInput({ favoriteDishIds: [], customFavoriteNames: [] }), eggOnly, MONDAY);
    for (const m of s.meals) {
      for (const id of m.dishIds) expect(EGG_DISHES).not.toContain(id);
      expect(m.kind).toBe('raku');
    }
  });

  it('定番が少ないときは、新しい料理の数を先にゆるめる', () => {
    const s = createInitialState(demoInput({ favoriteDishIds: ['teriyaki_chicken'], customFavoriteNames: [] }), catalog, MONDAY);
    const normal = s.meals.filter((m) => m.kind === 'normal');
    expect(normal).toHaveLength(4);
    expect(s.meals.flatMap((m) => m.newDishIds).length).toBeGreaterThan(1);
    for (const m of normal) expect(m.warnings).toEqual([]);
  });

  it('allowUncertainWithExclusions が true なら「要確認」の料理も出し、warnings に「要確認」を入れる', () => {
    const base = createInitialState(demoInput(), catalog, MONDAY);
    const s: AppState = structuredClone(base);
    s.household.settings.allowUncertainWithExclusions = true;
    s.household.favorites = [{ dishId: 'curry' }, { dishId: 'raku_gyoza' }];
    s.meals = [];
    const meals = generateWeekMeals(s, catalog, MONDAY, MONDAY);
    const uncertain = meals.filter((m) => m.dishIds.some((id) => checkDishSafety(findDish(s, catalog, id)!, s.household, catalog).status === 'uncertain'));
    expect(uncertain.length).toBeGreaterThan(0);
    for (const m of uncertain) {
      expect(m.warnings.some((w) => w.startsWith('要確認：'))).toBe(true);
      const branded = dishesOf(s, catalog, m).some((d) => !d.custom && checkDishSafety(d, s.household, catalog).status === 'uncertain');
      if (branded) expect(m.warnings.some((w) => w.includes('銘柄で原材料が違います。パッケージの表示を確かめてください'))).toBe(true);
    }
    expect(meals.flatMap((m) => m.dishIds).some((id) => id === 'curry' || id === 'raku_gyoza')).toBe(true);
    for (const m of meals) for (const id of m.dishIds) expect(EGG_DISHES).not.toContain(id);
  });
});

describe('曜日ごとの調理時間の上限', () => {
  it('上限が短い曜日をラク日にする', () => {
    const base = createInitialState(demoInput(), catalog, MONDAY);
    const s: AppState = structuredClone(base);
    s.household.settings.maxMinutes = { 2: 15 }; // 火曜は15分まで
    s.meals = [];
    const meals = generateWeekMeals(s, catalog, MONDAY, MONDAY);
    expect(meals.find((m) => m.kind === 'raku')?.date).toBe('2026-11-10');
  });
});

describe('乳児のいる世帯', () => {
  const input = demoInput({
    members: [
      { nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
      { nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] },
      { nickname: 'あかちゃん', ageBand: 'infant', role: 'child', exclusions: [] },
    ],
    favoriteDishIds: ['chicken_honey', 'teriyaki_chicken', 'shogayaki', 'nikujaga', 'salmon_foil'],
  });
  const state = createInitialState(input, catalog, MONDAY);

  it('乳児は servings に含まれない', () => {
    for (const m of state.meals) expect(m.servings).toBe(2);
  });

  it('はちみつと窒息の注意が出る', () => {
    const texts = householdNotices(state.household).map((n) => n.text);
    expect(texts.some((t) => t.includes('はちみつ'))).toBe(true);
    expect(texts.some((t) => t.includes('1歳未満の子は献立の『食べる人』に含めていません'))).toBe(true);
    expect(texts.some((t) => t.includes('のどに詰まりやすい'))).toBe(true);
  });

  it('はちみつを使う料理には、その日の warnings にも注意が出る', () => {
    const day = state.meals.find((m) => m.kind === 'normal' && m.date > MONDAY)!;
    const r = applyAction(state, catalog, { type: 'choose_alternative', date: day.date, dishIds: ['chicken_honey', 'cabbage_shiomomi'] });
    const meal = r.state.meals.find((m) => m.date === day.date)!;
    expect(meal.dishIds[0]).toBe('chicken_honey');
    expect(meal.warnings.some((w) => w.includes('はちみつ') && w.includes('1歳未満'))).toBe(true);
  });
});

describe('alternativesFor', () => {
  const state = createInitialState(demoInput(), catalog, MONDAY);

  it('今の料理と違う候補を2つ出す（たんぱく源もなるべく変える）', () => {
    const meal = state.meals.find((m) => m.kind === 'normal')!;
    const options = alternativesFor(state, catalog, meal.date);
    expect(options).toHaveLength(2);
    const mains = options.map((o) => findDish(state, catalog, o[0])!);
    expect(mains.map((d) => d.id)).not.toContain(meal.dishIds[0]);
    expect(mains[0].id).not.toBe(mains[1].id);
    expect(mains[0].protein).not.toBe(mains[1].protein);
    for (const o of options) {
      for (const id of o) expect(checkDishSafety(findDish(state, catalog, id)!, state.household, catalog).status).toBe('ok');
    }
  });

  it('ラク日の候補はラク日用の料理から出す', () => {
    const raku = state.meals.find((m) => m.kind === 'raku')!;
    const options = alternativesFor(state, catalog, raku.date, 2);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect(findDish(state, catalog, o[0])?.role).toBe('raku');
  });

  it('献立のない日は空', () => {
    expect(alternativesFor(state, catalog, '2026-11-14')).toEqual([]);
  });
});
