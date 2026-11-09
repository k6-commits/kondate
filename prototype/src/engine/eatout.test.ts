// みんな外で食べる日（「金曜はみんな外食」）は、夕食なしの日として扱う。
// 目印は eatingMembers(household, meal.absentMemberIds) が空であること（新しい status・欄・カードは足さない）。
// 献立はそのまま残し、「金曜はみんないる」「金曜はやっぱり家で食べる」で、量と買い物リストごと戻る。
import type { AppState, ChatMessage } from './index';
import {
  addDays,
  advanceDay,
  alternativesFor,
  applyAction,
  createInitialState,
  handleUserText,
  renderCardText,
  weeklySummary,
} from './index';
import { makeEnv } from './planner';
import { MONDAY, catalog, demoInput } from './__fixtures__/catalog';

const TUE = addDays(MONDAY, 1);
const WED = addDays(MONDAY, 2);
const THU = addDays(MONDAY, 3);
const FRI = addDays(MONDAY, 4);
const SAT = addDays(MONDAY, 5);
const NO_DINNER = '夕食なし（みんな外で食べる）';

const meal = (s: AppState, date: string) => s.meals.find((m) => m.date === date)!;
const texts = (replies: ChatMessage[]) => replies.map((m) => m.text).join('\n');
const card = (s: AppState, date: string) => renderCardText(s, catalog, { kind: 'meal', date });
/** これからの買い物リストの、その日の分の行。 */
const listed = (s: AppState, date: string) =>
  s.shopping.filter((l) => l.date >= s.today).flatMap((l) => l.items.filter((i) => i.forDates.includes(date)).map((i) => `${l.date}|${i.label}`));
const dayButtons = (replies: ChatMessage[]) =>
  replies.flatMap((m) => m.actions ?? []).filter((a) => ['cooked', 'not_cooked', 'request_alternatives', 'today_impossible'].includes(a.action.type));

describe('みんな外で食べる日（「金曜はみんな外食」）', () => {
  const s0 = createInitialState(demoInput(), catalog, MONDAY);
  const out = handleUserText(s0, catalog, '金曜はみんな外食');
  const fri = meal(out.state, FRI);

  it('献立は残し（status も planned のまま）、量は0、買い物リストから外す。返事で戻し方を伝える', () => {
    expect(fri.dishIds).toEqual(meal(s0, FRI).dishIds);
    expect(fri.status).toBe('planned');
    expect(fri.servings).toBe(0);
    expect(listed(s0, FRI).length).toBeGreaterThan(0);
    expect(listed(out.state, FRI)).toEqual([]);
    expect(out.replies).toHaveLength(1);
    expect(out.replies[0].text).toBe(
      '了解です。11/13(金)はみんな外で食べるんですね。夕食の分は買い物リストから外しました。\n予定が変わったら「金曜はみんないる」と送ってください。',
    );
    expect(dayButtons(out.replies)).toEqual([]);
  });

  it('カードと週の献立の文は「夕食なし」：量（0人分）・作り方・理由・メモは出さず、もとの献立だけ添える', () => {
    const text = card(out.state, FRI);
    expect(text).toBe(`11/13(金)の夕食\n${NO_DINNER}\nもとの献立：鶏の照り焼き／小松菜のおひたし`);
    const week = renderCardText(out.state, catalog, { kind: 'week', weekStart: MONDAY });
    expect(week).toContain(`金 ${NO_DINNER}`);
    expect(week).not.toContain('鶏の照り焼き');
    // ほかの日は今までどおり
    expect(card(out.state, THU)).toContain('4人分（大人換算3.2）');
  });

  it('作る・替える頼みは受けず、夕食なしの日だと伝える（別のに・候補・リクエスト・特売・在庫）', () => {
    const noDinner = '11/13(金)は、みんな外で食べる日です（夕食なし）。\n予定が変わったら「金曜はみんないる」と送ってください。';
    expect(alternativesFor(out.state, catalog, FRI)).toEqual([]);
    expect(texts(applyAction(out.state, catalog, { type: 'request_alternatives', date: FRI }).replies)).toBe(noDinner);
    expect(texts(handleUserText(out.state, catalog, '金曜は別のに').replies)).toBe(noDinner);
    expect(texts(handleUserText(out.state, catalog, '金曜は生姜焼きがいい').replies)).toBe(noDinner);
    const chosen = applyAction(out.state, catalog, { type: 'choose_alternative', date: FRI, dishIds: ['shogayaki'] });
    expect(texts(chosen.replies)).toBe(noDinner);
    expect(meal(chosen.state, FRI).dishIds).toEqual(fri.dishIds);
    // 特売・在庫の提案は、ほかの日に（鶏ももは金曜の照り焼きで使う食材）
    const sale = handleUserText(out.state, catalog, '鶏むねが安い');
    expect(sale.state.proposals.map((p) => p.date)).not.toContain(FRI);
    const have = handleUserText(out.state, catalog, '鶏もも買った');
    expect(texts(have.replies)).not.toContain('11/13(金)');
  });

  it('週を作り直しても、みんな外で食べる日は作り直さない（家で食べることになったら、もとの献立に戻る）', () => {
    const regen = applyAction(out.state, catalog, { type: 'regenerate_week', weekStart: MONDAY });
    expect(regen.replies[0].text).toBe('11/9(月)からの献立を作り直しました。');
    expect(meal(regen.state, FRI)).toEqual(fri);
    expect(renderCardText(regen.state, catalog, { kind: 'week', weekStart: MONDAY })).toContain(`金 ${NO_DINNER}`);
    const back = handleUserText(regen.state, catalog, '金曜はみんないる');
    expect(meal(back.state, FRI).dishIds).toEqual(fri.dishIds);
    expect(meal(back.state, FRI).servings).toBe(3.2);
  });

  it('作り直す週のこれからの日が、みんな外で食べる日だけなら、作り直さずにそう伝える', () => {
    const friday = handleUserText(createInitialState(demoInput(), catalog, FRI), catalog, '今日はみんな外食').state;
    const r = applyAction(friday, catalog, { type: 'regenerate_week', weekStart: MONDAY });
    expect(r.replies.map((m) => m.text)).toEqual([
      'この週のこれからの日は、どれもみんな外で食べる日（夕食なし）なので、作り直す献立はありません。',
    ]);
    expect(r.state.meals).toEqual(friday.meals);
  });

  it('過ぎた買い物日のリストに残る、その日の分は「まだチェックしていない物」に数えない（戻せば、また数える）', () => {
    let s = s0;
    for (let i = 0; i < 3; i++) s = advanceDay(s, catalog).state; // 木曜。水曜のリストに、木曜と金曜の分がある
    const left = (st: AppState) => handleUserText(st, catalog, '買い物リスト').replies[0].text;
    expect(left(s)).toContain('11/11(水)のリストで、まだチェックしていない物があります（5品）。');
    const away = handleUserText(s, catalog, '金曜はみんな外食').state;
    expect(left(away)).toContain('（3品）');
    expect(left(handleUserText(away, catalog, '金曜はみんないる').state)).toContain('（5品）');
  });

  it('その日の前の提案は、みんな外で食べることになったら片づける', () => {
    const proposed = handleUserText(s0, catalog, '金曜は生姜焼きがいい');
    const [p] = proposed.state.proposals;
    expect(p.date).toBe(FRI);
    const later = handleUserText(proposed.state, catalog, '金曜はみんな外食');
    expect(later.state.proposals).toEqual([]);
    expect(texts(applyAction(later.state, catalog, { type: 'accept_proposal', proposalId: p.id }).replies)).toBe('その提案は、もう使えません。');
  });

  it('翌日に「作りましたか？」と聞かず、振り返りの献立日にも数えない。過ぎたら、その主菜はまた献立に入れられる', () => {
    let s = out.state;
    // 金曜の前は、これからの予定として数える（家で食べることになったら戻るので）
    expect(makeEnv(s, catalog, new Set(), 1).eaten.get('teriyaki_chicken')).toContain(FRI);
    for (const d of [TUE, WED, THU, FRI, SAT]) {
      const step = advanceDay(s, catalog);
      s = step.state;
      expect(s.today).toBe(d);
      const asked = step.replies.filter((m) => m.actions?.some((a) => a.action.type === 'cooked'));
      if (d === SAT) expect(asked).toEqual([]);
      else expect(asked).toHaveLength(1);
    }
    expect(meal(s, FRI).status).toBe('planned');
    expect(s.history.filter((r) => r.date === FRI)).toEqual([]);
    const summary = weeklySummary(s, catalog, MONDAY);
    expect(summary.plannedDays).toBe(4);
    expect(summary.skippedOrImpossible).toBe(0);
    expect(summary.unconfirmedDays).toBe(4); // 月〜木は記録なし。金曜（外食）は数えない
    expect(renderCardText(s, catalog, { kind: 'summary', weekStart: MONDAY })).toContain('4日分の献立でした');
    expect(makeEnv(s, catalog, new Set(), 1).eaten.get('teriyaki_chicken') ?? []).not.toContain(FRI);
    // 過ぎた日の「作った」「作らなかった」は記録しない
    for (const action of [{ type: 'cooked', date: FRI }, { type: 'not_cooked', date: FRI }] as const) {
      const r = applyAction(s, catalog, action);
      expect(r.replies[0].text).toBe('11/13(金)は、みんな外で食べる日でした（夕食なし）。このままで大丈夫です。');
      expect(meal(r.state, FRI).status).toBe('planned');
      expect(r.state.history).toEqual(s.history);
    }
  });

  it('今日がみんな外で食べる日なら、今日のごはん・今日は無理・作った・◎○△も「夕食なし」で受ける', () => {
    const today = handleUserText(s0, catalog, '今日はみんな外食');
    expect(today.replies[0].text).toContain('予定が変わったら「今日はみんないる」と送ってください。');
    const shown = handleUserText(today.state, catalog, '今日のごはん');
    expect(shown.replies[0].text).toBe(`今日は${NO_DINNER}です。\n予定が変わったら「今日はみんないる」と送ってください。`);
    expect(dayButtons(shown.replies)).toEqual([]);
    const impossible = handleUserText(today.state, catalog, '今日は無理');
    expect(impossible.replies[0].text).toBe('今日は、みんな外で食べる日です（夕食なし）。このままで大丈夫です。');
    expect(impossible.state.meals).toEqual(today.state.meals);
    const cooked = applyAction(today.state, catalog, { type: 'cooked', date: MONDAY });
    expect(cooked.replies[0].text).toBe(
      '今日は、みんな外で食べる日にしています（夕食なし）。\n家で食べたなら、先に「今日はみんないる」と送ってください。',
    );
    expect(meal(cooked.state, MONDAY).status).toBe('planned');
    const react = applyAction(today.state, catalog, { type: 'react', date: MONDAY, memberId: 'household', reaction: 'great' });
    expect(react.state.history).toEqual([]);
    // 日付のない「別のに」は、次の献立の日へ
    const alt = handleUserText(today.state, catalog, '別のに');
    expect(alt.replies[0].card).toMatchObject({ kind: 'alternatives', date: TUE });
  });

  it('有料版：その日の「今日の夕食」と、前日の解凍の連絡を配信しない', () => {
    const paid = handleUserText(createInitialState(demoInput({ plan: 'paid' }), catalog, MONDAY), catalog, '牛こま冷凍した').state;
    const pushesUntilFriday = (start: AppState) => {
      let s = start;
      const pushes: string[] = [];
      for (let i = 0; i < 4; i++) {
        const step = advanceDay(s, catalog);
        s = step.state;
        pushes.push(...step.replies.filter((m) => m.push).map((m) => `${s.today} ${m.text.split('\n')[0]}`));
      }
      return pushes;
    };
    // 家で食べるなら、木曜に解凍の連絡、金曜に今日の夕食が届く
    const home = pushesUntilFriday(paid);
    expect(home).toContain(`${THU} 明日の肉じゃが用に、牛こま切れ肉を冷凍室から冷蔵室へ移しておいてください。`);
    expect(home.some((p) => p.startsWith(`${FRI} 今日は肉じゃが`))).toBe(true);
    const away = pushesUntilFriday(handleUserText(paid, catalog, '金曜はみんな外食').state);
    expect(away.filter((p) => p.includes('肉じゃが'))).toEqual([]);
    expect(away.filter((p) => p.startsWith(FRI))).toEqual([]);
  });

  it('「金曜はみんないる」「金曜はやっぱり家で食べる」「金曜の外食なくなった」で、量・買い物リストごと戻る', () => {
    for (const undo of ['金曜はみんないる', '金曜はやっぱり家で食べる', '金曜の外食なくなった', 'やっぱり金曜は外食しない']) {
      const r = handleUserText(out.state, catalog, undo);
      const back = meal(r.state, FRI);
      expect(back.absentMemberIds, undo).toEqual([]);
      expect(back.servings, undo).toBe(3.2);
      expect(back.dishIds, undo).toEqual(fri.dishIds);
      expect(listed(r.state, FRI), undo).toEqual(listed(s0, FRI));
      expect(r.replies[0].text, undo).toBe(
        '了解です。11/13(金)はみんな家で食べるんですね（4人分、大人換算3.2）。\n夕食は鶏の照り焼き／小松菜のおひたしです。\n買い物リストも直しました。',
      );
      expect(card(r.state, FRI), undo).toContain('4人分（大人換算3.2）');
    }
    // 1人だけ戻る
    const papa = handleUserText(out.state, catalog, '金曜はパパがいる');
    expect(meal(papa.state, FRI).servings).toBe(1);
    expect(papa.replies[0].text).toContain('11/13(金)はパパが家で食べるんですね（1人分）。');
  });

  it('日付を書いた「〇曜はみんないる」は、ほかの日の欠席を取り消さない（日付のない「飲み会なくなった」は探す）', () => {
    const papaAway = handleUserText(s0, catalog, '水曜はパパが飲み会').state;
    const r = handleUserText(papaAway, catalog, '金曜はみんないる');
    expect(meal(r.state, WED).absentMemberIds).toEqual(['member_2']);
    expect(r.replies[0].text).toBe('みんなは、11/13(金)も食べる予定になっています。このままで大丈夫です。');
    const found = handleUserText(papaAway, catalog, '飲み会なくなった');
    expect(meal(found.state, WED).absentMemberIds).toEqual([]);
    // 日付のない「外食なくなった」は、みんな外で食べる日を先に選ぶ
    const both = handleUserText(papaAway, catalog, '金曜はみんな外食').state;
    const cancel = handleUserText(both, catalog, '外食なくなった');
    expect(meal(cancel.state, FRI).absentMemberIds).toEqual([]);
    expect(meal(cancel.state, WED).absentMemberIds).toEqual(['member_2']);
  });
});
