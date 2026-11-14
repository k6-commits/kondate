// 受け入れテスト：1週間の試用（週の途中から始める家族）。本物のマスタとデモの家族で、公開APIだけを使う。
// 週末の質問（北極星「自分で考えた夕食は何日？」）と、試用の記録（trialReport）が、振り返り（weeklySummary）と合うかを確かめる。
import type { AppState } from '../engine/index';
import {
  addDays,
  advanceDay,
  applyAction,
  createInitialState,
  formatTrialReport,
  handleUserText,
  parseTrialReports,
  renderCardText,
  trialReport,
  weekStartOf,
  weeklySummary,
} from '../engine/index';
import { DEMO_ONBOARDING, defaultCatalog as catalog } from '../data/index';

const WED = '2026-11-18';
const WEEK = weekStartOf(WED); // 11/16(月)
const NAMES = DEMO_ONBOARDING.members.map((m) => m.nickname);

/** 水曜に始めて、水曜は作って◎、木曜は「今日は無理」でラク日を作り、金曜は記録しない。土曜の朝に「1日」と答える。 */
function trialWeek(plan: 'free' | 'paid'): { state: AppState; saturday: AppState } {
  let s = createInitialState({ ...DEMO_ONBOARDING, plan }, catalog, WED);
  const say = (text: string) => (s = handleUserText(s, catalog, `@きめとく ${text}`).state);
  const tap = (a: Parameters<typeof applyAction>[2]) => (s = applyAction(s, catalog, a).state);
  tap({ type: 'cooked', date: WED });
  tap({ type: 'react', date: WED, memberId: plan === 'paid' ? 'member_1' : 'household', reaction: 'great' });
  s = advanceDay(s, catalog).state; // 木
  say('今日は無理');
  tap({ type: 'cooked', date: s.today });
  s = advanceDay(s, catalog).state; // 金
  s = advanceDay(s, catalog).state; // 土
  const saturday = s;
  say('1日');
  return { state: s, saturday };
}

describe.each(['free', 'paid'] as const)('1週間の試用（%s）', (plan) => {
  const { state, saturday } = trialWeek(plan);

  it('土曜の朝に、始めた水曜からの3日分を聞く（「作りましたか？」のあと）', () => {
    const today = saturday.chat.filter((m) => m.from === 'bot' && m.at.startsWith(saturday.today));
    const qi = today.findIndex((m) => m.actions?.some((a) => a.action.type === 'weekly_checkin'));
    expect(qi).toBeGreaterThan(0);
    expect(today[qi - 1].text).toMatch(/^昨日の.+は作りましたか？/);
    expect(today[qi].text.split('\n')[0]).toBe('11/18(水)〜11/20(金)の夕食で、自分で献立を考えた日は何日ありましたか？');
    expect(today[qi].actions?.map((a) => a.label)).toEqual(['0日', '1日', '2日', '3日']);
    expect(today[qi].push).toBeUndefined();
  });

  it('「1日」の答えを記録し、振り返りに添える', () => {
    expect(state.checkins).toEqual([{ weekStart: WEEK, plannedDays: 3, thoughtDays: 1, answeredOn: saturday.today }]);
    expect(state.chat.at(-1)?.text).toBe('ありがとうございます。記録しました（自分で考えた日：1日／3日）。');
    expect(renderCardText(state, catalog, { kind: 'summary', weekStart: WEEK })).toContain('自分で考えた日（週末の質問）：1日／3日');
  });

  it('試用の記録は、振り返りと合い、名前を入れず、そのまま読み直せる', () => {
    const report = trialReport(state, catalog, { includeTexts: true, clock: 'calendar' });
    const ws = weeklySummary(state, catalog, WEEK);
    expect(report.days).toEqual({
      dinner: 3, everyoneOut: 0, cooked: 2, cookedAsPlanned: 1, cookedChanged: 1, skipped: 0, unconfirmed: 1, todayImpossible: 1,
    });
    expect(report.days.dinner - report.days.everyoneOut).toBe(ws.plannedDays);
    expect(report.days.cooked).toBe(ws.decidedWithoutThinking);
    expect(report.days.unconfirmed).toBe(ws.unconfirmedDays);
    expect(ws.skippedOrImpossible).toBe(report.days.skipped + report.days.todayImpossible);
    expect(report.checkins).toEqual([{ weekStart: WEEK, plannedDays: 3, thoughtDays: 1 }]);
    expect(report.reactions.great).toBe(1);
    expect(report.safetyViolations).toBe(0);
    expect(report.talk).toMatchObject({ messages: 2, unreadable: 0, unreadableTexts: [] });
    const text = formatTrialReport(report);
    expect(text.length).toBeLessThan(4500);
    for (const name of NAMES) expect(text).not.toContain(name);
    expect(parseTrialReports(text)).toEqual({ reports: [report], errors: [] });
  });

  it('次の週に進めても、もう聞かない', () => {
    let s = state;
    while (s.today < addDays(WEEK, 9)) s = advanceDay(s, catalog).state;
    expect(s.chat.filter((m) => m.actions?.some((a) => a.action.type === 'weekly_checkin'))).toHaveLength(1);
  });
});

describe('1週間の試用：週の途中で家族を足す', () => {
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

  it('水曜に大豆アレルギーの人を足しても、足す前の月・火は除外の違反にしない。足したあとの献立にも違反はない', () => {
    let s = createInitialState(DEMO_ONBOARDING, catalog, WEEK);
    s = advanceDay(s, catalog).state; // 火
    s = applyAction(s, catalog, { type: 'cooked', date: WEEK }).state;
    s = advanceDay(s, catalog).state; // 水
    s = applyAction(s, catalog, { type: 'cooked', date: addDays(WEEK, 1) }).state;
    s = changeFamily(s, [...s.household.members, { id: 'member_5', nickname: 'ばあば', ageBand: 'adult', exclusions: [{ type: 'allergen', id: 'soy' }] }]);
    while (s.today < addDays(WEEK, 5)) s = advanceDay(s, catalog).state; // 土
    const report = trialReport(s, catalog);
    expect(report.safetyViolations).toBe(0);
    expect(report.family).toMatchObject({ adult: 3, withExclusions: 2 });
    expect(formatTrialReport(report)).toContain('除外の違反：0件');
  });
});
