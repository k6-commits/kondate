// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { advanceDay, createInitialState, handleUserText } from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import type { AppState } from '../engine';
import {
  AiReader,
  RULES_UNREAD_REPLY,
  SESSION_EXPIRED_NOTICE,
  SMALL_TALK_REPLIES,
  buildAiInstruction,
  checkMemberRefs,
  dateTable,
  maskNames,
  readableByRules,
  toParsedCommands,
} from './ai';
import { App } from './App';
import { STORAGE_KEY } from './storage';

const MONDAY = '2026-11-09';
const NULLS = {
  date: null,
  memberRef: null,
  ingredientId: null,
  dishId: null,
  protein: null,
  genre: null,
  cancel: null,
  question: null,
  frozen: null,
};

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

  it('エンジンが同じ人とみなす表記ゆれ（ひらがな・カタカナ・半角カナ・全角英字・大文字小文字）も id に置き換える', () => {
    const ms = demo().household.members; // ママ・パパ・はると・ゆい
    expect(maskNames('週末にユイの誕生日なので何か考えて', ms)).toBe('週末にmember_4の誕生日なので何か考えて');
    expect(maskNames('ハルトの好きなものを増やしたい', ms)).toBe('member_3の好きなものを増やしたい');
    expect(maskNames('ﾊﾟﾊﾟの好物を週末に', ms)).toBe('member_2の好物を週末に');
    expect(maskNames('ぱぱの好物を週末に', ms)).toBe('member_2の好物を週末に');
    expect(maskNames('ＫＥＮは出張、kenの分はなし', [{ id: 'member_9', nickname: 'Ken' }])).toBe('member_9は出張、member_9の分はなし');
  });

  it('1文字の名前は、かなでないとき（漢字・英字）だけ置き換える（かな1文字は、ほかの言葉を壊すので置き換えない）', () => {
    expect(maskNames('ゆでたまご', [{ id: 'member_1', nickname: 'ゆ' }])).toBe('ゆでたまご');
    expect(maskNames('ユでたまご', [{ id: 'member_1', nickname: 'ユ' }])).toBe('ユでたまご');
    expect(maskNames('翔は部活', [{ id: 'member_5', nickname: '翔' }])).toBe('member_5は部活');
    // 英字1文字はエンジンが名前として読む（「明日はKがいない」）ので、全角・小文字も含めて置き換える
    expect(maskNames('明日はKがいない、Ｋの好物は？ kも', [{ id: 'member_4', nickname: 'K' }])).toBe(
      '明日はmember_4がいない、member_4の好物は? member_4も',
    );
  });

  it('名前のかなを含む、よくある言葉（そのまま・ぱぱっと・わがまま）は置き換えない。名前は置き換える', () => {
    const ms = demo().household.members; // ママ（member_1）・パパ（member_2）・はると・ゆい
    for (const t of [
      '今日はぱぱっと作れるものがいい',
      'パパッと作れるのがいい',
      '今日はそのままでいい',
      'このままでいい',
      'わがまま言っていい?',
      'ワガママ言っていい?',
      '鮭は生のままある',
      '冷凍したままの鶏もも',
      '解凍しないままでいい',
    ]) {
      expect(maskNames(t, ms)).toBe(t);
    }
    expect(maskNames('ママ、そのままでいい', ms)).toBe('member_1、そのままでいい');
    expect(maskNames('ぱぱって今日いる?', ms)).toBe('member_2って今日いる?');
    expect(maskNames('明日はぱぱが飲み会、ままは家', ms)).toBe('明日はmember_2が飲み会、member_1は家');
    expect(maskNames('うちのママとパパ', ms)).toBe('うちのmember_1とmember_2');
    expect(maskNames('はるとがそのまま食べる', ms)).toBe('member_3がそのまま食べる');
    // 名前そのものがよくある言葉と同じなら、名前として置き換える
    expect(maskNames('わがままが来る', [{ id: 'member_7', nickname: 'わがまま' }])).toBe('member_7が来る');
  });

  it('AI に送る文に、表記ゆれの名前が残らない', () => {
    const s = demo();
    const text = buildAiInstruction(maskNames('ハルトとﾕｲの好きなものを、ぱぱの帰りが早い日に', s.household.members), s, defaultCatalog);
    expect(text.endsWith('member_3とmember_4の好きなものを、member_2の帰りが早い日に')).toBe(true);
    for (const name of ['ハルト', 'ﾕｲ', 'ユイ', 'ぱぱ', 'パパ', 'はると', 'ゆい', 'ママ']) expect(text).not.toContain(name);
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

  it('欠席の取り消し・在庫の質問・冷凍・料理で指した別の案・食材を名指ししたリクエストも渡す', () => {
    const cmds = toParsedCommands({
      commands: [
        { type: 'absence', ...NULLS, date: '2026-11-12', memberRef: 'member_3', cancel: true },
        { type: 'have', ...NULLS, ingredientId: 'tofu_firm', question: true },
        { type: 'out_of_stock', ...NULLS, ingredientId: 'egg', question: true },
        { type: 'have', ...NULLS, ingredientId: 'chicken_thigh', frozen: true },
        { type: 'sale', ...NULLS, ingredientId: 'egg', question: true },
        { type: 'want_alternatives', ...NULLS, dishId: 'keema_curry' },
        { type: 'request', ...NULLS, date: '2026-11-10', ingredientId: 'mackerel' },
        { type: 'absence', ...NULLS, date: '2026-11-12', memberRef: 'member_3', cancel: 'yes' }, // true のときだけ
      ],
    });
    expect(cmds).toEqual([
      { type: 'absence', date: '2026-11-12', memberRef: 'member_3', cancel: true },
      { type: 'have', ingredientId: 'tofu_firm', question: true },
      { type: 'out_of_stock', ingredientId: 'egg', question: true },
      { type: 'have', ingredientId: 'chicken_thigh', frozen: true },
      { type: 'sale', ingredientId: 'egg' },
      { type: 'want_alternatives', dishId: 'keema_curry' },
      { type: 'request', date: '2026-11-10', ingredientId: 'mackerel' },
      { type: 'absence', date: '2026-11-12', memberRef: 'member_3' },
    ]);
  });

  it('家族にいない member の id の欠席は使わない。id がいくつかなら1人ずつに分ける', () => {
    const ms = demo().household.members;
    const cmds = checkMemberRefs(
      [
        { type: 'absence', date: '2026-11-10', memberRef: 'member_9' },
        { type: 'absence', date: '2026-11-10', memberRef: 'member_0' },
        { type: 'absence', date: '2026-11-11', memberRef: 'member_2とmember_9' },
        { type: 'absence', date: '2026-11-12', memberRef: 'member_2とmember_3', cancel: true },
        { type: 'absence', date: '2026-11-13', memberRef: 'Member_4さん' },
        { type: 'absence', date: '2026-11-13', memberRef: '夫' },
        { type: 'sale', ingredientId: 'chicken_breast' },
      ],
      ms,
    );
    expect(cmds).toEqual([
      { type: 'absence', date: '2026-11-12', memberRef: 'member_2', cancel: true },
      { type: 'absence', date: '2026-11-12', memberRef: 'member_3', cancel: true },
      { type: 'absence', date: '2026-11-13', memberRef: 'member_4' },
      { type: 'absence', date: '2026-11-13', memberRef: '夫' },
      { type: 'sale', ingredientId: 'chicken_breast' },
    ]);
  });

  it('書き方を変えた id（member-9・member９・メンバー9）や数字のない「member」も、家族にいなければ使わない', () => {
    const ms = demo().household.members;
    const cmds = checkMemberRefs(
      [
        { type: 'absence', date: '2026-11-10', memberRef: 'member-9' },
        { type: 'absence', date: '2026-11-10', memberRef: 'member９' },
        { type: 'absence', date: '2026-11-10', memberRef: 'member 9' },
        { type: 'absence', date: '2026-11-10', memberRef: 'メンバー9' },
        { type: 'absence', date: '2026-11-10', memberRef: 'ﾒﾝﾊﾞｰ9' },
        { type: 'absence', date: '2026-11-10', memberRef: 'member' },
        { type: 'absence', date: '2026-11-10', memberRef: 'member_02' },
        { type: 'absence', date: '2026-11-11', memberRef: 'ｍｅｍｂｅｒ＿２' },
        { type: 'absence', date: '2026-11-11', memberRef: 'member-3' },
        { type: 'absence', date: '2026-11-12', memberRef: 'メンバー1・メンバー4' },
        { type: 'absence', date: '2026-11-13', memberRef: 'みんな' },
      ],
      ms,
    );
    expect(cmds).toEqual([
      { type: 'absence', date: '2026-11-11', memberRef: 'member_2' },
      { type: 'absence', date: '2026-11-11', memberRef: 'member_3' },
      { type: 'absence', date: '2026-11-12', memberRef: 'member_1' },
      { type: 'absence', date: '2026-11-12', memberRef: 'member_4' },
      { type: 'absence', date: '2026-11-13', memberRef: 'みんな' },
    ]);
  });

  it('エンジンの返事の書き出し（読めなかった・あいさつ）が、画面の判定と合っている', () => {
    const s = demo();
    expect(handleUserText(s, defaultCatalog, '@きめとく あのさー').replies[0].text.startsWith(RULES_UNREAD_REPLY)).toBe(true);
    expect(handleUserText(s, defaultCatalog, '@きめとく ありがとう').replies[0].text.startsWith(SMALL_TALK_REPLIES[0])).toBe(true);
    expect(handleUserText(s, defaultCatalog, '了解').replies[0].text.startsWith(SMALL_TALK_REPLIES[1])).toBe(true);
  });

  it('おまかせ：前日の確認への答えと短いあいさつは、ルールで読めたとみなす（AI に送らない）', () => {
    const s = demo();
    const next = advanceDay(s, defaultCatalog).state; // 火曜。「昨日のさばの味噌煮は作りましたか？」が来ている
    const readable = (st: AppState, t: string) => readableByRules(st, defaultCatalog, `@きめとく ${t}`);
    expect(readable(next, '作った')).toBe(true);
    expect(readable(next, '作らなかった')).toBe(true);
    expect(readable(next, '昨日は無理だった')).toBe(true);
    expect(readable(next, 'ありがとう')).toBe(true);
    expect(readable(next, 'いつもありがとう！')).toBe(true);
    expect(readable(s, '卵切れた')).toBe(true);
    // ルールで読めない、あいさつに用件がついている
    expect(readable(next, 'あのさー')).toBe(false);
    expect(readable(next, '今日はぱぱっと作れるものがいい')).toBe(false);
    expect(readable(next, 'ありがとう、明日はぱぱっと作れるのがいい')).toBe(false);
    // 試すだけで、state は変えない
    expect(next.chat.some((m) => m.from === 'user')).toBe(false);
  });

  it('「明日の夕飯なに？」のような、日付つきの見るだけの命令は、日付も渡す（サーバーの toParsedCommand と同じ）', () => {
    const cmds = toParsedCommands({
      commands: [
        { type: 'show_today', ...NULLS, date: '2026-11-10' },
        { type: 'show_shopping', ...NULLS, date: '2026-11-12' },
        { type: 'show_today', ...NULLS },
      ],
    });
    expect(cmds).toEqual([
      { type: 'show_today', date: '2026-11-10' },
      { type: 'show_shopping', date: '2026-11-12' },
      { type: 'show_today' },
    ]);
  });

  it('指示に、遅くなるだけ・決まっていない・人を書かない欠席の決まりと、みんな外で食べる日の戻し方が入る（サーバーの指示と同じ）', () => {
    const text = buildAiInstruction('水曜はmember_3が塾', demo(), defaultCatalog);
    expect(text).toContain('「塾」「部活」「残業」「帰りが遅い」');
    expect(text).toContain('「〜かも」「未定」');
    expect(text).toContain('memberRef を推測で埋めない');
    expect(text).toContain('「今日はいらない」は today_impossible にしない');
    expect(text).toContain('「金曜はみんないる」「金曜はやっぱり家で食べる」「金曜の外食なくなった」');
    expect(text).toContain('「明日の夕飯なに？」→ 明日');
  });

  it('指示に、取り消し・質問・冷凍の項目と、過ぎたことでは献立を変えない決まりが入る', () => {
    const s = demo();
    const text = buildAiInstruction('豆腐あったっけ？', s, defaultCatalog);
    expect(text).toContain('"cancel":null,"question":null,"frozen":null');
    expect(text).toContain('question を true');
    expect(text).toContain('cancel を true');
    expect(text).toContain('frozen を true');
    expect(text).toContain('today_impossible・want_alternatives・absence を出さない');
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

  it('家族にいない member の id の欠席（member_9）は使わず、ルールに戻る', async () => {
    mockClaude(async () => ({ commands: [{ type: 'absence', ...NULLS, date: '2026-11-10', memberRef: 'member_9' }] }));
    const reader = new AiReader({ parseApi: undefined });
    reader.start();
    await waitFor(() => expect(reader.status).toBe('claude'));
    expect(await reader.read('あのさー', demo(), defaultCatalog)).toEqual({ commands: null, source: 'rules' });
  });

  it('session_expired はログインし直すように1回だけ知らせ、AI は止めない（次の書き込みでまた頼む。自分では再試行しない）', async () => {
    let fail = true;
    const { json } = mockClaude(async () => {
      if (fail) throw { code: 'session_expired', message: 'x' };
      return { commands: [] };
    });
    const reader = new AiReader({ parseApi: undefined });
    reader.start();
    await waitFor(() => expect(reader.status).toBe('claude'));
    const r1 = await reader.read('うーん', demo(), defaultCatalog);
    expect(r1).toEqual({ commands: null, source: 'rules', notice: SESSION_EXPIRED_NOTICE });
    expect(r1.notice).toMatch(/ログインし直す/);
    expect(reader.status).toBe('claude');
    expect(json).toHaveBeenCalledTimes(1);
    // 続けて切れているあいだは、もう知らせない
    expect(await reader.read('うーん', demo(), defaultCatalog)).toEqual({ commands: null, source: 'rules' });
    // ログインし直して読めたあと、また切れたら、また知らせる
    fail = false;
    await reader.read('うーん', demo(), defaultCatalog);
    fail = true;
    expect((await reader.read('うーん', demo(), defaultCatalog)).notice).toBe(SESSION_EXPIRED_NOTICE);
    expect(json).toHaveBeenCalledTimes(4);
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

  it('おまかせでは、前日の確認への答え（作った・昨日は無理だった）とお礼を AI に送らない。AI が読みちがえても今日の献立は変わらない', async () => {
    // AI は「今日は無理」と読みちがえる（呼ばれたら、今日の献立が変わってしまう）
    const { json } = mockClaude(async () => ({ commands: [{ type: 'today_impossible', ...NULLS }] }));
    const saved = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as AppState;
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    const tuesday = saved().meals.find((m) => m.date === '2026-11-10')?.dishIds;

    send('昨日は無理だった');
    await waitFor(() => expect(within(log()).getAllByText('ルールで読み取り')).toHaveLength(1));
    expect(json).not.toHaveBeenCalled();
    expect(saved().meals.find((m) => m.date === '2026-11-09')?.status).toBe('skipped');
    expect(saved().meals.find((m) => m.date === '2026-11-10')?.dishIds).toEqual(tuesday);

    send('ありがとう');
    await waitFor(() => expect(within(log()).getAllByText('ルールで読み取り')).toHaveLength(2));
    expect(within(log()).getByText(/どういたしまして/)).toBeTruthy();
    expect(json).not.toHaveBeenCalled();

    // ルールで読めない書き込みは、今までどおり AI に頼む
    send('ふわふわのやつ');
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
  });

  it('おまかせで「作った」と答えても AI を呼ばず、昨日を作ったと記録する', async () => {
    const { json } = mockClaude(async () => ({ commands: [] }));
    const saved = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as AppState;
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    fireEvent.click(screen.getByRole('button', { name: '翌日へ進む' }));
    send('作った');
    await waitFor(() => expect(within(log()).getByText(/おつかれさまでした/)).toBeTruthy());
    expect(screen.queryByText('読み取り中…')).toBeNull();
    expect(json).not.toHaveBeenCalled();
    expect(saved().meals.find((m) => m.date === '2026-11-09')?.status).toBe('cooked');
  });

  it('session_expired は、ログインし直すようにトーストで知らせ、ルールで返事する', async () => {
    mockClaude(async () => {
      throw { code: 'session_expired', message: 'x' };
    });
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    send('ふわふわのやつ');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('ログインし直すと'));
    expect(within(log()).getByText('ルールで読み取り')).toBeTruthy();
    expect(form().getAttribute('data-ai-status')).toBe('claude');
  });

  it('AI が家族にいない member（member_9）を返しても、返事に id を出さない', async () => {
    mockClaude(async () => ({ commands: [{ type: 'absence', ...NULLS, date: '2026-11-10', memberRef: 'member_9' }] }));
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    send('あのさー');
    await waitFor(() => expect(within(log()).getByText('ルールで読み取り')).toBeTruthy());
    expect(log().textContent).not.toContain('member_');
    expect(within(log()).getByText(/うまく読み取れませんでした/)).toBeTruthy();
  });

  it.each(['member-9', 'メンバー9'])('AI が id の書き方を変えても（%s）、返事に出さない', async (memberRef) => {
    mockClaude(async () => ({ commands: [{ type: 'absence', ...NULLS, date: '2026-11-10', memberRef }] }));
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    send('あのさー');
    await waitFor(() => expect(within(log()).getByText('ルールで読み取り')).toBeTruthy());
    expect(log().textContent).not.toMatch(/member|メンバー/i);
    expect(within(log()).getByText(/うまく読み取れませんでした/)).toBeTruthy();
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

  it('画面から送るときも、表記ゆれの名前（カタカナ）を AI に送らない', async () => {
    const { json } = mockClaude(async () => ({ commands: [] }));
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    send('ハルトの好きなものを増やしたい');
    await waitFor(() => expect(within(log()).getByText('ルールで読み取り')).toBeTruthy());
    expect(json).toHaveBeenCalledTimes(1);
    const sent = json.mock.calls[0][0] as string;
    expect(sent.endsWith('member_3の好きなものを増やしたい')).toBe(true);
    expect(sent).not.toContain('ハルト');
  });

  it('読み取りのあいだにリセットしたら、前の状態で読んだ結果は入れない。読み取り中は［翌日へ進む］を押せない', async () => {
    let release: (v: unknown) => void = () => {};
    mockClaude(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const saved = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as AppState;
    const advance = () => screen.getByRole('button', { name: '翌日へ進む' }) as HTMLButtonElement;
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    send('ふわふわのやつ');
    expect(advance().disabled).toBe(true);
    fireEvent.click(advance());
    expect(saved().today).toBe(MONDAY);

    fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByRole('button', { name: '家族と設定' }));
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
    fireEvent.click(screen.getByRole('button', { name: '本当にリセットする' }));
    const afterReset = saved().chat.length;
    // リセット前の状態で読んだ「明日はパパ（member_2）がいない」が戻ってくる
    release({ commands: [{ type: 'absence', ...NULLS, date: '2026-11-10', memberRef: 'member_2' }] });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('さっきの書き込みは使いませんでした'));
    const s = saved();
    expect(s.chat.length).toBe(afterReset);
    expect(s.chat.some((m) => m.from === 'user')).toBe(false);
    expect(s.meals.every((m) => m.absentMemberIds.length === 0)).toBe(true);
    expect(advance().disabled).toBe(false);
  });

  it('読み取りのあいだに家族を外したり、データを読み込んだりしても、前の状態で読んだ結果は入れない', async () => {
    const saved = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as AppState;
    const openHousehold = () =>
      fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByRole('button', { name: '家族と設定' }));
    for (const change of ['外す', '読み込む'] as const) {
      let release: (v: unknown) => void = () => {};
      mockClaude(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const { unmount } = render(<App todayFn={() => MONDAY} />);
      await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
      const exported = JSON.stringify(saved());
      send('ふわふわのやつ');
      openHousehold();
      if (change === '外す') {
        // パパ（member_2）を外す。読み取りの結果は「member_2 がいない」なので、入れると外した人を指してしまう。
        const card = [...document.querySelectorAll('[data-sheet="household"] .member-card')].find(
          (c) => c.querySelector('.member-name')?.textContent === 'パパ',
        ) as HTMLElement;
        fireEvent.click(within(card).getByRole('button', { name: '外す' }));
        fireEvent.click(within(screen.getByRole('group', { name: 'パパを外すかの確認' })).getByRole('button', { name: '外す' }));
      } else {
        fireEvent.change(screen.getByLabelText('読み込み'), { target: { value: exported } });
        fireEvent.click(screen.getByRole('button', { name: '読み込む' }));
      }
      const before = saved();
      release({ commands: [{ type: 'absence', ...NULLS, date: '2026-11-10', memberRef: 'member_2' }] });
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('さっきの書き込みは使いませんでした'));
      const s = saved();
      expect(s.chat.length).toBe(before.chat.length);
      expect(s.chat.some((m) => m.from === 'user' && m.text.includes('ふわふわのやつ'))).toBe(false);
      expect(s.meals.every((m) => m.absentMemberIds.length === 0)).toBe(true);
      unmount();
      window.localStorage.clear();
      window.location.hash = '';
    }
  });

  it('読み取りのあいだに何も入れ替えなければ、結果をそのまま使う', async () => {
    let release: (v: unknown) => void = () => {};
    mockClaude(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<App todayFn={() => MONDAY} />);
    await waitFor(() => expect(form().getAttribute('data-ai-status')).toBe('claude'));
    send('ふわふわのやつ');
    // 読み取り中にシートを開いて閉じても（状態は入れ替えていない）、結果は使う
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByRole('button', { name: '今週の献立' }));
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    release({ commands: [{ type: 'absence', ...NULLS, date: '2026-11-10', memberRef: 'member_2' }] });
    await waitFor(() => expect(within(log()).getByText('AIで読み取り')).toBeTruthy());
    const s = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as AppState;
    expect(s.meals.find((m) => m.date === '2026-11-10')?.absentMemberIds).toEqual(['member_2']);
  });
});
