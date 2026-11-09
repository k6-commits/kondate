// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AppState } from '../engine';
import { AISLE_ORDER, createInitialState, householdNotices } from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import { App, ROUTES } from './App';
import { STORAGE_KEY } from './storage';

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

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  delete (window as unknown as { claude?: unknown }).claude;
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it('「金曜はカレーがいい」は、卵アレルギーの家なので「要確認」として断る', () => {
    render(<App todayFn={todayFn} />);
    const examples = screen.getByRole('group', { name: 'ためしに送る書き込み' });
    fireEvent.click(within(examples).getByRole('button', { name: '金曜はカレーがいい' }));
    expect(within(talkLog()).getByText(/「要確認」.*提案していません/)).toBeTruthy();
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

  it('「デモの家族で始める」でデモの状態に戻る', () => {
    render(<App todayFn={todayFn} />);
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    window.location.hash = '#start';
    fireEvent(window, new HashChangeEvent('hashchange'));
    fireEvent.click(screen.getByRole('button', { name: 'デモの家族で始める' }));
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
