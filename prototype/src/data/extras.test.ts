import type { AllergenId, Dish, Household, Ingredient } from '../engine/types';
import { AISLE_ORDER, UNIT_LABEL } from '../engine/types';
import { checkDishSafety } from '../engine/index';
import { normalizeJa } from '../engine/util';
import { ALLERGENS, DISHES, EXTRA_DISHES, EXTRA_INGREDIENTS, INGREDIENTS, WORLD_DISHES, WORLD_INGREDIENTS, defaultCatalog } from './index';

// 夕食のほかの食事（extras.ts）：朝ごはん・お弁当・家で食べるお昼の組み合わせと、そのための食材。

/** 標準の食材と、世界の料理の食材（extras の食材は、これと重ならないこと）。 */
const BASE_INGREDIENTS: Ingredient[] = [...INGREDIENTS, ...WORLD_INGREDIENTS];
const baseIngredientIds = new Set(BASE_INGREDIENTS.map((i) => i.id));
const ingredientById = new Map([...BASE_INGREDIENTS, ...EXTRA_INGREDIENTS].map((i) => [i.id, i]));
const ing = (id: string): Ingredient => {
  const found = ingredientById.get(id);
  if (!found) throw new Error(`unknown ingredient: ${id}`);
  return found;
};
const extra = (id: string): Ingredient => {
  const found = EXTRA_INGREDIENTS.find((i) => i.id === id);
  if (!found) throw new Error(`unknown extra ingredient: ${id}`);
  return found;
};

const duplicates = (values: string[]) => values.filter((v, i) => values.indexOf(v) !== i);
const validMonths = (months: number[] | undefined) =>
  months === undefined ||
  (months.length > 0 && months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) && duplicates(months.map(String)).length === 0);
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const inMonth = (d: Dish, m: number) => !d.seasonMonths || d.seasonMonths.includes(m);

const uses = (d: Dish, id: string) => d.ingredients.some((x) => x.ingredientId === id);
const amountOf = (d: Dish, id: string) => d.ingredients.find((x) => x.ingredientId === id)?.amount;
/** 組み合わせに含まれるアレルゲン（食材の派生原材料を含む）。 */
const allergensOf = (d: Dish) => new Set(d.ingredients.flatMap((x) => ing(x.ingredientId).allergens));
const usesUncertain = (d: Dish) => d.ingredients.some((x) => ing(x.ingredientId).uncertain);

const EGG_MILK_WHEAT: AllergenId[] = ['egg', 'milk', 'wheat'];
/** 卵・乳・小麦（派生原材料も）を含まず、銘柄で変わる加工品（要確認）も使わない。アレルギーのある家族に、そのまま出せる。 */
const freeOfEggMilkWheat = (d: Dish) => {
  const a = allergensOf(d);
  return !EGG_MILK_WHEAT.some((x) => a.has(x)) && !usesUncertain(d);
};
/** 銘柄で原材料が変わる冷凍食品（冷凍の売り場の、要確認の食材）。 */
const usesFrozenFood = (d: Dish) =>
  d.ingredients.some((x) => {
    const i = ing(x.ingredientId);
    return i.aisle === 'frozen' && i.uncertain;
  });

/** パン（食パン・ロールパン・米粉パン）。 */
const BREAD_IDS = ['bread', 'roll_bread', 'rice_flour_bread'];
const usesBread = (d: Dish) => BREAD_IDS.some((id) => uses(d, id));
const usesNoodle = (d: Dish) => d.ingredients.some((x) => ing(x.ingredientId).kind === 'noodle');

const breakfasts = EXTRA_DISHES.filter((d) => d.role === 'breakfast');
const riceBreakfasts = breakfasts.filter((d) => d.genre === 'wa');
const breadBreakfasts = breakfasts.filter((d) => d.genre === 'yo');
const bentos = EXTRA_DISHES.filter((d) => d.role === 'bento');
const lunches = EXTRA_DISHES.filter((d) => d.role === 'lunch');

/** 朝ごはん（ごはん・パン）・お弁当・家の昼。数を確かめるときの分け方。 */
const GROUPS: [label: string, test: (d: Dish) => boolean][] = [
  ['朝ごはん（ごはん）', (d) => d.role === 'breakfast' && d.genre === 'wa'],
  ['朝ごはん（パン）', (d) => d.role === 'breakfast' && d.genre === 'yo'],
  ['お弁当', (d) => d.role === 'bento'],
  ['家の昼', (d) => d.role === 'lunch'],
];

describe('EXTRA_DISHES（朝ごはん・お弁当・家の昼の組み合わせ）', () => {
  it('uses only the breakfast, bento and lunch roles, in the planned numbers', () => {
    for (const d of EXTRA_DISHES) expect(['breakfast', 'bento', 'lunch'], d.id).toContain(d.role);
    const between = (n: number, min: number, max: number, label: string) => {
      expect(n, label).toBeGreaterThanOrEqual(min);
      expect(n, label).toBeLessThanOrEqual(max);
    };
    between(riceBreakfasts.length, 6, 12, 'breakfast wa');
    between(breadBreakfasts.length, 6, 12, 'breakfast yo');
    between(bentos.length, 8, 15, 'bento');
    between(lunches.length, 6, 12, 'lunch');
  });

  it('gives each breakfast the genre of its staple: wa for rice, yo for bread', () => {
    for (const d of breakfasts) {
      expect(['wa', 'yo'], d.id).toContain(d.genre);
      if (d.genre === 'wa') expect(uses(d, 'rice'), d.id).toBe(true);
      else expect(uses(d, 'rice'), d.id).toBe(false);
    }
    // パンの朝ごはんは、ほとんどがパンを使う（グラノーラなど、ごはんでない洋の朝ごはんも少しならよい）
    expect(breadBreakfasts.filter(usesBread).length).toBeGreaterThanOrEqual(breadBreakfasts.length - 2);
  });

  it('has unique ids and names that do not clash with the dinner dishes', () => {
    expect(duplicates(EXTRA_DISHES.map((d) => d.id))).toEqual([]);
    expect(duplicates(EXTRA_DISHES.map((d) => d.name))).toEqual([]);
    const dinnerIds = new Set([...DISHES, ...WORLD_DISHES].map((d) => d.id));
    for (const d of EXTRA_DISHES) {
      expect(d.id).toMatch(/^[a-z][a-z0-9_]*$/);
      // id の頭は役割（breakfast_・bento_・lunch_）
      expect(d.id.startsWith(`${d.role}_`), d.id).toBe(true);
      expect(dinnerIds.has(d.id), d.id).toBe(false);
      expect(defaultCatalog.extraById.get(d.id), d.id).toBe(d);
      expect(defaultCatalog.dishById.has(d.id), d.id).toBe(false);
    }
  });

  it('uses only known ingredients with positive amounts', () => {
    for (const d of EXTRA_DISHES) {
      expect(d.ingredients.length, d.id).toBeGreaterThan(0);
      expect(duplicates(d.ingredients.map((x) => x.ingredientId)), d.id).toEqual([]);
      for (const x of d.ingredients) {
        expect(ingredientById.has(x.ingredientId), `${d.id}: ${x.ingredientId}`).toBe(true);
        expect(defaultCatalog.ingredientById.has(x.ingredientId), `${d.id}: ${x.ingredientId}`).toBe(true);
        expect(Number.isFinite(x.amount) && x.amount > 0, `${d.id}: ${x.ingredientId}`).toBe(true);
      }
    }
    // 新しい食材は、どれかの組み合わせで使う
    for (const i of EXTRA_INGREDIENTS) expect(EXTRA_DISHES.some((d) => uses(d, i.id)), i.id).toBe(true);
  });

  it('has quick breakfasts and valid minutes, months, flags and tags', () => {
    for (const d of EXTRA_DISHES) {
      expect(d.name.length, d.id).toBeGreaterThan(0);
      expect(Number.isInteger(d.minutes) && d.minutes > 0 && d.minutes <= 30, d.id).toBe(true);
      expect(validMonths(d.seasonMonths), d.id).toBe(true);
      expect(d.spicy, d.id).toBe(false);
      expect(typeof d.kidFriendly, d.id).toBe('boolean');
      expect(d.sourceUrl, d.id).toBeUndefined();
      expect(d.custom, d.id).toBeUndefined();
      expect(d.tags.length, d.id).toBeGreaterThan(0);
      expect(duplicates(d.tags), d.id).toEqual([]);
      // タグは日本語（'complete'・'soupy' は夕食の献立だけの印）
      for (const t of d.tags) expect(t, d.id).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
    }
    for (const d of breakfasts) {
      expect(d.minutes, d.id).toBeGreaterThanOrEqual(5);
      expect(d.minutes, d.id).toBeLessThanOrEqual(15);
    }
    // どの食事にも、子どもが食べやすい組み合わせが十分ある
    for (const [label, test] of GROUPS) {
      expect(EXTRA_DISHES.filter((d) => test(d) && d.kidFriendly).length, label).toBeGreaterThanOrEqual(5);
    }
  });

  it('limits seasonal sets to their months and keeps enough sets in every month', () => {
    const byId = new Map(EXTRA_DISHES.map((d) => [d.id, d]));
    expect(byId.get('lunch_somen')?.seasonMonths).toEqual([6, 7, 8, 9]);
    expect(byId.get('breakfast_zosui')?.seasonMonths).toEqual([11, 12, 1, 2, 3]);
    for (const m of MONTHS) {
      for (const [label, test] of GROUPS) {
        expect(EXTRA_DISHES.filter((d) => test(d) && inMonth(d, m)).length, `${m}月 ${label}`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('tags the staple of each set (ごはん・パン・麺)', () => {
    for (const d of EXTRA_DISHES) {
      expect(d.tags.includes('ごはん'), d.id).toBe(uses(d, 'rice'));
      expect(d.tags.includes('パン'), d.id).toBe(usesBread(d));
      expect(d.tags.includes('麺'), d.id).toBe(usesNoodle(d));
    }
  });

  it('tags 冷凍食品 exactly on the sets that use a brand-dependent frozen food', () => {
    for (const d of EXTRA_DISHES) expect(d.tags.includes('冷凍食品'), d.id).toBe(usesFrozenFood(d));
    expect(bentos.filter(usesFrozenFood).length).toBeGreaterThanOrEqual(2);
  });

  it('lists what the name says (so that the allergen check sees it)', () => {
    // 名前の語 → 使うはずの食材（どれか1つ）。卵・乳・小麦・魚などが名前にあるのに材料にないと、除外の判定から漏れる。
    const rules: [word: string, anyOf: string[]][] = [
      ['ごはん', ['rice']], ['むすび', ['rice']], ['おにぎり', ['rice']], ['丼', ['rice']], ['チャーハン', ['rice']],
      ['雑炊', ['rice']], ['ライス', ['rice']],
      ['卵', ['egg']], ['目玉焼き', ['egg']], ['フレンチトースト', ['egg']], ['フレンチトースト', ['milk']], ['親子丼', ['egg']],
      ['牛乳', ['milk']], ['ヨーグルト', ['plain_yogurt']], ['チーズ', ['cheese_slice', 'cheese_pizza']], ['ピザ', ['cheese_pizza']],
      ['トースト', ['bread']], ['サンドイッチ', ['bread']], ['ホットドッグ', ['roll_bread']], ['米粉パン', ['rice_flour_bread']],
      ['グラノーラ', ['granola']], ['ジャム', ['strawberry_jam']], ['バナナ', ['banana']], ['豆乳', ['soy_milk']],
      ['味噌汁', ['miso']], ['味噌汁', ['dashi']], ['豚汁', ['miso']], ['味噌', ['miso']], ['照り焼き', ['soy_sauce']],
      ['ケチャップ', ['ketchup']], ['ナポリタン', ['ketchup']],
      ['鮭', ['salmon']], ['さば', ['mackerel']], ['しらす', ['shirasu']], ['納豆', ['natto']], ['ちくわ', ['chikuwa']],
      ['鶏', ['chicken_thigh', 'chicken_breast', 'ground_chicken']], ['チキン', ['chicken_thigh', 'chicken_breast']],
      ['親子丼', ['chicken_thigh']], ['豚', ['pork_komagire', 'pork_belly', 'pork_loin_sliced']], ['肉うどん', ['beef_komagire', 'pork_komagire']],
      ['ウインナー', ['sausage']], ['ホットドッグ', ['sausage']], ['ハム', ['ham']],
      ['唐揚げ', ['frozen_karaage', 'chicken_thigh']], ['から揚げ', ['frozen_karaage', 'chicken_thigh']],
      ['ハンバーグ', ['frozen_mini_hamburg']], ['冷凍のおかず', ['frozen_bento_side']],
      ['うどん', ['udon', 'frozen_udon']], ['そうめん', ['somen']], ['焼きそば', ['yakisoba_men']], ['ナポリタン', ['pasta']],
      ['豆腐', ['tofu_silken', 'tofu_firm']], ['油揚げ', ['abura_age']], ['厚揚げ', ['atsuage']], ['わかめ', ['dried_wakame']],
      ['ミニトマト', ['cherry_tomato']], ['ブロッコリー', ['broccoli']], ['ほうれん草', ['spinach']], ['小松菜', ['komatsuna']],
      ['大根', ['daikon']], ['じゃがいも', ['potato']], ['玉ねぎ', ['onion']], ['キャベツ', ['cabbage']], ['きゅうり', ['cucumber']],
      ['ピーマン', ['green_pepper']], ['さつまいも', ['sweet_potato']], ['いんげん', ['green_beans']],
    ];
    for (const d of EXTRA_DISHES) {
      for (const [word, anyOf] of rules) {
        if (d.name.includes(word)) expect(anyOf.some((id) => uses(d, id)), `${d.id}: ${word}`).toBe(true);
      }
    }
  });

  it('uses typical amounts for one adult', () => {
    for (const d of EXTRA_DISHES) {
      // 米は炊く前の量（お茶碗1杯 60〜80g、おにぎり2個・丼 90〜100g）
      const rice = amountOf(d, 'rice');
      if (rice !== undefined) {
        expect(rice, d.id).toBeGreaterThanOrEqual(50);
        expect(rice, d.id).toBeLessThanOrEqual(110);
      }
      for (const x of d.ingredients) {
        const i = ing(x.ingredientId);
        if (['chicken', 'pork', 'beef', 'ground'].includes(i.kind) && i.unit === 'g') {
          expect(x.amount, `${d.id}: ${i.id}`).toBeGreaterThanOrEqual(30);
          expect(x.amount, `${d.id}: ${i.id}`).toBeLessThanOrEqual(120);
        }
        if (BREAD_IDS.includes(i.id) || i.id === 'egg') expect(x.amount, `${d.id}: ${i.id}`).toBeLessThanOrEqual(2);
        if (i.unit === 'tbsp' || i.unit === 'tsp') expect(x.amount, `${d.id}: ${i.id}`).toBeLessThanOrEqual(3);
      }
    }
    for (const d of riceBreakfasts) expect(amountOf(d, 'rice'), d.id).toBeLessThanOrEqual(80);
  });
});

describe('EXTRA_INGREDIENTS（朝ごはん・お弁当のための食材）', () => {
  it('has unique snake_case ids that do not clash with the standard or world ingredients', () => {
    expect(duplicates(EXTRA_INGREDIENTS.map((i) => i.id))).toEqual([]);
    for (const i of EXTRA_INGREDIENTS) {
      expect(i.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(baseIngredientIds.has(i.id), i.id).toBe(false);
      expect(defaultCatalog.ingredientById.get(i.id)?.name, i.id).toBe(i.name);
    }
    expect(defaultCatalog.ingredientById.size).toBe(defaultCatalog.ingredients.length);
  });

  it('maps each name and alias to only one ingredient, also against the standard and world ingredients', () => {
    // 名前・別名は、トークの読み取り（「ヨーグルト買った」）と除外の検索に使う。ひらがな・カタカナの違いはそろえて比べる。
    const termsOf = (i: Ingredient) => [...new Set([i.name, ...i.aliases, ...(i.genericAliases ?? [])].map(normalizeJa))];
    const owner = new Map<string, string>();
    for (const i of BASE_INGREDIENTS) for (const t of termsOf(i)) if (!owner.has(t)) owner.set(t, i.id);
    // 総称・まとめの語は別名にしない（1つの食材だけに当ててしまう）
    const GENERIC = ['肉', '魚', '貝', '果物', 'フルーツ', '乳製品', 'パン', 'ごはん', '麺', 'おかず', '弁当', 'お弁当', '冷凍食品'].map(normalizeJa);
    for (const i of EXTRA_INGREDIENTS) {
      expect(i.genericAliases, i.id).toBeUndefined();
      for (const t of termsOf(i)) {
        expect(t.length, `${i.id}: ${t}`).toBeGreaterThanOrEqual(2);
        expect(GENERIC, `${i.id}: ${t}`).not.toContain(t);
        const other = owner.get(t);
        expect(other === undefined || other === i.id, `${i.id}: ${t}（${other} と重なる）`).toBe(true);
        owner.set(t, i.id);
      }
    }
  });

  it('uses valid units, aisles, shelf lives, allergens, thawing and substitutes', () => {
    const allergenIds = new Set(ALLERGENS.map((a) => a.id));
    for (const i of EXTRA_INGREDIENTS) {
      expect(Object.keys(UNIT_LABEL), i.id).toContain(i.unit);
      expect(AISLE_ORDER, i.id).toContain(i.aisle);
      expect(Number.isInteger(i.shelfLifeDays) && i.shelfLifeDays > 0, i.id).toBe(true);
      expect(validMonths(i.seasonMonths), i.id).toBe(true);
      expect(duplicates(i.allergens), i.id).toEqual([]);
      for (const a of i.allergens) expect(allergenIds.has(a), `${i.id}: ${a}`).toBe(true);
      if (i.thaw) expect(i.freezable, i.id).toBe(true);
      if (i.aisle === 'frozen') expect(i, i.id).toMatchObject({ freezable: true, thaw: 'from_frozen' });
      for (const s of i.substitutes ?? []) {
        expect(ingredientById.has(s), `${i.id} → ${s}`).toBe(true);
        expect(s, i.id).not.toBe(i.id);
      }
    }
  });

  it('gives a pack and a price to everything that is not a pantry staple', () => {
    for (const i of EXTRA_INGREDIENTS) {
      if (i.pantry) {
        expect(i.pack, i.id).toBeUndefined();
        continue;
      }
      expect(i.pack, i.id).toBeDefined();
      expect(i.pack!.size, i.id).toBeGreaterThan(0);
      expect(i.pack!.label.length, i.id).toBeGreaterThan(0);
      expect(i.price, i.id).toBeDefined();
      const { yen, per } = i.price!;
      expect(Number.isInteger(yen) && yen > 0, i.id).toBe(true);
      expect(per, i.id).toBeGreaterThan(0);
      // パックのある食材は1パックの値段（税込み）。スーパーでありそうな範囲
      expect(per, i.id).toBe(i.pack!.size);
      expect(yen, i.id).toBeGreaterThanOrEqual(50);
      expect(yen, i.id).toBeLessThanOrEqual(1500);
      // 献立の画面・予算は、デフォルトのマスタの値段を使う
      expect(defaultCatalog.ingredientById.get(i.id)?.price, i.id).toEqual(i.price);
    }
  });

  // 朝ごはん・お弁当で使う食材（ヨーグルトのように、世界の料理の食材と同じものは、どちらかの表に1つだけ置く）。
  it('includes derived allergens (when unsure, more)', () => {
    const cases: [string, AllergenId[]][] = [
      ['plain_yogurt', ['milk']], ['soy_milk', ['soy']], ['banana', ['banana']],
      ['roll_bread', ['wheat', 'milk', 'egg', 'soy']], ['granola', ['wheat', 'milk', 'soy']],
      ['frozen_mini_hamburg', ['wheat', 'milk', 'egg', 'soy', 'beef', 'pork']],
      ['frozen_bento_side', ['wheat', 'milk', 'egg', 'soy', 'shrimp']],
    ];
    for (const [id, expected] of cases) expect(ing(id).allergens, id).toEqual(expect.arrayContaining(expected));
  });

  it('marks brand-dependent processed foods as uncertain, but not plain foods', () => {
    for (const id of ['roll_bread', 'granola', 'frozen_mini_hamburg', 'frozen_bento_side']) expect(ing(id).uncertain, id).toBe(true);
    for (const id of ['plain_yogurt', 'soy_milk', 'banana', 'rice_flour_bread']) expect(ing(id).uncertain, id).toBe(false);
    for (const i of EXTRA_INGREDIENTS) if (i.aisle === 'frozen' && i.kind === 'processed') expect(i.uncertain, i.id).toBe(true);
  });

  it('keeps the rice-flour bread free of wheat, egg and milk, and says so on the shopping list', () => {
    const b = extra('rice_flour_bread');
    for (const a of EGG_MILK_WHEAT) expect(b.allergens).not.toContain(a);
    expect(b.pack?.label).toContain('小麦・卵・乳不使用');
    // 名前・別名にアレルゲンの語を入れない（自由入力の除外「小麦」「卵」が名前で当たらないように）
    for (const t of [b.name, ...b.aliases]) for (const w of ['小麦', '卵', '乳', 'グルテン']) expect(t).not.toContain(w);
  });
});

describe('アレルギーのある家族（卵・乳・小麦）', () => {
  it('has sets without egg, milk or wheat (derived ingredients included) and without uncertain items, every month', () => {
    // 朝ごはんはごはん3つ・パン2つ、お弁当と家の昼は3つ以上。子どもが食べやすいものも2つ以上。
    const minimum: Record<string, number> = { '朝ごはん（ごはん）': 3, '朝ごはん（パン）': 2, 'お弁当': 3, '家の昼': 3 };
    for (const m of MONTHS) {
      const free = EXTRA_DISHES.filter((d) => inMonth(d, m) && freeOfEggMilkWheat(d));
      for (const [label, test] of GROUPS) {
        expect(free.filter(test).length, `${m}月 ${label}`).toBeGreaterThanOrEqual(minimum[label]);
        expect(free.filter((d) => test(d) && d.kidFriendly).length, `${m}月 ${label}（子ども）`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('follows the ingredient master for soy sauce, mentsuyu and natto (wheat) and miso (soy only)', () => {
    const byId = new Map(EXTRA_DISHES.map((d) => [d.id, d]));
    const allergens = (id: string) => [...allergensOf(byId.get(id)!)].sort();
    expect(allergens('breakfast_salmon')).toEqual(['salmon', 'soy']); // 味噌汁は大豆だけ
    expect(allergens('bento_atsuage_miso')).toEqual(['soy']);
    expect(allergens('breakfast_natto')).toContain('wheat'); // 納豆のたれ
    expect(allergens('breakfast_zosui')).toEqual(expect.arrayContaining(['egg', 'wheat'])); // 醤油
    expect(allergens('lunch_somen')).toEqual(expect.arrayContaining(['wheat', 'mackerel'])); // めんつゆ
    for (const d of EXTRA_DISHES) {
      if (['soy_sauce', 'mentsuyu', 'natto', 'vinegar', 'ponzu'].some((id) => uses(d, id))) expect(freeOfEggMilkWheat(d), d.id).toBe(false);
    }
  });

  it('agrees with the safety check of the engine', () => {
    const household: Household = {
      id: 'household_extras_test',
      members: [
        { id: 'member_1', nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
        { id: 'member_2', nickname: 'はると', ageBand: 'child', role: 'child', exclusions: EGG_MILK_WHEAT.map((id) => ({ type: 'allergen' as const, id })) },
      ],
      favorites: [],
      customDishes: [],
      settings: {
        plan: 'free',
        dinnerWeekdays: [1, 2, 3, 4, 5],
        shoppingWeekdays: [1, 4],
        rakuPerWeek: 1,
        newPerWeek: 1,
        sidePolicy: 'side_or_soup',
        maxMinutes: {},
        allowUncertainWithExclusions: false,
      },
      createdAt: '2026-11-16',
    };
    for (const d of EXTRA_DISHES) {
      const { status } = checkDishSafety(d, household, defaultCatalog);
      if (freeOfEggMilkWheat(d)) expect(status, d.id).toBe('ok');
      else if (EGG_MILK_WHEAT.some((a) => allergensOf(d).has(a))) expect(status, d.id).toBe('excluded');
      else expect(status, d.id).toBe('uncertain');
    }
  });
});
