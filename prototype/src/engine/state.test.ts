import type { AppState, ChatMessage } from './index';
import { addDays, advanceDay, applyAction, createInitialState, handleUserText, weekStartOf, weeklySummary } from './index';
import { MONDAY, catalog, demoInput } from './__fixtures__/catalog';

const NEXT_MONDAY = '2026-11-16';
const hasWeek = (s: AppState, ws: string) => s.meals.some((m) => weekStartOf(m.date) === ws);

function advance(s: AppState, days: number): { state: AppState; replies: ChatMessage[][] } {
  const replies: ChatMessage[][] = [];
  for (let i = 0; i < days; i++) {
    const r = advanceDay(s, catalog);
    s = r.state;
    replies.push(r.replies);
  }
  return { state: s, replies };
}

describe('createInitialState', () => {
  const s = createInitialState(demoInput(), catalog, MONDAY);

  it('メンバーに id を振り、settings に既定値を入れる', () => {
    expect(s.household.members.map((m) => m.id)).toEqual(['member_1', 'member_2', 'member_3', 'member_4']);
    expect(s.household.settings).toEqual({
      plan: 'free',
      dinnerWeekdays: [1, 2, 3, 4, 5],
      shoppingWeekdays: [0, 3],
      rakuPerWeek: 1,
      newPerWeek: 1,
      sidePolicy: 'side_or_soup',
      maxMinutes: {},
      allowUncertainWithExclusions: false,
    });
    expect(s.version).toBe(1);
    expect(s.today).toBe(MONDAY);
    expect(s.household.createdAt).toBe(MONDAY);
  });

  it('自由入力の定番を custom の料理として登録する', () => {
    expect(s.household.customDishes).toEqual([
      {
        id: 'custom_1', name: 'ばあばの煮物', role: 'main', protein: 'none', genre: 'wa', minutes: 30,
        ingredients: [], kidFriendly: true, spicy: false, tags: ['custom'], custom: true,
      },
    ]);
    expect(s.household.favorites.map((f) => f.dishId)).toContain('custom_1');
  });

  it('マスタにある料理名を自由入力したら、マスタの料理を定番にする', () => {
    const t = createInitialState(demoInput({ favoriteDishIds: [], customFavoriteNames: ['ぶりの照り焼き', ' '] }), catalog, MONDAY);
    expect(t.household.customDishes).toEqual([]);
    expect(t.household.favorites).toEqual([{ dishId: 'buri_teri' }]);
  });

  it('最初のあいさつ、注意（householdNotices）、週の献立を chat に入れる（無料版は push なし）', () => {
    expect(s.chat).toHaveLength(3);
    expect(s.chat[0].text).toContain('きめとく');
    expect(s.chat[1].card?.kind).toBe('notice');
    const notice = s.chat[1].card;
    expect(notice?.kind === 'notice' && notice.lines[0]).toBe('アプリは除外の補助で、アレルギーの安全を保証するものではありません');
    expect(s.chat[2].card).toEqual({ kind: 'week', weekStart: MONDAY });
    expect(s.chat.some((m) => m.push)).toBe(false);
    expect(new Set(s.chat.map((m) => m.id)).size).toBe(3);
  });

  it('有料版なら週の献立を push で入れる', () => {
    const paid = createInitialState(demoInput({ plan: 'paid' }), catalog, MONDAY);
    expect(paid.chat.find((m) => m.card?.kind === 'week')?.push).toBe(true);
  });

  it('土曜に始めたら、今週の献立はなく、来週の献立を作る', () => {
    const sat = createInitialState(demoInput(), catalog, '2026-11-14');
    expect(hasWeek(sat, MONDAY)).toBe(false);
    expect(hasWeek(sat, NEXT_MONDAY)).toBe(true);
    expect(sat.chat.find((m) => m.card?.kind === 'week')?.card).toEqual({ kind: 'week', weekStart: NEXT_MONDAY });
  });
});

describe('advanceDay', () => {
  const start = createInitialState(demoInput(), catalog, MONDAY);

  it('1日進め、前日の献立を unconfirmed にして「作りましたか？」と1問だけ聞く', () => {
    const r = advanceDay(start, catalog);
    expect(r.state.today).toBe('2026-11-10');
    expect(r.state.meals.find((m) => m.date === MONDAY)?.status).toBe('unconfirmed');
    expect(r.replies).toHaveLength(1);
    expect(r.replies[0].text).toMatch(/^昨日の.+は作りましたか？$/);
    expect(r.replies[0].actions?.map((a) => a.action)).toEqual([
      { type: 'cooked', date: MONDAY },
      { type: 'not_cooked', date: MONDAY },
    ]);
    expect(r.replies[0].push).toBeUndefined();
  });

  it('前日に「作った」なら聞かない', () => {
    const cooked = applyAction(start, catalog, { type: 'cooked', date: MONDAY }).state;
    const r = advanceDay(cooked, catalog);
    expect(r.replies).toHaveLength(0);
    expect(r.state.meals.find((m) => m.date === MONDAY)?.status).toBe('cooked');
  });

  it('来週の献立は、最初の買い物日（日曜）の前日＝土曜に作る', () => {
    const { state: fri } = advance(start, 4);
    expect(fri.today).toBe('2026-11-13');
    expect(hasWeek(fri, NEXT_MONDAY)).toBe(false);
    const sat = advanceDay(fri, catalog).state;
    expect(sat.today).toBe('2026-11-14');
    expect(hasWeek(sat, NEXT_MONDAY)).toBe(true);
    expect(sat.meals.filter((m) => weekStartOf(m.date) === NEXT_MONDAY).map((m) => m.date)).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
    ]);
    // 来週の月・火の材料は日曜のリストに入る
    const sunday = sat.shopping.find((l) => l.date === '2026-11-15');
    expect(sunday).toBeDefined();
    expect(sunday!.items.every((i) => i.forDates.every((d) => d <= '2026-11-17'))).toBe(true);
  });

  it('買い物日が月曜だけなら、日曜に来週の献立を作る', () => {
    const mon = createInitialState(demoInput({ shoppingWeekdays: [1] }), catalog, MONDAY);
    const { state: sat } = advance(mon, 5);
    expect(hasWeek(sat, NEXT_MONDAY)).toBe(false);
    expect(hasWeek(advanceDay(sat, catalog).state, NEXT_MONDAY)).toBe(true);
  });

  it('無料版は配信（push）しない', () => {
    const { replies } = advance(start, 8);
    expect(replies.flat().some((m) => m.push)).toBe(false);
  });

  it('有料版は、その日の献立・週の献立（振り返りつき）を push で届ける', () => {
    const paid = createInitialState(demoInput({ plan: 'paid' }), catalog, MONDAY);
    const cooked = applyAction(paid, catalog, { type: 'cooked', date: MONDAY }).state;
    const reacted = applyAction(cooked, catalog, { type: 'react', date: MONDAY, memberId: 'member_1', reaction: 'great' }).state;
    const { replies } = advance(reacted, 5);
    const tue = replies[0].find((m) => m.push && m.card?.kind === 'meal');
    expect(tue?.text).toMatch(/^今日は/);
    expect(tue?.actions?.map((a) => a.label)).toEqual(['作った', '別のに', '今日は無理']);
    const weekly = replies[4].find((m) => m.push && m.card?.kind === 'week');
    expect(weekly?.card).toEqual({ kind: 'week', weekStart: NEXT_MONDAY });
    expect(weekly?.text).toContain('来週の夕食です');
    // 記録のない日は「分からない」として数えない（5日のうち1日、とは言わない）
    expect(weekly?.text).toContain('今週は記録のあった1日のうち1日、考えずに済みました');
    expect(weekly?.text).toContain('いちばん人気は');
  });

  it('有料版は、冷凍した食材を使う日の前日に解凍の連絡を届ける', () => {
    // 日曜だけ買い物する家庭は、週の後半の肉・魚を冷凍することになる
    const paid = createInitialState(demoInput({ plan: 'paid', shoppingWeekdays: [0] }), catalog, '2026-11-15');
    const { replies } = advance(paid, 5);
    const thaw = replies.flat().filter((m) => m.push && m.text.includes('冷凍室から冷蔵室へ'));
    expect(thaw.length).toBeGreaterThan(0);
    expect(thaw[0].text).toMatch(/^明日の.+用に、.+を冷凍室から冷蔵室へ移しておいてください。$/);
  });

  it('古い週の献立は片づけ、先週の分は振り返りのために残す', () => {
    const { state } = advance(start, 15); // 11/24（火）
    expect(state.meals.some((m) => m.date < '2026-11-16')).toBe(false);
    expect(state.meals.some((m) => weekStartOf(m.date) === NEXT_MONDAY)).toBe(true);
  });

  it('過ぎた日の提案は消す', () => {
    const r = handleUserText(start, catalog, '金曜は魚がいい');
    if (r.state.proposals.length === 0) return;
    const { state } = advance(r.state, 5);
    expect(state.proposals).toEqual([]);
  });
});

describe('weeklySummary', () => {
  it('作った日・作れなかった日・人気の料理を数える', () => {
    let s = createInitialState(demoInput(), catalog, MONDAY);
    const monMain = s.meals[0].dishIds[0];
    s = applyAction(s, catalog, { type: 'cooked', date: MONDAY }).state;
    s = applyAction(s, catalog, { type: 'react', date: MONDAY, memberId: 'household', reaction: 'great' }).state;
    s = advanceDay(s, catalog).state; // 火
    s = handleUserText(s, catalog, '今日は無理').state;
    s = applyAction(s, catalog, { type: 'cooked', date: '2026-11-10' }).state;
    s = advanceDay(s, catalog).state; // 水
    s = applyAction(s, catalog, { type: 'not_cooked', date: '2026-11-11' }).state;
    const sum = weeklySummary(s, catalog, MONDAY);
    expect(sum.weekStart).toBe(MONDAY);
    expect(sum.plannedDays).toBe(5);
    expect(sum.decidedWithoutThinking).toBe(2);
    expect(sum.skippedOrImpossible).toBe(2);
    expect(sum.topDishIds).toEqual([monMain]);
  });

  it('来週の献立と一緒に、終わった週の振り返りを伝える（無料版はメニューから開いたとき）', () => {
    let s = createInitialState(demoInput(), catalog, MONDAY);
    s = applyAction(s, catalog, { type: 'cooked', date: MONDAY }).state;
    s = advance(s, 5).state; // 土曜
    const r = handleUserText(s, catalog, '今週の献立');
    const week = r.replies.find((m) => m.card?.kind === 'week' && m.card.weekStart === NEXT_MONDAY);
    expect(week?.text).toContain('今週は記録のあった1日のうち1日、考えずに済みました');
    expect(addDays(s.today, 0)).toBe('2026-11-14');
  });
});

describe('レビューで見つかった問題の再発防止（配信・振り返り・反応・買い物）', () => {
  it('有料版で何も押さない週の配信に「0日、考えずに済みました」と出さない', () => {
    const paid = createInitialState(demoInput({ plan: 'paid' }), catalog, MONDAY);
    const { replies } = advance(paid, 5); // 土曜：来週の献立の配信
    const weekly = replies.flat().find((m) => m.push && m.card?.kind === 'week' && m.card.weekStart === NEXT_MONDAY);
    expect(weekly?.text).toContain('今週は5日分の献立でした');
    expect(weekly?.text).not.toContain('0日、考えずに');
    const sum = weeklySummary(advance(paid, 6).state, catalog, MONDAY);
    expect(sum.unconfirmedDays).toBe(5);
  });

  it('有料版の反応は一人ずつ：押した人のあとも、残りの人のボタンが付く。全員そろったら付けない', () => {
    const paid = createInitialState(demoInput({ plan: 'paid' }), catalog, MONDAY);
    let s = applyAction(paid, catalog, { type: 'cooked', date: MONDAY }).state;
    const ids = s.household.members.filter((m) => m.ageBand !== 'infant').map((m) => m.id);
    for (let i = 0; i < ids.length; i++) {
      const r = applyAction(s, catalog, { type: 'react', date: MONDAY, memberId: ids[i], reaction: 'great' });
      s = r.state;
      const left = ids.length - i - 1;
      expect(r.replies[0].actions?.length ?? 0, `${i}`).toBe(left * 3);
      if (left > 0) expect(r.replies[0].text).toContain('ほかの人の分もどうぞ');
      else expect(r.replies[0].text).toContain('全員分そろいました');
    }
    expect(s.history.find((h) => h.date === MONDAY)?.reactions).toHaveLength(ids.length);
  });

  it('献立の曜日が週の後半だけ（水〜金、買い物は水）でも、作る日（火曜）に週の献立を配信する', () => {
    const base = createInitialState(demoInput({ plan: 'paid', shoppingWeekdays: [3] }), catalog, MONDAY);
    const s: AppState = structuredClone(base);
    s.household.settings.dinnerWeekdays = [3, 4, 5];
    const { replies } = advance(s, 9); // 11/18（水）まで
    const pushed = replies.map((day, i) => ({ day: addDays(MONDAY, i + 1), weeks: day.filter((m) => m.push && m.card?.kind === 'week').map((m) => (m.card?.kind === 'week' ? m.card.weekStart : '')) }));
    expect(pushed.find((p) => p.weeks.includes(NEXT_MONDAY))?.day).toBe('2026-11-17');
  });

  it('来週の作る日を過ぎてから始めたら（水曜に始め、買い物も水曜）、来週の献立も知らせる', () => {
    const s = createInitialState(demoInput({ plan: 'paid', shoppingWeekdays: [3] }), catalog, '2026-11-11');
    const weeks = s.chat.filter((m) => m.card?.kind === 'week').map((m) => (m.card?.kind === 'week' ? m.card.weekStart : ''));
    expect(weeks).toEqual([MONDAY, NEXT_MONDAY]);
    expect(s.chat.filter((m) => m.card?.kind === 'week').every((m) => m.push)).toBe(true);
  });

  it('過ぎた買い物日のリストで、まだチェックしていない物も「買い物リスト」で見せる', () => {
    const start = createInitialState(demoInput(), catalog, MONDAY);
    const tue = advanceDay(start, catalog).state;
    const r = handleUserText(tue, catalog, '買い物リスト');
    expect(r.replies[0].card).toEqual({ kind: 'shopping', date: MONDAY });
    expect(r.replies[0].text).toContain('まだチェックしていない物');
  });
});
