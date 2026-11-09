import type { AppState, ChatMessage } from './index';
import {
  addDays,
  advanceDay,
  alternativesFor,
  applyAction,
  buildShoppingLists,
  createInitialState,
  findDish,
  generateWeekMeals,
  handleUserText,
  parseMessage,
  renderCardText,
  validateCommands,
  weeklySummary,
} from './index';
import { MONDAY, catalog, demoInput } from './__fixtures__/catalog';
import { deepFreeze, dishUsesIngredient, mainOf } from './__fixtures__/helpers';

const meal = (s: AppState, date: string) => s.meals.find((m) => m.date === date)!;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

/** 鶏肉の日がなければ、先の通常の日を鶏の照り焼きにする。 */
function withChickenDay(s: AppState): { state: AppState; date: string } {
  const day = s.meals.find((m) => m.date > s.today && m.kind === 'normal' && mainOf(s, catalog, m)?.protein === 'chicken');
  if (day) return { state: s, date: day.date };
  const target = s.meals.find((m) => m.date > s.today && m.kind === 'normal')!;
  const r = applyAction(s, catalog, { type: 'choose_alternative', date: target.date, dishIds: ['teriyaki_chicken', 'cabbage_shiomomi'] });
  return { state: r.state, date: target.date };
}

function expectShortReplies(replies: ChatMessage[]) {
  for (const m of replies) {
    expect(m.from).toBe('bot');
    expect(m.text.split('\n').length).toBeLessThanOrEqual(6);
    expect(EMOJI.test(m.text)).toBe(false);
  }
}

describe('今日は無理', () => {
  const state = createInitialState(demoInput(), catalog, MONDAY);
  const original = meal(state, MONDAY);
  const r = handleUserText(state, catalog, '@きめとく 今日は無理');

  it('今日がラク日になり、元の料理は後ろ（その週のラク日）に移る', () => {
    const today = meal(r.state, MONDAY);
    expect(today.kind).toBe('raku');
    expect(findDish(r.state, catalog, today.dishIds[0])?.role).toBe('raku');
    expect(today.changedBy).toBe('replan');
    const moved = r.state.meals.find((m) => m.date > MONDAY && m.dishIds[0] === original.dishIds[0])!;
    expect(moved).toBeDefined();
    expect(moved.kind).toBe('normal');
    expect(meal(state, moved.date).kind).toBe('raku'); // もとはラク日だった日
    expect(r.state.meals.filter((m) => m.kind === 'raku')).toHaveLength(1);
  });

  it('短く、責めない返事とボタン。まだ買っていない食材には「今夜冷凍」と言わない', () => {
    expect(r.replies).toHaveLength(1);
    const reply = r.replies[0];
    expect(reply.text).toContain('ラク');
    expect(reply.text).toContain('に回します');
    expect(reply.text).not.toContain('冷凍');
    expect(reply.card).toEqual({ kind: 'meal', date: MONDAY });
    expect(reply.actions?.map((a) => a.action.type)).toContain('request_alternatives');
    expectShortReplies(r.replies);
  });

  it('利用者の発言と返事が chat に追加され、作れなかった記録が残る', () => {
    expect(r.state.chat.length).toBe(state.chat.length + 2);
    expect(r.state.chat[r.state.chat.length - 2]).toMatchObject({ from: 'user', text: '@きめとく 今日は無理' });
    expect(r.state.history).toContainEqual({ date: MONDAY, dishIds: original.dishIds, status: 'skipped', reactions: [] });
  });

  it('その週にもうラク日がなければ、来週の候補に回す', () => {
    let s = state;
    for (let i = 0; i < 3; i++) s = advanceDay(s, catalog).state; // 木曜（ラク日の水曜は過ぎた）
    const res = applyAction(s, catalog, { type: 'today_impossible', date: s.today });
    expect(meal(res.state, s.today).kind).toBe('raku');
    expect(res.replies[0].text).toContain('来週の候補に回します');
  });

  it('ボタンからでも同じように組み直す', () => {
    const res = applyAction(state, catalog, { type: 'today_impossible', date: MONDAY });
    expect(meal(res.state, MONDAY).kind).toBe('raku');
    expect(res.state.chat.at(-2)).toMatchObject({ from: 'user', text: '今日は無理' });
  });
});

describe('特売（@きめとく 鶏むねが安い）', () => {
  const { state, date } = withChickenDay(createInitialState(demoInput(), catalog, MONDAY));
  const r = handleUserText(state, catalog, '@きめとく 鶏むねが安い');

  it('鶏肉の日の差し替えが提案される', () => {
    expect(r.state.proposals).toHaveLength(1);
    const p = r.state.proposals[0];
    expect(p.kind).toBe('sale_swap');
    expect(mainOf(r.state, catalog, meal(r.state, p.date))?.protein).toBe('chicken');
    expect(p.date).toBe(date);
    expect(dishUsesIngredient(findDish(r.state, catalog, p.toDishIds[0])!, 'chicken_breast')).toBe(true);
    expect(r.replies[0].actions?.map((a) => a.label)).toEqual(['替える', 'そのまま']);
    expect(r.replies[0].text).toContain('鶏むね肉が安いので');
    expect(meal(r.state, date).dishIds).toEqual(meal(state, date).dishIds); // まだ変えない
  });

  it('承諾すると差し替え、買い物リストを作り直す', () => {
    const p = r.state.proposals[0];
    const a = applyAction(r.state, catalog, { type: 'accept_proposal', proposalId: p.id });
    expect(meal(a.state, p.date).dishIds).toEqual(p.toDishIds);
    expect(meal(a.state, p.date).changedBy).toBe('sale');
    expect(meal(a.state, p.date).reasons[0]).toBe('鶏むね肉が安かったので');
    expect(a.state.proposals).toHaveLength(0);
    const lists = a.state.shopping.filter((l) => l.items.some((i) => i.ingredientId === 'chicken_breast' && i.forDates.includes(p.date)));
    expect(lists.length).toBe(1);
    expect(a.replies[0].text).toContain('買い物リストも直しました');
  });

  it('「そのまま」なら変えない', () => {
    const p = r.state.proposals[0];
    const a = applyAction(r.state, catalog, { type: 'reject_proposal', proposalId: p.id });
    expect(meal(a.state, p.date).dishIds).toEqual(meal(r.state, p.date).dishIds);
    expect(a.state.proposals).toHaveLength(0);
  });

  it('同じたんぱく源の日も差し替えの対象（ぶりが安い → 魚の日）', () => {
    const res = handleUserText(state, catalog, 'ぶりが安い');
    const p = res.state.proposals[0];
    expect(p).toBeDefined();
    expect(mainOf(res.state, catalog, meal(res.state, p.date))?.protein).toBe('fish');
    expect(p.toDishIds[0]).toBe('buri_teri');
  });

  it('替えられる日がなければ、来週の候補として扱うと伝える', () => {
    const res = handleUserText(state, catalog, '牛乳が安い');
    expect(res.state.proposals).toHaveLength(0);
    expect(res.replies[0].text).toContain('来週の候補');
  });
});

describe('欠席（@きめとく 水曜は夫が飲み会）', () => {
  const state = createInitialState(demoInput(), catalog, MONDAY);
  const r = handleUserText(state, catalog, '@きめとく 水曜は夫が飲み会');

  it('水曜の人数が減り、買い物リストも計算し直す', () => {
    const wed = meal(r.state, '2026-11-11');
    expect(wed.absentMemberIds).toEqual(['member_2']);
    expect(wed.servings).toBe(2.2);
    expect(wed.changedBy).toBe('absence');
    const sum = (s: AppState) =>
      s.shopping.flatMap((l) => l.items).filter((i) => i.forDates.includes('2026-11-11')).reduce((a, i) => a + i.amount, 0);
    expect(sum(r.state)).toBeLessThan(sum(state));
    expect(r.replies[0].text).toContain('パパ');
    expectShortReplies(r.replies);
  });

  it('全員いない日は買い物リストから外す', () => {
    const res = handleUserText(state, catalog, '水曜は外食');
    expect(meal(res.state, '2026-11-11').servings).toBe(0);
    expect(res.state.shopping.flatMap((l) => l.items).some((i) => i.forDates.includes('2026-11-11'))).toBe(false);
  });

  it('誰か分からなければ聞き返す', () => {
    const res = handleUserText(state, catalog, '水曜はおじいちゃんがいない');
    expect(res.replies[0].text).toMatch(/分かりませんでした|読み取れませんでした|誰がいないか/);
    expect(meal(res.state, '2026-11-11').absentMemberIds).toEqual([]);
  });
});

describe('在庫', () => {
  const plain = createInitialState(
    demoInput({
      members: [
        { nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
        { nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] },
      ],
      favoriteDishIds: ['tomato_egg', 'oyakodon', 'teriyaki_chicken', 'shogayaki', 'nikujaga', 'salmon_foil'],
    }),
    catalog,
    MONDAY,
  );

  it('「卵切れた」で在庫を none にし、使う日を知らせる', () => {
    const { state } = (() => {
      const egg = plain.meals.find((m) => m.date >= plain.today && m.dishIds.some((id) => dishUsesIngredient(findDish(plain, catalog, id)!, 'egg')));
      if (egg) return { state: plain };
      const day = plain.meals.find((m) => m.kind === 'normal' && m.date > MONDAY)!;
      return { state: applyAction(plain, catalog, { type: 'choose_alternative', date: day.date, dishIds: ['tomato_egg'] }).state };
    })();
    const bought = handleUserText(state, catalog, '卵買った').state;
    expect(bought.inventory.find((i) => i.ingredientId === 'egg')?.level).toBe('plenty');
    const r = handleUserText(bought, catalog, '卵切れた');
    expect(r.state.inventory.find((i) => i.ingredientId === 'egg')?.level).toBe('none');
    expect(r.replies[0].text).toContain('卵を「なし」にしました');
    expect(r.replies[0].text).toContain('で使います');
    expect(r.state.shopping.some((l) => l.items.some((i) => i.ingredientId === 'egg'))).toBe(true);
  });

  it('「〇〇買った」で plenty になり、その分はリストから外れる', () => {
    const tofuDay = createInitialState(demoInput(), catalog, MONDAY);
    const before = tofuDay.shopping.flatMap((l) => l.items).filter((i) => i.ingredientId === 'tofu');
    const r = handleUserText(tofuDay, catalog, '豆腐買った');
    expect(r.state.inventory.find((i) => i.ingredientId === 'tofu')).toMatchObject({ level: 'plenty', acquiredOn: MONDAY });
    const after = r.state.shopping.flatMap((l) => l.items).filter((i) => i.ingredientId === 'tofu');
    expect(after.reduce((a, i) => a + i.amount, 0)).toBeLessThan(before.reduce((a, i) => a + i.amount, 0) || 1);
  });

  it('「作った」で材料の在庫が1段階下がり、◎○△のボタンが出る', () => {
    const s0 = structuredClone(plain);
    const today = meal(s0, MONDAY);
    const firstIng = findDish(s0, catalog, today.dishIds[0])!.ingredients.find((di) => !catalog.ingredientById.get(di.ingredientId)!.pantry)!;
    s0.inventory = [{ ingredientId: firstIng.ingredientId, level: 'plenty', acquiredOn: MONDAY, frozen: false }];
    const r = applyAction(s0, catalog, { type: 'cooked', date: MONDAY });
    expect(meal(r.state, MONDAY).status).toBe('cooked');
    expect(r.state.inventory[0].level).toBe('some');
    expect(r.state.history.find((h) => h.date === MONDAY)).toMatchObject({ status: 'cooked', dishIds: today.dishIds });
    expect(r.replies[0].actions?.map((a) => a.label)).toEqual(['◎', '○', '△']);
    const reacted = applyAction(r.state, catalog, { type: 'react', date: MONDAY, memberId: 'household', reaction: 'great' });
    expect(reacted.state.history.find((h) => h.date === MONDAY)?.reactions).toEqual([{ memberId: 'household', reaction: 'great' }]);
  });

  it('買い物リストのチェックは在庫に plenty で入り、返事は出さない', () => {
    const list = plain.shopping[0];
    const it0 = list.items[0];
    const r = applyAction(plain, catalog, { type: 'check_item', shoppingDate: list.date, ingredientId: it0.ingredientId, checked: true });
    expect(r.replies).toEqual([]);
    expect(r.state.chat).toEqual(plain.chat);
    expect(r.state.shopping[0].items[0].checked).toBe(true);
    expect(r.state.inventory.find((i) => i.ingredientId === it0.ingredientId)).toMatchObject({ level: 'plenty', acquiredOn: MONDAY });
    const un = applyAction(r.state, catalog, { type: 'check_item', shoppingDate: list.date, ingredientId: it0.ingredientId, checked: false });
    expect(un.state.shopping[0].items[0].checked).toBe(false);
    expect(un.state.inventory.find((i) => i.ingredientId === it0.ingredientId)).toBeUndefined();
  });
});

describe('リクエストと差し替え', () => {
  const state = createInitialState(demoInput(), catalog, MONDAY);

  it('「金曜は魚がいい」で金曜を魚にする提案を出し、承諾で替える', () => {
    const fri = '2026-11-13';
    const wasFish = mainOf(state, catalog, meal(state, fri))?.protein === 'fish';
    const r = handleUserText(state, catalog, '金曜は魚がいい');
    if (wasFish) return;
    const p = r.state.proposals[0];
    expect(p).toMatchObject({ kind: 'request', date: fri });
    expect(findDish(r.state, catalog, p.toDishIds[0])?.protein).toBe('fish');
    const a = applyAction(r.state, catalog, { type: 'accept_proposal', proposalId: p.id });
    expect(meal(a.state, fri).dishIds).toEqual(p.toDishIds);
    expect(meal(a.state, fri).changedBy).toBe('user');
  });

  it('除外に当たる料理や「要確認」の料理はリクエストでも入れない', () => {
    const egg = handleUserText(state, catalog, '金曜は親子丼がいい');
    expect(egg.state.proposals).toHaveLength(0);
    expect(egg.replies[0].text).toContain('除外の条件');
    const curry = handleUserText(state, catalog, '金曜はカレーがいい');
    expect(curry.state.proposals).toHaveLength(0);
    expect(curry.replies[0].text).toContain('要確認');
  });

  it('「別のに」で候補を2つ出し、選ぶと差し替える（changedBy: user）', () => {
    const r = applyAction(state, catalog, { type: 'request_alternatives', date: MONDAY });
    const card = r.replies[0].card;
    expect(card?.kind).toBe('alternatives');
    const options = card?.kind === 'alternatives' ? card.options : [];
    expect(options).toEqual(alternativesFor(state, catalog, MONDAY));
    expect(r.replies[0].actions).toHaveLength(2);
    const choose = r.replies[0].actions![1].action;
    const c = applyAction(r.state, catalog, choose);
    expect(meal(c.state, MONDAY).dishIds).toEqual(options[1]);
    expect(meal(c.state, MONDAY).changedBy).toBe('user');
  });

  it('選んだ料理でも、除外に当たれば差し替えない（安全はゆるめない）', () => {
    const r = applyAction(state, catalog, { type: 'choose_alternative', date: MONDAY, dishIds: ['oyakodon'] });
    expect(meal(r.state, MONDAY).dishIds).toEqual(meal(state, MONDAY).dishIds);
    expect(r.replies[0].text).toContain('除外');
  });
});

describe('表示とことば', () => {
  const state = createInitialState(demoInput(), catalog, MONDAY);

  it('今日のごはん → meal カードと［作った］［別のに］［今日は無理］', () => {
    const r = handleUserText(state, catalog, '今日のごはん');
    expect(r.replies[0].card).toEqual({ kind: 'meal', date: MONDAY });
    expect(r.replies[0].actions?.map((a) => a.label)).toEqual(['作った', '別のに', '今日は無理']);
  });

  it('今週の献立・買い物リストはカード付きで返す', () => {
    expect(handleUserText(state, catalog, '今週の献立').replies[0].card).toEqual({ kind: 'week', weekStart: MONDAY });
    const shop = handleUserText(state, catalog, '買い物リスト');
    expect(shop.replies[0].card).toEqual({ kind: 'shopping', date: MONDAY });
    expect(shop.replies.map((m) => m.card)).toContainEqual({ kind: 'shopping', date: '2026-11-11' });
  });

  it('わからない書き込みには、使える書き方の例を3つ返す（見るだけの例を1つ入れる）', () => {
    const r = handleUserText(state, catalog, 'むにゃむにゃ');
    const examples = r.replies[0].text.split('\n').filter((l) => l.startsWith('・'));
    expect(examples).toHaveLength(3);
    expect(examples).toContain('・今日のごはん');
  });

  it('あいさつ・お礼には短く返す（「読み取れませんでした」と言わない）', () => {
    for (const t of ['ありがとう', '了解', 'おつかれさま']) {
      const r = handleUserText(state, catalog, t);
      expect(r.replies, t).toHaveLength(1);
      expect(r.replies[0].text, t).not.toContain('読み取れ');
      expect(r.state.meals, t).toEqual(state.meals);
    }
  });

  it('複数の命令をまとめて処理する', () => {
    const r = handleUserText(state, catalog, '豆腐買った。水曜は夫が飲み会');
    expect(r.replies).toHaveLength(2);
    expect(meal(r.state, '2026-11-11').absentMemberIds).toEqual(['member_2']);
  });

  it('サーバーの解釈（parsed）を検証して使い、使えなければルールベースに戻る', () => {
    const ok = handleUserText(state, catalog, '（LLM）', [{ type: 'absence', date: '2026-11-11', memberRef: 'member_2' }]);
    expect(meal(ok.state, '2026-11-11').absentMemberIds).toEqual(['member_2']);
    expect(validateCommands(state, catalog, [{ type: 'sale', ingredientId: 'unicorn' }, { type: 'absence', date: '2026-02-30', memberRef: '夫' }])).toEqual([]);
    const fallback = handleUserText(state, catalog, '卵切れた', [{ type: 'out_of_stock', ingredientId: 'unicorn' }]);
    expect(fallback.state.inventory.find((i) => i.ingredientId === 'egg')?.level).toBe('none');
  });

  it('どの返事も6行以内で、絵文字を使わない', () => {
    const texts = ['今日は無理', '鶏むねが安い', '水曜は夫が飲み会', '卵切れた', '豆腐買った', '金曜は魚がいい', '今週の献立', '今日のごはん', '買い物リスト', '使い方', 'ありがとう', '別のにして'];
    for (const t of texts) expectShortReplies(handleUserText(state, catalog, t).replies);
  });

  it('renderCardText はカードをプレーンテキストにする', () => {
    const week = renderCardText(state, catalog, { kind: 'week', weekStart: MONDAY });
    expect(week.split('\n')[0]).toBe('11/9(月)〜の夕食');
    expect(week).toContain('ラク日：');
    const day = renderCardText(state, catalog, { kind: 'meal', date: MONDAY });
    expect(day).toContain('主菜：');
    expect(day).toContain('大人換算3.2人分');
    const shop = renderCardText(state, catalog, { kind: 'shopping', date: MONDAY });
    expect(shop).toContain('【');
    expect(shop).toContain('家にあるか確認：');
    expect(shop).toMatch(/□ .+/);
    const alt = renderCardText(state, catalog, { kind: 'alternatives', date: MONDAY, options: alternativesFor(state, catalog, MONDAY) });
    expect(alt.split('\n')).toHaveLength(3);
    expect(renderCardText(state, catalog, { kind: 'notice', level: 'info', lines: ['a', 'b'] })).toBe('・a\n・b');
    // 記録のない日は「0日」と数えない（PRD-1）
    const summary = renderCardText(state, catalog, { kind: 'summary', weekStart: MONDAY });
    expect(summary).toContain('5日分の献立でした');
    expect(summary).not.toContain('0日、考えずに');
  });
});

describe('純粋関数（入力の state を変更しない）', () => {
  const state = deepFreeze(createInitialState(demoInput({ plan: 'paid' }), catalog, MONDAY));
  const snapshot = JSON.stringify(state);

  it('凍結した state で、すべての公開関数が動き、state は変わらない', () => {
    const wed = '2026-11-11';
    const withProposal = handleUserText(state, catalog, '金曜は魚がいい').state;
    deepFreeze(withProposal);
    const results = [
      advanceDay(state, catalog),
      handleUserText(state, catalog, '今日は無理'),
      handleUserText(state, catalog, '鶏むねが安い。水曜は夫が飲み会。卵切れた。豆腐買った'),
      applyAction(state, catalog, { type: 'cooked', date: MONDAY }),
      applyAction(state, catalog, { type: 'not_cooked', date: MONDAY }),
      applyAction(state, catalog, { type: 'react', date: MONDAY, memberId: 'member_1', reaction: 'great' }),
      applyAction(state, catalog, { type: 'request_alternatives', date: wed }),
      applyAction(state, catalog, { type: 'choose_alternative', date: wed, dishIds: ['raku_udon'] }),
      applyAction(state, catalog, { type: 'today_impossible', date: MONDAY }),
      applyAction(state, catalog, { type: 'check_item', shoppingDate: state.shopping[0].date, ingredientId: state.shopping[0].items[0].ingredientId, checked: true }),
      applyAction(state, catalog, { type: 'regenerate_week', weekStart: MONDAY }),
      applyAction(state, catalog, { type: 'open_week' }),
      applyAction(state, catalog, { type: 'open_today' }),
      applyAction(state, catalog, { type: 'open_shopping' }),
      ...withProposal.proposals.map((p) => applyAction(withProposal, catalog, { type: 'accept_proposal', proposalId: p.id })),
    ];
    expect(results.length).toBeGreaterThan(10);
    buildShoppingLists(state, catalog);
    generateWeekMeals(state, catalog, addDays(MONDAY, 7));
    alternativesFor(state, catalog, wed);
    weeklySummary(state, catalog, MONDAY);
    renderCardText(state, catalog, { kind: 'week', weekStart: MONDAY });
    parseMessage('卵切れた', { today: state.today, members: state.household.members, catalog });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('作り直しは別の献立になる（seq を混ぜる）が、同じ state からは同じ結果', () => {
    const a = applyAction(state, catalog, { type: 'regenerate_week', weekStart: MONDAY });
    const b = applyAction(state, catalog, { type: 'regenerate_week', weekStart: MONDAY });
    expect(a.state.meals).toEqual(b.state.meals);
  });
});
