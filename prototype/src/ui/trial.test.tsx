// @vitest-environment jsdom
// 1週間の試用のための画面：本物の日付で進める（試用モード）、初回設定と家族と設定の「日付の進め方」、試用の記録、
// トークの週末の質問のボタン、振り返りの「自分で考えた日（週末の質問）」。
// 週末の質問は、エンジンが advanceDay で出す本物の質問（金曜の翌日の土曜）と、範囲の外の答えに出し直す質問で確かめる。
// 答え（state.checkins）だけは、作った状態でも確かめる。
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AppState, ChatMessage, WeeklyCheckin } from '../engine';
import { advanceDay, applyAction, createInitialState, formatTrialReport, handleUserText, renderCardText, trialReport } from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import { App } from './App';
import { STORAGE_KEY, UI_STORAGE_KEY, readUiPrefs } from './storage';
import { MAX_CATCH_UP_DAYS, catchUpText, catchUpTo, clockAheadText, planToast } from './lib';
import { actionLabels, shownActions, visibleActions } from './components/Talk';
import { SummaryBody } from './components/ChatCard';

const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const THU = '2026-11-19';
const FRI = '2026-11-20';
const SAT = '2026-11-21';
const NEXT_MON = '2026-11-23';

/** 日本時間の今日（テストで動かす）。 */
let now = MON;
const todayFn = () => now;

const NAMES = ['ママ', 'パパ', 'はると', 'ゆい'];

function saved(): AppState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('state is not saved');
  return JSON.parse(raw) as AppState;
}

function uiPrefs(): Record<string, unknown> {
  return JSON.parse(window.localStorage.getItem(UI_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
}

/** デモの家族の内容で today から始めた状態を days 日進める（家族の内容がデモと同じなだけで、日付の進め方とは関係ない）。 */
function family(today: string, days = 0): AppState {
  let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, today);
  for (let i = 0; i < days; i++) s = advanceDay(s, defaultCatalog).state;
  return s;
}

function store(s: AppState, clock?: 'calendar' | 'demo'): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  if (clock) window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ clock }));
}

/** 前日の確認（「昨日の…は作りましたか？」）を聞いた日。advanceDay 1回につき1つ。 */
function askedDates(s: AppState): string[] {
  return s.chat.filter((m) => m.from === 'bot' && /は作りましたか？/.test(m.text)).map((m) => (m.card?.kind === 'meal' ? m.card.date : '?'));
}

function toastText(): string {
  return screen.queryByRole('status')?.textContent ?? '';
}

function becomeVisible(): void {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
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

function advanceButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: '翌日へ進む' });
}

function send(text: string): void {
  fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '送る' }));
}

/** いちばん新しい週末の質問（［0日］…のボタンのある bot のメッセージ）。 */
function latestQuestion(s: AppState): ChatMessage {
  const q = [...s.chat].reverse().find((m) => m.from === 'bot' && m.actions?.some((a) => a.action.type === 'weekly_checkin'));
  if (!q) throw new Error('no weekly question');
  return q;
}

/** 範囲の外の答え（［9日］）：エンジンは記録せずに「0日から5日までで答えてください。」と［0日］…を出し直す（同じ週の2つ目の質問）。 */
function askAgain(s: AppState, weekStart: string): AppState {
  return applyAction(s, defaultCatalog, { type: 'weekly_checkin', weekStart, thoughtDays: 9 }).state;
}

function checkin(weekStart: string, thoughtDays: number, plannedDays = 5): WeeklyCheckin {
  return { weekStart, plannedDays, thoughtDays, answeredOn: SAT };
}

type JsonFn = (input: string, options?: { modelTier?: string }) => Promise<unknown>;

function mockClaude(json: JsonFn) {
  const jsonMock = vi.fn(json);
  const sample = Object.assign(vi.fn(), { json: jsonMock });
  const use = vi.fn(async (name: string) => (name === 'sample' ? sample : null));
  (window as unknown as { claude?: unknown }).claude = { use };
  return { json: jsonMock };
}

beforeEach(() => {
  now = MON;
  window.localStorage.clear();
  window.location.hash = '';
  delete (window as unknown as { claude?: unknown }).claude;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as unknown as { claude?: unknown }).claude;
  Reflect.deleteProperty(window.navigator, 'clipboard');
});

describe('lib：本物の日付に追いつく', () => {
  it('catchUpTo：記録の日付から本物の今日まで1日ずつ進める（月曜→木曜で3回）。同じ日・先の日なら何もしない', () => {
    const r = catchUpTo(family(MON), defaultCatalog, THU);
    expect(r?.days).toBe(3);
    expect(r?.state.today).toBe(THU);
    expect(askedDates(r!.state)).toEqual([MON, TUE, WED]);
    expect(catchUpTo(family(MON), defaultCatalog, MON)).toBeNull();
    // 戻さない
    expect(catchUpTo(family(MON, 4), defaultCatalog, WED)).toBeNull();
    expect(catchUpTo(family(MON), defaultCatalog, 'not-a-date')).toBeNull();
  });

  it('catchUpTo：1回で進めるのは最大 MAX_CATCH_UP_DAYS 日（残りは次の機会に）', () => {
    expect(MAX_CATCH_UP_DAYS).toBe(31);
    const r = catchUpTo(family(MON), defaultCatalog, '2027-01-31');
    expect(r?.days).toBe(31);
    expect(r?.state.today).toBe('2026-12-17');
    expect(catchUpTo(family(MON), defaultCatalog, FRI, 2)?.state.today).toBe(WED);
  });

  it('知らせの文：1日なら「〇〇になりました。」、何日もなら「〇〇まで日付を進めました。」。配信があれば添える', () => {
    expect(catchUpText({ days: 1, pushed: 0, today: TUE })).toBe('11/17(火)になりました。');
    expect(catchUpText({ days: 3, pushed: 0, today: THU })).toBe('11/19(木)まで日付を進めました。');
    expect(catchUpText({ days: 2, pushed: 3, today: WED })).toBe('11/18(水)まで日付を進めました。配信が3件届きました。');
    expect(clockAheadText(FRI)).toBe(
      '記録の日付（11/20(金)）が今日より先に進んでいるので、切り替えられません。［はじめから設定する］で、今日から始め直してください。',
    );
    expect(planToast('paid', 'calendar')).toBe('有料版にしました。次の日から、配信が届きます。');
    expect(planToast('paid', 'demo')).toBe('有料版にしました。翌日へ進むと、配信が届きます。');
    expect(planToast('free', 'calendar')).toBe('無料版にしました。');
  });

  it('画面の覚え書きの clock は calendar か demo だけを読む', () => {
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ clock: 'calendar' }));
    expect(readUiPrefs().clock).toBe('calendar');
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ clock: 'weekly' }));
    expect(readUiPrefs().clock).toBeUndefined();
  });
});

describe('試用モード（本物の日付で進める）', () => {
  it('月曜に始めて、時計が木曜になってから画面に戻ると、3日進めて知らせは1回（何日もの言い方）', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/16(月)');
    expect(toastText()).toBe('');

    now = THU;
    const toasts: string[] = [];
    const region = screen.getByRole('status');
    const observer = new MutationObserver(() => toasts.push(region.textContent ?? ''));
    observer.observe(region, { childList: true, subtree: true, characterData: true });
    becomeVisible();
    observer.disconnect();

    const s = saved();
    expect(s.today).toBe(THU);
    // advanceDay を3回（月・火・水の前日の確認が1つずつ）
    expect(askedDates(s)).toEqual([MON, TUE, WED]);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/19(木)');
    expect(toastText()).toBe('11/19(木)まで日付を進めました。');
    expect(document.querySelectorAll('.toast')).toHaveLength(1);

    // もう一度戻っても、同じ日なら何もしない
    const chat = s.chat.length;
    becomeVisible();
    expect(saved().chat.length).toBe(chat);
  });

  it('1日だけ進んだときは「〇〇になりました。」（ウィンドウに戻ったとき）', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    now = TUE;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(saved().today).toBe(TUE);
    expect(toastText()).toBe('11/17(火)になりました。');
  });

  it('画面を開いたまま日付が変わっても、1分ごとに追いつく', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    now = TUE;
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(saved().today).toBe(MON);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(saved().today).toBe(TUE);
    expect(toastText()).toBe('11/17(火)になりました。');
  });

  it('開いたときに日付が過ぎていれば、すぐに追いつく', () => {
    store(family(MON), 'calendar');
    now = WED;
    render(<App todayFn={todayFn} />);
    expect(saved().today).toBe(WED);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/18(水)');
    expect(toastText()).toBe('11/18(水)まで日付を進めました。');
  });

  it('AI の読み取り中は進めず、読み取りが終わって返事を入れてから追いつく', async () => {
    let release: (v: unknown) => void = () => {};
    mockClaude(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    await waitFor(() => expect(document.querySelector('form.composer')?.getAttribute('data-ai-status')).toBe('claude'));
    send('ふわふわのやつ');
    expect(screen.getByRole('button', { name: '読み取り中…' })).toBeTruthy();

    now = TUE;
    becomeVisible();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(saved().today).toBe(MON);

    release({ commands: [] });
    await waitFor(() => expect(saved().today).toBe(TUE));
    const chat = saved().chat;
    const written = chat.findIndex((m) => m.from === 'user' && m.text.includes('ふわふわのやつ'));
    const asked = chat.findIndex((m) => m.from === 'bot' && /は作りましたか？/.test(m.text));
    // 月曜に送った書き込みと返事が先に入り、そのあとで火曜になる
    expect(written).toBeGreaterThan(-1);
    expect(asked).toBeGreaterThan(written);
    await waitFor(() => expect(toastText()).toBe('11/17(火)になりました。'));
  });

  it('記録の日付が本物の今日より先なら、何もしない（戻さない）', () => {
    store(family(MON, 4), 'calendar');
    now = WED;
    render(<App todayFn={todayFn} />);
    expect(saved().today).toBe(FRI);
    expect(toastText()).toBe('');
    becomeVisible();
    expect(saved().today).toBe(FRI);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/20(金)');
  });

  it('［翌日へ進む］を出さず、その場所に「本物の日付で進めています（試用）」と出す', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    expect(advanceButton()).toBeNull();
    expect(screen.getByTestId('clock-note').textContent).toBe('本物の日付で進めています（試用）');
    const bar = document.querySelector('.demo-bar') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toBe('日付とプラン');
    expect(within(bar).getByText('今日')).toBeTruthy();
    expect(within(bar).queryByText('今日（デモ）')).toBeNull();
    // 有料に切り替えたときの知らせも、［翌日へ進む］と言わない
    fireEvent.click(within(screen.getByRole('group', { name: 'プラン（デモ）' })).getByRole('button', { name: '有料' }));
    expect(toastText()).toBe('有料版にしました。次の日から、配信が届きます。');
  });

  it('案内（このプロトタイプについて）も、本物の日付で進むと書く（［翌日へ進む］を押すようには書かない）', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: 'このプロトタイプについて' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('日付は、本物の日付（日本時間）に合わせて進みます。');
    expect(dialog.textContent).toContain('次の日に［作った］→ ◎○△');
    expect(dialog.textContent).not.toContain('翌日へ進む');
  });

  it('デモ（既定）：［翌日へ進む］を出し、本物の日付では進めない', () => {
    store(family(MON));
    now = THU;
    render(<App todayFn={todayFn} />);
    expect(advanceButton()).toBeTruthy();
    expect(screen.queryByTestId('clock-note')).toBeNull();
    expect(screen.getByText('今日（デモ）')).toBeTruthy();
    becomeVisible();
    expect(saved().today).toBe(MON);
    expect(uiPrefs().clock).toBe('demo');
  });

  it('覚え書きが calendar でも、保存した記録がなければ（デモの家族で始まるので）デモにする', () => {
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ clock: 'calendar' }));
    now = WED;
    render(<App todayFn={todayFn} />);
    expect(saved().today).toBe(MON);
    expect(advanceButton()).toBeTruthy();
    expect(uiPrefs().clock).toBe('demo');
  });
});

describe('初回設定の「本物の日付で進める（1週間の試用）」', () => {
  function fillAndGoToConfirm(): HTMLInputElement {
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'あきこ' } });
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByRole('heading', { name: 'この内容で始めます' })).toBeTruthy();
    return screen.getByLabelText(/本物の日付で進める（1週間の試用）/) as HTMLInputElement;
  }

  it('既定で印が付いていて、そのまま始めると本物の日付で進める（［翌日へ進む］は出ない。次の日には追いつく）', () => {
    window.location.hash = '#start';
    now = TUE;
    render(<App todayFn={todayFn} />);
    const box = fillAndGoToConfirm();
    expect(box.checked).toBe(true);
    expect(screen.getByText('印を外すと、画面の［翌日へ進む］で日付を進めるデモになります。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));

    expect(saved().today).toBe(TUE);
    expect(saved().household.members.map((m) => m.nickname)).toEqual(['あきこ']);
    expect(uiPrefs().clock).toBe('calendar');
    expect(advanceButton()).toBeNull();
    expect(screen.getByTestId('clock-note')).toBeTruthy();

    now = WED;
    becomeVisible();
    expect(saved().today).toBe(WED);
    expect(toastText()).toBe('11/18(水)になりました。');
  });

  it('印を外して始めると、［翌日へ進む］で進めるデモになる', () => {
    window.location.hash = '#start';
    now = TUE;
    render(<App todayFn={todayFn} />);
    const box = fillAndGoToConfirm();
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));
    expect(uiPrefs().clock).toBe('demo');
    expect(advanceButton()).toBeTruthy();
    now = THU;
    becomeVisible();
    expect(saved().today).toBe(TUE);
  });

  it('「デモの家族で始める」は、いつもデモ（本物の日付で進めていたときも）', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    expect(advanceButton()).toBeNull();
    window.location.hash = '#start';
    fireEvent(window, new HashChangeEvent('hashchange'));
    fireEvent.click(screen.getByRole('button', { name: 'デモの家族で始める' }));
    fireEvent.click(screen.getByRole('button', { name: 'デモで始め直す' }));
    expect(uiPrefs().clock).toBe('demo');
    expect(advanceButton()).toBeTruthy();
    expect(saved().household.members.map((m) => m.nickname)).toEqual(NAMES);
  });
});

describe('家族と設定の「日付の進め方」', () => {
  const calendarRadio = () => screen.getByRole('radio', { name: /本物の日付で進める（試用）/ }) as HTMLInputElement;
  const demoRadio = () => screen.getByRole('radio', { name: /［翌日へ進む］で進める（デモ）/ }) as HTMLInputElement;

  it('デモから本物の日付に切り替えると、すぐに今日まで追いつく', () => {
    store(family(MON));
    now = THU;
    render(<App todayFn={todayFn} />);
    openSettings();
    expect(demoRadio().checked).toBe(true);
    fireEvent.click(calendarRadio());
    expect(calendarRadio().checked).toBe(true);
    expect(saved().today).toBe(THU);
    expect(askedDates(saved())).toEqual([MON, TUE, WED]);
    expect(toastText()).toBe('本物の日付で進めます。11/19(木)まで日付を進めました。');
    expect(uiPrefs().clock).toBe('calendar');
    expect(advanceButton()).toBeNull();
  });

  it('記録の日付が今日より先なら、切り替えずに、その場でわけを出す', () => {
    store(family(MON, 4));
    now = WED;
    render(<App todayFn={todayFn} />);
    openSettings();
    fireEvent.click(calendarRadio());
    expect(screen.getByRole('alert').textContent).toBe(
      '記録の日付（11/20(金)）が今日より先に進んでいるので、切り替えられません。［はじめから設定する］で、今日から始め直してください。',
    );
    expect(calendarRadio().checked).toBe(false);
    expect(demoRadio().checked).toBe(true);
    expect(saved().today).toBe(FRI);
    expect(uiPrefs().clock).toBe('demo');
    expect(advanceButton()).toBeTruthy();
  });

  it('本物の日付からデモに戻すと、［翌日へ進む］が出る', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    openSettings();
    expect(calendarRadio().checked).toBe(true);
    fireEvent.click(demoRadio());
    expect(toastText()).toBe('［翌日へ進む］で日付を進めます。');
    expect(uiPrefs().clock).toBe('demo');
    expect(advanceButton()).toBeTruthy();
  });

  it('読み込み：本物の日付で進めているときに、今日より先の記録を読み込むと、デモにしてそう言う', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    openSettings();
    fireEvent.change(screen.getByLabelText('読み込み'), { target: { value: JSON.stringify(family(MON, 4)) } });
    fireEvent.click(screen.getByRole('button', { name: '読み込む' }));
    expect(saved().today).toBe(FRI);
    expect(uiPrefs().clock).toBe('demo');
    expect(toastText()).toBe('読み込みました。記録の日付（11/20(金)）が今日より先なので、［翌日へ進む］で進めるデモにしました。');
    expect(advanceButton()).toBeTruthy();
  });

  it('読み込み：今日より前の記録なら、本物の日付のまま今日まで追いつく', () => {
    store(family(MON), 'calendar');
    now = THU;
    render(<App todayFn={todayFn} />);
    expect(saved().today).toBe(THU);
    openSettings();
    fireEvent.change(screen.getByLabelText('読み込み'), { target: { value: JSON.stringify(family(MON)) } });
    fireEvent.click(screen.getByRole('button', { name: '読み込む' }));
    expect(saved().today).toBe(THU);
    expect(uiPrefs().clock).toBe('calendar');
    expect(toastText()).toBe('読み込みました。11/19(木)まで日付を進めました。');
  });

  it('リセットすると、デモの家族と［翌日へ進む］に戻る', () => {
    store(family(MON), 'calendar');
    now = WED;
    render(<App todayFn={todayFn} />);
    openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
    fireEvent.click(screen.getByRole('button', { name: '本当にリセットする' }));
    expect(uiPrefs().clock).toBe('demo');
    expect(advanceButton()).toBeTruthy();
    expect(saved().today).toBe(MON);
  });
});

describe('試用の記録', () => {
  /** 読み取れなかった書き込みが1つある、木曜の状態（本物の日付で進めている）。 */
  function storeTrial(): AppState {
    let s = family(MON);
    s = handleUserText(s, defaultCatalog, '@きめとく ほげほげ').state;
    for (let i = 0; i < 3; i++) s = advanceDay(s, defaultCatalog).state;
    store(s, 'calendar');
    now = THU;
    return s;
  }

  function trialGroup(): HTMLElement {
    openSettings();
    return screen.getByRole('group', { name: '試用の記録' });
  }

  const area = (g: HTMLElement) => within(g).getByLabelText('試用の記録（送る文）') as HTMLTextAreaElement;

  it('データの書き出しの上に、名前を入れない記録（エンジンの formatTrialReport）を出す', () => {
    storeTrial();
    render(<App todayFn={todayFn} />);
    const g = trialGroup();
    expect(
      within(g).getByText('1週間の試用のあとに、この記録を主催者に送ってください。名前は入らず、数だけをまとめています。LINE やメールに貼り付けて送れます。'),
    ).toBeTruthy();
    const text = area(g).value;
    // 読み取れなかった書き込みの文は、送る人が印を付けたときだけ入れる（既定は入れない。数は入る）。
    expect(text).toBe(formatTrialReport(trialReport(saved(), defaultCatalog, { includeTexts: false, clock: 'calendar' })));
    expect(text).toContain('きめとく 試用の記録');
    expect(text).toContain('（カレンダーどおり）');
    expect(text).not.toContain('ほげほげ');
    expect(text).toContain('読み取れなかった 1件');
    for (const name of NAMES) expect(text).not.toContain(name);
    expect(area(g).readOnly).toBe(true);
    expect(text.length).toBeLessThan(5000);
    // 書き出し（JSON）より上
    const exportButton = screen.getByRole('button', { name: '書き出す（JSON）' });
    expect(g.compareDocumentPosition(exportButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('「読み取れなかった書き込みの文も入れる」は既定で印なし。付けると文を入れ、外すと入れない（数は残す）', () => {
    storeTrial();
    render(<App todayFn={todayFn} />);
    const g = trialGroup();
    const box = within(g).getByLabelText('読み取れなかった書き込みの文も入れる（読み取りの改善に使います）') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(area(g).value).toBe(formatTrialReport(trialReport(saved(), defaultCatalog, { includeTexts: true, clock: 'calendar' })));
    expect(area(g).value).toContain('ほげほげ');
    for (const name of NAMES) expect(area(g).value).not.toContain(name);
    fireEvent.click(box);
    const text = area(g).value;
    expect(text).toBe(formatTrialReport(trialReport(saved(), defaultCatalog, { includeTexts: false, clock: 'calendar' })));
    expect(text).not.toContain('ほげほげ');
    expect(text).toContain('読み取れなかった 1件');
    expect(text).not.toContain('unreadableTexts');
  });

  it('［コピー］でクリップボードに書き、「試用の記録をコピーしました」と知らせる', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    storeTrial();
    render(<App todayFn={todayFn} />);
    const g = trialGroup();
    fireEvent.click(within(g).getByRole('button', { name: 'コピー' }));
    expect(writeText).toHaveBeenCalledWith(area(g).value);
    await waitFor(() => expect(toastText()).toBe('試用の記録をコピーしました'));
    expect(within(g).queryByText(/コピーできませんでした/)).toBeNull();
  });

  it('クリップボードが使えないときは、文を選択して「選択してコピーしてください」と出す（断られたときも）', async () => {
    storeTrial();
    render(<App todayFn={todayFn} />);
    const g = trialGroup();
    fireEvent.click(within(g).getByRole('button', { name: 'コピー' }));
    expect(within(g).getByText('コピーできませんでした。テキストを選択してコピーしてください。')).toBeTruthy();
    const a = area(g);
    expect(document.activeElement).toBe(a);
    expect(a.selectionStart).toBe(0);
    expect(a.selectionEnd).toBe(a.value.length);

    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    (screen.getByRole('button', { name: '書き出す（JSON）' }) as HTMLButtonElement).focus();
    fireEvent.click(within(g).getByRole('button', { name: 'コピー' }));
    await waitFor(() => expect(document.activeElement).toBe(a));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(toastText()).not.toBe('試用の記録をコピーしました');
  });
});

describe('週末の質問のボタン', () => {
  it('visibleActions：過ぎた週の質問でも出す。その週の答えが入ったら出さない（ほかの週の答えでは消さない）', () => {
    const s = family(MON, 5);
    const actions = latestQuestion(s).actions;
    expect(s.today).toBe(SAT);
    expect(visibleActions(s, actions)).toHaveLength(6);
    expect(visibleActions({ ...s, checkins: [checkin(MON, 2)] }, actions)).toHaveLength(0);
    expect(visibleActions({ ...s, checkins: [checkin('2026-11-09', 2)] }, actions)).toHaveLength(6);
    // 前の版の状態（checkins がない）
    const old: AppState = { ...s };
    delete old.checkins;
    expect(visibleActions(old, actions)).toHaveLength(6);
  });

  it('shownActions：ほかの書き込みのあとも、答えるまで出す。同じ週の質問が2つあれば、新しいほうにだけ出す', () => {
    let s = family(MON, 5);
    const q1 = latestQuestion(s).id;
    s = handleUserText(s, defaultCatalog, '@きめとく 卵切れた').state;
    const shown = shownActions(s);
    expect(shown.get(q1)?.map((b) => b.label)).toEqual(['0日', '1日', '2日', '3日', '4日', '5日']);
    // ふつうのボタン（はじめの週の献立の［買い物リスト］など）は、書き込みより前のメッセージには出さない
    const week = s.chat.find((m) => m.from === 'bot' && m.card?.kind === 'week');
    expect(week?.actions?.length).toBeGreaterThan(0);
    expect(shown.has(week!.id)).toBe(false);
    // 前日の確認（［作った］［作らなかった］）は、答えのない過ぎた日なら、答えるまで残す（何日分も一度に届いたときに消えないように）
    const ask = s.chat.find((m) => m.from === 'bot' && /は作りましたか？/.test(m.text));
    expect(shown.get(ask!.id)?.map((b) => b.action.type)).toEqual(['cooked', 'not_cooked']);

    // 範囲の外の答えに、エンジンが同じ週の質問（［0日］…）を出し直したら、新しいほうにだけ出す
    s = askAgain(s, MON);
    const q2 = latestQuestion(s);
    expect(q2.id).not.toBe(q1);
    expect(q2.text).toBe('0日から5日までで答えてください。');
    const again = shownActions(s);
    expect(again.has(q1)).toBe(false);
    expect(again.get(q2.id)).toHaveLength(6);
    expect(shownActions({ ...s, checkins: [checkin(MON, 3)] }).has(q2.id)).toBe(false);
  });

  it('2週分の質問に答えがないときは、ボタンに週の月曜の日付を付けて見分ける（LINE のクイックリプライと同じ。1週分なら付けない）', () => {
    // 11/9(月) から何も答えずに 11/21(土) まで：11/9〜 と 11/16〜 の週の質問が、どちらも答えのないまま
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, '2026-11-09');
    for (let i = 0; i < 12; i++) s = advanceDay(s, defaultCatalog).state;
    expect(s.today).toBe(SAT);
    const groups = [...shownActions(s).values()].filter((bs) => bs.some((b) => b.action.type === 'weekly_checkin'));
    expect(groups).toHaveLength(2);
    const labels = actionLabels(s, groups);
    expect(labels[0].slice(0, 2)).toEqual(['11/9(月) 0日', '11/9(月) 1日']);
    expect(labels[1].slice(0, 2)).toEqual(['11/16(月) 0日', '11/16(月) 1日']);
    // 古い週に答えると、新しい週のボタンだけになり、日付は付かない
    const answered = applyAction(s, defaultCatalog, { type: 'weekly_checkin', weekStart: '2026-11-09', thoughtDays: 2 }).state;
    const rest = [...shownActions(answered).values()].filter((bs) => bs.some((b) => b.action.type === 'weekly_checkin'));
    expect(actionLabels(answered, rest)).toEqual([['0日', '1日', '2日', '3日', '4日', '5日']]);
  });

  it('トーク：6つのボタンを出し、ほかを書き込んでも残る。出し直した質問があれば、そちらにだけ出す。答えが入った週のボタンは出さない', () => {
    store(family(MON, 5));
    now = SAT;
    const { unmount } = render(<App todayFn={todayFn} />);
    const bots = () => [...talkLog().querySelectorAll<HTMLElement>('[data-from="bot"]')];
    const question = bots().find((m) => m.textContent?.includes('自分で献立を考えた日'))!;
    const group = within(question).getByRole('group', { name: '返事のボタン' });
    expect(group.classList.contains('chips--checkin')).toBe(true);
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['0日', '1日', '2日', '3日', '4日', '5日']);

    send('卵切れた');
    expect(within(talkLog()).getByRole('button', { name: '2日' })).toBeTruthy();
    unmount();

    // 範囲の外の答えに、エンジンが［0日］…を出し直したあと：ボタンは出し直したメッセージにだけ出る
    store(askAgain(family(MON, 5), MON));
    const again = render(<App todayFn={todayFn} />);
    const withChips = bots().filter((m) => m.querySelector('.chips--checkin'));
    expect(withChips).toHaveLength(1);
    expect(withChips[0].textContent).toContain('0日から5日までで答えてください。');
    again.unmount();

    store({ ...family(MON, 5), checkins: [checkin(MON, 2)] });
    render(<App todayFn={todayFn} />);
    expect(within(talkLog()).queryByRole('button', { name: '2日' })).toBeNull();
    expect(within(talkLog()).getAllByText(/自分で献立を考えた日は何日/).length).toBeGreaterThan(0);
    expect(talkLog().querySelector('.chips--checkin')).toBeNull();
  });
});

describe('週末の質問（エンジンが出す本物の質問で、通しで）', () => {
  it('本物の日付で土曜になると質問が出る。先に［作った］を押しても残り、［2日］で答えると消えて、振り返りに出る', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    now = SAT;
    becomeVisible();
    expect(saved().today).toBe(SAT);
    const group = () => talkLog().querySelector<HTMLElement>('.chips--checkin');
    expect(group()).not.toBeNull();
    expect(within(group()!).getAllByRole('button').map((b) => b.textContent)).toEqual(['0日', '1日', '2日', '3日', '4日', '5日']);

    // 金曜の「作りましたか？」に先に答えても、週末の質問のボタンは残る
    const asks = [...talkLog().querySelectorAll<HTMLElement>('[data-from="bot"]')].filter((m) => /作りましたか？/.test(m.textContent ?? ''));
    fireEvent.click(within(asks[asks.length - 1]).getByRole('button', { name: /作った$/ }));
    expect(saved().meals.find((m) => m.date === FRI)?.status).toBe('cooked');
    expect(group()).not.toBeNull();

    fireEvent.click(within(group()!).getByRole('button', { name: '2日' }));
    expect(group()).toBeNull();
    expect(saved().checkins).toEqual([checkin(MON, 2)]);

    fireEvent.click(within(menu()).getByRole('button', { name: '今週の献立' }));
    const panel = screen.getAllByRole('region', { name: /^(今週|この週)の振り返り$/ })[0];
    expect(panel.textContent).toContain('自分で考えた日（週末の質問）：2日／5日');
  });
});

describe('振り返りの「自分で考えた日（週末の質問）」', () => {
  it('SummaryBody：その週の答えがあれば「自分で考えた日（週末の質問）：2日／5日」、なければ出さない', () => {
    const s = family(MON, 7);
    expect(s.today).toBe(NEXT_MON);
    const { container, unmount } = render(<SummaryBody weekStart={MON} state={{ ...s, checkins: [checkin(MON, 2)] }} catalog={defaultCatalog} />);
    expect(container.textContent).toContain('自分で考えた日（週末の質問）：2日／5日');
    unmount();
    const none = render(<SummaryBody weekStart={MON} state={{ ...s, checkins: [checkin('2026-11-09', 4)] }} catalog={defaultCatalog} />);
    expect(none.container.textContent).not.toContain('自分で考えた日');
    none.unmount();
    const old = render(<SummaryBody weekStart={MON} state={s} catalog={defaultCatalog} />);
    expect(old.container.textContent).not.toContain('自分で考えた日');
  });

  it('献立の日のない週でも、答えがあれば出す。言い方はエンジンの振り返りの文（LINE・次の週の献立のメッセージ）と同じ', () => {
    const s = { ...family(MON, 7), checkins: [checkin('2026-11-09', 1, 3)] };
    const { container } = render(<SummaryBody weekStart="2026-11-09" state={s} catalog={defaultCatalog} />);
    expect(container.textContent).toContain('この週の記録はありません。');
    expect(container.textContent).toContain('自分で考えた日（週末の質問）：1日／3日');
    expect(renderCardText(s, defaultCatalog, { kind: 'summary', weekStart: '2026-11-09' }).split('\n')).toEqual([
      '11/9(月)〜の振り返り',
      'この週の記録はありません。',
      '自分で考えた日（週末の質問）：1日／3日',
    ]);
  });

  it('週の献立の「先週の振り返り」に出す', () => {
    store({ ...family(MON, 7), checkins: [checkin(MON, 2)] });
    now = NEXT_MON;
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '今週の献立' }));
    const panel = screen.getByRole('region', { name: '先週の振り返り' });
    expect(panel.textContent).toContain('自分で考えた日（週末の質問）：2日／5日');
  });

  it('答えのない週の振り返りには出さない', () => {
    store(family(MON, 7));
    now = NEXT_MON;
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '今週の献立' }));
    const panel = screen.getByRole('region', { name: '先週の振り返り' });
    expect(panel.textContent).not.toContain('自分で考えた日');
  });
});
