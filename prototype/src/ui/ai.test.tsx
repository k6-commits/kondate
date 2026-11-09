// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInitialState } from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import { AiReader, buildAiInstruction, dateTable, maskNames, toParsedCommands } from './ai';
import { App } from './App';

const MONDAY = '2026-11-09';
const NULLS = { date: null, memberRef: null, ingredientId: null, dishId: null, protein: null, genre: null };

function demo() {
  return createInitialState(DEMO_ONBOARDING, defaultCatalog, MONDAY);
}

type JsonFn = (input: string, options?: { modelTier?: string }) => Promise<unknown>;

function mockClaude(json: JsonFn) {
  const jsonMock = vi.fn(json);
  const sample = Object.assign(vi.fn(), { json: jsonMock });
  const use = vi.fn(async (name: string) => (name === 'sample' ? sample : null));
  (window as unknown as { claude?: unknown }).claude = { use };
  return { json: jsonMock, use };
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  delete (window as unknown as { claude?: unknown }).claude;
});

afterEach(() => {
  delete (window as unknown as { claude?: unknown }).claude;
  vi.restoreAllMocks();
});

describe('送る前の下ごしらえ', () => {
  it('ニックネームを長い順に member の id に置き換える', () => {
    const members = [
      { id: 'member_1', nickname: 'ママ' },
      { id: 'member_2', nickname: 'パパ' },
      { id: 'member_3', nickname: 'はると' },
      { id: 'member_4', nickname: 'はるとくん' },
    ];
    expect(maskNames('水曜はパパが飲み会、はるとくんは塾、はるとも', members)).toBe(
      '水曜はmember_2が飲み会、member_4は塾、member_3も',
    );
    // 短い名前が、置き換えた id の中に当たらない
    expect(maskNames('ぼくとmem', [{ id: 'member_1', nickname: 'ぼく' }, { id: 'member_2', nickname: 'mem' }])).toBe('member_1とmember_2');
  });

  it('今日から14日分の日付と曜日の表を作る', () => {
    const t = dateTable(MONDAY);
    expect(t).toHaveLength(14);
    expect(t[0]).toBe('2026-11-09(月) 今日・今週');
    expect(t[1]).toBe('2026-11-10(火) 明日・今週');
    expect(t[2]).toBe('2026-11-11(水) あさって・今週');
    expect(t[7]).toBe('2026-11-16(月) 来週');
    expect(t[13]).toBe('2026-11-22(日) 来週');
  });

  it('指示には日付の表・マスタ・出力の形が入り、家族の名前は入らない', () => {
    const s = demo();
    const text = buildAiInstruction(maskNames('水曜ははるとがいらない', s.household.members), s, defaultCatalog);
    expect(text).toContain('2026-11-09(月) 今日・今週');
    expect(text).toContain('chicken_breast：鶏むね肉');
    expect(text).toContain('karaage：');
    expect(text).toContain('"type":"absence"');
    expect(text).toContain('{"id":"member_3","ageBand":"child","role":"child"}');
    expect(text.endsWith('水曜はmember_3がいらない')).toBe(true);
    for (const m of s.household.members) expect(text).not.toContain(m.nickname);
  });

  it('世帯が自由入力した料理名に入った名前も置き換える', () => {
    const s = createInitialState({ ...DEMO_ONBOARDING, customFavoriteNames: ['はるとの好きな焼きそば'] }, defaultCatalog, MONDAY);
    const text = buildAiInstruction('土曜はおでかけ', s, defaultCatalog);
    expect(text).toContain('custom_1：member_3の好きな焼きそば');
    expect(text).not.toContain('はると');
  });

  it('AI の出力の null を落として ParsedCommand にする', () => {
    const cmds = toParsedCommands({
      commands: [
        { type: 'absence', ...NULLS, date: '2026-11-11', memberRef: 'member_2' },
        { type: 'sale', ...NULLS, ingredientId: 'chicken_breast' },
        { type: 'request', ...NULLS, date: '2026-11-13', protein: 'fish' },
        { type: 'want_alternatives', ...NULLS },
        { type: 'absence', ...NULLS, date: '2026-11-11' }, // memberRef がない
        { type: 'unknown', ...NULLS },
        { type: 'drop_tables' },
        'show_week',
      ],
    });
    expect(cmds).toEqual([
      { type: 'absence', date: '2026-11-11', memberRef: 'member_2' },
      { type: 'sale', ingredientId: 'chicken_breast' },
      { type: 'request', date: '2026-11-13', protein: 'fish' },
      { type: 'want_alternatives' },
    ]);
    expect(toParsedCommands(null)).toEqual([]);
    expect(toParsedCommands('{"commands":[]}')).toEqual([]);
  });
});

describe('AiReader', () => {
  it('Artifact の sample が使えれば、検証した命令を返す', async () => {
    const { json } = mockClaude(async () => ({
      commands: [
        { type: 'sale', ...NULLS, ingredientId: 'chicken_breast' },
        { type: 'sale', ...NULLS, ingredientId: 'no_such_food' },
      ],
    }));
    const reader = new AiReader({ parseApi: undefined });
    reader.start();
    await waitFor(() => expect(reader.status).toBe('claude'));
    const r = await reader.read('鶏むねがお買い得', demo(), defaultCatalog);
    expect(r).toEqual({ commands: [{ type: 'sale', ingredientId: 'chicken_breast' }], source: 'ai' });
    expect(json).toHaveBeenCalledWith(expect.stringContaining('鶏むねがお買い得'), { modelTier: 'quick' });
  });

  it('検証で1件も残らなければルールに戻る', async () => {
    mockClaude(async () => ({ commands: [{ type: 'absence', ...NULLS, date: '1999-01-01', memberRef: 'member_1' }] }));
    const reader = new AiReader({ parseApi: undefined });
    reader.start();
    await waitFor(() => expect(reader.status).toBe('claude'));
    expect(await reader.read('むかしの話', demo(), defaultCatalog)).toEqual({ commands: null, source: 'rules' });
  });

  it('rate_limited は知らせてルールで処理し、AI は止めない。invalid_json はその1回だけルール', async () => {
    let code = 'rate_limited';
    const { json } = mockClaude(async () => {
      throw { code, message: 'x' };
    });
    const reader = new AiReader({ parseApi: undefined });
    reader.start();
    await waitFor(() => expect(reader.status).toBe('claude'));
    const r1 = await reader.read('うーん', demo(), defaultCatalog);
    expect(r1.source).toBe('rules');
    expect(r1.notice).toMatch(/混み合っている/);
    expect(reader.status).toBe('claude');
    code = 'invalid_json';
    const r2 = await reader.read('うーん', demo(), defaultCatalog);
    expect(r2).toEqual({ commands: null, source: 'rules' });
    expect(reader.status).toBe('claude');
    expect(json).toHaveBeenCalledTimes(2);
  });

  it('use("sample") が null なら AI なし', async () => {
    (window as unknown as { claude?: unknown }).claude = { use: vi.fn(async () => null) };
    const reader = new AiReader({ parseApi: undefined });
    reader.start();
    await waitFor(() => expect(reader.status).toBe('none'));
    expect(reader.available).toBe(false);
  });

  it('開発用のサーバーがあれば POST し、source が llm のときだけ AI として使う', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ commands: [{ type: 'show_shopping' }], source: 'llm' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const reader = new AiReader({ parseApi: 'http://localhost:8787/api/parse' });
      reader.start();
      expect(reader.status).toBe('server');
      const s = demo();
      const r = await reader.read('買うものは？', s, defaultCatalog);
      expect(r).toEqual({ commands: [{ type: 'show_shopping' }], source: 'ai' });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('http://localhost:8787/api/parse');
      expect(JSON.parse(init.body as string)).toEqual({ text: '買うものは？', today: MONDAY, members: s.household.members });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('画面での AI の読み取り', () => {
  function send(text: string) {
    fireEvent.change(screen.getByLabelText('きめとくへの書き込み'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
  }
  const log = () => screen.getByRole('log', { name: 'トーク' });
  const form = () => document.querySelector('form.composer') as HTMLFormElement;

  it('sample が commands を返すと「AIで読み取り」の印が付く', async () => {
    const { json } = mockClaude(async () => ({ commands: [{ type: 'show_week', ...NULLS }] }));
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    const weekCards = log().querySelectorAll('[data-card="week"]').length;

    // ルールで読める書き込みは、おまかせでは AI を呼ばない
    send('卵切れた');
    expect(within(log()).getByText('ルールで読み取り')).toBeTruthy();
    expect(json).not.toHaveBeenCalled();

    send('ふわふわのやつ');
    await waitFor(() => expect(within(log()).getByText('AIで読み取り')).toBeTruthy());
    expect(json).toHaveBeenCalledTimes(1);
    expect(json.mock.calls[0][1]).toEqual({ modelTier: 'quick' });
    expect(log().querySelectorAll('[data-card="week"]').length).toBe(weekCards + 1);
    // 送った文は chat に残る（AI に送るのは名前を置き換えた本文）
    expect(log().querySelectorAll('[data-from="user"]')[1].textContent).toContain('ふわふわのやつ');
  });

  it('読み取りのあいだは送信ボタンが「読み取り中…」になり、二重送信しない', async () => {
    let release: (v: unknown) => void = () => {};
    const { json } = mockClaude(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    send('ふわふわのやつ');
    const busy = screen.getByRole('button', { name: '読み取り中…' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    // 待っているあいだに Enter や例のチップで送ろうとしても、送らない
    const box = screen.getByLabelText('きめとくへの書き込み');
    fireEvent.change(box, { target: { value: 'もういっかい' } });
    fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', keyCode: 13 });
    const examples = screen.getByRole('group', { name: 'ためしに送る書き込み' });
    fireEvent.click(within(examples).getByRole('button', { name: '卵切れた' }));
    expect(json).toHaveBeenCalledTimes(1);
    release({ commands: [] });
    await waitFor(() => expect(screen.getByRole('button', { name: '送る' })).toBeTruthy());
    expect(log().querySelectorAll('[data-from="user"]').length).toBe(1);
    expect(within(log()).getByText('ルールで読み取り')).toBeTruthy();
  });

  it('not_granted で失敗したらルールで処理し、それ以降は AI を呼ばない', async () => {
    const { json } = mockClaude(async () => {
      throw { code: 'not_granted', message: 'The viewer declined.' };
    });
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));

    send('ふわふわのやつ');
    await waitFor(() => expect(within(log()).getAllByText('ルールで読み取り')).toHaveLength(1));
    expect(within(log()).getByText(/うまく読み取れませんでした/)).toBeTruthy();
    expect(json).toHaveBeenCalledTimes(1);
    expect(form().getAttribute('data-ai-status')).toBe('blocked');

    send('なんかいい感じにして');
    await waitFor(() => expect(within(log()).getAllByText('ルールで読み取り')).toHaveLength(2));
    expect(json).toHaveBeenCalledTimes(1);

    fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByRole('button', { name: '家族と設定' }));
    expect(screen.getByTestId('ai-status').textContent).toContain('この画面では AI を使えません');
  });

  it('「使わない」にすると AI を呼ばない', async () => {
    const { json } = mockClaude(async () => ({ commands: [{ type: 'show_week', ...NULLS }] }));
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(screen.getByLabelText(/使わない/));
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    send('ふわふわのやつ');
    expect(within(log()).getByText('ルールで読み取り')).toBeTruthy();
    expect(json).not.toHaveBeenCalled();
  });
});
