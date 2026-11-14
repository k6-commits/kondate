// 集計ページのテスト用の記録：エンジン（createInitialState・handleUserText・applyAction・advanceDay・trialReport・
// formatTrialReport）で、3家族の1週間を毎回同じに作る。ページの見本（sample.ts）も、これで作った文を写したもの
// （見本は始める月曜をずらして作るので、テストの記録とは別の記録になる）。
import type { Action, AppState, ISODate, OnboardingInput, TrialClock, TrialReport } from '../../engine/index';
import { advanceDay, applyAction, createInitialState, formatTrialReport, handleUserText, trialReport } from '../../engine/index';
import { DEMO_ONBOARDING, defaultCatalog as catalog } from '../../data/index';

/** 試用を始めた月曜。 */
export const TRIAL_MONDAY = '2026-11-16';

class Week {
  s: AppState;
  constructor(input: OnboardingInput, start: ISODate) {
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
  cooked(): this {
    return this.tap({ type: 'cooked', date: this.s.today });
  }
  react(memberId: string, reaction: 'great' | 'ok' | 'meh'): this {
    return this.tap({ type: 'react', date: this.s.today, memberId, reaction });
  }
  next(): this {
    this.s = advanceDay(this.s, catalog).state;
    return this;
  }
}

export interface MadeRecord {
  state: AppState;
  report: TrialReport;
  text: string;
  /** 家族の呼び名（記録に入っていないことを確かめる）。 */
  names: string[];
}

function made(w: Week, input: OnboardingInput, clock: TrialClock, includeTexts: boolean): MadeRecord {
  const report = trialReport(w.s, catalog, { clock, includeTexts });
  return { state: w.s, report, text: formatTrialReport(report), names: input.members.map((m) => m.nickname) };
}

/** 1：デモの家族（無料版・カレンダーどおり）。月〜水は作り、木は「今日は無理」でラク日を作り、金は作らなかった。土曜に「1日」と答える。 */
export function calendarFamily(start: ISODate = TRIAL_MONDAY): MadeRecord {
  const input = DEMO_ONBOARDING;
  const w = new Week(input, start);
  w.cooked().react('household', 'great');
  w.next().cooked();
  w.next().cooked().react('household', 'ok');
  w.next().say('今日は無理').cooked();
  w.next().tap({ type: 'not_cooked', date: w.s.today });
  w.next().say('1日');
  return made(w, input, 'calendar', false);
}

/** 2：大人2・中高生1（有料版・カレンダーどおり）。木曜はみんな外で食べ、読み取れない書き込みが1つ。土曜に「0日」と答える。 */
export function paidFamily(start: ISODate = TRIAL_MONDAY): MadeRecord {
  const input: OnboardingInput = {
    ...DEMO_ONBOARDING,
    plan: 'paid',
    members: [
      { nickname: 'さとこ', ageBand: 'adult', role: 'parent', exclusions: [{ type: 'allergen', id: 'shrimp' }] },
      { nickname: 'けんじ', ageBand: 'adult', role: 'partner', exclusions: [] },
      { nickname: 'みく', ageBand: 'teen', role: 'child', exclusions: [] },
    ],
  };
  const w = new Week(input, start);
  w.cooked().react('member_1', 'great').react('member_3', 'meh');
  w.say('ふにゃふにゃ');
  w.next().cooked();
  w.say('木曜はみんな外食');
  w.next().cooked();
  w.next();
  w.next().cooked().react('member_2', 'great');
  w.next().say('0日');
  return made(w, input, 'calendar', true);
}

/** 3：大人2・小学生1（無料版・［翌日へ進む］で進めた）。月曜だけ作り、あとは記録しない。週末の質問には答えない。 */
export function demoFamily(start: ISODate = TRIAL_MONDAY): MadeRecord {
  const input: OnboardingInput = { ...DEMO_ONBOARDING, members: DEMO_ONBOARDING.members.slice(0, 3) };
  const w = new Week(input, start);
  w.cooked();
  w.next().next().next().next().next();
  return made(w, input, 'demo', true);
}
