import type { AllergenId, Dish, Household, Member } from './index';
import { allergensOfText, checkDishSafety, householdNotices, textExclusionTargets } from './index';
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

describe('自由入力の除外（text）の書き方', () => {
  // 全アレルゲンについて、ひらがな・カタカナ・漢字の書き方と、「〇〇アレルギー」「〇〇のアレルギー」「〇〇類」「〇〇類アレルギー」。
  const TABLE: [AllergenId, string[]][] = [
    ['shrimp', ['えび', 'エビ', '海老']],
    ['crab', ['かに', 'カニ', '蟹']],
    ['walnut', ['くるみ', 'クルミ', '胡桃']],
    ['wheat', ['小麦', 'こむぎ', 'コムギ']],
    ['buckwheat', ['そば', 'ソバ', '蕎麦']],
    ['egg', ['卵', 'たまご', 'タマゴ', '玉子', '鶏卵', '卵白', '卵黄']],
    ['milk', ['乳', '牛乳', 'ミルク', '乳製品']],
    ['peanut', ['落花生', 'らっかせい', 'ピーナッツ', 'ピーナツ']],
    ['cashew', ['カシューナッツ']],
    ['almond', ['アーモンド']],
    ['abalone', ['あわび', 'アワビ', '鮑']],
    ['squid', ['いか', 'イカ', '烏賊']],
    ['salmon_roe', ['いくら', 'イクラ']],
    ['orange', ['オレンジ']],
    ['kiwi', ['キウイフルーツ', 'キウイ']],
    ['beef', ['牛肉', 'ぎゅうにく', 'ぎゅう肉', 'ビーフ']],
    ['sesame', ['ごま', 'ゴマ', '胡麻']],
    ['salmon', ['さけ', 'サケ', '鮭', 'しゃけ', 'サーモン']],
    ['mackerel', ['さば', 'サバ', '鯖']],
    ['soy', ['大豆', 'だいず', 'ダイズ']],
    ['chicken', ['鶏肉', 'とりにく', 'とり肉', 'チキン', '鳥肉']],
    ['banana', ['バナナ', 'ばなな']],
    ['pork', ['豚肉', 'ぶたにく', 'ぶた肉', 'ポーク']],
    ['macadamia', ['マカダミアナッツ', 'マカデミアナッツ']],
    ['peach', ['もも', 'モモ', '桃']],
    ['yam', ['やまいも', 'ヤマイモ', '山芋', '長芋']],
    ['apple', ['りんご', 'リンゴ', '林檎']],
    ['gelatin', ['ゼラチン']],
  ];
  const forms = (w: string) => [w, `${w}アレルギー`, `${w}のアレルギー`, `${w}類`, `${w}類アレルギー`, `${w}類のアレルギー`];

  it.each(TABLE)('%s：すべての書き方でアレルゲンとして扱う', (id, words) => {
    for (const w of words) for (const f of forms(w)) expect(allergensOfText(f), f).toEqual([id]);
  });

  it('まとめた呼び方（甲殻類・ナッツ・肉・魚）', () => {
    for (const f of ['甲殻類', '甲殻類アレルギー', '甲殻類のアレルギー', 'えび・かに', 'えび、かにアレルギー']) {
      expect(allergensOfText(f), f).toEqual(['shrimp', 'crab']);
    }
    expect(allergensOfText('ナッツ類アレルギー')).toEqual(expect.arrayContaining(['walnut', 'cashew', 'almond', 'macadamia', 'peanut']));
    expect(allergensOfText('肉')).toEqual(['chicken', 'pork', 'beef']);
    expect(allergensOfText('魚')).toEqual(expect.arrayContaining(['salmon', 'mackerel']));
    expect(allergensOfText('卵、ピーマン')).toEqual(['egg']);
  });

  it('部分一致はしない（「鶏もも」「ひき肉」「しいたけ」はアレルゲンにしない）', () => {
    for (const f of ['鶏もも', 'ひき肉', '合いびき肉', 'しいたけ', 'ピーマン', 'パクチー']) expect(allergensOfText(f), f).toEqual([]);
  });

  const eggKid = member({ id: 'member_2', nickname: 'たろう', ageBand: 'child', exclusions: [] });
  const judge = (text: string, dishId: string) =>
    checkDishSafety(dish(dishId), household([member(), { ...eggKid, exclusions: [{ type: 'text', text }] }]), catalog).status;

  it('「甲殻類アレルギー」「卵白」は、アレルゲンの除外と同じ結果（派生原材料・要確認も）', () => {
    expect(judge('甲殻類アレルギー', 'ebi_chili')).toBe('excluded');
    expect(judge('卵白', 'potato_salad')).toBe('excluded'); // マヨネーズの卵
    expect(judge('卵黄', 'hamburg')).toBe('excluded');
    expect(judge('卵白', 'raku_gyoza')).toBe('uncertain'); // 要確認の加工品
    expect(judge('とり肉', 'karaage')).toBe('excluded');
    expect(judge('チキン', 'chicken_honey')).toBe('excluded'); // 鶏むね肉
    expect(judge('ポーク', 'pork_shabu_salad')).toBe('excluded'); // 豚バラ肉
    expect(judge('ビーフ', 'hamburg')).toBe('excluded'); // 合いびき肉
  });

  it('分類の語（魚・肉・きのこ）は、その種類の食材にも当てる', () => {
    for (const id of ['salmon_foil', 'saba_miso', 'buri_teri', 'sanma_shioyaki']) expect(judge('魚', id), id).toBe('excluded');
    expect(judge('魚', 'teriyaki_chicken')).toBe('ok');
    for (const id of ['salmon_foil', 'chicken_cream']) expect(judge('きのこ', id), id).toBe('excluded'); // しめじ
    expect(judge('きのこ', 'teriyaki_chicken')).toBe('ok');
    expect(judge('肉', 'teriyaki_chicken')).toBe('excluded');
    expect(judge('肉', 'tomato_egg')).toBe('ok');
  });

  it('1つの欄に並べた語は、それぞれで判定する（「しめじ、たまねぎ」「しめじ・たまねぎ」）', () => {
    for (const text of ['しめじ、たまねぎ', 'しめじ・たまねぎ', 'しめじ たまねぎ', 'しめじ／たまねぎ']) {
      expect(judge(text, 'salmon_foil'), text).toBe('excluded');
      expect(judge(text, 'gyudon'), text).toBe('excluded'); // 玉ねぎだけ
      expect(judge(text, 'teriyaki_chicken'), text).toBe('ok');
    }
    expect(judge('しめじが苦手', 'salmon_foil')).toBe('excluded');
  });

  it('材料のわからない自由入力の定番は、料理名の1文字のアレルゲン名（鮭・豚・蟹）でも除外する', () => {
    const custom = (id: string, name: string): Dish => ({
      id, name, role: 'main', protein: 'none', genre: 'wa', minutes: 30, ingredients: [], kidFriendly: true, spicy: false, tags: [], custom: true,
    });
    const cases: [string, AllergenId][] = [['鮭のムニエル', 'salmon'], ['鯖の竜田揚げ', 'mackerel'], ['豚の角煮', 'pork'], ['牛すじ煮込み', 'beef'], ['鶏ハム', 'chicken'], ['蟹クリームコロッケ', 'crab']];
    for (const [name, id] of cases) {
      const d = custom('custom_1', name);
      const h = household([member({ exclusions: [{ type: 'allergen', id }] })], { customDishes: [d] });
      expect(checkDishSafety(d, h, catalog).status, name).toBe('excluded');
    }
    // 分類の語も、料理名に食材の名前があれば当てる
    const aji = custom('custom_2', '鮭の南蛮漬け');
    expect(checkDishSafety(aji, household([member({ exclusions: [{ type: 'text', text: '魚' }] })], { customDishes: [aji] }), catalog).status).toBe('excluded');
  });

  it('textExclusionTargets：当たる食材・アレルゲンと、どれにも当たらない語', () => {
    const r = textExclusionTargets('しめじ、パクチー', catalog);
    expect(r.ingredientIds).toContain('shimeji');
    expect(r.unmatched).toEqual(['パクチー']);
    const egg = textExclusionTargets('卵白', catalog);
    expect(egg.allergenIds).toEqual(['egg']);
    expect(egg.unmatched).toEqual([]);
    const fish = textExclusionTargets('魚', catalog);
    expect(fish.ingredientIds).toEqual(expect.arrayContaining(['salmon', 'saba', 'buri', 'sanma']));
    expect(fish.ingredientIds).not.toContain('shrimp');
  });
});
