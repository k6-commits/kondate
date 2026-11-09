import type { Dish, Household, Member } from './index';
import { checkDishSafety, householdNotices } from './index';
import { catalog } from './__fixtures__/catalog';

function member(over: Partial<Member> = {}): Member {
  return { id: 'member_1', nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [], ...over };
}

function household(members: Member[], over: Partial<Household> = {}): Household {
  return {
    id: 'h_test',
    members,
    favorites: [],
    customDishes: [],
    settings: {
      plan: 'free',
      dinnerWeekdays: [1, 2, 3, 4, 5],
      shoppingWeekdays: [0, 3],
      rakuPerWeek: 1,
      newPerWeek: 1,
      sidePolicy: 'side_or_soup',
      maxMinutes: {},
      allowUncertainWithExclusions: false,
    },
    createdAt: '2026-11-09',
    ...over,
  };
}

const dish = (id: string): Dish => catalog.dishById.get(id)!;

describe('checkDishSafety', () => {
  const eggKid = member({ id: 'member_2', nickname: 'たろう', ageBand: 'child', exclusions: [{ type: 'allergen', id: 'egg' }] });

  it('アレルゲンを含む食材があれば excluded', () => {
    const r = checkDishSafety(dish('oyakodon'), household([member(), eggKid]), catalog);
    expect(r.status).toBe('excluded');
    expect(r.hits).toContainEqual({ ingredientId: 'egg', reason: '卵' });
  });

  it('派生原材料（マヨネーズの卵）も excluded と判定し、理由に「派生原材料」と書く', () => {
    const r = checkDishSafety(dish('potato_salad'), household([member(), eggKid]), catalog);
    expect(r.status).toBe('excluded');
    expect(r.hits).toContainEqual({ ingredientId: 'mayonnaise', reason: '卵（派生原材料）' });
  });

  it('小麦アレルギーでは醤油（派生原材料）を使う料理も除外する', () => {
    const wheat = member({ exclusions: [{ type: 'allergen', id: 'wheat' }] });
    const r = checkDishSafety(dish('teriyaki_chicken'), household([wheat]), catalog);
    expect(r.status).toBe('excluded');
    expect(r.hits.some((h) => h.ingredientId === 'soy_sauce' && h.reason.includes('小麦'))).toBe(true);
  });

  it('含まなければ ok', () => {
    expect(checkDishSafety(dish('teriyaki_chicken'), household([member(), eggKid]), catalog).status).toBe('ok');
  });

  it('銘柄で原材料が変わる加工品は、アレルゲンの除外がある世帯では uncertain', () => {
    const r = checkDishSafety(dish('raku_gyoza'), household([member(), eggKid]), catalog);
    expect(r.status).toBe('uncertain');
    expect(r.hits[0].reason).toContain('銘柄で原材料が違います');
    // 除外がない世帯では ok
    expect(checkDishSafety(dish('raku_gyoza'), household([member()]), catalog).status).toBe('ok');
  });

  it('加工品でも、表示されているアレルゲンに当たれば uncertain ではなく excluded', () => {
    const milk = member({ exclusions: [{ type: 'allergen', id: 'milk' }] });
    expect(checkDishSafety(dish('curry'), household([milk]), catalog).status).toBe('excluded');
  });

  it('食材の id による除外', () => {
    const noShimeji = member({ exclusions: [{ type: 'ingredient', id: 'shimeji' }] });
    const r = checkDishSafety(dish('salmon_foil'), household([noShimeji]), catalog);
    expect(r.status).toBe('excluded');
    expect(r.hits).toContainEqual({ ingredientId: 'shimeji', reason: '除外：しめじ' });
  });

  it('自由な語による除外は、食材の名前・別名に含まれていれば当てる（カタカナ・ひらがなの違いは問わない）', () => {
    const noOnion = member({ exclusions: [{ type: 'text', text: 'タマネギ' }] });
    expect(checkDishSafety(dish('gyudon'), household([noOnion]), catalog).status).toBe('excluded');
    const noBuri = member({ exclusions: [{ type: 'text', text: 'ぶり' }] });
    expect(checkDishSafety(dish('buri_teri'), household([noBuri]), catalog).status).toBe('excluded');
    expect(checkDishSafety(dish('teriyaki_chicken'), household([noBuri]), catalog).status).toBe('ok');
  });

  it('材料がわからない自由入力の定番は、アレルゲンの除外があれば uncertain', () => {
    const custom: Dish = {
      id: 'custom_1', name: 'ばあばの煮物', role: 'main', protein: 'none', genre: 'wa', minutes: 30,
      ingredients: [], kidFriendly: true, spicy: false, tags: [], custom: true,
    };
    expect(checkDishSafety(custom, household([member(), eggKid], { customDishes: [custom] }), catalog).status).toBe('uncertain');
    expect(checkDishSafety(custom, household([member()], { customDishes: [custom] }), catalog).status).toBe('ok');
    const eggName: Dish = { ...custom, id: 'custom_2', name: 'うちの卵焼き' };
    expect(checkDishSafety(eggName, household([member(), eggKid], { customDishes: [eggName] }), catalog).status).toBe('excluded');
  });

  it('定番の「うちの材料メモ」（overrides）があれば、その材料で判定する', () => {
    const h = household([member(), eggKid], {
      favorites: [{ dishId: 'gyudon', overrides: [{ ingredientId: 'beef_koma', amount: 80 }, { ingredientId: 'egg', amount: 1 }] }],
    });
    expect(checkDishSafety(dish('gyudon'), h, catalog).status).toBe('excluded');
    const h2 = household([member(), eggKid], {
      favorites: [{ dishId: 'oyakodon', overrides: [{ ingredientId: 'chicken_thigh', amount: 80 }, { ingredientId: 'onion', amount: 0.25 }] }],
    });
    expect(checkDishSafety(dish('oyakodon'), h2, catalog).status).toBe('ok');
  });

  it('乳児の除外条件は判定の対象外（献立を食べないため）', () => {
    const baby = member({ id: 'member_3', ageBand: 'infant', exclusions: [{ type: 'allergen', id: 'egg' }] });
    expect(checkDishSafety(dish('oyakodon'), household([member(), baby]), catalog).status).toBe('ok');
  });
});

describe('householdNotices', () => {
  it('免責は常に出す', () => {
    const notices = householdNotices(household([member()]));
    expect(notices[0]).toEqual({ level: 'info', text: 'アプリは除外の補助で、アレルギーの安全を保証するものではありません' });
    expect(notices).toHaveLength(1);
  });

  it('重いアレルギーの印があれば、対象外であることと医師の指示を優先することを出す', () => {
    const severe = member({ exclusions: [{ type: 'allergen', id: 'peanut', severe: true }] });
    const texts = householdNotices(household([severe])).map((n) => n.text);
    expect(texts.some((t) => t.includes('対象外') && t.includes('医師の指示を優先'))).toBe(true);
  });

  it('乳児がいれば、食べる人に含めないこと・はちみつ・窒息の注意を出す', () => {
    const baby = member({ id: 'member_2', ageBand: 'infant' });
    const notices = householdNotices(household([member(), baby]));
    const texts = notices.map((n) => n.text);
    expect(texts).toContain('1歳未満の子には、はちみつ（はちみつ入りの加工品を含む）を与えないでください');
    expect(texts.some((t) => t.includes('離乳食は対象外'))).toBe(true);
    expect(texts.some((t) => t.includes('のどに詰まりやすい'))).toBe(true);
    expect(notices.filter((n) => n.level === 'warning').length).toBeGreaterThanOrEqual(3);
  });

  it('幼児だけなら窒息の注意は出すが、はちみつの注意は出さない', () => {
    const small = member({ id: 'member_2', ageBand: 'preschool' });
    const texts = householdNotices(household([member(), small])).map((n) => n.text);
    expect(texts.some((t) => t.includes('のどに詰まりやすい'))).toBe(true);
    expect(texts.some((t) => t.includes('はちみつ'))).toBe(false);
  });
});
