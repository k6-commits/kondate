// @vitest-environment jsdom
// 画面の部品（カード・シート・初回設定・フォーム）のテスト。第3段のレビューの UI-3・PRD-4・UI-4・UI-5・UI-7・
// A11Y-3・PRD-9・PRD-10・PRD-12 を確かめる（A11Y-2 の大きさは jsdom では測れないので Playwright で確かめた）。
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ActionButton, AppState, Member } from '../engine';
import { advanceDay, applyAction, createInitialState, handleUserText, renderCardText } from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import { App } from './App';
import { STORAGE_KEY } from './storage';
import { NO_DINNER_TEXT, SERVINGS_NOTE, eatersOf, leftCount, nobodyEats, nobodyEatsOn, servingsLabel } from './lib';
import type { MemberDraft } from './components/Forms';
import { customDishSafety, emptyMemberDraft, exclusionLine, pickAgeBand, withAgeBand } from './components/Forms';
import { memberChangeAffectsMeals } from './components/HouseholdSheet';
import { SummaryBody } from './components/ChatCard';
import { MealDetails, statusBadgeShown } from './components/MealDetails';
import { actionLabels, displayTimes, visibleActions } from './components/Talk';
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
    // 乳児の除外は献立に使わないので、除外だけを直しても作り直さない（年齢を変えたら作り直す）
    const baby: Member = { id: 'member_4', nickname: 'ゆい', ageBand: 'infant', role: 'child', exclusions: [] };
    expect(memberChangeAffectsMeals(baby, { ...baby, exclusions: [{ type: 'allergen', id: 'egg' }] })).toBe(false);
    expect(memberChangeAffectsMeals(baby, { ...baby, ageBand: 'preschool', exclusions: [{ type: 'allergen', id: 'egg' }] })).toBe(true);
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

  it('除外を足しても、当たる料理がなければ献立はそのまま（エンジンの keepSafe と同じ知らせ）', () => {
    render(<App todayFn={todayFn} />);
    const before = saved();
    openMenu('家族と設定');
    fireEvent.click(within(memberCard('パパ')).getByRole('button', { name: '直す' }));
    // そばを使う料理は、デモの週にない（えびは、しらす丼のしらすに当たるので水曜が替わる）
    fireEvent.click(screen.getByRole('button', { name: 'そば' }));
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    const after = saved();
    expect(after.household.members[1].exclusions).toEqual([{ type: 'allergen', id: 'buckwheat' }]);
    expect(after.meals.map((m) => m.dishIds)).toEqual(before.meals.map((m) => m.dishIds));
    expect(screen.getByRole('status').textContent).toBe(
      'パパを直しました。家族の変更に当たる料理はないので、献立はそのままです。人数と買い物リストは直しました。',
    );
  });

  it('除外に当たる日だけを作り直し、ほかの日（自分で替えていない日も）はそのまま', () => {
    render(<App todayFn={todayFn} />);
    const before = saved();
    const squidDay = before.meals.find((m) => m.dishIds.includes('ika_daikon'))?.date;
    openMenu('家族と設定');
    fireEvent.click(within(memberCard('パパ')).getByRole('button', { name: '直す' }));
    fireEvent.click(screen.getByRole('button', { name: /表示が推奨の品目/ }));
    fireEvent.click(screen.getByRole('button', { name: 'いか' }));
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    const after = saved();
    // デモの週（11/9〜）は、金曜がいかと大根の煮物。その日だけが替わる
    expect(squidDay).toBe('2026-11-13');
    for (const m of before.meals) {
      const now = after.meals.find((x) => x.date === m.date)!;
      if (m.date === squidDay) expect(now.dishIds).not.toEqual(m.dishIds);
      else expect(now.dishIds).toEqual(m.dishIds);
    }
    expect(screen.getByRole('status').textContent).toBe(
      'パパを直しました。11/13(金)は、家族の変更に合わせて作り直しました。ほかの日は、そのままです。',
    );
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

  it('わたし・パートナーは子どもの年齢で子どもになり、大人に戻すと元の続柄に戻る（「その他」にしない。U2）', () => {
    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    fireEvent.click(within(memberCard('ママ')).getByRole('button', { name: '直す' }));
    fireEvent.click(screen.getByRole('radio', { name: '中高生' }));
    expect((screen.getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '大人' }));
    expect((screen.getByRole('radio', { name: 'わたし' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('U2：年齢を大人にしたら、続柄の「子ども」は「その他」にする', () => {
  it('withAgeBand：大人にすると子ども→その他。子どもの年齢にすると、わたし・パートナー→子ども（今までどおり）。ほかはそのまま', () => {
    const d = (role: MemberDraft['role'], ageBand: MemberDraft['ageBand'] = 'adult'): MemberDraft => ({ nickname: 'x', ageBand, role, exclusions: [] });
    expect(withAgeBand(d('child', 'child'), 'adult')).toMatchObject({ ageBand: 'adult', role: 'other' });
    expect(withAgeBand(d('child', 'teen'), 'adult')).toMatchObject({ ageBand: 'adult', role: 'other' });
    expect(withAgeBand(d('parent'), 'child')).toMatchObject({ ageBand: 'child', role: 'child' });
    expect(withAgeBand(d('partner'), 'teen')).toMatchObject({ ageBand: 'teen', role: 'child' });
    expect(withAgeBand(d(undefined), 'infant')).toMatchObject({ ageBand: 'infant', role: 'child' });
    expect(withAgeBand(d('child', 'child'), 'teen')).toMatchObject({ ageBand: 'teen', role: 'child' });
    expect(withAgeBand(d('other', 'child'), 'adult')).toMatchObject({ ageBand: 'adult', role: 'other' });
    expect(withAgeBand(d('other'), 'preschool')).toMatchObject({ ageBand: 'preschool', role: 'other' });
    expect(withAgeBand(d('parent'), 'adult')).toMatchObject({ ageBand: 'adult', role: 'parent' });
    expect(withAgeBand(d(undefined), 'adult')).toEqual({ nickname: 'x', ageBand: 'adult', exclusions: [] });
    // 名前や除外は変えない
    const withEx: MemberDraft = { nickname: 'ばあば', ageBand: 'child', role: 'child', exclusions: [{ type: 'allergen', id: 'egg' }] };
    expect(withAgeBand(withEx, 'adult')).toEqual({ ...withEx, ageBand: 'adult', role: 'other' });
  });

  it('初回設定：3人目（小学生・子ども）を大人にすると「大人・その他」になり、そのまま保存される', () => {
    window.location.hash = '#start';
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'さとみ' } });
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));
    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'たける' } });
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));

    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    expect((screen.getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'ばあば' } });
    fireEvent.click(screen.getByRole('radio', { name: '大人' }));
    expect((screen.getByRole('radio', { name: 'その他' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));

    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    const family = [...document.querySelectorAll('.confirm-member')].map((e) => e.textContent);
    expect(family).toEqual(['さとみ（大人・わたし）', 'たける（大人・パートナー）', 'ばあば（大人・その他）']);
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(saved().household.members.map((m) => `${m.ageBand}/${m.role}`)).toEqual(['adult/parent', 'adult/partner', 'adult/other']);
  });

  it('家族と設定：加える人も、直す子ども（はると）も、大人にすると「その他」。大人の子どもなら、あとで「子ども」を選び直せる', () => {
    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    let editor = document.querySelector('.member-card.is-editing') as HTMLElement;
    fireEvent.click(within(editor).getByRole('radio', { name: '大人' }));
    expect((within(editor).getByRole('radio', { name: 'その他' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(editor).getByRole('button', { name: 'やめる' }));

    fireEvent.click(within(memberCard('はると')).getByRole('button', { name: '直す' }));
    editor = document.querySelector('.member-card.is-editing') as HTMLElement;
    expect((within(editor).getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(editor).getByRole('radio', { name: '大人' }));
    expect((within(editor).getByRole('radio', { name: 'その他' }) as HTMLInputElement).checked).toBe(true);
    // 大人の子ども：続柄を選び直せば「大人・子ども」で保存できる
    fireEvent.click(within(editor).getByRole('radio', { name: '子ども' }));
    expect((within(editor).getByRole('radio', { name: '大人' }) as HTMLInputElement).checked).toBe(true);
    expect((within(editor).getByRole('radio', { name: '子ども' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(editor).getByRole('button', { name: '保存する' }));
    expect(saved().household.members.find((m) => m.nickname === 'はると')).toMatchObject({ ageBand: 'adult', role: 'child' });
  });

  it('pickAgeBand：年齢に合わせて直した続柄は、年齢を戻すと元に戻る。続柄を自分で選んだら（memo なし）、その続柄から決める', () => {
    const d = (role: MemberDraft['role'], ageBand: MemberDraft['ageBand']): MemberDraft => ({ nickname: 'x', ageBand, role, exclusions: [] });
    // はると：大人（→その他）→ 小学生（→子どもに戻る）
    let r = pickAgeBand(d('child', 'child'), 'adult', null);
    expect(r.draft).toMatchObject({ ageBand: 'adult', role: 'other' });
    expect(r.memo).toEqual({ from: 'child', to: 'other' });
    r = pickAgeBand(r.draft, 'child', r.memo);
    expect(r.draft).toMatchObject({ ageBand: 'child', role: 'child' });
    expect(r.memo).toBeNull();
    // ママ：中高生（→子ども）→ 幼児（子どものまま。覚えは残る）→ 大人（→わたしに戻る）
    r = pickAgeBand(d('parent', 'adult'), 'teen', null);
    expect(r.draft.role).toBe('child');
    r = pickAgeBand(r.draft, 'preschool', r.memo);
    expect(r.draft).toMatchObject({ ageBand: 'preschool', role: 'child' });
    expect(r.memo).toEqual({ from: 'parent', to: 'child' });
    r = pickAgeBand(r.draft, 'adult', r.memo);
    expect(r.draft).toMatchObject({ ageBand: 'adult', role: 'parent' });
    expect(r.memo).toBeNull();
    // 続柄のなかった人（読み込んだデータ）：小学生（→子ども）→ 大人（→続柄なしに戻る）
    r = pickAgeBand(d(undefined, 'adult'), 'child', null);
    expect(r.draft.role).toBe('child');
    r = pickAgeBand(r.draft, 'adult', r.memo);
    expect(r.draft.role).toBeUndefined();
    // 覚えのあとで続柄が変わっていたら（自分で選んだ）、覚えは使わない：ママを中高生（→子ども）にしてから「その他」を選び、大人に戻す
    r = pickAgeBand(d('parent', 'adult'), 'teen', null);
    r = pickAgeBand({ ...r.draft, role: 'other' }, 'adult', r.memo);
    expect(r.draft).toMatchObject({ ageBand: 'adult', role: 'other' });
    expect(r.memo).toBeNull();
  });

  it('家族と設定：はるとを、うっかり大人にしてから小学生に戻すと「子ども」に戻る。「その他」を自分で選んだら、そのまま', () => {
    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    fireEvent.click(within(memberCard('はると')).getByRole('button', { name: '直す' }));
    const editor = document.querySelector('.member-card.is-editing') as HTMLElement;
    const checked = (name: string) => (within(editor).getByRole('radio', { name }) as HTMLInputElement).checked;
    fireEvent.click(within(editor).getByRole('radio', { name: '大人' }));
    expect(checked('その他')).toBe(true);
    fireEvent.click(within(editor).getByRole('radio', { name: '小学生' }));
    expect(checked('子ども')).toBe(true);
    fireEvent.click(within(editor).getByRole('radio', { name: '大人' }));
    expect(checked('その他')).toBe(true);
    // 「その他」を自分で選び直したら、年齢を変えても「その他」のまま（いとこの子など）
    fireEvent.click(within(editor).getByRole('radio', { name: 'その他' }));
    fireEvent.click(within(editor).getByRole('radio', { name: '小学生' }));
    expect(checked('その他')).toBe(true);
    fireEvent.click(within(editor).getByRole('button', { name: '保存する' }));
    expect(saved().household.members.find((m) => m.nickname === 'はると')).toMatchObject({ ageBand: 'child', role: 'other' });
  });

  it('初回設定：3人目を大人（→その他）→ 中高生にすると「子ども」に戻り、もう一度大人にすると「その他」', () => {
    window.location.hash = '#start';
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'さとみ' } });
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));
    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'たける' } });
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));
    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    const checked = (name: string) => (screen.getByRole('radio', { name }) as HTMLInputElement).checked;
    fireEvent.click(screen.getByRole('radio', { name: '大人' }));
    expect(checked('その他')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '中高生' }));
    expect(checked('子ども')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '大人' }));
    expect(checked('その他')).toBe(true);
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

describe('U1：みんな外で食べる日は「夕食なし」と出し、量・作り方・作る/替えるボタンを出さない', () => {
  const FRIDAY = '2026-11-13';

  function sendText(text: string): void {
    fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
  }

  function lastBot(): HTMLElement {
    const bots = [...talkLog().querySelectorAll('[data-from="bot"]')] as HTMLElement[];
    return bots[bots.length - 1];
  }

  function weekDay(date: string): HTMLElement {
    return document.querySelector(`[data-sheet="week"] [data-date="${date}"]`) as HTMLElement;
  }

  /** 作る・替えるボタン（作った・作らなかった・別のに・今日は無理・差し替え）。 */
  const DAY_BUTTON = /^(作った|作らなかった|別のに|今日は無理|差し替え)$/;

  function dayButtons(scope: HTMLElement): string[] {
    return within(scope)
      .queryAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => DAY_BUTTON.test(t));
  }

  function dishNamesOf(s: AppState, date: string): string {
    const meal = s.meals.find((m) => m.date === date)!;
    return meal.dishIds.map((id) => defaultCatalog.dishById.get(id)!.name).join('／');
  }

  it('nobodyEats・nobodyEatsOn：家で食べる人がいない日だけ（乳児だけが家にいる日も）。献立のない日は false', () => {
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    s = handleUserText(s, defaultCatalog, '金曜はみんな外食').state;
    const fri = s.meals.find((m) => m.date === FRIDAY)!;
    expect(fri.dishIds.length).toBeGreaterThan(0); // 献立は残る（だれかが食べることになったら戻る）
    expect(nobodyEats(s, fri)).toBe(true);
    expect(nobodyEatsOn(s, FRIDAY)).toBe(true);
    expect(nobodyEatsOn(s, MONDAY)).toBe(false);
    expect(nobodyEatsOn(s, '2026-11-14')).toBe(false); // 土曜：献立のない日

    const withBaby = createInitialState(
      { ...DEMO_ONBOARDING, members: [...DEMO_ONBOARDING.members, { nickname: 'あか', ageBand: 'infant', role: 'child', exclusions: [] }] },
      defaultCatalog,
      MONDAY,
    );
    const meal = withBaby.meals[0];
    expect(nobodyEats(withBaby, { ...meal, absentMemberIds: ['member_1', 'member_2', 'member_3', 'member_4'] })).toBe(true);
    expect(nobodyEats(withBaby, { ...meal, absentMemberIds: ['member_1', 'member_2', 'member_3'] })).toBe(false);
  });

  it('visibleActions：みんな外で食べる日の作る・替えるボタンは出さず、ほかの日のボタンやほかのボタンは出す', () => {
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    s = handleUserText(s, defaultCatalog, '今日はみんな外食').state;
    const buttons: ActionButton[] = [
      { label: '作った', action: { type: 'cooked', date: MONDAY } },
      { label: '作らなかった', action: { type: 'not_cooked', date: MONDAY } },
      { label: '別のに', action: { type: 'request_alternatives', date: MONDAY } },
      { label: '案1', action: { type: 'choose_alternative', date: MONDAY, dishIds: ['oyakodon'] } },
      { label: '今日は無理', action: { type: 'today_impossible', date: MONDAY } },
      { label: '買い物リスト', action: { type: 'open_shopping' } },
      { label: '火曜を別のに', action: { type: 'request_alternatives', date: '2026-11-10' } },
    ];
    expect(visibleActions(s, buttons).map((b) => b.label)).toEqual(['買い物リスト', '火曜を別のに']);
    expect(visibleActions(s, undefined)).toEqual([]);
  });

  it('visibleActions：過ぎた日の献立を替えるボタン（別のに・案・今日は無理）は出さず、作った・作らなかったは出す', () => {
    // 有料版で答えずに2日進めると、月曜の配信のボタンが残る
    let s = createInitialState({ ...DEMO_ONBOARDING, plan: 'paid' }, defaultCatalog, MONDAY);
    s = advanceDay(advanceDay(s, defaultCatalog).state, defaultCatalog).state;
    expect(s.today).toBe('2026-11-11');
    const buttons: ActionButton[] = [
      { label: '作った', action: { type: 'cooked', date: MONDAY } },
      { label: '作らなかった', action: { type: 'not_cooked', date: MONDAY } },
      { label: '別のに', action: { type: 'request_alternatives', date: MONDAY } },
      { label: '案1', action: { type: 'choose_alternative', date: MONDAY, dishIds: ['oyakodon'] } },
      { label: '今日は無理', action: { type: 'today_impossible', date: MONDAY } },
      { label: '今日を別のに', action: { type: 'request_alternatives', date: '2026-11-11' } },
    ];
    expect(visibleActions(s, buttons).map((b) => b.label)).toEqual(['作った', '作らなかった', '今日を別のに']);
  });

  it('statusBadgeShown：みんな外で食べる日は状態の印を出さない（エンジンのカードの文・週の行と同じ）', () => {
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    s = handleUserText(s, defaultCatalog, '金曜はみんな外食').state;
    const fri = s.meals.find((m) => m.date === FRIDAY)!;
    expect(statusBadgeShown(s, fri)).toBe(false);
    expect(statusBadgeShown(s, { ...fri, status: 'unconfirmed' })).toBe(false);
    // 記録のあとで家族が変わって夕食なしになった日も、記録の印は出さない（振り返りにも数えない）
    expect(statusBadgeShown(s, { ...fri, status: 'cooked' })).toBe(false);
    expect(statusBadgeShown(s, { ...fri, status: 'skipped' })).toBe(false);
    expect(renderCardText({ ...s, meals: s.meals.map((m) => (m.date === FRIDAY ? { ...m, status: 'cooked' } : m)) }, defaultCatalog, { kind: 'meal', date: FRIDAY }).split('\n')[0]).toBe(
      '11/13(金)の夕食',
    );
    expect(statusBadgeShown(s, s.meals[0])).toBe(true);
    expect(statusBadgeShown(s, { ...s.meals[0], status: 'cooked' })).toBe(true);
  });

  it('MealDetails：「夕食なし（みんな外で食べる）」と、もとの献立だけを出す（料理のない日は、もとの献立も出さない）', () => {
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    s = handleUserText(s, defaultCatalog, '金曜はみんな外食').state;
    const fri = s.meals.find((m) => m.date === FRIDAY)!;
    const { container, rerender } = render(<MealDetails state={s} catalog={defaultCatalog} meal={fri} />);
    expect(container.querySelector('.meal-empty')?.textContent).toBe(NO_DINNER_TEXT);
    expect(container.querySelector('.meal-was')?.textContent).toBe(`もとの献立${dishNamesOf(s, FRIDAY)}`);
    expect(container.textContent).not.toMatch(/人分|分・|はいません|理由|作り方|はじめての料理|新しい料理|注意|メモ/);
    rerender(<MealDetails state={s} catalog={defaultCatalog} meal={{ ...fri, dishIds: [], newDishIds: [] }} />);
    expect(container.textContent).toBe(NO_DINNER_TEXT);
    // 画面の文と、エンジンのカードの文（LINE でも使う）は同じ言い方
    const engineText = renderCardText(s, defaultCatalog, { kind: 'meal', date: FRIDAY });
    expect(engineText).toContain(NO_DINNER_TEXT);
    expect(engineText).toContain(dishNamesOf(s, FRIDAY));
  });

  it('「金曜はみんな外食」：トークのカード・週のカード・今週の献立に「夕食なし」と出し、0人分・作り方・ボタンを出さない', () => {
    render(<App todayFn={todayFn} />);
    sendText('金曜はみんな外食');
    const names = dishNamesOf(saved(), FRIDAY);

    const card = lastBot().querySelector('[data-card="meal"]') as HTMLElement;
    expect(card.textContent).toContain(NO_DINNER_TEXT);
    expect(card.textContent).not.toMatch(/人分|はいません|作り方|はじめての料理/);
    expect(card.querySelector('.meal-was')?.textContent).toBe(`もとの献立${names}`);
    expect(dayButtons(lastBot())).toEqual([]);

    // トークの週のカード：金曜の行は料理の名前の代わりに「夕食なし」
    const weekCard = talkLog().querySelector('[data-card="week"]') as HTMLElement;
    const friRow = [...weekCard.querySelectorAll('.week-row')].find((r) => r.textContent?.includes('11/13')) as HTMLElement;
    expect(friRow.textContent).toContain(NO_DINNER_TEXT);
    expect(friRow.textContent).not.toContain(names.split('／')[0]);

    openMenu('今週の献立');
    const fri = weekDay(FRIDAY);
    expect(fri.textContent).toContain(NO_DINNER_TEXT);
    expect(fri.textContent).not.toMatch(/人分|はいません|作り方|はじめての料理|予定/);
    expect(within(fri).queryAllByRole('button')).toHaveLength(0);
    // ほかの日は今までどおり
    const thu = weekDay('2026-11-12');
    expect(thu.textContent).toContain('4人分（大人換算3.2）');
    expect(dayButtons(thu)).toEqual(['差し替え']);
  });

  it('「今日はみんな外食」：今日のごはんのカードにも、今週の献立の今日にも、作った・別のに・今日は無理・差し替えを出さない', () => {
    render(<App todayFn={todayFn} />);
    sendText('今日はみんな外食');
    openMenu('今日のごはん');
    expect(lastBot().querySelector('[data-card="meal"]')?.textContent).toContain(NO_DINNER_TEXT);
    expect(dayButtons(lastBot())).toEqual([]);

    openMenu('今週の献立');
    const today = weekDay(MONDAY);
    expect(today.textContent).toContain(NO_DINNER_TEXT);
    expect(within(today).getByText('今日')).toBeTruthy();
    expect(dayButtons(today)).toEqual([]);
  });

  it('過ぎた「みんな外食」の日にも、トークと今週の献立に［作った］［作らなかった］を出さない', () => {
    render(<App todayFn={todayFn} />);
    sendText('今日はみんな外食');
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    expect(dayButtons(talkLog())).toEqual([]);

    openMenu('今週の献立');
    const mon = weekDay(MONDAY);
    expect(mon.textContent).toContain(NO_DINNER_TEXT);
    expect(mon.textContent).not.toMatch(/未確認|予定/);
    expect(within(mon).queryAllByRole('button')).toHaveLength(0);
    // 今日（火曜）は今までどおり作れる
    expect(dayButtons(weekDay('2026-11-10'))).toEqual(['作った', '今日は無理', '差し替え']);
  });

  it('振り返りの「記録のあった〇日のうち」は、エンジンの文と同じ数（みんな外で食べる日は、これからの日にも数えない）', () => {
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    s = handleUserText(s, defaultCatalog, '金曜はみんな外食').state;
    s = applyAction(s, defaultCatalog, { type: 'cooked', date: MONDAY }).state;
    s = advanceDay(s, defaultCatalog).state;
    s = advanceDay(s, defaultCatalog).state; // 11/11(水)
    s = applyAction(s, defaultCatalog, { type: 'not_cooked', date: '2026-11-10' }).state;
    const engine = renderCardText(s, defaultCatalog, { kind: 'summary', weekStart: MONDAY });
    const { container } = render(<SummaryBody weekStart={MONDAY} state={s} catalog={defaultCatalog} />);
    const pattern = /(記録のあった)?(\d+)日のうち(\d+)日/;
    const fromEngine = pattern.exec(engine);
    const fromUi = pattern.exec(container.textContent ?? '');
    expect(fromEngine).not.toBeNull();
    expect(fromUi?.slice(1)).toEqual(fromEngine?.slice(1));
  });

  it('「金曜はみんないる」で戻すと、料理・量・［差し替え］が戻る', () => {
    render(<App todayFn={todayFn} />);
    sendText('金曜はみんな外食');
    sendText('金曜はみんないる');
    openMenu('今週の献立');
    const fri = weekDay(FRIDAY);
    expect(fri.textContent).not.toContain(NO_DINNER_TEXT);
    expect(fri.textContent).toContain('4人分（大人換算3.2）');
    expect(dayButtons(fri)).toEqual(['差し替え']);
  });
});

describe('第4段（fix2-ui）：ボタンの日付・時刻・買い物の「のこり」・名前だけの定番・押せる大きさ・乳児の除外', () => {
  it('EXP-7 actionLabels：同じ文字のボタンが2つのメッセージにあれば、今日でない日のボタン（その組のぜんぶ）に日付を付ける', () => {
    const s = advanceDay(createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY), defaultCatalog).state; // 11/10(火)
    const yesterday: ActionButton[] = [
      { label: '作った', action: { type: 'cooked', date: MONDAY } },
      { label: '作らなかった', action: { type: 'not_cooked', date: MONDAY } },
    ];
    const today: ActionButton[] = [
      { label: '作った', action: { type: 'cooked', date: s.today } },
      { label: '別のに', action: { type: 'request_alternatives', date: s.today } },
    ];
    const menuButtons: ActionButton[] = [{ label: '今日のごはん', action: { type: 'open_today' } }];
    expect(actionLabels(s, [yesterday, today, menuButtons, menuButtons])).toEqual([
      ['11/9(月) 作った', '11/9(月) 作らなかった'],
      ['作った', '別のに'],
      ['今日のごはん'],
      ['今日のごはん'],
    ]);
    // 1つのメッセージだけなら、日付は付けない（今までどおり）
    expect(actionLabels(s, [yesterday])).toEqual([['作った', '作らなかった']]);
  });

  it('EXP-19 displayTimes：同じ日の中では、前のメッセージより早い時刻にしない。日が変わったら、そのまま', () => {
    const msg = (id: string, at: string) => ({ id, from: 'bot' as const, text: '', at });
    const times = displayTimes([
      msg('a', '2026-11-09T08:16:00+09:00'),
      msg('b', '2026-11-10T08:17:00+09:00'),
      msg('c', '2026-11-10T17:18:00+09:00'),
      msg('d', '2026-11-10T20:08:00+09:00'),
      msg('e', '2026-11-10T08:19:00+09:00'),
      msg('f', '2026-11-11T08:01:00+09:00'),
    ]);
    expect([...times.values()]).toEqual(['08:16', '08:17', '17:18', '20:08', '20:08', '08:01']);
  });

  it('EXP-16 leftCount：過ぎた買い物日のリストは、これからの献立に使う物だけを「のこり」に数える', () => {
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    s = advanceDay(s, defaultCatalog).state; // 11/10(火)。11/9(月) のリストは過ぎた日
    const past = s.shopping.find((l) => l.date === MONDAY);
    expect(past).toBeDefined();
    const needed = past!.items.filter((i) => !i.checked && i.forDates.some((d) => d >= s.today));
    expect(needed.length).toBeLessThan(past!.items.length);
    expect(leftCount(s, past!)).toBe(needed.length);
    const next = s.shopping.find((l) => l.date > s.today)!;
    expect(leftCount(s, next)).toBe(next.items.filter((i) => !i.checked).length);
  });

  it('EXP-16 買い物リストのタブ：済んだ日の「のこり」は、過ぎた夕食の分を数えない', () => {
    const s = storeDemoAdvanced(1);
    render(<App todayFn={() => s.today} />);
    openMenu('買い物リスト');
    const past = s.shopping.find((l) => l.date === MONDAY)!;
    const tab = screen.getByRole('button', { name: /11\/9\(月\)の買い物/ });
    expect(tab.textContent).toContain(`済んだ日・のこり${leftCount(s, past)}品`);
    fireEvent.click(tab);
    expect(screen.getByText(/済んだ買い物日のリストです/)).toBeTruthy();
  });

  it('EXP-16 トークの買い物のカードも、済んだ日のリストの「のこり」はエンジンの返事（まだチェックしていない物）と同じ数', () => {
    const s = storeDemoAdvanced(1);
    render(<App todayFn={() => s.today} />);
    fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: '買い物リスト' } });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
    const msg = [...talkLog().querySelectorAll('[data-from="bot"]')].find((m) =>
      /まだチェックしていない物があります（\d+品）/.test(m.textContent ?? ''),
    ) as HTMLElement;
    expect(msg).toBeDefined();
    const n = /まだチェックしていない物があります（(\d+)品）/.exec(msg.textContent ?? '')?.[1];
    expect(msg.querySelector('[data-card="shopping"] .card-sub')?.textContent).toBe(`のこり${n}品`);
  });

  it('EXP-17 初回設定：名前だけで加える料理も、名前が除外に当たれば「除外」で加えられない。当たらなければ「要確認」で加えられる', () => {
    const household = { ...createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY).household };
    expect(customDishSafety('ばあばの卵とじうどん', household, defaultCatalog)).toBe('excluded'); // はるとの卵
    expect(customDishSafety('ばあばの煮物', household, defaultCatalog)).toBe('uncertain');

    window.location.hash = '#start';
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'さとみ' } });
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));
    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'めい' } });
    fireEvent.click(screen.getByRole('radio', { name: '幼児（1〜5歳）' }));
    fireEvent.click(screen.getByRole('button', { name: '卵' }));
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    const search = screen.getByLabelText('料理の名前で探す');
    fireEvent.change(search, { target: { value: 'ばあばの卵とじうどん' } });
    const add = screen.getByRole('button', { name: /ばあばの卵とじうどん」を追加/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.textContent).toContain('除外');
    expect(screen.getByText(/名前が家族の除外に当たるので、定番に加えられません/)).toBeTruthy();
    // 当たらない名前は、要確認の印を付けて加えられる。選んだ一覧にも印が出る
    fireEvent.change(search, { target: { value: 'ばあばの煮物' } });
    const add2 = screen.getByRole('button', { name: /ばあばの煮物」を追加/ }) as HTMLButtonElement;
    expect(add2.disabled).toBe(false);
    expect(add2.textContent).toContain('要確認');
    fireEvent.click(add2);
    const picked = document.querySelector('.picked .removable') as HTMLElement;
    expect(picked.textContent).toContain('ばあばの煮物（マスタにない料理）要確認');
  });

  it('EXP-18 重いアレルギーのチェックボックスは、行いっぱいの label の中にある。トークの入力欄も label の中', () => {
    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    fireEvent.click(within(memberCard('はると')).getByRole('button', { name: '直す' }));
    const box = screen.getByLabelText(/卵：重い/) as HTMLInputElement;
    expect(box.closest('label')?.classList.contains('severe-item')).toBe(true);
    fireEvent.click(box.closest('label')!.querySelector('span')!);
    expect(box.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(screen.getByLabelText('きめとくへの書き込み').closest('label')?.classList.contains('composer-field')).toBe(true);
  });

  it('EXP-21 乳児の除外は、献立に使わないと添える（家族のカードと入力欄）', () => {
    const infant: MemberDraft = { nickname: 'ゆい', ageBand: 'infant', role: 'child', exclusions: [{ type: 'allergen', id: 'egg' }] };
    expect(exclusionLine(infant, defaultCatalog)).toBe('除外：卵（1歳未満なので、献立には使いません）');
    expect(exclusionLine({ ...infant, ageBand: 'preschool' }, defaultCatalog)).toBe('除外：卵');
    expect(exclusionLine({ ...infant, exclusions: [] }, defaultCatalog)).toBe('除外なし');

    render(<App todayFn={todayFn} />);
    openMenu('家族と設定');
    fireEvent.click(within(memberCard('ゆい')).getByRole('button', { name: '直す' }));
    fireEvent.click(screen.getByRole('radio', { name: '乳児（1歳未満）' }));
    expect(screen.getByText(/ここで選んだ除外は、献立には使いません/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '卵' }));
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(memberCard('ゆい').querySelector('.member-ex')?.textContent).toBe('除外：卵（1歳未満なので、献立には使いません）');
  });
});
