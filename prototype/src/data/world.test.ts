import type { AllergenId, Dish, Ingredient, Protein } from '../engine/types';
import { AISLE_ORDER, UNIT_LABEL } from '../engine/types';
import { normalizeJa } from '../engine/util';
import { ALLERGENS, DISHES, EXTRA_DISHES, INGREDIENTS, WORLD_DISHES, WORLD_INGREDIENTS } from './index';

// 世界の料理（world.ts）の検査。標準のマスタ（data.test.ts）と同じ決まりを、標準と世界の料理を合わせたマスタで確かめる。

const WORLD_GENRES = ['kr', 'it', 'eth', 'mx'] as const;
const DINNER_ROLES: Dish['role'][] = ['main', 'side', 'soup', 'raku'];

/** 標準の食材と世界の料理の食材（料理の材料は、このどちらかにあること）。 */
const ALL_INGREDIENTS: Ingredient[] = [...INGREDIENTS, ...WORLD_INGREDIENTS];
const ALL_DISHES: Dish[] = [...DISHES, ...WORLD_DISHES];

const ingredientById = new Map(ALL_INGREDIENTS.map((i) => [i.id, i]));
const ing = (id: string): Ingredient => {
  const found = ingredientById.get(id);
  if (!found) throw new Error(`unknown ingredient: ${id}`);
  return found;
};
const worldDish = (id: string): Dish => {
  const found = WORLD_DISHES.find((d) => d.id === id);
  if (!found) throw new Error(`unknown world dish: ${id}`);
  return found;
};

const duplicates = (values: string[]) => values.filter((v, i) => values.indexOf(v) !== i);
const validMonths = (months: number[] | undefined) =>
  months === undefined ||
  (months.length > 0 && months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) && duplicates(months.map(String)).length === 0);

/** 料理に含まれるアレルゲン（食材の派生原材料を含む）。 */
const dishAllergens = (dish: Dish) => new Set(dish.ingredients.flatMap((x) => ing(x.ingredientId).allergens));

const worldMains = WORLD_DISHES.filter((d) => d.role === 'main');

describe('WORLD_INGREDIENTS', () => {
  it('has new, well-formed ids that do not clash with the standard ingredients', () => {
    expect(WORLD_INGREDIENTS.length).toBeGreaterThan(0);
    expect(duplicates(ALL_INGREDIENTS.map((i) => i.id))).toEqual([]);
    for (const i of WORLD_INGREDIENTS) expect(i.id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('maps each name and alias to only one ingredient (standard and world together)', () => {
    expect(duplicates(ALL_INGREDIENTS.flatMap((i) => [i.name, ...i.aliases]))).toEqual([]);
    for (const i of WORLD_INGREDIENTS) {
      expect(i.name.trim().length, i.id).toBeGreaterThan(0);
      for (const a of i.aliases) expect(a.trim().length, i.id).toBeGreaterThan(0);
    }
    // 書き分け（カタカナ・ひらがな・全角）をそろえても、世界の食材の語はほかの食材の語と重ならない。
    const owners = new Map<string, Set<string>>();
    for (const i of ALL_INGREDIENTS) {
      for (const t of [i.name, ...i.aliases]) {
        const key = normalizeJa(t);
        owners.set(key, (owners.get(key) ?? new Set()).add(i.id));
      }
    }
    for (const i of WORLD_INGREDIENTS) {
      for (const t of [i.name, ...i.aliases]) expect([...owners.get(normalizeJa(t))!], `${i.id}: ${t}`).toEqual([i.id]);
    }
  });

  it('keeps generic terms out of names and aliases', () => {
    // data.test.ts と同じ総称。総称は標準の代表の食材（genericAliases）にだけ置く。
    const GENERIC = ['鶏肉', 'とり肉', 'とりにく', '鳥肉', 'チキン', '豚肉', 'ぶた肉', 'ぶたにく', 'ポーク', '牛肉', 'ぎゅう肉', 'ぎゅうにく', 'ビーフ',
      'ひき肉', '挽き肉', 'ひきにく', 'ミンチ', 'きのこ', 'キノコ', '肉', '魚', '貝', '乳製品', '甲殻類', 'チーズ', 'ナッツ', '豆', 'シーフード'];
    for (const i of WORLD_INGREDIENTS) {
      for (const w of [i.name, ...i.aliases]) expect(GENERIC, `${i.id}: ${w}`).not.toContain(w);
      expect(i.genericAliases, i.id).toBeUndefined();
    }
  });

  it('uses valid units, aisles, days, months, allergens and substitutes', () => {
    const allergenIds = new Set(ALLERGENS.map((a) => a.id));
    for (const i of WORLD_INGREDIENTS) {
      expect(Object.keys(UNIT_LABEL), i.id).toContain(i.unit);
      expect(AISLE_ORDER, i.id).toContain(i.aisle);
      expect(Number.isInteger(i.shelfLifeDays) && i.shelfLifeDays > 0, i.id).toBe(true);
      expect(validMonths(i.seasonMonths), i.id).toBe(true);
      expect(duplicates(i.allergens), i.id).toEqual([]);
      for (const a of i.allergens) expect(allergenIds.has(a), `${i.id}: ${a}`).toBe(true);
      for (const s of i.substitutes ?? []) {
        expect(ingredientById.has(s), `${i.id} → ${s}`).toBe(true);
        expect(s, i.id).not.toBe(i.id);
      }
      if (i.thaw) expect(i.freezable, i.id).toBe(true);
    }
  });

  it('gives a pack and a price to everything that is not a pantry staple', () => {
    for (const i of WORLD_INGREDIENTS) {
      if (i.pantry) {
        // 常備品は買い物リストに載せない（「家にあるか確認」に出す）ので、pack を持たない。
        expect(i.pack, i.id).toBeUndefined();
        continue;
      }
      expect(i.pack, i.id).toBeDefined();
      expect(i.pack!.size, i.id).toBeGreaterThan(0);
      expect(i.pack!.label.length, i.id).toBeGreaterThan(0);
      expect(i.price, i.id).toBeDefined();
      expect(Number.isFinite(i.price!.yen) && i.price!.yen > 0, i.id).toBe(true);
      expect(Number.isFinite(i.price!.per) && i.price!.per > 0, i.id).toBe(true);
      // 1パックの値段が、スーパーの値段としてありうる範囲にある（per を unit で書き違えると桁が外れる）。
      const perPack = (i.price!.yen / i.price!.per) * i.pack!.size;
      expect(perPack, i.id).toBeGreaterThanOrEqual(50);
      expect(perPack, i.id).toBeLessThanOrEqual(1500);
    }
  });

  it('includes derived allergens', () => {
    const cases: [string, AllergenId[]][] = [
      ['gochujang', ['wheat', 'soy']], ['tortilla', ['wheat']], ['fresh_cream', ['milk']], ['mozzarella', ['milk']],
      ['plain_yogurt', ['milk']], ['peanuts', ['peanut']], ['seafood_mix', ['shrimp', 'squid']],
      ['green_curry_paste', ['shrimp']], ['tom_yum_paste', ['shrimp']], ['mixed_beans', ['soy']],
    ];
    for (const [id, expected] of cases) expect(ing(id).allergens, id).toEqual(expect.arrayContaining(expected));
    // ココナッツミルク・ハーブ・米の麺と皮は、特定原材料等を含まない（ナンプラーは標準の食材。カタクチイワシは対象外）。
    for (const id of ['coconut_milk', 'basil', 'cilantro', 'rice_noodle', 'rice_paper', 'nampla']) expect(ing(id).allergens, id).toEqual([]);
  });

  it('marks brand-dependent processed foods as uncertain and keeps plain foods certain', () => {
    // シーフードミックスは、銘柄で中身（たこ・かにかまなど）が違うので要確認。
    for (const id of ['gochujang', 'sweet_chili_sauce', 'green_curry_paste', 'tom_yum_paste', 'tortilla', 'seafood_mix']) expect(ing(id).uncertain, id).toBe(true);
    const plain = [
      'fresh_cream', 'mozzarella', 'plain_yogurt', 'basil', 'cilantro', 'coconut_milk', 'mixed_beans', 'peanuts',
      'rice_noodle', 'rice_paper', 'red_chili', 'chili_powder',
    ];
    for (const id of plain) expect(ing(id).uncertain, id).toBe(false);
  });

  it('keeps seasonings and spices in the pantry, and pastes bought when used out of it', () => {
    for (const id of ['gochujang', 'sweet_chili_sauce', 'red_chili', 'chili_powder']) expect(ing(id).pantry, id).toBe(true);
    for (const id of ['green_curry_paste', 'tom_yum_paste', 'coconut_milk', 'tortilla', 'fresh_cream']) expect(ing(id).pantry, id).toBe(false);
  });

  it('adds only ingredients that a world dish uses', () => {
    const used = new Set(WORLD_DISHES.flatMap((d) => d.ingredients.map((x) => x.ingredientId)));
    for (const i of WORLD_INGREDIENTS) expect(used.has(i.id), i.id).toBe(true);
  });
});

describe('WORLD_DISHES', () => {
  it('has about 40 dishes with unique ids and names (standard and world together)', () => {
    expect(WORLD_DISHES.length).toBeGreaterThanOrEqual(35);
    expect(WORLD_DISHES.length).toBeLessThanOrEqual(50);
    for (const d of WORLD_DISHES) expect(d.id).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(duplicates(ALL_DISHES.map((d) => d.id))).toEqual([]);
    expect(duplicates(ALL_DISHES.map((d) => d.name))).toEqual([]);
    const extraIds = new Set(EXTRA_DISHES.map((d) => d.id));
    for (const d of WORLD_DISHES) expect(extraIds.has(d.id), d.id).toBe(false);
  });

  it('does not repeat a standard dish under another spelling', () => {
    // かっこの説明を外し、書き分けをそろえた名前で比べる（標準のミネストローネ・アクアパッツァなどを、もう1つ作らない）。
    const base = (name: string) => normalizeJa(name.replace(/[（(].*[）)]$/, ''));
    const byBase = new Map<string, string[]>();
    for (const d of ALL_DISHES) byBase.set(base(d.name), [...(byBase.get(base(d.name)) ?? []), d.id]);
    for (const d of WORLD_DISHES) expect(byBase.get(base(d.name)), d.id).toEqual([d.id]);
  });

  it('uses only the world genres and dinner roles, mostly mains', () => {
    for (const d of WORLD_DISHES) {
      expect(WORLD_GENRES, d.id).toContain(d.genre);
      expect(DINNER_ROLES, d.id).toContain(d.role);
    }
    const count = (role: Dish['role']) => WORLD_DISHES.filter((d) => d.role === role).length;
    expect(count('main')).toBeGreaterThan(count('side') + count('soup'));
  });

  it('has mains and a side or soup of the same genre in every world genre', () => {
    for (const g of WORLD_GENRES) {
      const mains = ALL_DISHES.filter((d) => d.genre === g && d.role === 'main');
      const sides = ALL_DISHES.filter((d) => d.genre === g && (d.role === 'side' || d.role === 'soup'));
      expect(mains.length, g).toBeGreaterThanOrEqual(4);
      expect(sides.length, g).toBeGreaterThanOrEqual(2);
      // 汁気の多い主菜（soupy）にも合わせられるよう、副菜も1つはある。
      expect(sides.some((d) => d.role === 'side'), g).toBe(true);
    }
  });

  it('uses only known ingredients with positive amounts', () => {
    for (const d of WORLD_DISHES) {
      expect(d.ingredients.length, d.id).toBeGreaterThan(0);
      expect(duplicates(d.ingredients.map((x) => x.ingredientId)), d.id).toEqual([]);
      for (const x of d.ingredients) {
        expect(ingredientById.has(x.ingredientId), `${d.id}: ${x.ingredientId}`).toBe(true);
        expect(Number.isFinite(x.amount) && x.amount > 0, `${d.id}: ${x.ingredientId}`).toBe(true);
      }
    }
  });

  it('has valid minutes, months, tags and flags', () => {
    for (const d of WORLD_DISHES) {
      expect(d.name.length, d.id).toBeGreaterThan(0);
      expect(d.minutes, d.id).toBeGreaterThan(0);
      expect(d.minutes, d.id).toBeLessThanOrEqual(90);
      expect(validMonths(d.seasonMonths), d.id).toBe(true);
      expect(d.sourceUrl, d.id).toBeUndefined();
      expect(d.custom, d.id).toBeUndefined();
      expect(d.tags.length, d.id).toBeGreaterThan(0);
      if (d.spicy) expect(d.kidFriendly, d.id).toBe(false);
      // complete・soupy は主菜かラク日用の料理だけに付ける
      if (d.tags.includes('complete') || d.tags.includes('soupy')) expect(['main', 'raku'], d.id).toContain(d.role);
    }
  });

  it('lists seasonings in every main dish (for the allergen check)', () => {
    for (const d of worldMains) {
      expect(d.ingredients.some((x) => ing(x.ingredientId).kind === 'seasoning'), d.id).toBe(true);
    }
  });

  it('gives each dish a protein that one of its ingredients provides', () => {
    // 加工肉（ベーコンなど）は、アレルゲンの肉を、たんぱく源として数える。
    const provides = (i: Ingredient, p: Protein) => i.kind === p || (i.kind === 'processed' && (i.allergens as string[]).includes(p));
    for (const d of worldMains) expect(d.protein, d.id).not.toBe('none');
    for (const d of WORLD_DISHES) {
      if (d.protein === 'none') continue;
      expect(d.ingredients.some((x) => provides(ing(x.ingredientId), d.protein)), `${d.id}: ${d.protein}`).toBe(true);
    }
  });

  it('uses typical household amounts of meat (40 to 150g per adult in a main dish)', () => {
    for (const d of worldMains) {
      for (const x of d.ingredients) {
        const i = ing(x.ingredientId);
        if (['chicken', 'pork', 'beef', 'ground'].includes(i.kind) && i.unit === 'g') {
          expect(x.amount, `${d.id}: ${i.id}`).toBeGreaterThanOrEqual(40);
          expect(x.amount, `${d.id}: ${i.id}`).toBeLessThanOrEqual(150);
        }
      }
    }
  });

  it('marks the hot dishes as spicy (not for kids) and keeps the mild ones for kids', () => {
    const hot = ['dakgalbi', 'sundubu_jjigae', 'cabbage_bacon_peperoncino', 'gapao_rice', 'green_curry', 'tom_yum_kung', 'chili_con_carne'];
    for (const id of hot) expect(worldDish(id), id).toMatchObject({ spicy: true, kidFriendly: false });
    const mild = ['bibimbap', 'japchae', 'carbonara', 'butter_chicken_curry', 'tandoori_chicken', 'pad_thai', 'tacos', 'chicken_quesadilla'];
    for (const id of mild) expect(worldDish(id), id).toMatchObject({ spicy: false, kidFriendly: true });
    // 唐辛子・タイカレーやトムヤムクンのペーストが味の中心の料理は、辛い料理にする。
    const HOT_INGREDIENTS = ['red_chili', 'green_curry_paste', 'tom_yum_paste'];
    for (const d of WORLD_DISHES) {
      if (d.ingredients.some((x) => HOT_INGREDIENTS.includes(x.ingredientId))) expect(d.spicy, d.id).toBe(true);
    }
  });

  it('carries the allergens of its ingredients, including derived ones', () => {
    const cases: [string, AllergenId[]][] = [
      ['pad_thai', ['peanut', 'shrimp', 'egg']],
      ['tacos', ['wheat', 'milk', 'beef', 'pork']],
      ['bibimbap', ['wheat', 'soy', 'sesame', 'egg']],
      ['carbonara', ['wheat', 'egg', 'milk', 'pork']],
      ['green_curry', ['shrimp', 'chicken']],
      ['caprese', ['milk']],
      ['kaisen_chijimi', ['shrimp', 'squid', 'wheat', 'egg']],
      ['butter_chicken_curry', ['milk', 'chicken']],
    ];
    for (const [id, expected] of cases) expect([...dishAllergens(worldDish(id))], id).toEqual(expect.arrayContaining(expected));
  });
});

describe('Korean dishes of the standard list', () => {
  it('counts 豚キムチ炒め, プルコギ and もやしのナムル as Korean', () => {
    for (const id of ['buta_kimchi', 'bulgogi', 'moyashi_namul']) expect(DISHES.find((d) => d.id === id)?.genre, id).toBe('kr');
  });
});
