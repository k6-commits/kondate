import type { AllergenId, Dish, Protein } from '../engine/types';
import { AISLE_ORDER, UNIT_LABEL } from '../engine/types';
import { ALLERGENS, DISHES, INGREDIENTS, defaultCatalog } from './index';

// AllergenId の全件（satisfies で、型との食い違いをコンパイル時に見つける）。
const ALL_ALLERGEN_IDS = Object.keys({
  shrimp: 1, crab: 1, walnut: 1, wheat: 1, buckwheat: 1, egg: 1, milk: 1, peanut: 1, cashew: 1,
  almond: 1, abalone: 1, squid: 1, salmon_roe: 1, orange: 1, kiwi: 1, beef: 1, sesame: 1, salmon: 1,
  mackerel: 1, soy: 1, chicken: 1, banana: 1, pork: 1, macadamia: 1, peach: 1, yam: 1, apple: 1, gelatin: 1,
} satisfies Record<AllergenId, 1>) as AllergenId[];

const MANDATORY: AllergenId[] = ['shrimp', 'crab', 'walnut', 'wheat', 'buckwheat', 'egg', 'milk', 'peanut', 'cashew'];

const ingredientById = new Map(INGREDIENTS.map((i) => [i.id, i]));
const ing = (id: string) => {
  const found = ingredientById.get(id);
  if (!found) throw new Error(`unknown ingredient: ${id}`);
  return found;
};

/** 料理に含まれるアレルゲン（食材の派生原材料を含む）。 */
function dishAllergens(dish: Dish): Set<AllergenId> {
  return new Set(dish.ingredients.flatMap((x) => ing(x.ingredientId).allergens));
}
const usesUncertain = (dish: Dish) => dish.ingredients.some((x) => ing(x.ingredientId).uncertain);
const containsAny = (dish: Dish, ids: AllergenId[]) => {
  const set = dishAllergens(dish);
  return ids.some((id) => set.has(id));
};

const duplicates = (values: string[]) => values.filter((v, i) => values.indexOf(v) !== i);
const validMonths = (months: number[] | undefined) =>
  months === undefined ||
  (months.length > 0 && months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) && duplicates(months.map(String)).length === 0);

const mains = DISHES.filter((d) => d.role === 'main');

describe('ALLERGENS', () => {
  it('covers every AllergenId exactly once', () => {
    expect(duplicates(ALLERGENS.map((a) => a.id))).toEqual([]);
    expect(ALLERGENS.map((a) => a.id).sort()).toEqual([...ALL_ALLERGEN_IDS].sort());
    for (const a of ALLERGENS) expect(a.name.length).toBeGreaterThan(0);
  });

  it('marks the 9 specified ingredients as mandatory and the rest as recommended', () => {
    expect(ALLERGENS.filter((a) => a.mandatory).map((a) => a.id).sort()).toEqual([...MANDATORY].sort());
    expect(ALLERGENS.filter((a) => !a.mandatory)).toHaveLength(ALL_ALLERGEN_IDS.length - MANDATORY.length);
  });

  it('notes the transition period for cashew', () => {
    const cashew = ALLERGENS.find((a) => a.id === 'cashew');
    expect(cashew?.note).toContain('2026年4月');
    expect(cashew?.note).toContain('2028年3月末');
  });
});

describe('INGREDIENTS', () => {
  it('has 150 to 200 items with unique ids', () => {
    expect(INGREDIENTS.length).toBeGreaterThanOrEqual(150);
    expect(INGREDIENTS.length).toBeLessThanOrEqual(200);
    expect(duplicates(INGREDIENTS.map((i) => i.id))).toEqual([]);
    for (const i of INGREDIENTS) expect(i.id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('maps each name and alias to only one ingredient', () => {
    const terms = INGREDIENTS.flatMap((i) => [i.name, ...i.aliases]);
    expect(duplicates(terms)).toEqual([]);
    for (const i of INGREDIENTS) for (const a of i.aliases) expect(a.trim().length).toBeGreaterThan(0);
  });

  it('uses valid units, aisles, days, months and allergens', () => {
    const allergenIds = new Set(ALLERGENS.map((a) => a.id));
    for (const i of INGREDIENTS) {
      expect(Object.keys(UNIT_LABEL), i.id).toContain(i.unit);
      expect(AISLE_ORDER, i.id).toContain(i.aisle);
      expect(Number.isInteger(i.shelfLifeDays) && i.shelfLifeDays > 0, i.id).toBe(true);
      expect(validMonths(i.seasonMonths), i.id).toBe(true);
      expect(duplicates(i.allergens), i.id).toEqual([]);
      for (const a of i.allergens) expect(allergenIds.has(a), `${i.id}: ${a}`).toBe(true);
    }
  });

  it('refers only to existing substitutes', () => {
    for (const i of INGREDIENTS) {
      for (const s of i.substitutes ?? []) {
        expect(ingredientById.has(s), `${i.id} → ${s}`).toBe(true);
        expect(s, i.id).not.toBe(i.id);
      }
    }
  });

  it('gives a pack to everything that is not a pantry staple', () => {
    for (const i of INGREDIENTS) {
      if (i.pantry) continue;
      expect(i.pack, i.id).toBeDefined();
      expect(i.pack!.size, i.id).toBeGreaterThan(0);
      expect(i.pack!.label.length, i.id).toBeGreaterThan(0);
    }
  });

  it('includes derived allergens', () => {
    const cases: [string, AllergenId[]][] = [
      ['soy_sauce', ['wheat', 'soy']], ['miso', ['soy']], ['mayonnaise', ['egg']],
      ['butter', ['milk']], ['milk', ['milk']], ['cheese_pizza', ['milk']], ['parmesan', ['milk']],
      ['panko', ['wheat']], ['flour', ['wheat']], ['udon', ['wheat']], ['frozen_udon', ['wheat']], ['chuka_men', ['wheat']],
      ['pasta', ['wheat']], ['bread', ['wheat']], ['gyoza_skin', ['wheat']], ['soba', ['buckwheat']],
      ['sesame_oil', ['sesame']], ['sesame', ['sesame']], ['mentsuyu', ['wheat', 'soy']], ['ponzu', ['wheat', 'soy']],
      ['tofu_firm', ['soy']], ['natto', ['soy']], ['nagaimo', ['yam']], ['shirasu', ['shrimp', 'crab']],
      ['chicken_thigh', ['chicken']], ['pork_komagire', ['pork']], ['beef_komagire', ['beef']], ['ground_mixed', ['beef', 'pork']],
      ['salmon', ['salmon']], ['mackerel', ['mackerel']], ['shrimp', ['shrimp']], ['squid', ['squid']],
    ];
    for (const [id, expected] of cases) {
      for (const a of expected) expect(ing(id).allergens, id).toContain(a);
    }
  });

  it('marks brand-dependent processed foods as uncertain', () => {
    const ids = [
      'curry_roux', 'stew_roux', 'dressing', 'chicken_stock', 'consomme', 'sauce', 'ponzu', 'mentsuyu', 'oyster_sauce',
      'frozen_gyoza', 'frozen_udon', 'frozen_karaage', 'deli_karaage', 'deli_potato_salad', 'retort_curry', 'pasta_sauce',
      'chikuwa', 'kamaboko', 'crab_stick', 'sausage', 'ham', 'bacon',
    ];
    for (const id of ids) expect(ing(id).uncertain, id).toBe(true);
    // 練り物は卵・小麦の可能性を allergens にも入れる
    for (const id of ['chikuwa', 'kamaboko']) expect(ing(id).allergens, id).toEqual(expect.arrayContaining(['egg', 'wheat']));
    // 生の食材は要確認にしない
    for (const id of ['chicken_thigh', 'egg', 'onion', 'tofu_firm', 'soy_sauce', 'salmon']) expect(ing(id).uncertain, id).toBe(false);
  });

  it('keeps seasonings, oils and flours in the pantry', () => {
    const ids = ['soy_sauce', 'miso', 'sugar', 'salt', 'pepper', 'mirin', 'sake', 'vinegar', 'salad_oil', 'sesame_oil', 'katakuriko', 'flour', 'rice'];
    for (const id of ids) expect(ing(id).pantry, id).toBe(true);
    for (const id of ['chicken_thigh', 'onion', 'egg', 'curry_roux']) expect(ing(id).pantry, id).toBe(false);
  });

  it('uses the expected purchase units', () => {
    expect(ing('chicken_thigh')).toMatchObject({ unit: 'g', pack: { size: 300, label: '1パック（約300g）' } });
    expect(ing('egg')).toMatchObject({ unit: 'piece', pack: { size: 10, label: '1パック（10個）' } });
    expect(ing('onion')).toMatchObject({ unit: 'piece', pack: { size: 3, label: '1袋（3個）' } });
    expect(ing('cabbage')).toMatchObject({ unit: 'g', pack: { size: 500, label: '1/2玉（約500g）' } });
    expect(ing('tofu_firm')).toMatchObject({ unit: 'block', pack: { size: 1, label: '1丁' } });
  });

  it('uses conservative shelf lives', () => {
    const cases: [string, number][] = [
      ['ground_mixed', 1], ['ground_pork', 1], ['salmon', 1], ['tuna_sashimi', 1], ['chicken_thigh', 2], ['chicken_breast', 2],
      ['spinach', 3], ['shimeji', 4], ['tofu_firm', 5], ['egg', 14], ['carrot', 14], ['onion', 30], ['potato', 30],
    ];
    for (const [id, days] of cases) expect(ing(id).shelfLifeDays, id).toBe(days);
    expect(ing('tuna_sashimi').freezable).toBe(false);
    expect(ing('chicken_thigh').freezable).toBe(true);
  });

  it('sets seasons for seasonal ingredients', () => {
    const cases: [string, number[]][] = [
      ['saury', [9, 10]], ['yellowtail', [12, 1, 2]], ['chinese_cabbage', [11, 12, 1, 2]], ['daikon', [11, 12, 1, 2]],
      ['eggplant', [6, 7, 8, 9]], ['tomato', [6, 7, 8]], ['green_pepper', [6, 7, 8, 9]], ['pumpkin', [7, 8, 9, 10]],
      ['sweet_potato', [9, 10, 11]], ['spinach', [11, 12, 1, 2]], ['new_onion', [3, 4, 5]], ['bamboo_shoot', [3, 4, 5]],
      ['shimeji', [9, 10, 11]], ['shiitake', [9, 10, 11]],
    ];
    for (const [id, months] of cases) expect(ing(id).seasonMonths, id).toEqual(months);
    for (const id of ['onion', 'cabbage', 'chicken_thigh', 'egg']) expect(ing(id).seasonMonths, id).toBeUndefined();
  });

  it('links common substitutes and spoken aliases', () => {
    expect(ing('chicken_thigh').substitutes).toContain('chicken_breast');
    expect(ing('chicken_breast').substitutes).toContain('chicken_thigh');
    expect(ing('pork_komagire').substitutes).toEqual(expect.arrayContaining(['pork_belly', 'pork_loin_sliced']));
    expect(ing('salmon').substitutes).toContain('cod');
    expect(ing('cod').substitutes).toContain('salmon');
    expect(ing('ground_mixed').substitutes).toContain('ground_pork');
    expect(ing('ground_pork').substitutes).toContain('ground_mixed');
    expect(ing('chicken_breast').aliases).toEqual(expect.arrayContaining(['鶏むね', 'むね肉', '胸肉', 'とりむね']));
  });
});

describe('DISHES', () => {
  it('has 90 to 120 dishes with unique ids and the planned mix of roles', () => {
    expect(DISHES.length).toBeGreaterThanOrEqual(90);
    expect(DISHES.length).toBeLessThanOrEqual(120);
    expect(duplicates(DISHES.map((d) => d.id))).toEqual([]);
    expect(duplicates(DISHES.map((d) => d.name))).toEqual([]);
    const count = (role: Dish['role']) => DISHES.filter((d) => d.role === role).length;
    expect(count('main')).toBeGreaterThanOrEqual(55);
    expect(count('main')).toBeLessThanOrEqual(70);
    expect(count('side')).toBeGreaterThanOrEqual(15);
    expect(count('soup')).toBeGreaterThanOrEqual(10);
    expect(count('raku')).toBeGreaterThanOrEqual(8);
  });

  it('uses only known ingredients with positive amounts', () => {
    for (const d of DISHES) {
      expect(d.ingredients.length, d.id).toBeGreaterThan(0);
      expect(duplicates(d.ingredients.map((x) => x.ingredientId)), d.id).toEqual([]);
      for (const x of d.ingredients) {
        expect(ingredientById.has(x.ingredientId), `${d.id}: ${x.ingredientId}`).toBe(true);
        expect(Number.isFinite(x.amount) && x.amount > 0, `${d.id}: ${x.ingredientId}`).toBe(true);
      }
    }
  });

  it('has valid minutes, months and flags', () => {
    for (const d of DISHES) {
      expect(d.minutes, d.id).toBeGreaterThan(0);
      expect(validMonths(d.seasonMonths), d.id).toBe(true);
      expect(d.name.length, d.id).toBeGreaterThan(0);
      expect(d.sourceUrl, d.id).toBeUndefined();
      expect(d.custom, d.id).toBeUndefined();
      if (d.spicy) expect(d.kidFriendly, d.id).toBe(false);
    }
  });

  it('lists seasonings in every main dish (for the allergen check)', () => {
    for (const d of mains) {
      const hasSeasoning = d.ingredients.some((x) => ing(x.ingredientId).kind === 'seasoning');
      expect(hasSeasoning, d.id).toBe(true);
    }
  });

  it('has at least 3 main dishes for each protein', () => {
    const proteins: Protein[] = ['chicken', 'pork', 'beef', 'ground', 'fish', 'seafood', 'egg', 'tofu'];
    for (const p of proteins) expect(mains.filter((d) => d.protein === p).length, p).toBeGreaterThanOrEqual(3);
  });

  it('balances Japanese, Western and Chinese main dishes', () => {
    for (const g of ['wa', 'yo', 'chu'] as const) expect(mains.filter((d) => d.genre === g).length, g).toBeGreaterThanOrEqual(8);
  });

  it('has enough main dishes without egg, milk or wheat (including derived ingredients)', () => {
    const free = mains.filter((d) => !containsAny(d, ['egg', 'milk', 'wheat']));
    expect(free.length).toBeGreaterThanOrEqual(20);
  });

  it('lets an egg-allergic household plan a week without uncertain items', () => {
    const eggFreeMains = mains.filter((d) => !containsAny(d, ['egg']) && !usesUncertain(d));
    expect(eggFreeMains.length).toBeGreaterThanOrEqual(20);
    for (const p of ['chicken', 'pork', 'beef', 'ground', 'fish'] as const) {
      expect(eggFreeMains.filter((d) => d.protein === p).length, p).toBeGreaterThanOrEqual(2);
    }
    const eggFreeRaku = DISHES.filter((d) => d.role === 'raku' && !containsAny(d, ['egg']) && !usesUncertain(d));
    expect(eggFreeRaku.length).toBeGreaterThanOrEqual(3);
  });

  it('limits seasonal dishes to their months', () => {
    const byId = new Map(DISHES.map((d) => [d.id, d]));
    expect(byId.get('sanma_shioyaki')?.seasonMonths).toEqual([9, 10]);
    expect(byId.get('buri_daikon')?.seasonMonths).toEqual([12, 1, 2]);
    expect(byId.get('hiyashi_chuka')?.seasonMonths).toEqual([6, 7, 8, 9]);
  });

  it('uses typical household amounts', () => {
    const amount = (dishId: string, ingredientId: string) =>
      DISHES.find((d) => d.id === dishId)?.ingredients.find((x) => x.ingredientId === ingredientId)?.amount;
    expect(amount('chicken_teriyaki', 'chicken_thigh')).toBe(120);
    expect(amount('nikujaga', 'onion')).toBeLessThanOrEqual(0.5);
    expect(amount('miso_tofu_wakame', 'tofu_silken')).toBeLessThanOrEqual(0.25);
    // 肉・魚の切り身は1人60〜150g
    for (const d of mains) {
      for (const x of d.ingredients) {
        const i = ing(x.ingredientId);
        if (['chicken', 'pork', 'beef', 'ground'].includes(i.kind) && i.unit === 'g') {
          expect(x.amount, `${d.id}: ${i.id}`).toBeGreaterThanOrEqual(40);
          expect(x.amount, `${d.id}: ${i.id}`).toBeLessThanOrEqual(150);
        }
      }
    }
  });
});

describe('defaultCatalog', () => {
  it('indexes every dish and ingredient', () => {
    expect(defaultCatalog.dishes).toBe(DISHES);
    expect(defaultCatalog.ingredients).toBe(INGREDIENTS);
    expect(defaultCatalog.allergens).toBe(ALLERGENS);
    expect(defaultCatalog.dishById.size).toBe(DISHES.length);
    expect(defaultCatalog.ingredientById.size).toBe(INGREDIENTS.length);
  });
});
