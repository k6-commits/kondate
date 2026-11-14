// 試用の集計（aggregate.ts・summary.ts）：読み取り・合計・割合・目安の判定・北極星・気をつけること・共有する文。
import type { ISODate, TrialClock, TrialReport } from '../engine/index';
import { TRIAL_REPORT_MARKER, checkTrialReport, formatTrialReport } from '../engine/index';
import type { Family } from './aggregate';
import {
  MIN_DAYS,
  MIN_FAMILIES,
  aggregate,
  checkinText,
  familyLetter,
  familyNote,
  familyText,
  percent,
  percentText,
  periodText,
  readPaste,
  reportKey,
  violationText,
} from './aggregate';
import { NOT_MEASURABLE, familyStarText, starVerdictText, summaryText } from './summary';

const MON = '2026-11-16';
let serial = 0;

interface ReportInput {
  from?: ISODate | null;
  to?: ISODate | null;
  madeOn?: ISODate;
  clock?: TrialClock;
  plan?: 'free' | 'paid';
  family?: Partial<TrialReport['family']>;
  days?: Partial<{ everyoneOut: number; cookedAsPlanned: number; cookedChanged: number; skipped: number; unconfirmed: number; todayImpossible: number }>;
  reactions?: Partial<TrialReport['reactions']>;
  checkins?: TrialReport['checkins'];
  safetyViolations?: number;
  safetyViolationDays?: ISODate[];
  talk?: Partial<TrialReport['talk']>;
}

/** 形の正しい記録を作る（dinner と cooked は内訳から数える）。 */
function rep(o: ReportInput = {}): TrialReport {
  const d = { everyoneOut: 0, cookedAsPlanned: 3, cookedChanged: 1, skipped: 1, unconfirmed: 0, todayImpossible: 0, ...o.days };
  const cooked = d.cookedAsPlanned + d.cookedChanged;
  const from = o.from === undefined ? MON : o.from;
  const r: TrialReport = {
    v: 1,
    from,
    to: o.to === undefined ? (from === null ? null : '2026-11-20') : o.to,
    madeOn: o.madeOn ?? '2026-11-21',
    clock: o.clock ?? 'calendar',
    plan: o.plan ?? 'free',
    family: { adult: 2, teen: 0, child: 1, preschool: 1, infant: 0, withExclusions: 1, ...o.family },
    days: {
      dinner: d.everyoneOut + cooked + d.skipped + d.unconfirmed,
      everyoneOut: d.everyoneOut,
      cooked,
      cookedAsPlanned: d.cookedAsPlanned,
      cookedChanged: d.cookedChanged,
      skipped: d.skipped,
      unconfirmed: d.unconfirmed,
      todayImpossible: d.todayImpossible,
    },
    reactions: { great: 1, ok: 1, meh: 0, ...o.reactions },
    checkins: o.checkins ?? [{ weekStart: MON, plannedDays: 5, thoughtDays: 1 }],
    safetyViolations: o.safetyViolations ?? 0,
    ...(o.safetyViolationDays ? { safetyViolationDays: o.safetyViolationDays } : {}),
    // taps は記録ごとに変える（同じ中身の記録は、貼り付けたときに1つにまとめられるため）
    talk: { messages: 2, unreadable: 0, taps: 100 + serial++, ...o.talk },
  };
  expect(checkTrialReport(r)).toBeNull();
  return r;
}

/** 記録を貼り付けた文にして読む（家族A・家族B…）。 */
function families(...reports: TrialReport[]): Family[] {
  const reading = readPaste(reports.map((r) => `よろしくお願いします。\n${formatTrialReport(r)}`).join('\n\n'));
  expect(reading.errors).toEqual([]);
  return reading.families;
}

/** n 日の献立の日で、作った日が cooked 日の記録（そのまま作った日として数える）。 */
const cookedOf = (cooked: number, planned: number, extra: ReportInput = {}) =>
  rep({ ...extra, days: { cookedAsPlanned: cooked, cookedChanged: 0, skipped: planned - cooked, unconfirmed: 0, ...extra.days } });

// ---------------------------------------------------------------------------

describe('readPaste：貼り付けた文から家族を読む', () => {
  it('貼り付けた順に 家族A・家族B…。あいだの文は無視する', () => {
    const a = rep({ plan: 'free' });
    const b = rep({ plan: 'paid', talk: { messages: 9 } });
    const reading = readPaste(`田中です\n${formatTrialReport(a)}\n\n鈴木です。\n${formatTrialReport(b)}\nありがとうございました`);
    expect(reading.families.map((f) => [f.label, f.report])).toEqual([
      ['家族A', a],
      ['家族B', b],
    ]);
    expect(reading).toMatchObject({ errors: [], duplicates: 0, noMarker: false });
  });

  it('同じ記録を2回貼っても1家族として数え、まとめた数を返す（途中で改行されていても同じ記録）', () => {
    const a = rep();
    const b = rep({ talk: { messages: 7 } });
    const line = formatTrialReport(a).split('\n').at(-1)!;
    const wrapped = `${TRIAL_REPORT_MARKER}\n${line.slice(TRIAL_REPORT_MARKER.length).match(/.{1,40}/gsu)!.join('\n')}`;
    const reading = readPaste([formatTrialReport(a), formatTrialReport(b), wrapped, formatTrialReport(a)].join('\n'));
    expect(reading.families.map((f) => f.label)).toEqual(['家族A', '家族B']);
    expect(reading.duplicates).toBe(2);
    expect(reading.families[0].key).toBe(reportKey(a));
  });

  it('鍵は中身から作る（項目の並びに左右されず、中身が違えば違う）', () => {
    const a = rep();
    const { talk, days, ...rest } = a;
    const reordered = JSON.parse(JSON.stringify({ talk, days, ...rest })) as TrialReport;
    expect(Object.keys(reordered)[0]).toBe('talk');
    expect(reportKey(reordered)).toBe(reportKey(a));
    expect(reportKey(rep({ talk: { taps: 6 } }))).not.toBe(reportKey(a));
    expect(reportKey(a)).toMatch(/^r[0-9a-z]+$/);
  });

  it('読めない記録は、エンジンのわけをそのまま返す。印がなければ noMarker', () => {
    const a = rep();
    const reading = readPaste(`${formatTrialReport(a)}\n${TRIAL_REPORT_MARKER}{"v":1,"from":`);
    expect(reading.families).toHaveLength(1);
    expect(reading.errors).toEqual(['2件目：記録の数字の行を読めませんでした（途中で切れているかもしれません）']);
    expect(readPaste('こんにちは。記録はあとで送ります。')).toMatchObject({ families: [], errors: [], noMarker: true });
    expect(readPaste('   \n')).toMatchObject({ families: [], errors: [], noMarker: false });
    expect(readPaste('')).toEqual({ families: [], errors: [], duplicates: 0, noMarker: false });
  });

  it('見本の記録に印を付ける', () => {
    const a = rep();
    const b = rep({ plan: 'paid' });
    const reading = readPaste(`${formatTrialReport(a)}\n${formatTrialReport(b)}`, (key) => key === reportKey(b));
    expect(reading.families.map((f) => f.sample === true)).toEqual([false, true]);
  });

  it('家族の文字：A〜Z のあとは AA、AB…', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(familyLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
});

describe('percent：目安の向きに合わせて丸める', () => {
  it('以上の目安は切り捨て、以下の目安は切り上げ。割り切れるときはそのまま。分母 0 は null', () => {
    expect(percent(7, 10, 'down')).toBe(70);
    expect(percent(14, 20, 'down')).toBe(70);
    expect(percent(16, 23, 'down')).toBe(69); // 69.56…（70% と出して「届いていない」にしない）
    expect(percent(7, 23, 'up')).toBe(31); // 30.43…
    expect(percent(5, 10, 'up')).toBe(50);
    expect(percent(1, 3, 'down')).toBe(33);
    expect(percent(0, 4, 'up')).toBe(0);
    expect(percent(3, 0, 'down')).toBeNull();
    expect(percentText(3, 0, 'down')).toBe('—');
    expect(percentText(9, 14, 'down')).toBe('64%');
  });
});

describe('aggregate：続行の目安（企画書 12章）', () => {
  it('提案の70%以上を作る：Σ作った ／ Σ（献立の日 − みんな外食）。ちょうど70%は「届いた」', () => {
    const fs = families(cookedOf(4, 5), cookedOf(3, 5), cookedOf(4, 5, { days: { everyoneOut: 2 } }), cookedOf(3, 5));
    const agg = aggregate(fs);
    expect(agg.totals).toMatchObject({ dinner: 22, everyoneOut: 2, planned: 20, cooked: 14 });
    expect(agg.criteria.cooked).toEqual({ cooked: 14, planned: 20, families: 4, verdict: 'reached' });
  });

  it('70%に届かなければ「届いていない」（69.5%でも）。記録なしの日は作らなかった日として数える', () => {
    const fs = families(cookedOf(4, 6), cookedOf(4, 6), rep({ days: { cookedAsPlanned: 3, cookedChanged: 0, skipped: 0, unconfirmed: 2 } }), cookedOf(5, 5));
    // 作った 4+4+3+5 = 16、献立の日 6+6+5+5 = 22 → 72.7%（届いた）。記録なしの2日は分母に入る
    expect(aggregate(fs).criteria.cooked).toMatchObject({ cooked: 16, planned: 22, verdict: 'reached' });
    const fewer = families(cookedOf(4, 6), cookedOf(4, 6), cookedOf(3, 6), cookedOf(5, 5));
    // 16 ／ 23 = 69.56…%
    const c = aggregate(fewer).criteria.cooked;
    expect(c).toMatchObject({ cooked: 16, planned: 23, verdict: 'missed' });
    expect(percentText(c.cooked, c.planned, 'down')).toBe('69%');
  });

  it(`家族が${MIN_FAMILIES}組より少ないか、日数が${MIN_DAYS}日より少ないうちは「まだ分からない」`, () => {
    // 2家族（日数は多い）
    expect(aggregate(families(cookedOf(5, 6), cookedOf(6, 6))).criteria.cooked.verdict).toBe('unknown');
    // 3家族で 11日
    const short = aggregate(families(cookedOf(4, 4), cookedOf(4, 4), cookedOf(3, 3)));
    expect(short.criteria.cooked).toMatchObject({ planned: 11, families: 3, verdict: 'unknown' });
    // 3家族で 12日
    expect(aggregate(families(cookedOf(4, 4), cookedOf(4, 4), cookedOf(4, 4))).criteria.cooked.verdict).toBe('reached');
    // 献立の日がない家族（みんな外食だけ・まだ過ぎた日がない）は、家族の数に入れない
    const out = rep({ days: { everyoneOut: 3, cookedAsPlanned: 0, cookedChanged: 0, skipped: 0, unconfirmed: 0 } });
    const none = rep({ from: null, days: { cookedAsPlanned: 0, cookedChanged: 0, skipped: 0 }, checkins: [] });
    const two = aggregate(families(cookedOf(6, 6), cookedOf(6, 6), out, none));
    expect(two.criteria.cooked).toMatchObject({ families: 2, planned: 12, verdict: 'unknown' });
  });

  it('自分で考えた日が半分以下：週末の質問の答えを合わせる。答えた家族の数を数え、ちょうど半分は「届いた」', () => {
    const fs = families(
      rep({ checkins: [{ weekStart: MON, plannedDays: 5, thoughtDays: 3 }] }),
      rep({ checkins: [{ weekStart: MON, plannedDays: 4, thoughtDays: 2 }] }),
      rep({ checkins: [{ weekStart: MON, plannedDays: 3, thoughtDays: 1 }] }),
      rep({ checkins: [] }),
    );
    const agg = aggregate(fs);
    expect(agg.criteria.thought).toEqual({ thought: 6, planned: 12, answered: 3, of: 4, verdict: 'reached' });
    const more = aggregate(
      families(
        rep({ checkins: [{ weekStart: MON, plannedDays: 5, thoughtDays: 3 }] }),
        rep({ checkins: [{ weekStart: MON, plannedDays: 4, thoughtDays: 3 }] }),
        rep({ checkins: [{ weekStart: MON, plannedDays: 3, thoughtDays: 1 }] }),
      ),
    );
    expect(more.criteria.thought).toMatchObject({ thought: 7, planned: 12, verdict: 'missed' });
    expect(percentText(7, 12, 'up')).toBe('59%');
  });

  it('週末の質問：2週分の答えも合わせる。答えた家族が足りなければ「まだ分からない」', () => {
    const twoWeeks = rep({
      checkins: [
        { weekStart: '2026-11-09', plannedDays: 5, thoughtDays: 1 },
        { weekStart: MON, plannedDays: 5, thoughtDays: 0 },
      ],
    });
    const agg = aggregate(families(twoWeeks, rep({ checkins: [{ weekStart: MON, plannedDays: 5, thoughtDays: 0 }] }), rep({ checkins: [] })));
    expect(agg.criteria.thought).toEqual({ thought: 1, planned: 15, answered: 2, of: 3, verdict: 'unknown' });
  });

  it('除外の違反：1件でもあれば（家族が少なくても）「届いていない」。0件は、数が足りれば「届いた」', () => {
    const bad = rep({ safetyViolations: 2, safetyViolationDays: ['2026-11-17'] });
    const one = aggregate(families(bad));
    expect(one.criteria.safety).toEqual({ violations: 2, families: ['家族A'], verdict: 'missed' });
    expect(aggregate(families(rep())).criteria.safety.verdict).toBe('unknown');
    expect(aggregate(families(rep(), rep({ plan: 'paid' }), rep({ talk: { messages: 4 } }))).criteria.safety).toEqual({
      violations: 0,
      families: [],
      verdict: 'reached',
    });
  });

  it('記録がなければ、どれも「まだ分からない」。北極星は答えなし', () => {
    const agg = aggregate([]);
    expect(agg.rows).toEqual([]);
    expect(agg.criteria).toEqual({
      cooked: { cooked: 0, planned: 0, families: 0, verdict: 'unknown' },
      thought: { thought: 0, planned: 0, answered: 0, of: 0, verdict: 'unknown' },
      safety: { violations: 0, families: [], verdict: 'unknown' },
    });
    expect(agg.star).toEqual({ notThought: 0, planned: 0, level: 'none', enough: false });
    expect(agg.madeOn).toBeNull();
    expect(agg.unreadable).toEqual([]);
    expect(Object.values(agg.totals).every((n) => n === 0)).toBe(true);
  });
});

describe('aggregate：北極星（考えずに済んだ夕食の割合）', () => {
  const week = (plannedDays: number, thoughtDays: number) => rep({ checkins: [{ weekStart: MON, plannedDays, thoughtDays }] });

  it('全体は 1 − Σ自分で考えた日 ／ Σ聞いた日。目標 80%・最低 50%', () => {
    const agg = aggregate(families(week(5, 1), week(5, 0), week(5, 2)));
    expect(agg.star).toEqual({ notThought: 12, planned: 15, level: 'goal', enough: true });
    expect(aggregate(families(week(5, 2), week(5, 2), week(5, 2))).star).toMatchObject({ notThought: 9, level: 'minimum' });
    expect(aggregate(families(week(4, 2), week(4, 2), week(4, 2))).star).toMatchObject({ notThought: 6, planned: 12, level: 'minimum' });
    expect(aggregate(families(week(4, 3), week(4, 2), week(4, 2))).star).toMatchObject({ notThought: 5, level: 'below' });
  });

  it('家族ごと：答えた家族は割合と段階、答えていない家族は none。数が少なければ全体は enough=false', () => {
    const agg = aggregate(families(week(5, 1), week(4, 0), rep({ checkins: [] })));
    expect(agg.rows.map((r) => r.star)).toEqual([
      { notThought: 4, planned: 5, level: 'goal' },
      { notThought: 4, planned: 4, level: 'goal' },
      { notThought: 0, planned: 0, level: 'none' },
    ]);
    expect(agg.rows.map(familyStarText)).toEqual(['80%（4日／5日）', '100%（4日／4日）', 'まだ答えていません']);
    expect(agg.star).toMatchObject({ notThought: 8, planned: 9, enough: false });
    expect(starVerdictText(agg.star)).toBe('まだ分からない（今の値では「目標に届いた」）');
    expect(starVerdictText(aggregate([]).star)).toBe('まだ答えがありません');
  });
});

describe('aggregate：気をつけること', () => {
  const kinds = (fs: Family[]) => aggregate(fs).rows.map((r) => r.flags.map((f) => f.kind));

  it('［翌日へ進む］で進めた記録に印を付け、一覧にも出す', () => {
    const agg = aggregate(families(rep(), rep({ clock: 'demo', talk: { messages: 1 } }), rep({ clock: 'unknown', talk: { messages: 3 } })));
    expect(agg.demo).toEqual(['家族B']);
    expect(agg.rows[1].flags).toContainEqual({ kind: 'demo', text: '［翌日へ進む］で進めた記録です。本物の日付ではありません。' });
    expect(agg.rows[0].flags).toEqual([]);
    expect(agg.rows[2].flags).toEqual([]);
  });

  it('記録なしが多い：献立の日の30%以上で、2日以上', () => {
    const fs = families(
      rep({ days: { cookedAsPlanned: 3, cookedChanged: 0, skipped: 0, unconfirmed: 2 } }), // 2／5 = 40%
      rep({ days: { cookedAsPlanned: 4, cookedChanged: 0, skipped: 0, unconfirmed: 1 } }), // 1日だけ
      rep({ days: { cookedAsPlanned: 8, cookedChanged: 0, skipped: 0, unconfirmed: 2 } }), // 2／10 = 20%
      rep({ days: { cookedAsPlanned: 7, cookedChanged: 0, skipped: 0, unconfirmed: 3 } }), // 3／10 = 30%
    );
    const agg = aggregate(fs);
    expect(agg.rows.map((r) => r.manyUnconfirmed)).toEqual([true, false, false, true]);
    expect(agg.rows[0].flags).toContainEqual({
      kind: 'unconfirmed',
      text: '記録なしの日が多いです（5日のうち 2日）。作った割合が低めに出ているかもしれません。',
    });
  });

  it('除外の違反・まだ過ぎた日がない・週末の質問にまだ答えていない・見本', () => {
    const fs = families(
      rep({ safetyViolations: 1, safetyViolationDays: ['2026-11-18'] }),
      rep({ from: null, days: { cookedAsPlanned: 0, cookedChanged: 0, skipped: 0 }, checkins: [], talk: { messages: 1 } }),
      rep({ checkins: [], talk: { messages: 3 } }),
    );
    fs[2] = { ...fs[2], sample: true };
    const agg = aggregate(fs);
    expect(agg.rows[0].flags).toEqual([{ kind: 'violation', text: '除外の違反が 1件 あります（11/18(水)）。献立を確かめてください。' }]);
    expect(agg.rows[1].flags.map((f) => f.kind)).toEqual(['no-days']);
    expect(agg.rows[2].flags.map((f) => f.kind)).toEqual(['sample', 'no-checkin']);
    expect(agg.samples).toEqual(['家族C']);
  });

  it('同じ家族の前の記録かもしれないもの（家族構成・始めた日が同じで、どの数も新しい記録以下）に印を付ける', () => {
    const thursday = rep({ madeOn: '2026-11-19', to: '2026-11-18', days: { cookedAsPlanned: 2, cookedChanged: 0, skipped: 1 }, checkins: [], talk: { messages: 1, taps: 3 }, reactions: { great: 1, ok: 0 } });
    const saturday = rep({ madeOn: '2026-11-21', checkins: [{ weekStart: MON, plannedDays: 5, thoughtDays: 1 }], talk: { messages: 2, taps: 5 } });
    const other = rep({ family: { adult: 1, child: 2, preschool: 0 }, madeOn: '2026-11-21', talk: { messages: 9 } });
    const agg = aggregate(families(thursday, other, saturday));
    expect(agg.rows[0].flags.find((f) => f.kind === 'maybe-same')?.text).toBe(
      '家族Cと同じ家族の、前の記録かもしれません（家族構成と始めた日が同じで、どの数も家族C以下です）。同じ家族なら、こちらを外してください。',
    );
    expect(kinds(families(thursday, other, saturday)).map((k) => k.includes('maybe-same'))).toEqual([true, false, false]);
    // 新しい記録のほうが、ある数で少なければ、別の家族とみなす
    const fewerTaps = { ...saturday, talk: { ...saturday.talk, taps: 2 } };
    expect(kinds(families(thursday, fewerTaps)).flat()).not.toContain('maybe-same');
    // 同じ日に作った、同じ数の記録（文を入れたかどうかだけが違う）は、先に貼ったほうに印
    const withTexts = { ...saturday, talk: { ...saturday.talk, unreadableTexts: [] } };
    expect(kinds(families(saturday, withTexts)).map((k) => k.includes('maybe-same'))).toEqual([true, false]);
    // 同じ日に作った記録で、週末の質問に答える前と後（過ぎた日の数は同じ。答えと書き込みとボタンが増える）
    const before = { ...saturday, checkins: [], talk: { ...saturday.talk, messages: 1, taps: 4 } };
    expect(kinds(families(saturday, before)).map((k) => k.includes('maybe-same'))).toEqual([false, true]);
    // 同じ日に作った記録で、過ぎた日の数が違えば、別の家族とみなす（どの数も少なくても）
    const quieter = rep({ days: { cookedAsPlanned: 2, cookedChanged: 0, skipped: 1, unconfirmed: 2 }, checkins: [], talk: { messages: 0, taps: 1 }, reactions: { great: 0, ok: 0 } });
    expect(kinds(families(quieter, saturday)).flat()).not.toContain('maybe-same');
  });
});

describe('aggregate：合計・読み取れなかった書き込み・作った日の範囲', () => {
  it('合計と、家族ごとの読み取れなかった書き込み（文を入れなかった記録は null）', () => {
    const a = rep({ talk: { messages: 4, unreadable: 1, unreadableTexts: ['ほげほげ'] }, reactions: { great: 2, ok: 0, meh: 1 } });
    const b = rep({ madeOn: '2026-11-22', talk: { messages: 3, unreadable: 2 }, days: { everyoneOut: 1, todayImpossible: 1 } });
    const c = rep({ madeOn: '2026-11-20', talk: { messages: 0, unreadable: 0 } });
    const agg = aggregate(families(a, b, c));
    expect(agg.unreadable).toEqual([
      { key: reportKey(a), label: '家族A', count: 1, messages: 4, texts: ['ほげほげ'] },
      { key: reportKey(b), label: '家族B', count: 2, messages: 3, texts: null },
    ]);
    expect(agg.totals).toMatchObject({ dinner: 16, everyoneOut: 1, planned: 15, cooked: 12, cookedAsPlanned: 9, cookedChanged: 3, skipped: 3, todayImpossible: 1 });
    expect(agg.totals).toMatchObject({ great: 4, ok: 2, meh: 1, messages: 7, unreadable: 3 });
    expect(agg.madeOn).toEqual({ first: '2026-11-20', last: '2026-11-22' });
  });
});

describe('表に出す文', () => {
  it('家族構成・期間・週末の答え・除外の違反', () => {
    const big = rep({ family: { adult: 2, teen: 1, child: 0, preschool: 1, infant: 1, withExclusions: 2 }, plan: 'paid' });
    expect(familyText(big)).toBe('大人2・中高生1・幼児1・乳児1');
    expect(familyNote(big)).toBe('除外のある人 2人・有料版');
    expect(periodText(big)).toBe('11/16(月)〜11/20(金)');
    expect(periodText(rep({ from: '2026-11-18', to: '2026-11-18' }))).toBe('11/18(水)');
    expect(periodText(rep({ from: null, days: { cookedAsPlanned: 0, cookedChanged: 0, skipped: 0 } }))).toBe('まだありません');
    expect(checkinText(rep({ checkins: [] }))).toBe('まだ');
    expect(checkinText(rep())).toBe('1日／5日');
    expect(
      checkinText(rep({ checkins: [{ weekStart: '2026-11-09', plannedDays: 5, thoughtDays: 2 }, { weekStart: MON, plannedDays: 4, thoughtDays: 0 }] })),
    ).toBe('11/9(月)〜 2日／5日、11/16(月)〜 0日／4日');
    expect(violationText(rep())).toBe('0件');
    expect(violationText(rep({ safetyViolations: 3, safetyViolationDays: ['2026-11-17', '2026-11-19'] }))).toBe('3件（11/17(火)・11/19(木)）');
  });
});

describe('summaryText：共有する文', () => {
  it('目安・北極星・家族ごと・気をつけること・読み取れなかった書き込み。外した家族も書く', () => {
    const fs = families(
      cookedOf(4, 5, { checkins: [{ weekStart: MON, plannedDays: 5, thoughtDays: 1 }] }),
      cookedOf(4, 4, { plan: 'paid', checkins: [{ weekStart: MON, plannedDays: 4, thoughtDays: 0 }], talk: { messages: 3, unreadable: 1, unreadableTexts: ['ふにゃふにゃ'] } }),
      rep({ clock: 'demo', days: { cookedAsPlanned: 1, cookedChanged: 0, skipped: 0, unconfirmed: 4 }, checkins: [], talk: { messages: 0, taps: 1 } }),
    );
    const text = summaryText(aggregate(fs), ['家族D']);
    const lines = text.split('\n');
    expect(lines[0]).toBe('きめとく 試用の集計（3家族）');
    expect(lines).toContain('記録を作った日：11/21(土)');
    expect(lines).toContain('外した記録：家族D（数に入れていません）');
    expect(lines).toContain('・提案の70%以上を作る：64%（作った 9日／家で食べる献立の日 14日）→ 届いていない');
    expect(lines).toContain('・自分で考えた日が半分以下：12%（自分で考えた 1日／聞いた日 9日。3家族のうち 2家族が答えました）→ まだ分からない');
    expect(lines).toContain('・除外の違反 0件：0件 → 届いた');
    expect(lines).toContain(`・${NOT_MEASURABLE}`);
    expect(NOT_MEASURABLE).toBe('4週継続60%以上・前払い5組以上は、1週間の試用では測れません。');
    expect(lines).toContain('※［翌日へ進む］で進めた記録（家族C）も数に入っています。');
    expect(lines).toContain('・全体：88%（考えずに済んだ 8日／聞いた日 9日）→ まだ分からない（今の値では「目標に届いた」）');
    expect(lines).toContain('・家族C：まだ答えていません');
    expect(lines).toContain('・家族C：［翌日へ進む］で進めた記録です。本物の日付ではありません。');
    expect(lines).toContain('・家族B：「ふにゃふにゃ」');
    expect(lines.some((l) => l.startsWith('・家族A：11/16(月)〜11/20(金)（カレンダーどおり・11/21(土)に作成）／大人2・小学生1・幼児1'))).toBe(true);
    expect(lines.some((l) => l.startsWith('・合計：献立の日 14日：作った 9日'))).toBe(true);
  });

  it('記録がなければ、そう書く。見本が入っていれば知らせる', () => {
    expect(summaryText(aggregate([]))).toBe('きめとく 試用の集計（0家族）\n\nまだ記録がありません。');
    const fs = families(rep());
    fs[0] = { ...fs[0], sample: true };
    expect(summaryText(aggregate(fs))).toContain('※見本の記録が入っています（家族A）。');
  });

  it('文を入れなかった記録の読み取れなかった書き込みは、数だけ書く', () => {
    const fs = families(rep({ talk: { messages: 5, unreadable: 2 } }));
    expect(summaryText(aggregate(fs))).toContain('・家族A：文は入っていません（2件）');
  });
});
