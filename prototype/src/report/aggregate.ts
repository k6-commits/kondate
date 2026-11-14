// 試用の集計（純粋関数）。主催者が、家族から届いた「試用の記録」を貼り付けて、家族ごとの数と、企画書 12章の続行の目安を見る。
// 記録の読み取りはエンジンの parseTrialReports（src/engine/trial.ts）。ここでは、読み取った記録を数え、目安に届いたかを決める。
//
// ■ 続行の目安（企画書 12章）
// - 提案の70%以上を作る：Σ作った日 ／ Σ（献立の日 − みんな外で食べた日）。記録なしの日は、作らなかった日として数える。
// - 自分で考えた日が半分以下：週末の質問の答えの Σ自分で考えた日 ／ Σ聞いた日。
// - 除外の違反 0件：Σ除外の違反。1件でもあれば「届いていない」。
// - どれも、数える家族が MIN_FAMILIES 組より少ないか、日数が合わせて MIN_DAYS 日より少ないうちは「まだ分からない」
//   （除外の違反があるときを除く）。4週継続・前払いは、1週間の試用では測れない（ページに1行で書く）。
// ■ 北極星：考えずに済んだ夕食の割合 ＝ 1 − 自分で考えた日 ／ 聞いた日（目標 80%・最低 50%）。
// ■ 割合は、目安の向きに合わせて丸める（「以上」の目安は切り捨て、「以下」の目安は切り上げ）。表示が 70% なら届いている。
//   比べるのは整数のかけ算で行う（小数の誤差で境目を間違えない）。

import type { AgeBand, ISODate, TrialClock, TrialReport } from '../engine/index';
import { formatJa, parseTrialReports } from '../engine/index';

/** これより少ない家族の数・日数では「まだ分からない」にする。 */
export const MIN_FAMILIES = 3;
export const MIN_DAYS = 12;
/** 企画書 12章の目安（%）。 */
export const COOKED_TARGET = 70;
export const THOUGHT_TARGET = 50;
/** 北極星の目標と最低ライン（%）。 */
export const STAR_GOAL = 80;
export const STAR_MINIMUM = 50;
/** 記録なしが多い：献立の日（みんな外で食べた日を除く）の 30% 以上で、2日以上。 */
export const MANY_UNCONFIRMED_PERCENT = 30;
export const MANY_UNCONFIRMED_MIN = 2;

export type Verdict = 'reached' | 'missed' | 'unknown';
export const VERDICT_LABEL: Record<Verdict, string> = { reached: '届いた', missed: '届いていない', unknown: 'まだ分からない' };

// ---------------------------------------------------------------------------
// 貼り付けた文を読む
// ---------------------------------------------------------------------------

/** 読み取った1家族分の記録。 */
export interface Family {
  /** 記録の中身から作る鍵。名前と「外す」を、このブラウザに保存するときに使う（同じ記録なら同じ鍵）。 */
  key: string;
  /** A, B, …, Z, AA, …（貼り付けた順）。 */
  letter: string;
  /** 家族A, 家族B, … */
  label: string;
  report: TrialReport;
  /** ページの見本の記録か。 */
  sample?: boolean;
}

export interface PasteReading {
  families: Family[];
  /** 読めなかった記録（「2件目：…」の形。エンジンの parseTrialReports のまま）。 */
  errors: string[];
  /** 同じ記録が2回以上貼られていて、1つにまとめた数。 */
  duplicates: number;
  /** 文はあるが、記録の印（きめとく試用データ:）が1つもない。 */
  noMarker: boolean;
}

/** 0 → A、25 → Z、26 → AA（表計算の列の名前と同じ）。 */
export function familyLetter(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** 鍵の並びに左右されない JSON（同じ中身なら同じ文字列）。 */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** 53ビットの文字列ハッシュ（cyrb53）。鍵を短くするため（暗号ではない）。 */
function hash53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** 記録の鍵（同じ記録なら、貼り直しても同じ）。 */
export function reportKey(report: TrialReport): string {
  return `r${hash53(canonical(report))}`;
}

/**
 * 貼り付けた文から、家族ごとの記録を取り出す。家族A・家族B…は貼り付けた順。
 * 同じ記録（中身がすべて同じ）が2回以上あれば、最初の1つだけを数え、まとめた数を duplicates に入れる。
 * isSample を渡せば、見本の記録に印を付ける。
 */
export function readPaste(text: string, isSample?: (key: string) => boolean): PasteReading {
  const { reports, errors } = parseTrialReports(text);
  const families: Family[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const report of reports) {
    const key = reportKey(report);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    const letter = familyLetter(families.length);
    families.push({ key, letter, label: `家族${letter}`, report, ...(isSample?.(key) ? { sample: true } : {}) });
  }
  return { families, errors, duplicates, noMarker: text.trim() !== '' && reports.length === 0 && errors.length === 0 };
}

// ---------------------------------------------------------------------------
// 数える
// ---------------------------------------------------------------------------

/** 割合（%）。目安の向きに合わせて丸める：down は切り捨て（「以上」の目安）、up は切り上げ（「以下」の目安）。分母が 0 なら null。 */
export function percent(num: number, den: number, round: 'down' | 'up'): number | null {
  if (den <= 0) return null;
  const x = (num * 100) / den;
  // num * 100 / den は割り切れるとき正確（整数どうし）。割り切れないときの誤差だけを避ける。
  // || 0：切り上げで -0 にならないように（0% と出す）。
  return (round === 'down' ? Math.floor(x + 1e-9) : Math.ceil(x - 1e-9)) || 0;
}

export type StarLevel = 'goal' | 'minimum' | 'below' | 'none';
export const STAR_LEVEL_LABEL: Record<StarLevel, string> = {
  goal: '目標に届いた',
  minimum: '最低ラインは越えた',
  below: '最低ラインに届かない',
  none: 'まだ答えがありません',
};

/** 北極星：考えずに済んだ夕食の割合（週末の質問の答えから）。 */
export interface StarValue {
  /** 考えずに済んだ日（聞いた日 − 自分で考えた日）。 */
  notThought: number;
  /** 聞いた日（みんな外で食べた日を除く）。 */
  planned: number;
  level: StarLevel;
}

function starOf(thought: number, planned: number): StarValue {
  if (planned <= 0) return { notThought: 0, planned: 0, level: 'none' };
  const notThought = planned - thought;
  const level: StarLevel =
    notThought * 100 >= planned * STAR_GOAL ? 'goal' : notThought * 100 >= planned * STAR_MINIMUM ? 'minimum' : 'below';
  return { notThought, planned, level };
}

export type FlagKind = 'sample' | 'demo' | 'violation' | 'no-days' | 'unconfirmed' | 'no-checkin' | 'maybe-same';

/** 家族ごとの「気をつけること」。 */
export interface Flag {
  kind: FlagKind;
  text: string;
}

export interface FamilyRow {
  key: string;
  label: string;
  report: TrialReport;
  sample: boolean;
  /** 献立の日のうち、みんな外で食べた日を除いた日（提案の70%の分母）。 */
  planned: number;
  /** 週末の質問の答え（その家族の分の合計）。 */
  thought: number;
  checkinPlanned: number;
  star: StarValue;
  /** 記録なしの日が多い（MANY_UNCONFIRMED_*）。 */
  manyUnconfirmed: boolean;
  flags: Flag[];
}

export interface Criteria {
  /** 提案の70%以上を作る。families：献立の日（みんな外で食べた日を除く）がある家族の数。 */
  cooked: { cooked: number; planned: number; families: number; verdict: Verdict };
  /** 自分で考えた日が半分以下。answered：週末の質問に答えた家族の数。of：数に入れた家族の数。 */
  thought: { thought: number; planned: number; answered: number; of: number; verdict: Verdict };
  /** 除外の違反 0件。families：違反のあった家族のラベル。 */
  safety: { violations: number; families: string[]; verdict: Verdict };
}

export interface Totals {
  dinner: number;
  everyoneOut: number;
  planned: number;
  cooked: number;
  cookedAsPlanned: number;
  cookedChanged: number;
  skipped: number;
  unconfirmed: number;
  todayImpossible: number;
  thought: number;
  checkinPlanned: number;
  great: number;
  ok: number;
  meh: number;
  violations: number;
  messages: number;
  unreadable: number;
}

/** 読み取れなかった書き込み（家族ごと）。texts が null なら、送る人が文を入れなかった記録。 */
export interface UnreadableGroup {
  key: string;
  label: string;
  count: number;
  messages: number;
  texts: string[] | null;
}

export interface Aggregate {
  rows: FamilyRow[];
  criteria: Criteria;
  /** 北極星（全体）。enough：「まだ分からない」でないか（自分で考えた日の目安と同じ決まり）。 */
  star: StarValue & { enough: boolean };
  totals: Totals;
  /** ［翌日へ進む］で進めた記録の家族。 */
  demo: string[];
  /** 見本の記録の家族。 */
  samples: string[];
  unreadable: UnreadableGroup[];
  /** 記録を作った日の範囲（記録がなければ null）。 */
  madeOn: { first: ISODate; last: ISODate } | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const AGE_BANDS: AgeBand[] = ['adult', 'teen', 'child', 'preschool', 'infant'];

/** 家族構成・プラン・始めた日・日付の進め方が同じか（同じ家族の、作った日の違う記録かもしれない）。 */
function sameShape(a: TrialReport, b: TrialReport): boolean {
  return (
    a.from !== null &&
    a.from === b.from &&
    a.plan === b.plan &&
    a.clock === b.clock &&
    [...AGE_BANDS, 'withExclusions' as const].every((k) => a.family[k] === b.family[k])
  );
}

/**
 * a は b の前の記録かもしれないか（あとから作った記録は、数が減らない）。
 * 同じ日に作った2つの記録（送ったあとに週末の質問に答えて、もう一度送った、など）は、過ぎた日の数・反応・除外の違反が同じで、
 * トークと週末の答えだけが増える。違う日に作った記録は、どの数も減らない。
 */
function grewInto(a: TrialReport, b: TrialReport): boolean {
  if (a.madeOn > b.madeOn) return false;
  const le = (xs: number[], ys: number[]) => xs.every((x, i) => x <= ys[i]);
  const talk = (r: TrialReport) => [r.talk.messages, r.talk.unreadable, r.talk.taps ?? 0, r.checkins.length];
  const kept = (r: TrialReport) => [r.days.dinner, r.days.everyoneOut, r.days.cooked, r.days.skipped, r.reactions.great, r.reactions.ok, r.reactions.meh];
  if (a.madeOn === b.madeOn) {
    const days = (r: TrialReport) => DAY_KEYS.map((k) => r.days[k]);
    const same = (xs: number[], ys: number[]) => xs.every((x, i) => x === ys[i]);
    return same(days(a), days(b)) && same(kept(a), kept(b)) && a.safetyViolations === b.safetyViolations && le(talk(a), talk(b));
  }
  return le(kept(a), kept(b)) && le(talk(a), talk(b)) && (a.to ?? '') <= (b.to ?? '');
}

const DAY_KEYS = ['dinner', 'everyoneOut', 'cooked', 'cookedAsPlanned', 'cookedChanged', 'skipped', 'unconfirmed', 'todayImpossible'] as const;

/** 記録の数の大きさ（同じ日に作った記録の、どちらが新しいかを決める）。 */
function activity(r: TrialReport): number {
  return r.days.cooked + r.days.skipped + r.talk.messages + (r.talk.taps ?? 0) + r.reactions.great + r.reactions.ok + r.reactions.meh + r.checkins.length;
}

/** b は a のあとの記録か（作った日 → 数の大きさ → 貼り付けた順）。 */
function isNewer(a: TrialReport, ai: number, b: TrialReport, bi: number): boolean {
  if (a.madeOn !== b.madeOn) return b.madeOn > a.madeOn;
  if (activity(a) !== activity(b)) return activity(b) > activity(a);
  return bi > ai;
}

const formatDays = (days: ISODate[]) => days.map(formatJa).join('・');

/**
 * 数える（純粋関数）。families は数に入れる家族だけ（外した家族は渡さない）。
 */
export function aggregate(families: Family[]): Aggregate {
  const rows: FamilyRow[] = families.map((f) => {
    const r = f.report;
    const planned = r.days.dinner - r.days.everyoneOut;
    const thought = sum(r.checkins.map((c) => c.thoughtDays));
    const checkinPlanned = sum(r.checkins.map((c) => c.plannedDays));
    const manyUnconfirmed =
      r.days.unconfirmed >= MANY_UNCONFIRMED_MIN && r.days.unconfirmed * 100 >= planned * MANY_UNCONFIRMED_PERCENT;
    return {
      key: f.key,
      label: f.label,
      report: r,
      sample: f.sample === true,
      planned,
      thought,
      checkinPlanned,
      star: starOf(thought, checkinPlanned),
      manyUnconfirmed,
      flags: [],
    };
  });

  // 気をつけること（家族ごと。大事なものから）
  rows.forEach((row, i) => {
    const r = row.report;
    const flags = row.flags;
    if (row.sample) flags.push({ kind: 'sample', text: '見本の記録です。本物の記録を集計するときは消してください。' });
    if (r.clock === 'demo') flags.push({ kind: 'demo', text: '［翌日へ進む］で進めた記録です。本物の日付ではありません。' });
    if (r.safetyViolations > 0) {
      const days = r.safetyViolationDays?.length ? `（${formatDays(r.safetyViolationDays)}）` : '';
      flags.push({ kind: 'violation', text: `除外の違反が ${r.safetyViolations}件 あります${days}。献立を確かめてください。` });
    }
    if (r.from === null) flags.push({ kind: 'no-days', text: 'まだ過ぎた献立の日がありません。' });
    if (row.manyUnconfirmed) {
      flags.push({
        kind: 'unconfirmed',
        text: `記録なしの日が多いです（${row.planned}日のうち ${r.days.unconfirmed}日）。作った割合が低めに出ているかもしれません。`,
      });
    }
    if (r.from !== null && r.checkins.length === 0) flags.push({ kind: 'no-checkin', text: '週末の質問に、まだ答えていません。' });
    const newer = rows.find((o, j) => j !== i && sameShape(r, o.report) && grewInto(r, o.report) && isNewer(r, i, o.report, j));
    if (newer) {
      flags.push({
        kind: 'maybe-same',
        text: `${newer.label}と同じ家族の、前の記録かもしれません（家族構成と始めた日が同じで、どの数も${newer.label}以下です）。同じ家族なら、こちらを外してください。`,
      });
    }
  });

  const totals: Totals = {
    dinner: sum(rows.map((r) => r.report.days.dinner)),
    everyoneOut: sum(rows.map((r) => r.report.days.everyoneOut)),
    planned: sum(rows.map((r) => r.planned)),
    cooked: sum(rows.map((r) => r.report.days.cooked)),
    cookedAsPlanned: sum(rows.map((r) => r.report.days.cookedAsPlanned)),
    cookedChanged: sum(rows.map((r) => r.report.days.cookedChanged)),
    skipped: sum(rows.map((r) => r.report.days.skipped)),
    unconfirmed: sum(rows.map((r) => r.report.days.unconfirmed)),
    todayImpossible: sum(rows.map((r) => r.report.days.todayImpossible)),
    thought: sum(rows.map((r) => r.thought)),
    checkinPlanned: sum(rows.map((r) => r.checkinPlanned)),
    great: sum(rows.map((r) => r.report.reactions.great)),
    ok: sum(rows.map((r) => r.report.reactions.ok)),
    meh: sum(rows.map((r) => r.report.reactions.meh)),
    violations: sum(rows.map((r) => r.report.safetyViolations)),
    messages: sum(rows.map((r) => r.report.talk.messages)),
    unreadable: sum(rows.map((r) => r.report.talk.unreadable)),
  };

  const withDays = rows.filter((r) => r.planned > 0).length;
  const enoughDays = withDays >= MIN_FAMILIES && totals.planned >= MIN_DAYS;
  const answered = rows.filter((r) => r.report.checkins.length > 0).length;
  const enoughAnswers = answered >= MIN_FAMILIES && totals.checkinPlanned >= MIN_DAYS;
  const decide = (ok: boolean, enough: boolean): Verdict => (!enough ? 'unknown' : ok ? 'reached' : 'missed');

  const criteria: Criteria = {
    cooked: {
      cooked: totals.cooked,
      planned: totals.planned,
      families: withDays,
      verdict: decide(totals.cooked * 100 >= totals.planned * COOKED_TARGET, enoughDays),
    },
    thought: {
      thought: totals.thought,
      planned: totals.checkinPlanned,
      answered,
      of: rows.length,
      verdict: decide(totals.thought * 100 <= totals.checkinPlanned * THOUGHT_TARGET, enoughAnswers),
    },
    safety: {
      violations: totals.violations,
      families: rows.filter((r) => r.report.safetyViolations > 0).map((r) => r.label),
      verdict: totals.violations > 0 ? 'missed' : enoughDays ? 'reached' : 'unknown',
    },
  };

  const unreadable: UnreadableGroup[] = rows
    .filter((r) => r.report.talk.unreadable > 0 || (r.report.talk.unreadableTexts?.length ?? 0) > 0)
    .map((r) => ({
      key: r.key,
      label: r.label,
      count: r.report.talk.unreadable,
      messages: r.report.talk.messages,
      texts: r.report.talk.unreadableTexts ?? null,
    }));

  const made = rows.map((r) => r.report.madeOn).sort();
  return {
    rows,
    criteria,
    star: { ...starOf(totals.thought, totals.checkinPlanned), enough: enoughAnswers },
    totals,
    demo: rows.filter((r) => r.report.clock === 'demo').map((r) => r.label),
    samples: rows.filter((r) => r.sample).map((r) => r.label),
    unreadable,
    madeOn: made.length > 0 ? { first: made[0], last: made[made.length - 1] } : null,
  };
}

// ---------------------------------------------------------------------------
// 表に出す文（家族ごとの表と、共有する文で同じものを使う）
// ---------------------------------------------------------------------------

const AGE_SHORT: Record<AgeBand, string> = { adult: '大人', teen: '中高生', child: '小学生', preschool: '幼児', infant: '乳児' };
export const CLOCK_LABEL: Record<TrialClock, string> = { calendar: 'カレンダーどおり', demo: '［翌日へ進む］', unknown: '分からない' };

/** 「大人2・小学生1・幼児1」。 */
export function familyText(r: TrialReport): string {
  return (
    AGE_BANDS.filter((b) => r.family[b] > 0)
      .map((b) => `${AGE_SHORT[b]}${r.family[b]}`)
      .join('・') || 'なし'
  );
}

/** 「除外のある人 1人・無料版」を、折り返してよい所で分けたもの（表では、この区切りでだけ折り返す）。 */
export function familyNoteParts(r: TrialReport): string[] {
  return ['除外のある人 ', `${r.family.withExclusions}人・`, r.plan === 'paid' ? '有料版' : '無料版'];
}

/** 「除外のある人 1人・無料版」。 */
export function familyNote(r: TrialReport): string {
  return familyNoteParts(r).join('');
}

/** 「11/16(月)〜11/20(金)」（まだ数える日がなければ「まだありません」）。 */
export function periodText(r: TrialReport): string {
  if (!r.from || !r.to) return 'まだありません';
  return r.from === r.to ? formatJa(r.from) : `${formatJa(r.from)}〜${formatJa(r.to)}`;
}

/** 週末の答え：「1日／5日」（自分で考えた日／聞いた日）。何週か分あれば「11/16〜 1日／5日」を並べる。答えがなければ「まだ」。 */
export function checkinText(r: TrialReport): string {
  if (r.checkins.length === 0) return 'まだ';
  if (r.checkins.length === 1) return `${r.checkins[0].thoughtDays}日／${r.checkins[0].plannedDays}日`;
  return r.checkins.map((c) => `${formatJa(c.weekStart)}〜 ${c.thoughtDays}日／${c.plannedDays}日`).join('、');
}

export function reactionsText(x: { great: number; ok: number; meh: number }): string {
  return `◎${x.great} ○${x.ok} △${x.meh}`;
}

export function violationText(r: TrialReport): string {
  const days = r.safetyViolationDays?.length ? `（${formatDays(r.safetyViolationDays)}）` : '';
  return `${r.safetyViolations}件${days}`;
}

/** 「73%」（分母が 0 なら「—」）。 */
export function percentText(num: number, den: number, round: 'down' | 'up'): string {
  const p = percent(num, den, round);
  return p === null ? '—' : `${p}%`;
}
