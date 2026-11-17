// 新しい設定（国の料理・辛さ・食事・お昼の人数・予算・買い物のしかた）を組み合わせた家族で、数週間動かしても
// 受け入れ条件（安全・同じ料理の間隔・旬・買い物リスト）を守るかを、本物のマスタで確かめる。
// あわせて、朝ごはん・お弁当・お昼の材料が買い物リストに入ること、好みの「出さない」と「辛くないものだけ」が
// 夕食にも朝ごはん・お弁当・お昼にも効くこと、予算を決めると材料費の目安が下がることを見る。
import type { AppState, CuisineGenre, CuisineLevel, HouseholdSettings, OnboardingInput, Weekday } from '../engine/index';
import {
  advanceDay,
  createInitialState,
  extrasOn,
  findDish,
  paceWeekdays,
  weekCost,
  weekStartOf,
} from '../engine/index';
import { DEMO_ONBOARDING, defaultCatalog as catalog } from '../data/index';
import { dailyViolations } from './invariants';

const MON = '2026-11-09';

const ALL_OFTEN: Record<CuisineGenre, CuisineLevel> = { wa: 'often', yo: 'often', chu: 'often', kr: 'often', it: 'often', eth: 'often', mx: 'often' };

type Extras = NonNullable<OnboardingInput['extras']>;

function input(extras: Extras, shoppingWeekdays: Weekday[] = DEMO_ONBOARDING.shoppingWeekdays): OnboardingInput {
  return { ...DEMO_ONBOARDING, shoppingWeekdays, extras: { ...DEMO_ONBOARDING.extras, ...extras } };
}

/** 今日から days 日、翌日へ進めながら、毎日の違反を集める。 */
function run(inp: OnboardingInput, days: number): { state: AppState; states: AppState[]; violations: string[] } {
  let s = createInitialState(inp, catalog, MON);
  const states = [s];
  const violations = dailyViolations(s, catalog).map((v) => `${s.today} ${v}`);
  for (let i = 0; i < days; i++) {
    s = advanceDay(s, catalog).state;
    states.push(s);
    violations.push(...dailyViolations(s, catalog).map((v) => `${s.today} ${v}`));
  }
  return { state: s, states, violations };
}

const CASES: { name: string; extras: Extras; shop?: Weekday[] }[] = [
  { name: '世界の料理をよく出す・朝昼夕・お昼は家・週1回まとめて', extras: { cuisines: ALL_OFTEN, meals: 'three', lunchStyle: 'home', lunchCount: 2 }, shop: [0] },
  {
    name: '韓国とエスニックはときどき・辛いのも好き・夕食＋お弁当3人分・毎日',
    extras: { cuisines: { ...ALL_OFTEN, kr: 'sometimes', eth: 'sometimes' }, spice: 'hot', meals: 'dinner_bento', lunchCount: 3 },
    shop: [1, 2, 3, 4, 5],
  },
  {
    name: '和食だけ・辛くないものだけ・朝はパン・予算7,000円',
    extras: { cuisines: { wa: 'often', yo: 'never', chu: 'never', kr: 'never', it: 'never', eth: 'never', mx: 'never' }, spice: 'mild', meals: 'three', breakfastStyle: 'bread', weeklyBudget: 7000 },
  },
  { name: '予算1万円・朝昼夕・日替わり', extras: { cuisines: ALL_OFTEN, meals: 'three', breakfastStyle: 'mix', weeklyBudget: 10000 }, shop: [0, 3] },
];

describe('新しい設定を組み合わせた家族で、4週間動かす', () => {
  for (const c of CASES) {
    it(`${c.name}：受け入れ条件を守る`, () => {
      const { violations } = run(input(c.extras, c.shop), 28);
      expect(violations).toEqual([]);
    });
  }
});

describe('朝ごはん・お弁当・お昼', () => {
  it('朝・昼・夕では、明日からの朝ごはんとお昼の材料が、買い物リストに入る', () => {
    const s = createInitialState(input({ cuisines: ALL_OFTEN, meals: 'three', lunchStyle: 'home', lunchCount: 2 }, [0, 3]), catalog, MON);
    const tomorrow = '2026-11-10';
    const extras = extrasOn(s.household, catalog, tomorrow);
    expect(extras.map((x) => x.slot)).toEqual(['breakfast', 'lunch']);
    const listed = new Set(s.shopping.flatMap((l) => l.items.map((i) => i.ingredientId)));
    for (const x of extras) {
      const buy = x.dish.ingredients.map((di) => catalog.ingredientById.get(di.ingredientId)!).filter((i) => !i.pantry);
      expect(buy.length, x.dish.name).toBeGreaterThan(0);
      for (const ing of buy) expect(listed.has(ing.id), `${x.dish.name}：${ing.name}`).toBe(true);
    }
  });

  it('家族の除外（卵アレルギー）に当たる組み合わせは、朝ごはん・お弁当・お昼に出さない', () => {
    const { states } = run(input({ cuisines: ALL_OFTEN, meals: 'three', lunchStyle: 'bento' }), 14);
    for (const s of states) {
      for (const x of extrasOn(s.household, catalog, s.today)) {
        const egg = x.dish.ingredients.some((di) => catalog.ingredientById.get(di.ingredientId)!.allergens.includes('egg'));
        expect(egg, `${s.today} ${x.dish.name}`).toBe(false);
      }
    }
  });

  it('夕食だけ（既定）では、朝ごはん・お弁当・お昼を出さない', () => {
    const s = createInitialState(DEMO_ONBOARDING, catalog, MON);
    expect(extrasOn(s.household, catalog, '2026-11-10')).toEqual([]);
  });
});

describe('好み', () => {
  it('「出さない」にした国と、「辛くないものだけ」の辛い料理は、4週間のどの夕食にも出ない（定番は別）', () => {
    const extras: Extras = { cuisines: { ...ALL_OFTEN, kr: 'never', mx: 'never' }, spice: 'mild' };
    const { states } = run(input(extras), 28);
    const favorites = new Set(DEMO_ONBOARDING.favoriteDishIds);
    for (const s of states) {
      for (const m of s.meals) {
        for (const id of m.dishIds) {
          const d = findDish(s, catalog, id)!;
          if (favorites.has(d.id)) continue;
          expect(d.genre === 'kr' || d.genre === 'mx', `${m.date} ${d.name}`).toBe(false);
          expect(d.spicy, `${m.date} ${d.name}`).toBe(false);
        }
      }
    }
  });

  it('「ときどき」の国の料理は、1週間に1回まで', () => {
    const extras: Extras = { cuisines: { ...ALL_OFTEN, it: 'sometimes', eth: 'sometimes', mx: 'sometimes' } };
    const { state } = run(input(extras), 28);
    const perWeek = new Map<string, number>();
    for (const m of state.meals) {
      const head = findDish(state, catalog, m.dishIds[0]);
      if (!head || !['it', 'eth', 'mx'].includes(head.genre) || head.role !== 'main') continue;
      const key = `${weekStartOf(m.date)}|${head.genre}`;
      perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
    }
    for (const [key, n] of perWeek) expect(n, key).toBeLessThanOrEqual(1);
  });
});

describe('予算', () => {
  /** 8週間、週の終わりごとにその週の夕食の材料費の目安を記録し、平均を返す。 */
  function averageWeek(extras: Extras): number {
    let s = createInitialState(input(extras), catalog, MON);
    const weekly: number[] = [];
    for (let w = 0; w < 8; w++) {
      const start = weekStartOf(s.today);
      for (let i = 0; i < 7; i++) s = advanceDay(s, catalog).state;
      weekly.push(weekCost(s, catalog, start).dinners);
    }
    return weekly.reduce((a, b) => a + b, 0) / weekly.length;
  }

  it('きつい予算を決めると、決めないときより、週の夕食の材料費の目安が下がる', () => {
    const free = averageWeek({ cuisines: ALL_OFTEN });
    const tight = averageWeek({ cuisines: ALL_OFTEN, weeklyBudget: 3000 });
    expect(tight).toBeLessThan(free * 0.95);
  });

  it('予算を決めた家族も、受け入れ条件（安全・間隔・旬・買い物リスト）を守る', () => {
    expect(run(input({ cuisines: ALL_OFTEN, weeklyBudget: 2500, meals: 'three' }), 28).violations).toEqual([]);
  });
});

describe('買い物のしかた', () => {
  it('毎日・週2回・週1回まとめての曜日で、買い物リストの日がその曜日になる', () => {
    const dinners: Weekday[] = [1, 2, 3, 4, 5];
    for (const pace of ['daily', 'twice', 'weekly'] as const) {
      const days = paceWeekdays(pace, dinners);
      const s = createInitialState(input({ cuisines: ALL_OFTEN }, days), catalog, MON);
      const settings: HouseholdSettings = s.household.settings;
      expect(settings.shoppingWeekdays).toEqual(days);
      for (const l of s.shopping) {
        if (l.date === s.today) continue; // 初回は、今日の分を今日のリストに入れることがある
        expect(days.includes(new Date(`${l.date}T00:00:00Z`).getUTCDay() as Weekday), `${pace} ${l.date}`).toBe(true);
      }
    }
  });
});
