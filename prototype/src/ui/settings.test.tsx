// @vitest-environment jsdom
// あとから足した設定の画面：初回設定の②〜⑤（食事・買い物のしかた・国の料理・辛さ・予算）、家族と設定の新しい欄（変えると献立を
// 作り直すもの・買い物リストだけを直すもの）、今週の献立の朝ごはん・お弁当・お昼と食費の目安、買い物リストの合計の目安。
// 値段と朝ごはん・お弁当・お昼は、テスト用の小さなマスタ（src/engine/__fixtures__）に足して確かめる。
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AppState, Dish, HouseholdSettings, Ingredient, Price } from '../engine';
import {
  CUISINE_GENRES,
  CUISINE_LABEL,
  DEFAULT_CUISINES,
  buildShoppingLists,
  createInitialState,
  extrasOn,
  listCost,
  roundYen,
  weekCost,
  yenText,
} from '../engine';
import { DISHES, INGREDIENTS, MONDAY, demoInput, makeCatalog } from '../engine/__fixtures__/catalog';
import { defaultCatalog } from '../data';
import { App } from './App';
import { STORAGE_KEY } from './storage';
import { budgetText } from './lib';
import { CUISINES_UNSET_NOTE, HouseholdSheet } from './components/HouseholdSheet';
import { ShoppingSheet, listCostText } from './components/ShoppingSheet';
import {
  BUDGET_ERROR,
  CostMeter,
  cookTimeOf,
  cuisineSummary,
  mealsSummary,
  parseYen,
  shoppingSummary,
  withCookTime,
} from './components/SettingsFields';
import { WeekSheet, extraLine } from './components/WeekSheet';

// ---------------------------------------------------------------------------
// テスト用のマスタ：朝ごはん・お弁当・お昼と、一部の食材の値段
// ---------------------------------------------------------------------------

function mk(id: string, name: string, role: Dish['role'], genre: Dish['genre'], ing: [string, number][]): Dish {
  return {
    id,
    name,
    role,
    protein: 'none',
    genre,
    minutes: 10,
    ingredients: ing.map(([ingredientId, amount]) => ({ ingredientId, amount })),
    kidFriendly: true,
    spicy: false,
    tags: [],
  };
}

const EXTRAS: Dish[] = [
  mk('bf_natto', '納豆ごはん・味噌汁', 'breakfast', 'wa', [['natto', 1], ['tofu', 0.1], ['miso', 1]]),
  mk('bf_tomato', 'トマトのスープ・牛乳', 'breakfast', 'yo', [['tomato', 0.5], ['milk', 150]]),
  mk('bento_chicken', '鶏の照り焼き弁当', 'bento', 'wa', [['chicken_thigh', 60], ['spinach', 30]]),
  mk('bento_pork', '豚の生姜焼き弁当', 'bento', 'wa', [['pork_loin', 60], ['cabbage', 30]]),
  mk('lunch_udon', 'かけうどん', 'lunch', 'wa', [['frozen_udon', 1], ['green_onion', 10]]),
];

/** 値段の目安（テスト用）。玉ねぎ・にんじんなどには付けない（「値段のわからない品」を出すため）。 */
const PRICES: Record<string, Price> = {
  chicken_thigh: { yen: 300, per: 300 },
  chicken_breast: { yen: 240, per: 300 },
  pork_koma: { yen: 400, per: 250 },
  pork_belly: { yen: 400, per: 200 },
  pork_loin: { yen: 500, per: 250 },
  beef_koma: { yen: 750, per: 250 },
  ground_mix: { yen: 450, per: 300 },
  spinach: { yen: 200, per: 200 },
  cabbage: { yen: 200, per: 500 },
  hakusai: { yen: 250, per: 600 },
  egg: { yen: 300, per: 10 },
  milk: { yen: 250, per: 1000 },
  tofu: { yen: 100, per: 1 },
  natto: { yen: 90, per: 3 },
  salmon: { yen: 400, per: 2 },
  tomato: { yen: 100, per: 1 },
  frozen_udon: { yen: 250, per: 5 },
};

const PRICED: Ingredient[] = INGREDIENTS.map((i) => (PRICES[i.id] ? { ...i, price: PRICES[i.id] } : i));
const cat = makeCatalog(DISHES, PRICED, EXTRAS);

/** デモの家族（テスト用のマスタ）で、MONDAY から始めた状態に設定を足す。 */
function stateWith(settings: Partial<HouseholdSettings>, catalog = cat): AppState {
  const s = createInitialState(demoInput(), catalog, MONDAY);
  return { ...s, household: { ...s.household, settings: { ...s.household.settings, ...settings } } };
}

function saved(): AppState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('state is not saved');
  return JSON.parse(raw) as AppState;
}

function store(s: AppState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function mealsKey(s: AppState): string {
  return s.meals.map((m) => `${m.date}:${m.dishIds.join('+')}:${m.kind}`).join(' ');
}

function toastText(): string {
  return document.querySelector('.toast-region')?.textContent ?? '';
}

function openSettings(): HTMLElement {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByRole('button', { name: '家族と設定' }));
  return document.querySelector('[data-sheet="household"]') as HTMLElement;
}

function radio(name: string | RegExp, container: HTMLElement = document.body): HTMLInputElement {
  return within(container).getByRole('radio', { name }) as HTMLInputElement;
}

/** その名前の radiogroup の中の radio。 */
function choice(group: string, name: string): HTMLInputElement {
  return within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name }) as HTMLInputElement;
}

function tripNote(): string {
  return document.querySelector('.trip-note')?.textContent ?? '';
}

/** 確認（⑤）の行の中身。 */
function confirmRow(label: string): string {
  const row = [...document.querySelectorAll('.confirm-list > div')].find((d) => d.querySelector('dt')?.textContent === label);
  if (!row) throw new Error(`confirm row not found: ${label}`);
  return row.querySelector('dd')?.textContent ?? '';
}

/** 初回設定を、家族（あきこ1人）を入れて②まで進める。 */
function startOnboarding(): void {
  window.location.hash = '#start';
  render(<App todayFn={() => '2026-11-10'} />);
  fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'あきこ' } });
  fireEvent.click(screen.getByRole('button', { name: 'できた' }));
  next();
}

function next(): void {
  fireEvent.click(screen.getByRole('button', { name: '次へ' }));
}

const noop = () => {};

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 小さな関数
// ---------------------------------------------------------------------------

describe('設定の画面の小さな関数', () => {
  it('budgetText：1万円より少なければ「5,000円」、万の単位は「1万円」「1万3,000円」', () => {
    expect(budgetText(5000)).toBe('5,000円');
    expect(budgetText(7000)).toBe('7,000円');
    expect(budgetText(10000)).toBe('1万円');
    expect(budgetText(13000)).toBe('1万3,000円');
    expect(budgetText(25000)).toBe('2万5,000円');
    expect(budgetText(12345)).toBe('1万2,345円');
  });

  it('parseYen：全角の数字・「,」「円」「万」も読み、1,000円〜10万円の外は読まない', () => {
    expect(parseYen('12000')).toBe(12000);
    expect(parseYen('１２０００')).toBe(12000);
    expect(parseYen('12,000円')).toBe(12000);
    expect(parseYen('1.5万')).toBe(15000);
    expect(parseYen('1万2000')).toBe(12000);
    expect(parseYen('500')).toBeNull();
    expect(parseYen('200000')).toBeNull();
    expect(parseYen('たくさん')).toBeNull();
    expect(parseYen('')).toBeNull();
  });

  it('cookTimeOf・withCookTime：どの献立の曜日も同じなら、その分（なしは0）。曜日で違えば null', () => {
    const days = [1, 2, 3, 4, 5] as const;
    expect(cookTimeOf({ dinnerWeekdays: [...days], maxMinutes: {} })).toBe(0);
    expect(cookTimeOf({ dinnerWeekdays: [...days], maxMinutes: withCookTime(days, 30) })).toBe(30);
    expect(cookTimeOf({ dinnerWeekdays: [...days], maxMinutes: { 1: 15, 3: 30 } })).toBeNull();
    expect(withCookTime(days, 0)).toEqual({});
    expect(withCookTime([1, 3], 45)).toEqual({ 1: 45, 3: 45 });
  });

  it('確認の画面の要約：食事・買い物・国の料理', () => {
    expect(mealsSummary({ meals: 'dinner', breakfastStyle: 'mix', lunchStyle: 'bento', lunchCount: 1 })).toBe('夕食だけ');
    expect(mealsSummary({ meals: 'dinner_bento', breakfastStyle: 'mix', lunchStyle: 'bento', lunchCount: 2 })).toBe('夕食＋お弁当（お弁当2人分）');
    expect(mealsSummary({ meals: 'three', breakfastStyle: 'bread', lunchStyle: 'home', lunchCount: 3 })).toBe(
      '朝・昼・夕（朝ごはん：パン、お昼：家で食べる 3人分）',
    );
    expect(shoppingSummary([0, 3], [1, 2, 3, 4, 5])).toBe('週2回（日・水）。1回の買い物で、だいたい3日分');
    expect(shoppingSummary([1, 3, 5], [1, 2, 3, 4, 5])).toBe('月・水・金。1回の買い物で、だいたい2日分');
    expect(shoppingSummary([], [1, 2, 3, 4, 5])).toBe('なし（献立の日に買う）');
    expect(cuisineSummary(DEFAULT_CUISINES)).toEqual(['よく出す：和食・洋食・中華・韓国', '出さない：イタリアン・エスニック・メキシカン']);
    expect(cuisineSummary({ ...DEFAULT_CUISINES, it: 'sometimes' })).toEqual([
      'よく出す：和食・洋食・中華・韓国',
      'ときどき：イタリアン',
      '出さない：エスニック・メキシカン',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 初回設定
// ---------------------------------------------------------------------------

describe('初回設定：食事と買い物・好みと定番・予算とプラン', () => {
  it('手順は5つ（家族・食事と買い物・好みと定番・予算とプラン・確認）', () => {
    startOnboarding();
    const steps = [...document.querySelectorAll('.stepper .step-name')].map((e) => e.textContent);
    expect(steps).toEqual(['家族', '食事と買い物', '好みと定番', '予算とプラン', '確認']);
    expect(screen.getByRole('heading', { name: '② 食事と買い物' })).toBeTruthy();
  });

  it('選んだ食事・買い物のしかた・国の料理・辛さ・予算が、確認の画面に出て、保存した設定に入る', () => {
    startOnboarding();
    // ② 既定は夕食だけ・週2回（日・水）。1回の買い物で、だいたい3日分
    expect(radio(/^夕食だけ/).checked).toBe(true);
    expect(radio(/^週2回/).checked).toBe(true);
    expect(tripNote()).toContain('1回の買い物で、だいたい3日分');
    expect(screen.queryByText(/何人分？/)).toBeNull();
    // 朝・昼・夕：朝ごはんの主食・お昼の食べ方・人数を選べる
    fireEvent.click(radio(/^朝・昼・夕/));
    expect(choice('朝ごはん', '日替わり').checked).toBe(true);
    expect(choice('お昼', 'お弁当').checked).toBe(true);
    expect(screen.getByText('お弁当（お昼）は何人分？')).toBeTruthy();
    fireEvent.click(choice('朝ごはん', 'パン'));
    fireEvent.click(choice('お昼', '家で食べる'));
    const count = screen.getByRole('group', { name: 'お昼は何人分？' });
    expect(within(count).getByText('1人分')).toBeTruthy();
    // 1人より少なくはできない（押しても変わらない）
    fireEvent.click(within(count).getByRole('button', { name: '1人減らす' }));
    expect(within(count).getByText('1人分')).toBeTruthy();
    fireEvent.click(within(count).getByRole('button', { name: '1人増やす' }));
    fireEvent.click(within(count).getByRole('button', { name: '1人増やす' }));
    expect(within(count).getByText('3人分')).toBeTruthy();
    // 週1回まとめて：だいたい5日分
    fireEvent.click(radio(/^週1回まとめて/));
    expect(tripNote()).toContain('1回の買い物で、だいたい5日分');
    expect(tripNote()).toContain('日に買い物');
    next();

    // ③ 国の料理：イタリアンをときどき、中華を出さない。辛さ：辛くないものだけ
    expect(screen.getByRole('heading', { name: '③ 好みと定番' })).toBeTruthy();
    fireEvent.click(choice('イタリアン', 'ときどき'));
    fireEvent.click(choice('中華', '出さない'));
    expect(choice('辛さ', 'ふつう').checked).toBe(true);
    fireEvent.click(choice('辛さ', '辛くないものだけ'));
    next();

    // ④ 予算：1万円
    expect(choice('1週間の食費の目安', '目安なし').checked).toBe(true);
    fireEvent.click(choice('1週間の食費の目安', '1万円'));
    next();

    // ⑤ 確認
    expect(confirmRow('食事')).toBe('朝・昼・夕（朝ごはん：パン、お昼：家で食べる 3人分）');
    expect(confirmRow('買い物')).toBe('週1回まとめて（日）。1回の買い物で、だいたい5日分');
    expect(confirmRow('国の料理')).toBe('よく出す：和食・洋食・韓国ときどき：イタリアン出さない：中華・エスニック・メキシカン');
    expect(confirmRow('辛さ')).toBe('辛くないものだけ');
    expect(confirmRow('予算')).toBe('1週間 1万円');
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));

    const st = saved().household.settings;
    expect(st).toMatchObject({
      meals: 'three',
      breakfastStyle: 'bread',
      lunchStyle: 'home',
      lunchCount: 3,
      shoppingWeekdays: [0],
      spice: 'mild',
      weeklyBudget: 10000,
    });
    expect(st.cuisines).toEqual({ ...DEFAULT_CUISINES, it: 'sometimes', chu: 'never' });
  });

  it('何も選ばずに進めると、国の料理（7つとも）・辛さ・食事は既定のまま書き、予算と人数は書かない', () => {
    startOnboarding();
    for (let i = 0; i < 3; i++) next();
    expect(confirmRow('食事')).toBe('夕食だけ');
    expect(confirmRow('買い物')).toBe('週2回（日・水）。1回の買い物で、だいたい3日分');
    expect(confirmRow('辛さ')).toBe('ふつう');
    expect(confirmRow('予算')).toBe('目安なし');
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    const st = saved().household.settings;
    expect(st.cuisines).toEqual(DEFAULT_CUISINES);
    expect(st).toMatchObject({ meals: 'dinner', spice: 'normal', shoppingWeekdays: [0, 3] });
    expect('weeklyBudget' in st).toBe(false);
    expect('lunchCount' in st).toBe(false);
    expect('breakfastStyle' in st).toBe(false);
  });

  it('予算：目安なしを選び直したら null、ほかの金額は入れたとおりに書く', () => {
    startOnboarding();
    next();
    next();
    fireEvent.click(choice('1週間の食費の目安', '2万円'));
    fireEvent.click(choice('1週間の食費の目安', '目安なし'));
    next();
    expect(confirmRow('予算')).toBe('目安なし');
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(saved().household.settings.weeklyBudget).toBeNull();
  });

  it('予算のほかの金額：読める金額なら、その場で使う。読めない金額は、欄を出るときに知らせる', () => {
    startOnboarding();
    next();
    next();
    const other = screen.getByLabelText('ほかの金額');
    fireEvent.change(other, { target: { value: '１２５００' } });
    // 決まった額の札は、どれも選ばない
    expect(choice('1週間の食費の目安', '目安なし').checked).toBe(false);
    expect(choice('1週間の食費の目安', '1万円').checked).toBe(false);
    fireEvent.change(other, { target: { value: '300' } });
    fireEvent.blur(other);
    expect(screen.getByRole('alert').textContent).toBe(BUDGET_ERROR);
    fireEvent.change(other, { target: { value: '12500' } });
    expect(screen.queryByRole('alert')).toBeNull();
    next();
    expect(confirmRow('予算')).toBe('1週間 1万2,500円');
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(saved().household.settings.weeklyBudget).toBe(12500);
  });

  it('買い物の「曜日を選ぶ」で曜日のボタンを出す。曜日を1つも選ばずに［次へ］を押すと、今までどおり知らせる', () => {
    startOnboarding();
    expect(screen.queryByRole('group', { name: '買い物の曜日' })).toBeNull();
    fireEvent.click(radio(/^曜日を選ぶ/));
    const days = screen.getByRole('group', { name: '買い物の曜日' });
    // 今の曜日（日・水）から外していく
    fireEvent.click(within(days).getByRole('button', { name: '日曜日' }));
    fireEvent.click(within(days).getByRole('button', { name: '水曜日' }));
    expect(tripNote()).toBe('買い物の曜日を、まだ選んでいません');
    next();
    expect(screen.getByRole('alert').textContent).toBe('買い物の曜日を1つ以上選んでください。');
    expect(screen.getByRole('heading', { name: '② 食事と買い物' })).toBeTruthy();
    fireEvent.click(within(days).getByRole('button', { name: '月曜日' }));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(within(days).getByRole('button', { name: '水曜日' }));
    fireEvent.click(within(days).getByRole('button', { name: '金曜日' }));
    expect(tripNote()).toBe('1回の買い物で、だいたい2日分（月・水・金に買い物）');
    // 曜日を選んでいるあいだは、日曜と水曜に選び直して週2回と同じ曜日になっても「曜日を選ぶ」のまま
    for (const d of ['月曜日', '金曜日', '日曜日']) fireEvent.click(within(days).getByRole('button', { name: d }));
    expect(tripNote()).toBe('1回の買い物で、だいたい3日分（日・水に買い物）');
    expect(radio(/^曜日を選ぶ/).checked).toBe(true);
    expect(radio(/^週2回/).checked).toBe(false);
    for (const d of ['日曜日', '月曜日', '金曜日']) fireEvent.click(within(days).getByRole('button', { name: d }));
    next();
    for (let i = 0; i < 2; i++) next();
    expect(confirmRow('買い物')).toBe('月・水・金。1回の買い物で、だいたい2日分');
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(saved().household.settings.shoppingWeekdays).toEqual([1, 3, 5]);
  });

  it('国の料理は、国ごとに名前の付いた radiogroup（よく出す・ときどき・出さない）。最初は既定の選び方', () => {
    startOnboarding();
    next();
    for (const g of CUISINE_GENRES) {
      const group = screen.getByRole('radiogroup', { name: CUISINE_LABEL[g] });
      const radios = within(group).getAllByRole('radio') as HTMLInputElement[];
      expect(radios).toHaveLength(3);
      for (const level of ['よく出す', 'ときどき', '出さない']) expect(within(group).getByRole('radio', { name: level })).toBeTruthy();
      const want = { often: 'よく出す', sometimes: 'ときどき', never: '出さない' }[DEFAULT_CUISINES[g]];
      expect((within(group).getByRole('radio', { name: want }) as HTMLInputElement).checked).toBe(true);
      expect(radios.filter((r) => r.checked)).toHaveLength(1);
    }
    expect(screen.getByText(/ときどき＝週に1回まで/)).toBeTruthy();
  });

  it('定番の候補：「出さない」にした国の料理は、ふだんの一覧から外して下にたたむ。「ときどき」の国の料理は、よく出す国のあとに並べる', () => {
    startOnboarding();
    next();
    const chu = defaultCatalog.dishes.find((d) => d.role === 'main' && d.genre === 'chu');
    if (!chu) throw new Error('no chu main dish');
    const picker = () => document.querySelector('.dish-groups') as HTMLElement;
    expect(within(picker()).getAllByRole('button', { name: chu.name }).length).toBeGreaterThan(0);
    fireEvent.click(choice('中華', '出さない'));
    // ふだんの一覧には出さない（たたんだ所を開くと、選べる）
    const groups = () => [...picker().querySelectorAll('.dish-group')] as HTMLElement[];
    expect(groups().some((g) => within(g).queryAllByRole('button', { name: chu.name }).length > 0)).toBe(false);
    const fold = screen.getByRole('button', { name: /出さない国の料理（\d+品）/ });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(fold);
    const hidden = screen.getByRole('group', { name: '出さない国の料理' });
    fireEvent.click(within(hidden).getByRole('button', { name: chu.name }));
    expect(document.querySelector('.picked')?.textContent).toContain(chu.name);
    // 名前で探したときは出し、「出さない国」と添える
    fireEvent.change(screen.getByLabelText('料理の名前で探す'), { target: { value: chu.name } });
    const escaped = chu.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = within(screen.getByRole('group', { name: '料理の候補' })).getAllByRole('button', { name: new RegExp(escaped) })[0];
    expect(found.textContent).toContain('出さない国');
    fireEvent.change(screen.getByLabelText('料理の名前で探す'), { target: { value: '' } });

    // 洋食を「ときどき」にすると、どの肉・魚の段でも、和食などの「よく出す」国の料理のあとに並ぶ
    fireEvent.click(choice('洋食', 'ときどき'));
    const rank = (name: string) => {
      const d = defaultCatalog.dishes.find((x) => x.role === 'main' && x.name === name);
      return d?.genre === 'yo' ? 1 : 0;
    };
    let checkedGroups = 0;
    for (const g of groups()) {
      const ranks = [...g.querySelectorAll('button')].map((b) => rank(b.textContent ?? ''));
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      if (ranks.includes(0) && ranks.includes(1)) checkedGroups += 1;
    }
    expect(checkedGroups).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 家族と設定
// ---------------------------------------------------------------------------

describe('家族と設定：食事・買い物のしかた・好み・1週間の食費・平日の調理時間', () => {
  it('新しい欄は家族のすぐあとにあり、それぞれに見出しと一言の説明がある（買い物の曜日は1か所だけ）', () => {
    store(stateWith({}));
    render(<App catalog={cat} todayFn={() => MONDAY} />);
    const sheet = openSettings();
    const titles = [...sheet.querySelectorAll('.block-title')].map((h) => h.firstChild?.textContent?.trim());
    expect(titles.slice(0, 8)).toEqual(['大切なお知らせ', '家族', '食事', '買い物のしかた', '好み', '1週間の食費', '平日の調理時間', 'うちの定番']);
    for (const id of ['meals-title', 'shop-title', 'taste-title', 'budget-title', 'time-title']) {
      const block = document.getElementById(id)?.closest('section') as HTMLElement;
      expect(block.querySelector(':scope > .field-note')?.textContent).toBeTruthy();
    }
    // 週2回（日・水）なので、曜日のボタンは「曜日を選ぶ」まで出さない
    expect(within(sheet).queryByRole('group', { name: '買い物の曜日' })).toBeNull();
    expect(radio(/^週2回/, sheet).checked).toBe(true);
    fireEvent.click(radio(/^曜日を選ぶ/, sheet));
    expect(within(sheet).getAllByRole('group', { name: '買い物の曜日' })).toHaveLength(1);
  });

  it('食事を変えると、夕食の献立は作り直さず、買い物リストだけを作り直す（お弁当の材料が入る）', () => {
    const before = stateWith({});
    store(before);
    render(<App catalog={cat} todayFn={() => MONDAY} />);
    const sheet = openSettings();
    fireEvent.click(radio(/^夕食＋お弁当/, sheet));
    const after = saved();
    expect(after.household.settings.meals).toBe('dinner_bento');
    expect(mealsKey(after)).toBe(mealsKey(before));
    expect(after.shopping).not.toEqual(before.shopping);
    expect(after.shopping).toEqual(buildShoppingLists({ ...before, household: after.household }, cat));
    // お弁当の材料（明日からの分）が、買い物リストに入る
    const tuesday = extrasOn(after.household, cat, '2026-11-10')[0];
    expect(tuesday.slot).toBe('bento');
    const used = after.shopping.flatMap((l) => l.items).filter((i) => i.forDates.includes('2026-11-10'));
    expect(used.some((i) => tuesday.dish.ingredients.some((di) => di.ingredientId === i.ingredientId))).toBe(true);
    expect(toastText()).toBe('食事を「夕食＋お弁当」にしました。夕食の献立はそのままです。買い物リストも直しました。');
    expect(toastText()).not.toContain('作り直しました');

    // 人数を変えても、夕食の献立はそのまま
    fireEvent.click(within(sheet).getByRole('button', { name: '1人増やす' }));
    expect(saved().household.settings.lunchCount).toBe(2);
    expect(mealsKey(saved())).toBe(mealsKey(before));
    expect(toastText()).toBe('お弁当を2人分にしました。買い物リストも直しました。');

    // 朝・昼・夕：朝ごはん・お昼を変えても、夕食の献立はそのまま
    fireEvent.click(radio(/^朝・昼・夕/, sheet));
    fireEvent.click(choice('お昼', '家で食べる'));
    expect(saved().household.settings).toMatchObject({ meals: 'three', lunchStyle: 'home', lunchCount: 2 });
    expect(toastText()).toBe('お昼を「家で食べる」にしました。買い物リストも直しました。');
    expect(within(sheet).getByText('お昼は何人分？')).toBeTruthy();
    fireEvent.click(choice('朝ごはん', 'ごはん'));
    expect(saved().household.settings.breakfastStyle).toBe('rice');
    expect(mealsKey(saved())).toBe(mealsKey(before));
  });

  it('国の料理を変えると、7つの国をすべて書いて献立を作り直す（出さない国の料理は、もう出ない）', () => {
    store(stateWith({}));
    render(<App catalog={cat} todayFn={() => MONDAY} />);
    const sheet = openSettings();
    // 前の版の記録（国の料理を選んでいない）には、そう書く
    expect(within(sheet).getByText(CUISINES_UNSET_NOTE)).toBeTruthy();
    expect(choice('和食', 'よく出す').checked).toBe(true);
    expect(choice('イタリアン', '出さない').checked).toBe(true);
    fireEvent.click(choice('中華', '出さない'));
    const after = saved();
    expect(after.household.settings.cuisines).toEqual({ ...DEFAULT_CUISINES, chu: 'never' });
    expect(toastText()).toContain('中華を「出さない」にしました。献立も作り直しました。');
    expect(within(sheet).queryByText(CUISINES_UNSET_NOTE)).toBeNull();
    const chu = new Set(cat.dishes.filter((d) => d.genre === 'chu').map((d) => d.id));
    const planned = after.meals.filter((m) => m.date >= MONDAY && m.status === 'planned');
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.flatMap((m) => m.dishIds).filter((id) => chu.has(id))).toEqual([]);

    // 辛さも、作り直す
    fireEvent.click(choice('辛さ', '辛くないものだけ'));
    expect(saved().household.settings.spice).toBe('mild');
    expect(toastText()).toContain('辛さを「辛くないものだけ」にしました。献立も作り直しました。');
  });

  it('1週間の食費：札で選ぶと、すぐに作り直す。ほかの金額は［この金額にする］で決め、読めない金額は知らせる', () => {
    store(stateWith({}));
    render(<App catalog={cat} todayFn={() => MONDAY} />);
    openSettings();
    fireEvent.click(choice('1週間の食費', '1万円'));
    expect(saved().household.settings.weeklyBudget).toBe(10000);
    expect(toastText()).toContain('1週間の食費の目安を1万円にしました。献立も作り直しました。');

    // ほかの金額：打っているあいだは変えない
    const other = screen.getByLabelText('ほかの金額');
    fireEvent.change(other, { target: { value: '500' } });
    expect(saved().household.settings.weeklyBudget).toBe(10000);
    fireEvent.click(screen.getByRole('button', { name: 'この金額にする' }));
    expect(screen.getByRole('alert').textContent).toBe(BUDGET_ERROR);
    expect(saved().household.settings.weeklyBudget).toBe(10000);
    fireEvent.change(other, { target: { value: '12000' } });
    fireEvent.click(screen.getByRole('button', { name: 'この金額にする' }));
    expect(saved().household.settings.weeklyBudget).toBe(12000);
    expect(toastText()).toContain('1週間の食費の目安を1万2,000円にしました。');
    expect(choice('1週間の食費', '1万円').checked).toBe(false);

    fireEvent.click(choice('1週間の食費', '目安なし'));
    expect(saved().household.settings.weeklyBudget).toBeNull();
    expect(toastText()).toContain('1週間の食費の目安を「目安なし」にしました。');
  });

  it('1週間の食費：今週の目安を予算と比べて出す（こえそうなら、そう書く）', () => {
    // 予算は、今週の目安の半分くらい（献立は、予算を入れる前に作ったまま）
    const base = stateWith({});
    const total = roundYen(weekCost(base, cat, MONDAY).total);
    const budget = Math.round(total / 2 / 10) * 10;
    const s = stateWith({ weeklyBudget: budget });
    store(s);
    render(<App catalog={cat} todayFn={() => MONDAY} />);
    const sheet = openSettings();
    const block = document.getElementById('budget-title')?.closest('section') as HTMLElement;
    expect(block.querySelector('.cost-line')?.textContent).toBe(`今週の目安：${yenText(total)}（予算 ${budget.toLocaleString('ja-JP')}円）`);
    const meter = within(sheet).getByRole('meter', { name: '今週の目安と予算' });
    expect(meter.getAttribute('aria-valuetext')).toContain('予算をこえています');
    expect(within(block).getByText(`予算より${yenText(total - budget)}多くなりそうです。`)).toBeTruthy();
  });

  it('1週間の食費：今週の献立がなく来週の献立があれば来週の目安を出す。どちらもなければ、献立ができたら出すと書く', () => {
    const base = stateWith({ weeklyBudget: 100000 });
    const sheetProps = {
      catalog: cat,
      aiMode: 'auto' as const,
      aiStatus: 'none' as const,
      onAiModeChange: noop,
      onHouseholdChange: noop,
      onImport: noop,
      onReset: noop,
      onStartOver: noop,
      onBack: noop,
      onToast: noop,
    };
    const block = () => document.getElementById('budget-title')?.closest('section') as HTMLElement;
    // 献立は 11/9 の週。今日を前の週にすると、来週の分になる
    const { unmount } = render(<HouseholdSheet state={{ ...base, today: '2026-11-02' }} {...sheetProps} />);
    expect(block().querySelector('.cost-line')?.textContent).toBe(`来週の目安：${yenText(weekCost(base, cat, MONDAY).total)}（予算 100,000円）`);
    unmount();
    render(<HouseholdSheet state={{ ...base, today: '2026-11-16' }} {...sheetProps} />);
    expect(block().querySelector('.cost-line')).toBeNull();
    expect(within(block()).getByText('献立ができたら、ここに今週の食費の目安を出します。')).toBeTruthy();
  });

  it('平日の調理時間：選ぶと、献立のどの曜日にも同じ時間を当てて作り直す。曜日ごとに違えば、そう書く', () => {
    store(stateWith({ maxMinutes: { 1: 15, 3: 30 } }));
    render(<App catalog={cat} todayFn={() => MONDAY} />);
    const sheet = openSettings();
    const group = screen.getByRole('radiogroup', { name: '平日の調理時間' });
    expect((within(group).getAllByRole('radio') as HTMLInputElement[]).filter((r) => r.checked)).toHaveLength(0);
    expect(
      within(sheet).getByText('今は、曜日ごとに違う時間です（月 15分・火 こだわらない・水 30分・木 こだわらない・金 こだわらない）。選ぶと、どの曜日も同じ時間にします。'),
    ).toBeTruthy();
    fireEvent.click(within(group).getByRole('radio', { name: '30分' }));
    expect(saved().household.settings.maxMinutes).toEqual({ 1: 30, 2: 30, 3: 30, 4: 30, 5: 30 });
    expect(toastText()).toContain('平日の調理時間を「30分」にしました。献立も作り直しました。');
    expect(within(sheet).queryByText(/曜日ごとに違う時間です/)).toBeNull();
    // 献立の曜日を足すと、足した曜日にも同じ時間を当てる
    fireEvent.click(within(screen.getByRole('group', { name: '献立を作る曜日' })).getByRole('button', { name: '土曜日' }));
    expect(saved().household.settings.maxMinutes).toEqual({ 1: 30, 2: 30, 3: 30, 4: 30, 5: 30, 6: 30 });
    fireEvent.click(within(group).getByRole('radio', { name: 'こだわらない' }));
    expect(saved().household.settings.maxMinutes).toEqual({});
  });

  it('買い物のしかた：選ぶと買い物の曜日を変えて作り直し、何日分かをその場で出す', () => {
    store(stateWith({}));
    render(<App catalog={cat} todayFn={() => MONDAY} />);
    const sheet = openSettings();
    expect(tripNote()).toBe('1回の買い物で、だいたい3日分（日・水に買い物）');
    fireEvent.click(radio(/^週1回まとめて/, sheet));
    expect(saved().household.settings.shoppingWeekdays).toEqual([0]);
    expect(toastText()).toContain('買い物を「週1回まとめて」にしました。献立も作り直しました。');
    expect(tripNote()).toBe('1回の買い物で、だいたい5日分（日に買い物）');
    fireEvent.click(radio(/^毎日/, sheet));
    expect(saved().household.settings.shoppingWeekdays).toEqual([1, 2, 3, 4, 5]);
    expect(tripNote()).toBe('1回の買い物で、だいたい1日分（月・火・水・木・金に買い物）');
    // 毎日なら、献立の曜日を足すと、買い物の曜日も足す
    fireEvent.click(within(screen.getByRole('group', { name: '献立を作る曜日' })).getByRole('button', { name: '土曜日' }));
    expect(saved().household.settings.shoppingWeekdays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(radio(/^毎日/, sheet).checked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 今週の献立・買い物リスト
// ---------------------------------------------------------------------------

describe('今週の献立：夕食のほかの食事と、食費の目安', () => {
  const props = { catalog: cat, weekStart: MONDAY, onWeekChange: noop, onAction: noop, onBack: noop };

  it('夕食＋お弁当：日ごとに、夕食の下に「お弁当：…（2人分）」を出す', () => {
    const s = stateWith({ meals: 'dinner_bento', lunchCount: 2 });
    render(<WeekSheet state={s} {...props} />);
    const days = s.meals.filter((m) => m.date >= MONDAY && m.date <= '2026-11-15');
    expect(days.length).toBe(5);
    for (const m of days) {
      const card = document.querySelector(`[data-date="${m.date}"]`) as HTMLElement;
      const extras = extrasOn(s.household, cat, m.date);
      expect(extras.map((x) => x.slot)).toEqual(['bento']);
      const lines = [...card.querySelectorAll('.extras li')].map((li) => li.textContent);
      expect(lines).toEqual([`お弁当：${extras[0].dish.name}（2人分）`]);
      expect(lines).toEqual(extras.map(extraLine));
    }
  });

  it('朝・昼・夕（お昼は家で食べる）：「朝ごはん：…」「お昼：…（3人分）」。夕食だけなら出さない', () => {
    const s = stateWith({ meals: 'three', lunchStyle: 'home', lunchCount: 3, breakfastStyle: 'rice' });
    const { unmount } = render(<WeekSheet state={s} {...props} />);
    const card = document.querySelector(`[data-date="${MONDAY}"]`) as HTMLElement;
    const lines = [...card.querySelectorAll('.extras li')].map((li) => li.textContent);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('朝ごはん：納豆ごはん・味噌汁');
    expect(lines[1]).toBe('お昼：かけうどん（3人分）');
    unmount();
    render(<WeekSheet state={stateWith({})} {...props} />);
    expect(document.querySelector('.extras')).toBeNull();
  });

  it('いちばん下に、その週の食費の目安（夕食と、ほかの食事の分）。予算があれば、予算と比べる棒を出す', () => {
    const s = stateWith({ meals: 'dinner_bento', lunchCount: 2, weeklyBudget: 100000 });
    render(<WeekSheet state={s} {...props} />);
    const cost = weekCost(s, cat, MONDAY);
    const panel = screen.getByRole('region', { name: '今週の食費の目安' });
    expect(panel.querySelector('.cost-line')?.textContent).toBe(`今週の食費の目安：${yenText(cost.total)}（予算 100,000円）`);
    expect(panel.textContent).toContain(`夕食 ${yenText(cost.dinners)}・お弁当 ${yenText(cost.extras)}`);
    const meter = within(panel).getByRole('meter');
    expect(meter.getAttribute('aria-valuemax')).toBe('100000');
    expect(meter.getAttribute('aria-valuenow')).toBe(String(roundYen(cost.total)));
    expect(panel.textContent).toContain(`予算まで、あと${yenText(100000 - roundYen(cost.total))}`);
    expect(panel.textContent).not.toContain('多くなりそう');
  });

  it('予算をこえそうなら、注意の印と文で知らせる（色だけにしない）', () => {
    const total = roundYen(weekCost(stateWith({}), cat, MONDAY).total);
    const budget = Math.round(total / 2 / 10) * 10;
    const s = stateWith({ weeklyBudget: budget });
    render(<WeekSheet state={s} {...props} />);
    const panel = screen.getByRole('region', { name: '今週の食費の目安' });
    const meter = within(panel).getByRole('meter');
    expect(meter.className).toContain('meter--over');
    expect(meter.getAttribute('aria-valuenow')).toBe(String(budget));
    expect(panel.querySelector('.warn-inline')?.textContent).toBe(`予算より${yenText(total - budget)}多くなりそうです。`);
    expect(panel.querySelector('.warn-inline svg')).not.toBeNull();
  });

  it('値段の目安がわからず、予算もなければ、食費の目安は出さない（「約0円」と言わない）', () => {
    const plain = makeCatalog(DISHES, INGREDIENTS, EXTRAS);
    render(<WeekSheet state={stateWith({}, plain)} {...props} catalog={plain} />);
    expect(screen.queryByRole('region', { name: '今週の食費の目安' })).toBeNull();
    expect(document.body.textContent).not.toContain('約0円');
  });
});

describe('食費の目安の棒（CostMeter）', () => {
  it('予算の中：「今週の目安：約12,340円（予算 15,000円）」と、のこり', () => {
    render(<CostMeter label="今週の目安" cost={{ dinners: 9000, extras: 3340, total: 12340 }} budget={15000} extrasLabel="お弁当" />);
    expect(document.querySelector('.cost-line')?.textContent).toBe('今週の目安：約12,340円（予算 15,000円）');
    expect(screen.getByText('夕食 約9,000円・お弁当 約3,340円')).toBeTruthy();
    const meter = screen.getByRole('meter', { name: '今週の目安と予算' });
    expect(meter.getAttribute('aria-valuenow')).toBe('12340');
    expect(meter.getAttribute('aria-valuemax')).toBe('15000');
    expect(meter.getAttribute('aria-valuetext')).toBe('約12,340円（予算 15,000円）');
    expect((meter.firstChild as HTMLElement).style.width).toBe('82.3%');
    expect(meter.className).toContain('meter--ok');
    expect(screen.getByText('予算まで、あと約2,660円')).toBeTruthy();
  });

  it('予算の9割をこえたら山吹、予算をこえたら朱と注意の文', () => {
    const { unmount } = render(<CostMeter label="今週の目安" cost={{ dinners: 14000, extras: 0, total: 14000 }} budget={15000} />);
    expect(screen.getByRole('meter').className).toContain('meter--near');
    expect(screen.queryByText(/夕食 約/)).toBeNull();
    unmount();
    render(<CostMeter label="今週の目安" cost={{ dinners: 12340, extras: 0, total: 12340 }} budget={10000} />);
    const meter = screen.getByRole('meter');
    expect(meter.className).toContain('meter--over');
    expect(meter.getAttribute('aria-valuenow')).toBe('10000');
    expect(meter.getAttribute('aria-valuetext')).toBe('約12,340円（予算 10,000円）。予算をこえています');
    expect((meter.firstChild as HTMLElement).style.width).toBe('100%');
    expect(screen.getByText('予算より約2,340円多くなりそうです。')).toBeTruthy();
  });

  it('予算がなければ棒は出さない。値段の目安がなければ、まだ出せないと言う', () => {
    const { unmount } = render(<CostMeter label="今週の目安" cost={{ dinners: 5000, extras: 0, total: 5000 }} budget={null} />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(document.querySelector('.cost-line')?.textContent).toBe('今週の目安：約5,000円');
    unmount();
    render(<CostMeter label="今週の目安" cost={{ dinners: 0, extras: 0, total: 0 }} budget={10000} />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(document.querySelector('.cost-line')?.textContent).toBe('今週の目安：まだ出せません（値段の目安がわかる材料がありません）');
  });
});

describe('買い物リスト：合計の目安', () => {
  const props = { date: null, onDateChange: noop, onAction: noop, onBack: noop, onToast: noop };

  it('表示しているリストの合計（目安）と、値段のわからない品の数', () => {
    const s = stateWith({});
    render(<ShoppingSheet state={s} catalog={cat} {...props} />);
    const list = [...s.shopping].sort((a, b) => (a.date < b.date ? -1 : 1)).find((l) => l.date >= s.today)!;
    const { yen, missing } = listCost(list, cat);
    expect(yen).toBeGreaterThan(0);
    expect(missing).toBeGreaterThan(0);
    const line = document.querySelector('.list-cost')?.textContent ?? '';
    expect(line).toContain(`合計の目安：${yenText(yen)}`);
    expect(line).toContain(`値段のわからない品${missing}点は含みません`);
    expect(line).toContain('目安');
  });

  it('値段のわかる品がなければ、合計は出せないと言う。すべてわかれば、わからない品の文は出さない', () => {
    const list = { date: MONDAY, items: [], pantry: [] };
    const plain = makeCatalog(DISHES, INGREDIENTS, EXTRAS);
    const s = stateWith({}, plain);
    const first = s.shopping[0];
    expect(listCostText(first, plain)).toEqual({ total: '合計の目安：まだ出せません', note: '値段の目安がわかる品がありません' });
    const allPriced = makeCatalog(
      DISHES,
      INGREDIENTS.map((i) => ({ ...i, price: { yen: 100, per: 100 } })),
      EXTRAS,
    );
    expect(listCostText(first, allPriced).note).toBeNull();
    expect(listCostText(first, allPriced).total).toBe(`合計の目安：${yenText(listCost(first, allPriced).yen)}`);
    // 品がなければ、合計の行は出さない
    render(<ShoppingSheet state={{ ...s, shopping: [list] }} catalog={plain} {...props} />);
    expect(document.querySelector('.list-cost')).toBeNull();
  });
});
