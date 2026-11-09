import { describe, expect, it } from 'vitest';
import { DEMO_ONBOARDING, defaultCatalog } from '../src/data/index';
import {
  advanceDay,
  applyAction,
  createInitialState,
  formatJa,
  handleUserText,
  renderCardText,
  type ActionButton,
  type ChatMessage,
} from '../src/engine/index';
import {
  LINE_LIMITS,
  createLineClient,
  isAddressedToBot,
  quickReplyItems,
  stripMentions,
  toLineMessages,
  truncateText,
  verifySignature,
} from './line';
import { memoryLogger } from './log';
import { fakeLineFetch, signBody } from './testing';

const catalog = defaultCatalog;
const TODAY = '2026-11-09';
const state = createInitialState(DEMO_ONBOARDING, catalog, TODAY);

let n = 0;
function msg(text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  n += 1;
  return { id: `t_${n}`, from: 'bot', text, at: `${TODAY}T08:00:00+09:00`, ...extra };
}

describe('verifySignature', () => {
  const secret = 'channel-secret';
  const body = '{"destination":"U1","events":[]}';
  const raw = new TextEncoder().encode(body);

  it('正しい署名だけを通す', () => {
    expect(verifySignature(secret, raw, signBody(secret, body))).toBe(true);
    expect(verifySignature(secret, raw, signBody('other-secret', body))).toBe(false);
    expect(verifySignature(secret, new TextEncoder().encode(`${body} `), signBody(secret, body))).toBe(false);
  });

  it('署名がない・長さが違う・シークレットが空のときは、例外を出さずに false', () => {
    expect(verifySignature(secret, raw, undefined)).toBe(false);
    expect(verifySignature(secret, raw, '')).toBe(false);
    expect(verifySignature(secret, raw, 'short')).toBe(false);
    expect(verifySignature(secret, raw, 'x'.repeat(500))).toBe(false);
    expect(verifySignature('', raw, signBody('', body))).toBe(false);
  });

  it('日本語の本文も、生のバイト列で確かめる', () => {
    const jp = '{"events":[{"message":{"text":"@きめとく 今日は無理"}}]}';
    expect(verifySignature(secret, new TextEncoder().encode(jp), signBody(secret, jp))).toBe(true);
  });
});

describe('「@きめとく」とメンション', () => {
  it('「@きめとく」で始まる発言（全角の＠・前後の空白も可）', () => {
    expect(isAddressedToBot('@きめとく 今日は無理', undefined)).toBe(true);
    expect(isAddressedToBot('＠きめとく　今日は無理', undefined)).toBe(true);
    expect(isAddressedToBot('  @ きめとく今日は無理', undefined)).toBe(true);
    expect(isAddressedToBot('今日は無理', undefined)).toBe(false);
    expect(isAddressedToBot('きめとく 今日は無理', undefined)).toBe(false);
    expect(isAddressedToBot('今日は @きめとく 無理', undefined)).toBe(false);
  });

  it('bot へのメンション（isSelf）があれば処理する。ほかの人へのメンションだけなら処理しない', () => {
    expect(isAddressedToBot('@献立bot 今日は無理', [{ index: 0, length: 6, isSelf: true }])).toBe(true);
    expect(isAddressedToBot('@パパ 今日は無理', [{ index: 0, length: 3, isSelf: false }])).toBe(false);
    expect(isAddressedToBot('@All 今日は無理', [{ index: 0, length: 4, type: 'all' }])).toBe(false);
  });

  it('「@きめとく」と bot へのメンションの部分を取り除く', () => {
    expect(stripMentions('@きめとく 今日は無理', undefined)).toBe('今日は無理');
    expect(stripMentions('＠きめとく　今日は無理\n卵切れた', undefined)).toBe('今日は無理\n卵切れた');
    expect(stripMentions('@献立bot 今日は無理', [{ index: 0, length: 6, isSelf: true }])).toBe('今日は無理');
    expect(stripMentions('水曜は @献立bot パパが飲み会', [{ index: 4, length: 6, isSelf: true }])).toBe(
      '水曜は  パパが飲み会',
    );
    // 位置がずれているもの（「@」で始まらない）は取り除かない。
    expect(stripMentions('今日は無理です', [{ index: 1, length: 3, isSelf: true }])).toBe('今日は無理です');
    expect(stripMentions('@きめとく', undefined)).toBe('');
  });

  it('ほかの人へのメンション（表示名）は、既定では取り除き、renameOther があればその文字に置き換える', () => {
    const text = '@きめとく @山田 太郎 水曜は飲み会';
    const mentionees = [{ index: 6, length: 6, isSelf: false, type: 'user' }];
    expect(stripMentions(text, mentionees)).toBe('水曜は飲み会');
    expect(stripMentions(text, mentionees, (m) => (m === '@山田 太郎' ? 'パパ' : ''))).toBe('パパ 水曜は飲み会');
    // bot と、ほかの人の両方
    const both = '@献立bot @Taro 卵切れた';
    expect(
      stripMentions(both, [
        { index: 0, length: 6, isSelf: true },
        { index: 7, length: 5, isSelf: false },
      ]),
    ).toBe('卵切れた');
  });
});

describe('truncateText', () => {
  it('上限を超えたら切って「…」を付ける（サロゲートペアは分けない）', () => {
    expect(truncateText('あいう', 3)).toBe('あいう');
    expect(truncateText('あいうえ', 3)).toBe('あい…');
    const cut = truncateText(`ab${'\u{1F35A}'}cd`, 4); // 3文字目と4文字目がサロゲートペア
    expect(cut).toBe('ab…');
    expect(cut.length).toBeLessThanOrEqual(4);
  });
});

describe('toLineMessages', () => {
  it('ChatMessage 1件 → テキスト1件。card があれば空行のあとにカードの中身', () => {
    const m = msg('今週の夕食です。', { card: { kind: 'week', weekStart: TODAY } });
    const out = toLineMessages(state, catalog, [m]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('text');
    expect(out[0].text).toBe(`今週の夕食です。\n\n${renderCardText(state, catalog, m.card!)}`);
    expect(out[0].quickReply).toBeUndefined();
  });

  it('画面のカードと同じ表現：量は「4人分（大人換算3.2）」、新しい料理の日は作り方の一言を1回だけ', () => {
    // デモの家族の最初の週は、金曜（11/13）が新しい料理の日
    let s = state;
    while (s.today < '2026-11-13') s = advanceDay(s, catalog).state;
    const r = handleUserText(s, catalog, '今日のごはん');
    const text = toLineMessages(r.state, catalog, r.replies)[0].text;
    expect(text).toContain('4人分（大人換算3.2）');
    expect(text).not.toContain('大人換算3.2人分');
    expect(text.match(/ははじめての料理です。作り方は、料理名でレシピを探してください。/g)).toHaveLength(1);
    expect(text).toMatch(/^作り方：「.+」ははじめての料理です。/m);
    const absent = handleUserText(state, catalog, '水曜はパパが飲み会');
    const reply = toLineMessages(absent.state, catalog, absent.replies)[0].text;
    expect(reply).toContain('パパの分を減らしました（3人分、大人換算2.2）。');
    expect(reply).toContain('3人分（大人換算2.2）（パパはいません）');
  });

  it('5件を超えたら、5件目以降を1つにまとめる。本文は5000文字まで', () => {
    const many = Array.from({ length: 7 }, (_, i) => msg(`メッセージ${i + 1}`));
    const out = toLineMessages(state, catalog, many);
    expect(out).toHaveLength(LINE_LIMITS.messagesPerRequest);
    expect(out[4].text).toBe('メッセージ5\n\nメッセージ6\n\nメッセージ7');

    const long = toLineMessages(state, catalog, [msg('あ'.repeat(6000))]);
    expect(long[0].text).toHaveLength(LINE_LIMITS.textLength);
    expect(long[0].text.endsWith('…')).toBe(true);
  });

  it('ボタンは最後のメッセージのクイックリプライ（13個まで・ラベル20文字まで・data は300文字以内）', () => {
    const buttons: ActionButton[] = Array.from({ length: 20 }, (_, i) => ({
      label: i === 0 ? 'とても長いラベルの料理名のボタンでございます' : `ボタン${i}`,
      action: { type: 'cooked', date: `2026-11-${String(i + 1).padStart(2, '0')}` },
    }));
    const tooLong: ActionButton = {
      label: '長すぎる',
      action: { type: 'choose_alternative', date: TODAY, dishIds: Array.from({ length: 30 }, (_, i) => `dish_${i}_xxxxxx`) },
    };
    const out = toLineMessages(state, catalog, [msg('一つ目', { actions: [tooLong] }), msg('二つ目', { actions: buttons })]);
    expect(out[0].quickReply).toBeUndefined();
    const items = out[1].quickReply!.items;
    expect(items).toHaveLength(LINE_LIMITS.quickReplyItems);
    expect(items[0].action.label).toHaveLength(20);
    expect(items[0].action.label.endsWith('…')).toBe(true);
    expect(items[0].action.displayText).toBe('とても長いラベルの料理名のボタンでございます');
    for (const item of items) {
      expect(item.type).toBe('action');
      expect(item.action.type).toBe('postback');
      expect(item.action.label.length).toBeLessThanOrEqual(LINE_LIMITS.labelLength);
      expect(item.action.data.length).toBeLessThanOrEqual(LINE_LIMITS.postbackData);
      expect(() => JSON.parse(item.action.data)).not.toThrow();
    }
    expect(items.some((i) => i.action.label === '長すぎる')).toBe(false);
    expect(JSON.parse(items[1].action.data)).toEqual({ type: 'cooked', date: '2026-11-02' });
  });

  it('前のメッセージのボタンも後ろに並べる。同じボタンは1つに、ラベルが重なるメッセージのボタンには日付を付ける', () => {
    const yesterday = msg('昨日の鶏の照り焼きは作りましたか？', {
      actions: [
        { label: '作った', action: { type: 'cooked', date: '2026-11-08' } },
        { label: '作らなかった', action: { type: 'not_cooked', date: '2026-11-08' } },
      ],
    });
    const today = msg('今日はさばの味噌煮です。', {
      actions: [
        { label: '作った', action: { type: 'cooked', date: TODAY } },
        { label: '今週の献立', action: { type: 'open_week' } },
      ],
    });
    const again = msg('ほかに', { actions: [{ label: '今週の献立', action: { type: 'open_week' } }] });
    const items = quickReplyItems([yesterday, today, again], state);
    expect(items.map((i) => i.action.label)).toEqual(['今週の献立', '作った', '11/8(日) 作った', '11/8(日) 作らなかった']);
    expect(JSON.parse(items[2].action.data)).toEqual({ type: 'cooked', date: '2026-11-08' });
    expect(items[3].action.displayText).toBe('11/8(日) 作らなかった');
    // 重ならなければ、日付は付けない
    expect(quickReplyItems([yesterday], state).map((i) => i.action.label)).toEqual(['作った', '作らなかった']);
  });

  it('1つの返信に提案が2つあると、どちらの［替える］［そのまま］も、提案の日付つきで出る', () => {
    const r = handleUserText(state, catalog, '鶏むねが安い。豚こまも安い');
    const withProposal = r.replies.filter((m) => m.actions?.some((a) => a.action.type === 'accept_proposal'));
    expect(withProposal).toHaveLength(2);
    const [first, second] = r.state.proposals;
    const items = quickReplyItems(r.replies, r.state);
    const byData = new Map(items.map((i) => [i.action.data, i.action.label]));
    for (const p of [first, second]) {
      expect(byData.get(JSON.stringify({ type: 'accept_proposal', proposalId: p.id }))).toBe(`${formatJa(p.date)} 替える`);
      expect(byData.get(JSON.stringify({ type: 'reject_proposal', proposalId: p.id }))).toBe(`${formatJa(p.date)} そのまま`);
    }
    for (const item of items) expect(item.action.label.length).toBeLessThanOrEqual(LINE_LIMITS.labelLength);
    // 提案が1つなら、日付は付けない
    const one = handleUserText(state, catalog, '鶏むねが安い');
    expect(quickReplyItems(one.replies, one.state).map((i) => i.action.label)).toEqual(['替える', 'そのまま']);
  });

  it('今日の提案のボタンには日付を付けない（日付のないボタンは今日のこと）', () => {
    const p1 = { id: 'prop_a', kind: 'sale_swap' as const, date: TODAY, fromDishIds: [], toDishIds: [], text: '' };
    const p2 = { ...p1, id: 'prop_b', date: '2026-11-12' };
    const s = { ...state, proposals: [p1, p2] };
    const ask = (id: string) =>
      msg('替えますか？', {
        actions: [
          { label: '替える', action: { type: 'accept_proposal', proposalId: id } },
          { label: 'そのまま', action: { type: 'reject_proposal', proposalId: id } },
        ],
      });
    expect(quickReplyItems([ask('prop_b'), ask('prop_a')], s).map((i) => i.action.label)).toEqual([
      '替える',
      'そのまま',
      '11/12(木) 替える',
      '11/12(木) そのまま',
    ]);
    // 片づいた提案（state にない）は、押しても使えないので入れない
    expect(quickReplyItems([ask('prop_gone'), ask('prop_a')], s).map((i) => i.action.label)).toEqual(['替える', 'そのまま']);
    // 今日でない提案の前にあっても、片づいた提案のボタンは入れない（日付のない「替える」を出さない）
    const onlyB = { ...state, proposals: [p2] };
    expect(quickReplyItems([ask('prop_gone'), ask('prop_b')], onlyB).map((i) => i.action.data)).toEqual([
      JSON.stringify({ type: 'accept_proposal', proposalId: 'prop_b' }),
      JSON.stringify({ type: 'reject_proposal', proposalId: 'prop_b' }),
    ]);
  });

  it('同じ返信の中で置き換わった提案（同じ日の後の提案）の［替える］［そのまま］は出さず、使える提案はすべて選べる', () => {
    // 例：11/10「鶏むねが安い。豚こまも安い」は、11/13 の提案を作り、同じ 11/13 の別の提案に置き換える
    const cases = [
      ['2026-11-10', '鶏むねが安い。豚こまも安い'],
      ['2026-11-09', '鶏ももが安い。鶏むねも安い'],
      ['2026-11-10', '鶏むねが安い。豚こまも安い。さばも安い'],
      ['2026-11-09', '鶏むねが安い。豚こまも安い'],
    ] as const;
    for (const [start, text] of cases) {
      const r = handleUserText(createInitialState(DEMO_ONBOARDING, catalog, start), catalog, text);
      const proposalIds = quickReplyItems(r.replies, r.state)
        .map((i) => JSON.parse(i.action.data) as { type: string; proposalId?: string })
        .filter((a) => a.type === 'accept_proposal' || a.type === 'reject_proposal')
        .map((a) => a.proposalId);
      for (const id of proposalIds) expect(r.state.proposals.some((p) => p.id === id)).toBe(true);
      for (const p of r.state.proposals) expect(proposalIds).toContain(p.id);
    }
  });

  it('13個の上限はメッセージ単位：入らないメッセージのボタンは、組ごと入れない', () => {
    let s = createInitialState({ ...DEMO_ONBOARDING, plan: 'paid' }, catalog, '2026-11-08');
    s = advanceDay(s, catalog).state; // 11/9
    const step = advanceDay(s, catalog); // 11/10：昨日（11/9）は作りましたか？
    const ask = step.replies.filter((m) => !m.push);
    expect(ask.some((m) => m.actions?.some((a) => a.action.type === 'not_cooked'))).toBe(true);
    const cooked = applyAction(step.state, catalog, { type: 'cooked', date: '2026-11-10' }); // ◎○△ が4人×3＝12個
    const items = quickReplyItems([...ask, ...cooked.replies], cooked.state);
    expect(items.length).toBeLessThanOrEqual(LINE_LIMITS.quickReplyItems);
    const types = items.map((i) => (JSON.parse(i.action.data) as { type: string }).type);
    expect(types.filter((t) => t === 'react')).toHaveLength(12);
    // 「作った」「作らなかった」は、両方あるか、両方ないか
    expect(types.includes('cooked')).toBe(types.includes('not_cooked'));
    // 入る分は入れる（前のメッセージでも、組ごと入るなら入れる）
    const small = msg('ほかに', { actions: [{ label: '今週の献立', action: { type: 'open_week' } }] });
    const more = quickReplyItems([small, ...ask, ...cooked.replies], cooked.state).map((i) => i.action.label);
    expect(more).toHaveLength(13);
    expect(more.at(-1)).toBe('今週の献立');
  });

  it('一人ずつの反応（有料版）：押したあとの返事のクイックリプライに、まだ押していない人のボタンが残る', () => {
    let s = createInitialState({ ...DEMO_ONBOARDING, plan: 'paid' }, catalog, TODAY);
    s = applyAction(s, catalog, { type: 'cooked', date: TODAY }).state;
    const r = applyAction(s, catalog, { type: 'react', date: TODAY, memberId: 'member_1', reaction: 'great' });
    const labels = toLineMessages(r.state, catalog, r.replies).at(-1)!.quickReply!.items.map((i) => i.action.label);
    expect(labels).toContain('パパ ◎');
    expect(labels).toContain('ゆい △');
    expect(labels).not.toContain('ママ ◎');
    expect(labels.length).toBeLessThanOrEqual(LINE_LIMITS.quickReplyItems);
  });
});

describe('createLineClient', () => {
  const token = 'secret-access-token';

  it('reply：reply API に Bearer トークンつきで送る', async () => {
    const { fetch, calls } = fakeLineFetch();
    const client = createLineClient({ accessToken: token, fetch });
    const messages = [{ type: 'text' as const, text: 'こんにちは' }];
    expect(await client.reply('reply-token-1', messages)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.line.me/v2/bot/message/reply');
    expect(calls[0].headers.authorization).toBe(`Bearer ${token}`);
    expect(calls[0].headers['content-type']).toBe('application/json');
    expect(calls[0].body).toEqual({ replyToken: 'reply-token-1', messages });
  });

  it('失敗はログに出す（トークンや本文は出さない）', async () => {
    const logger = memoryLogger();
    const { fetch } = fakeLineFetch(() => new Response(JSON.stringify({ message: 'Invalid reply token' }), { status: 400 }));
    const client = createLineClient({ accessToken: token, fetch, logger });
    expect(await client.reply('reply-token-2', [{ type: 'text', text: '水曜はパパが飲み会' }])).toBe(false);
    const logs = logger.lines.join('\n');
    expect(logs).toContain('400');
    expect(logs).toContain('Invalid reply token');
    expect(logs).not.toContain(token);
    expect(logs).not.toContain('reply-token-2');
    expect(logs).not.toContain('飲み会');
  });

  it('push：サーバーのエラーなら、同じ再送キーで1回だけ送り直す', async () => {
    const { fetch, calls } = fakeLineFetch((_call, i) => new Response('{}', { status: i === 0 ? 500 : 200 }));
    const client = createLineClient({ accessToken: token, fetch, retryDelayMs: 0 });
    expect(await client.push('Ugroup', [{ type: 'text', text: '今日はさばの味噌煮です。' }])).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://api.line.me/v2/bot/message/push');
    expect(calls[0].body.to).toBe('Ugroup');
    expect(calls[0].headers['x-line-retry-key']).toBeTruthy();
    expect(calls[1].headers['x-line-retry-key']).toBe(calls[0].headers['x-line-retry-key']);
  });

  it('push：受け付け済み（409）は成功、400 は送り直さずに失敗、通信できなければ2回で諦める', async () => {
    const accepted = fakeLineFetch((_c, i) => new Response('{}', { status: i === 0 ? 503 : 409 }));
    expect(
      await createLineClient({ accessToken: token, fetch: accepted.fetch, retryDelayMs: 0 }).push('U1', [
        { type: 'text', text: 'a' },
      ]),
    ).toBe(true);

    const bad = fakeLineFetch(() => new Response('{}', { status: 400 }));
    expect(await createLineClient({ accessToken: token, fetch: bad.fetch, retryDelayMs: 0 }).push('U1', [{ type: 'text', text: 'a' }])).toBe(false);
    expect(bad.calls).toHaveLength(1);

    let tries = 0;
    const offline = createLineClient({
      accessToken: token,
      retryDelayMs: 0,
      fetch: async () => {
        tries += 1;
        throw new TypeError('fetch failed');
      },
    });
    expect(await offline.push('U1', [{ type: 'text', text: 'a' }])).toBe(false);
    expect(tries).toBe(2);
  });

  it('送るものがなければ呼ばない', async () => {
    const { fetch, calls } = fakeLineFetch();
    const client = createLineClient({ accessToken: token, fetch });
    expect(await client.reply('rt', [])).toBe(false);
    expect(await client.push('U1', [])).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
