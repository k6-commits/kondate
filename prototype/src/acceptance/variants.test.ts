// E1・E2 と探索テスト（explorer）の指摘を、別の言い方・別の曜日・別の家族で確かめたときに見つかった問題の再発防止。
// 本物のマスタとデモの家族（大人2・小学生1（卵アレルギー）・幼児1、買い物は月・木）。公開API だけを使う。
import type { Action, AppState, ChatMessage, ISODate, OnboardingInput, ParsedCommand, StepResult } from '../engine/index';
import {
  addDays,
  advanceDay,
  applyAction,
  buildShoppingLists,
  checkDishSafety,
  createInitialState,
  findDish,
  handleUserText,
  parseMessage,
  validateCommands,
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
const say = (s: AppState, text: string, parsed?: ParsedCommand[]) => handleUserText(s, catalog, text, parsed);
const texts = (r: { replies: ChatMessage[] }) => r.replies.map((m) => m.text).join('\n');
const meal = (s: AppState, date: ISODate) => s.meals.find((m) => m.date === date)!;
const labels = (r: { replies: ChatMessage[] }) => r.replies.flatMap((m) => m.actions ?? []).map((a) => a.label);
function tap(s: AppState, label: string): StepResult {
  const msg = [...s.chat].reverse().find((m) => m.from === 'bot' && m.actions?.some((a) => a.label === label));
  const action = msg?.actions?.find((a) => a.label === label)?.action;
  expect(action, label).toBeDefined();
  return applyAction(s, catalog, action as Action);
}
const absenceDays = (text: string, today = MON) =>
  parseMessage(text, { today, members: start().household.members, catalog }).flatMap((c) =>
    c.type === 'absence' && !c.cancel && !c.tentative ? [`${c.date}:${c.memberRef}`] : [],
  );

describe('EXP-2 の別の場合：今日は無理で決めたラク日の料理が、家族の変更で出せなくなったとき', () => {
  // しらす丼（しらす）は、えびのアレルギーに当たる（しらすにえびが混ざることがある）
  const s = say(start(), '今日は無理').state;
  const household = structuredClone(s.household);
  household.members[2].exclusions.push({ type: 'allergen', id: 'shrimp' });
  const changed = { ...s, household };

  it('前提：今日はラク日で、その料理がえびのアレルギーに当たる', () => {
    expect(meal(s, MON).kind).toBe('raku');
    expect(meal(s, MON).changedBy).toBe('user');
    const unsafe = meal(s, MON).dishIds.some((id) => checkDishSafety(findDish(s, catalog, id)!, household, catalog).status !== 'ok');
    expect(unsafe).toBe(true);
  });

  for (const keepSafe of [false, true]) {
    it(`作り直しても、ふつうの献立にせず、ラク日のまま料理だけを替える（keepSafe: ${keepSafe}）`, () => {
      const r = applyAction(changed, catalog, { type: 'regenerate_week', weekStart: MON, ...(keepSafe ? { keepSafe } : {}) });
      const today = meal(r.state, MON);
      expect(today.kind).toBe('raku');
      expect(today.changedBy).toBe('user');
      for (const id of today.dishIds) expect(checkDishSafety(findDish(r.state, catalog, id)!, r.state.household, catalog).status).toBe('ok');
      expect(texts(r)).toContain('11/9(月)は、ラク日のまま料理を替えました。');
      expect(dailyViolations(r.state, catalog)).toEqual([]);
      // もう一度作り直しても、ラク日のまま（家族が決めた日として残る）
      const again = applyAction(r.state, catalog, { type: 'regenerate_week', weekStart: MON });
      expect(meal(again.state, MON).dishIds).toEqual(today.dishIds);
    });
  }
});

describe('EXP-5 の別の言い方：曜日だけの範囲・期間・「まで」と帰る日・別の節の帰る日', () => {
  it('間の日もすべて欠席にする', () => {
    expect(absenceDays('水〜金はパパいない')).toEqual([`${WED}:パパ`, `${THU}:パパ`, `${FRI}:パパ`]);
    expect(absenceDays('水・金はパパいない')).toEqual([`${WED}:パパ`, `${FRI}:パパ`]);
    expect(absenceDays('明日から木曜パパ出張')).toEqual([`${TUE}:パパ`, `${WED}:パパ`, `${THU}:パパ`]);
    expect(absenceDays('パパは水曜まで出張で木曜に帰る')).toEqual([`${MON}:パパ`, `${TUE}:パパ`, `${WED}:パパ`]);
    expect(absenceDays('明日から3日間パパ出張')).toEqual([`${TUE}:パパ`, `${WED}:パパ`, `${THU}:パパ`]);
    expect(absenceDays('パパは明日から2泊で出張')).toEqual([`${TUE}:パパ`, `${WED}:パパ`]);
    // 「2泊3日」の「3日」を、来月3日の日付にしない
    expect(absenceDays('明日から2泊3日の出張でパパいない')).toEqual([`${TUE}:パパ`, `${WED}:パパ`]);
    // 帰ってくる日を、別の節に書いた
    expect(absenceDays('パパ出張、木曜に帰る')).toEqual([`${MON}:パパ`, `${TUE}:パパ`, `${WED}:パパ`]);
  });

  it('範囲でない言い方は、今までどおり', () => {
    expect(absenceDays('明日と木曜はパパいない')).toEqual([`${TUE}:パパ`, `${THU}:パパ`]);
    expect(absenceDays('明日から木曜までパパ出張')).toEqual([`${TUE}:パパ`, `${WED}:パパ`, `${THU}:パパ`]);
    // 「ひと月」の「月」を月曜にしない（火曜に書いても、今日の欠席）
    expect(absenceDays('ひと月はパパいない', TUE)).toEqual([`${TUE}:パパ`]);
    // 料理を移す話は、範囲にしない
    expect(parseMessage('カレーを明日から木曜に変えて', { today: MON, members: start().household.members, catalog })).toEqual([
      { type: 'request', dishId: 'curry_rice', date: TUE },
    ]);
  });
});

describe('EXP-10 の別の言い方：提案への「はい、お願いします」、お礼のあとのボタン', () => {
  const asked = say(start(TUE), '金曜は魚がいい');

  it('読点で区切った答え（はい、お願いします／ありがとう、それで）でも替える', () => {
    for (const t of ['はい、お願いします', '@きめとく ありがとう、それで', 'うん、それで']) {
      const r = say(asked.state, t);
      expect(texts(r), t).toContain('に替えました');
    }
    expect(texts(say(asked.state, 'いいえ、大丈夫です'))).toContain('そのままにします');
    // はいといいえが混ざったら、決めない（ボタンを出し直す）
    const mixed = say(asked.state, 'いや、それで');
    expect(meal(mixed.state, FRI)).toEqual(meal(asked.state, FRI));
    expect(labels(mixed)).toEqual(['替える', 'そのまま']);
  });

  it('「ありがとう」だけのときも、提案のボタンを出し直す（そのあとの「はい」で替えられる）', () => {
    const thanks = say(asked.state, 'ありがとう');
    expect(thanks.replies[0].text.startsWith('どういたしまして。')).toBe(true);
    expect(labels(thanks)).toEqual(['替える', 'そのまま']);
    const yes = say(thanks.state, 'はい');
    expect(texts(yes)).toContain('に替えました');
    // 提案がなければ、今までどおり
    expect(texts(say(start(), 'ありがとう'))).toBe('どういたしまして。困ったときは、いつでも送ってください。');
  });
});

describe('EXP-13 の別の言い方：「未定」を別の節に書いた', () => {
  it('「明日の飲み会、行くかどうか未定」は聞き返さず、献立も変えない', () => {
    const s = start();
    const r = say(s, '明日の飲み会、行くかどうか未定');
    expect(texts(r)).toContain('まだ決まっていないんですね');
    expect(texts(r)).not.toContain('誰が食べませんか');
    expect(r.state.meals).toEqual(s.meals);
    // ほかの用件の「かも」は、欠席を決まっていないことにしない
    expect(absenceDays('明日パパ飲み会、卵切れたかも')).toEqual([`${TUE}:パパ`]);
  });
});

describe('給食の話（あったこと）は、リクエストにも欠席にもしない', () => {
  it('「はるとは今日給食でカレーだった」で、カレーの案を出さない', () => {
    const s = start();
    for (const t of ['はるとは今日給食でカレーだった', '今日の給食カレーだったって', '今日はカレーだった']) {
      const r = say(s, t);
      expect(r.state.meals, t).toEqual(s.meals);
      expect(r.state.proposals, t).toEqual([]);
    }
    expect(parseMessage('明日はカレーがいい', { today: MON, members: s.household.members, catalog })).toEqual([
      { type: 'request', dishId: 'curry_rice', date: TUE },
    ]);
  });
});

describe('E2 の別の場合：1つの書き込みで何人かの欠席', () => {
  it('同じ日の欠席は1つの返事にまとめる（前の返事の人数と、カードが食い違わない）', () => {
    const r = say(start(), '今日はパパとはるとがいない');
    expect(r.replies).toHaveLength(1);
    expect(r.replies[0].text).toContain('今日はパパ・はるとの分を減らしました（2人分、大人換算1.5）。');
    expect(r.replies[0].text).toContain('はるとがいない日なので、卵を使う料理も入ることがあります。');
    expect(replyProblems(r.replies)).toEqual([]);
  });

  it('みんなの名前を書いて、みんな外で食べる日になったら、夕食なしの返事を1つだけ', () => {
    const r = say(start(), '金曜はママとパパとはるととゆいがいない');
    expect(r.replies).toHaveLength(1);
    expect(r.replies[0].text).toContain('11/13(金)はみんな外で食べるんですね。');
    expect(r.replies[0].text).not.toMatch(/人分/);
    const back = say(r.state, '金曜はパパとはるともいる');
    expect(back.replies).toHaveLength(1);
    expect(back.replies[0].text).toContain('11/13(金)はパパ・はるとが家で食べるんですね');
    expect([...meal(back.state, FRI).absentMemberIds].sort()).toEqual(['member_1', 'member_4']);
  });

  it('日付を書いた取り消し（「今日は家で食べる」）は、ほかの日のみんな外で食べる日を戻さない', () => {
    const out = say(start(TUE), '金曜はみんな外食').state;
    for (const t of ['今日は家で食べる', '今日はみんないる']) {
      const r = say(out, t);
      expect(meal(r.state, FRI).absentMemberIds, t).toEqual(meal(out, FRI).absentMemberIds);
      expect(texts(r), t).toContain('今日も食べる予定になっています');
    }
    // 日付を書かなければ、今までどおり、その日を戻す
    expect(meal(say(out, '家で食べる').state, FRI).absentMemberIds).toEqual([]);
  });

  it('家族が1人なら、人を書かない「今日はいらない」はその人のこと（聞き返さない）', () => {
    const solo: OnboardingInput = {
      members: [{ nickname: 'わたし', ageBand: 'adult', role: 'parent', exclusions: [] }],
      shoppingWeekdays: [6],
      favoriteDishIds: [],
      customFavoriteNames: [],
      plan: 'free',
    };
    const r = say(start(TUE, solo), '今日はいらない');
    expect(texts(r)).not.toContain('誰が食べませんか');
    expect(texts(r)).toContain('今日は外で食べるんですね。');
    expect(meal(r.state, TUE).servings).toBe(0);
  });
});

describe('E1 の別の場合：頼まれたとおりだと答えた日を、同じ返事の特売の案で替えない', () => {
  it('「カレー食べたい。鶏むねが安い」（明日はもうキーマカレー）で、キーマカレーを鶏むねの料理に替える案を出さない', () => {
    const r = say(start(), 'カレー食べたい。鶏むねが安い');
    expect(texts(r)).toContain('明日は、もうキーマカレーの予定です。');
    expect(r.state.proposals.some((p) => p.date === TUE)).toBe(false);
    expect(texts(r)).toContain('上のとおりキーマカレーのままにします');
    // 特売だけなら、今までどおり明日の案を出す
    expect(say(start(), '鶏むねが安い').state.proposals.map((p) => p.date)).toEqual([TUE]);
  });
});

describe('前日の確認への答えの読みちがいを防ぐ', () => {
  it('これからの日の話（「明日は出前にする」）で、今日を「作らなかった」にしない（買い物リストもそのまま）', () => {
    const s = start(TUE);
    for (const t of ['明日は出前にする', '金曜は出前']) {
      const r = say(s, t);
      expect(r.state.meals, t).toEqual(s.meals);
      expect(r.state.shopping, t).toEqual(s.shopping);
    }
  });

  it('LLM が「昨日は無理だった」を今日は無理と読んでも、昨日の記録にする（今日は変えない）', () => {
    const s = advanceDay(start(), catalog).state; // 火曜。月曜の「作りましたか？」
    const r = say(s, '昨日は無理だった', [{ type: 'today_impossible' }]);
    expect(meal(r.state, MON).status).toBe('skipped');
    expect(meal(r.state, TUE)).toEqual(meal(s, TUE));
  });
});

describe('LLM の欠席の memberRef（member の id）を確かめる', () => {
  it('家族にいない id は使わず、いくつか書かれた id は1人ずつにする', () => {
    const s = start();
    expect(validateCommands(s, catalog, [{ type: 'absence', date: WED, memberRef: 'member_9' }])).toEqual([]);
    expect(validateCommands(s, catalog, [{ type: 'absence', date: WED, memberRef: 'member_2とmember_3' }])).toEqual([
      { type: 'absence', date: WED, memberRef: PAPA },
      { type: 'absence', date: WED, memberRef: HARUTO },
    ]);
    // 返事に id を出さない
    const r = say(s, '水曜はばあばがいない', [{ type: 'absence', date: WED, memberRef: 'member_9' }]);
    expect(texts(r)).not.toMatch(/member_/);
  });

  it('書き方を変えた id（member-9・メンバー9・member９）、数字のない「member」、家族にいない id を含む欠席は使わない（画面の checkMemberRefs と同じ）', () => {
    const s = start();
    for (const memberRef of ['member-9', 'メンバー9', 'member９', 'member', 'メンバー', 'member_2とmember_9']) {
      expect(validateCommands(s, catalog, [{ type: 'absence', date: WED, memberRef }])).toEqual([]);
      const r = say(s, '水曜はばあばがいない', [{ type: 'absence', date: WED, memberRef }]);
      expect(texts(r)).not.toMatch(/member|メンバー/i);
    }
    // 書き方を変えても家族にいる id なら、その人の欠席にする
    expect(validateCommands(s, catalog, [{ type: 'absence', date: WED, memberRef: 'メンバー2' }])).toEqual([
      { type: 'absence', date: WED, memberRef: PAPA },
    ]);
    // id のない言い方は、そのまま
    expect(validateCommands(s, catalog, [{ type: 'absence', date: WED, memberRef: '夫' }])).toEqual([
      { type: 'absence', date: WED, memberRef: '夫' },
    ]);
  });
});

describe('作らない日にした日の表示', () => {
  it('「今日のごはん」で「作らない日にしています」と出し、［別のに］は出さない（［作った］で直せる）', () => {
    let s = say(start(WED), '今日は無理').state; // 水曜はもともとラク日
    s = tap(s, '作らない日にする').state;
    const r = say(s, '今日のごはん');
    expect(r.replies[0].text).toBe('今日は作らない日にしています。外食や買ってきたもので済ませてください。');
    expect(labels(r)).toEqual(['作った']);
  });
});

describe('日付の読み：期間は欠席の日数だけに使い、ふつうの書き込みを日付にしない', () => {
  const parse = (text: string, today = MON) => parseMessage(text, { today, members: start().household.members, catalog });

  it('期間の言い方でないもの（ぶり・この・に2回・煮込んだ）は、リクエストの日付にしない', () => {
    expect(parse('1週間ぶりにカレー食べたい')).toEqual([{ type: 'request', dishId: 'curry_rice' }]);
    expect(parse('1週間に2回は魚がいい')).toEqual([{ type: 'request', protein: 'fish' }]);
    expect(parse('この1週間カレーばかり')[0].type).toBe('unknown');
    expect(parse('2日間煮込んだカレー')[0].type).toBe('unknown');
    // 「3日に1回」「3日に一度」の「3日」を、来月3日の日付にしない
    expect(parse('3日に1回はカレーがいい')).toEqual([{ type: 'request', dishId: 'curry_rice' }]);
    expect(parse('3日に一度は魚がいい')).toEqual([{ type: 'request', protein: 'fish' }]);
    // 「3日に」だけなら、今までどおり3日の日付
    expect(parse('3日にカレーがいい')).toEqual([{ type: 'request', dishId: 'curry_rice', date: '2026-12-03' }]);
  });

  it('「2週間後」「3日後」「2週間後の月曜」は、その日（期間にしない）', () => {
    expect(absenceDays('2週間後にパパ出張')).toEqual([`${addDays(MON, 14)}:パパ`]);
    expect(absenceDays('3日後はパパいない')).toEqual([`${THU}:パパ`]);
    expect(absenceDays('2週間後の月曜はパパいない')).toEqual([`${addDays(MON, 14)}:パパ`]);
    expect(absenceDays('1週間後の月曜はパパいない', THU)).toEqual([`${addDays(MON, 7)}:パパ`]);
  });

  it('始まりを書かない期間は今日から。「3日間も」も期間', () => {
    expect(absenceDays('3日間もパパいない')).toEqual([`${MON}:パパ`, `${TUE}:パパ`, `${WED}:パパ`]);
    expect(absenceDays('十日間パパいない')).toHaveLength(10);
  });

  it('来月の曜日は、今週の曜日にしない（「来月から月曜は外食」で今日を夕食なしにしない）', () => {
    const s = start();
    const r = say(s, '来月から月曜は外食');
    expect(r.state.meals).toEqual(s.meals);
    expect(parse('来週の水曜はパパいない')).toEqual([{ type: 'absence', date: addDays(WED, 7), memberRef: 'パパ' }]);
  });

  it('日を決められない時期（月末・年末・お盆・連休・来月・来週）だけなら、今日のことにせず、日付で送ってもらう', () => {
    const s = start();
    for (const t of ['月末は外食', '今月末は外食', '年末は実家', '月末はパパが出張', 'お盆は実家', '連休は旅行', '来月は外食', '来週は外食', '来週はパパが出張', '今週はパパが出張']) {
      expect(parse(t).filter((c) => c.type === 'absence'), t).toEqual([]);
      const r = say(s, t);
      expect(r.state.meals, t).toEqual(s.meals);
      expect(r.replies[0].text, t).toBe(
        'いつのことか、日付が分かりませんでした。献立はこのままです。\n「11/30は外食」「金曜はパパがいない」のように、日付か曜日で送ってください。',
      );
    }
    // 「来週の献立」は今までどおり週の献立。過ぎたことの話（「先週は外食が多かった」）には日付を聞かない
    expect(parse('来週の献立')).toEqual([{ type: 'show_week' }]);
    expect(say(s, '先週は外食が多かった').replies[0].text).not.toContain('日付が分かりませんでした');
    // 曜日や日付も書けば、その日（「連休明けの水曜」「週末」）
    expect(absenceDays('連休明けの水曜はパパいない')).toEqual([`${WED}:パパ`]);
    expect(absenceDays('週末は外食', TUE)).toEqual([`${addDays(FRI, 1)}:みんな`, `${addDays(FRI, 2)}:みんな`]);
  });

  it('曜を書かない曜日の並び（「月水金は」「金土日は」）は、それぞれの日。「月に1回」「週に1回」は日付にしない', () => {
    expect(absenceDays('月水金はパパいない', TUE)).toEqual([`${addDays(MON, 7)}:パパ`, `${WED}:パパ`, `${FRI}:パパ`]);
    expect(absenceDays('金土日は外食', TUE)).toEqual([`${FRI}:みんな`, `${addDays(FRI, 1)}:みんな`, `${addDays(FRI, 2)}:みんな`]);
    expect(absenceDays('土日は外食', TUE)).toEqual([`${addDays(FRI, 1)}:みんな`, `${addDays(FRI, 2)}:みんな`]);
    for (const t of ['月に1回は外食', '週に1回は外食']) expect(parse(t, TUE).filter((c) => c.type === 'absence'), t).toEqual([]);
    // 「毎週水曜」は、今週の水曜の欠席にする（今までどおり）
    expect(absenceDays('毎週水曜はパパが飲み会')).toEqual([`${WED}:パパ`]);
  });

  it('「今月から」「月曜から金曜まで仕事」は、欠席にしない', () => {
    for (const t of ['今月からパパ単身赴任', '月曜から金曜まで仕事', 'パパは月曜から金曜まで仕事', '今月から節約したい']) {
      expect(parse(t).filter((c) => c.type === 'absence'), t).toEqual([]);
    }
  });
});

describe('範囲の「遅くなる」「かも」と、人が分からない範囲の欠席は、返事を1つにまとめる', () => {
  it('「月曜から金曜まで仕事で遅い」「木曜まで残業」：同じ返事を日の数だけ出さない', () => {
    for (const t of ['月曜から金曜まで仕事で遅い', '木曜まで残業']) {
      const s = start();
      const r = say(s, t);
      expect(r.replies, t).toHaveLength(1);
      expect(texts(r), t).toContain('遅くなる日も、夕食はいつもどおりにしています。');
      expect(r.state.meals, t).toEqual(s.meals);
    }
  });

  it('「パパは木曜まで残業で遅い」：パパの分は入れたまま、1つの返事', () => {
    const s = start();
    const r = say(s, 'パパは木曜まで残業で遅い');
    expect(r.replies).toHaveLength(1);
    expect(texts(r)).toContain('今日から11/12(木)まではパパが遅くなるんですね。夕食はパパの分も入れたままにしています。');
    expect(r.state.meals).toEqual(s.meals);
  });

  it('「明日から3日間パパ出張かも」：献立は変えず、決まったときの書き方は範囲のまま（そのまま送れば欠席になる）', () => {
    const s = start();
    const r = say(s, '明日から3日間パパ出張かも');
    expect(r.replies).toHaveLength(1);
    expect(texts(r)).toContain('決まったら「明日から木曜まではパパはいらない」と送ってください。');
    expect(r.state.meals).toEqual(s.meals);
    expect(absenceDays('明日から木曜まではパパはいらない')).toEqual([`${TUE}:パパ`, `${WED}:パパ`, `${THU}:パパ`]);
  });

  it('「明日から木曜まで出張」（人を書かない）：1回だけ聞き、名前の答えを3日すべてに使う', () => {
    const asked = say(start(), '明日から木曜まで出張');
    expect(asked.replies).toHaveLength(1);
    expect(texts(asked)).toContain('明日から11/12(木)までは、誰が食べませんか？');
    const r = say(asked.state, 'パパ');
    for (const d of [TUE, WED, THU]) expect(meal(r.state, d).absentMemberIds, d).toEqual([PAPA]);
    expect(meal(r.state, FRI).absentMemberIds).toEqual([]);
  });

  it('「金曜から日曜まで旅行」：献立のない土日は聞かず、答えにも使わない', () => {
    const asked = say(start(), '金曜から日曜まで旅行');
    expect(texts(asked)).toContain('11/13(金)は、誰が食べませんか？');
    const r = say(asked.state, 'みんな');
    expect(texts(r)).not.toContain('献立の日ではありません');
    expect(meal(r.state, FRI).servings).toBe(0);
  });

  it('「水曜パパ出張、木曜はわからない」：決まっていないのは木曜だけ（水曜は欠席にする）', () => {
    expect(absenceDays('水曜パパ出張、木曜はわからない')).toEqual([`${WED}:パパ`]);
  });
});

describe('家で食べる人が1人・2人の家族の「外で食べる」の言い方', () => {
  const solo: OnboardingInput = {
    members: [
      { nickname: 'まき', ageBand: 'adult', role: 'parent', exclusions: [] },
      { nickname: 'あかり', ageBand: 'infant', role: 'child', exclusions: [] },
    ],
    shoppingWeekdays: [2, 6],
    favoriteDishIds: [],
    customFavoriteNames: [],
    plan: 'paid',
  };
  const couple: OnboardingInput = {
    members: [
      { nickname: 'なおみ', ageBand: 'adult', role: 'parent', exclusions: [] },
      { nickname: 'けんじ', ageBand: 'adult', role: 'partner', exclusions: [] },
    ],
    shoppingWeekdays: [1, 4],
    favoriteDishIds: [],
    customFavoriteNames: [],
    plan: 'free',
  };

  it('1人（と乳児）の家族：「みんな」と言わず、戻し方は「やっぱり家で食べる」（そのまま送れば戻る）', () => {
    const out = say(start(TUE, solo), '金曜は外食');
    expect(texts(out)).toContain('了解です。11/13(金)は外で食べるんですね。');
    expect(texts(out)).toContain('予定が変わったら「金曜はやっぱり家で食べる」と送ってください。');
    expect(meal(out.state, FRI).servings).toBe(0);
    const back = say(out.state, '金曜はやっぱり家で食べる');
    expect(texts(back)).toContain('了解です。11/13(金)は家で食べるんですね（1人分）。');
    expect(meal(back.state, FRI).servings).toBe(1);
    // 遅くなるだけのときも、自分の名前を返さない
    expect(texts(say(start(TUE, solo), '明日は残業'))).toContain('了解です。明日は遅くなるんですね。夕食はいつもどおりにしています（1人分）。');
  });

  it('大人2人の家族：今までどおり「みんな」', () => {
    const out = say(start(TUE, couple), '金曜は2人とも外食');
    expect(texts(out)).toContain('了解です。11/13(金)はみんな外で食べるんですね。');
    expect(texts(out)).toContain('予定が変わったら「金曜はみんないる」と送ってください。');
    const back = say(out.state, '金曜はみんないる');
    expect(texts(back)).toContain('了解です。11/13(金)はみんな家で食べるんですね（2人分）。');
    // 2人とも書いた「かも」は「みんな外食」で決められる
    expect(texts(say(start(TUE, couple), '金曜はなおみとけんじが外食かも'))).toContain('決まったら「金曜はみんな外食」と送ってください。');
  });
});

describe('EXP-2 の別の場合：もともとラク日の日に「今日は無理」', () => {
  it('「このラク日で十分」と答えた日は、設定を変えて週を作り直しても、同じ料理のまま', () => {
    const s = say(start(WED), '今日は無理').state; // 水曜は献立でもともとラク日
    expect(meal(s, WED).kind).toBe('raku');
    expect(meal(s, WED).changedBy).toBe('user');
    const household = structuredClone(s.household);
    household.members[3].exclusions.push({ type: 'allergen', id: 'walnut' }); // 料理に当たらない変更
    const r = applyAction({ ...s, household }, catalog, { type: 'regenerate_week', weekStart: MON });
    expect(meal(r.state, WED).dishIds).toEqual(meal(s, WED).dishIds);
  });
});

describe('EXP-11 の別の言い方：「外で食べる人がいる」は、みんなではない', () => {
  it('誰かを聞き、名前の答えで、その人だけを欠席にする', () => {
    const asked = say(start(), '明日は外で食べる人がいる');
    expect(texts(asked)).toContain('明日は、誰が食べませんか？');
    expect(meal(asked.state, TUE).absentMemberIds).toEqual([]);
    const r = say(asked.state, 'パパとはると');
    expect([...meal(r.state, TUE).absentMemberIds].sort()).toEqual([PAPA, HARUTO]);
    // 人を書かない「明日は外食」は、今までどおりみんな
    expect(absenceDays('明日は外食')).toEqual([`${TUE}:みんな`]);
  });
});

describe('EXP-12 の別の場合：何日か続く予定の取り消しと、「全部」の答え', () => {
  it('「明日から木曜までパパ出張」のあとの「パパの出張なくなった」は、3日とも取り消す（どの日かは聞かない）', () => {
    const away = say(start(), '明日から木曜までパパ出張').state;
    const r = say(away, 'パパの出張なくなった');
    expect(texts(r)).not.toContain('どの日の予定がなくなりましたか');
    for (const d of [TUE, WED, THU]) expect(meal(r.state, d).absentMemberIds, d).toEqual([]);
  });

  it('別々の日の飲み会は今までどおり聞き、「全部」で両方を取り消す', () => {
    let s = say(start(), '明日パパ飲み会').state;
    s = say(s, '水曜もパパ飲み会').state; // 続いた日でも、飲み会は1日ずつの予定
    const asked = say(s, '飲み会なくなった');
    expect(texts(asked)).toContain('どの日の予定がなくなりましたか？');
    expect(texts(asked)).toContain('全部なら「全部」と送ってください。');
    const r = say(asked.state, '全部');
    expect(meal(r.state, TUE).absentMemberIds).toEqual([]);
    expect(meal(r.state, WED).absentMemberIds).toEqual([]);
    // 日付だけの答えは、今までどおりその日だけ
    const one = say(asked.state, '水曜');
    expect(meal(one.state, TUE).absentMemberIds).toEqual([PAPA]);
    expect(meal(one.state, WED).absentMemberIds).toEqual([]);
  });
});

describe('あったことを理由にした書き込み（〜だったから・〜だったので）', () => {
  const parse = (text: string, today = MON) => parseMessage(text, { today, members: start().household.members, catalog });

  it('理由の節は読まず、あとの頼みだけを読む', () => {
    expect(parse('昨日カレーだったから今日は別のがいい')).toEqual([{ type: 'want_alternatives', date: MON }]);
    expect(parse('給食がカレーだったので夜は魚がいい')).toEqual([{ type: 'request', protein: 'fish' }]);
    // 「昨日は外食だったので」で、今日をみんな外で食べる日にしない
    expect(parse('昨日は外食だったので今日は魚がいい')).toEqual([{ type: 'request', protein: 'fish', date: MON }]);
    // 「だったら」は、あったことではない（今までどおりリクエスト）
    expect(parse('明日はカレーだったらいいな')).toEqual([{ type: 'request', dishId: 'curry_rice', date: TUE }]);
  });

  it('「昨日は無理だったけど今日は作る」で、今日をラク日にしない（前日の確認への答えにする）', () => {
    const s = advanceDay(start(), catalog).state; // 火曜。月曜の「作りましたか？」
    for (const t of ['昨日は無理だったけど今日は作る', '昨日は無理だったから今日は作る']) {
      const r = say(s, t);
      expect(meal(r.state, TUE), t).toEqual(meal(s, TUE));
      expect(meal(r.state, MON).status, t).toBe('skipped');
    }
  });
});

describe('日付のないリクエストの料理が、もう献立にあるとき', () => {
  it('今日やこの先の日にその主菜があれば「もう〜の予定です」と答え、別の日に同じ主菜を入れる案を出さない', () => {
    const tue = advanceDay(start(), catalog).state; // 火曜。今日はキーマカレー
    expect(meal(tue, TUE).dishIds[0]).toBe('keema_curry');
    const r = say(tue, 'カレー食べたい');
    expect(texts(r)).toContain('今日は、もうキーマカレーの予定です。');
    expect(r.state.proposals).toEqual([]);
    const thu = meal(start(), THU).dishIds[0];
    const name = findDish(start(), catalog, thu)!.name;
    const r2 = say(start(), `${name}が食べたい`);
    expect(texts(r2)).toContain(`11/12(木)は、もう${name}の予定です。`);
    expect(r2.state.proposals).toEqual([]);
    expect(dailyViolations(r2.state, catalog)).toEqual([]);
  });
});

describe('家族が決めた日に、あとから欠席を足しても「決めた日」の印は残す', () => {
  it('EXP-2 の別の場合：「今日は無理」のあとに「今日はパパいない」でも、週を作り直したときラク日のまま', () => {
    let s = say(start(), '今日は無理').state;
    const raku = meal(s, MON);
    s = say(s, '今日はパパいない').state;
    expect(meal(s, MON).absentMemberIds).toEqual([PAPA]);
    expect(meal(s, MON).changedBy).toBe('user');
    const r = applyAction(s, catalog, { type: 'regenerate_week', weekStart: MON });
    expect(meal(r.state, MON).kind).toBe('raku');
    expect(meal(r.state, MON).dishIds).toEqual(raku.dishIds);
    expect(meal(r.state, MON).absentMemberIds).toEqual([PAPA]);
  });

  it('EXP-20 の別の場合：特売で替えた日に欠席を足しても、日付のないリクエストはその日を選ばない', () => {
    let s = say(start(), '鶏むねが安い').state;
    s = tap(s, '替える').state;
    const saleDay = s.meals.find((m) => m.changedBy === 'sale')!.date;
    s = say(s, `${saleDay === TUE ? '明日' : '水曜'}はパパ飲み会`).state;
    expect(meal(s, saleDay).changedBy).toBe('sale');
    const r = say(s, '今週カレー食べたい');
    expect(r.state.proposals.some((p) => p.date === saleDay)).toBe(false);
  });
});

describe('聞き返しへの答えは、利用者の発言の原文がなくても読める（LINE のサーバーは原文を保存しない）', () => {
  const blank = (s: AppState): AppState => ({ ...s, chat: s.chat.map((m) => (m.from === 'user' ? { ...m, text: '' } : m)) });

  it('「誰が食べませんか？」への名前（1日・範囲・分からない呼び方の聞き返し）', () => {
    const one = say(blank(say(start(), '明日飲み会').state), 'はると');
    expect(meal(one.state, TUE).absentMemberIds).toEqual([HARUTO]);
    const range = say(blank(say(start(), '明日から木曜まで出張').state), 'パパ');
    for (const d of [TUE, WED, THU]) expect(meal(range.state, d).absentMemberIds, d).toEqual([PAPA]);
    // LLM の分からない呼び方（「おばあちゃん」）：聞き返しに日を入れ、名前の答えをその日の欠席にする
    const asked = say(start(), '水曜はおばあちゃんがいない', [{ type: 'absence', date: WED, memberRef: 'おばあちゃん' }]);
    expect(texts(asked)).toContain('11/11(水)いない「おばあちゃん」が誰か分かりませんでした。');
    const r = say(blank(asked.state), 'ママ');
    expect(meal(r.state, WED).absentMemberIds).toEqual(['member_1']);
  });

  it('「どの日の予定がなくなりましたか？」への日付・「全部」', () => {
    let s = say(start(), '明日パパ飲み会').state;
    s = say(s, '木曜もパパ飲み会').state;
    const asked = blank(say(s, 'やっぱり飲み会なくなった').state);
    const thu = say(asked, '木曜');
    expect(meal(thu.state, THU).absentMemberIds).toEqual([]);
    expect(meal(thu.state, TUE).absentMemberIds).toEqual([PAPA]);
    const all = say(asked, '全部');
    expect(meal(all.state, THU).absentMemberIds).toEqual([]);
    expect(meal(all.state, TUE).absentMemberIds).toEqual([]);
  });

  it('「出張なくなった」は、続いた出張の日だけをまとめて取り消す（同じ週の、みんな外で食べる日は残す）', () => {
    let s = say(start(), '金曜はみんな外食').state;
    s = say(s, '明日から木曜までパパ出張').state;
    const r = say(blank(s), 'パパの出張なくなった');
    for (const d of [TUE, WED, THU]) expect(meal(r.state, d).absentMemberIds, d).toEqual([]);
    expect(meal(r.state, FRI).servings).toBe(0);
  });
});

describe('献立がまだない日の欠席は、1つの返事にまとめる', () => {
  it('「明日から十日間パパ出張」：今週の日は減らし、来週の日は「献立はまだありません」を1回だけ', () => {
    const r = say(start(), '明日から十日間パパ出張');
    for (const d of [TUE, WED, THU, FRI]) expect(meal(r.state, d).absentMemberIds, d).toEqual([PAPA]);
    const notYet = r.replies.filter((m) => m.text.includes('献立はまだありません'));
    expect(notYet.map((m) => m.text)).toEqual(['11/16(月)から11/19(木)までの献立はまだありません。献立ができたら、もう一度教えてください。']);
    expect(r.replies.length).toBeLessThanOrEqual(5);
    // 1日だけなら、今までどおり
    expect(texts(say(start(), '来週の月曜はパパいない'))).toBe('11/16(月)の献立はまだありません。献立ができたら、もう一度教えてください。');
  });
});

describe('L2 の別の場合：片方の案を選んだあとに出し直すのは、まだ使える案だけ', () => {
  const proposalIds = (r: { replies: ChatMessage[] }) =>
    r.replies.flatMap((m) => (m.actions ?? []).flatMap((a) => (a.action.type === 'accept_proposal' ? [a.action.proposalId] : [])));

  it('「豚こまが安い。豚こま買った」：両方とも酢豚の案。片方を替えたら、もう片方は出し直さず、使えなくなったと伝える', () => {
    const r = say(start(), '豚こまが安い。豚こま買った');
    const shown = proposalIds(r);
    expect(shown).toHaveLength(2);
    for (const first of shown) {
      const one = applyAction(r.state, catalog, { type: 'accept_proposal', proposalId: first });
      expect(one.replies[0].text).toContain('を酢豚／');
      expect(proposalIds(one)).toEqual([]);
      expect(texts(one)).not.toContain('もう1つの案も、ボタンで選べます。');
      expect(one.replies[one.replies.length - 1].text).toMatch(/^(明日|11\/12\(木\))の案は、使えなくなりました（酢豚が7日以内に入っています）。$/);
      // 使えない案は取り下げる（文字の「はい」で、使えない案を選ばない）
      expect(one.state.proposals).toEqual([]);
      expect(texts(say(one.state, 'はい'))).not.toContain('使えません');
    }
    // 「そのまま」なら、もう片方はまだ使えるので出し直す
    const kept = applyAction(r.state, catalog, { type: 'reject_proposal', proposalId: shown[0] });
    expect(proposalIds(kept)).toEqual([shown[1]]);
    expect(applyAction(kept.state, catalog, { type: 'accept_proposal', proposalId: shown[1] }).replies[0].text).toContain('に替えました');
  });

  it('出し直した［替える］は、押せばいつも替わる（特売・在庫・リクエストの組み合わせ、月〜水）', () => {
    const messages = [
      '鮭が安い。木曜は魚がいい',
      '木曜は魚がいい。鮭が安い',
      '豚こま買った。豚こまが安い',
      '鶏ももが安い。水曜は和食がいい',
      '鶏むねが安い。豚こまも安い。さばも安い',
      '鶏むねが安い。豚こまも安い',
    ];
    for (const today of [MON, TUE, WED]) {
      for (const text of messages) {
        const r = say(start(today), text);
        for (const first of proposalIds(r)) {
          for (const type of ['accept_proposal', 'reject_proposal'] as const) {
            const one = applyAction(r.state, catalog, { type, proposalId: first });
            for (const again of proposalIds(one)) {
              const two = applyAction(one.state, catalog, { type: 'accept_proposal', proposalId: again });
              expect(two.replies[0].text, `${today} ${text} ${type}`).toContain('に替えました');
            }
          }
        }
      }
    }
  });
});

describe('L3 の別の場合：日を決められない時期の取り消し・「無理」・ほかの用件と一緒の書き込み', () => {
  const parse = (text: string, today = MON) => parseMessage(text, { today, members: start().household.members, catalog });
  const VAGUE_OTHER = 'いつのことか、日付が分かりませんでした。献立はこのままです。\n「水曜は」「11/30は」のように、日付か曜日を入れて送ってください。';
  const VAGUE_PART = 'いつのことか日付が分からないところは、献立を変えていません。日付か曜日を入れて、もう一度送ってください。';

  it('「来週の外食なくなった」「来週はパパいる」は、今日の欠席を取り消さない（今日のことにしない）', () => {
    const out = say(start(TUE), '今日はみんな外食').state;
    const papa = say(start(TUE), '今日はパパ飲み会').state;
    for (const [s, t] of [
      [out, '来週の外食なくなった'],
      [out, '月末の外食なくなった'],
      [out, '来週はみんないる'],
      [out, '来週はやっぱり家で食べる'],
      [papa, '来週はパパいる'],
      [papa, '月末の飲み会なくなった'],
    ] as const) {
      const r = say(s, t);
      expect(r.state.meals, t).toEqual(s.meals);
      expect(r.replies.map((m) => m.text), t).toEqual([VAGUE_OTHER]);
    }
    // 日付があれば、今までどおり取り消す
    expect(meal(say(out, '今日はみんないる').state, TUE).absentMemberIds).toEqual([]);
    expect(meal(say(papa, '今日はパパいる').state, TUE).absentMemberIds).toEqual([]);
  });

  it('「来週は無理」「月末は無理」は、今日をラク日にしない（「今週は無理」は今までどおり今日のこと）', () => {
    const s = start(TUE);
    for (const t of ['来週は無理', '月末は無理', '来月は作れない', '来週は疲れそう', 'お盆は無理']) {
      expect(parse(t, TUE).map((c) => c.type), t).not.toContain('today_impossible');
      const r = say(s, t);
      expect(r.state.meals, t).toEqual(s.meals);
      expect(r.replies.map((m) => m.text), t).toEqual([VAGUE_OTHER]);
    }
    expect(parse('今週は無理', TUE)).toEqual([{ type: 'today_impossible' }]);
    expect(parse('今週は疲れた', TUE)).toEqual([{ type: 'today_impossible' }]);
    // 決まっていない話は、今までどおり「まだ決まっていないんですね」
    expect(texts(say(s, '来週パパ飲み会かも'))).toContain('まだ決まっていないんですね');
  });

  it('ほかの用件と一緒に書いた、日を決められない欠席は、黙って捨てずに日付を聞く（ほかの用件は進める）', () => {
    const s = start(TUE);
    const sale = say(s, '来週はパパが出張。鶏むねが安い');
    expect(sale.state.meals).toEqual(s.meals);
    expect(sale.replies.map((m) => m.text)).toContain(VAGUE_PART);
    expect(sale.state.proposals).toHaveLength(1);
    const tired = say(s, '月末は外食。今日は無理');
    expect(meal(tired.state, TUE).kind).toBe('raku');
    expect(tired.replies.map((m) => m.text)).toContain(VAGUE_PART);
    const both = say(s, 'お盆は実家、明日はパパいない');
    expect(meal(both.state, WED).absentMemberIds).toEqual([PAPA]);
    expect(both.replies.map((m) => m.text)).toContain(VAGUE_PART);
    // 日を決められる書き込みだけなら、添えない
    expect(texts(say(s, '明日はパパいない。鶏むねが安い'))).not.toContain('日付が分からない');
  });
});

describe('「来週の水曜と木曜」：週を書いた曜日の並びは、どれもその週の曜日（今週の木曜にしない）', () => {
  const parse = (text: string, today = MON) => parseMessage(text, { today, members: start().household.members, catalog });
  it('来週・再来週・今週の曜日の並び（と・・・や）', () => {
    expect(absenceDays('来週の水曜と木曜はパパいない', TUE)).toEqual([`${addDays(WED, 7)}:パパ`, `${addDays(THU, 7)}:パパ`]);
    expect(absenceDays('来週の水曜と金曜はみんな外食', TUE)).toEqual([`${addDays(WED, 7)}:みんな`, `${addDays(FRI, 7)}:みんな`]);
    expect(absenceDays('来週の月・水はパパいない', TUE)).toEqual([`${addDays(MON, 7)}:パパ`, `${addDays(WED, 7)}:パパ`]);
    expect(absenceDays('再来週の月曜と火曜はパパいない', TUE)).toEqual([`${addDays(MON, 14)}:パパ`, `${addDays(TUE, 14)}:パパ`]);
    expect(absenceDays('今週の水曜と金曜はパパいない', TUE)).toEqual([`${WED}:パパ`, `${FRI}:パパ`]);
    // 今週の献立は変えない（献立がまだない日なので、そう伝える）
    const s = start(TUE);
    const r = say(s, '来週の水曜と木曜はパパいない');
    expect(r.state.meals).toEqual(s.meals);
    expect(texts(r)).toBe('11/18(水)から11/19(木)までの献立はまだありません。献立ができたら、もう一度教えてください。');
    // 「来週から月曜は外食」を月曜に書いても、今日（今週の月曜）にしない
    expect(absenceDays('来週から月曜は外食', MON)).toEqual([`${addDays(MON, 7)}:みんな`]);
    expect(absenceDays('来週も水曜はパパいない', TUE)).toEqual([`${addDays(WED, 7)}:パパ`]);
    expect(meal(say(start(MON), '来週から月曜は外食').state, MON).absentMemberIds).toEqual([]);
    // 「、」で続けても同じ週（「来週の水曜、木曜」）
    expect(absenceDays('来週の水曜、木曜はパパいない', TUE)).toEqual([`${addDays(WED, 7)}:パパ`, `${addDays(THU, 7)}:パパ`]);
    expect(absenceDays('来週の月曜、水曜、金曜は外食', TUE)).toEqual([`${addDays(MON, 7)}:みんな`, `${addDays(WED, 7)}:みんな`, `${addDays(FRI, 7)}:みんな`]);
    // 「来週の土日」は来週の週末（今週の土日にしない）
    expect(absenceDays('来週の土日は外食', TUE)).toEqual([`${addDays(FRI, 8)}:みんな`, `${addDays(FRI, 9)}:みんな`]);
    // 「来週の金がない」の金は、曜日にしない
    expect(parse('来週の金がない', TUE).filter((c) => c.type === 'absence')).toEqual([]);
    // 日付の言葉は、今までどおりその日（「来週の水曜とあさって」のあさっては今週）。範囲も今までどおり
    expect(absenceDays('来週の水曜とあさってはパパいない', TUE)).toEqual([`${addDays(WED, 7)}:パパ`, `${THU}:パパ`]);
    expect(absenceDays('来週の水曜から金曜までパパ出張', TUE)).toEqual([18, 19, 20].map((d) => `2026-11-${d}:パパ`));
  });
});

describe('L6 の別の場合：家族を加えて、買ってあった物の多くが足りなくなったとき', () => {
  it('足りなくなった物が4つ以上なら、名前は3つまでにして「など〇品」と数を添える（黙って落とさない）', () => {
    let s = start(MON);
    for (const l of s.shopping) {
      for (const it of l.items) {
        if (it.forDates.some((d) => d <= FRI)) s = applyAction(s, catalog, { type: 'check_item', shoppingDate: l.date, ingredientId: it.ingredientId, checked: true }).state;
      }
    }
    const household = structuredClone(s.household);
    household.members.push({ id: 'member_5', nickname: 'ばあば', ageBand: 'adult', role: 'other', exclusions: [] });
    const r = applyAction({ ...s, household }, catalog, { type: 'regenerate_week', weekStart: MON, keepSafe: true });
    const short = r.state.shopping.flatMap((l) => l.items.filter((i) => !i.checked && (i.bought ?? 0) > 0)).map((i) => i.name);
    expect(new Set(short).size).toBeGreaterThan(3);
    const line = r.replies[0].text.split('\n').find((x) => x.includes('買った分では足りなくなりました'));
    expect(line).toBe(`${[...new Set(short)].slice(0, 3).join('・')}など${new Set(short).size}品は、買った分では足りなくなりました。足りない分を買い物リストに入れました。`);
  });
});

describe('L6 の別の場合：家族を外して、その日に家で食べる人がいなくなったとき（keepSafe）', () => {
  it('みんな外で食べる日になった日は、人数を0にして買い物リストから外す（献立はそのまま残す）', () => {
    const s = say(start(TUE), '金曜はママとはるととゆいがいない').state;
    expect(meal(s, FRI).servings).toBe(1);
    // 画面と同じ：外した人の id を欠席から除いてから、keepSafe で作り直す
    const household = { ...s.household, members: s.household.members.filter((m) => m.id !== PAPA) };
    const meals = s.meals.map((m) => ({ ...m, absentMemberIds: m.absentMemberIds.filter((id) => id !== PAPA) }));
    for (const keepSafe of [true, false]) {
      const r = applyAction({ ...s, household, meals }, catalog, { type: 'regenerate_week', weekStart: MON, ...(keepSafe ? { keepSafe } : {}) });
      const fri = meal(r.state, FRI);
      expect(fri.dishIds, `keepSafe ${keepSafe}`).toEqual(meal(s, FRI).dishIds);
      expect(fri.servings, `keepSafe ${keepSafe}`).toBe(0);
      expect(r.state.shopping.flatMap((l) => l.items).filter((i) => i.forDates.includes(FRI)), `keepSafe ${keepSafe}`).toEqual([]);
    }
    // 作り直さずに買い物リストだけを直すとき（画面で、これからの日がみんな外で食べる日だけのとき）も、その日の分は入れない
    const lists = buildShoppingLists({ ...s, household, meals }, catalog);
    expect(lists.flatMap((l) => l.items).filter((i) => i.forDates.includes(FRI))).toEqual([]);
  });
});

describe('L2 の別の場合：同じ返事に「どちらにしますか？」の案と、替える提案が出たとき', () => {
  const proposalIds = (r: { replies: ChatMessage[] }) =>
    r.replies.flatMap((m) => (m.actions ?? []).flatMap((a) => (a.action.type === 'accept_proposal' ? [a.action.proposalId] : [])));
  const choices = (r: { replies: ChatMessage[] }) =>
    r.replies.flatMap((m) => (m.actions ?? []).filter((a) => a.action.type === 'choose_alternative'));

  it('「明日のは別のにして。鶏むねが安い」：案を選んだら替える提案を、提案に答えたら案を、ボタンつきで出し直す', () => {
    // 月曜に始めて火曜に進めた週（明日の案が2つ、今日の鶏むねの提案が1つ出る）
    const r = say(advanceDay(start(MON), catalog).state, '明日のは別のにして。鶏むねが安い');
    const [option] = choices(r);
    const [proposal] = proposalIds(r);
    expect(option).toBeDefined();
    expect(proposal).toBeDefined();
    // 案を選ぶ → 提案を出し直す（押せば替わる）
    const chose = applyAction(r.state, catalog, option.action);
    expect(chose.replies[0].text).toContain('にしました');
    expect(proposalIds(chose)).toEqual([proposal]);
    expect(applyAction(chose.state, catalog, { type: 'accept_proposal', proposalId: proposal }).replies[0].text).toContain('に替えました');
    expect(texts(say(chose.state, 'はい'))).toContain('に替えました');
    // 提案に答える（替える・そのまま）→ 案を出し直す（押せば、その案になる。「1」でも選べる）
    for (const type of ['accept_proposal', 'reject_proposal'] as const) {
      const answered = applyAction(r.state, catalog, { type, proposalId: proposal });
      const again = choices(answered);
      expect(again.map((a) => a.label), type).toEqual(choices(r).map((a) => a.label));
      expect(answered.replies[answered.replies.length - 1].text, type).toBe('明日の別の案も、ボタンか「1」「2」で選べます。');
      expect(applyAction(answered.state, catalog, again[0].action).replies[0].text, type).toContain('にしました');
      expect(texts(say(answered.state, '1')), type).toContain('にしました');
    }
  });
});

describe('L3 のあと：日付を入れて送り直したら、献立がまだない日には「まだありません」と返す', () => {
  it('「来週の水曜は無理」「来週の金曜は魚がいい」：献立の曜日なら「献立の日ではありません」と言わない', () => {
    const s = start(TUE);
    for (const t of ['来週の水曜は無理', '11/30は無理', '来週の金曜は魚がいい', '来週の水曜はカレーがいい', '来週の月曜のは別のにして']) {
      const r = say(s, t);
      expect(r.state.meals, t).toEqual(s.meals);
      expect(texts(r), t).toMatch(/^1[12]\/\d+\(.\)の献立はまだありません。献立ができたら、もう一度教えてください。$/);
    }
    // 献立を作らない曜日は、今までどおり
    expect(texts(say(s, '来週の土曜は無理'))).toBe('11/21(土)は献立の日ではありません。');
  });
});

describe('L3 の別の場合：AI（LLM）が、日を決められない書き込みを今日のことと読んだとき', () => {
  it('ルールで日を決められない書き込みだけなら、AI の今日の命令を使わずに日付を聞く（今日を変えない）', () => {
    const s = start(TUE);
    const today = TUE;
    for (const [text, parsed] of [
      ['来週は無理', [{ type: 'today_impossible' }]],
      ['月末は外食', [{ type: 'absence', date: today, memberRef: 'みんな' }]],
      ['来週はパパが出張', [{ type: 'absence', date: today, memberRef: PAPA }]],
      ['来週の外食なくなった', [{ type: 'absence', date: today, memberRef: 'みんな', cancel: true }]],
    ] as [string, ParsedCommand[]][]) {
      const r = say(s, text, parsed);
      expect(r.state.meals, text).toEqual(s.meals);
      expect(r.replies[0].text, text).toMatch(/^いつのことか、日付が分かりませんでした。献立はこのままです。/);
    }
    // 日を決められる書き込みは、今までどおり AI の命令を使う
    const ok = say(s, '金曜はパパいない', [{ type: 'absence', date: FRI, memberRef: PAPA }]);
    expect(meal(ok.state, FRI).absentMemberIds).toEqual([PAPA]);
  });
});

describe('仮定の言い方（〜たら・〜だったら・〜なかったら・〜なら）は、作った・作らなかったの答えにしない', () => {
  const CONDITIONALS = ['無理だったら別のにして', '今日無理だったら連絡する', '外食だったら言うね', '作れなかったらごめん', '作ってないなら言って', '出前なら楽だね'];

  it('前日の確認がないとき：今日の夕食を記録せず、買い物リストも変えない', () => {
    const s = start();
    for (const t of CONDITIONALS) {
      const r = say(s, t);
      expect(r.state.meals, t).toEqual(s.meals);
      expect(r.state.history, t).toEqual(s.history);
      expect(r.state.shopping, t).toEqual(s.shopping);
      expect(texts(r), t).not.toContain('記録しました');
    }
  });

  it('前日の確認があっても、仮定では前日を記録しない（「作った」「作らなかった」「作りませんでした」の答えは今までどおり）', () => {
    const s = advanceDay(start(), catalog).state; // 火曜。月曜の「作りましたか？」
    for (const t of CONDITIONALS) {
      const r = say(s, t);
      expect(meal(r.state, MON).status, t).toBe('unconfirmed');
      expect(meal(r.state, TUE), t).toEqual(meal(s, TUE));
    }
    expect(meal(say(s, '作った').state, MON).status).toBe('cooked');
    expect(meal(say(s, '作らなかった').state, MON).status).toBe('skipped');
    expect(meal(say(s, '作りませんでした').state, MON).status).toBe('skipped');
  });

  it('確認も日の言葉もないときは、「作った」「作らなかった」だけの答えを今日のことにする（ほかの文では今日を記録しない）', () => {
    const s = start();
    for (const t of ['はるとがおやつ食べた', '宿題できた', '出前にしよう']) {
      const r = say(s, t);
      expect(r.state.meals, t).toEqual(s.meals);
      expect(r.state.history, t).toEqual(s.history);
    }
    expect(meal(say(s, '作った').state, MON).status).toBe('cooked');
    expect(meal(say(s, '作ったよー').state, MON).status).toBe('cooked');
    expect(meal(say(s, '作らなかった').state, MON).status).toBe('skipped');
    expect(meal(say(s, '出前だった').state, MON).status).toBe('skipped');
    expect(meal(say(s, '今日は出前').state, MON).status).toBe('skipped');
  });
});

describe('見るだけの命令で、AI（LLM）が日付を落としたとき（画面・LINE で同じ）', () => {
  it('「明日の夕飯なに？」「明日何買えばいい？」は、ルールで読んだ日付を使う（今日の分を返さない）', () => {
    const s = start();
    for (const [text, parsed, card] of [
      ['明日の夕飯なに？', [{ type: 'show_today' }], { kind: 'meal', date: TUE }],
      ['明日の夕飯なに？', [{ type: 'show_today', date: '2026-11-31' }], { kind: 'meal', date: TUE }],
      ['水曜の夕飯なんだっけ', [{ type: 'show_today' }], { kind: 'meal', date: WED }],
    ] as [string, ParsedCommand[], ChatMessage['card']][]) {
      const r = say(s, text, parsed);
      expect(r.replies[0].card, text).toEqual(card);
      expect(r.replies[0].text, text).not.toMatch(/^今日は/);
    }
    const shop = say(s, '明日何買えばいい？', [{ type: 'show_shopping' }]);
    expect(shop.replies[0].text).toMatch(/^明日は買い物の日ではありません。/);
    // 今日の分と、ルールが日付を決めかねた書き込みは、今までどおり
    expect(say(s, '今日のごはん', [{ type: 'show_today' }]).replies[0].card).toEqual({ kind: 'meal', date: MON });
    expect(say(s, '明日と明後日の夕飯は？', [{ type: 'show_today' }]).replies[0].card).toEqual({ kind: 'meal', date: MON });
    // AI が日付を書いていれば、その日付を使う
    expect(say(s, '明日の夕飯なに？', [{ type: 'show_today', date: WED }]).replies[0].card).toEqual({ kind: 'meal', date: WED });
  });
});

describe('作った・作らなかったを文字で答えるとき（前日の確認・料理の名前・夕食でない話）', () => {
  it('前日の「作りましたか？」に、日の言葉のない「無理だった」「外食した」と答えたら、前日の作らなかったにする（今日は変えない）', () => {
    const s = advanceDay(start(), catalog).state; // 火曜。月曜の「作りましたか？」
    for (const t of ['無理だった', '疲れて無理だった', '外食した', '外食だった', '外で食べた']) {
      const r = say(s, t);
      expect(meal(r.state, MON).status, t).toBe('skipped');
      expect(meal(r.state, TUE), t).toEqual(meal(s, TUE));
      expect(r.state.shopping, t).toEqual(s.shopping);
      expect(texts(r), t).toContain('記録しました');
      expect(texts(r), t).not.toContain('ラクしましょう');
      expect(texts(r), t).not.toContain('外で食べるんですね');
    }
  });

  it('日の言葉があれば、今までどおりその日のこととして読む', () => {
    const s = advanceDay(start(), catalog).state;
    const r = say(s, '今日は無理');
    expect(meal(r.state, TUE).kind).toBe('raku');
    expect(meal(r.state, MON).status).toBe('unconfirmed');
    expect(meal(say(s, '昨日は外食だった').state, MON).status).toBe('skipped');
    expect(meal(say(s, '昨日は無理だった').state, MON).status).toBe('skipped');
  });

  it('確認がなくても、料理の名前や「夕飯」が入った答えは今日の記録にする（見るだけの言い方は、今日の献立を見せる）', () => {
    const s = start();
    for (const t of ['さばの味噌煮作った', 'カレー作ったよ', '夕飯作った', 'ごはんできたよ']) {
      expect(meal(say(s, t).state, MON).status, t).toBe('cooked');
    }
    expect(meal(say(s, '晩ごはん作れなかった').state, MON).status).toBe('skipped');
    for (const t of ['夕飯', '今日の夕飯なに？', '夕飯作らなきゃ']) {
      const r = say(s, t);
      expect(r.state.meals, t).toEqual(s.meals);
      expect(r.replies[0].card, t).toEqual({ kind: 'meal', date: MON });
    }
  });

  it('給食・お昼・おやつ・宿題の話は、作った・作らなかったの答えにしない（前日の確認があっても）', () => {
    const s0 = start();
    const s1 = advanceDay(start(), catalog).state;
    for (const t of ['給食でカレー食べた', 'お昼食べた', 'はるとがおやつ食べた', '宿題できた', '宿題できなかった']) {
      expect(say(s0, t).state.meals, t).toEqual(s0.meals);
      expect(say(s1, t).state.meals, t).toEqual(s1.meals);
    }
  });
});
