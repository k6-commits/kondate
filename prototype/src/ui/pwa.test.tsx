// @vitest-environment jsdom
// ホーム画面に置く版（target が 'pwa'）だけの画面：はじめの画面とホーム画面への追加の案内、初回設定のあとの「データを残す」
// の依頼、新しい版の知らせ、AI なし（ルールだけ）の説明、ブラウザ・ページの言い方の置き換え、試用の記録の［LINE などで送る］。
// 'web'（claude.ai の Artifact・開発用）は今までどおり（デモの家族で始まり、知らせも［LINE などで送る］も出さない）。
// src/pwa は vi.mock で差し替える（サービスワーカーやブラウザの判定は、ここでは偽物）。
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AppState } from '../engine';
import { advanceDay, createInitialState, formatTrialReport, trialReport } from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import * as pwaModule from '../pwa';
import { App, SAVE_FAILED_TOAST, SAVE_FAILED_TOAST_PWA } from './App';
import { RULES_ONLY_TEXT } from './ai';
import { STORAGE_KEY, UI_STORAGE_KEY } from './storage';
import { ABOUT_TEXT } from './components/AboutPanel';
import { DATA_TEXT, SHARE_FAILED_TOAST, SHARE_TITLE, TRIAL_NOTE } from './components/HouseholdSheet';
import { UPDATE_TEXT, UPDATING_RESET_MS, UPDATING_TEXT } from './components/UpdateBanner';
import { WELCOME_TEXT, installGuide } from './components/Welcome';

const hoisted = vi.hoisted(() => ({
  /** listenInstallPrompt に渡された onAvailable（ブラウザが「アプリとして入れる」を出せるようになったら呼ぶ）。 */
  onInstallAvailable: null as null | ((install: () => Promise<boolean>) => void),
  /** registerServiceWorker に渡された onUpdateReady。 */
  onUpdateReady: null as null | (() => void),
  stopListening: vi.fn(),
}));

vi.mock('../pwa', () => ({
  APP_TARGET: 'web',
  isStandalone: vi.fn(() => false),
  isIos: vi.fn(() => false),
  isLineInAppBrowser: vi.fn(() => false),
  registerServiceWorker: vi.fn((onUpdateReady: () => void) => {
    hoisted.onUpdateReady = onUpdateReady;
  }),
  applyUpdate: vi.fn(),
  requestPersistentStorage: vi.fn(async () => true),
  listenInstallPrompt: vi.fn((onAvailable: (install: () => Promise<boolean>) => void) => {
    hoisted.onInstallAvailable = onAvailable;
    return hoisted.stopListening;
  }),
}));

const pwa = vi.mocked(pwaModule);

const MON = '2026-11-16';
const TUE = '2026-11-17';
let now = MON;
const todayFn = () => now;

const NAMES = ['ママ', 'パパ', 'はると', 'ゆい'];

function renderPwa() {
  return render(<App target="pwa" todayFn={todayFn} />);
}

function saved(): AppState | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as AppState) : null;
}

function uiPrefs(): Record<string, unknown> {
  return JSON.parse(window.localStorage.getItem(UI_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
}

function family(today: string, days = 0): AppState {
  let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, today);
  for (let i = 0; i < days; i++) s = advanceDay(s, defaultCatalog).state;
  return s;
}

function store(s: AppState, clock?: 'calendar' | 'demo'): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  if (clock) window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ clock }));
}

function welcomeTitle(): HTMLElement | null {
  return screen.queryByRole('heading', { level: 1, name: 'きめとく' });
}

function talkLog(): HTMLElement {
  return screen.getByRole('log', { name: 'トーク' });
}

function menu(): HTMLElement {
  return screen.getByRole('navigation', { name: 'メニュー' });
}

function openSettings(): HTMLElement {
  fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
  return document.querySelector('[data-sheet="household"]') as HTMLElement;
}

/** 知らせ（トースト）の文。ホーム画面に置く版は、新しい版の知らせ（role=status）もあるので、入れ物で見分ける。 */
function toastText(): string {
  return document.querySelector('.toast-region')?.textContent ?? '';
}

function updateRegion(): HTMLElement | null {
  return screen.queryByTestId('update-region');
}

/** 初回設定を確認（⑤）まで進める。 */
function fillOnboarding(): HTMLInputElement {
  fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'あきこ' } });
  fireEvent.click(screen.getByRole('button', { name: 'できた' }));
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: '次へ' }));
  expect(screen.getByRole('heading', { name: 'この内容で始めます' })).toBeTruthy();
  return screen.getByLabelText(/本物の日付で進める（1週間の試用）/) as HTMLInputElement;
}

function send(text: string): void {
  fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '送る' }));
}

/**
 * ブラウザの確認の答え（install の Promise）を、act の中で返して、そのあとの .then と再描画・effect（フォーカスの移動）まで
 * 済ませる（waitFor だと、ボタンが消えたあと effect の前に見てしまうことがある）。
 */
async function settle(answer: () => void): Promise<void> {
  await act(async () => {
    answer();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

/** ブラウザの「戻る」（Android の戻る操作）。ハッシュが変わったら（hashchange）終わる。 */
async function goBack(): Promise<void> {
  await act(async () => {
    const changed = new Promise((resolve) => window.addEventListener('hashchange', resolve, { once: true }));
    window.history.back();
    await changed;
  });
}

function setShare(fn: ((data: ShareData) => Promise<void>) | undefined): void {
  if (fn) Object.defineProperty(window.navigator, 'share', { configurable: true, writable: true, value: fn });
  else Reflect.deleteProperty(window.navigator, 'share');
}

beforeEach(() => {
  now = MON;
  window.localStorage.clear();
  window.location.hash = '';
  delete (window as unknown as { claude?: unknown }).claude;
  hoisted.onInstallAvailable = null;
  hoisted.onUpdateReady = null;
  vi.clearAllMocks();
  pwa.isStandalone.mockReturnValue(false);
  pwa.isIos.mockReturnValue(false);
  pwa.isLineInAppBrowser.mockReturnValue(false);
  pwa.requestPersistentStorage.mockResolvedValue(true);
  setShare(undefined);
});

afterEach(() => {
  setShare(undefined);
  vi.useRealTimers();
});

describe('はじめの画面（ホーム画面に置く版で、まだ何も保存していないとき）', () => {
  it('デモの家族の代わりに、名前・できること・［自分の家族で始める］［デモを見てみる］を出す。選ぶまでは保存しない', () => {
    renderPwa();
    expect(welcomeTitle()).toBeTruthy();
    expect(screen.getByText(WELCOME_TEXT.lead)).toBeTruthy();
    expect(screen.getByRole('button', { name: '自分の家族で始める' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'デモを見てみる' })).toBeTruthy();
    // デモの家族のトークも、［翌日へ進む］も出さない
    expect(screen.queryByRole('log', { name: 'トーク' })).toBeNull();
    expect(screen.queryByRole('button', { name: '翌日へ進む' })).toBeNull();
    // 見出しにフォーカス（読み上げがここから始まる）
    expect(document.activeElement).toBe(welcomeTitle());
    // 裏のデモの家族は保存しない（何も選ばずに閉じたら、次もはじめの画面）
    expect(saved()).toBeNull();
  });

  it('何も選ばずに閉じたら、次に開いたときも、はじめの画面', () => {
    const first = renderPwa();
    first.unmount();
    renderPwa();
    expect(welcomeTitle()).toBeTruthy();
    expect(saved()).toBeNull();
  });

  it('保存した家族があれば、はじめの画面を出さず、ふだんどおりトークから開く', () => {
    store(family(MON), 'calendar');
    renderPwa();
    expect(welcomeTitle()).toBeNull();
    expect(talkLog()).toBeTruthy();
    expect(screen.getByTestId('clock-note')).toBeTruthy();
  });

  it('［自分の家族で始める］→ 初回設定（本物の日付に印）→ 始めると保存し、データを残すよう1回だけ頼む。次に開くとトークから', async () => {
    now = TUE;
    const first = renderPwa();
    fireEvent.click(screen.getByRole('button', { name: '自分の家族で始める' }));
    expect(window.location.hash).toBe('#start');
    const title = screen.getByRole('heading', { name: 'はじめの設定' });
    // 押したボタンは消えるので、見出しへフォーカスを移す
    expect(document.activeElement).toBe(title);
    // はじめの画面から開いたときは、置き換える家族がない：置き換えの注意も、デモの確かめもない
    const box = fillOnboarding();
    expect(box.checked).toBe(true);
    const notes = screen.getByRole('note', { name: '始める前の注意' });
    expect(within(notes).queryByText('今の家族と記録は、この内容で置き換わります。元には戻せません。')).toBeNull();
    expect(pwa.requestPersistentStorage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));

    expect(pwa.requestPersistentStorage).toHaveBeenCalledTimes(1);
    expect(saved()?.household.members.map((m) => m.nickname)).toEqual(['あきこ']);
    expect(saved()?.today).toBe(TUE);
    expect(uiPrefs().clock).toBe('calendar');
    expect(welcomeTitle()).toBeNull();
    expect(talkLog()).toBeTruthy();
    expect(toastText()).toBe('設定しました。献立はトークに届いています。');
    expect(screen.queryByRole('button', { name: '翌日へ進む' })).toBeNull();
    await settle(() => {});

    first.unmount();
    renderPwa();
    expect(welcomeTitle()).toBeNull();
    expect(talkLog()).toBeTruthy();
    expect(pwa.requestPersistentStorage).toHaveBeenCalledTimes(1);
  });

  it('データを残す依頼が断られても・投げても、ふだんどおり始められる', () => {
    pwa.requestPersistentStorage.mockImplementation(() => {
      throw new Error('no storage manager');
    });
    renderPwa();
    fireEvent.click(screen.getByRole('button', { name: '自分の家族で始める' }));
    fillOnboarding();
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(saved()?.household.members.map((m) => m.nickname)).toEqual(['あきこ']);
    expect(talkLog()).toBeTruthy();
  });

  it('初回設定を［やめて戻る］で閉じると、はじめの画面に戻る（何も保存しない。見出しにフォーカス）', () => {
    renderPwa();
    fireEvent.click(screen.getByRole('button', { name: '自分の家族で始める' }));
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'あきこ' } });
    fireEvent.click(screen.getByRole('button', { name: 'やめて戻る' }));
    expect(welcomeTitle()).toBeTruthy();
    expect(document.activeElement).toBe(welcomeTitle());
    expect(screen.getByRole('button', { name: '自分の家族で始める' })).toBeTruthy();
    expect(saved()).toBeNull();
    // ブラウザの「戻る」（ハッシュが #start から外れる）でも、はじめの画面
    fireEvent.click(screen.getByRole('button', { name: '自分の家族で始める' }));
    window.location.hash = '';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(welcomeTitle()).toBeTruthy();
    expect(saved()).toBeNull();
  });

  it('初回設定から出たら（始めた・やめた）、その履歴は置き換える。Android の「戻る」で、空の初回設定に戻らない', async () => {
    renderPwa();
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: '自分の家族で始める' }));
    expect(window.location.hash).toBe('#start');
    // はじめの画面 → 初回設定は、履歴を足す（「戻る」で、はじめの画面に戻れる）
    expect(window.history.length).toBe(before + 1);
    fillOnboarding();
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(window.location.hash).toBe('#talk');
    expect(window.history.length).toBe(before + 1);
    await goBack();
    expect(screen.queryByRole('heading', { name: 'はじめの設定' })).toBeNull();
    expect(talkLog()).toBeTruthy();
    expect(saved()?.household.members.map((m) => m.nickname)).toEqual(['あきこ']);
  });

  it('初回設定を［やめて戻る］で閉じたあとの「戻る」でも、初回設定を開き直さない', async () => {
    renderPwa();
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: '自分の家族で始める' }));
    fireEvent.click(screen.getByRole('button', { name: 'やめて戻る' }));
    expect(welcomeTitle()).toBeTruthy();
    expect(window.history.length).toBe(before + 1);
    await goBack();
    expect(screen.queryByRole('heading', { name: 'はじめの設定' })).toBeNull();
    expect(welcomeTitle()).toBeTruthy();
    expect(saved()).toBeNull();
  });

  it('初回設定の中の［デモの家族で始める］は、確かめずにデモで始める（置き換える家族がない）', () => {
    renderPwa();
    fireEvent.click(screen.getByRole('button', { name: '自分の家族で始める' }));
    fireEvent.click(screen.getByRole('button', { name: 'デモの家族で始める' }));
    expect(screen.queryByRole('button', { name: 'デモで始め直す' })).toBeNull();
    expect(saved()?.household.members.map((m) => m.nickname)).toEqual(NAMES);
    expect(pwa.requestPersistentStorage).not.toHaveBeenCalled();
  });

  it('［デモを見てみる］→ デモの家族（［翌日へ進む］で進める）。保存して、次に開くとデモのトークから', () => {
    now = '2026-11-18';
    const first = renderPwa();
    fireEvent.click(screen.getByRole('button', { name: 'デモを見てみる' }));
    expect(welcomeTitle()).toBeNull();
    expect(screen.getByTestId('demo-today').textContent).toBe('11/16(月)');
    expect(screen.getByRole('button', { name: '翌日へ進む' })).toBeTruthy();
    expect(toastText()).toBe('デモの家族で始めました。');
    expect(saved()?.household.members.map((m) => m.nickname)).toEqual(NAMES);
    expect(uiPrefs().clock).toBe('demo');
    expect(pwa.requestPersistentStorage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    first.unmount();
    renderPwa();
    expect(welcomeTitle()).toBeNull();
    expect(screen.getByTestId('demo-today').textContent).toBe('11/17(火)');
  });

  it('はじめの画面のあいだに、ほかのタブ（同じ端末のブラウザ）で家族を設定したら、その家族で開く', () => {
    renderPwa();
    expect(welcomeTitle()).toBeTruthy();
    store(family(MON), 'calendar');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    });
    expect(welcomeTitle()).toBeNull();
    expect(talkLog()).toBeTruthy();
  });

  it('家族を保存するときは、日付の進め方（画面の覚え書き）を先に書く（ほかの窓が記録を読み直したときに、古い進め方を読まない）', () => {
    // ほかの窓（Android のホーム画面のアプリと、Chrome のタブ）は、記録が書き換わった知らせ（storage）を受けて、そのとき
    // 保存されている日付の進め方を読む。記録より後に書くと、はじめの画面の窓は古い「デモ」を読んで書き戻し、本物の日付の
    // 試用が、次に開いたときに［翌日へ進む］のデモになってしまう。
    renderPwa();
    fireEvent.click(screen.getByRole('button', { name: '自分の家族で始める' }));
    const calendar = fillOnboarding();
    expect(calendar.checked).toBe(true);
    const clockWhenSaved: unknown[] = [];
    const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === STORAGE_KEY) clockWhenSaved.push(uiPrefs().clock);
      original.call(this, key, value);
    });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    } finally {
      spy.mockRestore();
    }
    expect(clockWhenSaved.length).toBeGreaterThan(0);
    expect(clockWhenSaved[0]).toBe('calendar');
    expect(uiPrefs().clock).toBe('calendar');
  });

  it('はじめの画面のあいだに、ほかの窓が本物の日付で家族を設定したら、本物の日付の進め方で開き、デモを書き戻さない', () => {
    renderPwa();
    // ほかの窓の書き方（日付の進め方が先、記録が後）。記録の知らせを受けたときには、進め方はもう書いてある。
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ clock: 'calendar' }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(family(MON)));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    });
    expect(welcomeTitle()).toBeNull();
    expect(screen.getByTestId('clock-note').textContent).toBe('本物の日付で進めています（試用）');
    expect(uiPrefs().clock).toBe('calendar');
  });
});

describe('ホーム画面への追加の案内（はじめの画面）', () => {
  function guideText(): string {
    return document.querySelector('.welcome')?.textContent ?? '';
  }

  it('installGuide：ホーム画面から開いていれば出さない。LINE → iPhone → 追加した → 確認が出せる → それ以外の順', () => {
    const base = { standalone: false, line: false, ios: false, canPrompt: false, installed: false };
    expect(installGuide({ ...base, standalone: true, line: true, ios: true, canPrompt: true })).toBe('none');
    expect(installGuide({ ...base, line: true, ios: true })).toBe('line');
    expect(installGuide({ ...base, ios: true, canPrompt: true })).toBe('ios');
    expect(installGuide({ ...base, installed: true, canPrompt: true })).toBe('installed');
    expect(installGuide({ ...base, canPrompt: true })).toBe('prompt');
    expect(installGuide(base)).toBe('hint');
  });

  it('LINE の中：ホーム画面に追加できないので、Safari か Chrome で開き直すよう案内する。自分の家族では始めず、デモは見られる', () => {
    pwa.isLineInAppBrowser.mockReturnValue(true);
    pwa.isIos.mockReturnValue(true);
    renderPwa();
    const guide = screen.getByRole('region', { name: WELCOME_TEXT.lineTitle });
    expect(within(guide).getByText(WELCOME_TEXT.lineBody)).toBeTruthy();
    expect(within(guide).getByText(WELCOME_TEXT.lineNote)).toBeTruthy();
    // iPhone の LINE でも、LINE の案内だけ
    expect(guideText()).not.toContain(WELCOME_TEXT.iosTitle);
    expect(screen.queryByRole('button', { name: '自分の家族で始める' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'デモを見てみる' }));
    expect(saved()?.household.members.map((m) => m.nickname)).toEqual(NAMES);
  });

  it('iPhone・iPad（Safari・Chrome など）：先にホーム画面に追加して、そのアイコンから始めるよう案内する（記録が別になる）。このまま始めることもできる', () => {
    pwa.isIos.mockReturnValue(true);
    renderPwa();
    const guide = screen.getByRole('region', { name: WELCOME_TEXT.iosTitle });
    const steps = within(guide).getAllByRole('listitem').map((li) => li.textContent);
    expect(steps).toEqual([WELCOME_TEXT.iosStep1, WELCOME_TEXT.iosStep2]);
    expect(steps[0]).toContain('［共有］');
    expect(steps[0]).toContain('［ホーム画面に追加］');
    expect(within(guide).getByText(WELCOME_TEXT.iosNote)).toBeTruthy();
    expect(screen.getByText(WELCOME_TEXT.iosAnyway)).toBeTruthy();
    // iPhone のブラウザは Safari とは限らない（Chrome などでも［共有］から追加できる）。どのブラウザでも合う言い方にする：
    // ［共有］の場所は、Safari では画面の下の［…］の中、Chrome ではアドレスバーの右のことがある。
    expect(steps[0]).toContain('画面の下の［…］');
    expect(steps[0]).toContain('アドレスバーの右');
    expect(guideText()).not.toMatch(/Safari の［共有］|Safari で設定した|このまま Safari で/);
    expect(guideText()).toContain('このままブラウザで始めることもできます');
    // 案内は始めるボタンより前
    const start = screen.getByRole('button', { name: '自分の家族で始める' });
    expect(guide.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加する' })).toBeNull();
    fireEvent.click(start);
    expect(screen.getByRole('heading', { name: 'はじめの設定' })).toBeTruthy();
  });

  it('Android の Chrome：確認が出せるようになったら［ホーム画面に追加する］。追加したら、そう伝えて、ボタンを消す', async () => {
    renderPwa();
    expect(pwa.listenInstallPrompt).toHaveBeenCalledTimes(1);
    // 確認が出せるまでは、メニューからの追加を1行で案内する
    expect(screen.getByTestId('install-hint').textContent).toBe(WELCOME_TEXT.hint);
    let answer: (ok: boolean) => void = () => {};
    const install = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
    act(() => hoisted.onInstallAvailable?.(install));
    expect(screen.queryByTestId('install-hint')).toBeNull();
    const guide = screen.getByRole('region', { name: WELCOME_TEXT.promptTitle });
    const button = within(guide).getByRole('button', { name: 'ホーム画面に追加する' }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(install).toHaveBeenCalledTimes(1);
    // 確認を出しているあいだは、もう一度押せない
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(install).toHaveBeenCalledTimes(1);
    await settle(() => answer(true));
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加する' })).toBeNull();
    const result = screen.getByTestId('install-hint');
    expect(result.textContent).toBe(WELCOME_TEXT.installed);
    expect(document.activeElement).toBe(result);
    // 始めるボタンはそのまま
    expect(screen.getByRole('button', { name: '自分の家族で始める' })).toBeTruthy();
  });

  it('Android の Chrome：確認で断ったら、ボタンを消して、メニューからの追加を案内する。また出せるようになれば、ボタンを出す', async () => {
    renderPwa();
    let answer: (ok: boolean) => void = () => {};
    const install = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
    act(() => hoisted.onInstallAvailable?.(install));
    fireEvent.click(screen.getByRole('button', { name: 'ホーム画面に追加する' }));
    await settle(() => answer(false));
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加する' })).toBeNull();
    expect(screen.getByTestId('install-hint').textContent).toBe(WELCOME_TEXT.hint);
    expect(document.activeElement).toBe(screen.getByTestId('install-hint'));
    // 確認が失敗しても（投げても）同じ
    let fail: (e: unknown) => void = () => {};
    const broken = vi.fn(() => new Promise<boolean>((_, reject) => (fail = reject)));
    act(() => hoisted.onInstallAvailable?.(broken));
    fireEvent.click(screen.getByRole('button', { name: 'ホーム画面に追加する' }));
    expect(screen.queryByTestId('install-hint')).toBeNull();
    await settle(() => fail(new Error('prompt failed')));
    expect(screen.getByTestId('install-hint').textContent).toBe(WELCOME_TEXT.hint);
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it('ホーム画面から開いているときは、案内を出さない（iPhone でも）', () => {
    pwa.isStandalone.mockReturnValue(true);
    pwa.isIos.mockReturnValue(true);
    renderPwa();
    act(() => hoisted.onInstallAvailable?.(vi.fn(async () => true)));
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByTestId('install-hint')).toBeNull();
    expect(guideText()).not.toContain('ホーム画面に追加');
    expect(screen.getByRole('button', { name: '自分の家族で始める' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'デモを見てみる' })).toBeTruthy();
  });

  it('判定が投げても、はじめの画面は壊れない（案内はメニューの1行）', () => {
    pwa.isIos.mockImplementation(() => {
      throw new Error('no navigator');
    });
    pwa.isStandalone.mockImplementation(() => {
      throw new Error('no matchMedia');
    });
    renderPwa();
    expect(welcomeTitle()).toBeTruthy();
    expect(screen.getByTestId('install-hint').textContent).toBe(WELCOME_TEXT.hint);
    expect(screen.getByRole('button', { name: '自分の家族で始める' })).toBeTruthy();
  });

  it('はじめの画面を閉じたら、追加の確認を聞くのをやめる（アンマウント）', () => {
    const r = renderPwa();
    r.unmount();
    expect(hoisted.stopListening).toHaveBeenCalled();
  });
});

describe('新しい版の知らせ', () => {
  it('開いたときにサービスワーカーを1回だけ登録し、新しい版があれば知らせる。［更新する］で切り替える（自分では読み直さない）', () => {
    store(family(MON), 'calendar');
    renderPwa();
    expect(pwa.registerServiceWorker).toHaveBeenCalledTimes(1);
    const region = updateRegion();
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.textContent).toBe('');
    act(() => hoisted.onUpdateReady?.());
    expect(region?.textContent).toContain(UPDATE_TEXT);
    expect(pwa.applyUpdate).not.toHaveBeenCalled();
    // 操作を止めない（トークはそのまま使える）
    send('今日は無理');
    expect(within(talkLog()).getByText(/今日はラクしましょう/)).toBeTruthy();
    fireEvent.click(within(region as HTMLElement).getByRole('button', { name: '更新する' }));
    expect(pwa.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('［あとで］で隠す。次に開くまで、また知らせが来ても出さない', () => {
    store(family(MON), 'calendar');
    const first = renderPwa();
    act(() => hoisted.onUpdateReady?.());
    fireEvent.click(screen.getByRole('button', { name: 'あとで' }));
    expect(updateRegion()?.textContent).toBe('');
    expect(screen.queryByRole('button', { name: '更新する' })).toBeNull();
    act(() => hoisted.onUpdateReady?.());
    expect(updateRegion()?.textContent).toBe('');
    expect(pwa.applyUpdate).not.toHaveBeenCalled();
    // 次に開いたとき（新しく登録して、知らせが来たら）は出す
    first.unmount();
    renderPwa();
    act(() => hoisted.onUpdateReady?.());
    expect(updateRegion()?.textContent).toContain(UPDATE_TEXT);
  });

  it('はじめの画面の上にも出す', () => {
    renderPwa();
    act(() => hoisted.onUpdateReady?.());
    expect(welcomeTitle()).toBeTruthy();
    expect(updateRegion()?.textContent).toContain(UPDATE_TEXT);
  });

  it('［更新する］を押したら「更新しています…」にして、重ねて押せない（［あとで］も出さない）。読み直さないまま時間がたったら戻す', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    store(family(MON), 'calendar');
    renderPwa();
    act(() => hoisted.onUpdateReady?.());
    const region = updateRegion() as HTMLElement;
    const update = within(region).getByRole('button', { name: '更新する' });
    update.focus();
    fireEvent.click(update);
    expect(pwa.applyUpdate).toHaveBeenCalledTimes(1);
    // さらに新しい版を入れている途中なら、切り替えまで数秒かかる。押したことが分かるようにし、もう一度押しても頼まない。
    const busy = within(region).getByRole('button', { name: UPDATING_TEXT });
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    // disabled にしないので、キーボードで押したときのフォーカスは外れない
    expect(document.activeElement).toBe(busy);
    expect(within(region).queryByRole('button', { name: 'あとで' })).toBeNull();
    expect(region.textContent).toContain(UPDATE_TEXT);
    fireEvent.click(busy);
    expect(pwa.applyUpdate).toHaveBeenCalledTimes(1);
    // ふつうはその前に読み直す。読み直さないまま時間がたったら、元に戻す（もう一度押せる・［あとで］も出す）
    act(() => {
      vi.advanceTimersByTime(UPDATING_RESET_MS - 1);
    });
    expect(within(region).getByRole('button', { name: UPDATING_TEXT })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    fireEvent.click(within(region).getByRole('button', { name: '更新する' }));
    expect(pwa.applyUpdate).toHaveBeenCalledTimes(2);
  });

  it('初回設定のあいだは出さない（読み直すと、入力の途中の内容が消える）。やめても・始めても、閉じたら出す', () => {
    // はじめの画面から
    const first = renderPwa();
    fireEvent.click(screen.getByRole('button', { name: '自分の家族で始める' }));
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'あきこ' } });
    act(() => hoisted.onUpdateReady?.());
    expect(updateRegion()?.textContent).toBe('');
    expect(screen.queryByRole('button', { name: '更新する' })).toBeNull();
    expect((screen.getByLabelText('ニックネーム') as HTMLInputElement).value).toBe('あきこ');
    fireEvent.click(screen.getByRole('button', { name: 'やめて戻る' }));
    expect(welcomeTitle()).toBeTruthy();
    expect(updateRegion()?.textContent).toContain(UPDATE_TEXT);
    first.unmount();

    // 家族のいるときの［はじめから設定する］から：知らせは隠れ、始めたら（トークに戻ったら）また出す
    store(family(MON), 'calendar');
    renderPwa();
    act(() => hoisted.onUpdateReady?.());
    expect(updateRegion()?.textContent).toContain(UPDATE_TEXT);
    const sheet = openSettings();
    fireEvent.click(within(sheet).getByRole('button', { name: 'はじめから設定する' }));
    expect(screen.getByRole('heading', { name: 'はじめの設定' })).toBeTruthy();
    expect(updateRegion()?.textContent).toBe('');
    fillOnboarding();
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(talkLog()).toBeTruthy();
    expect(updateRegion()?.textContent).toContain(UPDATE_TEXT);
    expect(pwa.applyUpdate).not.toHaveBeenCalled();
  });

  /** ［あとで］をキーボードで押す（押したボタンにフォーカスがある）。 */
  function pressLater(): void {
    const later = screen.getByRole('button', { name: 'あとで' });
    later.focus();
    fireEvent.click(later);
  }

  it('［あとで］で消えたボタンのフォーカスは BODY に落とさず、トークでは上の帯の最初のボタンへ移す', () => {
    store(family(MON), 'calendar');
    renderPwa();
    act(() => hoisted.onUpdateReady?.());
    pressLater();
    expect(document.activeElement).not.toBe(document.body);
    const bar = screen.getByRole('region', { name: '日付とプラン' });
    expect(document.activeElement).toBe(within(bar).getAllByRole('button')[0]);
  });

  it('［あとで］：はじめの画面では見出しへ、シートを開いているときはシートの見出しへ移す', () => {
    const first = renderPwa();
    act(() => hoisted.onUpdateReady?.());
    pressLater();
    expect(document.activeElement).toBe(welcomeTitle());
    first.unmount();
    store(family(MON), 'calendar');
    renderPwa();
    const sheet = openSettings();
    act(() => hoisted.onUpdateReady?.());
    pressLater();
    expect(document.activeElement).toBe(within(sheet).getByRole('heading', { name: '家族と設定' }));
  });

  it('［あとで］を押してもフォーカスがほかの所にあれば（押してもフォーカスが移らない端末）、動かさない', () => {
    store(family(MON), 'calendar');
    renderPwa();
    act(() => hoisted.onUpdateReady?.());
    const input = screen.getByLabelText('きめとくへの書き込み');
    input.focus();
    fireEvent.click(screen.getByRole('button', { name: 'あとで' }));
    expect(document.activeElement).toBe(input);
  });

  it('登録に失敗しても（投げても）、画面はふだんどおり', () => {
    pwa.registerServiceWorker.mockImplementationOnce(() => {
      throw new Error('no service worker');
    });
    renderPwa();
    expect(welcomeTitle()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'デモを見てみる' }));
    expect(talkLog()).toBeTruthy();
  });
});

describe('AI の読み取り（ホーム画面に置く版は AI を使わない）', () => {
  it('家族と設定：ルールだけで読むと書き、選べない設定（おまかせ・いつも AI・使わない）と名前の置き換えの説明は出さない', () => {
    store(family(MON), 'calendar');
    renderPwa();
    const sheet = openSettings();
    const block = document.getElementById('ai-title')?.closest('section') as HTMLElement;
    expect(within(block).getByTestId('ai-status').textContent).toBe(RULES_ONLY_TEXT);
    expect(within(block).queryAllByRole('radio')).toHaveLength(0);
    expect(within(sheet).queryByLabelText(/おまかせ/)).toBeNull();
    expect(within(sheet).queryByLabelText(/いつも AI/)).toBeNull();
    expect(block.textContent).not.toContain('member_1');
    expect(sheet.textContent).not.toContain('確かめています');
  });

  it('案内（このプロトタイプについて）も、ルールだけで読むと書く（使えるかの様子・Claude の話は出さない）', () => {
    store(family(MON), 'calendar');
    renderPwa();
    const about = document.querySelector('.about-col') as HTMLElement;
    expect(within(about).getByTestId('about-ai-mode').textContent).toBe(RULES_ONLY_TEXT);
    expect(about.querySelector('.about-status')).toBeNull();
    expect(about.textContent).not.toContain('Claude');
    expect(about.textContent).not.toContain('claude.ai');
    expect(about.textContent).not.toContain('確かめています');
  });

  it('書き込みはルールで読む。claude.ai の Claude があっても使わない', async () => {
    const json = vi.fn(async () => ({ commands: [{ type: 'show_week' }] }));
    const use = vi.fn(async () => Object.assign(vi.fn(), { json }));
    (window as unknown as { claude?: unknown }).claude = { use };
    store(family(MON), 'calendar');
    renderPwa();
    await settle(() => {});
    send('ほげほげ');
    send('今日は無理');
    expect(within(talkLog()).getByText(/今日はラクしましょう/)).toBeTruthy();
    expect(within(talkLog()).getAllByText('ルールで読み取り').length).toBe(2);
    expect(within(talkLog()).queryByText('AIで読み取り')).toBeNull();
    expect(screen.queryByText('読み取り中…')).toBeNull();
    expect(use).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});

describe('ブラウザ・ページの言い方（ホーム画面に置く版は、この端末・このアプリ）', () => {
  it('案内：「ブラウザだけで再現」「このブラウザの中だけに保存」を、この端末・このアプリの言い方にする', () => {
    store(family(MON), 'calendar');
    renderPwa();
    const about = document.querySelector('.about-col') as HTMLElement;
    expect(within(about).getByText(ABOUT_TEXT.scope.pwa)).toBeTruthy();
    expect(within(about).getByText(ABOUT_TEXT.storageCalendar.pwa)).toBeTruthy();
    expect(about.textContent).not.toContain('ブラウザ');
  });

  it('案内：［翌日へ進む］で進めるデモでも、この端末・このアプリに保存すると書く', () => {
    store(family(MON), 'demo');
    renderPwa();
    const about = document.querySelector('.about-col') as HTMLElement;
    expect(within(about).getByText(ABOUT_TEXT.storageDemo.pwa)).toBeTruthy();
  });

  it('家族と設定のデータの欄：この端末のこのアプリの中だけに保存していると書く', () => {
    store(family(MON), 'calendar');
    renderPwa();
    openSettings();
    const data = document.getElementById('data-title')?.closest('section') as HTMLElement;
    const notes = [...data.querySelectorAll(':scope > .field-note')].map((e) => e.textContent);
    expect(notes).toEqual([DATA_TEXT.stored.pwa]);
  });

  it('保存できないとき：知らせとデータの欄も、アプリを閉じると消えると書く', () => {
    store(family(MON), 'calendar');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      renderPwa();
      expect(toastText()).toBe(SAVE_FAILED_TOAST_PWA);
      expect(toastText()).not.toBe(SAVE_FAILED_TOAST);
      openSettings();
      const data = document.getElementById('data-title')?.closest('section') as HTMLElement;
      expect([...data.querySelectorAll(':scope > .field-note')].map((e) => e.textContent)).toEqual([DATA_TEXT.saveFailed.pwa]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('表示に失敗したときの画面：保存を消すと、はじめの画面から始め直せる（デモの家族ではない）', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      store(family(MON), 'calendar');
      let broken = true;
      render(
        <App
          target="pwa"
          todayFn={() => {
            if (broken) throw new Error('boom');
            return MON;
          }}
        />,
      );
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('保存されていた状態を読み込めなかったようです。はじめの画面から始め直せます。');
      broken = false;
      fireEvent.click(within(alert).getByRole('button', { name: 'はじめの画面に戻る' }));
      expect(welcomeTitle()).toBeTruthy();
      expect(saved()).toBeNull();
    } finally {
      quiet.mockRestore();
    }
  });

  it('リセットは、はじめの画面に戻る（そう書いて確かめる）。選ぶまでは保存しない', () => {
    store(family(MON, 2), 'calendar');
    renderPwa();
    openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
    expect(screen.getByRole('group', { name: 'リセットの確認' }).textContent).toContain(DATA_TEXT.reset.pwa);
    fireEvent.click(screen.getByRole('button', { name: '本当にリセットする' }));
    expect(welcomeTitle()).toBeTruthy();
    expect(saved()).toBeNull();
    expect(uiPrefs()).toMatchObject({ aiMode: 'auto', menuOpen: true, clock: 'demo', aboutSeen: false });
    fireEvent.click(screen.getByRole('button', { name: 'デモを見てみる' }));
    expect(saved()?.today).toBe(MON);
    expect(screen.getByRole('button', { name: '翌日へ進む' })).toBeTruthy();
  });
});

describe('試用の記録の［LINE などで送る］', () => {
  function storeTrial(): void {
    store(family(MON, 3), 'calendar');
    now = '2026-11-19';
  }

  function trialGroup(): HTMLElement {
    openSettings();
    return screen.getByRole('group', { name: '試用の記録' });
  }

  const area = (g: HTMLElement) => within(g).getByLabelText('試用の記録（送る文）') as HTMLTextAreaElement;

  it('共有の画面で、題と記録の文を送る（［コピー］も残す）。送れたら何も出さない', async () => {
    const share = vi.fn(async () => undefined);
    setShare(share);
    storeTrial();
    renderPwa();
    const g = trialGroup();
    expect(within(g).getByText(TRIAL_NOTE.share)).toBeTruthy();
    expect(within(g).getByRole('button', { name: 'コピー' })).toBeTruthy();
    fireEvent.click(within(g).getByRole('button', { name: 'LINE などで送る' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ title: SHARE_TITLE, text: area(g).value });
    expect(SHARE_TITLE).toBe('きめとく 試用の記録');
    expect(area(g).value).toBe(formatTrialReport(trialReport(saved() as AppState, defaultCatalog, { includeTexts: false, clock: 'calendar' })));
    await settle(() => {});
    expect(toastText()).toBe('');
  });

  it('共有の画面を閉じただけ（AbortError）なら、何も出さない', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('Share canceled', 'AbortError');
    });
    setShare(share);
    storeTrial();
    renderPwa();
    fireEvent.click(within(trialGroup()).getByRole('button', { name: 'LINE などで送る' }));
    await settle(() => {});
    expect(share).toHaveBeenCalledTimes(1);
    expect(toastText()).toBe('');
  });

  it('ほかのわけで送れなかったら、［コピー］を使うよう知らせる', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    });
    setShare(share);
    storeTrial();
    renderPwa();
    const g = trialGroup();
    fireEvent.click(within(g).getByRole('button', { name: 'LINE などで送る' }));
    await waitFor(() => expect(toastText()).toBe(SHARE_FAILED_TOAST));
    expect(SHARE_FAILED_TOAST).toContain('［コピー］');
    // ［コピー］はそのまま使える
    expect(within(g).getByRole('button', { name: 'コピー' })).toBeTruthy();
  });

  it('共有の画面がその場で投げても、［コピー］を使うよう知らせる', () => {
    setShare(
      vi.fn(() => {
        throw new TypeError('bad data');
      }),
    );
    storeTrial();
    renderPwa();
    fireEvent.click(within(trialGroup()).getByRole('button', { name: 'LINE などで送る' }));
    expect(toastText()).toBe(SHARE_FAILED_TOAST);
  });

  it('共有の画面がない端末では出さない（［コピー］だけ。説明も今までどおり）', () => {
    storeTrial();
    renderPwa();
    const g = trialGroup();
    expect(within(g).queryByRole('button', { name: 'LINE などで送る' })).toBeNull();
    expect(within(g).getByRole('button', { name: 'コピー' })).toBeTruthy();
    expect(within(g).getByText(TRIAL_NOTE.copy)).toBeTruthy();
  });
});

describe("'web'（claude.ai の Artifact・開発用）は今までどおり", () => {
  it('既定（APP_TARGET）：保存がなければデモの家族で始まり、はじめの画面・新しい版の知らせ・PWA の呼び出しはない', () => {
    render(<App todayFn={todayFn} />);
    expect(welcomeTitle()).toBeNull();
    expect(screen.getByTestId('demo-today').textContent).toBe('11/16(月)');
    expect(within(talkLog()).getByText(/はじめまして。きめとくです。/)).toBeTruthy();
    expect(saved()?.household.members.map((m) => m.nickname)).toEqual(NAMES);
    expect(updateRegion()).toBeNull();
    // 知らせ（role=status）はトーストの1つだけ
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(pwa.registerServiceWorker).not.toHaveBeenCalled();
    expect(pwa.listenInstallPrompt).not.toHaveBeenCalled();
    expect(pwa.isStandalone).not.toHaveBeenCalled();
    expect(pwa.isIos).not.toHaveBeenCalled();
    expect(pwa.isLineInAppBrowser).not.toHaveBeenCalled();
  });

  it("target='web'：初回設定を終えても、データを残す依頼はしない。AI の設定・ブラウザの言い方は今までどおり", () => {
    window.location.hash = '#start';
    render(<App target="web" todayFn={todayFn} />);
    fillOnboarding();
    expect(screen.getByRole('note', { name: '始める前の注意' }).textContent).toContain('今の家族と記録は、この内容で置き換わります。元には戻せません。');
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(pwa.requestPersistentStorage).not.toHaveBeenCalled();
    const about = document.querySelector('.about-col') as HTMLElement;
    expect(within(about).getByText(ABOUT_TEXT.scope.web)).toBeTruthy();
    expect(within(about).getByText(ABOUT_TEXT.storageCalendar.web)).toBeTruthy();
    openSettings();
    expect(screen.getByLabelText(/おまかせ/)).toBeTruthy();
    expect(screen.getByLabelText(/いつも AI/)).toBeTruthy();
    const data = document.getElementById('data-title')?.closest('section') as HTMLElement;
    expect([...data.querySelectorAll(':scope > .field-note')].map((e) => e.textContent)).toEqual([DATA_TEXT.stored.web]);
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
    expect(screen.getByRole('group', { name: 'リセットの確認' }).textContent).toContain(DATA_TEXT.reset.web);
  });

  it("target='web'：初回設定から出るときの履歴は今までどおり（置き換えずに足す）", () => {
    render(<App target="web" todayFn={todayFn} />);
    const sheet = openSettings();
    const before = window.history.length;
    fireEvent.click(within(sheet).getByRole('button', { name: 'はじめから設定する' }));
    fillOnboarding();
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(window.location.hash).toBe('#talk');
    expect(window.history.length).toBe(before + 2);
  });

  it('共有の画面がある端末でも、［LINE などで送る］は出さない（［コピー］だけ）', () => {
    setShare(vi.fn(async () => undefined));
    store(family(MON, 3), 'calendar');
    now = '2026-11-19';
    render(<App target="web" todayFn={todayFn} />);
    openSettings();
    const g = screen.getByRole('group', { name: '試用の記録' });
    expect(within(g).queryByRole('button', { name: 'LINE などで送る' })).toBeNull();
    expect(within(g).getByText(TRIAL_NOTE.copy)).toBeTruthy();
    // ［コピー］は今までどおり、まとめの入れ物に入れない
    expect(within(g).getByRole('button', { name: 'コピー' }).parentElement).toBe(g);
  });

  it('表示に失敗したときの画面は、今までどおりデモの家族で始め直す', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let broken = true;
      render(
        <App
          target="web"
          todayFn={() => {
            if (broken) throw new Error('boom');
            return MON;
          }}
        />,
      );
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('保存されていた状態を読み込めなかったようです。デモの家族で始め直せます。');
      broken = false;
      fireEvent.click(within(alert).getByRole('button', { name: 'デモの家族で始め直す' }));
      expect(screen.getByTestId('demo-today').textContent).toBe('11/16(月)');
    } finally {
      quiet.mockRestore();
    }
  });

  it('リセットは今までどおりデモの家族で始め直す', () => {
    store(family(MON, 2), 'calendar');
    render(<App target="web" todayFn={todayFn} />);
    openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
    fireEvent.click(screen.getByRole('button', { name: '本当にリセットする' }));
    expect(welcomeTitle()).toBeNull();
    expect(saved()?.today).toBe(MON);
    expect(toastText()).toBe('リセットしました。デモの家族で始めています。');
  });
});
