// あとから足した設定：国の料理・辛さ・予算・夕食のほかの食事（朝ごはん・お弁当・お昼）・買い物のしかた・金額の目安。
import type { AppState, Dish, HouseholdSettings, Ingredient, Price } from './types';
import { createInitialState, parseMessage, weekStartOf } from './index';
import { DISHES, INGREDIENTS, MONDAY, catalog as baseCatalog, demoInput, makeCatalog } from './__fixtures__/catalog';
import {
  DEFAULT_CUISINES,
  budgetOf,
  checkSettingsExtras,
  cuisineLevel,
  cuisinesOf,
  daysPerTrip,
  lunchCountOf,
  lunchStyleOf,
  mealsOf,
  paceOf,
  paceWeekdays,
  spiceOf,
} from './settings';
import { extraSlotsOf, extrasOn } from './extras';
import { dinnerBudgetPerServing, dishCost, listCost, weekCost, yenText } from './cost';
import { buildShoppingLists } from './shopping';
import { allowedOn, fitsTaste, genreCapFor, makeEnv, makeSlot, scoreMain } from './planner';
import { servingsFor } from './context';

function mk(id: string, name: string, role: Dish['role'], protein: Dish['protein'], genre: Dish['genre'], ing: [string, number][], spicy = false): Dish {
  return {
    id,
    name,
    role,
    protein,
    genre,
    minutes: 15,
    ingredients: ing.map(([ingredientId, amount]) => ({ ingredientId, amount })),
    kidFriendly: !spicy,
    spicy,
    tags: [],
  };
}

const WORLD: Dish[] = [
  mk('bibimbap', 'ビビンバ', 'main', 'beef', 'kr', [['beef_koma', 80], ['spinach', 30], ['bean_sprouts', 30]]),
  mk('carbonara', 'カルボナーラ', 'main', 'pork', 'it', [['pork_belly', 50], ['milk', 30]]),
  mk('gapao', 'ガパオライス', 'main', 'chicken', 'eth', [['chicken_thigh', 100]], true),
  mk('tacos', 'タコス', 'main', 'ground', 'mx', [['ground_mix', 80], ['tomato', 0.5]]),
];

const EXTRAS: Dish[] = [
  mk('bf_natto', '納豆ごはん・味噌汁', 'breakfast', 'tofu', 'wa', [['natto', 1], ['tofu', 0.1], ['miso', 1]]),
  mk('bf_egg', '卵かけごはん・味噌汁', 'breakfast', 'egg', 'wa', [['egg', 1], ['soy_sauce', 0.5], ['miso', 1]]),
  mk('bf_tomato', 'トマトのスープ・牛乳', 'breakfast', 'none', 'yo', [['tomato', 0.5], ['milk', 150]]),
  mk('bf_cucumber', 'きゅうりのサラダ・牛乳', 'breakfast', 'none', 'yo', [['cucumber', 0.5], ['milk', 150]]),
  mk('bento_chicken', '鶏の照り焼き弁当', 'bento', 'chicken', 'wa', [['chicken_thigh', 60], ['spinach', 30]]),
  mk('bento_salmon', '鮭弁当', 'bento', 'fish', 'wa', [['salmon', 1], ['spinach', 30]]),
  mk('bento_egg', '卵焼き弁当', 'bento', 'egg', 'wa', [['egg', 1], ['spinach', 30]]),
  mk('bento_pork', '豚の生姜焼き弁当', 'bento', 'pork', 'wa', [['pork_loin', 60], ['spinach', 30]]),
  mk('bento_beef', '牛しぐれ煮弁当', 'bento', 'beef', 'wa', [['beef_koma', 60], ['spinach', 30]]),
  mk('lunch_udon', 'かけうどん', 'lunch', 'none', 'wa', [['frozen_udon', 1], ['green_onion', 10]]),
  mk('lunch_gyudon', '牛丼', 'lunch', 'beef', 'wa', [['beef_koma', 80], ['onion', 0.25]]),
];

/** 値段の目安（テスト用。円 / per）。 */
const PRICES: Record<string, Price> = {
  chicken_thigh: { yen: 300, per: 300 }, // 1円/g
  beef_koma: { yen: 750, per: 250 }, // 3円/g
  pork_belly: { yen: 400, per: 200 }, // 2円/g
  pork_loin: { yen: 500, per: 250 },
  spinach: { yen: 200, per: 200 }, // 1円/g
  egg: { yen: 300, per: 10 }, // 30円/個
  milk: { yen: 250, per: 1000 },
  tofu: { yen: 100, per: 1 },
  natto: { yen: 90, per: 3 },
  salmon: { yen: 400, per: 2 },
  ground_mix: { yen: 450, per: 300 },
  tomato: { yen: 100, per: 1 },
  frozen_udon: { yen: 250, per: 5 },
};

const PRICED: Ingredient[] = INGREDIENTS.map((i) => (PRICES[i.id] ? { ...i, price: PRICES[i.id] } : i));
const full = makeCatalog([...DISHES, ...WORLD], PRICED, EXTRAS);

function stateWith(settings: Partial<HouseholdSettings>, cat = full, today = MONDAY): AppState {
  const s = createInitialState(demoInput(), cat, today);
  return { ...s, household: { ...s.household, settings: { ...s.household.settings, ...settings } } };
}

const TUE = '2026-11-10';
const SAT = '2026-11-14';

describe('設定を読む関数（ない項目は既定）', () => {
  it('国・ジャンル：既定は和食・洋食・中華・韓国が「よく出す」、イタリアン・エスニック・メキシカンが「出さない」。その他はいつも「よく出す」', () => {
    expect(cuisinesOf({})).toEqual(DEFAULT_CUISINES);
    expect(cuisineLevel({}, 'wa')).toBe('often');
    expect(cuisineLevel({}, 'kr')).toBe('often');
    expect(cuisineLevel({}, 'it')).toBe('never');
    expect(cuisineLevel({}, 'other')).toBe('often');
    expect(cuisineLevel({ cuisines: { it: 'sometimes' } }, 'it')).toBe('sometimes');
    expect(cuisinesOf({ cuisines: { eth: 'often', wa: 'never' } })).toMatchObject({ eth: 'often', wa: 'never', yo: 'often' });
  });

  it('辛さ・食事・昼・人数・予算の既定と範囲', () => {
    expect(spiceOf({})).toBe('normal');
    expect(spiceOf({ spice: 'mild' })).toBe('mild');
    expect(mealsOf({})).toBe('dinner');
    expect(lunchStyleOf({ meals: 'dinner_bento', lunchStyle: 'home' })).toBe('bento');
    expect(lunchStyleOf({ meals: 'three', lunchStyle: 'home' })).toBe('home');
    expect(lunchCountOf({})).toBe(1);
    expect(lunchCountOf({ lunchCount: 9 })).toBe(6);
    expect(lunchCountOf({ lunchCount: 0 })).toBe(1);
    expect(budgetOf({})).toBeNull();
    expect(budgetOf({ weeklyBudget: null })).toBeNull();
    expect(budgetOf({ weeklyBudget: 0 })).toBeNull();
    expect(budgetOf({ weeklyBudget: 12000.4 })).toBe(12000);
  });

  it('買い物のしかた：何日分まとめて買うか（月〜金の献立）', () => {
    const weekdays = [1, 2, 3, 4, 5] as const;
    expect(daysPerTrip([0, 3], weekdays)).toBe(3); // 日曜に月・火、水曜に水・木・金（平均2.5）
    expect(daysPerTrip([0], weekdays)).toBe(5);
    expect(daysPerTrip([1, 2, 3, 4, 5], weekdays)).toBe(1);
    expect(daysPerTrip([], weekdays)).toBe(1);
    expect(daysPerTrip([0], [])).toBe(0);
    expect(paceWeekdays('daily', weekdays)).toEqual([1, 2, 3, 4, 5]);
    expect(paceOf([3, 0], weekdays)).toBe('twice');
    expect(paceOf([0], weekdays)).toBe('weekly');
    expect(paceOf([5, 4, 3, 2, 1], weekdays)).toBe('daily');
    expect(paceOf([2], weekdays)).toBe('custom');
  });

  it('読み込みの検査：あとから足した項目は、あれば形を確かめる（なくてもよい）', () => {
    expect(checkSettingsExtras({})).toBeNull();
    expect(checkSettingsExtras({ cuisines: { it: 'often' }, spice: 'hot', meals: 'three', lunchCount: 2, weeklyBudget: null })).toBeNull();
    expect(checkSettingsExtras({ cuisines: { fr: 'often' } })).not.toBeNull();
    expect(checkSettingsExtras({ cuisines: { it: 'always' } })).not.toBeNull();
    expect(checkSettingsExtras({ meals: 'four' })).not.toBeNull();
    expect(checkSettingsExtras({ weeklyBudget: '1万円' })).not.toBeNull();
    expect(checkSettingsExtras({ lunchCount: Number.NaN })).not.toBeNull();
  });

  it('初回設定で選んだ項目は、世帯の設定に入る（選ばなかった項目は書かない）', () => {
    const s = createInitialState(
      demoInput({ extras: { cuisines: { it: 'often' }, spice: 'mild', meals: 'dinner_bento', lunchCount: 2, weeklyBudget: 9000 } }),
      full,
      MONDAY,
    );
    expect(s.household.settings).toMatchObject({ cuisines: { it: 'often' }, spice: 'mild', meals: 'dinner_bento', lunchCount: 2, weeklyBudget: 9000 });
    expect(s.household.settings.breakfastStyle).toBeUndefined();
    const plain = createInitialState(demoInput(), full, MONDAY);
    expect(plain.household.settings.cuisines).toBeUndefined();
    expect(plain.household.settings.meals).toBeUndefined();
  });
});

describe('国の料理と辛さ（献立の条件）', () => {
  it('既定では、イタリアン・エスニック・メキシカンの料理は出さない（前からの家族の献立を変えない）。韓国は出す', () => {
    const env = makeEnv(stateWith({}), full, new Set(), 1);
    expect(fitsTaste(env, WORLD[0])).toBe(true); // ビビンバ（韓国）
    expect(fitsTaste(env, WORLD[1])).toBe(false); // カルボナーラ
    expect(fitsTaste(env, WORLD[2])).toBe(false);
    expect(fitsTaste(env, WORLD[3])).toBe(false);
  });

  it('「出さない」にした国・ジャンルの料理は出さないが、家族が定番に選んだ料理は出す', () => {
    const s = stateWith({ cuisines: { wa: 'never' } });
    const env = makeEnv(s, full, new Set(), 1);
    const slot = makeSlot(env, MONDAY);
    const teriyaki = full.dishById.get('teriyaki_chicken')!; // 定番（和食）
    const gyudonLike = full.dishById.get('oyakodon')!; // 定番でない和食
    expect(allowedOn(env, teriyaki, slot)).toBe(true);
    expect(allowedOn(env, gyudonLike, slot)).toBe(false);
  });

  it('「ときどき」は週に1回まで、「よく出す」は今までどおり（週の6割まで）', () => {
    const s = stateWith({ cuisines: { it: 'sometimes', yo: 'sometimes' } });
    const cap = genreCapFor(s.household, full, 5);
    expect(cap('it')).toBe(1);
    expect(cap('yo')).toBe(1);
    expect(cap('wa')).toBeGreaterThanOrEqual(3);
  });

  it('家族が「よく出す」を選んだ国・ジャンルは、点が上がる（既定の「よく出す」では上げない）', () => {
    const carbonara = full.dishById.get('carbonara')!;
    const plain = makeEnv(stateWith({ cuisines: { it: 'sometimes' } }), full, new Set(), 7);
    const liked = makeEnv(stateWith({ cuisines: { it: 'often' } }), full, new Set(), 7);
    const a = scoreMain(plain, makeSlot(plain, TUE), carbonara).score;
    const b = scoreMain(liked, makeSlot(liked, TUE), carbonara).score;
    expect(b - a).toBeCloseTo(1.5, 5);
    // 既定の「よく出す」（和食）には足さない
    const teriyaki = full.dishById.get('teriyaki_chicken')!;
    const d1 = makeEnv(stateWith({}), full, new Set(), 7);
    const d2 = makeEnv(stateWith({ cuisines: { wa: 'often' } }), full, new Set(), 7);
    expect(scoreMain(d2, makeSlot(d2, TUE), teriyaki).score - scoreMain(d1, makeSlot(d1, TUE), teriyaki).score).toBeCloseTo(1.5, 5);
  });

  it('「辛くないものだけ」なら辛い料理は出さない（定番は出す）。「辛いのも好き」なら子どもがいても下げない', () => {
    const mapo = full.dishById.get('mapo_tofu')!;
    const mild = makeEnv(stateWith({ spice: 'mild' }), full, new Set(), 3);
    expect(allowedOn(mild, mapo, makeSlot(mild, TUE))).toBe(false);
    const fav = stateWith({ spice: 'mild' });
    fav.household = { ...fav.household, favorites: [...fav.household.favorites, { dishId: 'mapo_tofu' }] };
    const favEnv = makeEnv(fav, full, new Set(), 3);
    expect(allowedOn(favEnv, mapo, makeSlot(favEnv, TUE))).toBe(true);
    const normal = makeEnv(stateWith({}), full, new Set(), 3);
    const hot = makeEnv(stateWith({ spice: 'hot' }), full, new Set(), 3);
    const n = scoreMain(normal, makeSlot(normal, TUE), mapo).score;
    const h = scoreMain(hot, makeSlot(hot, TUE), mapo).score;
    expect(h - n).toBeCloseTo(2.5, 5); // 子どもの -2 をやめ、+0.5
  });

  it('1週間の献立：出さない国の料理は入らない', () => {
    const s = createInitialState(demoInput({ extras: { cuisines: { kr: 'never', it: 'never', eth: 'never', mx: 'never' } } }), full, MONDAY);
    for (const m of s.meals) for (const id of m.dishIds) expect(['bibimbap', 'carbonara', 'gapao', 'tacos']).not.toContain(id);
  });

  it('トーク：「イタリアンがいい」「エスニックがいい」はジャンルの希望。「韓国のりがほしい」は韓国料理の希望にしない', () => {
    const ctx = { today: MONDAY, members: createInitialState(demoInput(), full, MONDAY).household.members, catalog: full };
    expect(parseMessage('金曜はイタリアンがいい', ctx)).toEqual([{ type: 'request', date: '2026-11-13', genre: 'it' }]);
    expect(parseMessage('明日はエスニックがいい', ctx)).toEqual([{ type: 'request', date: TUE, genre: 'eth' }]);
    expect(parseMessage('明日は韓国料理がいい', ctx)).toEqual([{ type: 'request', date: TUE, genre: 'kr' }]);
    const nori = parseMessage('韓国のりがほしい', ctx);
    expect(nori.some((c) => c.type === 'request' && 'genre' in c && c.genre === 'kr')).toBe(false);
  });
});

describe('予算（金額の目安）', () => {
  it('料理の材料費の目安：値段のある材料だけを足す（常備品・値段のない材料は数えない）', () => {
    const s = stateWith({});
    const teriyaki = full.dishById.get('teriyaki_chicken')!; // 鶏もも100g（1円/g）＋醤油・みりん（常備品）
    expect(dishCost(teriyaki, s.household, full)).toBeCloseTo(100, 5);
    const unknown = full.dishById.get('tomato_salad')!; // トマト0.5個（100円）
    expect(dishCost(unknown, s.household, full)).toBeCloseTo(50, 5);
    expect(dishCost(full.dishById.get('cucumber_sunomono')!, s.household, full)).toBeNull(); // きゅうりに値段がない
  });

  it('夕食1回・大人1人分の目安：予算 ÷（献立の日数×人数）。予算がなければ null', () => {
    const s = stateWith({ weeklyBudget: 8000 });
    const servings = servingsFor(s.household);
    expect(dinnerBudgetPerServing(s.household, full)).toBeCloseTo(8000 / (5 * servings), 5);
    expect(dinnerBudgetPerServing(stateWith({}).household, full)).toBeNull();
  });

  it('予算が少ないと、高い主菜の点が下がる', () => {
    const nikujaga = full.dishById.get('nikujaga')!; // 牛こま70g（3円/g）＝210円
    const rich = makeEnv(stateWith({}), full, new Set(), 9);
    const tight = makeEnv(stateWith({ weeklyBudget: 2000 }), full, new Set(), 9);
    const a = scoreMain(rich, makeSlot(rich, TUE), nikujaga).score;
    const b = scoreMain(tight, makeSlot(tight, TUE), nikujaga).score;
    expect(b).toBeLessThan(a - 1);
  });

  it('週の食費の目安と、買い物リストの合計の目安（パックで買う分。値段のない品は数えない）', () => {
    const s = createInitialState(demoInput(), full, MONDAY);
    const w = weekCost(s, full, weekStartOf(MONDAY));
    expect(w.dinners).toBeGreaterThan(0);
    expect(w.extras).toBe(0);
    expect(w.total).toBe(w.dinners);
    for (const list of s.shopping) {
      const c = listCost(list, full);
      expect(c.yen).toBeGreaterThanOrEqual(0);
      expect(c.missing).toBeLessThanOrEqual(list.items.length);
    }
    expect(yenText(3243)).toBe('約3,240円');
  });
});

describe('夕食のほかの食事（朝ごはん・お弁当・お昼）', () => {
  it('夕食だけなら何も出さない。夕食＋お弁当はお弁当、朝・昼・夕は朝ごはんと、お弁当か家の昼', () => {
    expect(extraSlotsOf(stateWith({}).household)).toEqual([]);
    expect(extraSlotsOf(stateWith({ meals: 'dinner_bento' }).household)).toEqual(['bento']);
    expect(extraSlotsOf(stateWith({ meals: 'three' }).household)).toEqual(['breakfast', 'bento']);
    expect(extraSlotsOf(stateWith({ meals: 'three', lunchStyle: 'home' }).household)).toEqual(['breakfast', 'lunch']);
    expect(extrasOn(stateWith({}).household, full, TUE)).toEqual([]);
  });

  it('お弁当・お昼は設定の人数分、朝ごはんは家族みんなの分。献立を作らない曜日（土曜）は出さない', () => {
    const h = stateWith({ meals: 'three', lunchStyle: 'home', lunchCount: 2 }).household;
    const xs = extrasOn(h, full, TUE);
    expect(xs.map((x) => x.slot)).toEqual(['breakfast', 'lunch']);
    expect(xs[0].servings).toBe(servingsFor(h));
    expect(xs[1].servings).toBe(2);
    expect(extrasOn(h, full, SAT)).toEqual([]);
  });

  it('朝ごはんの主食：ごはんは和、パンは洋。日替わりは週の1日目がごはん、2日目がパン', () => {
    const rice = stateWith({ meals: 'three', breakfastStyle: 'rice' }).household;
    const bread = stateWith({ meals: 'three', breakfastStyle: 'bread' }).household;
    const mix = stateWith({ meals: 'three' }).household;
    for (const d of [MONDAY, TUE, '2026-11-11']) {
      expect(extrasOn(rice, full, d)[0].dish.genre).toBe('wa');
      expect(extrasOn(bread, full, d)[0].dish.genre).toBe('yo');
    }
    expect(extrasOn(mix, full, MONDAY)[0].dish.genre).toBe('wa');
    expect(extrasOn(mix, full, TUE)[0].dish.genre).toBe('yo');
  });

  it('家族の除外に当たる組み合わせは出さない（デモの家族は卵アレルギーの子がいる）', () => {
    const h = stateWith({ meals: 'three' }).household;
    for (let i = 0; i < 14; i++) {
      const date = `2026-11-${String(9 + i).padStart(2, '0')}`;
      for (const x of extrasOn(h, full, date)) expect(['bf_egg', 'bento_egg']).not.toContain(x.dish.id);
    }
  });

  it('同じ週のうちは、候補があれば同じお弁当が続かない（月〜金で5つとも違う）', () => {
    const noEgg = createInitialState(
      demoInput({ members: [{ nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] }], extras: { meals: 'dinner_bento' } }),
      full,
      MONDAY,
    ).household;
    const ids = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((d) => extrasOn(noEgg, full, d)[0].dish.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('買い物リスト：お弁当の材料も入る（明日からの分。今日のお弁当は済んでいる）', () => {
    const dinnerOnly = stateWith({});
    const withBento = stateWith({ meals: 'dinner_bento', lunchCount: 2 });
    const spinach = (s: AppState) =>
      buildShoppingLists(s, full)
        .flatMap((l) => l.items)
        .filter((i) => i.ingredientId === 'spinach')
        .reduce((a, i) => a + i.amount, 0);
    const extra = spinach(withBento) - spinach(dinnerOnly);
    // 火〜金の4日 × 30g × 2人 = 240g（10g 単位の丸めの分だけずれてよい）
    expect(extra).toBeGreaterThanOrEqual(230);
    expect(extra).toBeLessThanOrEqual(250);
    const forDates = buildShoppingLists(withBento, full).flatMap((l) => l.items.filter((i) => i.ingredientId === 'spinach').flatMap((i) => i.forDates));
    expect(forDates).not.toContain(MONDAY);
  });

  it('週の食費の目安に、お弁当の分も入る', () => {
    const w0 = weekCost(stateWith({}), full, weekStartOf(MONDAY));
    const w1 = weekCost(stateWith({ meals: 'dinner_bento', lunchCount: 1 }), full, weekStartOf(MONDAY));
    expect(w1.extras).toBeGreaterThan(0);
    expect(w1.total).toBeCloseTo(w0.total + w1.extras, 5);
  });

  it('基本のマスタ（extras なし）では、どの設定でも何も足さない', () => {
    const h = stateWith({ meals: 'three' }, baseCatalog).household;
    expect(extrasOn(h, baseCatalog, TUE)).toEqual([]);
  });
});
