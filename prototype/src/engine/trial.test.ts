// 試用の記録（trialReport・formatTrialReport・parseTrialReports）。
import type { Action, AppState, ChatMessage, ISODate, OnboardingInput, TrialReport } from './index';
import {
  TRIAL_MAX_REPORT_LENGTH,
  TRIAL_MAX_TEXTS,
  TRIAL_MAX_TEXT_LENGTH,
  TRIAL_REPORT_MARKER,
  UNREADABLE_REPLY,
  addDays,
  advanceDay,
  applyAction,
  checkTrialReport,
  createInitialState,
  formatTrialReport,
  handleUserText,
  parseTrialReports,
  trialReport,
  weekStartOf,
  weeklySummary,
} from './index';
import { MONDAY, catalog, demoInput } from './__fixtures__/catalog';
import { deepFreeze } from './__fixtures__/helpers';

const day = (n: number) => addDays(MONDAY, n);
const NAMES = ['ママ', 'パパ', 'たろう', 'はな'];

/** 台本どおりに1週間を進める（毎回同じ結果になる）。 */
class Script {
  s: AppState;
  constructor(input: OnboardingInput, start: ISODate = MONDAY) {
    this.s = createInitialState(input, catalog, start);
  }
  say(text: string): this {
    this.s = handleUserText(this.s, catalog, `@きめとく ${text}`).state;
    return this;
  }
  tap(action: Action): this {
    this.s = applyAction(this.s, catalog, action).state;
    return this;
  }
  advanceTo(date: ISODate): this {
    while (this.s.today < date) this.s = advanceDay(this.s, catalog).state;
    return this;
  }
}

/**
 * 月：今日は無理（ラク日を作って◎）。特売で1日を替える（無料版は金曜、有料版は火曜：献立の乱数は世帯ごと）。読み取れない書き込み。
 * 火：作らなかった。水：今日は無理で移ってきた料理を作った。木：みんな外で食べる。金：記録なし。土：週末の質問に2日。
 */
function scriptedWeek(plan: 'free' | 'paid'): Script {
  const w = new Script(demoInput({ plan }));
  w.say('今日は無理').tap({ type: 'cooked', date: MONDAY });
  if (plan === 'paid') {
    w.tap({ type: 'react', date: MONDAY, memberId: 'member_1', reaction: 'great' });
    w.tap({ type: 'react', date: MONDAY, memberId: 'member_3', reaction: 'meh' });
  } else {
    w.tap({ type: 'react', date: MONDAY, memberId: 'household', reaction: 'great' });
  }
  w.say('鶏むねが安い');
  const proposal = w.s.proposals[0];
  expect(proposal?.date).toBe(plan === 'free' ? day(4) : day(1));
  w.tap({ type: 'accept_proposal', proposalId: proposal.id });
  w.say('ほげほげ');
  w.advanceTo(day(1)).tap({ type: 'not_cooked', date: day(1) });
  w.advanceTo(day(2)).tap({ type: 'cooked', date: day(2) });
  w.say('木曜はみんな外食');
  w.advanceTo(day(5)).tap({ type: 'weekly_checkin', weekStart: MONDAY, thoughtDays: 2 });
  return w;
}

describe('trialReport：台本どおりの1週間', () => {
  const free = scriptedWeek('free').s;
  const report = trialReport(free, catalog, { includeTexts: true, clock: 'demo' });

  it('台本の日が、そのまま数になる', () => {
    expect(free.meals.find((m) => m.date === day(4))?.changedBy).toBe('sale');
    expect(report).toMatchObject({
      v: 1,
      from: MONDAY,
      to: day(4),
      madeOn: day(5),
      clock: 'demo',
      plan: 'free',
      family: { adult: 2, teen: 0, child: 1, preschool: 1, infant: 0, withExclusions: 1 },
      days: { dinner: 5, everyoneOut: 1, cooked: 2, cookedAsPlanned: 1, cookedChanged: 1, skipped: 1, unconfirmed: 1, todayImpossible: 1 },
      reactions: { great: 1, ok: 0, meh: 0 },
      checkins: [{ weekStart: MONDAY, plannedDays: 4, thoughtDays: 2 }],
      safetyViolations: 0,
      talk: { messages: 4, unreadable: 1, taps: 6, unreadableTexts: ['ほげほげ'] },
    });
    expect(report.safetyViolationDays).toBeUndefined();
    expect(checkTrialReport(report)).toBeNull();
  });

  it('今日は無理の日は「替えて」、そこから料理を移された日は「そのまま」に数える', () => {
    const mon = free.meals.find((m) => m.date === MONDAY)!;
    const wed = free.meals.find((m) => m.date === day(2))!;
    expect(mon).toMatchObject({ kind: 'raku', changedBy: 'user', status: 'cooked' });
    expect(wed).toMatchObject({ kind: 'normal', changedBy: 'user', status: 'cooked' });
    expect(free.history.some((r) => r.date === MONDAY && r.status === 'skipped' && r.dishIds[0] === wed.dishIds[0])).toBe(true);
    expect(report.days.cookedChanged).toBe(1);
    expect(report.days.cookedAsPlanned).toBe(1);
  });

  it('weeklySummary と合う（違うところは trial.ts の先頭の説明どおり）', () => {
    const w = weeklySummary(free, catalog, MONDAY);
    expect(report.days.dinner - report.days.everyoneOut).toBe(w.plannedDays);
    expect(report.days.cooked).toBe(w.decidedWithoutThinking);
    expect(report.days.unconfirmed).toBe(w.unconfirmedDays);
    // 今日は無理の日（月）は、ラク日を作っても skippedOrImpossible に入る：作らなかった日（火）と合わせて2日
    expect(w.skippedOrImpossible).toBe(report.days.skipped + report.days.todayImpossible);
    expect(w.checkin).toEqual({ plannedDays: report.checkins[0].plannedDays, thoughtDays: report.checkins[0].thoughtDays });
  });

  it('有料版：反応はメンバーごとに数える', () => {
    const paid = trialReport(scriptedWeek('paid').s, catalog);
    expect(paid.plan).toBe('paid');
    expect(paid.reactions).toEqual({ great: 1, ok: 0, meh: 1 });
    expect(paid.days).toEqual(report.days);
    expect(paid.talk).toMatchObject({ messages: 4, unreadable: 1, taps: 7 });
  });

  it('特売で替えた日を作ったら「替えて」に数える', () => {
    const w = scriptedWeek('free').tap({ type: 'cooked', date: day(4) });
    const r = trialReport(w.s, catalog);
    expect(r.days).toMatchObject({ cooked: 3, cookedChanged: 2, cookedAsPlanned: 1, unconfirmed: 0 });
    expect(r.days.cooked).toBe(weeklySummary(w.s, catalog, MONDAY).decidedWithoutThinking);
  });

  it('今日は無理のラク日の記録がなければ、ここでは「記録なし」、weeklySummary では「作れなかった日」に入る', () => {
    const w = new Script(demoInput()).say('今日は無理').advanceTo(day(5));
    const r = trialReport(w.s, catalog);
    const ws = weeklySummary(w.s, catalog, MONDAY);
    expect(r.days).toMatchObject({ dinner: 5, cooked: 0, skipped: 0, unconfirmed: 5, todayImpossible: 1 });
    expect(ws.unconfirmedDays).toBe(4);
    expect(ws.skippedOrImpossible).toBe(1);
    expect(r.days.unconfirmed).toBe((ws.unconfirmedDays ?? 0) + r.days.todayImpossible);
  });

  it('何も記録しない週は、過ぎた日がすべて「記録なし」。今日は、記録したときだけ数える', () => {
    const quiet = new Script(demoInput()).advanceTo(day(3)).s;
    expect(trialReport(quiet, catalog).days).toEqual({
      dinner: 3, everyoneOut: 0, cooked: 0, cookedAsPlanned: 0, cookedChanged: 0, skipped: 0, unconfirmed: 3, todayImpossible: 0,
    });
    const cookedToday = applyAction(quiet, catalog, { type: 'cooked', date: day(3) }).state;
    expect(trialReport(cookedToday, catalog)).toMatchObject({ to: day(3), days: { dinner: 4, cooked: 1, unconfirmed: 3 } });
  });

  it('まだ数える日がなければ、範囲は null。週末の質問は「まだ答えていません」', () => {
    const r = trialReport(createInitialState(demoInput(), catalog, MONDAY), catalog, { clock: 'calendar' });
    expect(r).toMatchObject({ from: null, to: null, madeOn: MONDAY, days: { dinner: 0 }, checkins: [] });
    const text = formatTrialReport(r);
    expect(text).toContain('期間：まだ過ぎた献立の日がありません（カレンダーどおり）');
    expect(text).toContain('週末の質問：まだ答えていません');
    expect(parseTrialReports(text)).toEqual({ reports: [r], errors: [] });
  });

  it('入力の state は変えない（凍結した state でも動く）', () => {
    const frozen = deepFreeze(structuredClone(free));
    expect(trialReport(frozen, catalog, { includeTexts: true })).toEqual(trialReport(free, catalog, { includeTexts: true }));
  });
});

describe('trialReport：除外の違反', () => {
  /** はると（卵アレルギー）のいる家族で、火曜の献立に卵の料理を入れた状態（献立の作り方では入らない形を、直接作る）。 */
  function unsafe(absent: string[] = []): AppState {
    const s = new Script(demoInput()).advanceTo(day(3)).s;
    return {
      ...s,
      meals: s.meals.map((m) => (m.date === day(1) ? { ...m, dishIds: ['tomato_egg', 'egg_soup'], absentMemberIds: absent } : m)),
    };
  }

  it('その日に食べる人の除外に当たる料理を数え、日を添える', () => {
    const r = trialReport(unsafe(), catalog);
    expect(r.safetyViolations).toBe(2);
    expect(r.safetyViolationDays).toEqual([day(1)]);
    expect(formatTrialReport(r)).toContain('除外の違反：2件（11/10(火)）');
  });

  it('除外のある人がいない日なら、違反に数えない', () => {
    const r = trialReport(unsafe(['member_3']), catalog);
    expect(r.safetyViolations).toBe(0);
    expect(r.safetyViolationDays).toBeUndefined();
  });

  it('作った献立どおりの家族（違反なし）は 0件', () => {
    expect(trialReport(scriptedWeek('free').s, catalog).safetyViolations).toBe(0);
  });

  /** 画面の「家族と設定」と同じ：家族を変えてから、今週（と来週）を keepSafe で作り直す。 */
  function changeFamily(s: AppState, members: AppState['household']['members']): AppState {
    let next: AppState = { ...s, household: { ...s.household, members } };
    for (const w of [weekStartOf(s.today), addDays(weekStartOf(s.today), 7)]) {
      if (next.meals.some((m) => weekStartOf(m.date) === w && m.date >= s.today)) {
        next = applyAction(next, catalog, { type: 'regenerate_week', weekStart: w, keepSafe: true }).state;
      }
    }
    return next;
  }

  it('週の途中で、除外のある人を家族に足しても、足す前に過ぎた日は違反に数えない（その日が終わったときの家族で数える）', () => {
    const w = new Script(demoInput()).advanceTo(day(1)).tap({ type: 'cooked', date: MONDAY }).advanceTo(day(2));
    const monMain = w.s.meals.find((m) => m.date === MONDAY)!.dishIds[0];
    const monName = catalog.dishById.get(monMain)!.name;
    // 水曜に、月曜の主菜を食べられない人を足す（月曜の料理は、足したあとの家族には除外に当たる）
    w.s = changeFamily(w.s, [...w.s.household.members, { id: 'member_9', nickname: 'ばあば', ageBand: 'adult', exclusions: [{ type: 'text', text: monName }] }]);
    w.advanceTo(day(5));
    const r = trialReport(w.s, catalog);
    expect(r.safetyViolations).toBe(0);
    expect(r.safetyViolationDays).toBeUndefined();
    expect(formatTrialReport(r)).toContain('除外の違反：0件');
  });

  it('その日が終わったときに違反だった日は、あとで家族を変えても数える', () => {
    const w = new Script(demoInput()).advanceTo(day(1));
    // 火曜の献立に、はると（卵アレルギー）の食べられない料理を入れる（献立の作り方では入らない形を、直接作る）
    w.s = { ...w.s, meals: w.s.meals.map((m) => (m.date === day(1) ? { ...m, dishIds: ['tomato_egg', 'egg_soup'] } : m)) };
    w.advanceTo(day(3));
    expect(trialReport(w.s, catalog).safetyViolations).toBe(2);
    // 木曜に、はるとを家族から外す：火曜は、そのときの家族では違反だったので、数えたまま
    w.s = changeFamily(w.s, w.s.household.members.filter((m) => m.id !== 'member_3'));
    w.advanceTo(day(5));
    const r = trialReport(w.s, catalog);
    expect(r.safetyViolations).toBe(2);
    expect(r.safetyViolationDays).toEqual([day(1)]);
  });
});

// ---------------------------------------------------------------------------

/** 読み取れなかった書き込みと返事を、chat に直接足す（parser に頼らず、文の扱いだけを確かめる）。 */
function withUnreadable(s: AppState, texts: string[]): AppState {
  const chat: ChatMessage[] = [...s.chat];
  texts.forEach((text, i) => {
    chat.push({ id: `u_${i}`, from: 'user', text, at: `${s.today}T09:00:00+09:00` });
    chat.push({ id: `b_${i}`, from: 'bot', text: `${UNREADABLE_REPLY}たとえば、こう送ってください。`, at: `${s.today}T09:00:00+09:00` });
  });
  return { ...s, chat };
}

/** 6人家族（大人2・中高生1・小学生1・幼児1・乳児1）。名前は長め。 */
function bigFamily(): OnboardingInput {
  return demoInput({
    members: [
      { nickname: 'おかあさん', ageBand: 'adult', role: 'parent', exclusions: [{ type: 'allergen', id: 'egg' }] },
      { nickname: 'おとうさん', ageBand: 'adult', role: 'partner', exclusions: [] },
      { nickname: 'さくらこ', ageBand: 'teen', role: 'child', exclusions: [{ type: 'text', text: 'ピーマン' }] },
      { nickname: 'はるとくん', ageBand: 'child', role: 'child', exclusions: [{ type: 'allergen', id: 'milk' }] },
      { nickname: 'ゆいちゃん', ageBand: 'preschool', role: 'child', exclusions: [] },
      { nickname: 'あかり', ageBand: 'infant', role: 'child', exclusions: [] },
    ],
  });
}

const BIG_NAMES = ['おかあさん', 'おとうさん', 'さくらこ', 'はるとくん', 'ゆいちゃん', 'あかり'];

describe('formatTrialReport：送る文', () => {
  it('読める行と、最後に印 + JSON の1行。名前は入らない', () => {
    const r = trialReport(scriptedWeek('free').s, catalog, { includeTexts: true, clock: 'calendar' });
    const text = formatTrialReport(r);
    const lines = text.split('\n');
    expect(lines[0]).toBe('きめとく 試用の記録（11/14(土)に作成）');
    expect(lines).toContain('期間：11/9(月)〜11/13(金)（カレンダーどおり）');
    expect(lines).toContain('家族：大人2・小学生1・幼児1（除外のある人 1人）／無料版');
    expect(lines).toContain('献立の日：5日（みんな外で食べた日 1日）');
    expect(lines).toContain('作った：2日（そのまま 1日・替えて 1日）／作らなかった：1日／記録なし：1日');
    expect(lines).toContain('「今日は無理」でラク日にした日：1日');
    expect(lines).toContain('週末の質問（11/9(月)〜の週）：自分で考えた日 2日／4日');
    expect(lines).toContain('家族の反応：◎1 ○0 △0');
    expect(lines).toContain('トークの書き込み：4件（読み取れなかった 1件）／ボタン：6回');
    expect(lines).toContain('・「ほげほげ」');
    expect(lines.at(-1)).toBe(`${TRIAL_REPORT_MARKER}${JSON.stringify(r)}`);
    for (const name of NAMES) expect(text).not.toContain(name);
  });

  it('includeTexts を付けなければ（既定）、読み取れなかった書き込みの文は入れない（数は入れる）', () => {
    const s = withUnreadable(scriptedWeek('free').s, ['ママとパパは明日ぽよぽよ', 'たろうのぴよぴよ']);
    for (const r of [trialReport(s, catalog), trialReport(s, catalog, { includeTexts: false })]) {
      expect(r.talk.unreadableTexts).toBeUndefined();
      const text = formatTrialReport(r);
      expect(text).toContain('（読み取れなかった 3件）');
      expect(text).not.toContain('unreadableTexts');
      expect(text).not.toContain('ぽよぽよ');
      for (const name of NAMES) expect(text).not.toContain(name);
    }
  });

  it('文を入れるときも、家族の呼び名は「〇〇」にする（ひらがな・カタカナの書き方を問わない）', () => {
    const s = withUnreadable(scriptedWeek('free').s, ['ママとぱぱは明日ぽよぽよ', 'タロウのぴよぴよ']);
    const r = trialReport(s, catalog, { includeTexts: true });
    expect(r.talk.unreadableTexts).toEqual(['〇〇のぴよぴよ', '〇〇と〇〇は明日ぽよぽよ', 'ほげほげ']);
    const text = formatTrialReport(r);
    for (const name of [...NAMES, 'ぱぱ', 'タロウ']) expect(text).not.toContain(name);
  });

  it('6人家族で、長い読み取れない書き込みが20件以上あっても4500字まで。読み直すと同じ記録', () => {
    const nasty = (i: number) =>
      `${BIG_NAMES[i % 6]}が"引用"\\と\t制御\u0000文字\u200bと😀絵文字🍙と${TRIAL_REPORT_MARKER}{"v":9}を含む、とても長い書き込み${i}番目。`.repeat(3);
    const texts = Array.from({ length: 25 }, (_, i) => nasty(i));
    let s = new Script(bigFamily()).advanceTo(day(5)).s;
    s = withUnreadable(s, texts);
    s = applyAction(s, catalog, { type: 'weekly_checkin', weekStart: MONDAY, thoughtDays: 1 }).state;
    const r = trialReport(s, catalog, { includeTexts: true, clock: 'calendar' });
    expect(r.family).toEqual({ adult: 2, teen: 1, child: 1, preschool: 1, infant: 1, withExclusions: 3 });
    expect(r.talk.unreadable).toBe(25);
    expect(r.talk.unreadableTexts).toHaveLength(TRIAL_MAX_TEXTS);
    for (const t of r.talk.unreadableTexts!) {
      expect([...t].length).toBeLessThanOrEqual(TRIAL_MAX_TEXT_LENGTH);
      expect(t).not.toMatch(/[\u0000-\u001f\u200b]/u);
      expect(t).not.toContain(TRIAL_REPORT_MARKER);
    }
    const text = formatTrialReport(r);
    expect(text.length).toBeLessThanOrEqual(TRIAL_MAX_REPORT_LENGTH);
    for (const name of BIG_NAMES) expect(text).not.toContain(name);
    const parsed = parseTrialReports(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.reports).toHaveLength(1);
    // 長すぎて外した文があっても、読める行と JSON は同じ文を持つ
    const kept = parsed.reports[0].talk.unreadableTexts ?? [];
    expect(kept.length).toBeGreaterThan(0);
    expect(text.split('\n').filter((l) => l.startsWith('・「'))).toEqual(kept.map((t) => `・「${t}」`));
    expect({ ...parsed.reports[0], talk: { ...parsed.reports[0].talk, unreadableTexts: undefined } }).toEqual({
      ...r,
      talk: { ...r.talk, unreadableTexts: undefined },
    });
  });

  it('文が長くて4500字を超えるときは、古い書き込みの文から外す（読める行と JSON は同じ文）', () => {
    // 絵文字（2字）と " （JSON では \" の2字）だけの書き込みは、20件で4500字を超える
    const heavy = Array.from({ length: 22 }, (_, i) => `${'😀"'.repeat(28)}${String(i).padStart(2, '0')}`);
    const s = withUnreadable(new Script(bigFamily()).advanceTo(day(5)).s, heavy);
    const r = trialReport(s, catalog, { includeTexts: true });
    expect(r.talk.unreadableTexts).toHaveLength(TRIAL_MAX_TEXTS);
    const full = `${TRIAL_REPORT_MARKER}${JSON.stringify(r)}`;
    expect(full.length).toBeGreaterThan(TRIAL_MAX_REPORT_LENGTH / 2);
    const text = formatTrialReport(r);
    expect(text.length).toBeLessThanOrEqual(TRIAL_MAX_REPORT_LENGTH);
    const [parsed] = parseTrialReports(text).reports;
    const kept = parsed.talk.unreadableTexts ?? [];
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(TRIAL_MAX_TEXTS);
    // 新しいものから残す（最後に書いた 21 番が先頭）
    expect(kept).toEqual(r.talk.unreadableTexts!.slice(0, kept.length));
    expect(kept[0].endsWith('21')).toBe(true);
    expect(text.split('\n').filter((l) => l.startsWith('・「'))).toEqual(kept.map((t) => `・「${t}」`));
    expect(parsed.talk.unreadable).toBe(22);
  });

  it('同じ読み取れない書き込みは1つにまとめ、新しい順に並べる（数はそのまま）', () => {
    const s = withUnreadable(scriptedWeek('free').s, ['ふがふが', 'ぴよぴよ', 'ふがふが']);
    const r = trialReport(s, catalog, { includeTexts: true });
    expect(r.talk.unreadable).toBe(4);
    expect(r.talk.unreadableTexts).toEqual(['ふがふが', 'ぴよぴよ', 'ほげほげ']);
  });

  it('週末の質問の答えは、新しい8週分まで入れる', () => {
    const s = scriptedWeek('free').s;
    const many = {
      ...s,
      checkins: Array.from({ length: 12 }, (_, i) => ({ weekStart: addDays(MONDAY, -7 * (11 - i)), plannedDays: 5, thoughtDays: i % 6, answeredOn: s.today })),
    };
    const r = trialReport(many, catalog);
    expect(r.checkins).toHaveLength(8);
    expect(r.checkins.at(-1)?.weekStart).toBe(MONDAY);
    expect(r.checkins.every((c) => weekStartOf(c.weekStart) === c.weekStart)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('parseTrialReports：貼り付けた文から読む', () => {
  const a = trialReport(scriptedWeek('free').s, catalog, { includeTexts: true, clock: 'calendar' });
  const b = trialReport(scriptedWeek('paid').s, catalog, { clock: 'demo' });
  const c = trialReport(new Script(bigFamily()).advanceTo(day(3)).s, catalog);

  it('何家族分を続けて貼っても、すべて読む（あいだのあいさつは無視する）', () => {
    const pasted = ['田中です。1週間ありがとうございました。', formatTrialReport(a), '', '鈴木です', formatTrialReport(b), formatTrialReport(c), 'よろしくお願いします'].join('\n');
    expect(parseTrialReports(pasted)).toEqual({ reports: [a, b, c], errors: [] });
  });

  it('JSON の行が途中で改行されていても（文字列の中でも）、つないで読む', () => {
    const text = formatTrialReport(a);
    const line = text.split('\n').at(-1)!;
    const json = line.slice(TRIAL_REPORT_MARKER.length);
    const wrapped = json.match(/.{1,37}/gsu)!.join('\n');
    expect(wrapped.split('\n').length).toBeGreaterThan(5);
    const pasted = `${text.split('\n').slice(0, -1).join('\n')}\n${TRIAL_REPORT_MARKER}\n${wrapped}\n\n${formatTrialReport(b)}`;
    expect(parseTrialReports(pasted)).toEqual({ reports: [a, b], errors: [] });
  });

  it('改行が CR だけ・行区切り文字（U+2028）でも、途中に幅のない文字（U+200B・BOM）が入っても読む', () => {
    const text = formatTrialReport(a);
    const json = text.split('\n').at(-1)!.slice(TRIAL_REPORT_MARKER.length);
    const head = text.split('\n').slice(0, -1).join('\n');
    for (const nl of ['\r', '\u2028']) {
      const wrapped = json.match(/.{1,37}/gsu)!.join(nl);
      expect(parseTrialReports(`${head}${nl}${TRIAL_REPORT_MARKER}${wrapped}`)).toEqual({ reports: [a], errors: [] });
    }
    const zw = `${TRIAL_REPORT_MARKER}${json.replace('"days"', '\u200b"days"').replace('"talk"', '\ufeff"talk"')}`;
    expect(parseTrialReports(zw)).toEqual({ reports: [a], errors: [] });
  });

  it('LINE のトーク履歴の書き出し（" が "" になる）からも読む', () => {
    const line = formatTrialReport(b).split('\n').at(-1)!;
    expect(parseTrialReports(`"${line.replace(/"/g, '""')}"`)).toEqual({ reports: [b], errors: [] });
  });

  it('印がなければ何も読まない。読めない・途中で切れたものは、何件目かとわけを返す', () => {
    expect(parseTrialReports('こんにちは。記録はあとで送ります。')).toEqual({ reports: [], errors: [] });
    const cut = formatTrialReport(a).slice(0, -40);
    const garbage = `${TRIAL_REPORT_MARKER}こんにちは{{{`;
    expect(parseTrialReports(`${cut}\n${garbage}\n${formatTrialReport(b)}`)).toEqual({
      reports: [b],
      errors: ['1件目：記録の数字の行を読めませんでした（途中で切れているかもしれません）', '2件目：記録の数字の行を読めませんでした（途中で切れているかもしれません）'],
    });
  });

  it('版の違うもの・形の違うもの・数の合わないものは読まない', () => {
    const wrongVersion = { ...b, v: 2 };
    const badShape = { ...b, days: { ...b.days, cooked: -1 } };
    const mismatch = { ...b, days: { ...b.days, cookedAsPlanned: b.days.cookedAsPlanned + 1 } };
    const tooMany = { ...b, checkins: [{ weekStart: MONDAY, plannedDays: 3, thoughtDays: 4 }] };
    const pasted = [wrongVersion, badShape, mismatch, tooMany, b].map((r) => `${TRIAL_REPORT_MARKER}${JSON.stringify(r)}`).join('\n');
    expect(parseTrialReports(pasted)).toEqual({
      reports: [b],
      errors: [
        '1件目：記録の版が 1 ではありません（2）',
        '2件目：日数が正しくありません',
        '3件目：日数の合計が合いません',
        '4件目：週末の質問の答えが正しくありません',
      ],
    });
  });

  it('checkTrialReport：作った記録はどれも通る', () => {
    for (const r of [a, b, c] as TrialReport[]) expect(checkTrialReport(JSON.parse(JSON.stringify(r)))).toBeNull();
    expect(checkTrialReport(null)).toBe('記録の形が違います');
    expect(checkTrialReport({ ...a, from: '2026-11-20', to: '2026-11-10' })).toBe('期間が正しくありません');
    expect(checkTrialReport({ ...a, madeOn: '2026-02-30' })).toBe('日付が正しくありません');
  });
});
