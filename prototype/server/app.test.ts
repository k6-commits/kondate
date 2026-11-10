import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultCatalog } from '../src/data/index';
import { applyAction, formatJa, type ParsedCommand } from '../src/engine/index';
import { createApp, type AppConfig } from './app';
import { createDeferQueue } from './defer';
import { GROUP_HINT, RESET_NOTE, WELCOME_BACK } from './household';
import { createLineClient, toLineMessages, type LineTextMessage } from './line';
import { createLlmInterpreter, type InterpretInput, type LlmClient, type LlmInterpreter } from './llm';
import { memoryLogger } from './log';
import { createFileStore } from './store';
import { fakeLineFetch, makeTempDir, seedRecord, signBody, type RecordedCall } from './testing';

const SECRET = 'test-channel-secret';
const ACCESS_TOKEN = 'test-access-token';
const CRON_SECRET = 'test-cron-secret';
const MONDAY_NOON = new Date('2026-11-09T03:00:00Z'); // 日本時間 2026-11-09(月) 12:00
const TODAY = '2026-11-09';

const GROUP = { type: 'group', groupId: 'Cgroup0001', userId: 'Uuser0001' };
const USER = { type: 'user', userId: 'Uuser0002' };

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

interface SetupOptions {
  llm?: LlmInterpreter | null;
  config?: Partial<AppConfig>;
  now?: Date;
  /** 時刻を途中で進めるとき（clock.now を書き換える）。 */
  clock?: { now: Date };
  respond?: Parameters<typeof fakeLineFetch>[0];
}

async function setup(opts: SetupOptions = {}) {
  const { dir, cleanup } = await makeTempDir('kimetoku-app-');
  cleanups.push(cleanup);
  const logger = memoryLogger();
  const clock = opts.clock ?? { now: opts.now ?? MONDAY_NOON };
  const store = createFileStore({ dir, logger, now: () => clock.now });
  const lineApi = fakeLineFetch(opts.respond);
  const line = createLineClient({ accessToken: ACCESS_TOKEN, fetch: lineApi.fetch, logger, retryDelayMs: 0 });
  const queue = createDeferQueue(logger);
  const app = createApp({
    store,
    catalog: defaultCatalog,
    line,
    llm: opts.llm ?? null,
    now: () => clock.now,
    config: { lineChannelSecret: SECRET, cronSecret: CRON_SECRET, corsOrigin: 'http://localhost:5173', ...opts.config },
    defer: queue.defer,
    logger,
  });
  return {
    app,
    store,
    dir,
    logger,
    calls: lineApi.calls,
    /** 署名して webhook に送り、後処理が終わるまで待つ。 */
    async webhook(events: unknown[], signature?: string | null) {
      const body = JSON.stringify({ destination: 'Ubot0000', events });
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      const sig = signature === undefined ? signBody(SECRET, body) : signature;
      if (sig !== null) headers['x-line-signature'] = sig;
      const res = await app.request('/line/webhook', { method: 'POST', headers, body });
      await queue.idle();
      return res;
    },
    replies: () => lineApi.calls.filter((c) => c.url.endsWith('/message/reply')),
    pushes: () => lineApi.calls.filter((c) => c.url.endsWith('/message/push')),
    async files() {
      return (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.json'));
    },
  };
}

let seq = 0;
function base(source: object) {
  seq += 1;
  return {
    mode: 'active',
    timestamp: 1_762_657_200_000 + seq,
    webhookEventId: `01TESTEVENT${seq}`,
    deliveryContext: { isRedelivery: false },
    replyToken: `reply-token-${seq}`,
    source,
  };
}

function textEvent(source: object, text: string, mentionees?: object[]) {
  return {
    type: 'message',
    ...base(source),
    message: { id: `m${seq}`, type: 'text', quoteToken: 'q', text, ...(mentionees ? { mention: { mentionees } } : {}) },
  };
}

const postbackEvent = (source: object, data: string) => ({ type: 'postback', ...base(source), postback: { data } });
const followEvent = (source: object) => ({ type: 'follow', ...base(source), follow: { isUnblocked: false } });
const joinEvent = (source: object) => ({ type: 'join', ...base(source) });

const messagesOf = (call: RecordedCall) => call.body.messages as LineTextMessage[];

/** LINE の上限（5件・5000文字・クイックリプライ13個・ラベル20文字・data 300文字）を守っているか。 */
function expectWithinLimits(messages: LineTextMessage[]) {
  expect(messages.length).toBeGreaterThan(0);
  expect(messages.length).toBeLessThanOrEqual(5);
  for (const m of messages) {
    expect(m.type).toBe('text');
    expect(m.text.length).toBeGreaterThan(0);
    expect(m.text.length).toBeLessThanOrEqual(5000);
  }
  for (const m of messages.slice(0, -1)) expect(m.quickReply).toBeUndefined();
  const items = messages[messages.length - 1].quickReply?.items ?? [];
  expect(items.length).toBeLessThanOrEqual(13);
  for (const item of items) {
    expect(item.action.type).toBe('postback');
    expect(item.action.label.length).toBeLessThanOrEqual(20);
    expect(item.action.data.length).toBeLessThanOrEqual(300);
    expect(() => JSON.parse(item.action.data)).not.toThrow();
  }
  return items;
}

function fakeLlm(result: ParsedCommand[] | null) {
  const interpret = vi.fn(async (_input: InterpretInput) => result);
  return { model: 'mock-model', interpret } satisfies LlmInterpreter;
}

// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('LLM と LINE の設定の有無を返す', async () => {
    const t = await setup();
    expect(await (await t.app.request('/health')).json()).toEqual({ ok: true, llm: false, line: true });
    const u = await setup({ llm: fakeLlm(null), config: { lineChannelSecret: undefined } });
    expect(await (await u.app.request('/health')).json()).toEqual({ ok: true, llm: true, line: false });
  });
});

describe('POST /line/webhook：署名', () => {
  it('正しい署名なら 200', async () => {
    const t = await setup();
    const res = await t.webhook([]);
    expect(res.status).toBe(200);
  });

  it('署名が違う・ないなら 401（処理しない）', async () => {
    const t = await setup();
    expect((await t.webhook([textEvent(USER, '今日は無理')], signBody('wrong-secret', 'x'))).status).toBe(401);
    expect((await t.webhook([textEvent(USER, '今日は無理')], null)).status).toBe(401);
    expect(t.calls).toHaveLength(0);
    expect(await t.files()).toEqual([]);
  });

  it('チャネルシークレットが未設定なら 503', async () => {
    const t = await setup({ config: { lineChannelSecret: undefined } });
    expect((await t.webhook([textEvent(USER, '今日は無理')])).status).toBe(503);
    expect(t.calls).toHaveLength(0);
  });

  it('JSON でない本文は 400、大きすぎる本文は 413', async () => {
    const t = await setup();
    const body = 'not json';
    const bad = await t.app.request('/line/webhook', {
      method: 'POST',
      headers: { 'x-line-signature': signBody(SECRET, body) },
      body,
    });
    expect(bad.status).toBe(400);
    const huge = JSON.stringify({ events: [], pad: 'x'.repeat(1024 * 1024) });
    const big = await t.app.request('/line/webhook', {
      method: 'POST',
      headers: { 'x-line-signature': signBody(SECRET, huge), 'content-length': String(huge.length) },
      body: huge,
    });
    expect(big.status).toBe(413);
  });
});

describe('グループ・ルーム', () => {
  it('「@きめとく」もメンションもない発言は、返信せず、保存もしない（ログにも出さない）', async () => {
    const t = await setup();
    const res = await t.webhook([textEvent(GROUP, '今日は無理'), textEvent({ type: 'room', roomId: 'Rroom1', userId: 'U1' }, '卵切れた')]);
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(0);
    expect(await t.files()).toEqual([]);
    expect(await t.store.list()).toEqual([]);
    const logs = t.logger.lines.join('\n');
    expect(logs).not.toContain('今日は無理');
    expect(logs).not.toContain('卵切れた');
  });

  it('「@きめとく 今日は無理」→ 返信1回（LINE の上限を守る）。今日の献立がラク日になって保存される', async () => {
    const t = await setup();
    await t.webhook([textEvent(GROUP, '@きめとく 今日は無理')]);
    const replies = t.replies();
    expect(replies).toHaveLength(1);
    expect(replies[0].headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(replies[0].body.replyToken).toBe(`reply-token-${seq}`);
    const messages = messagesOf(replies[0]);
    const items = expectWithinLimits(messages);
    expect(items.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.text.includes('今日はラクしましょう'))).toBe(true);
    // 初めての送り元なので、あいさつとデモの家族の一言、グループでの送り方も添える
    expect(messages[0].text).toContain('デモの家族');
    expect(messages[0].text).toContain(GROUP_HINT);

    const saved = await t.store.get('Cgroup0001');
    expect(saved?.sourceType).toBe('group');
    expect(saved?.sourceId).toBe('Cgroup0001');
    expect(saved?.state.today).toBe(TODAY);
    expect(saved?.state.meals.find((m) => m.date === TODAY)?.kind).toBe('raku');
    // 発言の原文は保存しない（利用者のメッセージは id と時刻だけ残る）
    expect(saved?.state.chat.filter((m) => m.from === 'user').map((m) => m.text)).toEqual(['']);

    const logs = t.logger.lines.join('\n');
    for (const secret of ['今日は無理', ACCESS_TOKEN, SECRET, 'Cgroup0001']) expect(logs).not.toContain(secret);
  });

  it('全角の「＠きめとく」でも処理する', async () => {
    const t = await setup();
    await t.webhook([textEvent(GROUP, '＠きめとく　卵切れた')]);
    expect(t.replies()).toHaveLength(1);
    const saved = await t.store.get('Cgroup0001');
    expect(saved?.state.inventory.find((i) => i.ingredientId === 'egg')?.level).toBe('none');
  });

  it('bot へのメンション（mentionees の isSelf）でも処理し、メンションの部分を取り除く', async () => {
    const t = await setup();
    await t.webhook([
      textEvent(GROUP, '@献立bot 今日は無理', [{ index: 0, length: 6, type: 'user', userId: 'Ubot', isSelf: true }]),
    ]);
    expect(t.replies()).toHaveLength(1);
    const saved = await t.store.get('Cgroup0001');
    expect(saved?.state.meals.find((m) => m.date === TODAY)?.kind).toBe('raku');
    expect(saved?.state.chat.filter((m) => m.from === 'user').map((m) => m.text)).toEqual(['']);
  });

  it('ほかの人へのメンション（LINE の表示名）は、保存も LLM への送信もしない。ニックネームが入っていれば、その名前にする', async () => {
    const llm = fakeLlm(null);
    const t = await setup({ llm });
    await t.webhook([
      textEvent(GROUP, '@きめとく @山田 太郎 水曜は飲み会', [{ index: 6, length: 6, type: 'user', userId: 'U9', isSelf: false }]),
      textEvent(GROUP, '@きめとく @パパ(太郎) 水曜は飲み会', [{ index: 6, length: 7, type: 'user', userId: 'U8', isSelf: false }]),
    ]);
    expect(llm.interpret.mock.calls.map((c) => c[0].text)).toEqual(['水曜は飲み会', 'パパ 水曜は飲み会']);
    const saved = await t.store.get('Cgroup0001');
    const userTexts = saved?.state.chat.filter((m) => m.from === 'user').map((m) => m.text);
    expect(userTexts).toEqual(['', '']);
    expect(JSON.stringify(saved)).not.toContain('太郎');
    expect(saved?.state.meals.find((m) => m.date === '2026-11-11')?.absentMemberIds).toEqual(['member_2']);
  });

  it('ほかの人へのメンションだけなら処理しない', async () => {
    const t = await setup();
    await t.webhook([textEvent(GROUP, '@パパ 今日は無理', [{ index: 0, length: 3, type: 'user', userId: 'U2', isSelf: false }])]);
    expect(t.calls).toHaveLength(0);
    expect(await t.files()).toEqual([]);
  });

  it('「@きめとく」だけなら使い方を返す', async () => {
    const t = await setup();
    await t.webhook([textEvent(GROUP, '@きめとく')]);
    const messages = messagesOf(t.replies()[0]);
    expect(messages[messages.length - 1].text).toContain('こんなふうに送ってください');
  });

  it('1対1のトークは「@きめとく」なしでも処理する', async () => {
    const t = await setup();
    await t.webhook([textEvent(USER, '今日は無理')]);
    expect(t.replies()).toHaveLength(1);
    expect((await t.store.get('Uuser0002'))?.state.meals.find((m) => m.date === TODAY)?.kind).toBe('raku');
  });

  it('同じイベントが再送されても、1回だけ処理する', async () => {
    const t = await setup();
    const event = textEvent(USER, '今日は無理');
    await t.webhook([event]);
    await t.webhook([event]);
    expect(t.replies()).toHaveLength(1);
  });
});

describe('postback', () => {
  it('Action の JSON を applyAction する（グループでも「@きめとく」は要らない）', async () => {
    const t = await setup();
    await t.webhook([joinEvent(GROUP)]);
    await t.webhook([postbackEvent(GROUP, JSON.stringify({ type: 'today_impossible', date: TODAY }))]);
    const replies = t.replies();
    expect(replies).toHaveLength(2);
    expectWithinLimits(messagesOf(replies[1]));
    expect(messagesOf(replies[1]).some((m) => m.text.includes('今日はラクしましょう'))).toBe(true);
    expect((await t.store.get('Cgroup0001'))?.state.meals.find((m) => m.date === TODAY)?.kind).toBe('raku');
  });

  it('クイックリプライの data をそのまま送り返すと、そのボタンの動きになる', async () => {
    const t = await setup();
    await t.webhook([textEvent(USER, '今日の献立')]);
    const items = messagesOf(t.replies()[0]).at(-1)!.quickReply!.items;
    const cooked = items.find((i) => i.action.label === '作った')!;
    await t.webhook([postbackEvent(USER, cooked.action.data)]);
    expect((await t.store.get('Uuser0002'))?.state.meals.find((m) => m.date === TODAY)?.status).toBe('cooked');
    expect(messagesOf(t.replies()[1])[0].text).toContain('おつかれさまでした');
  });

  it('1つの書き込みで提案が2つできても、1つ目の提案を LINE のボタンで受けられる', async () => {
    const t = await setup();
    await t.webhook([textEvent(GROUP, '@きめとく 鶏むねが安い。豚こまも安い')]);
    const proposals = (await t.store.get('Cgroup0001'))!.state.proposals;
    expect(proposals).toHaveLength(2);
    const [first, second] = proposals;
    const items = expectWithinLimits(messagesOf(t.replies()[0]));
    const accept = items.find((i) => i.action.data === JSON.stringify({ type: 'accept_proposal', proposalId: first.id }));
    expect(accept?.action.label).toBe(`${formatJa(first.date)} 替える`);
    await t.webhook([postbackEvent(GROUP, accept!.action.data)]);
    const after = (await t.store.get('Cgroup0001'))!.state;
    expect(after.meals.find((m) => m.date === first.date)?.dishIds[0]).toBe(first.toDishIds[0]);
    expect(after.proposals.map((p) => p.id)).toEqual([second.id]);
    // その返信に、もう1つの案の［替える］［そのまま］が出る（クイックリプライは最後のメッセージにしか出ないため、出し直す）
    const again = expectWithinLimits(messagesOf(t.replies()[1]));
    expect(messagesOf(t.replies()[1]).some((m) => m.text.includes('もう1つの案も、ボタンで選べます。'))).toBe(true);
    const accept2 = again.find((i) => i.action.data === JSON.stringify({ type: 'accept_proposal', proposalId: second.id }));
    expect(accept2?.action.label).toBe('替える');
    await t.webhook([postbackEvent(GROUP, accept2!.action.data)]);
    const done = (await t.store.get('Cgroup0001'))!.state;
    expect(done.meals.find((m) => m.date === second.date)?.dishIds[0]).toBe(second.toDishIds[0]);
    expect(done.proposals).toEqual([]);
    expect(messagesOf(t.replies()[2])[0].text).toContain('に替えました');
  });

  it('不正な data は無視する（返信も保存もしない）', async () => {
    const t = await setup();
    await t.webhook([
      postbackEvent(USER, 'not json'),
      postbackEvent(USER, JSON.stringify({ type: 'drop_tables' })),
      postbackEvent(USER, JSON.stringify({ type: 'cooked', date: '2026-02-30' })),
      postbackEvent(USER, JSON.stringify({ type: 'cooked', date: TODAY, pad: 'x'.repeat(300) })),
    ]);
    expect(t.calls).toHaveLength(0);
    expect(await t.files()).toEqual([]);
  });
});

describe('follow / join', () => {
  it('follow：デモの家族の状態を作り、あいさつと週の献立を返す', async () => {
    const t = await setup();
    await t.webhook([followEvent(USER)]);
    const saved = await t.store.get('Uuser0002');
    expect(saved?.sourceType).toBe('user');
    expect(saved?.state.today).toBe(TODAY);
    expect(saved?.state.household.members.map((m) => m.nickname)).toEqual(['ママ', 'パパ', 'はると', 'ゆい']);
    const messages = messagesOf(t.replies()[0]);
    expectWithinLimits(messages);
    expect(messages).toHaveLength(3);
    expect(messages[0].text).toContain('はじめまして');
    expect(messages[0].text).toContain('試作版のため、家族は「デモの家族」で始めています。');
    expect(messages[0].text).not.toContain(GROUP_HINT);
    expect(messages[1].text).toContain('アレルギーの安全を保証するものではありません');
    expect(messages[2].text).toContain('今週の夕食です');
    expect(messages[2].text).toContain('11/9(月)〜の夕食');
  });

  it('join：グループの状態を作り、@きめとく の付け方も伝える', async () => {
    const t = await setup();
    await t.webhook([joinEvent(GROUP)]);
    expect((await t.store.get('Cgroup0001'))?.sourceType).toBe('group');
    expect(messagesOf(t.replies()[0])[0].text).toContain(GROUP_HINT);
  });

  it('もう状態があれば作り直さず、続きから使えることと今週の献立を返す', async () => {
    const t = await setup();
    await t.webhook([followEvent(USER)]);
    await t.webhook([textEvent(USER, '今日は無理')]);
    await t.webhook([followEvent(USER)]);
    const messages = messagesOf(t.replies()[2]);
    expect(messages[0].text).toBe(WELCOME_BACK);
    expect(messages.some((m) => m.text.includes('11/9(月)〜の夕食'))).toBe(true);
    expect((await t.store.get('Uuser0002'))?.state.meals.find((m) => m.date === TODAY)?.kind).toBe('raku');
  });
});

describe('保存するもの・消すとき', () => {
  const unfollowEvent = (source: object) => ({ type: 'unfollow', mode: 'active', timestamp: 1, webhookEventId: `01UNFOLLOW${++seq}`, source });
  const leaveEvent = (source: object) => ({ type: 'leave', mode: 'active', timestamp: 1, webhookEventId: `01LEAVE${++seq}`, source });

  it('1対1の発言は、献立と関係のないものも原文を保存しない', async () => {
    const t = await setup();
    const unrelated = '今日は会社で山田部長に怒られた。電話番号は090-1234-5678';
    await t.webhook([followEvent(USER), textEvent(USER, unrelated)]);
    expect(t.replies()).toHaveLength(2);
    const [file] = await t.files();
    const raw = await readFile(path.join(t.dir, file), 'utf8');
    for (const part of ['山田部長', '090-1234-5678', '怒られた']) expect(raw).not.toContain(part);
    const saved = await t.store.get('Uuser0002');
    expect(saved?.state.chat.filter((m) => m.from === 'user').map((m) => m.text)).toEqual(['']);
    // 前の保存データに原文が残っていても、次に保存するときに空にする
    await t.store.update('Uuser0002', (cur) =>
      cur ? { ...cur, state: { ...cur.state, chat: [...cur.state.chat, { id: 'old_1', from: 'user', text: unrelated, at: `${TODAY}T08:00:00+09:00` }] } } : null,
    );
    expect(await readFile(path.join(t.dir, file), 'utf8')).not.toContain('山田部長');
  });

  it('原文を保存しなくても、聞き返しへの名前・日付だけの答えが使える（聞いた日は bot の文から読む）', async () => {
    const t = await setup();
    // 「誰が食べませんか？」への「パパ」：聞いた日（明日から木曜まで）すべての欠席にする
    await t.webhook([textEvent(USER, '明日から木曜まで出張')]);
    await t.webhook([textEvent(USER, 'パパ')]);
    let saved = await t.store.get('Uuser0002');
    expect(saved?.state.chat.filter((m) => m.from === 'user').every((m) => m.text === '')).toBe(true);
    const absentDays = (st: typeof saved) => st!.state.meals.filter((m) => m.absentMemberIds.includes('member_2')).map((m) => m.date);
    expect(absentDays(saved)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    // 「どの日の予定がなくなりましたか？」への「木曜」
    await t.webhook([textEvent(USER, '金曜もパパ飲み会')]);
    await t.webhook([textEvent(USER, '飲み会なくなった')]);
    expect(messagesOf(t.replies().at(-1)!)[0].text).toContain('どの日の予定がなくなりましたか？');
    await t.webhook([textEvent(USER, '金曜')]);
    saved = await t.store.get('Uuser0002');
    expect(absentDays(saved)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    // 何日か続く予定（出張）の取り消しは、まとめて（どの日かは聞かない）
    await t.webhook([textEvent(USER, 'パパの出張なくなった')]);
    expect(absentDays(await t.store.get('Uuser0002'))).toEqual([]);
    for (const r of t.replies()) expectWithinLimits(messagesOf(r));
  });

  it('unfollow（ブロック）で1対1の記録を、leave（退出）でグループの記録を消す。cron も数えない', async () => {
    const t = await setup();
    await t.webhook([followEvent(USER), textEvent(USER, '卵切れた'), joinEvent(GROUP), textEvent(GROUP, '@きめとく 今日は無理')]);
    expect(await t.files()).toHaveLength(2);
    await t.webhook([unfollowEvent(USER)]);
    expect(await t.store.get('Uuser0002')).toBeNull();
    expect(await t.store.get('Cgroup0001')).not.toBeNull();
    await t.webhook([leaveEvent(GROUP)]);
    expect(await t.store.get('Cgroup0001')).toBeNull();
    expect(await t.files()).toEqual([]);
    const cron = await t.app.request('/cron/evening', { method: 'POST', headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(await cron.json()).toEqual({ households: 0, pushed: 0 });
    // また友だち追加されたら、新しく作る
    await t.webhook([followEvent(USER)]);
    expect((await t.store.get('Uuser0002'))?.state.chat.filter((m) => m.from === 'user')).toEqual([]);
    expect(messagesOf(t.replies().at(-1)!)[0].text).toContain('はじめまして');
    // ログに LINE の ID は出さない
    expect(t.logger.lines.join('\n')).not.toContain('Uuser0002');
  });
});

describe('日付の同期', () => {
  it('保存された today が3日前なら今日まで進め、「作りましたか？」を返信の先頭に添える', async () => {
    const t = await setup({ now: new Date('2026-11-11T03:00:00Z') }); // 日本時間 11/11(水) 12:00
    await seedRecord(t.store, { key: 'Uuser0002', catalog: defaultCatalog, today: '2026-11-08' });
    await t.webhook([textEvent(USER, '今日の献立')]);
    const saved = await t.store.get('Uuser0002');
    expect(saved?.state.today).toBe('2026-11-11');
    expect(saved?.pendingReply).toEqual([]);
    const messages = messagesOf(t.replies()[0]);
    const items = expectWithinLimits(messages);
    expect(messages[0].text).toMatch(/^昨日の.+は作りましたか？/);
    expect(messages[0].text).toContain('11/10(火)の夕食');
    expect(items.map((i) => JSON.parse(i.action.data))).toContainEqual({ type: 'cooked', date: '2026-11-10' });
    expect(items.map((i) => JSON.parse(i.action.data))).toContainEqual({ type: 'not_cooked', date: '2026-11-10' });
  });

  it('31日より古ければ、デモの家族で作り直す', async () => {
    const t = await setup();
    await seedRecord(t.store, { key: 'Uuser0002', catalog: defaultCatalog, today: '2026-09-01' });
    await t.webhook([textEvent(USER, '今日の献立')]);
    expect((await t.store.get('Uuser0002'))?.state.today).toBe(TODAY);
    expect(messagesOf(t.replies()[0])[0].text.startsWith(RESET_NOTE)).toBe(true);
  });

  it('有料版の配信は返信に入れず、pendingPush にためる（今日の分だけ）', async () => {
    const t = await setup();
    await seedRecord(t.store, { key: 'Uuser0002', catalog: defaultCatalog, today: '2026-11-07', plan: 'paid' });
    await t.webhook([textEvent(USER, '卵切れた')]);
    const saved = await t.store.get('Uuser0002');
    expect(saved?.pendingPush.length).toBeGreaterThan(0);
    expect(saved?.pendingPush.every((m) => m.push && m.at.startsWith(TODAY))).toBe(true);
    const pushedIds = new Set(saved?.pendingPush.map((m) => m.text));
    expect(messagesOf(t.replies()[0]).some((m) => pushedIds.has(m.text))).toBe(false);
  });
});

describe('LLM での解釈（webhook）', () => {
  it('LLM の結果を検証して handleUserText に渡す', async () => {
    const llm = fakeLlm([{ type: 'absence', date: '2026-11-11', memberRef: 'member_2' }]);
    const t = await setup({ llm });
    await t.webhook([textEvent(GROUP, '@きめとく むにゃむにゃ')]);
    expect(llm.interpret).toHaveBeenCalledTimes(1);
    const input = llm.interpret.mock.calls[0][0];
    expect(input.text).toBe('むにゃむにゃ');
    expect(input.today).toBe(TODAY);
    expect(input.members.map((m) => m.id)).toEqual(['member_1', 'member_2', 'member_3', 'member_4']);
    const wed = (await t.store.get('Cgroup0001'))?.state.meals.find((m) => m.date === '2026-11-11');
    expect(wed?.absentMemberIds).toEqual(['member_2']);
    expect(messagesOf(t.replies()[0]).some((m) => m.text.includes('パパの分を減らしました'))).toBe(true);
  });

  it('LLM が返ってこなくても全体の上限でルールに戻り、同じ世帯のボタンも上限＋少しで返る', async () => {
    const llmLogger = memoryLogger();
    const client: LlmClient = {
      messages: {
        // 返事をせず、signal が来たら中断する
        parse: (_params, options) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      },
    };
    const llm = createLlmInterpreter({ client, catalog: defaultCatalog, logger: llmLogger, totalTimeoutMs: 300 });
    const t = await setup({ llm });
    const started = Date.now();
    await Promise.all([
      t.webhook([textEvent(USER, '今日は無理')]),
      t.webhook([postbackEvent(USER, JSON.stringify({ type: 'open_week' }))]),
    ]);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(t.replies()).toHaveLength(2);
    expect((await t.store.get('Uuser0002'))?.state.meals.find((m) => m.date === TODAY)?.kind).toBe('raku');
    expect(llmLogger.lines.join('\n')).toContain('error=timeout');
  });

  it('LLM の結果で同じ日に提案が重なっても（同じ命令の重なりも）、返信には使える提案だけを出し、2つ目は重なると伝える', async () => {
    const llm = fakeLlm([
      { type: 'sale', ingredientId: 'chicken_breast' },
      { type: 'sale', ingredientId: 'pork_belly' },
      { type: 'sale', ingredientId: 'chicken_breast' },
    ]);
    const t = await setup({ llm });
    await seedRecord(t.store, { key: 'Uuser0002', catalog: defaultCatalog, today: TODAY });
    await t.webhook([textEvent(USER, '鶏むねと豚バラが安い')]);
    const reply = messagesOf(t.replies()[0]);
    const items = expectWithinLimits(reply);
    expect(reply).toHaveLength(2);
    expect(reply[0].text).toContain('明日のキーマカレーを、');
    expect(reply[1].text).toBe(
      '豚バラ薄切り肉、いいですね。替えられる日（明日）には、上で別の案を出しています。\n豚バラ薄切り肉の案にしたいときは、もう一度「豚バラ薄切り肉が安い」と送ってください。',
    );
    const { proposals } = (await t.store.get('Uuser0002'))!.state;
    expect(proposals).toHaveLength(1);
    const actions = items.map((i) => JSON.parse(i.action.data) as { type: string; proposalId?: string });
    expect(actions.filter((a) => a.type === 'accept_proposal' || a.type === 'reject_proposal').map((a) => a.proposalId)).toEqual([
      proposals[0].id,
      proposals[0].id,
    ]);
    const accept = items.find((i) => (JSON.parse(i.action.data) as { type: string }).type === 'accept_proposal')!;
    await t.webhook([postbackEvent(USER, accept.action.data)]);
    expect(messagesOf(t.replies()[1])[0].text).toContain('明日を鶏むねとブロッコリーの塩炒め');
    expect(messagesOf(t.replies()[1])[0].text).toContain('に替えました。');
  });

  it('「明日の夕飯なに？」で LLM が日付を落としても（読めない日付でも）、ルールの日付で明日の献立を返す', async () => {
    for (const result of [[{ type: 'show_today' }], [{ type: 'show_today', date: '2026-11-31' }]] as ParsedCommand[][]) {
      const llm = fakeLlm(result);
      const t = await setup({ llm });
      await seedRecord(t.store, { key: 'Uuser0002', catalog: defaultCatalog, today: TODAY });
      await t.webhook([textEvent(USER, '明日の夕飯なに？')]);
      expect(llm.interpret).toHaveBeenCalledTimes(1);
      const reply = messagesOf(t.replies()[0]);
      expect(reply[0].text).toMatch(/^明日は/);
      const shop = fakeLlm([{ type: 'show_shopping' }]);
      const u = await setup({ llm: shop });
      await seedRecord(u.store, { key: 'Uuser0002', catalog: defaultCatalog, today: TODAY });
      await u.webhook([textEvent(USER, '明日何買えばいい？')]);
      expect(messagesOf(u.replies()[0])[0].text).toMatch(/^明日は買い物の日ではありません。/);
    }
  });

  it('LLM が失敗したり、検証で全部落ちたりしたら、ルールで解釈する', async () => {
    const t = await setup({ llm: fakeLlm([{ type: 'sale', ingredientId: 'unicorn_meat' }]) });
    await t.webhook([textEvent(USER, '今日は無理')]);
    expect((await t.store.get('Uuser0002'))?.state.meals.find((m) => m.date === TODAY)?.kind).toBe('raku');
    const u = await setup({ llm: fakeLlm(null) });
    await u.webhook([textEvent(USER, '今日は無理')]);
    expect((await u.store.get('Uuser0002'))?.state.meals.find((m) => m.date === TODAY)?.kind).toBe('raku');
  });
});

describe('POST /api/parse', () => {
  // 開発用の口なので、PARSE_API_ENABLED のときだけ使える（このブロックでは有効にして確かめる）
  const parseSetup = (opts: SetupOptions = {}) => setup({ ...opts, config: { parseApiEnabled: true, ...opts.config } });
  // 画面は state.household.members をそのまま送る（exclusions つき。role がない人もいる）
  const members = [
    { id: 'member_1', nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
    { id: 'member_2', nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] },
    { id: 'member_3', nickname: 'はると', ageBand: 'child', exclusions: [{ type: 'allergen', id: 'egg' }] },
  ];
  const post = (t: Awaited<ReturnType<typeof setup>>, body: unknown, origin = 'http://localhost:5173') =>
    t.app.request('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    });

  it('LLM がなければルールの結果（source: rules）', async () => {
    const t = await parseSetup();
    const res = await post(t, { text: '@きめとく 水曜はパパが飲み会、卵切れた', today: TODAY, members });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      commands: [
        { type: 'absence', date: '2026-11-11', memberRef: 'パパ' },
        { type: 'out_of_stock', ingredientId: 'egg' },
      ],
      source: 'rules',
    });
  });

  it('LLM のモックが正しい commands を返すと source: llm', async () => {
    const llm = fakeLlm([
      { type: 'sale', ingredientId: 'chicken_breast' },
      { type: 'request', date: '2026-11-13', dishId: 'curry_rice' },
    ]);
    const t = await parseSetup({ llm });
    const res = await post(t, { text: 'むね肉がお買い得。金曜はカレー', today: TODAY, members });
    expect(await res.json()).toEqual({
      commands: [
        { type: 'sale', ingredientId: 'chicken_breast' },
        { type: 'request', date: '2026-11-13', dishId: 'curry_rice' },
      ],
      source: 'llm',
    });
    // 名前の置き換えは llm.ts で行う。exclusions は読み捨てる
    expect(llm.interpret.mock.calls[0][0].members).toEqual([
      { id: 'member_1', nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
      { id: 'member_2', nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] },
      { id: 'member_3', nickname: 'はると', ageBand: 'child', exclusions: [] },
    ]);
  });

  it('マスタにない ingredientId や不正な日付は落ち、全部落ちたらルールに戻る', async () => {
    const partial = await parseSetup({
      llm: fakeLlm([
        { type: 'sale', ingredientId: 'unicorn_meat' },
        { type: 'absence', date: '2026-02-30', memberRef: 'member_2' },
        { type: 'out_of_stock', ingredientId: 'egg' },
      ]),
    });
    expect(await (await post(partial, { text: '卵がない', today: TODAY, members })).json()).toEqual({
      commands: [{ type: 'out_of_stock', ingredientId: 'egg' }],
      source: 'llm',
    });

    const none = await parseSetup({
      llm: fakeLlm([
        { type: 'sale', ingredientId: 'unicorn_meat' },
        { type: 'absence', date: '2026-02-30', memberRef: 'member_2' },
      ]),
    });
    expect(await (await post(none, { text: '今日は無理', today: TODAY, members })).json()).toEqual({
      commands: [{ type: 'today_impossible' }],
      source: 'rules',
    });
  });

  it('入力を検査する（text は500文字まで、today は ISODate）', async () => {
    const t = await parseSetup();
    expect((await post(t, { text: 'あ'.repeat(501), today: TODAY, members })).status).toBe(400);
    expect((await post(t, { text: '今日は無理', today: '2026-02-30', members })).status).toBe(400);
    expect((await post(t, { text: '今日は無理', today: TODAY })).status).toBe(400);
    expect((await post(t, { text: '今日は無理', today: TODAY, members: [{ id: 'x', nickname: 'a', ageBand: 'elder' }] })).status).toBe(400);
    const notJson = await t.app.request('/api/parse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    expect(notJson.status).toBe(400);
  });

  it('CORS は CORS_ORIGIN だけ許可する', async () => {
    const t = await parseSetup();
    const ok = await post(t, { text: '今日は無理', today: TODAY, members });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const other = await post(t, { text: '今日は無理', today: TODAY, members }, 'https://evil.example');
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await t.app.request('/api/parse', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('既定（PARSE_API_ENABLED なし）では 404。LLM も呼ばない', async () => {
    const llm = fakeLlm([{ type: 'today_impossible' }]);
    const t = await setup({ llm });
    expect((await post(t, { text: '今日は無理', today: TODAY, members })).status).toBe(404);
    const preflight = await t.app.request('/api/parse', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
    });
    expect(preflight.status).toBe(404);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    expect(llm.interpret).not.toHaveBeenCalled();
  });

  it('許可していないオリジンからは 403。LLM は呼ばない', async () => {
    const llm = fakeLlm([{ type: 'today_impossible' }]);
    const t = await parseSetup({ llm });
    for (const origin of ['https://evil.example', 'null', 'http://localhost:5174']) {
      const res = await post(t, { text: '今日は無理', today: TODAY, members }, origin);
      expect(res.status).toBe(403);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }
    expect(llm.interpret).not.toHaveBeenCalled();
  });

  it('JSON でない本文（ほかのサイトのフォームなど）は 415。LLM は呼ばない', async () => {
    const llm = fakeLlm([{ type: 'today_impossible' }]);
    const t = await parseSetup({ llm });
    const body = JSON.stringify({ text: '今日は無理', today: TODAY, members });
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', null]) {
      const headers: Record<string, string> = type ? { 'content-type': type } : {};
      const res = await t.app.request('/api/parse', { method: 'POST', headers, body });
      expect(res.status).toBe(415);
    }
    // 許可していないオリジンから、プリフライトの要らない形で送っても届かない
    const simple = await t.app.request('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
      body,
    });
    expect(simple.status).toBe(403);
    expect(llm.interpret).not.toHaveBeenCalled();
  });

  it('Origin のないリクエスト（curl など）と、charset 付きの JSON は受ける', async () => {
    const llm = fakeLlm([{ type: 'today_impossible' }]);
    const t = await parseSetup({ llm });
    const res = await t.app.request('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text: '今日は無理', today: TODAY, members }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ commands: [{ type: 'today_impossible' }], source: 'llm' });
    expect(llm.interpret).toHaveBeenCalledTimes(1);
  });
});

describe('POST /cron/evening', () => {
  const cron = (t: Awaited<ReturnType<typeof setup>>, auth?: string) =>
    t.app.request('/cron/evening', { method: 'POST', headers: auth ? { authorization: auth } : {} });

  it('シークレットがない・違うなら 401、未設定なら 503', async () => {
    const t = await setup();
    expect((await cron(t)).status).toBe(401);
    expect((await cron(t, 'Bearer wrong-secret')).status).toBe(401);
    expect((await cron(t, CRON_SECRET)).status).toBe(401);
    const u = await setup({ config: { cronSecret: undefined } });
    expect((await cron(u, `Bearer ${CRON_SECRET}`)).status).toBe(503);
  });

  it('有料版の世帯にだけ push し、pendingPush を空にする', async () => {
    const t = await setup();
    await seedRecord(t.store, { key: 'Cpaid', sourceType: 'group', catalog: defaultCatalog, today: '2026-11-07', plan: 'paid' });
    await seedRecord(t.store, { key: 'Ufree', catalog: defaultCatalog, today: '2026-11-07', plan: 'free' });

    const res = await cron(t, `Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ households: 2, pushed: 1 });

    const pushes = t.pushes();
    expect(pushes).toHaveLength(1);
    expect(pushes[0].body.to).toBe('Cpaid');
    expect(pushes[0].headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    const messages = messagesOf(pushes[0]);
    expectWithinLimits(messages);
    expect(messages.some((m) => m.text.startsWith('今日は'))).toBe(true);

    const paid = await t.store.get('Cpaid');
    expect(paid?.state.today).toBe(TODAY);
    expect(paid?.pendingPush).toEqual([]);
    const free = await t.store.get('Ufree');
    expect(free?.state.today).toBe(TODAY);
    expect(free?.pendingPush).toEqual([]);

    // 同じ日にもう一度呼んでも、二重には送らない
    expect(await (await cron(t, `Bearer ${CRON_SECRET}`)).json()).toEqual({ households: 2, pushed: 0 });
    expect(t.pushes()).toHaveLength(1);
  });

  it('同期でできた「作りましたか？」は、有料版なら配信に添え、無料版なら次の返信の先頭に添える', async () => {
    const t = await setup({ now: new Date('2026-11-11T08:00:00Z') }); // 日本時間 11/11(水) 17:00
    await seedRecord(t.store, { key: 'Upaid', catalog: defaultCatalog, today: '2026-11-08', plan: 'paid' });
    await seedRecord(t.store, { key: 'Uuser0002', catalog: defaultCatalog, today: '2026-11-08', plan: 'free' });
    expect(await (await cron(t, `Bearer ${CRON_SECRET}`)).json()).toEqual({ households: 2, pushed: 1 });

    const pushed = messagesOf(t.pushes()[0]);
    expect(pushed[0].text).toMatch(/^昨日の.+は作りましたか？/);
    expect(pushed.some((m) => m.text.startsWith('今日は'))).toBe(true);
    expect((await t.store.get('Upaid'))?.pendingReply).toEqual([]);

    const free = await t.store.get('Uuser0002');
    expect(free?.state.today).toBe('2026-11-11');
    expect(free?.pendingReply).toHaveLength(1);
    await t.webhook([textEvent(USER, '今日の献立')]);
    expect(messagesOf(t.replies()[0])[0].text).toMatch(/^昨日の.+は作りましたか？/);
    expect((await t.store.get('Uuser0002'))?.pendingReply).toEqual([]);
  });

  it('push に失敗したら pendingPush を残す', async () => {
    const t = await setup({ respond: () => new Response('{}', { status: 500 }) });
    await seedRecord(t.store, { key: 'Upaid', catalog: defaultCatalog, today: '2026-11-07', plan: 'paid' });
    expect(await (await cron(t, `Bearer ${CRON_SECRET}`)).json()).toEqual({ households: 1, pushed: 0 });
    expect((await t.store.get('Upaid'))?.pendingPush.length).toBeGreaterThan(0);
  });

  it('有料版：今日がみんな外で食べる日なら、夕方の「今日は…」を送らず、翌日も「作りましたか？」と聞かない', async () => {
    const clock = { now: new Date('2026-11-09T23:00:00Z') }; // 日本時間 11/10(火) 08:00
    const t = await setup({ clock });
    await seedRecord(t.store, { key: 'Uuser0002', catalog: defaultCatalog, today: '2026-11-09', plan: 'paid' });
    await t.webhook([textEvent(USER, '今日はみんな外食')]);
    const reply = messagesOf(t.replies()[0]);
    expectWithinLimits(reply);
    const text = reply.map((m) => m.text).join('\n');
    expect(text).toContain('夕食なし（みんな外で食べる）');
    expect(text).toContain('予定が変わったら「今日はみんないる」と送ってください。');
    expect(text).not.toContain('0人分');
    // 朝の同期で、今日の配信はたまっている（送るときに今の献立で作り直す）
    expect((await t.store.get('Uuser0002'))!.pendingPush.some((m) => m.card?.kind === 'meal')).toBe(true);

    clock.now = new Date('2026-11-10T08:00:00Z'); // 17:00
    expect(await (await cron(t, `Bearer ${CRON_SECRET}`)).json()).toEqual({ households: 1, pushed: 0 });
    expect(t.pushes()).toEqual([]);
    expect((await t.store.get('Uuser0002'))?.pendingPush).toEqual([]);

    clock.now = new Date('2026-11-10T23:00:00Z'); // 11/11(水) 08:00
    await t.webhook([textEvent(USER, '今日の献立')]);
    const next = messagesOf(t.replies()[1]);
    expect(next[0].text).not.toMatch(/作りましたか/);
    expect(next.at(-1)!.quickReply?.items.map((i) => (JSON.parse(i.action.data) as { type: string; date?: string }).date)).not.toContain('2026-11-10');
  });

  it('有料版：朝の書き込みで配信がたまっても、昼に献立を変えたら、夕方は今の献立の文面で送る', async () => {
    const clock = { now: new Date('2026-11-09T23:00:00Z') }; // 日本時間 11/10(火) 08:00
    const t = await setup({ clock });
    await seedRecord(t.store, { key: 'Uuser0002', catalog: defaultCatalog, today: '2026-11-09', plan: 'paid' });
    await t.webhook([textEvent(USER, '今日の献立')]);
    const morning = (await t.store.get('Uuser0002'))!;
    const queued = morning.pendingPush.find((m) => m.card?.kind === 'meal' && m.card.date === '2026-11-10')!;
    expect(queued).toBeDefined();

    clock.now = new Date('2026-11-10T03:00:00Z'); // 12:00
    await t.webhook([textEvent(USER, '今日は無理')]);
    const noon = (await t.store.get('Uuser0002'))!;
    const expected = applyAction(noon.state, defaultCatalog, { type: 'open_today' }).replies[0];
    expect(expected.text).not.toBe(queued.text);

    clock.now = new Date('2026-11-10T08:00:00Z'); // 17:00
    expect(await (await cron(t, `Bearer ${CRON_SECRET}`)).json()).toEqual({ households: 1, pushed: 1 });
    const pushed = messagesOf(t.pushes()[0]);
    expectWithinLimits(pushed);
    // 本文とカードが、どちらも今の献立のもの（ためたときの文面は送らない）
    const [today] = toLineMessages(noon.state, defaultCatalog, [expected]);
    expect(pushed.map((m) => m.text)).toContain(today.text);
    expect(pushed.some((m) => m.text.includes(queued.text))).toBe(false);
    if (noon.state.meals.find((m) => m.date === '2026-11-10')?.kind === 'raku') {
      const types = pushed.at(-1)!.quickReply!.items.map((i) => (JSON.parse(i.action.data) as { type: string }).type);
      expect(types).not.toContain('today_impossible');
    }
    expect((await t.store.get('Uuser0002'))?.pendingPush).toEqual([]);
  });
});
