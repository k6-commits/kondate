import { describe, expect, it } from 'vitest';
import { DEMO_ONBOARDING, defaultCatalog } from '../src/data/index';
import { applyAction, createInitialState, renderCardText, type ActionButton, type ChatMessage } from '../src/engine/index';
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
    const items = quickReplyItems([yesterday, today, again]);
    expect(items.map((i) => i.action.label)).toEqual(['今週の献立', '作った', '11/8(日) 作った', '11/8(日) 作らなかった']);
    expect(JSON.parse(items[2].action.data)).toEqual({ type: 'cooked', date: '2026-11-08' });
    expect(items[3].action.displayText).toBe('11/8(日) 作らなかった');
    // 重ならなければ、日付は付けない
    expect(quickReplyItems([yesterday]).map((i) => i.action.label)).toEqual(['作った', '作らなかった']);
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
