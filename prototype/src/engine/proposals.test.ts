// 1つの書き込みの返事に出した提案は、返事が届いたときにすべて使える（同じ日に2つ目の提案を出さない）。
// 提案は日ごとに1つ（state.proposals は日付で置き換わる）なので、同じ返事で同じ日にあとから提案を出すと、
// 前の提案の［替える］が「その提案は、もう使えません。」になっていた。
import type { AppState, ChatMessage, ParsedCommand } from './index';
import { addDays, applyAction, createInitialState, handleUserText } from './index';
import { MONDAY, catalog, demoInput } from './__fixtures__/catalog';

const TUE = addDays(MONDAY, 1);
const THU = addDays(MONDAY, 3);
const FRI = addDays(MONDAY, 4);

/** 返事に出た提案の id（［替える］のボタン）。 */
function shownProposals(replies: ChatMessage[]): string[] {
  return replies.flatMap((m) => (m.actions ?? []).flatMap((a) => (a.action.type === 'accept_proposal' ? [a.action.proposalId] : [])));
}

/** 返事に出た提案が、すべて今もあり、日が重ならず、押せば替わること。提案の日を返す。 */
function expectAllUsable(r: { state: AppState; replies: ChatMessage[] }, text: string): string[] {
  const ids = shownProposals(r.replies);
  const dates = ids.map((id) => r.state.proposals.find((p) => p.id === id)?.date ?? 'gone');
  expect(dates, text).not.toContain('gone');
  expect(new Set(dates).size, text).toBe(dates.length);
  for (const id of ids) {
    const accepted = applyAction(r.state, catalog, { type: 'accept_proposal', proposalId: id });
    expect(accepted.replies[0].text, text).toContain('に替えました');
  }
  return dates;
}

describe('同じ書き込みの中では、1つの日に提案は1つ', () => {
  const tue = createInitialState(demoInput(), catalog, TUE);
  const mon = createInitialState(demoInput(), catalog, MONDAY);

  it('あとの特売は、提案のない別の日を選ぶ（「鶏むねが安い。鶏ももも安い」）', () => {
    const r = handleUserText(tue, catalog, '鶏むねが安い。鶏ももも安い');
    expect(expectAllUsable(r, '鶏むね・鶏もも')).toEqual([THU, FRI]);
  });

  it('ほかに替えられる日がなければ、2つ目の提案は出さず、重なると短く伝える', () => {
    for (const text of ['鶏むねが安い。豚こまも安い', '鶏むねと豚こまが安い']) {
      const r = handleUserText(tue, catalog, text);
      expect(expectAllUsable(r, text)).toEqual([THU]);
      expect(r.replies).toHaveLength(2);
      const second = r.replies[1];
      expect(second.text, text).toBe(
        '豚こま切れ肉、いいですね。替えられる日（11/12(木)）には、上で別の案を出しています。\n豚こま切れ肉の案にしたいときは、もう一度「豚こま切れ肉が安い」と送ってください。',
      );
      expect(second.actions, text).toBeUndefined();
      // 残っている提案は、1つ目（鶏むね）の提案
      expect(r.state.proposals.map((p) => p.text)).toEqual([expect.stringContaining('鶏むね肉が安いので')]);
    }
  });

  it('2つの案の片方を選ぶと（替える・そのまま）、もう片方の案をボタンつきで出し直す（どちらもボタンで選べる）', () => {
    const r = handleUserText(tue, catalog, '鶏むねが安い。鶏ももも安い');
    const [a, b] = shownProposals(r.replies);
    for (const first of ['accept_proposal', 'reject_proposal'] as const) {
      const one = applyAction(r.state, catalog, { type: first, proposalId: a });
      const again = one.replies[one.replies.length - 1];
      expect(again.text.split('\n')[0]).toBe('もう1つの案も、ボタンで選べます。');
      expect(shownProposals([again])).toEqual([b]);
      expect(again.card).toEqual({ kind: 'meal', date: FRI });
      // 出し直した［替える］で替わる。そのあとは出し直さない
      const two = applyAction(one.state, catalog, { type: 'accept_proposal', proposalId: b });
      expect(two.replies).toHaveLength(1);
      expect(two.replies[0].text).toContain('に替えました');
      // 文字の「はい」でも、残った案を選べる
      const yes = handleUserText(one.state, catalog, 'はい');
      expect(yes.replies[0].text).toContain('に替えました');
      expect(yes.state.proposals).toEqual([]);
    }
  });

  it('重なると伝えた案は、その言葉だけを送り直せば出る（前の書き込みの案は置き換わる）', () => {
    const first = handleUserText(tue, catalog, '鶏むねが安い。豚こまも安い');
    const again = handleUserText(first.state, catalog, '豚こま切れ肉が安い');
    expect(expectAllUsable(again, '送り直し')).toEqual([THU]);
    expect(again.replies[0].text).toContain('豚こま切れ肉が安いので');
    expect(again.state.proposals).toHaveLength(1);
  });

  it('同じ日のリクエストも重ねない（「金曜は別のに。金曜は生姜焼きがいい」）。送り直し方を伝える', () => {
    const r = handleUserText(mon, catalog, '金曜は別のに。金曜は生姜焼きがいい');
    expect(r.replies).toHaveLength(2);
    expect(r.replies[0].card).toMatchObject({ kind: 'alternatives', date: FRI });
    expect(r.replies[1].text).toBe('11/13(金)には、上で別の案を出しています。\nこのリクエストにしたいときは、それだけをもう一度送ってください。');
    expect(r.state.proposals).toEqual([]);
    const again = handleUserText(r.state, catalog, '金曜は生姜焼きがいい');
    expect(expectAllUsable(again, 'リクエストの送り直し')).toEqual([FRI]);
  });

  it('同じ命令が2つあっても（LLM の結果など）、提案は1つ', () => {
    const twice: ParsedCommand[] = [
      { type: 'sale', ingredientId: 'chicken_breast' },
      { type: 'sale', ingredientId: 'chicken_breast' },
    ];
    const r = handleUserText(tue, catalog, '鶏むねが安い', twice);
    expect(r.replies).toHaveLength(1);
    expect(expectAllUsable(r, 'LLM')).toEqual([THU]);
  });

  it('特売と在庫（「鶏むねが安い。鶏ももを買った」）も、同じ日に重ねない', () => {
    const r = handleUserText(tue, catalog, '鶏むねが安い。鶏ももを買った');
    const dates = expectAllUsable(r, '特売と在庫');
    expect(dates[0]).toBe(THU);
    expect(r.replies.map((m) => m.text).join('\n')).toContain('鶏もも肉を在庫に入れました');
  });

  it('前の書き込みの提案は、今までどおり置き換わる', () => {
    const first = handleUserText(tue, catalog, '豚こまが安い');
    const [old] = first.state.proposals;
    expect(old.date).toBe(THU);
    const r = handleUserText(first.state, catalog, '鶏むねが安い');
    expect(expectAllUsable(r, '前の提案')).toEqual([THU]);
    expect(r.state.proposals.some((p) => p.id === old.id)).toBe(false);
  });

  it('日を決めた案（日付つきのリクエスト・別のに）を先に出し、特売はほかの日を選ぶ', () => {
    for (const text of ['鶏むねが安い。金曜は生姜焼きがいい', '鶏むねが安い。金曜は別のに']) {
      const r = handleUserText(mon, catalog, text);
      expectAllUsable(r, text);
      // 金曜の案（リクエストの提案か、別の案）は先に出る。鶏むねの提案は金曜以外の日
      expect(r.replies[0].card, text).toMatchObject({ date: FRI });
      const sale = r.state.proposals.find((p) => p.text.includes('鶏むね肉が安いので'));
      expect(sale?.date, text).toBeDefined();
      expect(sale?.date, text).not.toBe(FRI);
    }
  });

  it('その日の予定を変える命令（欠席・今日は無理）を先に処理し、その日に使えない提案を出さない', () => {
    // 月曜の金曜は鶏の照り焼き：書いた順に処理すると、鶏むねの提案を金曜に出したあとで金曜が「夕食なし」になる
    const out = handleUserText(mon, catalog, '鶏むねが安い。金曜はみんな外食');
    expect(out.replies[0].text).toContain('みんな外で食べるんですね');
    expect(expectAllUsable(out, '外食')).not.toContain(FRI);
    // 今日（月曜）は鮭のホイル焼き：さばの提案を今日に出したあとで「今日は無理」が今日をラク日にすると、提案が使えなくなる
    const raku = handleUserText(mon, catalog, 'さばが安い。今日は無理');
    expect(raku.replies[0].text).toContain('今日はラクしましょう');
    expect(expectAllUsable(raku, '今日は無理')).not.toContain(MONDAY);
  });
});
