import type { Member, ParsedCommand } from './index';
import { parseMessage } from './index';
import { MONDAY, catalog } from './__fixtures__/catalog';

const members: Member[] = [
  { id: 'member_1', nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
  { id: 'member_2', nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] },
  { id: 'member_3', nickname: 'たろう', ageBand: 'child', role: 'child', exclusions: [{ type: 'allergen', id: 'egg' }] },
  { id: 'member_4', nickname: 'はな', ageBand: 'preschool', role: 'child', exclusions: [] },
];
const ctx = { today: MONDAY, members, catalog }; // 2026-11-09（月）

const cases: [string, ParsedCommand[]][] = [
  // 特売
  ['@きめとく 鶏むねが安い', [{ type: 'sale', ingredientId: 'chicken_breast' }]],
  ['鶏むねが安い', [{ type: 'sale', ingredientId: 'chicken_breast' }]],
  ['とりむね特売してる', [{ type: 'sale', ingredientId: 'chicken_breast' }]],
  ['鶏むね、安い', [{ type: 'sale', ingredientId: 'chicken_breast' }]],
  ['豚こま切れが安い', [{ type: 'sale', ingredientId: 'pork_koma' }]],
  // 在庫
  ['卵切れた', [{ type: 'out_of_stock', ingredientId: 'egg' }]],
  ['卵がない', [{ type: 'out_of_stock', ingredientId: 'egg' }]],
  ['たまご切らした', [{ type: 'out_of_stock', ingredientId: 'egg' }]],
  ['カレールウ切れた', [{ type: 'out_of_stock', ingredientId: 'curry_roux' }]],
  ['豆腐買った', [{ type: 'have', ingredientId: 'tofu' }]],
  ['とうふ買ってきた', [{ type: 'have', ingredientId: 'tofu' }]],
  ['＠きめとく　ミルク買った', [{ type: 'have', ingredientId: 'milk' }]],
  ['冷凍ぎょうざ買った', [{ type: 'have', ingredientId: 'frozen_gyoza' }]],
  ['卵はあるけど牛乳がない', [{ type: 'have', ingredientId: 'egg' }, { type: 'out_of_stock', ingredientId: 'milk' }]],
  // 今日は無理
  ['今日は無理', [{ type: 'today_impossible' }]],
  ['疲れた', [{ type: 'today_impossible' }]],
  ['今日は帰りが遅いので無理', [{ type: 'today_impossible' }]],
  ['水曜は無理', [{ type: 'want_alternatives', date: '2026-11-11' }]],
  // 別のに
  ['別のにして', [{ type: 'want_alternatives' }]],
  ['明日のは別のがいい', [{ type: 'want_alternatives', date: '2026-11-10' }]],
  // 表示
  ['今週の献立', [{ type: 'show_week' }]],
  ['今日のごはん', [{ type: 'show_today' }]],
  ['今日のごはんは？', [{ type: 'show_today' }]],
  ['買い物リスト', [{ type: 'show_shopping' }]],
  ['使い方', [{ type: 'help' }]],
  ['明日のごはんは？', [{ type: 'show_week' }]],
  ['金曜の夕飯なんだっけ', [{ type: 'show_week' }]],
  // リクエスト
  ['金曜はカレーがいい', [{ type: 'request', date: '2026-11-13', dishId: 'curry' }]],
  ['金曜日は魚がいい', [{ type: 'request', date: '2026-11-13', protein: 'fish' }]],
  ['木曜は和食がいい', [{ type: 'request', date: '2026-11-12', genre: 'wa' }]],
  ['カレーにして', [{ type: 'request', dishId: 'curry' }]],
  ['親子丼が食べたい', [{ type: 'request', dishId: 'oyakodon' }]],
  ['からあげがいい', [{ type: 'request', dishId: 'karaage' }]],
  ['11/13は照り焼きがいい', [{ type: 'request', date: '2026-11-13', dishId: 'teriyaki_chicken' }]],
  ['来週の月曜は鮭がいい', [{ type: 'request', date: '2026-11-16', protein: 'fish' }]],
  // 欠席
  ['水曜は夫が飲み会', [{ type: 'absence', date: '2026-11-11', memberRef: '夫' }]],
  ['パパは木曜いらない', [{ type: 'absence', date: '2026-11-12', memberRef: 'パパ' }]],
  ['上の子は明日いらない', [{ type: 'absence', date: '2026-11-10', memberRef: '上の子' }]],
  ['たろうは金曜塾で遅い', [{ type: 'absence', date: '2026-11-13', memberRef: 'たろう' }]],
  ['今日は外食', [{ type: 'absence', date: '2026-11-09', memberRef: 'みんな' }]],
  // 複数の命令
  ['卵切れた。水曜は夫が飲み会', [{ type: 'out_of_stock', ingredientId: 'egg' }, { type: 'absence', date: '2026-11-11', memberRef: '夫' }]],
  ['@きめとく 豆腐買った\n金曜はカレーがいい', [{ type: 'have', ingredientId: 'tofu' }, { type: 'request', date: '2026-11-13', dishId: 'curry' }]],
  // わからない
  ['ありがとう', [{ type: 'unknown', text: 'ありがとう' }]],
];

describe('parseMessage（ルールベース）', () => {
  it.each(cases)('「%s」', (text, expected) => {
    expect(parseMessage(text, ctx)).toEqual(expected);
  });

  it(`例文は20以上（${cases.length}）`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it('曜日は今日を含めて次に来る日（月曜に「月曜」は今日）', () => {
    expect(parseMessage('月曜はカレーがいい', ctx)).toEqual([{ type: 'request', date: '2026-11-09', dishId: 'curry' }]);
    expect(parseMessage('日曜はパパがいない', ctx)).toEqual([{ type: 'absence', date: '2026-11-15', memberRef: 'パパ' }]);
  });

  it('あさって・明後日', () => {
    expect(parseMessage('あさってはママが飲み会', ctx)).toEqual([{ type: 'absence', date: '2026-11-11', memberRef: 'ママ' }]);
  });

  it('「食べやすい」は特売と読まない', () => {
    expect(parseMessage('鶏むねは食べやすい', ctx).some((c) => c.type === 'sale')).toBe(false);
  });
});
