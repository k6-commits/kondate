// 世界の料理（data/world.ts）と、家族の好み（国の料理）のつながりを、本物のマスタで確かめる。
// - 国の料理をまだ選んでいない世帯（前からの記録・LINE）の献立には、世界の料理を出さない（前からの献立を変えない）。
// - 選んだ世帯には、選んだとおりに出す。「出さない」にした国の料理は出さない。
// - 名前を挙げて頼んだ料理は、選んでいなくても入れられる（頼んだのは家族なので）。
import type { AppState, CuisineGenre, CuisineLevel, Dish, ISODate, OnboardingInput } from '../engine/index';
import { advanceDay, createInitialState, findDish, handleUserText } from '../engine/index';
import { DEMO_ONBOARDING, WORLD_DISHES, defaultCatalog as catalog } from '../data/index';

const MON = '2026-11-09';
const WORLD_IDS = new Set(WORLD_DISHES.map((d) => d.id));

function withCuisines(cuisines: Record<CuisineGenre, CuisineLevel>): OnboardingInput {
  return { ...DEMO_ONBOARDING, extras: { ...DEMO_ONBOARDING.extras, cuisines } };
}

/** 今日から4週分、翌日へ進めて献立を作り、出てきた料理（主菜・副菜・汁物）をすべて集める。 */
function dishesOverWeeks(input: OnboardingInput, weeks = 4): Dish[] {
  let s: AppState = createInitialState(input, catalog, MON);
  const seen = new Map<string, Dish>();
  const collect = () => {
    for (const m of s.meals) {
      for (const id of m.dishIds) {
        const d = findDish(s, catalog, id);
        if (d) seen.set(d.id, d);
      }
    }
  };
  collect();
  for (let i = 0; i < weeks * 7; i++) {
    s = advanceDay(s, catalog).state;
    collect();
  }
  return [...seen.values()];
}

describe('世界の料理と、国の料理の好み', () => {
  it('世界の料理には world の印があり、標準の料理にはない', () => {
    for (const d of WORLD_DISHES) expect(d.world, d.id).toBe(true);
    for (const d of catalog.dishes) if (!WORLD_IDS.has(d.id)) expect(d.world, d.id).toBeUndefined();
  });

  it('国の料理を選んでいない世帯の献立には、世界の料理を出さない（標準の韓国の料理は出せる）', () => {
    const dishes = dishesOverWeeks(DEMO_ONBOARDING);
    expect(dishes.length).toBeGreaterThan(10);
    expect(dishes.filter((d) => d.world).map((d) => d.name)).toEqual([]);
  });

  it('和洋中を「出さない」にして、ほかを「よく出す」にした世帯は、世界の料理で組む', () => {
    const dishes = dishesOverWeeks(
      withCuisines({ wa: 'never', yo: 'never', chu: 'never', kr: 'often', it: 'often', eth: 'often', mx: 'often' }),
      2,
    );
    const mains = dishes.filter((d) => d.role === 'main');
    expect(mains.some((d) => d.world)).toBe(true);
    // 和洋中の料理は、家族の定番（好みより優先）だけ
    const favorites = new Set(DEMO_ONBOARDING.favoriteDishIds);
    for (const d of dishes) {
      if (d.genre === 'wa' || d.genre === 'yo' || d.genre === 'chu') expect(favorites.has(d.id), `${d.name}（${d.genre}）`).toBe(true);
    }
  });

  it('「出さない」にした国の料理は出さない（選んだ世帯でも）', () => {
    const dishes = dishesOverWeeks(
      withCuisines({ wa: 'often', yo: 'often', chu: 'often', kr: 'often', it: 'never', eth: 'often', mx: 'never' }),
      3,
    );
    expect(dishes.filter((d) => d.genre === 'it' || d.genre === 'mx').map((d) => d.name)).toEqual([]);
  });

  it('名前を挙げて頼めば、国の料理を選んでいない世帯でも、世界の料理を入れる案を出す', () => {
    const s = createInitialState(DEMO_ONBOARDING, catalog, MON);
    const r = handleUserText(s, catalog, 'チャプチェが食べたい');
    expect(r.state.proposals.some((p) => p.toDishIds.includes('japchae'))).toBe(true);
    const date: ISODate = r.state.proposals[0].date;
    expect(date >= MON).toBe(true);
  });
});
