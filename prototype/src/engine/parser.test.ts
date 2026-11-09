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
  // 今日以外の1日の献立を聞かれたら、その日の献立（週の献立ではなく）
  ['明日のごはんは？', [{ type: 'show_today', date: '2026-11-10' }]],
  ['金曜の夕飯なんだっけ', [{ type: 'show_today', date: '2026-11-13' }]],
  // リクエスト
  ['金曜はカレーがいい', [{ type: 'request', date: '2026-11-13', dishId: 'curry' }]],
  ['金曜日は魚がいい', [{ type: 'request', date: '2026-11-13', protein: 'fish' }]],
  ['木曜は和食がいい', [{ type: 'request', date: '2026-11-12', genre: 'wa' }]],
  ['カレーにして', [{ type: 'request', dishId: 'curry' }]],
  ['親子丼が食べたい', [{ type: 'request', dishId: 'oyakodon' }]],
  ['からあげがいい', [{ type: 'request', dishId: 'karaage' }]],
  // 「照り焼き」は複数の料理に当たるので、候補から選んでもらう
  ['11/13は照り焼きがいい', [{ type: 'request', date: '2026-11-13', dishIds: ['teriyaki_chicken', 'chicken_honey', 'buri_teri'] }]],
  // 食材を名指ししたリクエストは、その食材を先に探す（たんぱく源も残す）
  ['来週の月曜は鮭がいい', [{ type: 'request', date: '2026-11-16', protein: 'fish', ingredientId: 'salmon' }]],
  // 欠席
  ['水曜は夫が飲み会', [{ type: 'absence', date: '2026-11-11', memberRef: '夫' }]],
  ['パパは木曜いらない', [{ type: 'absence', date: '2026-11-12', memberRef: 'パパ' }]],
  ['上の子は明日いらない', [{ type: 'absence', date: '2026-11-10', memberRef: '上の子' }]],
  // 塾・部活・残業で遅くなるだけは、欠席にしない（人数も除外もそのまま。献立は変えずに送り方を返す）
  ['たろうは金曜塾で遅い', [{ type: 'absence', date: '2026-11-13', memberRef: 'たろう', tentative: 'late' }]],
  ['たろうは金曜塾でいらない', [{ type: 'absence', date: '2026-11-13', memberRef: 'たろう' }]],
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

describe('parseMessage：日付・否定・質問・頼む形', () => {
  const p = (text: string) => parseMessage(text, ctx);

  it('昨日・先週の話では、今日を変えない（前日の確認への答えは会話の側で扱う）', () => {
    for (const t of ['昨日は無理だった', '昨日は外食だった', 'おととい外食', '先週は外食多かった', 'きのうは疲れて作れなかった']) {
      expect(p(t), t).toEqual([{ type: 'unknown', text: t }]);
    }
  });

  it('週末・土日は土曜と日曜、再来週は14日先', () => {
    expect(p('今週末は外食')).toEqual([
      { type: 'absence', date: '2026-11-14', memberRef: 'みんな' },
      { type: 'absence', date: '2026-11-15', memberRef: 'みんな' },
    ]);
    expect(p('週末はパパいない').map((c) => c.type === 'absence' && c.date)).toEqual(['2026-11-14', '2026-11-15']);
    expect(p('再来週の水曜はパパいらない')).toEqual([{ type: 'absence', date: '2026-11-25', memberRef: 'パパ' }]);
  });

  it('日付が複数あれば、日ごとに欠席にする', () => {
    expect(p('明日と明後日はパパいない')).toEqual([
      { type: 'absence', date: '2026-11-10', memberRef: 'パパ' },
      { type: 'absence', date: '2026-11-11', memberRef: 'パパ' },
    ]);
    expect(p('水曜と木曜はパパいない').length).toBe(2);
  });

  it('人が分からない欠席（「来週の月曜は出張」）は、週の献立に落とさず聞き返す（memberRef が空）', () => {
    expect(p('来週の月曜は出張')).toEqual([{ type: 'absence', date: '2026-11-16', memberRef: '' }]);
    expect(p('水曜は出張')).toEqual([{ type: 'absence', date: '2026-11-11', memberRef: '' }]);
    // 「帰りが遅いので無理」は今日は無理のまま
    expect(p('今日は帰りが遅いので無理')).toEqual([{ type: 'today_impossible' }]);
  });

  it('並べた人・食材は全部読む', () => {
    expect(p('今日はパパとたろういない')).toEqual(
      expect.arrayContaining([
        { type: 'absence', date: MONDAY, memberRef: 'パパ' },
        { type: 'absence', date: MONDAY, memberRef: 'たろう' },
      ]),
    );
    expect(p('パパとママ今日いない')).toHaveLength(2);
    expect(p('卵、牛乳、豆腐買った')).toEqual(
      expect.arrayContaining([
        { type: 'have', ingredientId: 'egg' },
        { type: 'have', ingredientId: 'milk' },
        { type: 'have', ingredientId: 'tofu' },
      ]),
    );
  });

  it('欠席の取り消し（「木曜はたろういる」「お泊まりなくなった」「お泊まり中止」）', () => {
    expect(p('木曜はたろういる')).toEqual([{ type: 'absence', date: '2026-11-12', memberRef: 'たろう', cancel: true }]);
    expect(p('たろうは木曜やっぱり食べる')).toEqual([{ type: 'absence', date: '2026-11-12', memberRef: 'たろう', cancel: true }]);
    expect(p('木曜のお泊まりなくなった')).toEqual([{ type: 'absence', date: '2026-11-12', memberRef: 'みんな', cancel: true }]);
    expect(p('たろうのお泊まり中止')).toEqual([{ type: 'absence', date: MONDAY, memberRef: 'たろう', cancel: true }]);
    // 「外で食べる」は欠席のまま
    expect(p('パパは外で食べる')).toEqual([{ type: 'absence', date: MONDAY, memberRef: 'パパ' }]);
  });

  it('否定の文では、献立も在庫も変えない（今日の献立を見せて確かめる）', () => {
    for (const t of ['今日は無理じゃない', '今日は疲れてない', '今日は外食じゃない', '今日は外食じゃなくて家で食べる']) {
      expect(p(t), t).toEqual([{ type: 'show_today' }]);
    }
    // 「無理しない」は「ラクする」の意味なので、今日は無理のまま
    expect(p('今日は無理しない')).toEqual([{ type: 'today_impossible' }]);
    expect(p('卵は切れてない')).toEqual([{ type: 'have', ingredientId: 'egg', question: true }]);
    expect(p('豆腐は切れてないよ')).toEqual([{ type: 'have', ingredientId: 'tofu', question: true }]);
  });

  it('仮定・質問・頼む形では、在庫を変えずに今の状態を答える（question）', () => {
    for (const [t, id] of [
      ['卵が切れたら教えて', 'egg'], ['豆腐あったっけ？', 'tofu'], ['卵ある？', 'egg'], ['卵って切れてる？', 'egg'],
      ['帰りに豆腐買ってきて', 'tofu'], ['豆腐買っておいて', 'tofu'], ['牛乳買ってくるね', 'milk'], ['牛乳買っといて', 'milk'],
    ] as const) {
      expect(p(t), t).toEqual([{ type: 'have', ingredientId: id, question: true }]);
    }
    expect(p('パパは水曜いらないって言ってたっけ？')).toEqual([{ type: 'show_week' }]);
    expect(p('豆腐買ってきた')).toEqual([{ type: 'have', ingredientId: 'tofu' }]);
  });

  it('「〇〇冷凍した」は冷凍の記録', () => {
    expect(p('合いびき肉冷凍した')).toEqual([{ type: 'have', ingredientId: 'ground_mix', frozen: true }]);
  });

  it('料理名のあいまいな一致：食材の語をそろえて照合し、語尾だけ・複数に当たるときは候補にする', () => {
    expect(p('生姜焼きがいい')).toEqual([{ type: 'request', dishId: 'shogayaki' }]);
    expect(p('しょうが焼きがいい')).toEqual([{ type: 'request', dishId: 'shogayaki' }]);
    expect(p('金曜は生姜焼きにして')).toEqual([{ type: 'request', date: '2026-11-13', dishId: 'shogayaki' }]);
    expect(p('炒め物がいい')[0]).toMatchObject({ type: 'request', dishIds: expect.arrayContaining(['tomato_egg', 'pork_hakusai']) });
    for (const t of ['たこ焼き食べたい', 'おむすびがいい', '明日おむつ買いに行く']) expect(p(t), t).toEqual([{ type: 'unknown', text: t }]);
  });

  it('ジャンル・たんぱく源は料理名より先に見る（「中華がいい」は冷やし中華にしない）', () => {
    expect(p('金曜は中華がいい')).toEqual([{ type: 'request', date: '2026-11-13', genre: 'chu' }]);
    expect(p('中華料理がいい')).toEqual([{ type: 'request', genre: 'chu' }]);
    expect(p('明日は中華')).toEqual([{ type: 'request', date: '2026-11-10', genre: 'chu' }]);
    expect(p('肉がいい')[0]).toMatchObject({ type: 'request', dishIds: expect.arrayContaining(['teriyaki_chicken', 'shogayaki', 'nikujaga', 'hamburg']) });
  });

  it('「〇〇飽きた」「〇〇じゃないのがいい」は、その料理の日の別の案', () => {
    expect(p('火曜の豚の生姜焼き飽きた')).toEqual([{ type: 'want_alternatives', date: '2026-11-10', dishId: 'shogayaki' }]);
    expect(p('鶏の照り焼きじゃないのがいい')).toEqual([{ type: 'want_alternatives', dishId: 'teriyaki_chicken' }]);
    expect(p('鶏の照り焼き以外がいい')).toEqual([{ type: 'want_alternatives', dishId: 'teriyaki_chicken' }]);
    expect(p('鶏の照り焼きがいい')).toEqual([{ type: 'request', dishId: 'teriyaki_chicken' }]);
  });

  it('食材を名指ししたリクエストは、その食材の id を付ける', () => {
    expect(p('明日はさばがいい')).toEqual([{ type: 'request', date: '2026-11-10', protein: 'fish', ingredientId: 'saba' }]);
    expect(p('鶏むねがいい')).toEqual([{ type: 'request', protein: 'chicken', ingredientId: 'chicken_breast' }]);
  });

  it('ふつうの言い方（今日はいらない・パス・元気ない・〇円・明日なに・何買えば）', () => {
    for (const t of ['今日パスで', '作る元気ない', '今日は休みたい']) expect(p(t), t).toEqual([{ type: 'today_impossible' }]);
    // 人を書かない「今日はいらない」は、誰の分かを聞き返す（家族のだれかが送ったときに、全員のラク日にしない）
    expect(p('今日はいらない')).toEqual([{ type: 'absence', date: '2026-11-09', memberRef: '' }]);
    expect(p('キャベツ98円')).toEqual([{ type: 'sale', ingredientId: 'cabbage' }]);
    expect(p('明日なに？')).toEqual([{ type: 'show_today', date: '2026-11-10' }]);
    expect(p('何買えばいい？')).toEqual([{ type: 'show_shopping' }]);
    expect(p('明日何買えばいい？')).toEqual([{ type: 'show_shopping', date: '2026-11-10' }]);
  });
});

describe('parseMessage：みんな外で食べる日を戻す言い方', () => {
  const p = (t: string) => parseMessage(t, ctx);
  const FRI = '2026-11-13';
  const back = [{ type: 'absence', date: FRI, memberRef: 'みんな', cancel: true }];

  it('「金曜はみんないる」「金曜はやっぱり家で食べる」「金曜の外食なくなった」「外食しない」「外食はやめた」は取り消し', () => {
    for (const t of [
      '金曜はみんないる',
      '金曜はやっぱりみんないる',
      '金曜はやっぱり家で食べる',
      '金曜は家で食べる',
      'やっぱり金曜は家で食べます',
      '金曜日は家で食べることになった',
      '金曜はやっぱりうちで食べる',
      '金曜の外食なくなった',
      '金曜はやっぱり外食しない',
      '金曜の外食はやめた',
      '金曜は外食をやめます',
      '金曜は家族みんな家で食べます',
      '金曜は家で食べる予定です',
      '金曜は家で食べるよ',
      '金曜は外食しないから',
    ]) {
      expect(p(t), t).toEqual(back);
    }
    // 返事の日付の書き方（6日より先は「11/20(金)」）でも読める
    expect(p('11/20(金)はみんないる')).toEqual([{ type: 'absence', date: '2026-11-20', memberRef: 'みんな', cancel: true }]);
  });

  it('「家で食べない」「家で食べるかな？」「家で食べたら」「家で食べるのは無理」「外食しないといけない」は取り消しにしない', () => {
    for (const t of [
      '金曜は家で食べない',
      '金曜は家で食べるかな？',
      '金曜も家で食べたらいいのに',
      '金曜は家で食べるのは無理',
      '金曜は家で食べる時間がない',
      '家で食べる日を増やしたい',
      '金曜は外食しないといけない',
      '金曜は外食しなくちゃ',
      '金曜は外食しないか',
    ]) {
      expect(p(t).some((c) => c.type === 'absence' && c.cancel), t).toBe(false);
    }
    // 外で食べる話は、今までどおり欠席
    expect(p('金曜は外食しないといけない')).toEqual([{ type: 'absence', date: FRI, memberRef: 'みんな' }]);
    // 「みんな外食」は今までどおり欠席（家族みんなは1人ずつ数えない）
    expect(p('金曜はみんな外食')).toEqual([{ type: 'absence', date: FRI, memberRef: 'みんな' }]);
    expect(p('金曜は家族みんなで外食')).toEqual([{ type: 'absence', date: FRI, memberRef: 'みんな' }]);
  });
});
