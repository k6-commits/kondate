// 週末の質問（北極星「今週、自分で考えた夕食は何日？」）：advanceDay で聞き、ボタンと文字の答えを state.checkins に記録する。
import type { Action, AppState, ChatMessage, ISODate, Weekday } from './index';
import { addDays, advanceDay, applyAction, createInitialState, handleUserText, renderCardText, weeklySummary } from './index';
import { MONDAY, catalog, demoInput } from './__fixtures__/catalog';
import { deepFreeze } from './__fixtures__/helpers';

const SATURDAY = addDays(MONDAY, 5); // 11/14(土)
const NEXT_MONDAY = addDays(MONDAY, 7);

const QUESTION_HEAD = '11/9(月)〜11/13(金)の夕食で、自分で献立を考えた日は何日ありましたか？';
const QUESTION_NOTE = 'アプリの献立どおりの日や、アプリで替えた日は数えません。';

function checkinActions(m: ChatMessage): Extract<Action, { type: 'weekly_checkin' }>[] {
  return (m.actions ?? []).flatMap((a) => (a.action.type === 'weekly_checkin' ? [a.action] : []));
}
const isQuestion = (m: ChatMessage) => checkinActions(m).length > 0;
const questions = (s: AppState) => s.chat.filter((m) => m.from === 'bot' && isQuestion(m));

/** 1日ずつ進める。日ごとの返事も返す。 */
function advanceTo(s: AppState, date: ISODate): { state: AppState; days: { date: ISODate; replies: ChatMessage[] }[] } {
  const days: { date: ISODate; replies: ChatMessage[] }[] = [];
  while (s.today < date) {
    const r = advanceDay(s, catalog);
    s = r.state;
    days.push({ date: s.today, replies: r.replies });
  }
  return { state: s, days };
}

/** 月曜から始めて、土曜（週末の質問が出た日）まで進めた状態。 */
function saturday(overrides: Parameters<typeof demoInput>[0] = {}, start: ISODate = MONDAY): AppState {
  return advanceTo(createInitialState(demoInput(overrides), catalog, start), SATURDAY).state;
}

/** その日をみんな外で食べる日にする（テスト用に状態を直接作る）。 */
function everyoneOutOn(s: AppState, dates: ISODate[]): AppState {
  const ids = s.household.members.map((m) => m.id);
  return { ...s, meals: s.meals.map((m) => (dates.includes(m.date) ? { ...m, absentMemberIds: ids } : m)) };
}

const lastBot = (s: AppState) => [...s.chat].reverse().find((m) => m.from === 'bot')!;

// ---------------------------------------------------------------------------

describe('週末の質問：advanceDay で聞く', () => {
  it('月〜金の週：金曜の翌日（土曜）に進めたとき1回だけ、「作りましたか？」のあとに聞く', () => {
    const { state, days } = advanceTo(createInitialState(demoInput(), catalog, MONDAY), addDays(MONDAY, 8));
    // 火〜金の朝には聞かない
    for (const d of days.filter((x) => x.date < SATURDAY)) expect(d.replies.some(isQuestion)).toBe(false);
    const sat = days.find((d) => d.date === SATURDAY)!.replies;
    expect(sat.map((m) => (isQuestion(m) ? 'question' : m.text.includes('作りましたか？') ? 'cooked?' : 'other'))).toEqual([
      'cooked?',
      'question',
    ]);
    const q = sat[1];
    expect(q.text.split('\n')).toEqual([QUESTION_HEAD, QUESTION_NOTE]);
    expect(q.push).toBeUndefined();
    expect(q.card).toBeUndefined();
    expect(q.actions?.map((a) => a.label)).toEqual(['0日', '1日', '2日', '3日', '4日', '5日']);
    expect(checkinActions(q)).toEqual([0, 1, 2, 3, 4, 5].map((n) => ({ type: 'weekly_checkin', weekStart: MONDAY, thoughtDays: n })));
    // 日曜・月曜・火曜に進めても、もう聞かない（chat に1つだけ）
    expect(questions(state)).toHaveLength(1);
  });

  it('有料版も同じ：配信（push）ではなく「作りましたか？」と同じふつうのメッセージで、配信より前に置く', () => {
    const { days } = advanceTo(createInitialState(demoInput({ plan: 'paid' }), catalog, MONDAY), SATURDAY);
    const sat = days.at(-1)!.replies;
    const qi = sat.findIndex(isQuestion);
    expect(qi).toBe(1);
    expect(sat[0].text).toContain('作りましたか？');
    expect(sat[qi].push).toBeUndefined();
    expect(sat.slice(qi + 1).every((m) => m.push === true)).toBe(true);
    expect(sat[qi].text.split('\n')[0]).toBe(QUESTION_HEAD);
  });

  it('週の途中から始めたら、最初の献立の日からの日だけを聞く（水曜に始めた週は3日）', () => {
    const wed = addDays(MONDAY, 2);
    const s = advanceTo(createInitialState(demoInput(), catalog, wed), SATURDAY).state;
    const [q] = questions(s);
    expect(q.text.split('\n')[0]).toBe('11/11(水)〜11/13(金)の夕食で、自分で献立を考えた日は何日ありましたか？');
    expect(checkinActions(q).map((a) => a.thoughtDays)).toEqual([0, 1, 2, 3]);
    expect(checkinActions(q).every((a) => a.weekStart === MONDAY)).toBe(true);
  });

  it('金曜だけの週（金曜に始めた）も、土曜に1日分を聞く', () => {
    const fri = addDays(MONDAY, 4);
    const s = advanceTo(createInitialState(demoInput(), catalog, fri), SATURDAY).state;
    const [q] = questions(s);
    expect(q.text.split('\n')[0]).toBe('11/13(金)の夕食で、自分で献立を考えた日は何日ありましたか？');
    expect(q.actions?.map((a) => a.label)).toEqual(['0日', '1日']);
  });

  it('土曜に始めた家族には、その週のことを聞かない（その週の献立がない）', () => {
    const s = advanceTo(createInitialState(demoInput(), catalog, SATURDAY), addDays(SATURDAY, 2)).state;
    expect(questions(s)).toEqual([]);
  });

  it('みんな外で食べた日は数えない。範囲の中にあれば、その日も数えないと添える', () => {
    let s = createInitialState(demoInput(), catalog, MONDAY);
    s = everyoneOutOn(s, [addDays(MONDAY, 2)]); // 水曜
    s = advanceTo(s, SATURDAY).state;
    const [q] = questions(s);
    expect(q.text.split('\n')).toEqual([QUESTION_HEAD, QUESTION_NOTE, 'みんな外で食べた日（11/11(水)）も数えません。']);
    expect(checkinActions(q).map((a) => a.thoughtDays)).toEqual([0, 1, 2, 3, 4]);
  });

  it('週の最後（金曜）がみんな外で食べる日でも、金曜の翌日（土曜）に聞く。範囲は家で食べた木曜まで', () => {
    let s = createInitialState(demoInput(), catalog, MONDAY);
    s = everyoneOutOn(s, [addDays(MONDAY, 4)]);
    const { state, days } = advanceTo(s, SATURDAY);
    expect(days.find((d) => d.date === addDays(MONDAY, 4))!.replies.some(isQuestion)).toBe(false);
    const [q] = questions(state);
    expect(days.at(-1)!.replies.some((m) => m.id === q.id)).toBe(true);
    expect(q.text.split('\n')).toEqual(['11/9(月)〜11/12(木)の夕食で、自分で献立を考えた日は何日ありましたか？', QUESTION_NOTE]);
    expect(checkinActions(q).map((a) => a.thoughtDays)).toEqual([0, 1, 2, 3, 4]);
  });

  it('どの日もみんな外で食べた週には聞かない', () => {
    let s = createInitialState(demoInput(), catalog, MONDAY);
    s = everyoneOutOn(s, [0, 1, 2, 3, 4].map((i) => addDays(MONDAY, i)));
    s = advanceTo(s, NEXT_MONDAY).state;
    expect(questions(s)).toEqual([]);
  });

  it('有料版でも、どの日もみんな外で食べた週には聞かない', () => {
    let s = createInitialState(demoInput({ plan: 'paid' }), catalog, MONDAY);
    s = everyoneOutOn(s, [0, 1, 2, 3, 4].map((i) => addDays(MONDAY, i)));
    s = advanceTo(s, NEXT_MONDAY).state;
    expect(questions(s)).toEqual([]);
  });

  it('もう答えのある週には聞かない', () => {
    let s = advanceTo(createInitialState(demoInput(), catalog, MONDAY), addDays(MONDAY, 4)).state;
    s = { ...s, checkins: [{ weekStart: MONDAY, plannedDays: 5, thoughtDays: 1, answeredOn: s.today }] };
    s = advanceTo(s, NEXT_MONDAY).state;
    expect(questions(s)).toEqual([]);
  });

  it('献立の曜日が続いていない家族（月・水・金）には、範囲ではなく日を並べて聞く（献立のない火・木を数えないように）', () => {
    let s = createInitialState(demoInput(), catalog, MONDAY);
    const mwf = [MONDAY, addDays(MONDAY, 2), addDays(MONDAY, 4)];
    s = {
      ...s,
      household: { ...s.household, settings: { ...s.household.settings, dinnerWeekdays: [1, 3, 5] as Weekday[] } },
      meals: s.meals.filter((m) => mwf.includes(m.date)),
    };
    const [q] = questions(advanceTo(s, SATURDAY).state);
    expect(q.text.split('\n')).toEqual(['11/9(月)・11/11(水)・11/13(金)の夕食で、自分で献立を考えた日は何日ありましたか？', QUESTION_NOTE]);
    expect(checkinActions(q).map((a) => a.thoughtDays)).toEqual([0, 1, 2, 3]);
    // 水曜がみんな外で食べる日なら、月・金だけを並べる（みんな外で食べた日の一言は要らない）
    const [q2] = questions(advanceTo(everyoneOutOn(s, [addDays(MONDAY, 2)]), SATURDAY).state);
    expect(q2.text.split('\n')).toEqual(['11/9(月)・11/13(金)の夕食で、自分で献立を考えた日は何日ありましたか？', QUESTION_NOTE]);
    expect(checkinActions(q2).map((a) => a.thoughtDays)).toEqual([0, 1, 2]);
  });

  it('毎日が献立の日の家族（月〜日）は、日曜の翌日（月曜）に7日分を聞く。有料版は今日の配信より前に置く', () => {
    let s = createInitialState(demoInput({ plan: 'paid' }), catalog, MONDAY);
    s = { ...s, household: { ...s.household, settings: { ...s.household.settings, dinnerWeekdays: [0, 1, 2, 3, 4, 5, 6] as Weekday[] } } };
    s = applyAction(s, catalog, { type: 'regenerate_week', weekStart: MONDAY }).state;
    expect(s.meals.filter((m) => m.date < NEXT_MONDAY)).toHaveLength(7);
    const { state, days } = advanceTo(s, NEXT_MONDAY);
    for (const d of days.slice(0, -1)) expect(d.replies.some(isQuestion)).toBe(false);
    const mon = days.at(-1)!.replies;
    const qi = mon.findIndex(isQuestion);
    expect(mon[qi].text.split('\n')[0]).toBe('11/9(月)〜11/15(日)の夕食で、自分で献立を考えた日は何日ありましたか？');
    expect(checkinActions(mon[qi]).map((a) => a.thoughtDays)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(mon.slice(qi + 1).every((m) => m.push === true)).toBe(true);
    expect(questions(state)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe('週末の質問の答え：ボタン（weekly_checkin）', () => {
  const sat = saturday();
  const tap = (s: AppState, thoughtDays: number, weekStart: ISODate = MONDAY) =>
    applyAction(s, catalog, { type: 'weekly_checkin', weekStart, thoughtDays });

  it('［2日］で記録し、押したボタンの文言を利用者の発言として残す', () => {
    const r = tap(sat, 2);
    expect(r.state.checkins).toEqual([{ weekStart: MONDAY, plannedDays: 5, thoughtDays: 2, answeredOn: SATURDAY }]);
    expect(r.replies.map((m) => m.text)).toEqual(['ありがとうございます。記録しました（自分で考えた日：2日／5日）。']);
    const echo = r.state.chat.at(-2)!;
    expect(echo).toMatchObject({ from: 'user', text: '2日', tap: true });
  });

  it('答え直すと置き換えて、そう言う。同じ答えなら「もう記録してあります」', () => {
    const first = tap(sat, 2).state;
    const again = tap(first, 3);
    expect(again.state.checkins).toEqual([{ weekStart: MONDAY, plannedDays: 5, thoughtDays: 3, answeredOn: SATURDAY }]);
    expect(again.replies.map((m) => m.text)).toEqual(['答えを直しました（自分で考えた日：3日／5日。前の答えは2日）。']);
    const same = tap(again.state, 3);
    expect(same.state.checkins).toEqual(again.state.checkins);
    expect(same.replies.map((m) => m.text)).toEqual(['もう記録してあります（自分で考えた日：3日／5日）。']);
    // 日曜に答え直しても、answeredOn はその日
    const sunday = advanceDay(first, catalog).state;
    expect(tap(sunday, 0).state.checkins).toEqual([{ weekStart: MONDAY, plannedDays: 5, thoughtDays: 0, answeredOn: addDays(SATURDAY, 1) }]);
  });

  it('0日〜5日の外（6日・-1日・1.5日）は記録しない。短く断って、ボタンを出し直す', () => {
    for (const n of [6, 7, -1, 1.5]) {
      const r = tap(sat, n);
      expect(r.state.checkins ?? []).toEqual([]);
      expect(r.replies).toHaveLength(1);
      expect(r.replies[0].text).toBe('0日から5日までで答えてください。');
      expect(checkinActions(r.replies[0]).map((a) => a.thoughtDays)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it('まだ終わっていない週・これからの週・月曜でない日・献立のない週の答えは記録しない', () => {
    const wed = advanceTo(createInitialState(demoInput(), catalog, MONDAY), addDays(MONDAY, 2)).state;
    const notOver = tap(wed, 1);
    expect(notOver.state.checkins ?? []).toEqual([]);
    expect(notOver.replies.map((m) => m.text)).toEqual(['その週の夕食がまだ終わっていないので、記録できませんでした。']);

    for (const weekStart of [NEXT_MONDAY, addDays(MONDAY, 1), '2026-10-05']) {
      const r = tap(sat, 1, weekStart);
      expect(r.state.checkins ?? []).toEqual([]);
      expect(r.replies).toHaveLength(1);
      expect(r.replies[0].text).toMatch(/記録できませんでした。$/);
    }
  });

  it('同じ数の答え直しは「もう記録してあります」（聞いた日数が変わっていれば、日数だけ直す）', () => {
    const odd = { ...sat, checkins: [{ weekStart: MONDAY, plannedDays: 4, thoughtDays: 2, answeredOn: '2026-11-14' }] };
    const r = tap(odd, 2);
    expect(r.replies.map((m) => m.text)).toEqual(['もう記録してあります（自分で考えた日：2日／5日）。']);
    expect(r.state.checkins).toEqual([{ weekStart: MONDAY, plannedDays: 5, thoughtDays: 2, answeredOn: SATURDAY }]);
  });

  it('checkins のない前の版の状態でも、配列を作って記録する', () => {
    const old = { ...sat };
    delete old.checkins;
    expect('checkins' in old).toBe(false);
    expect(tap(old, 4).state.checkins).toEqual([{ weekStart: MONDAY, plannedDays: 5, thoughtDays: 4, answeredOn: SATURDAY }]);
  });

  it('みんな外で食べた日のある週は、その日を除いた数で記録する', () => {
    let s = createInitialState(demoInput(), catalog, MONDAY);
    s = advanceTo(everyoneOutOn(s, [addDays(MONDAY, 2)]), SATURDAY).state;
    const r = tap(s, 4);
    expect(r.state.checkins).toEqual([{ weekStart: MONDAY, plannedDays: 4, thoughtDays: 4, answeredOn: SATURDAY }]);
    expect(r.replies[0].text).toBe('ありがとうございます。記録しました（自分で考えた日：4日／4日）。');
    expect(tap(s, 5).state.checkins ?? []).toEqual([]);
  });

  it('入力の state は変えない', () => {
    const frozen = deepFreeze(structuredClone(sat));
    expect(() => tap(frozen, 2)).not.toThrow();
    expect(frozen.checkins).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('週末の質問の答え：文字', () => {
  const sat = saturday();
  const say = (s: AppState, text: string) => handleUserText(s, catalog, text);
  const answered = (s: AppState) => s.checkins?.find((c) => c.weekStart === MONDAY)?.thoughtDays;

  it.each([
    ['2', 2],
    ['2日', 2],
    ['２日', 2],
    ['二日', 2],
    ['ふつか', 2],
    ['@きめとく 3日です', 3],
    ['1日だけ', 1],
    ['0', 0],
    ['0日', 0],
    ['なし', 0],
    ['ない', 0],
    ['1日もない', 0],
    ['一日もなかった', 0],
    ['全部', 5],
    ['毎日', 5],
    ['5日。', 5],
    // 質問の言葉をなぞった答え
    ['2日考えました', 2],
    ['2日自分で考えた', 2],
    ['自分で考えた日は2日です', 2],
    ['考えた日は1日', 1],
    ['自分で考えた日はない', 0],
    ['考えた日はなし', 0],
    ['5日とも', 5],
    ['5日全部', 5],
  ])('「%s」→ %i日', (text, n) => {
    const r = say(sat, text);
    expect(answered(r.state)).toBe(n);
    expect(r.replies.map((m) => m.text)).toEqual([`ありがとうございます。記録しました（自分で考えた日：${n}日／5日）。`]);
  });

  it.each(['いつか', 'なのか', '12日', '2日目', '2番目', '半分', '全部作った', '毎日大変', 'わからない', '2日考えてない', '考えた'])(
    '「%s」は数の答えにしない（範囲の外とも言わない）',
    (text) => {
      const r = say(sat, text);
      expect(answered(r.state)).toBeUndefined();
      expect(r.replies.map((m) => m.text).join('\n')).not.toContain('で答えてください');
    },
  );

  it('0〜5日の外の数（6日）は記録せず、範囲を伝えてボタンを出し直す', () => {
    const r = say(sat, '6日');
    expect(answered(r.state)).toBeUndefined();
    expect(r.replies[0].text).toBe('0日から5日までで答えてください。');
    expect(checkinActions(r.replies[0])).toHaveLength(6);
    // 出し直した質問にも、文字で答えられる
    expect(answered(say(r.state, '4').state)).toBe(4);
  });

  it('数でない書き込みは、ふだんどおりに読む。そのあとも数で答えられる', () => {
    const r = say(sat, '今週の献立');
    expect(answered(r.state)).toBeUndefined();
    expect(r.replies.some((m) => m.card?.kind === 'week')).toBe(true);
    expect(answered(say(r.state, '2').state)).toBe(2);
  });

  it('答えたすぐあとの数は、答え直しとして読む。ほかの話のあとは読まない', () => {
    const first = applyAction(sat, catalog, { type: 'weekly_checkin', weekStart: MONDAY, thoughtDays: 2 }).state;
    const fixed = say(first, '3');
    expect(answered(fixed.state)).toBe(3);
    expect(fixed.replies.map((m) => m.text)).toEqual(['答えを直しました（自分で考えた日：3日／5日。前の答えは2日）。']);
    const later = say(say(fixed.state, '今週の献立').state, '4');
    expect(answered(later.state)).toBe(3);
  });

  it.each(['やっぱり3', 'やっぱり、3日', 'いや3日です', '3日に直して', '訂正 3日', 'ごめんなさい、3日でした'])(
    '答えたすぐあとの「%s」は、3日への答え直し',
    (text) => {
      const first = applyAction(sat, catalog, { type: 'weekly_checkin', weekStart: MONDAY, thoughtDays: 2 }).state;
      const r = say(first, text);
      expect(answered(r.state)).toBe(3);
      expect(r.replies.map((m) => m.text)).toEqual(['答えを直しました（自分で考えた日：3日／5日。前の答えは2日）。']);
    },
  );

  it('答え直しが読み取れなかったあとも、続けて数で答え直せる', () => {
    const first = applyAction(sat, catalog, { type: 'weekly_checkin', weekStart: MONDAY, thoughtDays: 2 }).state;
    const unread = say(first, 'えーとね、ちょっとまって');
    expect(unread.replies[0].text.startsWith('すみません、うまく読み取れませんでした。')).toBe(true);
    expect(answered(say(unread.state, '3').state)).toBe(3);
  });

  it('「どちらにしますか？」が新しければ、「2」は2つ目の案。週末の質問はそのあとで数で答えられる', () => {
    const alt = say(sat, '月曜は別のに');
    const choice = lastBot(alt.state);
    const options = (choice.actions ?? []).flatMap((a) => (a.action.type === 'choose_alternative' ? [a.action] : []));
    expect(options.length).toBeGreaterThanOrEqual(2);
    const picked = say(alt.state, '2');
    expect(answered(picked.state)).toBeUndefined();
    expect(picked.state.meals.find((m) => m.date === NEXT_MONDAY)?.dishIds).toEqual(options[1].dishIds);
    const r = say(picked.state, '2');
    expect(answered(r.state)).toBe(2);
  });

  it('前日（金曜）の「どちらにしますか？」より、土曜の週末の質問が新しい：「2」は週末の質問の答え', () => {
    const fri = advanceTo(createInitialState(demoInput(), catalog, MONDAY), addDays(MONDAY, 4)).state;
    const alt = say(fri, '別のに');
    expect(lastBot(alt.state).actions?.some((a) => a.action.type === 'choose_alternative')).toBe(true);
    const friMeal = alt.state.meals.find((m) => m.date === fri.today)!;
    const s = advanceTo(alt.state, SATURDAY).state;
    const r = say(s, '2');
    expect(answered(r.state)).toBe(2);
    expect(r.state.meals.find((m) => m.date === fri.today)?.dishIds).toEqual(friMeal.dishIds);
  });

  it('「どの日の予定がなくなりましたか？」が新しければ「全部」は取り消しの答え。週末の質問が新しければ5日', () => {
    const away = say(sat, '月曜と火曜はパパが飲み会');
    const ask = say(away.state, 'パパの飲み会なくなった');
    expect(lastBot(ask.state).text.startsWith('どの日の予定がなくなりましたか？')).toBe(true);
    const all = say(ask.state, '全部');
    expect(answered(all.state)).toBeUndefined();
    expect(all.state.meals.filter((m) => m.date >= NEXT_MONDAY).every((m) => m.absentMemberIds.length === 0)).toBe(true);
    expect(answered(say(sat, '全部').state)).toBe(5);
  });

  it('提案（［替える］［そのまま］）が新しければ「はい」は提案の答え（週末の質問は答えないまま）', () => {
    const sale = say(sat, '鶏むねが安い');
    const proposal = sale.state.proposals[0];
    expect(proposal).toBeDefined();
    const yes = say(sale.state, 'はい');
    expect(yes.state.proposals.some((p) => p.id === proposal.id)).toBe(false);
    expect(answered(yes.state)).toBeUndefined();
  });

  it('土曜の「はい」は、あとに週末の質問があっても、金曜の「作りましたか？」への答え', () => {
    const r = say(sat, 'はい');
    expect(r.state.meals.find((m) => m.date === addDays(MONDAY, 4))?.status).toBe('cooked');
    expect(answered(r.state)).toBeUndefined();
  });

  it('次の週の「作りましたか？」が出たあとは、数だけの書き込みを週末の質問の答えにしない', () => {
    const tue = advanceTo(sat, addDays(NEXT_MONDAY, 1)).state;
    expect(lastBot(tue).text).toContain('作りましたか？');
    const r = say(tue, '2');
    expect(answered(r.state)).toBeUndefined();
  });

  it('2週間より前の週の質問には、数だけの書き込みでは答えない（ボタンなら答えられる）', () => {
    // 次の週は毎日［作った］を押す（答え待ちの「作りましたか？」が残らない）
    let s = sat;
    let midWeek: AppState | undefined;
    while (s.today < addDays(NEXT_MONDAY, 7)) {
      s = advanceDay(s, catalog).state;
      const meal = s.meals.find((m) => m.date === s.today);
      if (meal) s = applyAction(s, catalog, { type: 'cooked', date: s.today }).state;
      if (s.today === addDays(NEXT_MONDAY, 2)) midWeek = s;
    }
    // 次の週の水曜：まだ先週（MONDAY の週）の質問に数で答えられる
    expect(answered(say(midWeek!, '2').state)).toBe(2);
    // その次の週の月曜（2週間後）：もう数では答えない
    expect(s.today).toBe(addDays(NEXT_MONDAY, 7));
    expect(questions(s).some((q) => checkinActions(q)[0].weekStart === NEXT_MONDAY)).toBe(true);
    const late = say({ ...s, chat: s.chat.filter((m) => !(isQuestion(m) && checkinActions(m)[0].weekStart === NEXT_MONDAY)) }, '2');
    expect(answered(late.state)).toBeUndefined();
    expect(applyAction(s, catalog, { type: 'weekly_checkin', weekStart: MONDAY, thoughtDays: 2 }).state.checkins?.[0]?.thoughtDays).toBe(2);
  });

  it('AI の解釈（parsed）があっても、週末の質問への数の答えを先に読む', () => {
    const r = handleUserText(sat, catalog, '2', [{ type: 'show_today' }]);
    expect(answered(r.state)).toBe(2);
    expect(r.replies.map((m) => m.text)).toEqual(['ありがとうございます。記録しました（自分で考えた日：2日／5日）。']);
  });

  it('文字の答えは利用者の書き込み（tap なし）として残す', () => {
    const r = say(sat, '2');
    expect(r.state.chat.at(-2)).toMatchObject({ from: 'user', text: '2' });
    expect(r.state.chat.at(-2)?.tap).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('振り返りに週末の質問の答えを添える', () => {
  const sat = saturday();
  const answeredSat = applyAction(sat, catalog, { type: 'weekly_checkin', weekStart: MONDAY, thoughtDays: 2 }).state;
  const LINE = '自分で考えた日（週末の質問）：2日／5日';

  it('weeklySummary に答えを入れる（答えがなければ入れない）', () => {
    expect(weeklySummary(answeredSat, catalog, MONDAY).checkin).toEqual({ plannedDays: 5, thoughtDays: 2 });
    expect(weeklySummary(sat, catalog, MONDAY).checkin).toBeUndefined();
  });

  it('振り返りのカードの文に1行添える（答えがなければ添えない）', () => {
    expect(renderCardText(answeredSat, catalog, { kind: 'summary', weekStart: MONDAY }).split('\n')).toContain(LINE);
    expect(renderCardText(sat, catalog, { kind: 'summary', weekStart: MONDAY })).not.toContain('週末の質問');
  });

  it('次の週の献立に添える振り返りの一文にも、1行添える（LINE でも同じ文）', () => {
    const sunday = advanceDay(answeredSat, catalog).state;
    const r = handleUserText(sunday, catalog, '今週の献立');
    const week = r.replies.find((m) => m.card?.kind === 'week' && m.card.weekStart === NEXT_MONDAY)!;
    expect(week.text.split('\n')).toContain(LINE);
    const without = handleUserText(advanceDay(sat, catalog).state, catalog, '今週の献立');
    expect(without.replies.map((m) => m.text).join('\n')).not.toContain('週末の質問');
  });
});
