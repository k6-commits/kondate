// @vitest-environment jsdom
// 本物の1週間の試用を、画面で通したときに見つかったことの確かめ（verify-trial-screen）：
// - 何日か開かなかった日の「作りましたか？」が2つ以上届いたとき、片方に答えても、もう片方のボタンが答えるまで残る。
// - 試用の記録の「読み取れなかった書き込みの文も入れる」は、送る人が選んだときだけ（既定は印なし）。
// - 同じページを2つのタブで開いていても、古いタブが日付を進めるときに、ほかのタブで答えた記録を消さない。
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { AppState } from '../engine';
import { advanceDay, applyAction, createInitialState, formatTrialReport, handleUserText, trialReport } from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import { App } from './App';
import { STORAGE_KEY, UI_STORAGE_KEY } from './storage';
import { shownActions } from './components/Talk';
import { AboutPanel } from './components/AboutPanel';

const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const THU = '2026-11-19';

let now = MON;
const todayFn = () => now;

function family(today: string, days = 0): AppState {
  let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, today);
  for (let i = 0; i < days; i++) s = advanceDay(s, defaultCatalog).state;
  return s;
}

function store(s: AppState, clock?: 'calendar' | 'demo'): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  if (clock) window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ clock }));
}

function saved(): AppState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('state is not saved');
  return JSON.parse(raw) as AppState;
}

function statusOf(s: AppState, date: string): string | undefined {
  return s.meals.find((m) => m.date === date)?.status;
}

function becomeVisible(): void {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function talkLog(): HTMLElement {
  return screen.getByRole('log', { name: 'トーク' });
}

/** トークに今出ているボタンの文字。 */
function chipLabels(): string[] {
  return within(talkLog())
    .queryAllByRole('button')
    .filter((b) => b.classList.contains('chip--action'))
    .map((b) => b.textContent ?? '');
}

function tapChip(label: string): void {
  const chip = within(talkLog())
    .getAllByRole('button')
    .filter((b) => b.classList.contains('chip--action') && b.textContent === label)
    .at(-1);
  if (!chip) throw new Error(`no chip ${label}`);
  fireEvent.click(chip);
}

/** その日の［作った］［作らなかった］が出ているメッセージの数。 */
function cookedChecksShown(s: AppState, date: string): number {
  return [...shownActions(s).values()].filter((bs) =>
    bs.some((b) => (b.action.type === 'cooked' || b.action.type === 'not_cooked') && b.action.date === date),
  ).length;
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
});

describe('何日か開かなかったときの「作りましたか？」（2つ以上が一度に届く）', () => {
  it('shownActions：片方に答えても、まだ答えのない過ぎた日のボタンは、その日のいちばん新しい確認に残る', () => {
    // 月曜に始めて、木曜まで開かなかった：月・火・水の「作りましたか？」が届いている
    let s = family(MON, 3);
    expect(s.today).toBe(THU);
    for (const d of [MON, TUE, WED]) expect(cookedChecksShown(s, d)).toBe(1);
    // 火曜に［作った］（ボタンを押すと、利用者の発言が入る）
    s = applyAction(s, defaultCatalog, { type: 'cooked', date: TUE }).state;
    expect(statusOf(s, TUE)).toBe('cooked');
    expect(cookedChecksShown(s, TUE)).toBe(0);
    expect(cookedChecksShown(s, MON)).toBe(1);
    expect(cookedChecksShown(s, WED)).toBe(1);
    // ほかの書き込みのあとも残る。答えたら消える
    s = handleUserText(s, defaultCatalog, '@きめとく 買い物リスト').state;
    expect(cookedChecksShown(s, WED)).toBe(1);
    s = applyAction(s, defaultCatalog, { type: 'not_cooked', date: WED }).state;
    expect(cookedChecksShown(s, WED)).toBe(0);
    expect(cookedChecksShown(s, MON)).toBe(1);
  });

  it('shownActions：答えたあとの反応のボタン（◎○△）や、ほかのふつうのボタンは、これまでどおり最後の書き込みのあとだけ', () => {
    let s = family(MON, 2);
    s = applyAction(s, defaultCatalog, { type: 'cooked', date: MON }).state;
    // 反応のボタンは、最後の書き込みのあとの返事にある
    const reactNow = [...shownActions(s).values()].flat().filter((b) => b.action.type === 'react');
    expect(reactNow.length).toBeGreaterThan(0);
    s = handleUserText(s, defaultCatalog, '@きめとく 買い物リスト').state;
    const reactLater = [...shownActions(s).values()].flat().filter((b) => b.action.type === 'react');
    expect(reactLater).toHaveLength(0);
    // 今日のカードの［作った］（今日の分）は、ほかの書き込みのあとは出さない
    s = applyAction(s, defaultCatalog, { type: 'open_today' }).state;
    s = handleUserText(s, defaultCatalog, '@きめとく 買い物リスト').state;
    expect(cookedChecksShown(s, s.today)).toBe(0);
  });

  it('画面：木曜に開いて、火曜の［作った］を押しても、月曜と水曜のボタンは残り、押して記録できる', () => {
    store(family(MON), 'calendar');
    now = THU;
    render(<App todayFn={todayFn} />);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/19(木)');
    expect(chipLabels()).toEqual(expect.arrayContaining(['11/16(月) 作った', '11/17(火) 作った', '11/18(水) 作らなかった']));
    tapChip('11/17(火) 作った');
    expect(statusOf(saved(), TUE)).toBe('cooked');
    expect(chipLabels()).toEqual(expect.arrayContaining(['11/16(月) 作った', '11/16(月) 作らなかった', '11/18(水) 作った', '11/18(水) 作らなかった', '◎']));
    expect(chipLabels()).not.toContain('11/17(火) 作った');
    // 反応を押したあとも残る
    tapChip('◎');
    expect(chipLabels()).toEqual(expect.arrayContaining(['11/16(月) 作った', '11/18(水) 作らなかった']));
    tapChip('11/18(水) 作らなかった');
    expect(statusOf(saved(), WED)).toBe('skipped');
    // 残りは月曜だけ（ほかに同じ名前のボタンがないので、日付は付けない）
    expect(chipLabels()).toEqual(expect.arrayContaining(['作った', '作らなかった']));
    tapChip('作った');
    expect(statusOf(saved(), MON)).toBe('cooked');
    expect(chipLabels().filter((l) => l.includes('作った') || l.includes('作らなかった'))).toEqual([]);
  });
});

describe('本物の日付で進めるときは、トークに時刻を出さない（エンジンの時刻は目安で、本物の時刻と合わない）', () => {
  /** 吹き出しの横の時刻（読み取り中の印は除く）。 */
  const times = () => [...talkLog().querySelectorAll('.msg:not(.is-pending) .msg-time')].map((e) => e.textContent ?? '');

  it('本物の日付：夜の19時に書いても「08:28」のような時刻は出さない（日の区切りは出す）', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: '買い物リスト' } });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
    expect(times()).toEqual([]);
    expect(talkLog().querySelectorAll('.day-divider').length).toBeGreaterThan(0);
  });

  it('デモ（［翌日へ進む］）：これまでどおり時刻を出す', () => {
    store(family(MON), 'demo');
    render(<App todayFn={todayFn} />);
    expect(times().length).toBeGreaterThan(0);
    expect(times().every((t) => /^\d{2}:\d{2}$/.test(t))).toBe(true);
  });
});

describe('このブラウザに保存できないとき（サイトのデータを止めている など）は、そう知らせる', () => {
  const TOAST = 'このブラウザには保存できません。ページを閉じると、家族と記録が消えます。';
  const NOTE =
    'このブラウザには保存できていません。ページを閉じると、家族と記録が消えます。プライベートブラウズを使っていないか、サイトのデータを保存する設定になっているかを確かめてください。';

  function blockWrites(): void {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
  }

  function dataNotes(): string[] {
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByRole('button', { name: '家族と設定' }));
    const data = document.getElementById('data-title')?.closest('section');
    return [...(data?.querySelectorAll(':scope > .field-note') ?? [])].map((e) => e.textContent ?? '');
  }

  it('本物の日付で試しているとき：開いたときに一度だけ知らせ、家族と設定のデータの欄にも出す', () => {
    vi.useFakeTimers();
    store(family(MON), 'calendar');
    blockWrites();
    render(<App todayFn={todayFn} />);
    expect(screen.getByRole('status').textContent).toBe(TOAST);
    // 知らせが消えたあと、書き込んでも、何度も知らせない
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole('status').textContent).toBe('');
    fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: '買い物リスト' } });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
    expect(screen.getByRole('status').textContent).toBe('');
    expect(dataNotes()).toEqual([NOTE]);
  });

  it('デモ（［翌日へ進む］）のときは知らせを出さない（データの欄には出す）', () => {
    store(family(MON), 'demo');
    blockWrites();
    render(<App todayFn={todayFn} />);
    expect(screen.getByRole('status').textContent).toBe('');
    expect(dataNotes()).toEqual([NOTE]);
  });

  it('保存できているときは、これまでどおり', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    expect(screen.getByRole('status').textContent).toBe('');
    expect(dataNotes()).toEqual(['状態は、このブラウザの中だけに保存しています。ほかの人や端末には届きません。']);
  });
});

describe('案内（このプロトタイプについて）：本物の日付で試す家族には、デモの家族だけの説明を出さない', () => {
  const CURRY = /「金曜はカレーがいい」は、アレルギーの判定を見る例です。卵アレルギーの家族がいるので/;

  it('本物の日付：デモの家族の卵アレルギーを前提にした「金曜はカレーがいい」の説明は出さない', () => {
    render(<AboutPanel aiStatus="none" clock="calendar" onStartOver={() => {}} />);
    expect(screen.queryByText(CURRY)).toBeNull();
  });

  it('デモ（［翌日へ進む］）：これまでどおり出す', () => {
    render(<AboutPanel aiStatus="none" clock="demo" onStartOver={() => {}} />);
    expect(screen.getByText(CURRY)).toBeTruthy();
  });
});

describe('試用の記録：読み取れなかった書き込みの文は、送る人が選んだときだけ入れる', () => {
  it('印は既定で外れていて、文は入らない（数は入る）。印を付けると文も入る', () => {
    let s = family(MON);
    s = handleUserText(s, defaultCatalog, '@きめとく ほげほげ').state;
    for (let i = 0; i < 3; i++) s = advanceDay(s, defaultCatalog).state;
    store(s, 'calendar');
    now = THU;
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByRole('button', { name: '家族と設定' }));
    const g = screen.getByRole('group', { name: '試用の記録' });
    const box = within(g).getByLabelText('読み取れなかった書き込みの文も入れる（読み取りの改善に使います）') as HTMLInputElement;
    const area = () => within(g).getByLabelText('試用の記録（送る文）') as HTMLTextAreaElement;
    expect(box.checked).toBe(false);
    expect(area().value).toBe(formatTrialReport(trialReport(saved(), defaultCatalog, { includeTexts: false, clock: 'calendar' })));
    expect(area().value).not.toContain('ほげほげ');
    expect(area().value).toContain('読み取れなかった 1件');
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(area().value).toContain('ほげほげ');
  });
});

describe('2つのタブで開いていても、古いタブがほかのタブの答えを消さない', () => {
  /** ほかのタブ：火曜に開いて、月曜を［作った］と答えて保存した。 */
  function otherTabAnsweredMonday(base: AppState): AppState {
    const tue = advanceDay(base, defaultCatalog).state;
    return applyAction(tue, defaultCatalog, { type: 'cooked', date: MON }).state;
  }

  it('画面に戻って日付を進める前に、保存された新しい記録を読み直す', () => {
    const base = family(MON);
    store(base, 'calendar');
    render(<App todayFn={todayFn} />);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/16(月)');
    // ほかのタブが火曜に答えて保存した（このタブは月曜のまま、隠れていた）
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(otherTabAnsweredMonday(base)));
    now = WED;
    becomeVisible();
    const s = saved();
    expect(s.today).toBe(WED);
    expect(statusOf(s, MON)).toBe('cooked');
    expect(screen.getByTestId('demo-today').textContent).toBe('11/18(水)');
  });

  it('1分ごとの確かめ（開いたままの古いタブ）でも、読み直してから進める', () => {
    vi.useFakeTimers();
    const base = family(MON);
    store(base, 'calendar');
    render(<App todayFn={todayFn} />);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(otherTabAnsweredMonday(base)));
    now = WED;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(saved().today).toBe(WED);
    expect(statusOf(saved(), MON)).toBe('cooked');
  });

  it('ほかのタブが保存したら（storage イベント）、その記録と日付の進め方に切り替える', () => {
    const base = family(MON);
    store(base, 'calendar');
    render(<App todayFn={todayFn} />);
    // ほかのタブ：デモに切り替えて、［翌日へ進む］で火曜にして、月曜を答えた
    const other = otherTabAnsweredMonday(base);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(other));
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ clock: 'demo' }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    });
    expect(screen.getByTestId('demo-today').textContent).toBe('11/17(火)');
    expect(screen.getByRole('button', { name: '翌日へ進む' })).toBeTruthy();
    expect(statusOf(saved(), MON)).toBe('cooked');
  });

  it('このタブが自分で保存したものは読み直さない（書き込みや追いつきは、これまでどおり）', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: '買い物リスト' } });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
    const chat = saved().chat.length;
    now = TUE;
    becomeVisible();
    const s = saved();
    expect(s.today).toBe(TUE);
    expect(s.chat.length).toBeGreaterThan(chat);
    expect(s.chat.some((m) => m.from === 'user' && m.text.includes('買い物リスト'))).toBe(true);
  });

  it('読み直した記録が壊れていれば、使わない（今の記録のまま進める）', () => {
    store(family(MON), 'calendar');
    render(<App todayFn={todayFn} />);
    window.localStorage.setItem(STORAGE_KEY, '{"version":1,"broken":true}');
    now = TUE;
    becomeVisible();
    expect(saved().today).toBe(TUE);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/17(火)');
  });
});

describe('みんな外で食べた日のあとで家族を加えても、その日は「記録なし」にならない', () => {
  it('過ぎたみんな外食の日は、加えた人も家で食べなかった日にする（振り返りと試用の記録の数が変わらない）', () => {
    // 火曜に「明日はみんな外食」→ 水曜は夕食なし。木曜に開いて、家族と設定で「ばあば」を加える
    let s = family(MON, 1);
    s = handleUserText(s, defaultCatalog, '@きめとく 明日はみんな外食').state;
    s = advanceDay(advanceDay(s, defaultCatalog).state, defaultCatalog).state;
    expect(s.today).toBe(THU);
    const before = trialReport(s, defaultCatalog).days;
    expect(before.everyoneOut).toBe(1);
    store(s, 'calendar');
    now = THU;
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(screen.getByRole('button', { name: '家族を加える' }));
    const editor = document.querySelector('.member-card.is-editing') as HTMLElement;
    fireEvent.change(within(editor).getByLabelText('ニックネーム'), { target: { value: 'ばあば' } });
    fireEvent.click(within(editor).getByRole('radio', { name: '大人' }));
    fireEvent.click(within(editor).getByRole('button', { name: '加える' }));

    const after = saved();
    const added = after.household.members.find((m) => m.nickname === 'ばあば')!.id;
    expect(after.meals.find((m) => m.date === WED)?.absentMemberIds).toContain(added);
    // ほかの過ぎた日や、これからの日は、加えた人も食べる日のまま
    expect(after.meals.find((m) => m.date === TUE)?.absentMemberIds).not.toContain(added);
    expect(after.meals.find((m) => m.date === THU)?.absentMemberIds).not.toContain(added);
    expect(trialReport(after, defaultCatalog).days).toEqual(before);
  });
});
