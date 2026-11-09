// 探索テスト（explorer）で見つかった問題の再発防止。本物のマスタとデモの家族（大人2・小学生1（卵アレルギー）・幼児1、
// 買い物は月・木）で、見つかったときの手順をそのまま再現する。公開API（src/engine/index.ts と src/data/index.ts）だけを使う。
import type { Action, AppState, ChatMessage, ISODate, OnboardingInput, StepResult } from '../engine/index';
import {
  addDays,
  advanceDay,
  applyAction,
  buildShoppingLists,
  checkDishSafety,
  createInitialState,
  findDish,
  formatJa,
  handleUserText,
  parseMessage,
  weekStartOf,
} from '../engine/index';
import { DEMO_ONBOARDING, defaultCatalog as catalog } from '../data/index';
import { dailyViolations } from './invariants';
import { replyProblems } from './simulation';

const MON = '2026-11-09';
const TUE = addDays(MON, 1);
const WED = addDays(MON, 2);
const THU = addDays(MON, 3);
const FRI = addDays(MON, 4);
const PAPA = 'member_2';
const HARUTO = 'member_3';

const start = (today: ISODate = MON, input: OnboardingInput = DEMO_ONBOARDING) => createInitialState(input, catalog, today);
const say = (s: AppState, text: string, opts?: { senderId?: string }) => handleUserText(s, catalog, text, undefined, opts);
const texts = (r: { replies: ChatMessage[] }) => r.replies.map((m) => m.text).join('\n');
const meal = (s: AppState, date: ISODate) => s.meals.find((m) => m.date === date)!;
const labels = (r: { replies: ChatMessage[] }) => r.replies.flatMap((m) => m.actions ?? []).map((a) => a.label);
/** 最後の返事の、その文言のボタンを押す。 */
function tap(s: AppState, label: string): StepResult {
  const msg = [...s.chat].reverse().find((m) => m.from === 'bot' && m.actions?.some((a) => a.label === label));
  const action = msg?.actions?.find((a) => a.label === label)?.action;
  expect(action, label).toBeDefined();
  return applyAction(s, catalog, action as Action);
}
/** その日の買い物リストの行を、すべてチェックする（献立日 forDay の分だけにもできる）。 */
function checkAll(s: AppState, shopDate: ISODate, forDay?: ISODate): AppState {
  let out = s;
  for (const it of s.shopping.find((l) => l.date === shopDate)?.items ?? []) {
    if (forDay && !it.forDates.includes(forDay)) continue;
    out = applyAction(out, catalog, { type: 'check_item', shoppingDate: shopDate, ingredientId: it.ingredientId, checked: true }).state;
  }
  return out;
}
const itemOf = (s: AppState, shopDate: ISODate, id: string) => s.shopping.find((l) => l.date === shopDate)?.items.find((i) => i.ingredientId === id);

describe('EXP-1 買ったあとで要る量が増えたら、足りない分だけを買う物にする', () => {
  // 欠席の日に買い物を済ませてから、欠席を取り消す
  let s = say(start(), '今日はパパとはるとがいない').state;
  s = checkAll(s, MON, MON);
  const boughtSaba = itemOf(s, MON, 'mackerel')!;
  const back = say(s, '今日はパパもはるともいる');

  it('チェックしてあった行は、チェックを外して「あと〜」と足りない分を出し、買った分をメモに残す', () => {
    expect(boughtSaba.checked).toBe(true);
    expect(boughtSaba.label).toBe('さば 1パック（2切れ）');
    const saba = itemOf(back.state, MON, 'mackerel')!;
    expect(saba.checked).toBe(false);
    expect(saba.label).toBe('さば あと1パック（2切れ）');
    expect(saba.packs).toBe(1);
    expect(saba.notes).toContain('1パック（2切れ）は買ってあります');
    expect(texts(back)).toContain('さばは、買った分では足りなくなりました。買い物リストに「あと1パック（2切れ）」と入れました。');
    expect(dailyViolations(back.state, catalog)).toEqual([]);
    expect(replyProblems(back.replies)).toEqual([]);
  });

  it('足りない分をチェックしたら、合わせて買った量になり、作り直してもチェックのまま（全部の量で出す）', () => {
    const done = applyAction(back.state, catalog, { type: 'check_item', shoppingDate: MON, ingredientId: 'mackerel', checked: true }).state;
    const rebuilt = { ...done, shopping: buildShoppingLists(done, catalog) };
    const saba = itemOf(rebuilt, MON, 'mackerel')!;
    expect(saba.checked).toBe(true);
    expect(saba.label).toBe('さば 1パック（2切れ）×2');
    // 「あと」の行のチェックを外したら、前に買った分は残る
    const undo = applyAction(done, catalog, { type: 'check_item', shoppingDate: MON, ingredientId: 'mackerel', checked: false }).state;
    const again = { ...undo, shopping: buildShoppingLists(undo, catalog) };
    expect(itemOf(again, MON, 'mackerel')!.label).toBe('さば あと1パック（2切れ）');
  });

  it('要る量が減るときは、チェックのまま（買いすぎた分を、あとで足りないと言わない）', () => {
    let t = checkAll(start(), MON, MON);
    t = say(t, '今日はパパがいない').state;
    expect(itemOf(t, MON, 'mackerel')!.checked).toBe(true);
    t = say(t, '今日はパパもいる').state;
    expect(itemOf(t, MON, 'mackerel')!.checked).toBe(true);
    expect(itemOf(t, MON, 'mackerel')!.label).toBe('さば 1パック（2切れ）×2');
  });

  it('買ったあとで家族が増えたとき（作り直し）も、足りない分を出す', () => {
    let t = checkAll(start(), MON);
    const household = structuredClone(t.household);
    household.members.push({ id: 'member_5', nickname: 'ばあば', ageBand: 'adult', role: 'other', exclusions: [] });
    t = { ...t, household };
    const r = applyAction(t, catalog, { type: 'regenerate_week', weekStart: MON, keepSafe: true });
    const today = r.state.shopping.find((l) => l.date === MON)!;
    const short = today.items.filter((i) => !i.checked);
    expect(short.length).toBeGreaterThan(0);
    for (const i of short) {
      expect(i.label).toMatch(/ あと/);
      expect(i.notes.some((n) => n.endsWith('は買ってあります'))).toBe(true);
    }
    expect(texts(r)).toContain('買った分では足りなくなりました');
    expect(dailyViolations(r.state, catalog)).toEqual([]);
  });
});

describe('EXP-2 家族と設定を変えても、今日は無理で決めた日は残す', () => {
  const s = say(start(), '今日は無理').state;
  const raku = meal(s, MON);
  const moved = s.meals.find((m) => m.date > MON && m.reasons.includes('11/9(月)の分を移しました'))!;

  it('週の作り直しでも、今日のラク日と、元の料理を移した日はそのまま（自分で替えた日として伝える）', () => {
    expect(raku.kind).toBe('raku');
    const household = structuredClone(s.household);
    household.members[3].exclusions.push({ type: 'allergen', id: 'walnut' });
    const r = applyAction({ ...s, household }, catalog, { type: 'regenerate_week', weekStart: MON });
    expect(meal(r.state, MON).dishIds).toEqual(raku.dishIds);
    expect(meal(r.state, MON).kind).toBe('raku');
    expect(meal(r.state, moved.date).dishIds).toEqual(moved.dishIds);
    expect(texts(r)).toContain(`自分で替えた日（${formatJa(MON)}・${formatJa(moved.date)}）は、そのままです。`);
  });

  it('keepSafe（家族の変更）なら、当たる料理のない変更では献立をそのままにする', () => {
    const household = structuredClone(s.household);
    household.members[3].exclusions.push({ type: 'allergen', id: 'walnut' });
    const r = applyAction({ ...s, household }, catalog, { type: 'regenerate_week', weekStart: MON, keepSafe: true });
    for (const m of s.meals.filter((x) => x.date >= MON)) expect(meal(r.state, m.date).dishIds).toEqual(m.dishIds);
    expect(texts(r)).toContain('家族の変更に当たる料理はないので、献立はそのままです');
  });

  it('keepSafe でも、出せなくなった日（安全）は作り直す', () => {
    const household = structuredClone(s.household);
    household.members[3].exclusions.push({ type: 'ingredient', id: 'mackerel' });
    const r = applyAction({ ...s, household }, catalog, { type: 'regenerate_week', weekStart: MON, keepSafe: true });
    const sabaDays = s.meals.filter((m) => m.dishIds.some((id) => findDish(s, catalog, id)?.ingredients.some((i) => i.ingredientId === 'mackerel')));
    expect(sabaDays.length).toBeGreaterThan(0);
    for (const m of r.state.meals.filter((x) => x.date >= MON)) {
      for (const id of m.dishIds) expect(checkDishSafety(findDish(r.state, catalog, id)!, r.state.household, catalog).status).not.toBe('excluded');
    }
    expect(meal(r.state, MON).dishIds).toEqual(raku.dishIds); // 当たらない日はそのまま
    expect(texts(r)).toContain('家族の変更に合わせて作り直しました');
  });
});

describe('EXP-3 今日は無理で料理を移したとき、買ってある食材は冷凍してもらい、同じ物を買い物リストに足さない', () => {
  let s = checkAll(start(), MON);
  s = advanceDay(s, catalog).state; // 火曜（買い物の日ではない）
  s = applyAction(s, catalog, { type: 'cooked', date: MON }).state;
  const r = say(s, '今日は無理');

  it('「今夜冷凍して」と言い、合いびき肉を今日のリストに入れない（冷凍した在庫として扱う）', () => {
    expect(texts(r)).toContain('合いびき肉は明日まで持たないので、今夜冷凍してください。');
    expect(texts(r)).toContain('冷凍できないときは「合いびき肉切れた」と送ってください');
    expect(r.state.shopping.filter((l) => l.date >= TUE).flatMap((l) => l.items).some((i) => i.ingredientId === 'ground_mixed')).toBe(false);
    expect(r.state.inventory.find((i) => i.ingredientId === 'ground_mixed')).toMatchObject({ frozen: true });
    expect(texts(r)).not.toMatch(/買い物リストに合いびき肉/);
  });

  it('冷凍できなかったら「合いびき肉切れた」で、リストに入る', () => {
    const out = say(r.state, '合いびき肉切れた');
    expect(out.state.shopping.filter((l) => l.date >= TUE).flatMap((l) => l.items).some((i) => i.ingredientId === 'ground_mixed')).toBe(true);
  });
});

describe('EXP-4 作らない日にしたら、その日の分を買い物リストから外す', () => {
  let s = say(start(), '今日は無理').state;
  s = say(s, '今日しんどい').state;
  const r = tap(s, '作らない日にする');

  it('今日の分（まだ買っていない物）はリストから外し、そう伝える。押したボタンの文言を残す', () => {
    expect(meal(r.state, MON).status).toBe('skipped');
    expect(r.state.shopping.filter((l) => l.date >= MON).flatMap((l) => l.items).filter((i) => i.forDates.includes(MON))).toEqual([]);
    expect(texts(r)).toContain('今日の分は、買い物リストから外しました。');
    expect(r.state.chat.filter((m) => m.from === 'user').at(-1)!.text).toBe('作らない日にする');
  });

  it('前日の確認の［作らなかった］は、今までどおり', () => {
    let t = advanceDay(start(), catalog).state;
    t = tap(t, '作らなかった').state;
    expect(t.chat.filter((m) => m.from === 'user').at(-1)!.text).toBe('作らなかった');
    expect(meal(t, MON).status).toBe('skipped');
  });
});

describe('EXP-5 日付の範囲（明日から木曜まで）は、間の日もすべて', () => {
  const ctx = (today = MON) => ({ today, members: start().household.members, catalog });
  const days = (text: string, today = MON) =>
    parseMessage(text, ctx(today)).flatMap((c) => (c.type === 'absence' ? [c.date] : []));

  it('範囲・帰ってくる日・「まで」', () => {
    expect(days('明日から木曜までパパ出張')).toEqual([TUE, WED, THU]);
    expect(days('11/10〜11/12はパパいない')).toEqual([TUE, WED, THU]);
    expect(days('パパ明日出張で木曜に帰ってくる')).toEqual([TUE, WED]);
    expect(days('パパは木曜まで出張')).toEqual([MON, TUE, WED, THU]);
    expect(days('金曜から月曜までパパ出張')).toEqual([FRI, addDays(FRI, 1), addDays(FRI, 2), addDays(FRI, 3)]);
    // 水曜に書くと「明日」と「木曜」は同じ日：帰ってくる日として読まない（明日の欠席だけ）
    expect(days('パパ明日出張で木曜に帰ってくる', WED)).toEqual([THU]);
    // 範囲でない2日は、今までどおり
    expect(days('明日と明後日はパパが出張')).toEqual([TUE, WED]);
  });

  it('範囲の欠席は水曜の量と買い物も減らし、範囲の中の土日には「献立の日ではありません」と言わない', () => {
    const r = say(start(), '明日から木曜までパパ出張');
    for (const d of [TUE, WED, THU]) expect(meal(r.state, d).absentMemberIds).toEqual([PAPA]);
    const fri = say(start(), '金曜から日曜までパパ出張');
    expect(meal(fri.state, FRI).absentMemberIds).toEqual([PAPA]);
    expect(texts(fri)).not.toContain('献立の日ではありません');
  });
});

describe('EXP-6 人を書かない「明日飲み会」「今日はいらない」', () => {
  it('送る人（senderId）がわかれば、その人の欠席にする', () => {
    const r1 = say(start(), '明日飲み会', { senderId: PAPA });
    expect(meal(r1.state, TUE).absentMemberIds).toEqual([PAPA]);
    const r2 = say(start(), '今日はいらない', { senderId: PAPA });
    expect(meal(r2.state, MON).absentMemberIds).toEqual([PAPA]);
    expect(meal(r2.state, MON).kind).toBe('normal');
    const r3 = say(start(), '明日の夕飯いらない', { senderId: PAPA });
    expect(meal(r3.state, TUE).absentMemberIds).toEqual([PAPA]);
    // 「自分」「わたし」も送る人。送る人がわからなければ、続柄「わたし」の人（ママ）
    expect(meal(say(start(), '自分は明日飲み会', { senderId: PAPA }).state, TUE).absentMemberIds).toEqual([PAPA]);
    expect(meal(say(start(), 'わたしは明日いらない').state, TUE).absentMemberIds).toEqual(['member_1']);
  });

  it('送る人がわからなければ、誰の分かを聞き返す（全員のラク日にしない。別の案も出さない）', () => {
    const s = start();
    for (const [text, date] of [
      ['今日はいらない', MON],
      ['明日の夕飯いらない', TUE],
    ] as const) {
      const r = say(s, text);
      expect(texts(r), text).toContain('誰が食べませんか？名前だけ送ってください');
      expect(meal(r.state, date)).toEqual(meal(s, date));
      expect(r.replies.some((m) => m.card?.kind === 'alternatives')).toBe(false);
    }
    // 知らない id は使わない
    expect(texts(say(s, '明日飲み会', { senderId: 'member_99' }))).toContain('誰が食べませんか？');
  });
});

describe('EXP-8 塾・部活・残業（遅くなるだけ）は欠席にしない（除外をゆるめない）', () => {
  it('人数も除外もそのまま。家で食べないときの送り方を返す', () => {
    const s = start();
    const r = say(s, '水曜ははるとが塾');
    expect(meal(r.state, WED)).toEqual(meal(s, WED));
    expect(texts(r)).toContain('はるとが遅くなるんですね');
    expect(texts(r)).toContain('「水曜ははるとはいらない」');
    expect(texts(r)).not.toContain('卵を使う料理も入ることがあります');
    for (const t of ['明日ははるとが部活で遅い', '水曜はパパが残業', 'パパは帰りが遅い']) {
      expect(parseMessage(t, { today: MON, members: s.household.members, catalog }).every((c) => c.type === 'absence' && c.tentative === 'late'), t).toBe(true);
    }
    // 「いらない」まで書けば欠席
    expect(meal(say(s, '水曜ははるとが塾でいらない').state, WED).absentMemberIds).toEqual([HARUTO]);
    // 人を書かない「今日は帰りが遅い」は、今までどおり今日は無理
    expect(parseMessage('今日は帰りが遅い', { today: MON, members: s.household.members, catalog })).toEqual([{ type: 'today_impossible' }]);
    // 給食（昼ごはん）の話は欠席にしない
    expect(meal(say(s, 'はるとは給食でカレーだった').state, MON).absentMemberIds).toEqual([]);
  });

  it('LLM が塾を欠席と読んでも、欠席にしない（ルールの「遅くなるだけ」を使う）', () => {
    const s = start();
    const r = handleUserText(s, catalog, '水曜ははるとが塾', [{ type: 'absence', date: WED, memberRef: HARUTO }]);
    expect(meal(r.state, WED).absentMemberIds).toEqual([]);
    expect(texts(r)).toContain('遅くなるんですね');
    // ほかの人の本当の欠席（飲み会）は、そのまま使う
    const both = handleUserText(s, catalog, '水曜はパパが飲み会、はるとは塾', [
      { type: 'absence', date: WED, memberRef: PAPA },
      { type: 'absence', date: WED, memberRef: HARUTO },
    ]);
    expect(meal(both.state, WED).absentMemberIds).toEqual([PAPA]);
  });
});

describe('EXP-9 アレルギーの書き込みには、「家族と設定」を案内する', () => {
  it('登録する所を伝える（お客さんの分は、材料を確かめてもらう）', () => {
    const s = start();
    for (const t of ['ハルトがエビ食べられないかも', 'はるとはえびアレルギー', 'ゆいが卵アレルギーになった', 'アレルギーの登録はどこ？']) {
      const r = say(s, t);
      expect(texts(r), t).toContain('「家族と設定」で家族ごとに登録');
      expect(texts(r), t).not.toContain('うまく読み取れませんでした');
    }
    expect(texts(say(s, '卵アレルギーの子が遊びに来る'))).toContain('お客さんの分は登録できないので');
    const help = say(s, '使い方');
    expect(texts(help)).toContain('「家族と設定」で登録します');
    expect(replyProblems(help.replies)).toEqual([]);
  });
});

describe('EXP-10 提案に「はい」「そのまま」と書いても、ボタンと同じに扱う', () => {
  const asked = say(start(), '金曜は魚がいい');
  const p = asked.state.proposals.at(-1)!;

  it('「はい」「お願いします」「替えて」で替える（画面の「@きめとく」付きでも）', () => {
    for (const t of ['はい', '@きめとく お願いします', '替えて', 'OK！']) {
      const r = say(asked.state, t);
      expect(meal(r.state, FRI).dishIds, t).toEqual(p.toDishIds);
      expect(texts(r), t).toContain('に替えました');
    }
  });

  it('「そのまま」「いいえ」「大丈夫です」でそのまま', () => {
    for (const t of ['そのまま', 'いいえ', '大丈夫です']) {
      const r = say(asked.state, t);
      expect(meal(r.state, FRI).dishIds, t).toEqual(meal(asked.state, FRI).dishIds);
      expect(texts(r), t).toContain('そのままにします');
    }
  });

  it('読み取れない書き込みでも、提案のボタンをもう一度出す', () => {
    const r = say(asked.state, 'うーん');
    expect(labels(r)).toEqual(['替える', 'そのまま']);
    const again = tap(r.state, '替える');
    expect(meal(again.state, FRI).dishIds).toEqual(p.toDishIds);
  });

  it('提案が2つあるときの「はい」は、どちらか聞いて、両方のボタンを出し直す', () => {
    const two = say(start(), '鶏むねが安い。金曜は魚がいい');
    expect(two.state.proposals.length).toBe(2);
    const r = say(two.state, 'はい');
    expect(texts(r)).toContain('どちらの案か分かりませんでした');
    expect(labels(r).filter((l) => l === '替える')).toHaveLength(2);
    expect(r.state.meals).toEqual(two.state.meals);
  });

  it('「どちらにしますか？」には「1」「2番目で」や料理の名前で答えられる', () => {
    const alt = say(start(), '明日は別のに');
    const options = alt.replies.flatMap((m) => m.actions ?? []).filter((a) => a.action.type === 'choose_alternative');
    expect(options.length).toBe(2);
    const second = options[1].action as Extract<Action, { type: 'choose_alternative' }>;
    expect(meal(say(alt.state, '2番目で').state, TUE).dishIds).toEqual(second.dishIds);
    expect(meal(say(alt.state, options[1].label).state, TUE).dishIds).toEqual(second.dishIds);
    // 「はい」ではどちらか決められないので、案のボタンを出し直す
    const unclear = say(alt.state, 'はい');
    expect(labels(unclear)).toEqual(options.map((o) => o.label));
  });
});

describe('EXP-11 「誰が食べませんか？」に名前だけで答えられる', () => {
  const asked = say(start(), '明日飲み会');

  it('「パパ」「パパです」「みんな」を、聞いた日（明日）の欠席にする', () => {
    expect(texts(asked)).toContain('明日は、誰が食べませんか？');
    expect(meal(say(asked.state, 'パパ').state, TUE).absentMemberIds).toEqual([PAPA]);
    expect(meal(say(asked.state, 'パパです').state, TUE).absentMemberIds).toEqual([PAPA]);
    expect([...meal(say(asked.state, 'パパとはると').state, TUE).absentMemberIds].sort()).toEqual([PAPA, HARUTO]);
    expect(meal(say(asked.state, 'みんな').state, TUE).servings).toBe(0);
  });

  it('LLM が今日の欠席と読んでも、聞いた日の欠席にする', () => {
    const r = handleUserText(asked.state, catalog, 'パパ', [{ type: 'absence', date: MON, memberRef: PAPA }]);
    expect(meal(r.state, TUE).absentMemberIds).toEqual([PAPA]);
    expect(meal(r.state, MON).absentMemberIds).toEqual([]);
  });
});

describe('EXP-12 日付のない取り消しで、欠席の日が2日あれば聞く', () => {
  let s = say(start(), '明日パパ飲み会').state;
  s = say(s, '木曜もパパ飲み会').state;
  const r = say(s, 'やっぱり飲み会なくなった');

  it('どちらも取り消さずに、どの日か聞く。日付だけの答え（「木曜」）で取り消す', () => {
    expect(meal(r.state, TUE).absentMemberIds).toEqual([PAPA]);
    expect(meal(r.state, THU).absentMemberIds).toEqual([PAPA]);
    expect(texts(r)).toContain('どの日の予定がなくなりましたか？');
    expect(texts(r)).toContain('「木曜はパパもいる」のように');
    const thu = say(r.state, '木曜');
    expect(meal(thu.state, THU).absentMemberIds).toEqual([]);
    expect(meal(thu.state, TUE).absentMemberIds).toEqual([PAPA]);
  });

  it('欠席の日が1日だけなら、今までどおり取り消す', () => {
    const one = say(say(start(), '明日パパ飲み会').state, 'やっぱり飲み会なくなった');
    expect(meal(one.state, TUE).absentMemberIds).toEqual([]);
  });
});

describe('EXP-13 「かも」（まだ決まっていない）は、献立を変えない', () => {
  it('欠席・みんな外食・在庫の「かも」', () => {
    const s = start();
    const r = say(s, '明日パパ飲み会かも');
    expect(meal(r.state, TUE)).toEqual(meal(s, TUE));
    expect(texts(r)).toContain('まだ決まっていないんですね');
    expect(texts(r)).toContain('「明日はパパはいらない」');
    const out = say(s, '金曜はみんなで外食するかも');
    expect(meal(out.state, FRI)).toEqual(meal(s, FRI));
    expect(texts(out)).toContain('「金曜はみんな外食」');
    const egg = say(s, '卵切れたかも');
    expect(egg.state.inventory).toEqual(s.inventory);
  });
});

describe('EXP-14 ふつうの言い方', () => {
  const s = start();
  const p = (t: string) => parseMessage(t, { today: MON, members: s.household.members, catalog });

  it('在庫・質問・絵文字・その日の献立と買い物', () => {
    expect(p('冷蔵庫にキャベツ半分ある')).toEqual([{ type: 'have', ingredientId: 'cabbage' }]);
    expect(p('キャベツ半分ある')).toEqual([{ type: 'have', ingredientId: 'cabbage' }]);
    expect(p('さばある？')).toEqual([{ type: 'have', ingredientId: 'mackerel', question: true }]);
    expect(p('サバあったっけ？')).toEqual([{ type: 'have', ingredientId: 'mackerel', question: true }]);
    expect(p('🍛食べたい')).toEqual([{ type: 'request', dishId: 'curry_rice' }]);
    expect(p('今日の夜ごはんなんだっけ')).toEqual([{ type: 'show_today' }]);
    expect(p('明日の夕飯なに？')).toEqual([{ type: 'show_today', date: TUE }]);
    expect(p('明日何買えばいい？')).toEqual([{ type: 'show_shopping', date: TUE }]);
    // 「時間が足りない」は、たら（魚）にしない
    expect(p('時間がたらない')).not.toContainEqual(expect.objectContaining({ ingredientId: 'cod' }));
  });

  it('返事：明日の献立は明日の分だけ、明日の買い物は明日の分、おまかせ、時間の短い料理', () => {
    const tue = say(s, '明日の夕飯なに？');
    expect(tue.replies).toHaveLength(1);
    expect(tue.replies[0].card).toEqual({ kind: 'meal', date: TUE });
    const shop = say(s, '明日何買えばいい？');
    expect(texts(shop)).toContain('明日は買い物の日ではありません。');
    expect(texts(shop)).toContain('明日の夕食の材料は、今日の買い物リストに入っています');
    expect(texts(say(s, '何でもいい'))).toContain('献立はこのまま進めます');
    const quick = say(s, '今日は20分で作れるのがいい');
    expect(labels(quick)).toEqual(['今日は無理', '別のに']);
    // LLM の結果の日付も使う（読めない日付なら、今日の分）
    const llm = handleUserText(s, catalog, '明日の夕飯なに？', [{ type: 'show_today', date: TUE }]);
    expect(llm.replies[0].card).toEqual({ kind: 'meal', date: TUE });
    const bad = handleUserText(s, catalog, '夕飯なに？', [{ type: 'show_today', date: '2026-13-01' }]);
    expect(bad.replies[0].card).toEqual({ kind: 'meal', date: MON });
  });
});

describe('EXP-15 別の案が1つだけなら、「この案にしますか？」と聞いて［そのまま］も出す', () => {
  const own: OnboardingInput = {
    members: [
      { nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
      { nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] },
      { nickname: 'そうた', ageBand: 'child', role: 'child', exclusions: [] },
      { nickname: 'めい', ageBand: 'preschool', role: 'child', exclusions: [{ type: 'allergen', id: 'egg' }] },
    ],
    shoppingWeekdays: [3, 6],
    favoriteDishIds: ['karaage', 'nikujaga', 'shogayaki', 'salmon_shioyaki', 'curry_rice', 'mabo_tofu', 'chicken_teriyaki', 'buri_teriyaki'],
    customFavoriteNames: ['茶碗蒸し', 'ばあばの卵とじうどん'],
    plan: 'free',
  };
  const s = say(start(TUE, own), '今日は無理').state;
  const r = tap(s, 'ほかの案');

  it('文言とボタン。押したボタンの文言（ほかの案）を残す', () => {
    expect(texts(r)).toContain('今日の別の案は、これだけです。この案にしますか？');
    expect(texts(r)).not.toContain('どちらにしますか');
    expect(labels(r)).toEqual(['替える', 'そのまま']);
    expect(r.state.chat.filter((m) => m.from === 'user').at(-1)!.text).toBe('ほかの案');
  });

  it('［替える］か「はい」で替え、［そのまま］ならそのまま', () => {
    const p = r.state.proposals.at(-1)!;
    expect(p.kind).toBe('alternative');
    const yes = say(r.state, 'はい');
    expect(meal(yes.state, TUE).dishIds).toEqual(p.toDishIds);
    expect(meal(yes.state, TUE).changedBy).toBe('user');
    const no = tap(r.state, 'そのまま');
    expect(meal(no.state, TUE).dishIds).toEqual(meal(r.state, TUE).dishIds);
  });
});

describe('EXP-20 日付のないリクエストは、特売で替えた日を選ばない', () => {
  it('「今週カレー食べたい」は、鶏むねにした日ではない日に出す', () => {
    let s = say(start(), '鶏むねが安い').state;
    const sale = s.proposals.at(-1)!;
    s = applyAction(s, catalog, { type: 'accept_proposal', proposalId: sale.id }).state;
    expect(meal(s, sale.date).changedBy).toBe('sale');
    const r = say(s, '今週カレー食べたい');
    const req = r.state.proposals.at(-1)!;
    expect(req.date).not.toBe(sale.date);
    expect(weekStartOf(req.date)).toBe(MON);
  });
});
