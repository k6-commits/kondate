// 組み直し・会話の細かい振る舞い（レビューで見つかった問題の再発防止）。マスタに頼らない小さなフィクスチャで書く。
import type { AppState, OnboardingInput } from './index';
import { addDays, advanceDay, applyAction, createInitialState, findDish, handleUserText } from './index';
import { MONDAY, catalog, demoInput } from './__fixtures__/catalog';

const meal = (s: AppState, date: string) => s.meals.find((m) => m.date === date)!;
const THU = '2026-11-12';
const texts = (r: { replies: { text: string }[] }) => r.replies.map((m) => m.text).join('\n');

describe('欠席の取り消しと、欠席でゆるむ除外', () => {
  const s0 = createInitialState(demoInput(), catalog, MONDAY);
  const away = handleUserText(s0, catalog, '木曜はたろうがお泊まり');

  it('欠席の返事で、除外がゆるむこと（卵）と取り消し方を伝える', () => {
    expect(meal(away.state, THU).absentMemberIds).toEqual(['member_3']);
    expect(texts(away)).toContain('卵を使う料理も入ることがあります');
    expect(texts(away)).toContain('もいる');
  });

  it('欠席の日だから出せる料理の提案・承諾には、そのことを添える', () => {
    const req = handleUserText(away.state, catalog, '木曜はハンバーグがいい');
    expect(texts(req)).toContain('たろうがいない日なので入れています');
    const p = req.state.proposals.at(-1)!;
    const ok = applyAction(req.state, catalog, { type: 'accept_proposal', proposalId: p.id });
    expect(meal(ok.state, THU).dishIds[0]).toBe('hamburg');
    expect(texts(ok)).toContain('たろうがいない日なので入れています');

    // 「木曜はたろういる」で欠席を取り消し、卵を使うハンバーグは、出せる料理に替える
    const back = handleUserText(ok.state, catalog, '木曜はたろういる');
    const thu = meal(back.state, THU);
    expect(thu.absentMemberIds).toEqual([]);
    expect(thu.servings).toBe(3.2);
    expect(thu.dishIds).not.toContain('hamburg');
    expect(texts(back)).toContain('除外（卵）に当たるので');
  });

  it('「お泊まり中止」は新しい欠席にならず、日付がなければ欠席の日を探して取り消す', () => {
    const r = handleUserText(away.state, catalog, 'たろうのお泊まり中止');
    expect(meal(r.state, MONDAY).absentMemberIds).toEqual([]);
    expect(meal(r.state, THU).absentMemberIds).toEqual([]);
  });

  it('「木曜のお泊まりなくなった」（人を書かない）は、その日の欠席をすべて取り消す', () => {
    const r = handleUserText(away.state, catalog, '木曜のお泊まりなくなった');
    expect(meal(r.state, THU).absentMemberIds).toEqual([]);
  });
});

describe('「夫」「妻」は、役割から性別を推測しない', () => {
  const input: OnboardingInput = demoInput({
    members: [
      { nickname: 'たけし', ageBand: 'adult', role: 'parent', exclusions: [{ type: 'allergen', id: 'egg' }] },
      { nickname: 'あきこ', ageBand: 'adult', role: 'partner', exclusions: [] },
      { nickname: 'たろう', ageBand: 'child', role: 'child', exclusions: [] },
    ],
  });
  const s0 = createInitialState(input, catalog, MONDAY);

  it('ニックネームで決まらなければ、本人を欠席にせず聞き返す', () => {
    for (const t of ['水曜は妻が飲み会', '水曜は夫が飲み会']) {
      const r = handleUserText(s0, catalog, t);
      expect(meal(r.state, '2026-11-11').absentMemberIds, t).toEqual([]);
      expect(r.replies[0].text, t).toContain('たけし・あきこ');
    }
  });

  it('デモの家族（パパ・ママ）は、ニックネームで決まる', () => {
    const demo = createInitialState(demoInput(), catalog, MONDAY);
    expect(meal(handleUserText(demo, catalog, '水曜は夫が飲み会').state, '2026-11-11').absentMemberIds).toEqual(['member_2']);
    expect(meal(handleUserText(demo, catalog, '水曜は妻が飲み会').state, '2026-11-11').absentMemberIds).toEqual(['member_1']);
  });
});

describe('日付', () => {
  const s0 = createInitialState(demoInput(), catalog, MONDAY);

  it('献立を作らない曜日（週末）の欠席には「献立の日ではありません」と1回だけ返す（「献立ができたら」と約束しない）', () => {
    const r = handleUserText(s0, catalog, '今週末は外食');
    expect(r.replies).toHaveLength(1);
    expect(r.replies[0].text).toContain('献立の日ではありません');
    expect(r.replies[0].text).not.toContain('献立ができたら');
    expect(r.state.meals).toEqual(s0.meals);
  });

  it('昨日の話（「昨日は無理だった」「作った」）は、今日を変えずに前日の確認への答えとして記録する', () => {
    const tue = advanceDay(s0, catalog).state;
    const no = handleUserText(tue, catalog, '昨日は無理だった');
    expect(meal(no.state, tue.today)).toEqual(meal(tue, tue.today));
    expect(meal(no.state, MONDAY).status).toBe('skipped');
    const yes = handleUserText(tue, catalog, '作った');
    expect(meal(yes.state, MONDAY).status).toBe('cooked');
    expect(yes.state.history.some((h) => h.date === MONDAY && h.status === 'cooked')).toBe(true);
    // 「食べたい」は「食べた」ではない
    const want = handleUserText(tue, catalog, 'たこ焼き食べたい');
    expect(meal(want.state, MONDAY).status).toBe('unconfirmed');
  });
});

describe('在庫・買い物の返事は、実際の状態と合わせる', () => {
  const s0 = createInitialState(demoInput(), catalog, MONDAY);

  it('質問・頼む形・否定では在庫を変えず、今の在庫とリストで答える', () => {
    for (const t of ['豆腐あったっけ？', '帰りに豆腐買ってきて', '豆腐は切れてないよ', '卵が切れたら教えて']) {
      const r = handleUserText(s0, catalog, t);
      expect(r.state.inventory, t).toEqual(s0.inventory);
      expect(r.state.shopping, t).toEqual(s0.shopping);
      expect(r.replies[0].text, t).toMatch(/在庫に登録がありません|在庫にあります/);
    }
  });

  it('「醤油切れた」で、常備品も買い物リストに「買い足し」として載る', () => {
    const r = handleUserText(s0, catalog, '醤油切れた');
    const item = r.state.shopping.flatMap((l) => l.items).find((i) => i.ingredientId === 'soy_sauce');
    expect(item?.label).toBe('醤油 買い足し');
    expect(r.replies[0].text).toContain('買い物リストに入れました');
    expect(r.state.shopping.find((l) => l.items.includes(item!))!.pantry).not.toContain('醤油');
  });

  it('「醤油買った」（常備品）は、リストに触れない', () => {
    const r = handleUserText(s0, catalog, '醤油買った');
    expect(r.replies[0].text).not.toContain('買い物リスト');
  });

  it('家族の除外に当たる食材（卵）の特売・在庫は「来週の候補」「使えるように」と約束しない', () => {
    const sale = handleUserText(s0, catalog, '卵が安い');
    expect(sale.replies[0].text).toContain('除外');
    expect(sale.replies[0].text).not.toContain('来週の候補');
    const have = handleUserText(s0, catalog, '卵買った');
    expect(have.replies[0].text).not.toContain('使えるように');
  });

  it('「〇〇冷凍した」で在庫を冷凍にする（買った日は変えない）', () => {
    const bought = handleUserText(s0, catalog, '合いびき肉買った').state;
    const r = handleUserText(advanceDay(bought, catalog).state, catalog, '合いびき肉冷凍した');
    expect(r.state.inventory.find((i) => i.ingredientId === 'ground_mix')).toMatchObject({ frozen: true, acquiredOn: MONDAY });
  });
});

describe('今日は無理：移す先と冷凍の案内', () => {
  it('買ってある傷みやすい食材が、移した先まで持たないときだけ、言い切って冷凍を案内する', () => {
    let s = createInitialState(demoInput(), catalog, MONDAY);
    // 月曜のリストを全部チェックする（買った）
    for (const it of s.shopping[0].items) {
      s = applyAction(s, catalog, { type: 'check_item', shoppingDate: s.shopping[0].date, ingredientId: it.ingredientId, checked: true }).state;
    }
    const r = handleUserText(s, catalog, '今日は無理');
    const moved = r.state.meals.find((m) => m.date > MONDAY && m.dishIds[0] === 'salmon_foil');
    expect(moved).toBeDefined();
    // 鮭（日持ち2日）は水曜までは持つので冷凍の案内はしない
    expect(r.replies[0].text).not.toContain('明日までに使えなければ');
  });

  it('移す先の曜日の調理時間の上限を超えるなら、移さずに来週の候補へ回す', () => {
    const s0 = createInitialState(demoInput(), catalog, MONDAY);
    const raku = s0.meals.find((m) => m.kind === 'raku')!;
    const s: AppState = structuredClone(s0);
    s.household.settings.maxMinutes = { [new Date(`${raku.date}T00:00:00Z`).getUTCDay()]: 10 } as AppState['household']['settings']['maxMinutes'];
    const original = meal(s, MONDAY).dishIds[0];
    expect(findDish(s, catalog, original)!.minutes).toBeGreaterThan(10);
    const r = handleUserText(s, catalog, '今日は無理');
    expect(meal(r.state, raku.date).dishIds[0]).not.toBe(original);
    expect(r.replies[0].text).toContain('来週の候補');
  });
});

describe('古いボタン・残っている提案（押した時点で確かめ直す）', () => {
  it('2つの日の「別のに」に同じ候補が出ても、両方で選んで7日以内に同じ主菜を入れない', () => {
    const s0 = createInitialState(demoInput(), catalog, MONDAY);
    const days = s0.meals.filter((m) => m.kind === 'normal').map((m) => m.date);
    let found = false;
    for (const a of days) {
      for (const b of days) {
        if (b <= a) continue;
        const ra = applyAction(s0, catalog, { type: 'request_alternatives', date: a });
        const rb = applyAction(ra.state, catalog, { type: 'request_alternatives', date: b });
        const btnA = ra.replies[0].actions ?? [];
        const btnB = rb.replies[0].actions ?? [];
        const common = btnA.find((x) => btnB.some((y) => y.action.type === 'choose_alternative' && x.action.type === 'choose_alternative' && y.action.dishIds[0] === x.action.dishIds[0]));
        if (!common || common.action.type !== 'choose_alternative') continue;
        const id = common.action.dishIds[0];
        const sameB = btnB.find((y) => y.action.type === 'choose_alternative' && y.action.dishIds[0] === id)!;
        const s1 = applyAction(rb.state, catalog, common.action).state;
        const s2 = applyAction(s1, catalog, sameB.action);
        expect(meal(s2.state, b).dishIds[0]).not.toBe(id);
        expect(s2.replies[0].text).toContain('この案は使えません');
        found = true;
        break;
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });
});

describe('リクエストの返事', () => {
  it('同じ主菜がこれからの予定にあるときは「最近も食べています」と言わず、その日付を伝える', () => {
    const s0 = createInitialState(demoInput(), catalog, MONDAY);
    const later = s0.meals.find((m) => m.kind === 'normal' && m.date > addDays(MONDAY, 1))!;
    const name = findDish(s0, catalog, later.dishIds[0])!.name;
    const r = handleUserText(s0, catalog, `明日は${name}がいい`);
    expect(r.replies[0].text).not.toContain('最近も食べています');
    expect(r.replies[0].text).toContain(`にも${name}の予定があります`);
  });

  it('旬の外の料理を名指ししたら、入れられるが一言添える', () => {
    const s0 = createInitialState(demoInput(), catalog, MONDAY);
    const r = handleUserText(s0, catalog, '明日はさんまの塩焼きがいい');
    expect(r.replies[0].text).toContain('9〜10月ごろの料理です');
  });

  it('候補が2つ以上ある言い方（「炒め物がいい」）は、選んでもらう', () => {
    const s0 = createInitialState(demoInput(), catalog, MONDAY);
    const r = handleUserText(s0, catalog, '金曜は豚肉がいい');
    expect(r.state.proposals.at(-1)?.date ?? r.replies[0].card).toBeDefined();
    const loose = handleUserText(s0, catalog, '金曜は照り焼きがいい');
    const card = loose.replies[0].card;
    expect(card?.kind === 'alternatives' || loose.state.proposals.length > 0).toBe(true);
    for (const a of loose.replies[0].actions ?? []) expect(['choose_alternative', 'accept_proposal', 'reject_proposal']).toContain(a.action.type);
  });
});

describe('週の作り直し', () => {
  it('自分で替えた日・特売で替えた日は残し、ほかの日だけを作り直す', () => {
    const s0 = createInitialState(demoInput(), catalog, MONDAY);
    const day = s0.meals.find((m) => m.kind === 'normal' && m.date > MONDAY)!;
    const changed = applyAction(s0, catalog, { type: 'choose_alternative', date: day.date, dishIds: ['tofu_steak', 'cabbage_shiomomi'] }).state;
    expect(meal(changed, day.date).changedBy).toBe('user');
    const s1: AppState = structuredClone(changed);
    s1.household.settings.rakuPerWeek = 2;
    const r = applyAction(s1, catalog, { type: 'regenerate_week', weekStart: MONDAY });
    expect(meal(r.state, day.date).dishIds).toEqual(['tofu_steak', 'cabbage_shiomomi']);
    expect(r.replies[0].text).toContain('そのままです');
  });
});
