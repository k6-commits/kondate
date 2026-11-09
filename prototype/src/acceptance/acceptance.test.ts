// 受け入れテスト（DESIGN.md「6. 受け入れ条件」）。
// エンジンのテストは小さなフィクスチャで書かれているので、ここでは本物のマスタ（defaultCatalog）と
// デモの家族（DEMO_ONBOARDING：大人2、小学生1（卵アレルギー）、幼児1。買い物は月・木）で確かめる。
// UI・サーバーと同じく、公開API（src/engine/index.ts と src/data/index.ts）だけを使う。
import type { AppState, ChatMessage, Exclusion, ISODate, OnboardingInput, ParsedCommand } from '../engine/index';
import {
  addDays,
  advanceDay,
  applyAction,
  checkDishSafety,
  createInitialState,
  findDish,
  handleUserText,
  householdNotices,
  parseMessage,
  renderCardText,
  weekStartOf,
  weekdayOf,
  weeklySummary,
} from '../engine/index';
import { DEMO_ONBOARDING, defaultCatalog as catalog } from '../data/index';
import {
  dailyViolations,
  dishesOf,
  freshWeekViolations,
  headOf,
  ingredientObjs,
  mealOn,
  proteinViolations,
  safetyViolations,
  seasonViolations,
  shoppingViolations,
  weekMeals,
} from './invariants';
import { eggDishes as eggDishesOf, jsonProblems, replyProblems, simulate as simulateWith } from './simulation';

const MONDAY = '2026-11-09'; // 月曜

/** デモの家族の1人（はると＝小学生、卵アレルギー）の除外を差し替えた入力。 */
function demoWith(overrides: Partial<OnboardingInput> & { harutoExclusions?: Exclusion[] } = {}): OnboardingInput {
  const { harutoExclusions, ...rest } = overrides;
  const members = DEMO_ONBOARDING.members.map((m) =>
    m.nickname === 'はると' && harutoExclusions ? { ...m, exclusions: harutoExclusions } : m,
  );
  return structuredClone({ ...DEMO_ONBOARDING, members, ...rest });
}

const memberId = (s: AppState, nickname: string) => s.household.members.find((m) => m.nickname === nickname)!.id;

/** 卵（派生原材料を含む）を使う料理（作らなかった日を除く）。 */
const eggDishes = (s: AppState) => eggDishesOf(s, catalog);

/** デモの家族で、11/9（月）から28日の模擬。 */
const simulate = (check: boolean) => simulateWith({ input: DEMO_ONBOARDING, catalog, start: MONDAY, check });

/** 今週（残りの献立日がなければ来週）の、献立を作るべき日（月〜金）。 */
function expectedFirstDates(today: ISODate): ISODate[] {
  const thisWeek = [0, 1, 2, 3, 4].map((i) => addDays(weekStartOf(today), i)).filter((d) => d >= today);
  if (thisWeek.length > 0) return thisWeek;
  return [0, 1, 2, 3, 4].map((i) => addDays(weekStartOf(today), 7 + i));
}

// ---------------------------------------------------------------------------
// 1. 開始日を変えても成り立つ条件
// ---------------------------------------------------------------------------

const MONTH_MONDAYS = ['2026-01-05', '2026-04-06', '2026-07-06', '2026-09-07', '2026-11-09'];
const START_DATES = MONTH_MONDAYS.flatMap((mon) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mon, i)));

describe('デモの家族：開始日（月〜日、旬の違う月）を変えても受け入れ条件が成り立つ', () => {
  it.each(START_DATES)('%s に始める', (start) => {
    const s = createInitialState(DEMO_ONBOARDING, catalog, start);

    // 平日の献立ができる（今週の残り。なければ来週の月〜金）。
    const dates = expectedFirstDates(start);
    expect(s.meals.map((m) => m.date)).toEqual(expect.arrayContaining(dates));
    for (const d of dates) expect(mealOn(s, d)!.dishIds.length, d).toBeGreaterThan(0);
    expect(s.meals.every((m) => [1, 2, 3, 4, 5].includes(weekdayOf(m.date)))).toBe(true);
    const week = weekMeals(s, weekStartOf(dates[0]));
    expect(s.chat.find((m) => m.card?.kind === 'week')?.card).toEqual({ kind: 'week', weekStart: weekStartOf(dates[0]) });

    // 卵を含む料理が1つも入らない。要確認の食材を使う料理も入らない。
    expect(eggDishes(s)).toEqual([]);
    expect(safetyViolations(s, catalog)).toEqual([]);
    // ラク日が1日（3日以上あるとき）、新しい料理が1品以内。全員いる日の量は4人分（大人換算3.2）。
    expect(freshWeekViolations(week, 1)).toEqual([]);
    expect(s.meals.every((m) => m.servings === 3.2)).toBe(true);
    // 同じ主菜が7日以内に2回出ない。前日と同じたんぱく源が続かない。旬の料理は旬の月だけ。
    expect(dailyViolations(s, catalog)).toEqual([]);
    expect(proteinViolations(s, catalog)).toEqual([]);
    expect(seasonViolations(s, catalog)).toEqual([]);
    // 理由は1〜2個、注意（householdNotices）は最初に必ず見せる。
    for (const m of s.meals) {
      expect(m.reasons.length, m.date).toBeGreaterThanOrEqual(1);
      expect(m.reasons.length, m.date).toBeLessThanOrEqual(2);
    }
    expect(s.chat.some((m) => m.card?.kind === 'notice')).toBe(true);
    expect(replyProblems(s.chat)).toEqual([]);
  });

  it.each(MONTH_MONDAYS)('%s から2週間進めても、毎日の条件が成り立つ', (start) => {
    let s = createInitialState(DEMO_ONBOARDING, catalog, start);
    const problems: string[] = [];
    for (let i = 0; i < 14; i++) {
      const before = new Set(s.meals.map((m) => weekStartOf(m.date)));
      const r = advanceDay(s, catalog);
      s = r.state;
      problems.push(...dailyViolations(s, catalog).map((p) => `${s.today}: ${p}`));
      problems.push(...proteinViolations(s, catalog).map((p) => `${s.today}: ${p}`));
      problems.push(...eggDishes(s).map((p) => `${s.today}: 卵 ${p}`));
      for (const ws of new Set(s.meals.map((m) => weekStartOf(m.date)))) {
        if (!before.has(ws)) problems.push(...freshWeekViolations(weekMeals(s, ws), 1));
      }
      problems.push(...replyProblems(r.replies));
    }
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. 4週間の通しの模擬
// ---------------------------------------------------------------------------

describe('4週間の通しの模擬（デモの家族、11/9 から28日）', () => {
  let sim: ReturnType<typeof simulate>;
  beforeAll(() => {
    sim = simulate(true);
  });

  it('毎日、安全・7日以内の重複なし・旬・買い物リストの条件が成り立ち、state が JSON で往復できる', () => {
    expect(sim.problems).toEqual([]);
    expect(sim.state.today).toBe(addDays(MONDAY, 28));
    expect(jsonProblems(sim.state)).toEqual([]);
    expect(JSON.parse(JSON.stringify(sim.state))).toEqual(sim.state);
  });

  it('記録が残り、操作が反映されている', () => {
    const s = sim.state;
    expect(s.history.filter((r) => r.status === 'cooked').length).toBeGreaterThanOrEqual(12);
    expect(s.history.some((r) => r.status === 'skipped')).toBe(true);
    expect(s.history.some((r) => r.reactions.some((x) => x.reaction === 'meh'))).toBe(true);
    // 4週目の木曜（12/3）は全員外食 → 人数0で、買い物リストに載らない
    const thu = mealOn(s, '2026-12-03');
    expect(thu?.servings).toBe(0);
    expect(s.shopping.some((l) => l.items.some((i) => i.forDates.includes('2026-12-03')))).toBe(false);
    // 12/7（月）からの週も、最初の買い物日（月）の前日（日）にできている
    expect(weekMeals(s, '2026-12-07')).toHaveLength(5);
    // 操作が空振りしていない（特売の差し替え・今日は無理・欠席・在庫切れ・別の案・作らなかった）
    const log = sim.log.join('\n');
    expect(log).toMatch(/替える → .+に替えました/);
    expect(sim.log.filter((l) => l.includes('今日は無理 → 了解です。今日はラクしましょう。')).length).toBeGreaterThanOrEqual(2);
    expect(log).toContain('パパの分を減らしました');
    expect(log).toContain('を「なし」にしました');
    expect(log).toMatch(/別の案を選ぶ → .+にしました/);
    expect(log).toContain('作らなかった → 記録しました');
    expect(log).toContain('みんな外で食べるんですね');
  });

  it('同じ操作なら同じ結果（決定的）', () => {
    const again = simulate(false);
    expect(again.state).toEqual(sim.state);
    expect(again.log).toEqual(sim.log);
  });

  it('28日の模擬が3秒未満', () => {
    const t0 = performance.now();
    simulate(false);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

// ---------------------------------------------------------------------------
// 3. 書き込みでの組み直し
// ---------------------------------------------------------------------------

describe('「@きめとく 今日は無理」', () => {
  const s0 = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);

  it('その日がラク日になり、元の料理はその週のラク日に移る', () => {
    const original = mealOn(s0, MONDAY)!;
    expect(original.kind).toBe('normal');
    const r = handleUserText(s0, catalog, '@きめとく 今日は無理');
    const today = mealOn(r.state, MONDAY)!;
    expect(today.kind).toBe('raku');
    expect(headOf(r.state, catalog, today)?.role).toBe('raku');
    const moved = r.state.meals.find((m) => m.date > MONDAY && m.dishIds[0] === original.dishIds[0]);
    expect(moved).toBeDefined();
    expect(moved!.kind).toBe('normal');
    expect(mealOn(s0, moved!.date)!.kind).toBe('raku');
    expect(r.replies[0].text).toContain(`${findDish(r.state, catalog, original.dishIds[0])!.name}は`);
    expect(dailyViolations(r.state, catalog)).toEqual([]);
    expect(eggDishes(r.state)).toEqual([]);
    expect(replyProblems(r.replies)).toEqual([]);
  });

  it.each([0, 1, 2, 3, 4])('どの曜日でも、組み直したあとの条件が成り立つ（+%i日）', (k) => {
    let s = s0;
    for (let i = 0; i < k; i++) s = advanceDay(s, catalog).state;
    const before = mealOn(s, s.today)!;
    const r = handleUserText(s, catalog, '@きめとく 今日は無理');
    const after = mealOn(r.state, s.today)!;
    expect(after.kind).toBe('raku');
    if (before.kind === 'normal') {
      const moved = r.state.meals.some((m) => m.date > s.today && m.dishIds[0] === before.dishIds[0]);
      expect(moved || r.replies[0].text.includes('来週の候補')).toBe(true);
    } else {
      expect(r.replies[0].text).toContain('もともとラク日');
    }
    expect(dailyViolations(r.state, catalog)).toEqual([]);
    expect(eggDishes(r.state)).toEqual([]);
    expect(replyProblems(r.replies)).toEqual([]);
  });
});

describe('「@きめとく 鶏むねが安い」', () => {
  it.each(MONTH_MONDAYS)('%s：差し替えの提案とボタンが出て、承諾すると鶏むね肉を使う料理になる', (start) => {
    const s0 = createInitialState(DEMO_ONBOARDING, catalog, start);
    const r = handleUserText(s0, catalog, '@きめとく 鶏むねが安い');
    expect(r.state.proposals).toHaveLength(1);
    const p = r.state.proposals[0];
    expect(p.kind).toBe('sale_swap');
    expect(p.date >= start).toBe(true);
    const reply = r.replies.at(-1)!;
    expect(reply.actions?.map((a) => a.label)).toEqual(['替える', 'そのまま']);
    expect(reply.actions?.[0].action).toEqual({ type: 'accept_proposal', proposalId: p.id });
    expect(reply.text).toContain('鶏むね肉が安いので');
    expect(mealOn(r.state, p.date)!.dishIds).toEqual(mealOn(s0, p.date)!.dishIds); // まだ変えない

    const a = applyAction(r.state, catalog, { type: 'accept_proposal', proposalId: p.id });
    const meal = mealOn(a.state, p.date)!;
    expect(meal.dishIds).toEqual(p.toDishIds);
    expect(meal.changedBy).toBe('sale');
    expect(ingredientObjs(a.state, catalog, headOf(a.state, catalog, meal)!).map((i) => i.id)).toContain('chicken_breast');
    expect(a.state.shopping.some((l) => l.items.some((i) => i.ingredientId === 'chicken_breast' && i.forDates.includes(p.date)))).toBe(true);
    // 安全の条件は保たれる
    expect(dailyViolations(a.state, catalog)).toEqual([]);
    expect(eggDishes(a.state)).toEqual([]);
    expect(replyProblems([...r.replies, ...a.replies])).toEqual([]);
  });

  it('鶏肉の日があれば、その日を替える', () => {
    let s = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);
    const target = s.meals.find((m) => m.date > MONDAY && m.kind === 'normal')!;
    s = applyAction(s, catalog, { type: 'choose_alternative', date: target.date, dishIds: ['chicken_teriyaki'] }).state;
    const r = handleUserText(s, catalog, '@きめとく 鶏むねが安い');
    expect(r.state.proposals[0]?.date).toBe(target.date);
    expect(r.replies.at(-1)!.text).toContain('鶏の照り焼き');
  });
});

describe('「@きめとく 水曜は夫が飲み会」', () => {
  it('水曜の人数が大人1人分減り、買い物リストの量も減る', () => {
    const s0 = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);
    const wed = '2026-11-11';
    const r = handleUserText(s0, catalog, '@きめとく 水曜は夫が飲み会');
    const meal = mealOn(r.state, wed)!;
    expect(mealOn(s0, wed)!.servings).toBe(3.2);
    expect(meal.servings).toBe(2.2);
    expect(meal.absentMemberIds).toEqual([memberId(r.state, 'パパ')]);
    const total = (s: AppState) =>
      s.shopping.flatMap((l) => l.items).filter((i) => i.forDates.includes(wed)).reduce((a, i) => a + i.amount, 0);
    expect(total(r.state)).toBeLessThan(total(s0));
    expect(r.replies[0].text).toContain('パパ');
    expect(shoppingViolations(r.state, catalog)).toEqual([]);
    expect(replyProblems(r.replies)).toEqual([]);
  });

  it('LLM の解釈（member の id）でも同じ', () => {
    const s0 = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);
    const r = handleUserText(s0, catalog, '（LLM）', [{ type: 'absence', date: '2026-11-11', memberRef: 'member_2' }]);
    expect(mealOn(r.state, '2026-11-11')!.servings).toBe(2.2);
  });
});

describe('1つの書き込みで提案が2つ以上できるとき（同じ日に2つ目の提案を出さない）', () => {
  const shown = (replies: ChatMessage[]) =>
    replies.flatMap((m) => (m.actions ?? []).flatMap((a) => (a.action.type === 'accept_proposal' ? [a.action.proposalId] : [])));
  const MESSAGES: [string, ParsedCommand[]?][] = [
    ['鶏むねが安い。豚こまも安い'],
    ['鶏むねと豚こまが安い'],
    ['鶏むねが安い。鶏むねが安い'],
    ['鶏むねが安い。大根をもらった'],
    ['鶏むねが安い。豚こまも安い。さばも安い'],
    ['鶏ももが安い。鶏むねも安い'],
    ['鶏むねが安い。鶏ももを買った'],
    ['鶏むねが安い。金曜はカレーがいい'],
    ['鶏むねが安い。金曜はみんな外食'],
    ['さばが安い。今日は無理'],
    ['（LLM）', [{ type: 'sale', ingredientId: 'chicken_breast' }, { type: 'sale', ingredientId: 'chicken_breast' }]],
  ];
  // 今日が月〜金（金曜は献立の日が残り少ない）。前の書き込みの提案が残っているときも。
  const STARTS = [0, 1, 2, 3, 4].map((i) => addDays(MONDAY, i));

  it.each(STARTS)('%s：返事に出した提案は、すべて使え、日が重ならない', (start) => {
    const fresh = createInitialState(DEMO_ONBOARDING, catalog, start);
    const pending = handleUserText(fresh, catalog, '豚バラが安い').state;
    for (const s0 of [fresh, pending]) {
      for (const [text, parsed] of MESSAGES) {
        const r = handleUserText(s0, catalog, text, parsed);
        const ids = shown(r.replies);
        const dates = ids.map((id) => r.state.proposals.find((p) => p.id === id)?.date ?? 'gone');
        expect(dates, text).not.toContain('gone');
        expect(new Set(dates).size, text).toBe(dates.length);
        for (const id of ids) {
          const a = applyAction(r.state, catalog, { type: 'accept_proposal', proposalId: id });
          expect(a.replies[0].text, `${start} ${text}`).toContain('に替えました');
        }
        expect(replyProblems(r.replies), text).toEqual([]);
      }
    }
  });

  it('11/10（火）「鶏むねが安い。豚こまも安い」：豚こまの替えられる日（金曜）は鶏むねの案と重なるので、2つ目は出さずにそう伝える', () => {
    const r = handleUserText(createInitialState(DEMO_ONBOARDING, catalog, '2026-11-10'), catalog, '鶏むねが安い。豚こまも安い');
    expect(r.replies).toHaveLength(2);
    expect(r.replies[0].text).toContain('11/13(金)のねぎ塩豚を、鶏むねとブロッコリーの塩炒めに替えますか？');
    expect(r.replies[1].text).toBe(
      '豚こま切れ肉、いいですね。替えられる日（11/13(金)）には、上で別の案を出しています。\n豚こま切れ肉の案にしたいときは、もう一度「豚こま切れ肉が安い」と送ってください。',
    );
    expect(r.replies[1].actions).toBeUndefined();
    expect(r.state.proposals).toHaveLength(1);
  });
});

describe('「@きめとく 金曜はみんな外食」（夕食なしの日）', () => {
  const FRI = '2026-11-13';
  const NO_DINNER = '夕食なし（みんな外で食べる）';
  const start = createInitialState({ ...DEMO_ONBOARDING, plan: 'paid' }, catalog, '2026-11-10');
  const out = handleUserText(start, catalog, '@きめとく 金曜はみんな外食');
  const forFriday = (s: AppState) =>
    s.shopping.filter((l) => l.date >= s.today).flatMap((l) => l.items.filter((i) => i.forDates.includes(FRI)).map((i) => i.label));

  it('返事とカードは「夕食なし」（0人分・作り方は出さない）。戻し方を伝え、買い物リストから外す', () => {
    expect(out.replies).toHaveLength(1);
    const text = `${out.replies[0].text}\n${renderCardText(out.state, catalog, out.replies[0].card!)}`;
    expect(text).toContain('予定が変わったら「金曜はみんないる」と送ってください。');
    expect(text).toContain(NO_DINNER);
    expect(text).not.toMatch(/0人分|はいません|作り方|理由：/);
    expect(renderCardText(out.state, catalog, { kind: 'week', weekStart: MONDAY })).toContain(`金 ${NO_DINNER}`);
    expect(forFriday(start).length).toBeGreaterThan(0);
    expect(forFriday(out.state)).toEqual([]);
    expect(dailyViolations(out.state, catalog)).toEqual([]);
    expect(replyProblems(out.replies)).toEqual([]);
  });

  it('金曜の配信・翌日の「作りましたか？」はなく、振り返りの献立日にも数えない', () => {
    let s = out.state;
    const log: ChatMessage[] = [];
    for (let i = 0; i < 4; i++) {
      const step = advanceDay(s, catalog); // 11/11〜11/14
      s = step.state;
      log.push(...step.replies);
    }
    const about = (m: ChatMessage) => m.card?.kind === 'meal' && m.card.date === FRI;
    expect(log.filter(about)).toEqual([]);
    expect(log.some((m) => m.text.startsWith('昨日の') && m.at.startsWith('2026-11-14'))).toBe(false);
    expect(mealOn(s, FRI)!.status).toBe('planned');
    expect(weeklySummary(s, catalog, MONDAY).plannedDays).toBe(3); // 火〜木（月曜は始めた日の前）
  });

  it('「金曜はやっぱり家で食べる」で、量と買い物リストが戻る', () => {
    const r = handleUserText(out.state, catalog, '@きめとく 金曜はやっぱり家で食べる');
    expect(mealOn(r.state, FRI)!.servings).toBe(3.2);
    expect(mealOn(r.state, FRI)!.dishIds).toEqual(mealOn(start, FRI)!.dishIds);
    expect(forFriday(r.state)).toEqual(forFriday(start));
    expect(r.replies[0].text).toContain('みんな家で食べるんですね');
    expect(renderCardText(r.state, catalog, { kind: 'meal', date: FRI })).toContain('4人分（大人換算3.2）');
  });

  it('週を作り直しても、金曜は作り直さない（食べる人のいない日に、卵の料理などを入れない）', () => {
    let s = out.state;
    for (let i = 0; i < 4; i++) {
      s = applyAction({ ...s, seq: s.seq + 1 }, catalog, { type: 'regenerate_week', weekStart: MONDAY }).state;
      expect(mealOn(s, FRI)).toEqual(mealOn(out.state, FRI));
      expect(dailyViolations(s, catalog)).toEqual([]);
    }
    const back = handleUserText(s, catalog, '@きめとく 金曜はみんないる').state;
    expect(eggDishesOf(back, catalog).filter((d) => d.startsWith(FRI))).toEqual([]);
    expect(mealOn(back, FRI)!.dishIds).toEqual(mealOn(start, FRI)!.dishIds);
  });

  it('金曜の朝に「今日はみんな外食」：木曜のリストに残る金曜の分は、まだ買う物に数えない', () => {
    let s = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);
    for (let i = 0; i < 4; i++) s = advanceDay(s, catalog).state; // 11/13(金)
    const shop = (st: AppState) => handleUserText(st, catalog, '買い物リスト').replies.map((m) => m.text).join('\n');
    expect(shop(s)).toContain('11/12(木)のリストで、まだチェックしていない物があります');
    const away = handleUserText(s, catalog, '@きめとく 今日はみんな外食').state;
    expect(shop(away)).not.toContain('まだチェックしていない物');
  });
});

describe('話し言葉の解釈（本物のマスタ）', () => {
  const s = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);
  const ctx = { today: MONDAY, members: s.household.members, catalog };
  const cases: [string, ParsedCommand[]][] = [
    ['今日のごはん', [{ type: 'show_today' }]],
    ['今日のご飯は？', [{ type: 'show_today' }]],
    ['晩ごはん何？', [{ type: 'show_today' }]],
    ['今週の献立', [{ type: 'show_week' }]],
    ['明日のごはんは？', [{ type: 'show_today', date: addDays(MONDAY, 1) }]],
    ['買い物リスト', [{ type: 'show_shopping' }]],
    ['@きめとく 今日は無理', [{ type: 'today_impossible' }]],
    ['@きめとく 鶏むねが安い', [{ type: 'sale', ingredientId: 'chicken_breast' }]],
    ['@きめとく 水曜は夫が飲み会', [{ type: 'absence', date: '2026-11-11', memberRef: '夫' }]],
    ['卵切れた', [{ type: 'out_of_stock', ingredientId: 'egg' }]],
    ['豆腐買った', [{ type: 'have', ingredientId: 'tofu_firm' }]],
    ['お米買った', [{ type: 'have', ingredientId: 'rice' }]],
    ['金曜は魚がいい', [{ type: 'request', date: '2026-11-13', protein: 'fish' }]],
    ['別のにして', [{ type: 'want_alternatives' }]],
    ['使い方', [{ type: 'help' }]],
    // 総称（「鶏肉」）は特売・在庫で代表の食材に当てる（除外の検索・判定には使わない）
    ['鶏肉が安い', [{ type: 'sale', ingredientId: 'chicken_thigh' }]],
    ['きのこが安い', [{ type: 'sale', ingredientId: 'shimeji' }]],
    // ひらがな2文字の食材（いか・たら・さけ）は、普通の言葉の一部に当てない
    ['鶏むねが安いから', [{ type: 'sale', ingredientId: 'chicken_breast' }]],
    ['豚こまが安いかも', [{ type: 'sale', ingredientId: 'pork_komagire' }]],
    ['えびといかが特売', [{ type: 'sale', ingredientId: 'shrimp' }, { type: 'sale', ingredientId: 'squid' }]],
    ['いかが安い', [{ type: 'sale', ingredientId: 'squid' }]],
    ['さけ買った', [{ type: 'have', ingredientId: 'salmon' }]],
    ['牛乳ないから買ってきて', [{ type: 'out_of_stock', ingredientId: 'milk' }]],
    ['たらこ買った', [{ type: 'unknown', text: 'たらこ買った' }]],
    // 料理名のあいまいな一致と、ジャンルの語
    ['生姜焼きがいい', [{ type: 'request', dishId: 'shogayaki' }]],
    ['しょうが焼きがいい', [{ type: 'request', dishId: 'shogayaki' }]],
    ['金曜は中華がいい', [{ type: 'request', date: '2026-11-13', genre: 'chu' }]],
    ['金曜は冷やし中華がいい', [{ type: 'request', date: '2026-11-13', dishId: 'hiyashi_chuka' }]],
    ['たこ焼き食べたい', [{ type: 'unknown', text: 'たこ焼き食べたい' }]],
    ['おむすびがいい', [{ type: 'unknown', text: 'おむすびがいい' }]],
    ['明日はさばがいい', [{ type: 'request', date: '2026-11-10', protein: 'fish', ingredientId: 'mackerel' }]],
  ];
  it.each(cases)('「%s」', (text, expected) => {
    expect(parseMessage(text, ctx)).toEqual(expected);
  });

  it('ひらがな2文字の食材を、ほかの言葉の中で読まない（いか・たら・さけ）', () => {
    for (const t of ['今日は買い物いかない', '忙しいから簡単なのがいい', 'さけるチーズ買った', 'いかがですか']) {
      const ids = parseMessage(t, ctx).flatMap((c) => ('ingredientId' in c && c.ingredientId ? [c.ingredientId] : []));
      expect(ids, t).not.toContain('squid');
      expect(ids, t).not.toContain('cod');
      expect(ids, t).not.toContain('salmon');
    }
  });

  it('「塩焼きがいい」「炒め物がいい」は候補から選んでもらい、頼んでいない料理を除外の理由で断らない', () => {
    for (const t of ['塩焼きがいい', '炒め物がいい', '照り焼きがいい']) {
      const r = handleUserText(s, catalog, t);
      expect(r.replies[0].text, t).not.toContain('除外の条件');
      expect(r.replies[0].card?.kind, t).toBe('alternatives');
      expect(eggDishes(r.state), t).toEqual([]);
    }
  });

  it('「今日のごはん」で今日の献立のカードとボタンを返す', () => {
    const r = handleUserText(s, catalog, '今日のごはん');
    expect(r.replies[0].card).toEqual({ kind: 'meal', date: MONDAY });
    expect(r.replies[0].actions?.map((a) => a.label)).toEqual(['作った', '別のに', '今日は無理']);
  });

  it('「金曜はカレーがいい」は、食べられるカレー（定番のキーマカレー）を提案する', () => {
    const r = handleUserText(s, catalog, '@きめとく 金曜はカレーがいい');
    const p = r.state.proposals[0];
    expect(p).toBeDefined();
    expect(p.toDishIds[0]).toBe('keema_curry');
    expect(r.replies.at(-1)!.actions?.map((a) => a.label)).toEqual(['替える', 'そのまま']);
    expect(replyProblems(r.replies)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. 決定的・速さ
// ---------------------------------------------------------------------------

describe('決定的で速い', () => {
  it('同じ入力なら同じ献立と買い物リスト', () => {
    for (const start of ['2026-11-09', '2026-07-08']) {
      const a = createInitialState(DEMO_ONBOARDING, catalog, start);
      const b = createInitialState(structuredClone(DEMO_ONBOARDING), catalog, start);
      expect(b).toEqual(a);
      expect(advanceDay(b, catalog)).toEqual(advanceDay(a, catalog));
    }
  });

  it('createInitialState が200ms未満', () => {
    const t0 = performance.now();
    createInitialState(demoWith({ shoppingWeekdays: [0, 3] }), catalog, '2026-10-14');
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// 5. いろいろな世帯
// ---------------------------------------------------------------------------

describe('乳児のいる世帯', () => {
  const withInfant = (extra: Partial<OnboardingInput> = {}) =>
    demoWith({ members: [...DEMO_ONBOARDING.members, { nickname: 'あかね', ageBand: 'infant', role: 'child', exclusions: [] }], ...extra });

  it('乳児は人数に含まれず、乳児の注意が出る', () => {
    const s = createInitialState(withInfant(), catalog, MONDAY);
    expect(s.meals.length).toBe(5);
    expect(s.meals.every((m) => m.servings === 3.2)).toBe(true);
    const notices = householdNotices(s.household).map((n) => n.text);
    expect(notices.some((t) => t.includes('1歳未満') && t.includes('含めていません'))).toBe(true);
    expect(notices.some((t) => t.includes('はちみつ'))).toBe(true);
    expect(safetyViolations(s, catalog)).toEqual([]);
  });

  it('はちみつを使う料理には、乳児に与えない注意が付く', () => {
    const input = withInfant({
      members: [
        { nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
        { nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] },
        { nickname: 'あかね', ageBand: 'infant', role: 'child', exclusions: [] },
      ],
      customFavoriteNames: ['手羽元のはちみつ焼き'],
    });
    const s0 = createInitialState(input, catalog, MONDAY);
    const custom = s0.household.customDishes[0];
    expect(custom.name).toBe('手羽元のはちみつ焼き');
    const day = s0.meals.find((m) => m.date > MONDAY && m.kind === 'normal')!;
    const r = applyAction(s0, catalog, { type: 'choose_alternative', date: day.date, dishIds: [custom.id] });
    const meal = mealOn(r.state, day.date)!;
    expect(meal.dishIds[0]).toBe(custom.id);
    expect(meal.warnings.some((w) => w.includes('はちみつ') && w.includes('1歳未満'))).toBe(true);
    for (const m of r.state.meals.filter((x) => x.dishIds.includes(custom.id))) {
      expect(m.warnings.some((w) => w.includes('はちみつ')), m.date).toBe(true);
    }
  });
});

/** 4週間進めて、献立が壊れずにできるか（足りない日は warnings で知らせているか）を確かめる。 */
function fourWeeks(input: OnboardingInput, start = MONDAY) {
  let s = createInitialState(input, catalog, start);
  const seen = new Map<ISODate, AppState['meals'][number]>();
  const problems: string[] = [];
  const record = () => {
    for (const m of s.meals) seen.set(m.date, m);
    problems.push(...safetyViolations(s, catalog).map((p) => `${s.today}: ${p}`));
    problems.push(...shoppingViolations(s, catalog).map((p) => `${s.today}: ${p}`));
  };
  record();
  for (let i = 0; i < 28; i++) {
    s = advanceDay(s, catalog).state;
    record();
  }
  return { state: s, meals: [...seen.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), problems };
}

describe('大豆・小麦アレルギーの世帯でも、献立が壊れずにできる', () => {
  const cases: [string, Exclusion[]][] = [
    ['大豆', [{ type: 'allergen', id: 'egg' }, { type: 'allergen', id: 'soy' }]],
    ['小麦', [{ type: 'allergen', id: 'egg' }, { type: 'allergen', id: 'wheat' }]],
    ['大豆と小麦と乳', [{ type: 'allergen', id: 'egg' }, { type: 'allergen', id: 'soy' }, { type: 'allergen', id: 'wheat' }, { type: 'allergen', id: 'milk' }]],
    ['大豆・小麦・乳・さけ・さば', [
      { type: 'allergen', id: 'egg' }, { type: 'allergen', id: 'soy' }, { type: 'allergen', id: 'wheat' },
      { type: 'allergen', id: 'milk' }, { type: 'allergen', id: 'salmon' }, { type: 'allergen', id: 'mackerel' },
    ]],
  ];

  it.each(cases)('%s', (_, exclusions) => {
    const { state, meals, problems } = fourWeeks(demoWith({ harutoExclusions: exclusions }));
    expect(problems).toEqual([]);
    // 4週間の月〜金すべてに献立がある（料理がない日は、注意で知らせる）
    const dinnerDays = [...Array(33).keys()].map((i) => addDays(MONDAY, i)).filter((d) => [1, 2, 3, 4, 5].includes(weekdayOf(d)));
    expect(meals.map((m) => m.date)).toEqual(expect.arrayContaining(dinnerDays));
    for (const m of meals) {
      if (m.dishIds.length === 0) expect(m.warnings.length, m.date).toBeGreaterThan(0);
      for (const d of dishesOf(state, catalog, m)) {
        const allergens = ingredientObjs(state, catalog, d).flatMap((i) => i.allergens);
        for (const ex of exclusions) if (ex.type === 'allergen') expect(allergens, `${m.date} ${d.name}`).not.toContain(ex.id);
      }
    }
    // 大豆・小麦の除外は、調味料にも当たって料理が少なくなることを、世帯への注意で知らせる
    const notices = householdNotices(state.household).map((n) => n.text);
    expect(notices.some((t) => t.includes('醤油'))).toBe(true);
  });

  it('組めない日には、その日の注意（warnings）が付く', () => {
    const { meals } = fourWeeks(
      demoWith({
        harutoExclusions: [
          { type: 'allergen', id: 'egg' }, { type: 'allergen', id: 'soy' }, { type: 'allergen', id: 'wheat' },
          { type: 'allergen', id: 'milk' }, { type: 'allergen', id: 'salmon' }, { type: 'allergen', id: 'mackerel' },
        ],
      }),
    );
    // 週のラク日は1日。それを超えるラク日（主菜が組めなかった日）と、料理のない日には、注意が付く。
    let fallbacks = 0;
    for (const ws of new Set(meals.map((m) => weekStartOf(m.date)))) {
      const week = meals.filter((m) => weekStartOf(m.date) === ws);
      const raku = week.filter((m) => m.kind === 'raku');
      const warned = raku.filter((m) => m.warnings.some((w) => w.includes('見つから')));
      expect(warned.length, ws).toBeGreaterThanOrEqual(raku.length - 1);
      fallbacks += warned.length;
      for (const m of week) if (m.dishIds.length === 0) expect(m.warnings.length, m.date).toBeGreaterThan(0);
    }
    expect(fallbacks).toBeGreaterThan(0);
  });
});

describe('重いアレルギーの印', () => {
  it('対象外の注意が出る（最初のメッセージにも入る）', () => {
    const s = createInitialState(demoWith({ harutoExclusions: [{ type: 'allergen', id: 'egg', severe: true }] }), catalog, MONDAY);
    const severe = householdNotices(s.household).find((n) => n.text.includes('対象外'));
    expect(severe?.level).toBe('warning');
    const card = s.chat.find((m) => m.card?.kind === 'notice')?.card;
    expect(card?.kind === 'notice' && card.lines.some((l) => l.includes('対象外'))).toBe(true);
    expect(card?.kind === 'notice' && card.level).toBe('warning');
    expect(eggDishes(s)).toEqual([]);
  });
});

describe('自由入力の除外（text）', () => {
  it('アレルゲンの名前（鶏肉）なら、鶏肉を含む食材（鶏むね・鶏ガラ・コンソメなど）をすべて除外する', () => {
    const { state, meals, problems } = fourWeeks(demoWith({ harutoExclusions: [{ type: 'text', text: '鶏肉' }] }));
    expect(problems).toEqual([]);
    for (const m of meals) {
      for (const d of dishesOf(state, catalog, m)) {
        expect(ingredientObjs(state, catalog, d).filter((i) => i.allergens.includes('chicken')).map((i) => i.name), `${m.date} ${d.name}`).toEqual([]);
      }
    }
    // アレルゲンの除外と同じく、要確認の加工品も出さない
    expect(householdNotices(state.household).some((n) => n.text.includes('要確認'))).toBe(true);
  });

  it('いろいろな書き方（卵アレルギー、えび・かに、甲殻類、乳製品）も、アレルゲンの除外として判定する', () => {
    const s = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);
    const judge = (text: string, dishId: string) => {
      const h = structuredClone(s.household);
      h.members = [{ id: 'member_1', nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [{ type: 'text', text }] }];
      return checkDishSafety(catalog.dishById.get(dishId)!, h, catalog).status;
    };
    expect(judge('卵アレルギー', 'tonkatsu')).toBe('excluded'); // 衣の卵
    expect(judge('卵白', 'tonkatsu')).toBe('excluded');
    expect(judge('卵黄', 'potato_salad')).toBe('excluded'); // マヨネーズの卵
    expect(judge('えび・かに', 'shirasu_don')).toBe('excluded'); // しらすに混ざることがある
    expect(judge('甲殻類', 'shirasu_don')).toBe('excluded');
    expect(judge('甲殻類アレルギー', 'shirasu_don')).toBe('excluded');
    expect(judge('甲殻類のアレルギー', 'ebi_broccoli_shio')).toBe('excluded');
    expect(judge('とり肉', 'curry_rice')).not.toBe('ok'); // カレールウ（要確認）と鶏肉
    expect(judge('チキン', 'chicken_broccoli_shio')).toBe('excluded');
    expect(judge('ポーク', 'shogayaki')).toBe('excluded');
    expect(judge('ビーフ', 'nikujaga')).toBe('excluded');
    expect(judge('乳製品', 'salmon_foil')).toBe('excluded'); // バター
    expect(judge('鶏肉', 'chicken_broccoli_shio')).toBe('excluded'); // 鶏むね肉
    expect(judge('鶏肉', 'wakame_soup')).not.toBe('ok'); // 鶏ガラスープの素（要確認の加工品）
    // アレルゲンの名前でない語は、これまでどおり食材の名前・別名で判定する
    expect(judge('しいたけ', 'chikuzenni')).toBe('excluded');
    expect(judge('しいたけ', 'chicken_teriyaki')).toBe('ok');
  });

  it('えび（カタカナ・漢字でも）なら、えびが混ざることのあるしらすも除外する', () => {
    for (const text of ['えび', 'エビ', '海老']) {
      const { state, meals } = fourWeeks(demoWith({ harutoExclusions: [{ type: 'text', text }] }));
      for (const m of meals) {
        for (const d of dishesOf(state, catalog, m)) {
          expect(ingredientObjs(state, catalog, d).some((i) => i.allergens.includes('shrimp')), `${text} ${m.date} ${d.name}`).toBe(false);
        }
      }
    }
  });
});

describe('自由入力の除外（分類の語・並べた語）', () => {
  /** その種類（kind）の食材を使う料理が、4週間で1つも入らない。 */
  const noKind = (text: string, kinds: string[], ids: string[] = []) => {
    const { state, meals, problems } = fourWeeks(demoWith({ harutoExclusions: [{ type: 'allergen', id: 'egg' }, { type: 'text', text }] }));
    expect(problems).toEqual([]);
    const hits: string[] = [];
    for (const m of meals) {
      if (m.status === 'skipped') continue;
      for (const d of dishesOf(state, catalog, m)) {
        for (const i of ingredientObjs(state, catalog, d)) if (kinds.includes(i.kind) || ids.includes(i.id)) hits.push(`${m.date} ${d.name}（${i.name}）`);
      }
    }
    expect(hits, text).toEqual([]);
    return meals;
  };

  it('「魚」なら、魚（鮭・さば・ぶり・しらす・さば缶など）を使う料理が4週間入らない', () => {
    const meals = noKind('魚', ['fish']);
    expect(meals.filter((m) => m.dishIds.length > 0).length).toBeGreaterThanOrEqual(15);
  });

  it('「貝」ならあさり、「きのこ」ならきのこ類、「ピーマン、しいたけ」なら両方が入らない', () => {
    noKind('貝', [], ['clam', 'oyster_sauce']);
    noKind('きのこ', ['mushroom']);
    noKind('ピーマン、しいたけ', [], ['green_pepper', 'shiitake']);
  });
});

/** n 週間（advanceDay を毎日）進め、毎日の献立と返事を集める。check_item で買い物もする。 */
function weeksOf(input: OnboardingInput, start: ISODate, weeks: number, impossible = true) {
  let s = createInitialState(input, catalog, start);
  const meals = new Map<ISODate, AppState['meals'][number]>();
  const replies: AppState['chat'] = [];
  const record = () => {
    for (const m of s.meals) meals.set(m.date, m);
  };
  record();
  for (let i = 0; i < weeks * 7; i++) {
    const list = s.shopping.find((l) => l.date === s.today);
    for (const it of list?.items ?? []) {
      s = applyAction(s, catalog, { type: 'check_item', shoppingDate: s.today, ingredientId: it.ingredientId, checked: true }).state;
    }
    const today = mealOn(s, s.today);
    if (impossible && today && today.dishIds.length > 0 && i % 3 === 1) {
      const r = handleUserText(s, catalog, '今日は無理');
      s = r.state;
      replies.push(...r.replies);
    }
    if (mealOn(s, s.today)?.dishIds.length) s = applyAction(s, catalog, { type: 'cooked', date: s.today }).state;
    record();
    const r = advanceDay(s, catalog);
    s = r.state;
    replies.push(...r.replies);
    record();
  }
  return { state: s, meals: [...meals.values()], replies };
}

describe('1食の組み方（汁物の重なり・主な材料の重なり・ラク日の副菜・解凍）', () => {
  const families: [string, OnboardingInput][] = [
    ['デモの家族', DEMO_ONBOARDING],
    ['除外なし', demoWith({ harutoExclusions: [] })],
  ];
  const starts = ['2026-01-05', '2026-04-06', '2026-07-06', '2026-11-09'];
  const runs = families.flatMap(([name, input]) => starts.map((start) => ({ name, start, ...weeksOf(input, start, 4) })));

  it('「納豆ごはんと味噌汁」には何も足さず、汁のある料理（麺・シチュー・鍋）に汁物を足さない（「今日は無理」の組み直しも）', () => {
    const problems: string[] = [];
    for (const r of runs) {
      for (const m of r.meals) {
        const [head, ...rest] = dishesOf(r.state, catalog, m);
        if (!head) continue;
        if (head.tags.includes('complete') && rest.length > 0) problems.push(`${r.name} ${m.date} ${head.name}＋${rest.map((d) => d.name).join('・')}`);
        if (head.tags.includes('soupy') && rest.some((d) => d.role === 'soup')) problems.push(`${r.name} ${m.date} ${head.name}＋汁物`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('主菜の主役の材料を、副菜・汁物の主役にもう一度使わない（肉じゃが＋じゃがいもの味噌汁、かに玉＋たまごスープ など）', () => {
    const bad: [string, string][] = [
      ['nikujaga', 'potato_onion_miso'], ['shio_nikujaga', 'potato_onion_miso'], ['kanitama', 'chinese_egg_soup'],
      ['tomato_egg', 'chinese_egg_soup'], ['niratama', 'chinese_egg_soup'], ['cream_stew', 'corn_soup'], ['ika_daikon', 'miso_daikon_age'],
      ['sabakan_cabbage_miso', 'cabbage_shiomomi'], ['pork_moyashi_range', 'moyashi_namul'], ['chicken_broccoli_shio', 'broccoli_okaka'],
    ];
    const problems: string[] = [];
    for (const r of runs) {
      for (const m of r.meals) {
        const [head, ...rest] = dishesOf(r.state, catalog, m);
        if (!head) continue;
        for (const side of rest) {
          if (bad.some(([a, b]) => a === head.id && b === side.id)) problems.push(`${r.name} ${m.date} ${head.name}＋${side.name}`);
          if (side.protein !== 'none' && side.protein === head.protein) problems.push(`${r.name} ${m.date} ${head.name}＋${side.name}（同じたんぱく源）`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('ラク日の副菜は、買ってから冷凍・解凍しなくてよい物だけ。惣菜は当日に買い、「買ったら冷凍」を付けない', () => {
    const problems: string[] = [];
    for (const r of runs) {
      for (const m of r.meals) {
        if (m.kind !== 'raku') continue;
        for (const note of m.notes) if (/解凍|買ったら冷凍/.test(note)) problems.push(`${r.name} ${m.date} ${note}`);
      }
      for (const l of r.state.shopping) {
        for (const it of l.items) {
          if (it.aisle !== 'deli') continue;
          if (it.notes.some((n) => n.includes('冷凍'))) problems.push(`${r.name} ${l.date} ${it.name}に冷凍の印`);
          if (it.forDates.some((d) => d !== l.date)) problems.push(`${r.name} ${l.date} ${it.name}を前の買い物日に買う`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('凍ったまま加熱する物（あさり・きのこ・冷凍野菜）に「前日の夜に冷蔵室へ」と案内せず、解凍の連絡は使う料理の名前で言う', () => {
    const paid = weeksOf({ ...structuredClone(DEMO_ONBOARDING), plan: 'paid', shoppingWeekdays: [0] }, '2026-11-15', 3, false);
    const problems: string[] = [];
    for (const m of paid.meals) for (const n of m.notes) if (/^(冷凍の)?(あさり|しめじ|えのき|生しいたけ)/.test(n) && n.includes('冷蔵室')) problems.push(`${m.date} ${n}`);
    const thaw = paid.replies.filter((m) => m.push && m.text.includes('冷凍室から冷蔵室へ'));
    expect(thaw.length).toBeGreaterThan(0);
    for (const msg of thaw) {
      expect(msg.text).not.toContain('あさり');
      const date = msg.card?.kind === 'meal' ? msg.card.date : '';
      const meal = paid.meals.find((x) => x.date === date)!;
      const named = dishesOf(paid.state, catalog, meal).filter((d) => msg.text.includes(`${d.name}`));
      expect(named.length, msg.text).toBeGreaterThan(0);
      const ingNames = named.flatMap((d) => ingredientObjs(paid.state, catalog, d).map((i) => i.name));
      const listed = msg.text.split('用に、')[1]?.split('を冷凍室')[0]?.split('と') ?? [];
      for (const n of listed) expect(ingNames, msg.text).toContain(n);
    }
    expect(problems).toEqual([]);
  });
});

describe('要確認の扱い', () => {
  it('allowUncertainWithExclusions が true なら、要確認の料理も出し、注意（要確認：…）を付ける', () => {
    const base = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);
    const s: AppState = structuredClone(base);
    s.household.settings.allowUncertainWithExclusions = true;
    s.household.favorites = [...s.household.favorites, { dishId: 'curry_rice' }, { dishId: 'frozen_gyoza_yaki' }, { dishId: 'cream_stew' }];
    const r = applyAction(s, catalog, { type: 'regenerate_week', weekStart: MONDAY });
    const uncertain = r.state.meals.filter((m) =>
      dishesOf(r.state, catalog, m).some((d) => ingredientObjs(r.state, catalog, d).some((i) => i.uncertain)),
    );
    expect(uncertain.length).toBeGreaterThan(0);
    for (const m of uncertain) {
      expect(m.warnings.some((w) => w.startsWith('要確認：') && w.includes('パッケージの表示を確かめてください')), m.date).toBe(true);
    }
    // 卵は、要確認を許しても出さない
    expect(eggDishes(r.state)).toEqual([]);
    expect(householdNotices(r.state.household).some((n) => n.text.includes('「要確認」として献立に出していません'))).toBe(false);
  });

  it('要確認の加工品は、買い物リストでも「要確認」の印が付く', () => {
    const base = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);
    const s: AppState = structuredClone(base);
    s.household.settings.allowUncertainWithExclusions = true;
    const day = s.meals.find((m) => m.date > MONDAY && m.kind === 'normal')!;
    const r = applyAction(s, catalog, { type: 'choose_alternative', date: day.date, dishIds: ['curry_rice'] });
    const roux = r.state.shopping.flatMap((l) => l.items).find((i) => i.ingredientId === 'curry_roux');
    expect(roux?.uncertain).toBe(true);
    expect(mealOn(r.state, day.date)!.warnings.some((w) => w.includes('カレールウ'))).toBe(true);
  });
});

describe('新しい料理の理由', () => {
  it('定番が0件でも「今週の新しい料理」は newPerWeek の分だけ。超えた分は最初の1日に一言だけ', () => {
    const s = createInitialState(demoWith({ favoriteDishIds: [] }), catalog, MONDAY);
    const newMeals = s.meals.filter((m) => m.newDishIds.length > 0);
    expect(newMeals.length).toBeGreaterThan(1);
    const all = s.meals.flatMap((m) => m.reasons);
    expect(all.filter((r) => r === '今週の新しい料理')).toHaveLength(1);
    const more = s.meals.filter((m) => m.reasons.some((r) => r.includes('新しい料理を多めに')));
    expect(more).toHaveLength(1);
    // 「多めに」の一言は、新しい料理の数を超えた最初の日に付く
    const firstExtra = newMeals.find((m) => !m.reasons.includes('今週の新しい料理'))!;
    expect(more[0].date).toBe(firstExtra.date);
  });

  it('定番が十分なら「多めに」は付かない', () => {
    const s = createInitialState(DEMO_ONBOARDING, catalog, MONDAY);
    expect(s.meals.flatMap((m) => m.reasons).some((r) => r.includes('多めに'))).toBe(false);
    expect(s.meals.filter((m) => m.newDishIds.length > 0).length).toBeLessThanOrEqual(1);
  });
});
