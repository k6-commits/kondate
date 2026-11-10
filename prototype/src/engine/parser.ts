// 話し言葉の解釈（ルールベース。DESIGN.md 3-8）。LLM がないときもこれで動く。
// 照合はすべて normalizeJa（NFKC・カタカナ→ひらがな）した文で行う。
//
// 状態を変える命令（今日は無理・欠席・在庫）は、次のときには出さない（DESIGN.md 3-9）。
// - 否定（「今日は無理じゃない」「卵は切れてない」）→ 今の献立・在庫を見せて確かめる
// - 仮定（「卵が切れたら」「無理なら」）・質問（「豆腐あったっけ？」）→ 在庫を聞かれたら、今の状態で答える
// - 過去の日（「昨日は無理だった」）→ 前日の確認への答えとして、会話の側で扱う
import type { Catalog, Dish, Genre, ISODate, Member, ParseContext, ParsedCommand, Protein } from './types';
import { addDays, diffDays, isISODate, nextWeekday, weekStartOf } from './dates';
import { isMeat, proteinOfKind } from './context';
import { normalizeJa, uniq } from './util';

const n = normalizeJa;
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = (words: string[], extra = '') => new RegExp(words.map((w) => escape(n(w))).join('|') + extra);

const HELP = re(['使い方', '使いかた', 'つかいかた', 'ヘルプ', 'help', '何ができる', 'なにができる', 'どう使う', 'どうやって使う']);
const SHOW_SHOPPING = re([
  '買い物リスト', '買い物', 'かいもの', 'リスト', '買うもの', '買う物', 'かうもの', '何買', 'なに買', '何を買', 'なにを買',
]);
const SHOW_TODAY = re([
  '今日のごはん', '今日のご飯', '今日の夕飯', '今日の夕食', '今日の献立', '今日のメニュー', 'きょうのごはん',
  '今夜のごはん', '今晩のごはん', '今日は何', '今日はなに', '今日なに', '晩ごはん', '晩ご飯', '夕飯', '夕食', 'ばんごはん',
  '夜ごはん', '夜ご飯', 'よるごはん', '晩飯', 'ばんめし', '夜飯',
]);
const MEAL_WORDS = re([
  'ごはん', 'ご飯', '夕飯', '夕食', '晩ごはん', '夜ごはん', '夜ご飯', '晩飯', '夜飯', '献立', 'メニュー', '何作る', 'なに作る', 'なんだっけ',
]);
const WHAT = /なに|何|なん/;
const SHOW_WEEK = re(['今週の献立', '来週の献立', '献立', 'こんだて', '今週', '来週', '一週間', 'メニュー']);
const SALE = re([
  '安い', 'やすい', '安かった', 'やすかった', '特売', 'とくばい', 'セール', 'お買い得', 'おかいどく', '割引', 'わりびき',
  '半額', 'はんがく', '値引き', 'ねびき', '見切り', 'みきり',
]);
const PRICE = /\d+円/;
const EASY = /(食べ|たべ|作り|つくり|使い|つかい|扱い|あつかい)やすい/g;
const ABSENCE = re([
  '飲み会', 'のみかい', 'いらない', '要らない', '不要', '外食', 'がいしょく', '出張',
  'しゅっちょう', 'いない', '居ない', '留守', 'るす', 'ごはんなし', 'ご飯なし', '夕飯なし', '食べない', 'たべない',
  '食べてくる', 'たべてくる', '食べてきます', '会食', '泊まり', 'とまり', 'お泊', '旅行', 'りょこう',
  '欠席', '実家', '帰省', 'いません', '外で食べる',
]);
/**
 * 遅くなるだけ（「水曜ははるとが塾」「パパは残業で遅い」）：あとで家で食べることが多いので、欠席にしない（人数も除外もそのまま）。
 * 「いらない」「食べてくる」なども書いてあれば、欠席として読む（ABSENCE を先に見る）。
 */
const LATE = re(['遅い', 'おそい', '遅く', 'おそく', '遅れる', 'おくれる', '残業', 'ざんぎょう', '部活', 'ぶかつ', '塾', 'じゅく', '習い事', 'ならいごと']);
/** まだ決まっていない（「明日パパ飲み会かも」「金曜は外食するかもしれない」「未定」）。献立は変えない。 */
const MAYBE = /かも|未定|みてい|わからない|分からない|わかんない|決まってない|きまってない|決まっていない/;
/** その日に帰ってくる（「木曜に帰ってくる」）。欠席の最後の日は、その前の日。 */
const RETURN_AFTER = /^(に|には|の)?(夜|よる|夕方|ゆうがた)?(に)?(帰って|帰る|帰り|かえって|かえる|かえり|戻って|戻る|もどって|もどる)/;
const EAT_OUT = re(['外食', 'がいしょく', '外で食べる', 'そとで食べる']);
/** 「外食が多い」のような頻度の話は、欠席にしない。 */
const FREQUENCY = /多い|多かった|多く|おおい|ばかり|ばっかり|続き|つづき|がち|(月|週|日|年)に\s*(\d|[一二三四五六七八九十何])+\s*(回|度)/;
/**
 * 欠席の取り消し：「木曜のお泊まりなくなった」「飲み会中止」「やっぱり外食しない」「外食はやめた」。
 * 「外食しないといけない」「外食しないか」「外食しなくちゃ」（外で食べる話）は、取り消しにしない。
 */
const CANCEL_EVENT =
  /(お?泊まり|お?泊り|とまり|飲み会|のみかい|出張|しゅっちょう|外食|がいしょく|残業|ざんぎょう|会食|旅行|りょこう|部活|塾|じゅく|用事|ようじ|欠席)(が|は|も|の|を)?(なくなっ|無くなっ|中止|ちゅうし|きゃんせる|取りやめ|とりやめ|やめ|止め|延期|えんき|なし|無し|ない|しない(?!と|か(?!ら))|しません|しなく(?!ちゃ|ては))/;
/** 欠席の取り消し：「(人)は木曜いる」「やっぱり(人)も食べる」。 */
const PRESENCE =
  /(いる|居る|います|食べる|たべる|食べます|たべます|食べられる|たべられる|帰ってくる|かえってくる|帰れる|かえれる|間に合う|まにあう|家で食べ|いえで食べ|うちで食べ)(?!か|な)/;
/**
 * 人を書かない「家で食べる」（「金曜はやっぱり家で食べる」「金曜は家で食べることになった」）：その日はみんな家で食べる
 * （みんな外で食べる日を戻す）。節の終わりが「家で食べる」のときだけ（「家で食べるのは無理」「家で食べる日を増やしたい」は読まない）。
 */
const HOME_EAT =
  /(家|いえ|うち|自宅)で(食べ|たべ)(る|ます|れる|られる|たい)(予定|よてい|こと)?(に(なった|なりました|した|しました|する|します))?(ので|から)?(ん)?(だ|です)?(よ|ね|わ)*[ー〜~♪]*$/;
const IMPOSSIBLE = re(
  [
    '無理', 'むり', '疲れ', 'つかれ', 'しんどい', '作れない', 'つくれない', '作る気', 'つくる気', 'つくるき', '手抜き', 'てぬき',
    'ラクしたい', '楽したい', 'ラクにしたい', '楽にしたい', '余裕がない', 'よゆうがない', 'ぐったり', 'へとへと', 'だるい',
    '体調', '気力', 'できない', '作りたくない', 'つくりたくない', '帰りが遅', 'かえりがおそ', '元気ない', '元気がない',
    'げんきない', '休みたい', 'やすみたい',
  ],
  '|ぱす(?!た)',
);
/** キーワードのすぐ後ろの否定（「無理じゃない」「疲れてない」「外食じゃなくて」「体調はいい」）。「無理しない」は否定にしない。 */
const NEG_AFTER =
  /^(じゃ|では|でわ)(ない|なく|ありません|ねー)|^て(い)?(ない|ません|なく)|^くない|^なく(て)?(いい|ても)|^ない|^(が|は)?(いい|良い|よい|大丈夫|だいじょうぶ|ばっちり)/;
/** 仮定（「切れたら」「無理なら」「あれば」）。 */
const HYPO = /たら|なら(?!な|べ)|ければ|であれば|れば/;
/** 質問の文末（「あったっけ」「あるかな」）。「？」は文を区切るときに見る。 */
const QUESTION_END = /(っけ|かな|かしら|でしょうか|ですか|ますか)$/;
const CHANGE = re([
  '別の', 'べつの', 'ほかの', '他の', '違うの', 'ちがうの', '変えて', '替えて', '代えて', '変えたい', '替えたい', '変更',
  'へんこう', '気分じゃない', 'きぶんじゃない', '飽きた', 'あきた', '差し替え', 'さしかえ', 'チェンジ', 'ほかに',
]);
/** 料理名のすぐ後ろの「変えたい」（「キーマカレー飽きた」「さばの味噌煮じゃないのがいい」「キーマカレーを変えて」）。 */
const CHANGE_AFTER =
  /^(は|が|も|の|を|って)?(もう)?(飽き|あき|いや|嫌|じゃな|じゃなく|以外|いがい|やめ|変え|替え|代え|かえ|別の|べつの|ほかの|他の|気分じゃ|きぶんじゃ|ちがうの|違うの)/;
const REQUEST = re([
  'がいい', 'が良い', 'がよい', 'にして', 'にしたい', 'にしよう', '食べたい', 'たべたい', '希望', 'きぼう', 'リクエスト',
  '作りたい', 'つくりたい', 'がほしい', 'が欲しい', 'でお願い', 'でおねがい', 'がいいな', 'って言って', 'っていって',
]);
const REQUEST_SPLIT =
  /(がいい|が良い|がよい|にして|にしたい|にしよう|が食べたい|がたべたい|食べたい|たべたい|が希望|がきぼう|をりくえすと|が作りたい|がつくりたい|がほしい|が欲しい|でお願い|でおねがい|に変えて|に替えて|にかえて|って言っ|っていっ)/;

// 在庫：食材のすぐ後ろの言葉で判断する。済んだ形だけを読む（「買ってきて」「切れたら」は読まない）。
const OUT_AFTER =
  /^(が|は|も|を|って)?(もう)?(ない|無い|なかった|ありません|切れ(た(?!ら)|てる|ちゃった|ました|てます|てしまっ)|きれ(た(?!ら)|てる|ちゃった|ました)|切らし(た(?!ら)|てる|ちゃった|ました)|きらし(た(?!ら)|てる|ちゃった)|なくなっ(た(?!ら)|ちゃった)|無くなっ(た(?!ら)|ちゃった)|使い切っ(た(?!ら)|ちゃった)|使いきっ(た(?!ら)|ちゃった)|つかいきっ(た(?!ら)|ちゃった)|品切れ|買い忘れ|かいわすれ)/;
/** 食材と「ある」の間の量の語（「キャベツ半分ある」「卵2個ある」）。照合は normalizeJa した文（カタカナはひらがな）。 */
const QTY = '(半分|はんぶん|少し|すこし|ちょっと|ちょこっと|たくさん|いっぱい|\\d+(個|こ|本|枚|袋|ぱっく|玉|株|切れ|丁|束|缶|g|ぐらむ)?|[一二三四五六七八九十]+(個|本|枚|袋|ぱっく|玉|株|切れ|丁|束|缶))?';
const HAVE_AFTER = new RegExp(
  `^(が|は|も|を)?(まだ)?${QTY}(が|は|も|を)?(買った|買ってきた|買ってきました|買っておいた|買っといた|買ってある|買ってあります|買いました|かった|かってきた|かっておいた|かっといた|かってある|かいました|ある|あります|あった|ありました|もらった|もらいました|貰った|いただいた|いただきました|頂いた|頂きました|届いた|とどいた|届きました|残って|のこって|余って|あまって)`,
);
const FROZE = /冷凍(した|しました|しておいた|しといた|してある|してあります|済み|ずみ|しちゃった|してる)/;
const FROZE_AFTER = new RegExp(`^(を|は|も)?${FROZE.source}`);
const NOT_OUT = /(切れて(い)?ない|きれて(い)?ない|切らして(い)?ない|きらして(い)?ない|なくなって(い)?ない|無くなって(い)?ない)/;
const OUT_ANY =
  /(切れた(?!ら)|きれた(?!ら)|切れてる|きれてる|切れちゃった|切らした(?!ら)|切らしてる|きらした(?!ら)|なくなった(?!ら)|なくなっちゃった|無くなった(?!ら)|使い切った(?!ら)|使いきった(?!ら)|つかいきった(?!ら)|品切れ|買い忘れ|かいわすれ|(が|は|も)(ない|無い|なかった|ありません))/;
const HAVE_ANY =
  /(買った|買ってきた|かってきた|買いました|かいました|買っておいた|買っといた|買ってある|もらった|もらいました|貰った|いただいた|いただきました|頂いた|頂きました|届いた|とどいた|届きました|残ってる|残っている|のこってる|余ってる|あまってる|(が|は|も)(ある|あります|あった))/;
/** 頼む形・これから買う形（「買ってきて」「買っておいて」「買ってくるね」）。在庫は変えず、リストの状態を答える。 */
const BUY_REQUEST =
  /(買ってきて|かってきて|買っておいて|かっておいて|買っといて|かっといて|買ってくる|かってくる|買いに|かいに|買わなきゃ|買わないと|かわなきゃ|買って(ね|ください|ほしい|欲しい|もらえる|くれる)|買っ(て|とく|ておく)$|買う(ね|よ|つもり|予定|から)?$)/;
/** 食材のすぐ後ろが料理の語（「たこ焼き」「いか焼き」）なら、知らない料理の名前として扱う（食材のリクエストにしない）。 */
const COOK_SUFFIX = /^(焼き|焼|やき|揚げ|あげ|炒め|いため|煮|丼|どん|鍋|なべ|ふらい|汁|じる|天|飯|めし|すし|寿司)/;

const PROTEIN_WORDS: [Protein, string[]][] = [
  ['fish', ['焼き魚', '煮魚', '魚', 'さかな']],
  ['chicken', ['鶏肉', 'とり肉', 'とりにく', 'チキン', '鶏', '鳥']],
  ['pork', ['豚肉', 'ぶた肉', 'ぶたにく', 'ポーク', '豚']],
  ['beef', ['牛肉', 'ぎゅう肉', 'ぎゅうにく', 'ビーフ', '牛']],
  ['ground', ['ひき肉', '挽き肉', '挽肉', 'ひきにく', 'ミンチ']],
  ['egg', ['卵料理', 'たまご料理']],
  ['tofu', ['豆腐料理', 'とうふ料理']],
];
const GENRE_WORDS: [Genre, string[]][] = [
  ['wa', ['和食', '和風', 'わしょく']],
  ['yo', ['洋食', '洋風', 'ようしょく']],
  ['chu', ['中華', 'ちゅうか']],
];
/** 「肉がいい」：肉の主菜の候補から選んでもらう。 */
const MEAT_WORDS = ['肉', 'お肉', 'にく', 'おにく'].map(n);
/** ジャンル・たんぱく源の語のあとに付いてよい語（「中華料理」「魚系」「和風」）。 */
const FOOD_TAIL = /^(料理|系|風|もの|物|の|っぽいの|っぽいもの|のもの)*$/;
/** 書いた人自身を指す語（「わたしは明日いらない」）。送る人がわかればその人、わからなければ「わたし」（続柄 parent）の人。 */
export const SELF_WORDS = ['わたし', '私', 'あたし', '自分', '僕', '俺'];
const ROLE_WORDS = [
  '上の子', '下の子', '末っ子', '長男', '長女', '次男', '次女', '息子', '娘', '旦那', 'だんな', '主人', 'お父さん', 'お母さん',
  '奥さん', 'パパ', 'ママ', '子ども', '子供', 'こども', 'みんな', '全員', '家族', '夫', '妻', '嫁', ...SELF_WORDS,
].sort((a, b) => b.length - a.length);
/** 家族全員を指す語。 */
const ALL_REFS = ['みんな', '全員', '家族'];
const WD_KANJI: Record<string, number> = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 0 };
const WD_KANA: Record<string, number> = { げつ: 1, か: 2, すい: 3, もく: 4, きん: 5, ど: 6, にち: 0 };
/** 料理のあとの、あったことの言い方（「カレーだった」「カレーが出た」）。 */
const PAST_TALK = /^(が|は|も)?(だった|でした|出た|でた|出ました|でました)(?!ら)/;
/**
 * 期間の語（「3日間」「2泊」「1週間」）。欠席の日数にだけ使う（findDates の duration）。
 * 「この1週間」「1週間ぶり」「2週間後」「1週間に2回」「1週間分」のような、期間でない言い方は読まない。
 */
const DURATION =
  /(?<!この|その|あの|ここ|過去|最近|毎|週|月)(\d{1,2}|[一二三四五六七八九十])(日間|泊|週間)(?!後|ぶり|前|まえ|以内|以上|おき|分|ぶん|ごと|に\s*(\d|[一二三四五六七八九十何])+\s*(回|度)|(くらい|ほど|ぐらい)(前|まえ))/;
/** 「3日後」「2週間後」：今日から数えた日。 */
const AFTER_DAYS = /(\d{1,2}|[一二三四五六七八九十])(日|週間)後/;
const KANJI_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

interface Span {
  id: string;
  start: number;
  end: number;
}

interface Term {
  term: string;
  id: string;
  kind: 'ing' | 'dish';
  nameLen: number;
}

interface Vocab {
  /** 長い語から順。同じ長さなら食材を先に（在庫・特売の書き込み向け）。 */
  ingFirst: Term[];
  /** 長い語から順。同じ長さなら料理を先に（リクエスト向け）。 */
  dishFirst: Term[];
}

const vocabCache = new WeakMap<Catalog, Vocab>();

const isOneKana = (s: string) => s.length === 1 && /[぀-ゟ]/.test(s);

/** 食材の名前・別名・総称（「鶏肉」「きのこ」は代表の食材に当てる）。 */
function ingredientTerms(catalog: Catalog): { term: string; id: string }[] {
  const out: { term: string; id: string }[] = [];
  for (const ing of catalog.ingredients) {
    for (const raw of uniq([ing.name, ...ing.aliases, ...(ing.genericAliases ?? [])])) {
      const term = n(raw);
      // ひらがな1文字の語は誤って当たりやすいので使わない（漢字1文字の「卵」などは使う）。
      if (term.length === 0 || isOneKana(term)) continue;
      out.push({ term, id: ing.id });
    }
  }
  return out;
}

function vocabOf(catalog: Catalog): Vocab {
  const cached = vocabCache.get(catalog);
  if (cached) return cached;
  const terms: Term[] = ingredientTerms(catalog).map(({ term, id }) => ({ term, id, kind: 'ing', nameLen: term.length }));
  for (const d of catalog.dishes) {
    const name = n(d.name);
    // 「カレーライス」→「かれー」。残りが2文字以下（「たこ」「おむ」）は、普通の言葉に当たるので作らない。
    const noRice = name.replace(/らいす$/, '');
    const variants = uniq([name, name.replace(/[（(].*[）)]$/, ''), ...(noRice.length >= 3 ? [noRice] : [])]);
    for (const term of variants) if (term.length >= 2) terms.push({ term, id: d.id, kind: 'dish', nameLen: name.length });
  }
  const byLen = (pref: Term['kind']) => (a: Term, b: Term) =>
    b.term.length - a.term.length || Number(b.kind === pref) - Number(a.kind === pref) || a.nameLen - b.nameLen;
  const v = { ingFirst: [...terms].sort(byLen('ing')), dishFirst: [...terms].sort(byLen('dish')) };
  vocabCache.set(catalog, v);
  return v;
}

function overlaps(spans: Span[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && s.start < end);
}

const PARTICLES = 'とやのはもがをにでへ';
const isHira = (c: string) => /[ぁ-ゖ]/.test(c);
const isKanji = (c: string) => /[一-鿿々]/.test(c);

/**
 * ひらがな2文字の語（いか・たら・さけ・ぶり など）は、普通の言葉の一部に当たりやすい（「安いから」「たらこ」「さける」「久しぶり」）。
 * 前が文頭・ひらがな以外・助詞で、後ろが文末・ひらがな以外・助詞のときだけ当てる。
 * 「い」で始まる語は、前が漢字なら当てない（「安いか」「高いか」の形容詞の語尾）。
 */
function boundaryOk(t: string, at: number, end: number, term: string): boolean {
  if (!/^[ぁ-ゖ]{2}$/.test(term)) return true;
  const prev = at > 0 ? t[at - 1] : '';
  if (prev && isHira(prev) && !PARTICLES.includes(prev)) return false;
  if (prev && term[0] === 'い' && isKanji(prev)) return false;
  const after = t.slice(end);
  // 後ろが助詞か、在庫の「ある」（「さばある？」「さばあったっけ」）なら当てる。
  if (after && isHira(after[0]) && !/^(が|は|も|を|と|や|の|に|で|って|ある|あっ|あり)/.test(after)) return false;
  if (term === 'いか' && /^が(です|でしょ|でした|わし)/.test(after)) return false; // 「いかがですか」
  return true;
}

function findSpans(t: string, terms: Term[]): (Span & { kind: Term['kind'] })[] {
  const found: (Span & { kind: Term['kind'] })[] = [];
  for (const { term, id, kind } of terms) {
    let from = 0;
    for (;;) {
      const at = t.indexOf(term, from);
      if (at < 0) break;
      const end = at + term.length;
      if (!overlaps(found, at, end) && boundaryOk(t, at, end, term)) found.push({ id, start: at, end, kind });
      from = at + 1;
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** 料理の名前が書いてあるか（「さばの味噌煮作った」「カレー作ったよ」）。作った・作らなかったの答えの見分けに使う。 */
export function mentionsDish(text: string, catalog: Catalog): boolean {
  return findSpans(n(text), vocabOf(catalog).dishFirst).some((s) => s.kind === 'dish');
}

function mask(t: string, spans: Span[]): string {
  let out = t;
  for (const s of spans) out = out.slice(0, s.start) + '＿'.repeat(s.end - s.start) + out.slice(s.end);
  return out;
}

// ---------------------------------------------------------------------------
// 日付
// ---------------------------------------------------------------------------

export interface FoundDates {
  /** 書かれた順の日付（「明日と明後日」なら2つ。「明日から木曜まで」なら、その間の日をすべて）。 */
  dates: ISODate[];
  /** 「木曜まで」のように、始まりを書かずに終わりだけを書いた日（今日からその日まで、の意味になりうる）。 */
  until?: ISODate;
  /** 「木曜に帰ってくる」の日（その日は家にいる。欠席はその前の日まで）。 */
  returnOn?: ISODate;
  /**
   * 期間（「明日から3日間」「2泊」「1週間」）。欠席の日数にだけ使う（ほかの命令の日付は変えない）。
   * from は、すぐ前に書いた日（「明日から3日間」の明日）。書いていなければ今日から。
   */
  duration?: { days: number; from?: ISODate };
  /** すべて過去の日（「昨日」「おととい」）か、「先週」のように過去の話。 */
  past: boolean;
  /** 「今週」「来週」だけで、どの日か分からない。 */
  vague: boolean;
  /** vague のうち、今日を含まない時期（「来週」「月末」「お盆」など。「今週」は今日を含む）。 */
  vagueLater: boolean;
  /** 日付の表現を伏せ字にした文。 */
  masked: string;
}

const wd = (x: number) => x as 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 週を書いた曜日（の並び）のすぐ後の「、」と、続く曜日（「来週の水曜、木曜」）。 */
const WEEK_WD_COMMA =
  /((?:再来週|さらいしゅう|来週|らいしゅう|今週|こんしゅう)の?[月火水木金土日](?:曜日?)?(?:[・と][月火水木金土日](?:曜日?)?)*)[、,](?=[月火水木金土日](?:曜|[はにのも、,・と]))/g;

/** 日を決められない、今日を含まない時期（「来週」「来月」「月末」「お盆」「連休」など）。 */
const LATER_WHEN =
  /来週|らいしゅう|再来週|来月|らいげつ|再来月|月末|げつまつ|年末|ねんまつ|月初|年始|年明け|お盆|おぼん|正月|しょうがつ|連休|れんきゅう|夏休み|冬休み|春休み/;

/** 日付の表現（今日、明日、あさって、〇曜、来週・再来週の〇曜、週末、昨日、11/13、13日 など）をすべて拾う。 */
export function findDates(t: string, today: ISODate): FoundDates {
  const hits: { at: number; len: number; dates: ISODate[] }[] = [];
  let pastWord = false;
  let s = t;
  const ws = weekStartOf(today);
  const take = (r: RegExp, f: (m: string[]) => ISODate[] | 'past' | null) => {
    s = s.replace(new RegExp(r.source, 'g'), (...args: unknown[]) => {
      const m = args.slice(0, -2) as string[];
      const at = args[args.length - 2] as number;
      const res = f(m);
      if (res === null) return m[0];
      if (res === 'past') pastWord = true;
      else hits.push({ at, len: m[0].length, dates: res });
      return '＿'.repeat(m[0].length);
    });
  };
  const weekend = (start: ISODate) => [addDays(start, 5), addDays(start, 6)];
  // 「2週間後の月曜」：その週の曜日。「3日後」「2週間後」：今日から数えた日。
  take(/(\d{1,2}|[一二三四五六七八九十])週間後の?([月火水木金土日])曜日?/, (m) => [
    addDays(ws, 7 * (KANJI_NUM[m[1]] ?? Number(m[1])) + ((WD_KANJI[m[2]] + 6) % 7)),
  ]);
  take(AFTER_DAYS, (m) => [addDays(today, (KANJI_NUM[m[1]] ?? Number(m[1])) * (m[2] === '週間' ? 7 : 1))]);
  // 「来週の水曜と木曜」「来週の月・水」：週を書いた曜日に続けた曜日も、その週の曜日（今週の木曜にしない）。
  const inWeek = (offset: number, first: string, more: string) =>
    [first, ...(more.match(/[月火水木金土日]/g) ?? [])].map((c) => addDays(ws, offset + ((WD_KANJI[c] + 6) % 7)));
  // 最初の曜日は「曜」を書く（「来週の月・水」のように並べたときだけ省ける。「来週の金がない」の金は曜日にしない）。
  const FIRST_WD = '([月火水木金土日])(?:曜日?|(?=(?:と|・|や|,)[月火水木金土日]))';
  const MORE_WD = '((?:(?:と|・|や|,)[月火水木金土日](?:曜日?|(?=[はにのもと・や,]|まで|$)))*)';
  // 「来週から月曜は外食」「来週も水曜は」：その週の曜日（月曜に書いても、今日の月曜にしない）。
  const WEEK_JOIN = '(?:の|から|は|も)?(?:毎週|まいしゅう)?の?';
  take(new RegExp(`(再来週|さらいしゅう)${WEEK_JOIN}${FIRST_WD}${MORE_WD}`), (m) => inWeek(14, m[2], m[3]));
  take(new RegExp(`(来週|らいしゅう|今週|こんしゅう)${WEEK_JOIN}${FIRST_WD}${MORE_WD}`), (m) =>
    inWeek(/来週|らいしゅう/.test(m[1]) ? 7 : 0, m[2], m[3]),
  );
  // 「来月から月曜は外食」：来月の曜日は、どの日か分からない（今週の曜日にしない。vague）。
  take(/(再来月|来月|らいげつ)(から|は|の|も)?(毎週|まいしゅう)?の?([月火水木金土日])曜日?/, () => []);
  // 「月水金は」「金土日は」：曜を書かない曜日の並び（「土日」は下の週末で読む。「月日」は日付の言葉なので読まない）。
  take(/(?<![一-龥々])([月火水木金土日]{2,4})(?=は|に(?!\s*(?:\d|[一二三四五六七八九十何])+\s*(?:回|度))|の|も|$)/, (m) => {
    const chars = [...m[1]];
    if (m[1] === '月日' || m[1] === '土日' || new Set(chars).size !== chars.length) return null;
    return chars.map((c) => nextWeekday(today, wd(WD_KANJI[c])));
  });
  take(/来週末|らいしゅうまつ|来週の?土日|らいしゅうの?どにち/, () => weekend(addDays(ws, 7)));
  take(/今週末|こんしゅうまつ|週末|しゅうまつ|土日|どにち/, () => {
    const ds = weekend(ws).filter((d) => d >= today);
    return ds.length > 0 ? ds : weekend(addDays(ws, 7));
  });
  take(/一昨日|おととい|おとつい/, () => [addDays(today, -2)]);
  take(/昨日|きのう|昨晩|昨夜|ゆうべ/, () => [addDays(today, -1)]);
  take(/先週|せんしゅう|この前|このまえ|こないだ|この間/, () => 'past');
  take(/明後日|あさって/, () => [addDays(today, 2)]);
  take(/明日|あした/, () => [addDays(today, 1)]);
  take(/今日|きょう|今夜|今晩|こんや|こんばん/, () => [today]);
  // 「水〜金」「月から水まで」「水・金」：曜を書かない曜日の範囲と並び（両端を拾い、範囲はあとでまとめる）。
  // 漢字の後ろの1文字（「今月から」の月）は曜日にしない。
  take(/(?<![一-龥々])([月火水木金土日])(?:曜日?)?(?=(?:〜|~|～|-|－|から|と|・)[月火水木金土日](?:曜|まで|は|に|の|も|$))/, (m) => [
    nextWeekday(today, wd(WD_KANJI[m[1]])),
  ]);
  take(/(?<=＿(?:〜|~|～|-|－|から|と|・))([月火水木金土日])(?:曜日?)?(?=まで|は|に|の|も|$)/, (m) => [nextWeekday(today, wd(WD_KANJI[m[1]]))]);
  take(/([月火水木金土日])曜日?/, (m) => [nextWeekday(today, wd(WD_KANJI[m[1]]))]);
  take(/(げつ|か|すい|もく|きん|ど|にち)ようび?/, (m) => [nextWeekday(today, wd(WD_KANA[m[1]]))]);
  take(/(\d{1,2})[/月](\d{1,2})日?/, (m) => {
    const year = Number(today.slice(0, 4));
    const pad = (x: number) => String(x).padStart(2, '0');
    for (const y of [year, year + 1]) {
      const d = `${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
      if (isISODate(d) && d >= addDays(today, -60)) return [d];
    }
    return null;
  });
  // 「2泊3日」の「3日」は日付にしない（期間として、下で読む）。「3日に1回」「3日に一度」も日付にしない。
  take(/(?<![泊\d])(\d{1,2})日(?=は|に(?!\s*(?:\d|[一二三四五六七八九十何])+\s*(?:回|度))|の|も|$)/, (m) => {
    const day = Number(m[1]);
    const [y, mo] = today.split('-').map(Number);
    for (let k = 0; k < 2; k++) {
      const yy = mo + k > 12 ? y + 1 : y;
      const mm = ((mo + k - 1) % 12) + 1;
      const d = `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (isISODate(d) && d >= today) return [d];
    }
    return null;
  });
  // 文の初めの1文字の曜日（「金は外食」）。「月に1回」のような頻度の話は、曜日にしない。
  take(/^([月火水木金土日])(?=は|に(?!\s*(?:\d|[一二三四五六七八九十何])+\s*(?:回|度))|の|も)/, (m) => [nextWeekday(today, wd(WD_KANJI[m[1]]))]);
  hits.sort((a, b) => a.at - b.at);
  // 範囲（「明日から木曜まで」「11/10〜11/12」「金曜から月曜まで」）：その間の日をすべて（2週間まで）。
  const merged: { at: number; len: number; dates: ISODate[] }[] = [];
  for (let i = 0; i < hits.length; i++) {
    const a = hits[i];
    const b = hits[i + 1];
    if (b && a.dates.length === 1 && b.dates.length === 1) {
      const between = s.slice(a.at + a.len, b.at);
      const after = s.slice(b.at + b.len);
      // 「明日から木曜（まで）」「水〜金」。「明日から木曜に（変える）」のような移す話は、範囲にしない。
      if ((/^(から|より)$/.test(between) && !/^(に(?!かけ)|へ)/.test(after)) || /^(〜|~|～|-|－)$/.test(between)) {
        const start = a.dates[0];
        let end = b.dates[0];
        if (end < start) end = addDays(end, 7);
        const n = diffDays(end, start);
        if (n >= 1 && n <= 13) {
          merged.push({ at: a.at, len: b.at + b.len - a.at, dates: Array.from({ length: n + 1 }, (_, k) => addDays(start, k)) });
          i += 1;
          continue;
        }
      }
    }
    merged.push(a);
  }
  // 期間（「明日から3日間」「明日から2泊」「1週間」）：すぐ前に書いた日（なければ今日）から、その日数（2週間まで）。
  // 欠席の日数にだけ使う（「1週間ぶりにカレー」「2日間煮込んだカレー」の日付にはしない）。
  let duration: FoundDates['duration'];
  const dur = DURATION.exec(s);
  if (dur) {
    const k = KANJI_NUM[dur[1]] ?? Number(dur[1]);
    const days = Math.min(14, dur[2] === '週間' ? k * 7 : k);
    const head = merged.filter((h) => h.at + h.len <= dur.index).at(-1);
    const gap = head ? s.slice(head.at + head.len, dur.index) : '';
    if (days >= 1 && head && head.dates.length === 1 && /^(から|より)?$/.test(gap)) duration = { days, from: head.dates[0] };
    else if (days >= 1 && merged.length === 0) duration = { days };
  }
  const dates = uniq(merged.flatMap((h) => h.dates));
  const single = merged.filter((h) => h.dates.length === 1);
  const until = single.find((h) => /^まで/.test(s.slice(h.at + h.len)) && !/から$/.test(s.slice(0, h.at)))?.dates[0];
  // 帰ってくる日は、ほかに書いた日（出かける日）より後のときだけ（「明日出張で木曜に帰ってくる」を水曜に書くと、どちらも木曜になる）。
  const back = single.find((h) => RETURN_AFTER.test(s.slice(h.at + h.len)));
  const returnOn = back && merged.every((h) => h === back || h.dates.every((d) => d < back.dates[0])) ? back.dates[0] : undefined;
  const past = dates.length > 0 ? dates.every((d) => d < today) : pastWord;
  // 日を決められない時期（「月末」「年末」「お盆」「連休」など）だけを書いたときも、今日のことにしない（vague）。
  const later = dates.length === 0 && (LATER_WHEN.test(s) || hits.some((h) => h.dates.length === 0));
  const vague = later || (dates.length === 0 && /今週|こんしゅう/.test(s));
  return {
    dates,
    past,
    vague,
    vagueLater: later,
    masked: s,
    ...(until ? { until } : {}),
    ...(returnOn ? { returnOn } : {}),
    ...(duration ? { duration } : {}),
  };
}

// ---------------------------------------------------------------------------
// 人
// ---------------------------------------------------------------------------

/** 書かれた人をすべて（「パパとはるといない」なら2人）。ニックネームを先に、長い名前から探す。 */
function findMemberRefs(t: string, members: Member[]): { refs: string[]; masked: string } {
  let cleaned = t.replace(/大丈夫|だいじょうぶ/g, (x) => '＿'.repeat(x.length));
  const refs: string[] = [];
  const take = (key: string, ref: string) => {
    if (!cleaned.includes(key)) return;
    refs.push(ref);
    cleaned = cleaned.split(key).join('＿'.repeat(key.length));
  };
  const nicks = members
    .map((m) => ({ ref: m.nickname, key: n(m.nickname) }))
    .filter((x) => x.key.length >= 2 || (x.key.length === 1 && /[^぀-ゟ]/.test(x.key)))
    .sort((a, b) => b.key.length - a.key.length);
  for (const x of nicks) take(x.key, x.ref);
  for (const w of ROLE_WORDS) take(n(w), w);
  // 「家族みんな」「全員みんな」は1つの「みんな」（同じ人たちを2回取り消さない）。
  const all = refs.filter((r) => ALL_REFS.includes(r));
  const out = all.length > 1 ? refs.filter((r) => !ALL_REFS.includes(r) || r === all[0]) : refs;
  return { refs: uniq(out), masked: cleaned };
}

// ---------------------------------------------------------------------------
// 料理・たんぱく源・ジャンル
// ---------------------------------------------------------------------------

function findProtein(t: string): Protein | undefined {
  for (const [p, words] of PROTEIN_WORDS) if (words.some((w) => t.includes(n(w)))) return p;
  return undefined;
}

function findGenre(t: string): Genre | undefined {
  for (const [g, words] of GENRE_WORDS) if (words.some((w) => t.includes(n(w)))) return g;
  return undefined;
}

/** 語がジャンル・たんぱく源の語「だけ」か（「中華」「中華料理」「魚系」）。料理名の一部（「冷やし中華」）は違う。 */
function onlyWord<T>(noun: string, table: [T, string[]][]): T | undefined {
  for (const [v, words] of table) {
    for (const w of words.map(n).sort((a, b) => b.length - a.length)) {
      if (noun.startsWith(w) && FOOD_TAIL.test(noun.slice(w.length))) return v;
    }
  }
  return undefined;
}

/** 「から揚げ／からあげ」「焼き／やき」「煮物／にもの」などの書き分けをそろえる。 */
function kanaKey(s: string): string {
  return s
    .replace(/揚げ/g, 'あげ')
    .replace(/焼き/g, 'やき')
    .replace(/炒め/g, 'いため')
    .replace(/煮/g, 'に')
    .replace(/唐/g, 'から')
    .replace(/もの/g, '物')
    .replace(/[のノ]/g, '');
}

interface LooseVocab {
  terms: { term: string; token: string }[];
  keys: { dish: Dish; key: string; tags: string[] }[];
}

const looseCache = new WeakMap<Catalog, LooseVocab>();

/**
 * 照合用の形：食材の語を食材の id に置き換えてから、書き分けをそろえる。
 * 「生姜焼き」「しょうが焼き」はどちらも「【ginger】やき」になり、「豚の生姜焼き」に当たる。
 */
function canonKey(s: string, terms: LooseVocab['terms']): string {
  let out = s;
  for (const { term, token } of terms) if (out.includes(term)) out = out.split(term).join(token);
  return kanaKey(out);
}

function looseVocab(catalog: Catalog): LooseVocab {
  const cached = looseCache.get(catalog);
  if (cached) return cached;
  const terms = ingredientTerms(catalog)
    .map(({ term, id }) => ({ term, token: `【${id}】` }))
    .sort((a, b) => b.term.length - a.term.length);
  const keys = catalog.dishes.map((dish) => ({
    dish,
    key: canonKey(n(dish.name), terms),
    tags: dish.tags.map((t) => kanaKey(n(t))),
  }));
  const v = { terms, keys };
  looseCache.set(catalog, v);
  return v;
}

/** 料理名の語尾だけの語（「焼き」「煮物」「炒め物」「丼」「スープ」）。1つの料理には決めない。 */
const STEM_CORES = new Set(
  ['やき', 'に', 'いため', 'あげ', 'どん', '丼', 'どんぶり', 'すーぷ', '汁', 'しる', 'なべ', '鍋', 'さらだ', 'あえ', 'めん', '麺', 'ふらい', 'かつ', 'おかず', '料理', 'りょうり', '物'],
);

/**
 * 「生姜焼き」「照り焼き」「炒め物」のような、料理名の一部から料理の候補を探す（あいまいな一致）。
 * 当たる主菜があれば主菜だけ。語尾だけの語（「炒め物」「煮物」）は、名前とタグで当たる料理をすべて候補にする。
 */
function looseDishes(noun: string, catalog: Catalog): Dish[] {
  const v = looseVocab(catalog);
  const key = canonKey(noun, v.terms);
  if (key.replace(/【[^】]+】/g, '').length === 0 && !key.includes('【')) return [];
  const prefer = (ds: Dish[]) => {
    const mains = ds.filter((d) => d.role === 'main');
    return mains.length > 0 ? mains : ds;
  };
  const core = key.replace(/物$/, '');
  if (!key.includes('【') && (STEM_CORES.has(key) || STEM_CORES.has(core))) {
    return prefer(
      v.keys.filter((k) => k.tags.includes(key) || k.tags.includes(`${core}物`) || (core.length >= 2 && k.key.includes(core))).map((k) => k.dish),
    );
  }
  const segs = key.split(/(【[^】]+】)/).filter((x) => x.length > 0);
  if (segs.length === 0) return [];
  const hits = v.keys.filter((k) => {
    let pos = 0;
    for (const seg of segs) {
      const i = k.key.indexOf(seg, pos);
      if (i < 0) return false;
      pos = i + seg.length;
    }
    return true;
  });
  return prefer(hits.map((k) => k.dish));
}

/** 語が食材1つだけ（「さば」「鶏むね」）なら、その食材。 */
function singleIngredient(noun: string, catalog: Catalog): string | undefined {
  const v = looseVocab(catalog);
  const key = canonKey(noun, v.terms);
  const m = key.match(/^【([^】]+)】$/);
  return m ? m[1] : undefined;
}

/** 「〇〇がいい」の〇〇（伏せ字にした日付・人と、そのすぐ後ろの助詞を外す。「＿＿は生姜焼き」→「生姜焼き」）。 */
function nounBefore(text: string): string {
  return text
    .replace(/＿+(は|も|の|に|を|が|って|で)?/g, '')
    .replace(/^(夕飯|夕食|晩ごはん|晩ご飯|ばんごはん|ごはん|ご飯|献立|メニュー)(は|の|に|を)?/, '')
    .replace(/(が|を|で|は|も|って)$/, '');
}

// ---------------------------------------------------------------------------
// 節の解釈
// ---------------------------------------------------------------------------

interface Carry {
  dates?: ISODate[];
  /** 「木曜まで」の日（findDates の until）。 */
  until?: ISODate;
  /** 「木曜に帰ってくる」の日（findDates の returnOn）。 */
  returnOn?: ISODate;
  /** 期間（findDates の duration）。 */
  duration?: FoundDates['duration'];
  past?: boolean;
  vague?: boolean;
  /** 「来週」「月末」のように、今日を含まない時期だけを書いた（findDates の vagueLater）。 */
  vagueLater?: boolean;
  /** 動詞のない節の食材（「卵、牛乳、豆腐買った」の卵・牛乳）。後ろの節の在庫・特売の語を当てる。 */
  pending: string[];
  memberRefs?: string[];
  /** 前の節で読んだ欠席（「パパ出張、木曜に帰る」の「木曜に帰る」で、帰ってくる日の前の日まで広げるため）。 */
  absent?: { refs: string[]; from: ISODate; tentative?: 'maybe' };
  /** 質問の文（「？」「っけ」「かな」）。 */
  question: boolean;
}

/** キーワードのすぐ後ろが否定か。 */
function negatedAfter(text: string, r: RegExp): boolean {
  const m = r.exec(text);
  if (!m) return false;
  return NEG_AFTER.test(text.slice(m.index + m[0].length));
}

/** 家で食べる人が1人だけの家族なら、その人の id（人を書かない「今日はいらない」は、その人のこと）。 */
function soloMember(members: Member[]): string | undefined {
  const eaters = members.filter((m) => m.ageBand !== 'infant');
  return eaters.length === 1 ? eaters[0].id : undefined;
}

/** from から to までの日（2週間まで。順が逆なら null）。 */
function spanDays(from: ISODate, to: ISODate): ISODate[] | null {
  const n = diffDays(to, from);
  return n >= 0 && n <= 13 ? Array.from({ length: n + 1 }, (_, k) => addDays(from, k)) : null;
}

/**
 * 欠席の日。書いた日（なければ今日）。「明日出張で木曜に帰ってくる」は帰ってくる日の前日まで、
 * 「木曜まで出張」（始まりを書かない）は今日からその日まで、「明日から3日間」「2泊」はその日数（どれも2週間まで）。
 */
function absenceDays(dates: ISODate[], today: ISODate, carry: Carry): ISODate[] {
  const span = spanDays;
  const dur = carry.duration;
  if (dur && (dur.from ? dates.length === 1 && dates[0] === dur.from : dates.length === 0)) {
    const from = dur.from ?? today;
    return Array.from({ length: dur.days }, (_, k) => addDays(from, k));
  }
  const back = carry.returnOn;
  if (back && dates.includes(back)) {
    // 出かける日（ほかに書いた日）から。「水曜まで出張で木曜に帰る」の水曜は終わりの日なので、今日から。
    const others = dates.filter((d) => d !== back).sort();
    const from = others[0] && others[0] !== carry.until ? others[0] : today;
    const range = span(from, addDays(back, -1));
    if (range) return range;
  }
  if (carry.until && dates.length === 1 && dates[0] === carry.until) {
    const range = span(today, carry.until);
    if (range) return range;
  }
  return dates.length > 0 ? dates : [today];
}

function parseClause(raw: string, ctx: ParseContext, carry: Carry): ParsedCommand[] {
  const t = n(raw);
  if (!t) return [];
  const vocab = vocabOf(ctx.catalog);
  const found = findDates(t, ctx.today);
  if (found.dates.length > 0 || found.past || found.vague || found.duration) {
    carry.dates = found.dates;
    carry.until = found.until;
    carry.returnOn = found.returnOn;
    carry.duration = found.duration;
    carry.past = found.past;
    carry.vague = found.vague;
    carry.vagueLater = found.vagueLater;
  }
  if (HELP.test(t)) return [{ type: 'help' }];
  const today = ctx.today;
  const dates = carry.dates ?? [];
  const firstDate = dates[0];
  const past = !!carry.past;
  const question = carry.question;
  const withDate = <T extends ParsedCommand>(c: T): T => (firstDate ? { ...c, date: firstDate } : c);
  const lookAt = (d?: ISODate): ParsedCommand => (d && d !== today ? { type: 'show_week' } : { type: 'show_today' });

  const preferDish = REQUEST.test(t) || CHANGE.test(t);
  const spans = findSpans(t, preferDish ? vocab.dishFirst : vocab.ingFirst);
  const dishSpans = spans.filter((s) => s.kind === 'dish');
  const ingSpans = spans.filter((s) => s.kind === 'ing');
  const rest = mask(t, spans);
  const ingIds = uniq(ingSpans.map((s) => s.id));
  const found0 = findMemberRefs(rest, ctx.members).refs;
  // 「わたし」「自分」は、送る人がわかればその人（member の id）にする。
  const refs = found0.map((r) => (ctx.senderId && SELF_WORDS.includes(r) ? ctx.senderId : r));
  if (refs.length > 0) carry.memberRefs = refs;
  const hypo = HYPO.test(rest);

  if (SHOW_SHOPPING.test(rest) && ingIds.length === 0 && !/買い忘れ|かいわすれ/.test(rest)) {
    // 「明日何買えばいい？」：その日の買い物（1日だけ書いたとき）。
    return [firstDate && firstDate !== today && dates.length === 1 ? { type: 'show_shopping', date: firstDate } : { type: 'show_shopping' }];
  }

  // 特売：「鶏むねが安い」「ブロッコリー98円」。「〇〇にして」と一緒なら、リクエストとして読む。仮定（「安かったら」）は読まない。
  const saleWord = SALE.test(rest.replace(EASY, '')) || SALE.test(t.replace(EASY, ''));
  const price = PRICE.test(t) && !OUT_ANY.test(rest) && !HAVE_ANY.test(rest);
  if ((saleWord || price) && !hypo && !REQUEST.test(rest)) {
    const ids = uniq([...carry.pending, ...ingIds]);
    if (ids.length > 0) {
      carry.pending = [];
      return ids.map((id) => ({ type: 'sale' as const, ingredientId: id }));
    }
  }

  // まだ決まっていない（「かも」「未定」）：欠席・取り消しは、献立を変えずに、決まったときの送り方を返す。
  const maybe = MAYBE.test(rest);
  const unsure = maybe ? { tentative: 'maybe' as const } : {};
  // 欠席の取り消し：「木曜のお泊まりなくなった」（欠席の語より先に見る。「お泊まり中止」を新しい欠席にしない）。
  // 日を決められない時期だけを書いた（「来週はパパいる」「月末の外食なくなった」）：今日のことにせず、日付で送ってもらう。
  const vagueOnly = !!carry.vague && dates.length === 0;
  const vagueAsk = (kind: 'absence' | 'other'): ParsedCommand[] => [{ type: 'unknown', text: raw.trim(), vague: kind }];
  const cancel = (who: string[]): ParsedCommand[] =>
    vagueOnly && !maybe
      ? vagueAsk('other')
      : (dates.length > 0 ? dates : [today]).flatMap((d) => who.map((r) => ({ type: 'absence' as const, date: d, memberRef: r, cancel: true, ...unsure })));
  if (CANCEL_EVENT.test(rest) && !question && !hypo && !past) {
    return cancel(refs.length > 0 ? refs : carry.memberRefs ?? ['みんな']);
  }

  const out: ParsedCommand[] = [];
  // 欠席：「水曜は夫が飲み会」「明日と明後日はパパいない」「明日から木曜までパパ出張」
  const absenceHit = ABSENCE.test(rest) && !FREQUENCY.test(rest);
  const absenceNegated = absenceHit && negatedAfter(rest, ABSENCE);
  // あいさつの「おつかれさま」は、疲れた（今日は無理）にしない。
  const restImp = rest.replace(/お(疲れ|つかれ)(さま|様|さん|です|でした)?/g, '');
  const lateHit = LATE.test(rest) && !FREQUENCY.test(rest) && !negatedAfter(rest, LATE);
  // 前の節の欠席に、帰ってくる日を書いた（「パパ出張、木曜に帰る」）：欠席を、帰ってくる日の前の日まで広げる。
  const prevAbsent = carry.absent;
  if (prevAbsent && found.returnOn && !absenceHit && !lateHit && refs.length === 0 && !question && !hypo && !past) {
    const range = spanDays(prevAbsent.from, addDays(found.returnOn, -1));
    if (range) {
      return range.flatMap((d) =>
        prevAbsent.refs.map((r) => ({ type: 'absence' as const, date: d, memberRef: r, ...(prevAbsent.tentative ? { tentative: prevAbsent.tentative } : {}) })),
      );
    }
  }
  let askWho: ISODate[] | null = null;
  if (absenceHit && !absenceNegated) {
    if (question) return [lookAt(firstDate)];
    if (!hypo && !past && !(carry.vague && dates.length === 0)) {
      // 人を書かなければ、書いた人（送る人。家族が1人ならその人）の欠席。わからなければ聞き返す（人を書かない「今日はいらない」も、誰の分かを聞く）。
      const writer = ctx.senderId ?? soloMember(ctx.members);
      // 「外で食べる人がいる」「外食の人」は、みんなではない（誰かを聞く）。
      const everyone = EAT_OUT.test(rest) && !/(外食|がいしょく|外で食べる|そとで食べる)(する|の)?(人|ひと)/.test(rest);
      const who = refs.length > 0 ? refs : carry.memberRefs ?? (everyone ? ['みんな'] : writer ? [writer] : []);
      const days = absenceDays(dates, today, carry);
      if (who.length > 0) {
        for (const d of days) for (const r of who) out.push({ type: 'absence', date: d, memberRef: r, ...unsure });
        carry.absent = { refs: who, from: days[0], ...unsure };
      } else if (maybe) {
        for (const d of days) out.push({ type: 'absence', date: d, memberRef: '', tentative: 'maybe' });
      } else {
        askWho = days; // 誰がいないか分からない。ほかに読めることがなければ聞き返す（範囲なら、その日すべてについて1回）。
      }
    } else if (!hypo && !past && carry.vague && dates.length === 0) {
      // 「来週はパパが出張」「月末は外食」：どの日か分からない。今日の欠席にも、週の献立を見せる命令にもしない
      // （日付か曜日で送ってもらう。ほかの用件と一緒に書いても、黙って捨てない）。「かも」は、決まっていない話として返す。
      return maybe ? [] : vagueAsk('absence');
    }
  } else if (
    lateHit &&
    !question &&
    !hypo &&
    !past &&
    !(carry.vague && dates.length === 0) &&
    (refs.length > 0 || !!carry.memberRefs || !IMPOSSIBLE.test(restImp))
  ) {
    // 遅くなるだけ（「水曜ははるとが塾」「パパは帰りが遅い」）：欠席にしない。人を書かない「今日は帰りが遅い」は今日は無理（下で読む）。
    const writer = ctx.senderId ?? soloMember(ctx.members);
    const who = refs.length > 0 ? refs : carry.memberRefs ?? (writer ? [writer] : ['']);
    return absenceDays(dates, today, carry).flatMap((d) => who.map((r) => ({ type: 'absence' as const, date: d, memberRef: r, tentative: 'late' as const })));
  } else if (!absenceHit && refs.length > 0 && PRESENCE.test(rest) && !question && !hypo && !past) {
    // 「木曜ははるといる」「やっぱりパパも食べる」
    return cancel(refs);
  } else if (!absenceHit && refs.length === 0 && !carry.memberRefs && HOME_EAT.test(rest) && !question && !hypo && !past) {
    // 「金曜はやっぱり家で食べる」（人を書かない）：その日の欠席をすべて取り消す（みんな外で食べる日を戻す）。
    return cancel(['みんな']);
  }

  // 在庫：食材ごとに、すぐ後ろの言葉で判断する（「卵はあるけど牛乳がない」）。
  type StockKind = 'out' | 'have' | 'froze' | 'ask';
  const stock = new Map<string, StockKind>();
  ingSpans.forEach((span, i) => {
    const after = t.slice(span.end, ingSpans[i + 1]?.start ?? t.length);
    if (FROZE_AFTER.test(after)) stock.set(span.id, 'froze');
    else if (NOT_OUT.test(after.slice(0, 12))) stock.set(span.id, 'ask');
    else if (OUT_AFTER.test(after)) stock.set(span.id, 'out');
    else if (HAVE_AFTER.test(after)) stock.set(span.id, 'have');
  });
  const targets = ingIds.length > 0 ? uniq([...carry.pending, ...ingIds]) : out.length === 0 ? carry.pending : [];
  const anyFroze = FROZE.test(rest);
  const anyNotOut = NOT_OUT.test(rest);
  const anyOut = OUT_ANY.test(rest);
  const anyHave = HAVE_ANY.test(rest);
  const buyRequest = BUY_REQUEST.test(rest);
  // 仮定・質問で在庫の言葉がある（「卵が切れたら教えて」「豆腐あったかな」）。
  const stockWord = /切れ|きれ|切らし|きらし|なくなっ|無くなっ|使い切|使いきっ|買|かっ|ある|あっ|あり|残っ|余っ/.test(rest);
  for (const id of targets) {
    if (stock.has(id)) continue;
    if (anyFroze) stock.set(id, 'froze');
    else if (anyNotOut) stock.set(id, 'ask');
    else if (anyOut) stock.set(id, 'out');
    else if (anyHave) stock.set(id, 'have');
    else if (buyRequest || ((question || hypo) && stockWord)) stock.set(id, 'ask');
  }
  // 質問・仮定・決まっていない（「豆腐あったっけ？」「卵が切れたら」「卵切れたかも」）は、在庫を変えずに今の状態を答える。
  if (question || hypo || maybe) for (const id of stock.keys()) stock.set(id, 'ask');
  if (stock.size > 0) carry.pending = [];
  for (const [id, kind] of stock) {
    if (kind === 'out') out.push({ type: 'out_of_stock', ingredientId: id });
    else if (kind === 'have') out.push({ type: 'have', ingredientId: id });
    else if (kind === 'froze') out.push({ type: 'have', ingredientId: id, frozen: true });
    else out.push({ type: 'have', ingredientId: id, question: true });
  }
  if (out.length > 0) return out;

  // 今日は無理：「疲れた」「今日は無理」（ほかの日なら、その日の差し替え）。あいさつの「おつかれさま」は除く。
  if (IMPOSSIBLE.test(restImp)) {
    if (negatedAfter(restImp, IMPOSSIBLE)) return [lookAt(firstDate)]; // 「今日は無理じゃない」→ そのまま
    if (question) return [lookAt(firstDate)];
    if (hypo || past) return []; // 「無理なら」「昨日は無理だった」は、今日を変えない
    // 「来週は無理」「月末は無理」：今日をラク日にしない（日付か曜日で送ってもらう）。「今週は無理」は今日のこと。
    if (dates.length === 0 && carry.vagueLater) return maybe ? [] : vagueAsk('other');
    const ds = dates.filter((d) => d >= today);
    if (ds.length === 0) return dates.length > 0 ? [] : [{ type: 'today_impossible' }];
    return uniq(ds).map((d) => (d === today ? { type: 'today_impossible' as const } : { type: 'want_alternatives' as const, date: d }));
  }
  if (absenceNegated) return [lookAt(firstDate)]; // 「今日は外食じゃない」→ そのまま
  if (past) return []; // 過去の日の話（「昨日はカレーがよかった」）では献立を変えない

  const change = CHANGE.test(rest);
  const wants = REQUEST.test(rest);
  const dishSpan = dishSpans[0];
  if (dishSpan) {
    // 「キーマカレー飽きた」「さばの味噌煮じゃないのがいい」は、その料理の日の別の案。
    if (CHANGE_AFTER.test(t.slice(dishSpan.end))) return [withDate({ type: 'want_alternatives', dishId: dishSpan.id })];
    // 「今日の給食カレーだった」「お昼はカレーが出た」は、あったことの話。リクエストにしない。
    if (!wants && !change && PAST_TALK.test(t.slice(dishSpan.end))) return [];
    if (wants || change || firstDate) return [withDate({ type: 'request', dishId: dishSpan.id })];
  }
  if (change) return [withDate({ type: 'want_alternatives' })];

  // ジャンル・たんぱく源（「中華がいい」「明日は魚」）は、料理名のあいまいな一致より先に見る（「中華」→ 冷やし中華、にしない）。
  const before = wants ? t.split(REQUEST_SPLIT)[0] : firstDate ? t : '';
  if (before) {
    const masked = findMemberRefs(findDates(before, today).masked, ctx.members).masked;
    const noun = nounBefore(masked);
    if (noun) {
      const genre = onlyWord(noun, GENRE_WORDS);
      if (genre) return [withDate({ type: 'request', genre })];
      const protein = onlyWord(noun, PROTEIN_WORDS);
      if (protein) return [withDate({ type: 'request', protein })];
      if (MEAT_WORDS.some((w) => noun.startsWith(w) && FOOD_TAIL.test(noun.slice(w.length)))) {
        const ids = ctx.catalog.dishes.filter((d) => d.role === 'main' && isMeat(d.protein)).map((d) => d.id);
        return [withDate({ type: 'request', dishIds: ids })];
      }
      if (wants) {
        const ingId = singleIngredient(noun, ctx.catalog);
        if (ingId) {
          const ing = ctx.catalog.ingredientById.get(ingId);
          const p = ing ? proteinOfKind(ing.kind) : 'none';
          return [withDate({ type: 'request', ingredientId: ingId, ...(p !== 'none' ? { protein: p } : {}) })];
        }
        const loose = looseDishes(noun, ctx.catalog);
        if (loose.length === 1) return [withDate({ type: 'request', dishId: loose[0].id })];
        if (loose.length > 1) return [withDate({ type: 'request', dishIds: loose.map((d) => d.id) })];
      }
    }
  }
  if (wants) {
    // 料理名が取れないとき：食材・たんぱく源・ジャンルの語。「たこ焼き」のような知らない料理名の食材は使わない。
    const span = ingSpans.find((s) => !COOK_SUFFIX.test(t.slice(s.end)));
    const ing = span ? ctx.catalog.ingredientById.get(span.id) : undefined;
    const fromIng = ing && proteinOfKind(ing.kind) !== 'none' ? proteinOfKind(ing.kind) : undefined;
    const protein = findProtein(rest) ?? fromIng;
    const genre = findGenre(rest);
    if (protein || genre) {
      return [
        withDate({
          type: 'request',
          ...(protein ? { protein } : {}),
          ...(genre ? { genre } : {}),
          ...(ing && fromIng ? { ingredientId: ing.id } : {}),
        }),
      ];
    }
  }
  // 表示の命令は、「ごはん」「ご飯」（米の別名）を食材として隠さずに見る（「今日のごはん」「晩ごはん何？」）。
  const shown = mask(t, spans.filter((sp) => !MEAL_WORDS.test(t.slice(sp.start, sp.end))));
  // 「明日の夕飯いらない」（人を書かない）：誰の分かを聞き返す（献立を見せる、より先に）。
  if (askWho) return askWho.map((d) => ({ type: 'absence' as const, date: d, memberRef: '' }));
  // 「明日のごはんは？」「明日なに？」のように今日以外の日を聞かれたら、その日の献立（2日以上なら週の献立）を見せる。
  if (firstDate && firstDate !== today && (MEAL_WORDS.test(shown) || WHAT.test(shown))) {
    return [dates.length === 1 ? { type: 'show_today', date: firstDate } : { type: 'show_week' }];
  }
  // 「今日の夜ごはんなんだっけ」
  if (firstDate === today && MEAL_WORDS.test(shown) && (WHAT.test(shown) || question)) return [{ type: 'show_today' }];
  if (SHOW_TODAY.test(shown)) return [{ type: 'show_today' }];
  if (SHOW_WEEK.test(shown)) return [{ type: 'show_week' }];
  if (SHOW_SHOPPING.test(shown)) return [{ type: 'show_shopping' }];
  if (ingIds.length > 0) carry.pending = uniq([...carry.pending, ...ingIds]);
  return [];
}

/** 食べ物の絵文字（「🍛食べたい」）を言葉にする。 */
const EMOJI_WORDS: [RegExp, string][] = [
  [/🍛/gu, 'カレー'],
  [/🍜/gu, 'ラーメン'],
  [/🍝/gu, 'パスタ'],
  [/🍣/gu, '寿司'],
  [/🍲/gu, '鍋'],
  [/[🐟🐠]/gu, '魚'],
  [/[🍖🥩]/gu, '肉'],
  [/🍗/gu, '鶏肉'],
  [/🦐/gu, 'えび'],
  [/🍤/gu, 'えびフライ'],
  [/[🥚🍳]/gu, '卵'],
  [/🥗/gu, 'サラダ'],
  [/🥟/gu, 'ぎょうざ'],
  [/🍢/gu, 'おでん'],
];

/**
 * 「誰が食べませんか？」への答えが、名前だけか（「パパ」「はるとです」「パパとはると」）。名前だけなら、その呼び方。
 */
export function memberAnswer(text: string, members: Member[]): string[] | null {
  const t = n(text.normalize('NFKC').replace(/@\s*(きめとく|キメトク|kimetoku)/gi, ''));
  if (!t || t.length > 20) return null;
  const { refs, masked } = findMemberRefs(t, members);
  if (refs.length === 0) return null;
  const rest = masked.replace(/[＿、,・。.!！?？\s~〜ー♪]/g, '').replace(/(と|や|も|は|が|の|さん|ちゃん|くん|です|でーす|だよ|だね|だ|よ|ね|かな|です)+/g, '');
  return rest.length === 0 ? refs : null;
}

/** 「どの日ですか？」への答えが、日付だけか（「木曜」「明日のほう」「11/12です」）。日付だけなら、その日。 */
export function dateAnswer(text: string, today: ISODate): ISODate[] | null {
  const t = n(text.normalize('NFKC').replace(/@\s*(きめとく|キメトク|kimetoku)/gi, ''));
  if (!t || t.length > 20) return null;
  const found = findDates(t, today);
  if (found.dates.length === 0 || found.past) return null;
  const rest = found.masked
    .replace(/[＿、,・。.!！?？\s~〜ー♪()（）]/g, '')
    .replace(/(と|や|も|は|の|方|ほう|分|ぶん|です|でーす|だよ|だね|だ|よ|ね|かな|でした)+/g, '');
  return rest.length === 0 ? found.dates : null;
}

/** 公開API：ルールベースで話し言葉を解釈する。「@きめとく」の有無は問わない。 */
export function parseMessage(text: string, ctx: ParseContext): ParsedCommand[] {
  let cleaned = text.normalize('NFKC').replace(/@\s*(きめとく|キメトク|kimetoku)/gi, ' ');
  for (const [r, w] of EMOJI_WORDS) cleaned = cleaned.replace(r, w);
  // 「来週の水曜、木曜はパパいない」：週を書いた曜日に「、」で続けた曜日は、同じ週の並び（節に分けると、木曜が今週になる）。
  for (let prev = ''; prev !== cleaned; ) {
    prev = cleaned;
    cleaned = cleaned.replace(WEEK_WD_COMMA, '$1・');
  }
  // 文の区切りの「？」は、質問の印として残す。
  const pieces = cleaned.split(/([。．.!！?？\n]+)/);
  const out: ParsedCommand[] = [];
  for (let i = 0; i < pieces.length; i += 2) {
    const sentence = pieces[i].trim();
    if (!sentence) continue;
    const delim = pieces[i + 1] ?? '';
    const question = /[?？]/.test(delim) || QUESTION_END.test(n(sentence).replace(/[、,\s]+$/, ''));
    const carry: Carry = { pending: [], question };
    // 「昨日カレーだったから今日は別のがいい」：あったことを理由にした節（〜だったから・〜だったので）は、分けて読む。
    const clauses = sentence
      .split(/[、,]+|けれど|けど|(?<=だった|でした|出た|でた)(?:から|ので)/)
      .map((x) => x.trim())
      .filter(Boolean);
    let found: ParsedCommand[] = [];
    // 「明日の飲み会、行くかどうか未定」：決まっていないことだけを書いた節があれば、同じ文の欠席も決まっていないとして読む。
    // その節に日付があれば（「水曜パパ出張、木曜はわからない」）、その日の欠席だけ。
    let unsure: ISODate[] | 'all' | null = null;
    // 過ぎた日だけの節（「昨日は無理だった」）があれば、文全体で読み直さない（「今日は作る」と日付が混ざって、今日は無理と読むため）。
    let pastClause = false;
    for (const clause of clauses) {
      const own = findDates(n(clause), ctx.today);
      if (own.dates.length > 0 && own.past) pastClause = true;
      const got = parseClause(clause, ctx, carry);
      if (got.length === 0 && MAYBE.test(n(clause))) {
        const own = findDates(n(clause), ctx.today).dates;
        unsure = own.length > 0 ? [...(Array.isArray(unsure) ? unsure : []), ...own] : 'all';
      }
      found.push(...got);
    }
    if (found.length === 0 && clauses.length > 1 && !pastClause) found.push(...parseClause(sentence, ctx, { pending: [], question }));
    if (unsure) {
      const hit = (d: ISODate) => unsure === 'all' || (Array.isArray(unsure) && unsure.includes(d));
      found = found.map((c) => (c.type === 'absence' && !c.tentative && hit(c.date) ? { ...c, tentative: 'maybe' as const } : c));
    }
    out.push(...found);
  }
  const seen = new Set<string>();
  const unique = out.filter((c) => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.length > 0 ? unique : [{ type: 'unknown', text: text.trim() }];
}

/** 日付が今日以降の週に収まっているか（LLM の結果の検証などに使う）。 */
export function isReasonableDate(date: string, today: ISODate): boolean {
  return isISODate(date) && date >= addDays(today, -7) && date <= addDays(today, 21);
}
