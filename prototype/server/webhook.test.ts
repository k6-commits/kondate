import { describe, expect, it } from 'vitest';
import type { Action } from '../src/engine/index';
import { LineEventSchema, parseAction } from './webhook';

// エンジンの Action の種類をすべて並べる（種類が増えたら型エラーになり、ActionSchema の直し忘れに気づける）。
const samples: { [K in Action['type']]: Extract<Action, { type: K }> } = {
  open_week: { type: 'open_week' },
  open_today: { type: 'open_today' },
  open_shopping: { type: 'open_shopping' },
  cooked: { type: 'cooked', date: '2026-11-09' },
  not_cooked: { type: 'not_cooked', date: '2026-11-09' },
  request_alternatives: { type: 'request_alternatives', date: '2026-11-10' },
  choose_alternative: { type: 'choose_alternative', date: '2026-11-10', dishIds: ['chicken_teriyaki', 'miso_soup'] },
  today_impossible: { type: 'today_impossible', date: '2026-11-09' },
  accept_proposal: { type: 'accept_proposal', proposalId: 'prop_12' },
  reject_proposal: { type: 'reject_proposal', proposalId: 'prop_12' },
  react: { type: 'react', date: '2026-11-09', memberId: 'household', reaction: 'great' },
  check_item: { type: 'check_item', shoppingDate: '2026-11-09', ingredientId: 'egg', checked: true },
  regenerate_week: { type: 'regenerate_week', weekStart: '2026-11-16' },
  weekly_checkin: { type: 'weekly_checkin', weekStart: '2026-11-16', thoughtDays: 2 },
};

describe('parseAction（postback の data）', () => {
  it('エンジンのすべての Action を読み戻せる', () => {
    for (const action of Object.values(samples)) expect(parseAction(JSON.stringify(action))).toEqual(action);
  });

  it('余計な項目は落とす', () => {
    expect(parseAction(JSON.stringify({ type: 'cooked', date: '2026-11-09', extra: 'x' }))).toEqual({
      type: 'cooked',
      date: '2026-11-09',
    });
  });

  it('JSON でない・知らない種類・日付が不正・項目が足りない・300文字を超えるものは null', () => {
    expect(parseAction('')).toBeNull();
    expect(parseAction('{')).toBeNull();
    expect(parseAction('"open_week"')).toBeNull();
    expect(parseAction(JSON.stringify({ type: 'unknown' }))).toBeNull();
    expect(parseAction(JSON.stringify({ type: 'cooked', date: '2026-11-31' }))).toBeNull();
    expect(parseAction(JSON.stringify({ type: 'cooked' }))).toBeNull();
    expect(parseAction(JSON.stringify({ type: 'react', date: '2026-11-09', memberId: 'm', reaction: 'love' }))).toBeNull();
    expect(parseAction(JSON.stringify({ type: 'choose_alternative', date: '2026-11-09', dishIds: [] }))).toBeNull();
    expect(parseAction(JSON.stringify({ type: 'open_week', pad: 'x'.repeat(300) }))).toBeNull();
  });
});

describe('LineEventSchema', () => {
  it('使う種類のイベントだけを読む（ほかは無視する）', () => {
    const source = { type: 'user', userId: 'U1' };
    expect(LineEventSchema.safeParse({ type: 'follow', replyToken: 'r', source }).success).toBe(true);
    // ブロック・退出は、記録を消すために読む
    expect(LineEventSchema.safeParse({ type: 'unfollow', source }).success).toBe(true);
    expect(LineEventSchema.safeParse({ type: 'leave', source: { type: 'group', groupId: 'C1' } }).success).toBe(true);
    expect(LineEventSchema.safeParse({ type: 'unsend', source, unsend: { messageId: 'm1' } }).success).toBe(false);
    expect(LineEventSchema.safeParse({ type: 'message', source: { type: 'group' }, message: { type: 'text', text: 'a' } }).success).toBe(
      false,
    );
  });
});
