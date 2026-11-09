// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AppState, ChatMessage } from '../engine';
import { AISLE_ORDER, advanceDay, applyAction, createInitialState, handleUserText, householdNotices } from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import { App, ROUTES, WIDE_QUERY } from './App';
import { STORAGE_KEY, UI_STORAGE_KEY } from './storage';
import { supersededCards } from './components/Talk';

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

function botCount(): number {
  return talkLog().querySelectorAll('[data-from="bot"]').length;
}

function userCount(): number {
  return talkLog().querySelectorAll('[data-from="user"]').length;
}

function input(): HTMLInputElement {
  return screen.getByLabelText('きめとくへの書き込み') as HTMLInputElement;
}

function send(text: string): void {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '送る' }));
}

function menu(): HTMLElement {
  return screen.getByRole('navigation', { name: 'メニュー' });
}

function uiPrefs(): Record<string, unknown> {
  return JSON.parse(window.localStorage.getItem(UI_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
}

/** window.matchMedia の偽物（jsdom にはない）。set で幅を変えたことにする。 */
function mockMatchMedia(wide: boolean) {
  let matches = wide;
  const listeners = new Set<() => void>();
  const mql = {
    media: WIDE_QUERY,
    get matches() {
      return matches;
    },
    onchange: null,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    addListener: (fn: () => void) => listeners.add(fn),
    removeListener: (fn: () => void) => listeners.delete(fn),
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => mql) });
  return {
    set(next: boolean) {
      matches = next;
      act(() => listeners.forEach((fn) => fn()));
    },
  };
}

function demoBar(): HTMLElement {
  return document.querySelector('.demo-bar') as HTMLElement;
}

function talkLayer(): HTMLElement {
  return document.querySelector('.talk-layer') as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  delete (window as unknown as { claude?: unknown }).claude;
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('はじめの表示', () => {
  it('保存された状態がなければ、デモの家族で始まった状態で開く（今週の月曜から）', () => {
    render(<App todayFn={() => '2026-11-11'} />);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/9(月)');
    expect(within(talkLog()).getByText(/はじめまして。きめとくです。/)).toBeTruthy();
    expect(botCount()).toBeGreaterThanOrEqual(3);
    const week = talkLog().querySelector('[data-card="week"]');
    expect(week).not.toBeNull();
    // 週のカードに月〜金の行がある
    expect(week!.querySelectorAll('.week-row').length).toBe(5);
    expect(screen.getByText('うちの献立')).toBeTruthy();
    expect(saved().household.members.map((m) => m.nickname)).toEqual(['ママ', 'パパ', 'はると', 'ゆい']);
  });

  it('ボタンは、最後の利用者の発言より後の bot のメッセージにだけ出る', () => {
    render(<App todayFn={todayFn} />);
    const chipsBefore = talkLog().querySelectorAll('.chips').length;
    expect(chipsBefore).toBeGreaterThan(0);
    send('卵切れた');
    const msgs = [...talkLog().querySelectorAll('.msg')];
    const lastUser = msgs.map((m) => m.getAttribute('data-from')).lastIndexOf('user');
    msgs.forEach((m, i) => {
      if (i < lastUser) expect(m.querySelector('.chips')).toBeNull();
    });
  });

  it('画面の名前（ハッシュ）に claude.ai が使う名前を使わない', () => {
    for (const r of ROUTES) {
      expect(r).toMatch(/^[a-z]+$/);
      expect(r).not.toMatch(/^(settings|sidebar|customize|upgrade|downloads|comment-)/);
    }
  });
});

describe('トーク', () => {
  it('「今日は無理」を送ると、bot の返事が増え、今日の献立がラク日になる', () => {
    render(<App todayFn={todayFn} />);
    const before = botCount();
    expect(saved().meals.find((m) => m.date === MONDAY)?.kind).toBe('normal');
    send('今日は無理');
    expect(botCount()).toBeGreaterThan(before);
    expect(within(talkLog()).getByText(/今日はラクしましょう/)).toBeTruthy();
    expect(saved().meals.find((m) => m.date === MONDAY)?.kind).toBe('raku');
    // 利用者の発言は右に、送った人の名前つきで出る
    const user = talkLog().querySelector('[data-from="user"]');
    expect(user?.textContent).toContain('ママ');
    expect(user?.textContent).toContain('今日は無理');
    // ルールで読み取った印
    expect(within(talkLog()).getByText('ルールで読み取り')).toBeTruthy();
  });

  it('例のチップを押すと、その文が送られる', () => {
    render(<App todayFn={todayFn} />);
    const examples = screen.getByRole('group', { name: 'ためしに送る書き込み' });
    fireEvent.click(within(examples).getByRole('button', { name: '卵切れた' }));
    expect(userCount()).toBe(1);
    expect(talkLog().querySelector('[data-from="user"]')?.textContent).toContain('卵切れた');
    expect(within(talkLog()).getByText(/卵を「なし」にしました/)).toBeTruthy();
  });

  it('「金曜はカレーがいい」は、卵アレルギーの家なので「要確認」として出さず、キーマカレーを代わりに提案する（案内の文と同じ）', () => {
    render(<App todayFn={todayFn} />);
    const examples = screen.getByRole('group', { name: 'ためしに送る書き込み' });
    fireEvent.click(within(examples).getByRole('button', { name: '金曜はカレーがいい' }));
    const reply = [...talkLog().querySelectorAll('[data-from="bot"] .bubble--bot')].pop()?.textContent ?? '';
    expect(reply).toMatch(/「要確認」.*提案していません/);
    expect(reply).toMatch(/かわりに.*キーマカレー/);
    const hint = document.querySelector('.about-col .hint')?.textContent ?? '';
    expect(hint).toContain('「要確認」');
    expect(hint).toContain('キーマカレーを代わりに提案');
  });

  it('日本語入力の変換中の Enter では送らない', () => {
    render(<App todayFn={todayFn} />);
    const box = input();
    fireEvent.change(box, { target: { value: 'きょうはむり' } });
    fireEvent.compositionStart(box);
    fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', keyCode: 229 });
    expect(userCount()).toBe(0);
    fireEvent.compositionEnd(box);
    fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', isComposing: true });
    expect(userCount()).toBe(0);
    fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', keyCode: 229 });
    expect(userCount()).toBe(0);
    // 確定したあとの Enter は送る
    fireEvent.change(box, { target: { value: '今日は無理' } });
    fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(userCount()).toBe(1);
    expect(box.value).toBe('');
  });

  it('送る人を切り替えると、その人の名前で発言が出る', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('送る人'), { target: { value: 'member_2' } });
    send('卵切れた');
    expect(talkLog().querySelector('[data-from="user"] .msg-name')?.textContent).toBe('パパ');
  });

  it('人を書かない「明日飲み会」は、送る人の欠席にする（誰かを聞き返さない）', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.change(screen.getByLabelText('送る人'), { target: { value: 'member_2' } });
    send('明日飲み会');
    const tue = saved().meals.find((m) => m.date === '2026-11-10')!;
    expect(tue.absentMemberIds).toEqual(['member_2']);
    const reply = [...talkLog().querySelectorAll('[data-from="bot"] .bubble--bot')].pop()?.textContent ?? '';
    expect(reply).not.toContain('誰が食べませんか');
    expect(reply).toContain('パパ');
  });

  it('ボタン（チップ）を押すと applyAction の返事が入る', () => {
    render(<App todayFn={todayFn} />);
    const chips = within(talkLog()).getAllByRole('button', { name: '今日のごはん' });
    fireEvent.click(chips[chips.length - 1]);
    const last = [...talkLog().querySelectorAll('[data-from="bot"]')].pop();
    expect(last?.querySelector('[data-card="meal"]')).not.toBeNull();
    expect(talkLog().querySelector('[data-from="user"]')?.textContent).toContain('今日のごはん');
  });

  it('リッチメニューの「今日のごはん」で今日の献立が届く', () => {
    render(<App todayFn={todayFn} />);
    const before = botCount();
    fireEvent.click(within(menu()).getByRole('button', { name: '今日のごはん' }));
    expect(botCount()).toBe(before + 1);
  });
});

describe('料理が1品もない日', () => {
  it('安全に出せる料理がない日も壊れずに描き、注意を見せる', () => {
    const state = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    const WED = '2026-11-11';
    const warning = '除外の条件に合う料理が見つかりませんでした。外食や買ってきたもので済ませてください';
    state.meals = state.meals.map((m) => (m.date === WED ? { ...m, dishIds: [], kind: 'normal', reasons: [], notes: [], warnings: [warning] } : m));
    state.chat.push({ id: 'msg_900', from: 'bot', text: '水曜の夕食です。', at: `${MONDAY}T09:00:00+09:00`, card: { kind: 'meal', date: WED } });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App todayFn={todayFn} />);

    const card = [...talkLog().querySelectorAll('[data-card="meal"]')].pop() as HTMLElement;
    expect(within(card).getByText('外食や買ってきたものでどうでしょう。')).toBeTruthy();
    expect(within(card).getByText('注意')).toBeTruthy();
    expect(within(card).getByText(warning)).toBeTruthy();
    const weekRow = [...talkLog().querySelectorAll('[data-card="week"] .week-row')][2] as HTMLElement;
    expect(weekRow.textContent).toContain('外食や買ってきたもの');
    expect(weekRow.textContent).toContain('注意');

    fireEvent.click(within(menu()).getByRole('button', { name: '今週の献立' }));
    const day = document.querySelector(`[data-sheet="week"] [data-date="${WED}"]`) as HTMLElement;
    expect(within(day).getByText(warning)).toBeTruthy();
    expect(within(day).queryByRole('button', { name: '作った' })).toBeNull();
  });
});

describe('デモの操作', () => {
  it('［翌日へ進む］で日付が1日進む', () => {
    render(<App todayFn={todayFn} />);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/9(月)');
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    expect(screen.getByTestId('demo-today').textContent).toBe('11/10(火)');
    expect(saved().today).toBe('2026-11-10');
    // 昨日の確認（作った／作らなかった）が届く
    expect(within(talkLog()).getByText(/は作りましたか？/)).toBeTruthy();
  });

  it('有料にすると、翌日へ進んだときに配信のメッセージが入る', () => {
    render(<App todayFn={todayFn} />);
    const plan = screen.getByRole('group', { name: 'プラン（デモ）' });
    fireEvent.click(within(plan).getByRole('button', { name: '有料' }));
    expect(saved().household.settings.plan).toBe('paid');
    expect(talkLog().querySelectorAll('.tag--push').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    expect(talkLog().querySelectorAll('.tag--push').length).toBeGreaterThan(0);
  });
});

describe('有料版の反応', () => {
  it('［ママ ◎］を押したあとも、まだ押していない［パパ ◎］が押せる', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'プラン（デモ）' })).getByRole('button', { name: '有料' }));
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    const ask = [...talkLog().querySelectorAll('[data-from="bot"]')].find((m) => /は作りましたか？/.test(m.textContent ?? '')) as HTMLElement;
    // 今日の配信にも［作った］があるので、昨日の確認のボタンには日付が付く
    fireEvent.click(within(ask).getByRole('button', { name: '11/9(月) 作った' }));
    fireEvent.click(within(talkLog()).getByRole('button', { name: 'ママ ◎' }));
    expect(within(talkLog()).getByText(/ほかの人の分もどうぞ/)).toBeTruthy();
    expect(within(talkLog()).queryByRole('button', { name: 'ママ ◎' })).toBeNull();
    fireEvent.click(within(talkLog()).getByRole('button', { name: 'パパ ◎' }));
    const record = saved().history.find((r) => r.date === MONDAY && r.status === 'cooked');
    expect(record?.reactions).toEqual([
      { memberId: 'member_1', reaction: 'great' },
      { memberId: 'member_2', reaction: 'great' },
    ]);
    // まだ押していない人（はると・ゆい）のボタンは残る
    expect(within(talkLog()).getByRole('button', { name: 'はると ◎' })).toBeTruthy();
    expect(within(talkLog()).queryByRole('button', { name: 'パパ ◎' })).toBeNull();
  });

  it('昨日の確認と今日の配信の両方に［作った］があるとき、昨日のボタンには日付を付ける（今日のボタンを押しても昨日にならない）', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'プラン（デモ）' })).getByRole('button', { name: '有料' }));
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    const bots = [...talkLog().querySelectorAll('[data-from="bot"]')] as HTMLElement[];
    const ask = bots.find((m) => /は作りましたか？/.test(m.textContent ?? '')) as HTMLElement;
    const push = bots.filter((m) => m.querySelector('.tag--push') && within(m).queryByRole('button', { name: '別のに' })).at(-1) as HTMLElement;
    const names = (el: HTMLElement) => within(el).getAllByRole('button').map((b) => b.textContent);
    expect(names(ask)).toEqual(['11/9(月) 作った', '11/9(月) 作らなかった']);
    expect(names(push)).toEqual(['作った', '別のに', '今日は無理']);
    // 日付のない［作った］は今日（11/10）の分
    fireEvent.click(within(push).getByRole('button', { name: '作った' }));
    expect(saved().meals.find((m) => m.date === '2026-11-10')?.status).toBe('cooked');
    expect(saved().meals.find((m) => m.date === MONDAY)?.status).toBe('unconfirmed');
  });

  it('同じ日の時刻は戻らない（夕方の配信のあとの書き込みは、配信より前の時刻にしない）', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'プラン（デモ）' })).getByRole('button', { name: '有料' }));
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: '作った' } });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
    // 日の区切りのあとは、朝の時刻から数え直す
    let prev = '';
    let checked = 0;
    for (const el of talkLog().querySelectorAll('.day-divider, .msg')) {
      if (el.classList.contains('day-divider')) {
        prev = '';
        continue;
      }
      const t = el.querySelector('.msg-time')?.textContent ?? '';
      if (!/^\d{2}:\d{2}$/.test(t)) continue;
      expect(t >= prev).toBe(true);
      prev = t;
      checked += 1;
    }
    expect(checked).toBeGreaterThan(3);
    // 「作った」は夕方の配信のあと（17時台以降）の時刻
    const users = [...talkLog().querySelectorAll('[data-from="user"] .msg-time')];
    expect(users.at(-1)?.textContent && users.at(-1)!.textContent! >= '17:00').toBe(true);
  });
});

describe('今週の献立', () => {
  it('差し替えの2案をその場で出し、選ぶと献立が変わる', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '今週の献立' }));
    const sheet = document.querySelector('[data-sheet="week"]') as HTMLElement;
    expect(sheet).not.toBeNull();
    const today = sheet.querySelector(`[data-date="${MONDAY}"]`) as HTMLElement;
    expect(within(today).getByRole('button', { name: '今日は無理' })).toBeTruthy();
    const before = saved().meals.find((m) => m.date === MONDAY)!.dishIds.join(',');
    fireEvent.click(within(today).getByRole('button', { name: '差し替え' }));
    const options = within(sheet).getByRole('group', { name: '11/9(月)の別の案' });
    const buttons = within(options).getAllByRole('button').filter((b) => b.classList.contains('alt-option'));
    expect(buttons.length).toBe(2);
    fireEvent.click(buttons[0]);
    expect(saved().meals.find((m) => m.date === MONDAY)!.dishIds.join(',')).not.toBe(before);
  });

  it('翌日へ進むと、過ぎた日に［作った］が出て、作ると ◎○△ で反応できる', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    fireEvent.click(within(menu()).getByRole('button', { name: '今週の献立' }));
    const sheet = document.querySelector('[data-sheet="week"]') as HTMLElement;
    const monday = () => sheet.querySelector(`[data-date="${MONDAY}"]`) as HTMLElement;
    expect(within(monday()).getByText('未確認')).toBeTruthy();
    fireEvent.click(within(monday()).getByRole('button', { name: '作った' }));
    expect(within(monday()).getByText('作った')).toBeTruthy();
    const great = within(monday()).getByRole('button', { name: /◎/ });
    fireEvent.click(great);
    const record = saved().history.find((r) => r.date === MONDAY && r.status === 'cooked');
    expect(record?.reactions).toEqual([{ memberId: 'household', reaction: 'great' }]);
    expect(within(monday()).getByRole('button', { name: /◎/ }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('週の振り返り', () => {
  /** 11/2(月) から始めて、11/9(月) まで進めた状態（先週の記録は onFirstDay で付ける）。 */
  function lastWeekState(onFirstDay?: (s: AppState) => AppState): AppState {
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, '2026-11-02');
    for (let i = 0; i < 7; i++) {
      s = advanceDay(s, defaultCatalog).state;
      if (i === 0 && onFirstDay) s = onFirstDay(s);
    }
    return s;
  }

  function lastWeekPanel(): HTMLElement {
    fireEvent.click(within(menu()).getByRole('button', { name: '今週の献立' }));
    return screen.getByRole('region', { name: '先週の振り返り' });
  }

  it('作った・作らなかったの記録がない週は「0日」と言わず、記録がないと出す', () => {
    const state = lastWeekState();
    expect(state.today).toBe(MONDAY);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App todayFn={todayFn} />);
    const panel = lastWeekPanel();
    expect(panel.textContent).toContain('5日分（作った・作らなかったの記録はありません）');
    expect(panel.textContent).not.toContain('0日');
    expect(within(panel).queryByText('考えずに済んだ日')).toBeNull();
  });

  it('記録が一部だけなら「記録のあった〇日のうち」と、記録のない日数を出す', () => {
    const state = lastWeekState((s) => applyAction(s, defaultCatalog, { type: 'cooked', date: '2026-11-02' }).state);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App todayFn={todayFn} />);
    const panel = lastWeekPanel();
    expect(panel.textContent).toContain('記録のあった1日のうち1日');
    expect(within(panel).getByText('記録なし')).toBeTruthy();
    expect(panel.textContent).toContain('4日');
  });
});

describe('買い物リスト', () => {
  it('売り場の見出しが AISLE_ORDER の順に並び、チェックできる', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '買い物リスト' }));
    const sheet = document.querySelector('[data-sheet="shopping"]') as HTMLElement;
    expect(within(sheet).getByRole('button', { name: /11\/9\(月\)の買い物/ })).toBeTruthy();
    const aisles = [...sheet.querySelectorAll('h3[data-aisle]')].map((h) => h.getAttribute('data-aisle') as string);
    expect(aisles.length).toBeGreaterThan(2);
    expect(aisles).toEqual(AISLE_ORDER.filter((a) => aisles.includes(a)));
    expect(within(sheet).getByText('家にあるか確認')).toBeTruthy();

    const box = within(sheet).getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect((within(sheet).getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true);
    const list = saved().shopping.find((l) => l.date === MONDAY)!;
    expect(list.items.filter((i) => i.checked).length).toBe(1);
    expect(saved().inventory.some((i) => i.ingredientId === list.items.find((x) => x.checked)!.ingredientId && i.level === 'plenty')).toBe(true);
  });

  it('［テキストでコピー］が使えないときは、テキスト欄を選択して案内する', async () => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
    });
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '買い物リスト' }));
    fireEvent.click(screen.getByRole('button', { name: 'テキストでコピー' }));
    await waitFor(() => expect(screen.getByText(/選択してコピーしてください/)).toBeTruthy());
    const area = screen.getByLabelText(/選択してコピーしてください/) as HTMLTextAreaElement;
    expect(area.value).toContain('11/9(月)の買い物');
    Reflect.deleteProperty(window.navigator, 'clipboard');
  });
});

describe('家族と設定', () => {
  it('Esc でシートを閉じてトークに戻る', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    expect(document.querySelector('[data-sheet="household"]')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('[data-sheet="household"]')).toBeNull();
    expect(window.location.hash).toBe('#talk');
  });

  it('householdNotices の注意を出す', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    const sheet = document.querySelector('[data-sheet="household"]') as HTMLElement;
    const notices = householdNotices(saved().household);
    expect(notices.length).toBeGreaterThan(0);
    for (const n of notices) expect(within(sheet).getByText(n.text)).toBeTruthy();
    expect(window.location.hash).toBe('#household');
  });

  it('設定を変えると今週の献立を作り直し、知らせを出す', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    const group = screen.getByRole('group', { name: 'ラク日の数' });
    fireEvent.click(within(group).getByRole('button', { name: '0日' }));
    const s = saved();
    expect(s.household.settings.rakuPerWeek).toBe(0);
    expect(s.meals.filter((m) => m.kind === 'raku').length).toBe(0);
    expect(screen.getByRole('status').textContent).toContain('献立も作り直しました');
  });

  it('これからの日がみんな外で食べる日だけなら、設定を変えても作り直さず、知らせも「作り直しました」と言わない', () => {
    // 金曜（その週の最後の献立日）に「今日はみんな外食」
    let s = createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
    for (let i = 0; i < 4; i++) s = advanceDay(s, defaultCatalog).state;
    s = handleUserText(s, defaultCatalog, '@きめとく 今日はみんな外食').state;
    const fri = s.meals.find((m) => m.date === s.today)!;
    expect(fri.absentMemberIds.length).toBe(4);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    render(<App todayFn={() => s.today} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'ラク日の数' })).getByRole('button', { name: '0日' }));
    expect(screen.getByRole('status').textContent).toBe('ラク日を週0日にしました。');
    expect(saved().meals.find((m) => m.date === s.today)!.dishIds).toEqual(fri.dishIds);
  });

  it('設定で作り直しても、自分で替えた日は残り、知らせでもそう言う', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '今週の献立' }));
    const sheet = document.querySelector('[data-sheet="week"]') as HTMLElement;
    const day = saved().meals.find((m) => m.date > MONDAY && m.kind === 'normal')!.date;
    const card = sheet.querySelector(`[data-date="${day}"]`) as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: '差し替え' }));
    const options = within(card).getAllByRole('button').filter((b) => b.classList.contains('alt-option'));
    fireEvent.click(options[0]);
    const chosen = saved().meals.find((m) => m.date === day)!;
    expect(chosen.changedBy).toBe('user');

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(within(screen.getByRole('group', { name: '新しい料理の数' })).getByRole('button', { name: '0品' }));
    expect(saved().meals.find((m) => m.date === day)!.dishIds).toEqual(chosen.dishIds);
    const toast = screen.getByRole('status').textContent ?? '';
    expect(toast).toContain('献立も作り直しました');
    expect(toast).toMatch(/自分で替えた日（.*\)）は、そのままです/);
  });

  it('除外の検索で「鶏肉」と入れると、アレルゲンとしての除外を先頭の候補に出す', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(screen.getAllByRole('button', { name: '直す' })[0]);
    const search = screen.getByLabelText('食材で除外する');
    fireEvent.change(search, { target: { value: '鶏肉' } });
    const results = screen.getByRole('group', { name: '食材の候補' });
    const first = within(results).getAllByRole('button')[0];
    expect(first.textContent).toContain('鶏肉（アレルゲン）を除外');
    expect(screen.getByText(/加工品・調味料に入っている分も除きます/)).toBeTruthy();
    fireEvent.click(first);
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(saved().household.members[0].exclusions).toContainEqual({ type: 'allergen', id: 'chicken' });
  });

  it('マスタにない語を除外に入れるときは、当たる食材があるかを見せる', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(screen.getAllByRole('button', { name: '直す' })[0]);
    const search = screen.getByLabelText('食材で除外する');
    fireEvent.change(search, { target: { value: 'パクチー' } });
    expect(screen.getByText('「パクチー」：当たる食材はありません。')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'きのこ' } });
    expect(screen.getByText(/「きのこ」：当たる食材：.*しいたけ/)).toBeTruthy();
    // 1語につないで書くと当たらないので、区切り方を添える
    fireEvent.change(search, { target: { value: 'ほうれん草とパクチー' } });
    expect(screen.getByText(/「ほうれん草とパクチー」：当たる食材はありません（いくつか書くときは「、」で区切ってください）。/)).toBeTruthy();
    fireEvent.change(search, { target: { value: 'ほうれん草、パクチー' } });
    expect(screen.getByText(/当たる食材：ほうれん草。名前で当たる料理：ほうれん草のおひたし。「パクチー」に当たる食材はありません。/)).toBeTruthy();
  });

  it('読み込みは、だめならその場でエラーを出し、リセットは2段階で確かめる', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    fireEvent.change(screen.getByLabelText('読み込み'), { target: { value: '{"version":2}' } });
    fireEvent.click(screen.getByRole('button', { name: '読み込む' }));
    expect(screen.getByRole('alert').textContent).toContain('version');

    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    expect(saved().today).toBe('2026-11-10');
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
    fireEvent.click(screen.getByRole('button', { name: '本当にリセットする' }));
    expect(saved().today).toBe(MONDAY);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/9(月)');
  });

  it('書き出したデータを読み込める', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    const exported = JSON.stringify(saved());
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(screen.getByRole('button', { name: '書き出す（JSON）' }));
    expect((screen.getByLabelText('書き出したデータ（JSON）') as HTMLTextAreaElement).value).toContain('"version": 1');
    fireEvent.change(screen.getByLabelText('読み込み'), { target: { value: exported } });
    fireEvent.click(screen.getByRole('button', { name: '読み込む' }));
    expect(saved().today).toBe('2026-11-10');
    expect(screen.getByTestId('demo-today').textContent).toBe('11/10(火)');
  });
});

describe('初回設定', () => {
  it('家族・買い物の曜日・定番・プランを入れて、注意を見てから始める', () => {
    window.location.hash = '#start';
    render(<App todayFn={() => '2026-11-10'} />);
    expect(screen.getByRole('heading', { name: 'はじめの設定' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('ニックネーム'), { target: { value: 'あきこ' } });
    fireEvent.click(screen.getByRole('button', { name: '卵' }));
    fireEvent.click(screen.getByLabelText(/卵：重い/));
    fireEvent.click(screen.getByRole('button', { name: 'できた' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByRole('heading', { name: /買い物に行く曜日/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.change(screen.getByLabelText('料理の名前で探す'), { target: { value: '生姜焼き' } });
    fireEvent.click(screen.getByRole('button', { name: /豚の生姜焼き/ }));
    fireEvent.change(screen.getByLabelText('料理の名前で探す'), { target: { value: 'おばあちゃんの煮しめ' } });
    fireEvent.click(screen.getByRole('button', { name: /「おばあちゃんの煮しめ」を追加/ }));
    expect(screen.getByText(/選んだ定番/).textContent).toContain('2品');
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    // 注意（安全を保証しない、重いアレルギーは対象外）
    const notes = screen.getByRole('note', { name: '始める前の注意' });
    expect(within(notes).getByText(/安全を保証するものではありません/)).toBeTruthy();
    expect(within(notes).getByText(/このプロトタイプの対象外です/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'この内容で始める' }));

    const s = saved();
    expect(s.today).toBe('2026-11-10');
    expect(s.household.members).toHaveLength(1);
    expect(s.household.members[0]).toMatchObject({ nickname: 'あきこ', exclusions: [{ type: 'allergen', id: 'egg', severe: true }] });
    expect(s.household.settings.shoppingWeekdays).toEqual([0, 3]);
    expect(s.household.customDishes.map((d) => d.name)).toEqual(['おばあちゃんの煮しめ']);
    expect(within(talkLog()).getByText(/はじめまして。きめとくです。/)).toBeTruthy();
  });

  it('「デモの家族で始める」でデモの状態に戻る（今の状態からは、ページの中で確かめてから）', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    window.location.hash = '#start';
    fireEvent(window, new HashChangeEvent('hashchange'));
    fireEvent.click(screen.getByRole('button', { name: 'デモの家族で始める' }));
    // 確認の前は変えない（UI-5）
    expect(saved().today).toBe('2026-11-10');
    fireEvent.click(screen.getByRole('button', { name: 'デモで始め直す' }));
    expect(saved().today).toBe(MONDAY);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/9(月)');
  });
});

describe('保存', () => {
  it('localStorage が例外を投げても描画でき、操作できる', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<App todayFn={todayFn} />);
    expect(within(talkLog()).getByText(/はじめまして。きめとくです。/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    expect(screen.getByTestId('demo-today').textContent).toBe('11/10(火)');
  });

  it('localStorage そのものが使えなくても描画できる', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      render(<App todayFn={todayFn} />);
      expect(within(talkLog()).getByText(/はじめまして。きめとくです。/)).toBeTruthy();
      send('今日は無理');
      expect(within(talkLog()).getByText(/今日はラクしましょう/)).toBeTruthy();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('壊れた保存データは使わず、デモで始める', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"version":1,"today":"x"}');
    render(<App todayFn={todayFn} />);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/9(月)');
  });

  it('保存した状態から再開する', () => {
    const { unmount } = render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    unmount();
    render(<App todayFn={todayFn} />);
    expect(screen.getByTestId('demo-today').textContent).toBe('11/10(火)');
  });
});

describe('案内（このプロトタイプについて）と幅', () => {
  it('重ねて開いた案内は、幅が広がったら閉じ、トークを操作できる', () => {
    const media = mockMatchMedia(false);
    render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: 'このプロトタイプについて' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(talkLayer().hasAttribute('inert')).toBe(true);
    media.set(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(talkLayer().hasAttribute('inert')).toBe(false);
    expect(demoBar().hasAttribute('inert')).toBe(false);
    send('卵切れた');
    expect(userCount()).toBe(1);
    // 幅を戻しても、閉じたまま
    media.set(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(talkLayer().hasAttribute('inert')).toBe(false);
  });

  it('広い画面では、案内を重ねて開かず、トークに inert を付けない', () => {
    mockMatchMedia(true);
    render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: 'このプロトタイプについて' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(talkLayer().hasAttribute('inert')).toBe(false);
  });
});

describe('フォーカス', () => {
  it('タイルからシートを開いて、Esc や［戻る］で閉じると、フォーカスがタイルに戻る', () => {
    render(<App todayFn={todayFn} />);
    const week = within(menu()).getByRole('button', { name: '今週の献立' });
    week.focus();
    fireEvent.click(week);
    expect((document.activeElement as HTMLElement).classList.contains('sheet-title')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('[data-sheet="week"]')).toBeNull();
    expect(document.activeElement).toBe(week);

    const shop = within(menu()).getByRole('button', { name: '買い物リスト' });
    shop.focus();
    fireEvent.click(shop);
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(document.activeElement).toBe(shop);
  });

  it('案内を開いているあいだは、デモの操作・トーク・シートにフォーカスが出ず、閉じると「?」に戻る', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '買い物リスト' }));
    const help = screen.getByRole('button', { name: 'このプロトタイプについて' });
    help.focus();
    fireEvent.click(help);
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: '閉じる' });
    expect(document.activeElement).toBe(close);
    expect(demoBar().hasAttribute('inert')).toBe(true);
    expect(talkLayer().hasAttribute('inert')).toBe(true);
    expect(document.querySelector('[data-sheet="shopping"]')?.closest('[inert]')).not.toBeNull();
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(demoBar().hasAttribute('inert')).toBe(false);
    expect(document.querySelector('[data-sheet="shopping"]')?.closest('[inert]')).toBeNull();
    expect(document.activeElement).toBe(help);
  });
});

describe('トークの古いカード', () => {
  const msg = (id: string, card?: ChatMessage['card']): ChatMessage => ({ id, from: 'bot', text: '', at: `${MONDAY}T09:00:00+09:00`, card });

  it('あとに同じ日の1日のカードか、その週の週のカードがあれば、前のカードを古いとみなす', () => {
    const chat = [
      msg('a', { kind: 'week', weekStart: MONDAY }),
      msg('b', { kind: 'meal', date: '2026-11-10' }),
      msg('c', { kind: 'meal', date: '2026-11-11' }),
      msg('d', { kind: 'meal', date: '2026-11-10' }),
      msg('e', { kind: 'week', weekStart: '2026-11-16' }),
      msg('f', { kind: 'shopping', date: MONDAY }),
      msg('g', { kind: 'shopping', date: MONDAY }),
      msg('h'),
    ];
    expect([...supersededCards(chat)]).toEqual(['b']);
    const later = [...chat, msg('i', { kind: 'week', weekStart: MONDAY })];
    expect([...supersededCards(later)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('あとで同じ日のカードが届いたら、前のカードは畳んで「いまの献立を見る」にする（文とカードを食い違わせない）', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '今日のごはん' }));
    send('今日は無理');
    const withMeal = [...talkLog().querySelectorAll('[data-from="bot"]')].filter((m) => m.querySelector('[data-card="meal"]'));
    const older = withMeal[withMeal.length - 2] as HTMLElement;
    const latest = withMeal[withMeal.length - 1] as HTMLElement;
    const fold = older.querySelector('details.card-fold') as HTMLDetailsElement;
    expect(fold).not.toBeNull();
    expect(fold.open).toBe(false);
    expect(fold.querySelector('summary')?.textContent).toBe('いまの献立を見る（11/9(月)）');
    expect(latest.querySelector('details.card-fold')).toBeNull();
    expect(latest.querySelector('[data-card="meal"] .badge--raku')).not.toBeNull();
  });
});

describe('AI の読み取りの文', () => {
  it('AI につながっていないときに「いつも AI」を選ぶと、ルールで読み取ると知らせる', async () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    await waitFor(() => expect(screen.getByTestId('ai-status').textContent).toContain('AI につながっていない'));
    fireEvent.click(screen.getByLabelText(/いつも AI/));
    expect(screen.getByRole('status').textContent).toBe('今は AI につながっていないので、ルールで読み取ります。');
    fireEvent.click(screen.getByLabelText(/使わない/));
    expect(screen.getByRole('status').textContent).toBe('AI を使わずに読み取ります。');
  });

  it('案内の AI の説明は、設定（おまかせ・いつも AI・使わない）に合わせて変わる', () => {
    render(<App todayFn={todayFn} />);
    const aboutAi = () => document.querySelector('.about-col [data-testid="about-ai-mode"]')?.textContent ?? '';
    expect(aboutAi()).toContain('ルールで読めない書き込みだけ Claude に');
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(screen.getByLabelText(/使わない/));
    expect(aboutAi()).toContain('AI を使わずにルールだけで読み取ります');
    fireEvent.click(screen.getByLabelText(/いつも AI/));
    expect(aboutAi()).toContain('毎回 Claude に読み取りを頼みます');
  });

  it('案内の「鶏むねが安い」の説明は、鶏肉の日がないとき（デモの週）の動きも書く', () => {
    render(<App todayFn={todayFn} />);
    expect(document.querySelector('.about-col')?.textContent).toContain('鶏肉の日（なければほかの肉の日）を、鶏むねを使う料理に替える提案をします。');
    send('鶏むねが安い');
    const reply = [...talkLog().querySelectorAll('[data-from="bot"] .bubble--bot')].pop()?.textContent ?? '';
    expect(reply).toMatch(/鶏むね.*に替えますか/);
  });
});

describe('リセットと画面の設定', () => {
  it('リセットで、AI の読み取りの設定・メニューの開閉も既定に戻る', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(screen.getByLabelText(/使わない/));
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    fireEvent.click(within(menu()).getByRole('button', { name: 'メニュー' }));
    expect(uiPrefs()).toMatchObject({ aiMode: 'off', menuOpen: false });
    window.location.hash = '#household';
    fireEvent(window, new HashChangeEvent('hashchange'));
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
    fireEvent.click(screen.getByRole('button', { name: '本当にリセットする' }));
    expect(uiPrefs()).toMatchObject({ aiMode: 'auto', menuOpen: true, senders: {} });
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    expect((screen.getByLabelText(/おまかせ/) as HTMLInputElement).checked).toBe(true);
  });

  it('設定で献立を作り直しても、トークに利用者の発言（献立を作り直す）は入らない', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'ラク日の数' })).getByRole('button', { name: '0日' }));
    const chat = saved().chat;
    expect(chat.some((m) => m.from === 'user')).toBe(false);
    expect(chat[chat.length - 1].card).toEqual({ kind: 'week', weekStart: MONDAY });
  });
});

describe('はじめての人への案内', () => {
  it('はじめての表示では「試し方を見る」を出し、案内を開いたら覚えて出さない', () => {
    const { unmount } = render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: '試し方を見る' }));
    const dialog = screen.getByRole('dialog');
    const first = dialog.querySelector('.try-list li') as HTMLElement;
    expect(first.textContent).toContain('自分の家族で始めてみる');
    expect(within(first).getByRole('button', { name: 'はじめから設定する' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '試し方を見る' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }));
    // 「試し方を見る」はもうないので、フォーカスは「?」へ
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'このプロトタイプについて' }));
    expect(uiPrefs().aboutSeen).toBe(true);
    unmount();
    render(<App todayFn={todayFn} />);
    expect(screen.queryByRole('button', { name: '試し方を見る' })).toBeNull();
  });

  it('案内の［はじめから設定する］で、初回設定が開く', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: 'このプロトタイプについて' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'はじめから設定する' }));
    expect(screen.getByRole('heading', { name: 'はじめの設定' })).toBeTruthy();
    expect(window.location.hash).toBe('#start');
  });

  it('広い画面では「試し方を見る」を出さない（案内が左に出ている）', () => {
    mockMatchMedia(true);
    render(<App todayFn={todayFn} />);
    expect(screen.queryByRole('button', { name: '試し方を見る' })).toBeNull();
    expect(uiPrefs().aboutSeen).toBe(true);
  });
});

describe('U3：幅が変わっても、フォーカスを BODY に落とさない', () => {
  /** 広い画面で左に出る案内の見出し。 */
  function aboutColHeading(): HTMLElement {
    return document.querySelector('.about-col .about-title') as HTMLElement;
  }

  function helpButton(): HTMLElement {
    return screen.getByRole('button', { name: 'このプロトタイプについて' });
  }

  function inertParts(): string[] {
    return [...document.querySelectorAll('[inert]')].map((e) => e.className);
  }

  it('左の案内の見出しは、フォーカスの行き先にできる（tabindex=-1）。重ねた案内の見出しは今までどおり', () => {
    mockMatchMedia(false);
    render(<App todayFn={todayFn} />);
    expect(aboutColHeading().getAttribute('tabindex')).toBe('-1');
    fireEvent.click(helpButton());
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'このプロトタイプについて' }).hasAttribute('tabindex')).toBe(false);
  });

  it('重ねた案内を開いたまま広げると、左の案内の見出しへ。狭く戻すと「?」へ。どこも inert にならない', () => {
    const media = mockMatchMedia(false);
    render(<App todayFn={todayFn} />);
    helpButton().focus();
    fireEvent.click(helpButton());
    expect(document.activeElement).toBe(within(screen.getByRole('dialog')).getByRole('button', { name: '閉じる' }));

    media.set(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(aboutColHeading());
    expect(inertParts()).toEqual([]);

    media.set(false);
    expect(document.activeElement).toBe(helpButton());
    expect(inertParts()).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();

    // もう一度広げても、BODY に落ちない（「?」は広い画面では出ない）
    media.set(true);
    expect(document.activeElement).toBe(aboutColHeading());
    send('卵切れた');
    expect(userCount()).toBe(1);
  });

  it('「試し方を見る」から開いて広げても、左の案内の見出しへ', () => {
    const media = mockMatchMedia(false);
    render(<App todayFn={todayFn} />);
    const hint = screen.getByRole('button', { name: '試し方を見る' });
    hint.focus();
    fireEvent.click(hint);
    media.set(true);
    expect(document.activeElement).toBe(aboutColHeading());
  });

  it('「?」や「試し方を見る」にフォーカスがあるまま広げても（案内は開かない）、左の案内の見出しへ', () => {
    const media = mockMatchMedia(false);
    render(<App todayFn={todayFn} />);
    helpButton().focus();
    media.set(true);
    expect(document.activeElement).toBe(aboutColHeading());
    media.set(false);
    expect(document.activeElement).toBe(helpButton());

    window.localStorage.clear();
    cleanup();
    const media2 = mockMatchMedia(false);
    render(<App todayFn={todayFn} />);
    screen.getByRole('button', { name: '試し方を見る' }).focus();
    media2.set(true);
    expect(screen.queryByRole('button', { name: '試し方を見る' })).toBeNull();
    expect(document.activeElement).toBe(aboutColHeading());
  });

  it('シートの上に案内を重ねて開いて広げても、左の案内の見出しへ。シートは操作できる（シートの層は inert でない）', () => {
    const media = mockMatchMedia(false);
    render(<App todayFn={todayFn} />);
    fireEvent.click(within(menu()).getByRole('button', { name: '今週の献立' }));
    helpButton().focus();
    fireEvent.click(helpButton());
    expect(document.querySelector('.sheet-layer')?.hasAttribute('inert')).toBe(true);
    media.set(true);
    expect(document.activeElement).toBe(aboutColHeading());
    // シートを開いているあいだ、トークは今までどおり inert。シートと、デモの操作は inert でない
    expect(inertParts()).toEqual(['talk-layer']);
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(document.querySelector('[data-sheet]')).toBeNull();
    expect(inertParts()).toEqual([]);
  });

  it('初回設定の画面で、左の案内にフォーカスがあるまま狭くすると、初回設定の見出しへ', () => {
    const media = mockMatchMedia(true);
    window.location.hash = '#start';
    render(<App todayFn={todayFn} />);
    const start = within(document.querySelector('.about-col') as HTMLElement).getByRole('button', { name: 'はじめから設定する' });
    start.focus();
    media.set(false);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'はじめの設定' }));
  });

  it('フォーカスがほかの所（書き込み欄）にあるとき、フォーカスがないときは、幅を変えても動かさない', () => {
    const media = mockMatchMedia(false);
    render(<App todayFn={todayFn} />);
    expect(document.activeElement).toBe(document.body);
    media.set(true);
    media.set(false);
    expect(document.activeElement).toBe(document.body);

    input().focus();
    media.set(true);
    expect(document.activeElement).toBe(input());
    media.set(false);
    expect(document.activeElement).toBe(input());
  });
});
