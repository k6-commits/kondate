import { describe, expect, it } from 'vitest';
import { DEMO_ONBOARDING, defaultCatalog } from '../src/data/index';
import {
  addDays,
  applyAction,
  createInitialState,
  findDish,
  handleUserText,
  type Action,
  type AppState,
  type ChatMessage,
  type ISODate,
} from '../src/engine/index';
import {
  GROUP_HINT,
  MAX_SYNC_DAYS,
  RESET_NOTE,
  demoFamilyNote,
  jstToday,
  prepareRecord,
  pushesToSend,
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

  it('届けそびれた週の献立は、その週が終わるまで pendingPush に残す（金曜から月曜まで一度に同期しても落とさない）', () => {
    const r = record('2026-11-13', 'paid'); // 金曜。日曜（11/15）に来週（11/16〜）の献立ができる
    const sunday = syncRecord(r, catalog, '2026-11-15')!;
    expect(sunday.pendingPush.some((m) => m.card?.kind === 'week' && m.card.weekStart === '2026-11-16')).toBe(true);

    const monday = syncRecord(r, catalog, '2026-11-16')!; // 土日に cron を呼ばなかった
    const week = monday.pendingPush.find((m) => m.card?.kind === 'week');
    expect(week?.card).toEqual({ kind: 'week', weekStart: '2026-11-16' });
    expect(week?.at.startsWith('2026-11-15')).toBe(true);
    // 今日の献立の配信も入る（前の日の今日の献立や解凍の連絡は、もう入らない）
    expect(monday.pendingPush.some((m) => m.card?.kind === 'meal' && m.card.date === '2026-11-16')).toBe(true);
    expect(monday.pendingPush.every((m) => m.card?.kind === 'week' || m.at.startsWith('2026-11-16'))).toBe(true);

    // その週が終わったら落とす
    const later = syncRecord(monday, catalog, '2026-11-23')!;
    expect(later.pendingPush.some((m) => m.card?.kind === 'week' && m.card.weekStart === '2026-11-16')).toBe(false);
  });

  it(`${MAX_SYNC_DAYS}日より古ければ null（作り直す）`, () => {
    expect(syncRecord(record('2026-10-09'), catalog, '2026-11-09')).not.toBeNull(); // 31日
    expect(syncRecord(record('2026-10-08'), catalog, '2026-11-09')).toBeNull(); // 32日
  });
});

describe('pushesToSend（有料版の配信を、送る直前の state で作り直す）', () => {
  /** 有料版で、明日の主菜の食材を冷凍してある状態（今日の献立の配信と、解凍の連絡がたまっている）。 */
  function paidWithThaw(): { record: StoredRecord; tomorrow: ISODate } {
    for (const start of ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-17']) {
      const s0 = createInitialState({ ...DEMO_ONBOARDING, plan: 'paid' }, catalog, start);
      const target = s0.meals.find((m) => m.date === addDays(start, 2) && m.kind === 'normal');
      const ing = target
        ? findDish(s0, catalog, target.dishIds[0])
            ?.ingredients.map((di) => catalog.ingredientById.get(di.ingredientId)!)
            .find((i) => !i.pantry && i.freezable && i.thaw !== 'from_frozen')
        : undefined;
      if (!ing) continue;
      const s1 = handleUserText(s0, catalog, `${ing.aliases[0] ?? ing.name}冷凍した`).state;
      const synced = syncRecord({ ...USER, state: s1, pendingPush: [], pendingReply: [], updatedAt: '' }, catalog, addDays(start, 1))!;
      const tomorrow = addDays(start, 2);
      if (synced.pendingPush.some((m) => m.card?.kind === 'meal' && m.card.date === tomorrow)) return { record: synced, tomorrow };
    }
    throw new Error('解凍の連絡ができる日が見つかりません');
  }

  /** その日の「別のに」の1つ目の候補を選ぶ。 */
  function swap(state: AppState, date: ISODate): AppState {
    const alt = applyAction(state, catalog, { type: 'request_alternatives', date });
    const choose = alt.replies.flatMap((m) => m.actions ?? []).find((a) => a.action.type === 'choose_alternative');
    expect(choose).toBeDefined();
    return applyAction(alt.state, catalog, choose!.action as Action).state;
  }

  const mealPush = (messages: ChatMessage[], date: ISODate) => messages.find((m) => m.card?.kind === 'meal' && m.card.date === date);
  const dishNames = (state: AppState, date: ISODate) =>
    (state.meals.find((m) => m.date === date)?.dishIds ?? []).map((id) => findDish(state, catalog, id)!.name);

  it('昼に今日の献立を変えても、夕方の配信の本文とボタンは今の献立のもの', () => {
    const { record } = paidWithThaw();
    const today = record.state.today;
    const queued = mealPush(record.pendingPush, today)!;
    expect(queued).toBeDefined();
    const changed = swap(record.state, today);
    expect(dishNames(changed, today)).not.toEqual(dishNames(record.state, today));

    const out = pushesToSend(changed, catalog, record.pendingPush);
    const now = mealPush(out, today)!;
    const shown = applyAction(changed, catalog, { type: 'open_today' }).replies[0];
    expect(now.text).toBe(shown.text);
    expect(now.text).not.toBe(queued.text);
    for (const name of dishNames(changed, today)) expect(now.text).toContain(name);
    expect(now.actions).toEqual(shown.actions);
    expect(now.push).toBe(true);

    // 今日は無理（ラク日）にしたら、ボタンに［今日は無理］は残らない
    const raku = handleUserText(record.state, catalog, '今日は無理').state;
    const rakuPush = mealPush(pushesToSend(raku, catalog, record.pendingPush), today)!;
    expect(rakuPush.text).toBe(applyAction(raku, catalog, { type: 'open_today' }).replies[0].text);
    if (raku.meals.find((m) => m.date === today)?.kind === 'raku') {
      expect(rakuPush.actions?.some((a) => a.action.type === 'today_impossible')).toBe(false);
    }
  });

  it('明日の献立を変えたら、解凍の連絡も今の明日の献立に合わせる（要らなくなったら送らない）', () => {
    const { record, tomorrow } = paidWithThaw();
    const queuedThaw = mealPush(record.pendingPush, tomorrow)!;
    expect(queuedThaw.text).toMatch(/^明日の.+用に、.+を冷凍室から冷蔵室へ/);
    // 変えなければ、同じ文面
    expect(mealPush(pushesToSend(record.state, catalog, record.pendingPush), tomorrow)?.text).toBe(queuedThaw.text);

    const changed = swap(record.state, tomorrow);
    const thaw = mealPush(pushesToSend(changed, catalog, record.pendingPush), tomorrow);
    if (thaw) {
      expect(dishNames(changed, tomorrow).some((name) => thaw.text.includes(`明日の${name}`))).toBe(true);
    }
    expect(thaw?.text).not.toBe(queuedThaw.text);
  });

  it('今日をもう「作った」なら、今日の献立の配信は送らない。たまっていなければ何も送らない', () => {
    const { record, tomorrow } = paidWithThaw();
    const cooked = applyAction(record.state, catalog, { type: 'cooked', date: record.state.today }).state;
    const out = pushesToSend(cooked, catalog, record.pendingPush);
    expect(mealPush(out, cooked.today)).toBeUndefined();
    expect(mealPush(out, tomorrow)).toBeDefined();
    expect(pushesToSend(cooked, catalog, [])).toEqual([]);
  });

  it('届けそびれた週の献立は、今日の言い方（今週）で作り直す。今日できたものは、そのまま', () => {
    const monday = syncRecord(record('2026-11-13', 'paid'), catalog, '2026-11-16')!;
    const queued = monday.pendingPush.find((m) => m.card?.kind === 'week')!;
    expect(queued.text.startsWith('来週の夕食です')).toBe(true);
    const out = pushesToSend(monday.state, catalog, monday.pendingPush);
    const week = out.find((m) => m.card?.kind === 'week')!;
    expect(week.card).toEqual({ kind: 'week', weekStart: '2026-11-16' });
    expect(week.text.startsWith('今週の夕食です')).toBe(true);
    expect(out.indexOf(week)).toBe(0); // 週の献立 → 今日の献立 の順
    expect(mealPush(out, '2026-11-16')).toBeDefined();

    const sunday = syncRecord(record('2026-11-13', 'paid'), catalog, '2026-11-15')!;
    const onTime = pushesToSend(sunday.state, catalog, sunday.pendingPush).find((m) => m.card?.kind === 'week')!;
    expect(onTime.text).toBe(sunday.pendingPush.find((m) => m.card?.kind === 'week')!.text);
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
