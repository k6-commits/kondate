// @vitest-environment jsdom
// 画面の部品（カード・シート・初回設定・フォーム）のテスト。第3段のレビューの UI-3・PRD-4・UI-4・UI-5・UI-7・
// A11Y-3・PRD-9・PRD-10・PRD-12 を確かめる（A11Y-2 の大きさは jsdom では測れないので Playwright で確かめた）。
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AppState, Member } from '../engine';
import { advanceDay, applyAction, createInitialState, handleUserText, renderCardText } from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import { App } from './App';
import { STORAGE_KEY } from './storage';
import { SERVINGS_NOTE, eatersOf, servingsLabel } from './lib';
import { emptyMemberDraft } from './components/Forms';
import { memberChangeAffectsMeals } from './components/HouseholdSheet';
import { WeekSheet } from './components/WeekSheet';

const MONDAY = '2026-11-09';
const todayFn = () => MONDAY;

function saved(): AppState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('state is not saved');
  return JSON.parse(raw) as AppState;
}

function talkLog(): HTMLElement {
  return screen.getByRole('log', { name: 'トーク' });
}

function menu(): HTMLElement {
  return screen.getByRole('navigation', { name: 'メニュー' });
}

function openMenu(name: string): void {
  fireEvent.click(within(menu()).getByRole('button', { name }));
}

function sheetTitle(): string {
  return document.querySelector('.sheet-title')?.textContent ?? '';
}

function sheetRange(): string {
  return document.querySelector('[data-sheet="week"] .range')?.textContent ?? '';
}

/** デモの家族で、MONDAY から days 日進めた状態を保存しておく。 */
function storeDemoAdvanced(days: number, plan: 'free' | 'paid' = 'free'): AppState {
  let s = createInitialState({ ...DEMO_ONBOARDING, plan }, defaultCatalog, MONDAY);
  for (let i = 0; i < days; i++) s = advanceDay(s, defaultCatalog).state;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return s;
}

/** 家族と設定の、その名前のメンバーのカード。 */
function memberCard(name: string): HTMLElement {
  const cards = [...document.querySelectorAll('[data-sheet="household"] .member-card')] as HTMLElement[];
  const card = cards.find((c) => c.querySelector('.member-name')?.textContent === name);
  if (!card) throw new Error(`member card not found: ${name}`);
  return card;
}

function mealsKey(s: AppState): string {
  return s.meals.map((m) => `${m.date}:${m.dishIds.join('+')}:${m.changedBy ?? ''}`).join(' ');
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UI-3：家族の名前や続柄だけを直しても、献立は作り直さない', () => {
  const papa: Member = { id: 'member_2', nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] };

  it('memberChangeAffectsMeals：名前・続柄・除外の順序は献立に効かない。年齢帯・除外・重いの印は効く', () => {
    expect(memberChangeAffectsMeals(papa, { ...papa, nickname: 'おとうさん', role: 'other' })).toBe(false);
    const a: Member = { ...papa, exclusions: [{ type: 'allergen', id: 'egg' }, { type: 'text', text: 'パクチー' }] };
    const b: Member = { ...papa, exclusions: [{ type: 'text', text: 'パクチー' }, { type: 'allergen', id: 'egg' }] };
    expect(memberChangeAffectsMeals(a, b)).toBe(false);
    expect(memberChangeAffectsMeals(papa, { ...papa, ageBand: 'teen' })).toBe(true);
    expect(memberChangeAffectsMeals(papa, { ...papa, exclusions: [{ type: 'allergen', id: 'shrimp' }] })).toBe(true);
    expect(memberChangeAffectsMeals(a, { ...a, exclusions: [{ type: 'allergen', id: 'egg', severe: true }, { type: 'text', text: 'パクチー' }] })).toBe(
      true,
    );
  });

  it('ニックネームだけ直すと、献立・買い物のチェック・トークは変わらず、名前だけ変わる', () => {
    render(<App todayFn={todayFn} />);
    // 火曜を自分で差し替え、今日の買い物を1つチェックしておく
    openMenu('今週の献立');
    const tue = document.querySelector('[data-sheet="week"] [data-date="2026-11-10"]') as HTMLElement;
    fireEvent.click(within(tue).getByRole('button', { name: '差し替え' }));
    fireEvent.click(within(tue).getAllByRole('button').filter((b) => b.classList.contains('alt-option'))[1]);
    fireEvent.keyDown(window, { key: 'Escape' });
    openMenu('買い物リスト');
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.keyDown(window, { key: 'Escape' });
    const before = saved();

    openMenu('家族と設定');
    fireEvent.click(within(memberCard('パパ')).getByRole('button', { name: '直す' }));
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'おとうさん' } });
    fireEvent.click(screen.getByRole('radio', { name: 'その他' }));
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));

    const after = saved();
    expect(after.household.members[1]).toMatchObject({ id: 'member_2', nickname: 'おとうさん', role: 'other' });
    expect(mealsKey(after)).toBe(mealsKey(before));
    expect(after.shopping).toEqual(before.shopping);
    expect(after.chat).toEqual(before.chat);
    const toast = screen.getByRole('status').textContent ?? '';
    expect(toast).toBe('おとうさんを直しました。');
  });

  it('除外を足したときは、今までどおり献立を作り直す', () => {
    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    fireEvent.click(within(memberCard('パパ')).getByRole('button', { name: '直す' }));
    fireEvent.click(screen.getByRole('button', { name: 'えび' }));
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(saved().household.members[1].exclusions).toEqual([{ type: 'allergen', id: 'shrimp' }]);
    expect(screen.getByRole('status').textContent).toContain('献立も作り直しました');
  });
});

describe('PRD-4：メニューの「今週の献立」は、これからの献立がある週を開く', () => {
  it('無料版の日曜（来週の献立ができた日）は来週を開き、上に終わった今週の振り返りを出す。［今週］で戻れる', () => {
    const s = storeDemoAdvanced(6);
    expect(s.today).toBe('2026-11-15');
    expect(s.meals.some((m) => m.date === '2026-11-16')).toBe(true);
    render(<App todayFn={todayFn} />);
    openMenu('今週の献立');
    expect(sheetTitle()).toBe('来週の献立');
    expect(sheetRange()).toBe('11/16(月)〜11/22(日)');
    const seg = screen.getByRole('group', { name: '表示する週' });
    expect(within(seg).getByRole('button', { name: '来週' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('region', { name: '今週の振り返り' })).toBeTruthy();

    fireEvent.click(within(seg).getByRole('button', { name: '今週' }));
    expect(sheetTitle()).toBe('今週の献立');
    expect(sheetRange()).toBe('11/9(月)〜11/15(日)');
    expect(screen.queryByRole('region', { name: '今週の振り返り' })).toBeNull();
  });

  it('今週の献立日が残っていれば、今週を開く（来週の献立がまだない土曜も今週）', () => {
    storeDemoAdvanced(5); // 11/14(土)：来週の献立はまだ
    render(<App todayFn={todayFn} />);
    openMenu('今週の献立');
    expect(sheetTitle()).toBe('今週の献立');
    expect(sheetRange()).toBe('11/9(月)〜11/15(日)');
  });

  it('今週の献立がない日に始めた週も、来週の献立があれば来週を開く', () => {
    const start = createInitialState(DEMO_ONBOARDING, defaultCatalog, '2026-11-14'); // 土曜に始める → 来週の献立
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(start));
    render(<App todayFn={() => '2026-11-14'} />);
    openMenu('今週の献立');
    expect(sheetTitle()).toBe('来週の献立');
  });
});

describe('UI-4：古い週のカードの［献立を開く］', () => {
  it('先週のカードからは先週の献立が開き、未確認の日に［作った］が押せる', () => {
    storeDemoAdvanced(7); // 11/16(月)
    render(<App todayFn={todayFn} />);
    const cards = [...talkLog().querySelectorAll('[data-card="week"]')] as HTMLElement[];
    const old = cards.find((c) => c.textContent?.includes('11/9(月)〜の夕食')) as HTMLElement;
    fireEvent.click(within(old).getByRole('button', { name: '献立を開く' }));
    expect(sheetTitle()).toBe('先週の献立');
    expect(sheetRange()).toBe('11/9(月)〜11/15(日)');
    expect(screen.queryByText(/来週の献立は、来週の最初の買い物日の前日にできます/)).toBeNull();
    expect(screen.getByRole('region', { name: 'この週の振り返り' })).toBeTruthy();
    const monday = document.querySelector('[data-sheet="week"] [data-date="2026-11-09"]') as HTMLElement;
    expect(within(monday).getByText('未確認')).toBeTruthy();
    fireEvent.click(within(monday).getByRole('button', { name: '作った' }));
    expect(saved().meals.find((m) => m.date === MONDAY)?.status).toBe('cooked');
  });

  it('献立の残っていない、もっと前の週のカードにはボタンを出さない', () => {
    storeDemoAdvanced(14); // 11/23(月)：11/9 の週の献立はもうない
    render(<App todayFn={todayFn} />);
    const old = [...talkLog().querySelectorAll('[data-card="week"]')].find((c) => c.textContent?.includes('11/9(月)〜の夕食')) as HTMLElement;
    expect(old).toBeTruthy();
    expect(within(old).queryByRole('button', { name: '献立を開く' })).toBeNull();
    expect(within(old).getByText('過ぎた週の献立は、もう表示できません。')).toBeTruthy();
  });

  it('週の献立の画面は、先週の献立が残っていなければ今週を出す', () => {
    const s = storeDemoAdvanced(14);
    render(
      <WeekSheet state={s} catalog={defaultCatalog} weekStart={MONDAY} onWeekChange={() => {}} onAction={() => {}} onBack={() => {}} />,
    );
    expect(sheetTitle()).toBe('今週の献立');
    expect(sheetRange()).toBe('11/23(月)〜11/29(日)');
  });
});

describe('UI-5：初回設定の「デモの家族で始める」は、今の状態を消す前に確かめる', () => {
  it('確認の前は状態を変えず、［やめる］で戻り、［デモで始め直す］でデモに戻る', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    window.location.hash = '#start';
    fireEvent(window, new HashChangeEvent('hashchange'));
    fireEvent.click(screen.getByRole('button', { name: 'デモの家族で始める' }));
    // まだ変えない
    expect(saved().today).toBe('2026-11-10');
    const confirm = screen.getByRole('group', { name: 'デモの家族で始め直すかの確認' });
    expect(confirm.textContent).toContain('今の家族と記録は消えて、デモの家族で始め直します。元には戻せません。');
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(within(confirm).getByRole('button', { name: 'やめる' }));
    expect(screen.queryByRole('group', { name: 'デモの家族で始め直すかの確認' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'デモの家族で始める' }));
    expect(saved().today).toBe('2026-11-10');

    fireEvent.click(screen.getByRole('button', { name: 'デモの家族で始める' }));
    fireEvent.click(screen.getByRole('button', { name: 'デモで始め直す' }));
    expect(saved().today).toBe(MONDAY);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/9(月)');
  });

  it('確認の画面（手順5）に、今の家族と記録が置き換わることを書く', () => {
    window.location.hash = '#start';
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'あきこ' } });
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    const notes = screen.getByRole('note', { name: '始める前の注意' });
    expect(within(notes).getByText('今の家族と記録は、この内容で置き換わります。元には戻せません。')).toBeTruthy();
  });
});

describe('UI-7：家族の続柄の既定', () => {
  it('emptyMemberDraft：1人目はわたし、2人目はパートナー、3人目からは子ども（小学生）', () => {
    expect(emptyMemberDraft(0)).toMatchObject({ ageBand: 'adult', role: 'parent' });
    expect(emptyMemberDraft(1)).toMatchObject({ ageBand: 'adult', role: 'partner' });
    expect(emptyMemberDraft(2)).toMatchObject({ ageBand: 'child', role: 'child' });
    expect(emptyMemberDraft(5)).toMatchObject({ ageBand: 'child', role: 'child' });
  });

  it('初回設定：3人目は子どもで始まり、2人目を小学生にすると続柄も子どもになる。確認画面に「小学生・子ども」と出る', () => {
    window.location.hash = '#start';
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'さとみ' } });
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));

    // 2人目：パートナーで始まる。小学生にすると子ども。
    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    expect((screen.getByRole('radio', { name: 'パートナー' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'そうた' } });
    fireEvent.click(screen.getByRole('radio', { name: '小学生' }));
    expect((screen.getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));

    // 3人目：子ども（小学生）で始まる。乳児にしても子どものまま。
    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    expect((screen.getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: '小学生' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'あか' } });
    fireEvent.click(screen.getByRole('radio', { name: '乳児（1歳未満）' }));
    expect((screen.getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));

    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    const family = [...document.querySelectorAll('.confirm-member')].map((e) => e.textContent);
    expect(family).toEqual(['さとみ（大人・わたし）', 'そうた（小学生・子ども）', 'あか（乳児（1歳未満）・子ども）']);
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(saved().household.members.map((m) => `${m.ageBand}/${m.role}`)).toEqual(['adult/parent', 'child/child', 'infant/child']);
  });

  it('家族と設定の「家族を加える」も、同じ既定（デモの家族の5人目は子ども）', () => {
    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    const editor = document.querySelector('.member-card.is-editing') as HTMLElement;
    expect((within(editor).getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
    expect((within(editor).getByRole('radio', { name: '小学生' }) as HTMLInputElement).checked).toBe(true);
  });

  it('大人にしても、子どもの続柄はそのまま（大人の子どももいる）。わたし・パートナーは子どもの年齢で子どもになる', () => {
    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    fireEvent.click(within(memberCard('ママ')).getByRole('button', { name: '直す' }));
    fireEvent.click(screen.getByRole('radio', { name: '中高生' }));
    expect((screen.getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '大人' }));
    expect((screen.getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('A11Y-3：週のカードの今日の行', () => {
  it('今日の行に「今日」の文字と aria-current="date" がある（ほかの行にはない）', () => {
    render(<App todayFn={todayFn} />);
    const card = talkLog().querySelector('[data-card="week"]') as HTMLElement;
    const rows = [...card.querySelectorAll('.week-row')] as HTMLElement[];
    const today = rows.filter((r) => r.getAttribute('aria-current') === 'date');
    expect(today).toHaveLength(1);
    expect(today[0].textContent).toContain('11/9');
    expect(within(today[0]).getByText('今日')).toBeTruthy();
    for (const r of rows.filter((x) => x !== today[0])) expect(r.textContent).not.toContain('今日');
  });
});

describe('PRD-9：家族と設定に、うちの定番を出す', () => {
  it('デモの家族の定番9品を一覧で出す', () => {
    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    const block = screen.getByRole('region', { name: /うちの定番/ });
    expect(block.textContent).toContain('9品');
    const items = [...block.querySelectorAll('.fav-item')].map((e) => e.textContent);
    expect(items).toHaveLength(9);
    expect(items).toContain('豚の生姜焼き');
    expect(items).toContain('さばの味噌煮');
  });

  it('アレルギーの除外がある家族の、名前だけの定番には「要確認なので出しません」とわけを出す', () => {
    const s = createInitialState(
      {
        members: [{ nickname: 'あきこ', ageBand: 'adult', role: 'parent', exclusions: [{ type: 'allergen', id: 'egg' }] }],
        shoppingWeekdays: [1, 4],
        favoriteDishIds: ['shogayaki', 'oyakodon'],
        customFavoriteNames: ['ばあばの煮物'],
        plan: 'free',
      },
      defaultCatalog,
      MONDAY,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    const block = screen.getByRole('region', { name: /うちの定番/ });
    const item = (name: string) => [...block.querySelectorAll('.fav-item')].find((e) => e.querySelector('.fav-name')?.textContent === name) as HTMLElement;
    expect(within(item('ばあばの煮物')).getByText('名前だけ')).toBeTruthy();
    expect(within(item('ばあばの煮物')).getByText('要確認なので出しません')).toBeTruthy();
    expect(within(item('親子丼')).getByText('除外に当たるので出しません')).toBeTruthy();
    expect(item('豚の生姜焼き').querySelector('.badge')).toBeNull();
    expect(within(block).getByText(/「要確認の料理も出す」をオンにすると、注意を付けて出します/)).toBeTruthy();

    // 「要確認の料理も出す」をオンにすると、出すことを示す
    fireEvent.click(screen.getByLabelText(/要確認の料理も出す/));
    expect(within(item('ばあばの煮物')).getByText('要確認（注意を付けて出します）')).toBeTruthy();
  });

  it('初回設定の自由入力のヒントは、献立に出ないことまで書く', () => {
    window.location.hash = '#start';
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'あきこ' } });
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.change(screen.getByLabelText('料理の名前で探す'), { target: { value: 'ばあばの煮物' } });
    expect(screen.getByText(/アレルギーの除外がある家族では「要確認」になり、献立には出ません/)).toBeTruthy();
  });
});

describe('PRD-10：量は人数を主に出し、大人換算は添えて説明する', () => {
  it('servingsLabel：人数と大人換算が違うときだけ換算を添える', () => {
    expect(servingsLabel(3.2, 4)).toBe('4人分（大人換算3.2）');
    expect(servingsLabel(2.2, 3)).toBe('3人分（大人換算2.2）');
    expect(servingsLabel(2, 2)).toBe('2人分');
    expect(servingsLabel(0, 0)).toBe('0人分');
  });

  it('eatersOf：乳児と欠席の人は食べる人に数えない', () => {
    const s = createInitialState(
      { ...DEMO_ONBOARDING, members: [...DEMO_ONBOARDING.members, { nickname: 'あか', ageBand: 'infant', role: 'child', exclusions: [] }] },
      defaultCatalog,
      MONDAY,
    );
    const meal = s.meals[0];
    expect(eatersOf(s, meal).map((m) => m.nickname)).toEqual(['ママ', 'パパ', 'はると', 'ゆい']);
    expect(eatersOf(s, { ...meal, absentMemberIds: ['member_2'] }).map((m) => m.nickname)).toEqual(['ママ', 'はると', 'ゆい']);
  });

  it('週の献立に「4人分（大人換算3.2）」と、換算の説明を出す。欠席の日は人数が減る', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: '水曜はパパが飲み会' } });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
    openMenu('今週の献立');
    const sheet = document.querySelector('[data-sheet="week"]') as HTMLElement;
    const mon = sheet.querySelector('[data-date="2026-11-09"]') as HTMLElement;
    const wed = sheet.querySelector('[data-date="2026-11-11"]') as HTMLElement;
    expect(mon.querySelector('.meal-meta')?.textContent).toContain('4人分（大人換算3.2）');
    expect(wed.querySelector('.meal-meta')?.textContent).toContain('3人分（大人換算2.2）');
    expect(within(sheet).getByText(SERVINGS_NOTE)).toBeTruthy();
  });

  it('大人だけの家族には、換算の説明を出さない', () => {
    const s = createInitialState(
      {
        members: [
          { nickname: 'あきこ', ageBand: 'adult', role: 'parent', exclusions: [] },
          { nickname: 'たける', ageBand: 'adult', role: 'partner', exclusions: [] },
        ],
        shoppingWeekdays: [1, 4],
        favoriteDishIds: [],
        customFavoriteNames: [],
        plan: 'free',
      },
      defaultCatalog,
      MONDAY,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    render(<App todayFn={todayFn} />);
    openMenu('今週の献立');
    const sheet = document.querySelector('[data-sheet="week"]') as HTMLElement;
    expect(sheet.querySelector('[data-date="2026-11-09"] .meal-meta')?.textContent).toContain('2人分');
    expect(sheet.textContent).not.toContain('大人換算');
  });

  it('エンジンのカードの文（LINE に送る文）と同じ表現になる（欠席の日も）', () => {
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    s = handleUserText(s, defaultCatalog, '水曜はパパが飲み会').state;
    s = handleUserText(s, defaultCatalog, '木曜はゆいがいない').state;
    expect(s.meals.map((m) => servingsLabel(m.servings, eatersOf(s, m).length))).toEqual([
      '4人分（大人換算3.2）',
      '4人分（大人換算3.2）',
      '3人分（大人換算2.2）',
      '3人分（大人換算2.7）',
      '4人分（大人換算3.2）',
    ]);
    for (const meal of s.meals) {
      const text = renderCardText(s, defaultCatalog, { kind: 'meal', date: meal.date });
      expect(text).toContain(`分・${servingsLabel(meal.servings, eatersOf(s, meal).length)}`);
    }
  });
});

describe('PRD-12：新しい料理に、作り方の手がかりを添える', () => {
  it('新しい料理の日に「はじめての料理です。作り方は、料理名でレシピを探してください。」と出す（ほかの日には出さない）', () => {
    const s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    const newMeal = s.meals.find((m) => m.newDishIds.length > 0)!;
    expect(newMeal).toBeTruthy();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    render(<App todayFn={todayFn} />);
    openMenu('今週の献立');
    const sheet = document.querySelector('[data-sheet="week"]') as HTMLElement;
    const day = sheet.querySelector(`[data-date="${newMeal.date}"]`) as HTMLElement;
    const name = defaultCatalog.dishById.get(newMeal.newDishIds[0])!.name;
    expect(day.textContent).toContain(`「${name}」ははじめての料理です。作り方は、料理名でレシピを探してください。`);
    const others = [...sheet.querySelectorAll('.day')].filter((d) => d !== day);
    for (const d of others) expect(d.textContent).not.toContain('はじめての料理です');
  });

  it('エンジンのカードの文（LINE に送る文）の「作り方」と同じ文になる', () => {
    const s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    const newMeal = s.meals.find((m) => m.newDishIds.length > 0)!;
    const line = renderCardText(s, defaultCatalog, { kind: 'meal', date: newMeal.date })
      .split('\n')
      .find((l) => l.startsWith('作り方：'));
    expect(line).toBeTruthy();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    render(<App todayFn={todayFn} />);
    openMenu('今週の献立');
    const day = document.querySelector(`[data-sheet="week"] [data-date="${newMeal.date}"]`) as HTMLElement;
    expect(day.textContent).toContain(line!.replace(/^作り方：/, ''));
  });

  it('作ったあとの日には出さない', () => {
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    const newMeal = s.meals.find((m) => m.newDishIds.length > 0)!;
    while (s.today <= newMeal.date) s = advanceDay(s, defaultCatalog).state;
    s = applyAction(s, defaultCatalog, { type: 'cooked', date: newMeal.date }).state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    render(<App todayFn={todayFn} />);
    openMenu('今週の献立');
    const day = document.querySelector(`[data-sheet="week"] [data-date="${newMeal.date}"]`) as HTMLElement;
    expect(day.textContent).not.toContain('はじめての料理です');
  });
});
