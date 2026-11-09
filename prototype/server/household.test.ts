import { describe, expect, it } from 'vitest';
import { DEMO_ONBOARDING, defaultCatalog } from '../src/data/index';
import { createInitialState } from '../src/engine/index';
import {
  GROUP_HINT,
  MAX_SYNC_DAYS,
  RESET_NOTE,
  demoFamilyNote,
  jstToday,
  prepareRecord,
  syncRecord,
  type SourceRef,
} from './household';
import type { StoredRecord } from './store';

const catalog = defaultCatalog;
const USER: SourceRef = { key: 'Uuser', sourceType: 'user', sourceId: 'Uuser' };
const GROUP: SourceRef = { key: 'Cgroup', sourceType: 'group', sourceId: 'Cgroup' };

function record(today: string, plan: 'free' | 'paid' = 'free', source: SourceRef = USER): StoredRecord {
  return {
    ...source,
    state: createInitialState({ ...DEMO_ONBOARDING, plan }, catalog, today),
    pendingPush: [],
    pendingReply: [],
    updatedAt: '',
  };
}

describe('jstToday', () => {
  it('日本時間の日付（UTC の15時で日付が変わる）', () => {
    expect(jstToday(new Date('2026-11-08T14:59:59Z'))).toBe('2026-11-08');
    expect(jstToday(new Date('2026-11-08T15:00:00Z'))).toBe('2026-11-09');
  });
});

describe('syncRecord（日付の同期）', () => {
  it('今日なら何もしない', () => {
    const r = record('2026-11-09');
    const synced = syncRecord(r, catalog, '2026-11-09')!;
    expect(synced.state).toEqual(r.state);
    expect(synced.pendingReply).toEqual([]);
  });

  it('3日前の状態を今日まで進め、最後の1日分の「作りましたか？」だけを pendingReply に入れる', () => {
    const r = record('2026-11-08'); // 日曜
    const synced = syncRecord(r, catalog, '2026-11-11')!; // 水曜
    expect(synced.state.today).toBe('2026-11-11');
    expect(synced.pendingReply).toHaveLength(1);
    expect(synced.pendingReply[0].text).toMatch(/^昨日の.+は作りましたか？$/);
    expect(synced.pendingReply[0].actions?.map((a) => a.action)).toEqual([
      { type: 'cooked', date: '2026-11-10' },
      { type: 'not_cooked', date: '2026-11-10' },
    ]);
    // 前の日（月曜）の分は、もう「昨日」ではないので添えない
    expect(synced.state.meals.find((m) => m.date === '2026-11-09')?.status).toBe('unconfirmed');
    expect(synced.pendingPush).toEqual([]); // 無料版は配信しない
  });

  it('有料版の配信は pendingPush にためる（今日の日付のものだけ）', () => {
    const r = record('2026-11-07', 'paid'); // 土曜。日曜に来週の献立、月曜に今日のごはんの配信ができる
    const synced = syncRecord(r, catalog, '2026-11-09')!;
    expect(synced.pendingPush.length).toBeGreaterThan(0);
    expect(synced.pendingPush.every((m) => m.push && m.at.startsWith('2026-11-09'))).toBe(true);
    expect(synced.pendingPush.some((m) => m.card?.kind === 'meal' && m.card.date === '2026-11-09')).toBe(true);
  });

  it(`${MAX_SYNC_DAYS}日より古ければ null（作り直す）`, () => {
    expect(syncRecord(record('2026-10-09'), catalog, '2026-11-09')).not.toBeNull(); // 31日
    expect(syncRecord(record('2026-10-08'), catalog, '2026-11-09')).toBeNull(); // 32日
  });
});

describe('prepareRecord', () => {
  it('状態がなければ、デモの家族で作り、あいさつにデモの家族の一言を添える', () => {
    const p = prepareRecord(null, USER, catalog, '2026-11-09');
    expect(p.created).toBe('new');
    expect(p.record.key).toBe('Uuser');
    expect(p.record.state.household.members.map((m) => m.nickname)).toEqual(['ママ', 'パパ', 'はると', 'ゆい']);
    expect(p.intro).toHaveLength(3);
    expect(p.intro[0].text).toContain('はじめまして');
    expect(p.intro[0].text).toContain(demoFamilyNote(catalog));
    expect(p.intro[0].text).not.toContain(GROUP_HINT);
    expect(p.intro[2].card?.kind).toBe('week');
    // state.chat の中身は変えない（一言は返信だけに添える）
    expect(p.record.state.chat[0].text).not.toContain('デモの家族');
  });

  it('グループでは、@きめとく の付け方も伝える', () => {
    const p = prepareRecord(null, GROUP, catalog, '2026-11-09');
    expect(p.intro[0].text).toContain(GROUP_HINT);
  });

  it('古すぎる状態は、プランを引き継いで作り直す', () => {
    const p = prepareRecord(record('2026-08-01', 'paid'), USER, catalog, '2026-11-09');
    expect(p.created).toBe('reset');
    expect(p.record.state.today).toBe('2026-11-09');
    expect(p.record.state.household.settings.plan).toBe('paid');
    expect(p.intro[0].text.startsWith(RESET_NOTE)).toBe(true);
    expect(p.intro[0].text).not.toContain('はじめまして');
  });

  it('あれば日付を進め、pendingReply を carry に移して空にする', () => {
    const p = prepareRecord(record('2026-11-08'), USER, catalog, '2026-11-11');
    expect(p.created).toBeNull();
    expect(p.intro).toEqual([]);
    expect(p.carry).toHaveLength(1);
    expect(p.record.pendingReply).toEqual([]);
  });

  it('デモの家族の一言', () => {
    expect(demoFamilyNote(catalog)).toBe(
      '試作版のため、家族は「デモの家族」で始めています。\nママ・パパ・はると（小学生、卵アレルギー）・ゆい（幼児）',
    );
  });
});
