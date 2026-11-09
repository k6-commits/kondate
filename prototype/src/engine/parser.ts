// 話し言葉の解釈（ルールベース。DESIGN.md 3-8）。LLM がないときもこれで動く。
// 照合はすべて normalizeJa（NFKC・カタカナ→ひらがな）した文で行う。
//
// 状態を変える命令（今日は無理・欠席・在庫）は、次のときには出さない（DESIGN.md 3-9）。
// - 否定（「今日は無理じゃない」「卵は切れてない」）→ 今の献立・在庫を見せて確かめる
// - 仮定（「卵が切れたら」「無理なら」）・質問（「豆腐あったっけ？」）→ 在庫を聞かれたら、今の状態で答える
// - 過去の日（「昨日は無理だった」）→ 前日の確認への答えとして、会話の側で扱う
import type { Catalog, Dish, Genre, ISODate, Member, ParseContext, ParsedCommand, Protein } from './types';
import { addDays, isISODate, nextWeekday, weekStartOf } from './dates';
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
]);
const MEAL_WORDS = re(['ごはん', 'ご飯', '夕飯', '夕食', '晩ごはん', '献立', 'メニュー', '何作る', 'なに作る', 'なんだっけ']);
const WHAT = /なに|何|なん/;
const SHOW_WEEK = re(['今週の献立', '来週の献立', '献立', 'こんだて', '今週', '来週', '一週間', 'メニュー']);
const SALE = re([
  '安い', 'やすい', '安かった', 'やすかった', '特売', 'とくばい', 'セール', 'お買い得', 'おかいどく', '割引', 'わりびき',
  '半額', 'はんがく', '値引き', 'ねびき', '見切り', 'みきり',
]);
const PRICE = /\d+円/;
const EASY = /(食べ|たべ|作り|つくり|使い|つかい|扱い|あつかい)やすい/g;
const ABSENCE = re([
  '飲み会', 'のみかい', 'いらない', '要らない', '不要', '外食', 'がいしょく', '遅い', 'おそい', '遅く', 'おそく', '出張',
  'しゅっちょう', 'いない', '居ない', '留守', 'るす', 'ごはんなし', 'ご飯なし', '夕飯なし', '食べない', 'たべない',
  '食べてくる', 'たべてくる', '食べてきます', '残業', 'ざんぎょう', '会食', '泊まり', 'とまり', 'お泊', '旅行', 'りょこう',
  '部活', '塾', 'じゅく', '欠席', '実家', '帰省', 'いません', '外で食べる', '給食',
]);
const EAT_OUT = re(['外食', 'がいしょく', '外で食べる', 'そとで食べる']);
/** 人を書かずに「今日はいらない」→ 今日は無理と同じに扱う。 */
const NO_NEED = re(['いらない', '要らない', '不要']);
/** 「外食が多い」のような頻度の話は、欠席にしない。 */
const FREQUENCY = /多い|多かった|多く|おおい|ばかり|ばっかり|続き|つづき|がち/;
/** 欠席の取り消し：「木曜のお泊まりなくなった」「飲み会中止」。 */
const CANCEL_EVENT =
  /(お?泊まり|お?泊り|とまり|飲み会|のみかい|出張|しゅっちょう|外食|がいしょく|残業|ざんぎょう|会食|旅行|りょこう|部活|塾|じゅく|用事|ようじ|欠席)(が|は|も|の)?(なくなっ|無くなっ|中止|ちゅうし|きゃんせる|取りやめ|とりやめ|やめに|延期|えんき|なし|無し|ない)/;
/** 欠席の取り消し：「(人)は木曜いる」「やっぱり(人)も食べる」。 */
const PRESENCE =
  /(いる|居る|います|食べる|たべる|食べます|たべます|食べられる|たべられる|帰ってくる|かえってくる|帰れる|かえれる|間に合う|まにあう|家で食べ|いえで食べ|うちで食べ)(?!か|な)/;
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
const HAVE_AFTER =
  /^(が|は|も|を)?(まだ)?(買った|買ってきた|買ってきました|買っておいた|買っといた|買ってある|買ってあります|買いました|かった|かってきた|かっておいた|かっといた|かってある|かいました|ある|あります|あった|ありました|もらった|もらいました|貰った|いただいた|いただきました|頂いた|頂きました|届いた|とどいた|届きました|残って|のこって|余って|あまって)/;
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
const ROLE_WORDS = [
  '上の子', '下の子', '末っ子', '長男', '長女', '次男', '次女', '息子', '娘', '旦那', 'だんな', '主人', 'お父さん', 'お母さん',
  '奥さん', 'パパ', 'ママ', '子ども', '子供', 'こども', 'みんな', '全員', '家族', '夫', '妻', '嫁',
].sort((a, b) => b.length - a.length);
const WD_KANJI: Record<string, number> = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 0 };
const WD_KANA: Record<string, number> = { げつ: 1, か: 2, すい: 3, もく: 4, きん: 5, ど: 6, にち: 0 };

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
  if (after && isHira(after[0]) && !/^(が|は|も|を|と|や|の|に|で|って)/.test(after)) return false;
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

function mask(t: string, spans: Span[]): string {
  let out = t;
  for (const s of spans) out = out.slice(0, s.start) + '＿'.repeat(s.end - s.start) + out.slice(s.end);
  return out;
}

// ---------------------------------------------------------------------------
// 日付
// ---------------------------------------------------------------------------

export interface FoundDates {
  /** 書かれた順の日付（「明日と明後日」なら2つ）。 */
  dates: ISODate[];
  /** すべて過去の日（「昨日」「おととい」）か、「先週」のように過去の話。 */
  past: boolean;
  /** 「今週」「来週」だけで、どの日か分からない。 */
  vague: boolean;
  /** 日付の表現を伏せ字にした文。 */
  masked: string;
}

const wd = (x: number) => x as 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 日付の表現（今日、明日、あさって、〇曜、来週・再来週の〇曜、週末、昨日、11/13、13日 など）をすべて拾う。 */
export function findDates(t: string, today: ISODate): FoundDates {
  const hits: { at: number; dates: ISODate[] }[] = [];
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
      else hits.push({ at, dates: res });
      return '＿'.repeat(m[0].length);
    });
  };
  const weekend = (start: ISODate) => [addDays(start, 5), addDays(start, 6)];
  take(/(再来週|さらいしゅう)の?([月火水木金土日])曜日?/, (m) => [addDays(ws, 14 + ((WD_KANJI[m[2]] + 6) % 7))]);
  take(/(来週|らいしゅう|今週|こんしゅう)の?([月火水木金土日])曜日?/, (m) => [
    addDays(ws, (/来週|らいしゅう/.test(m[1]) ? 7 : 0) + ((WD_KANJI[m[2]] + 6) % 7)),
  ]);
  take(/来週末|らいしゅうまつ/, () => weekend(addDays(ws, 7)));
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
  take(/(\d{1,2})日(?=は|に|の|も|$)/, (m) => {
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
  take(/^([月火水木金土日])(?=は|に|の|も)/, (m) => [nextWeekday(today, wd(WD_KANJI[m[1]]))]);
  const dates = uniq(hits.sort((a, b) => a.at - b.at).flatMap((h) => h.dates));
  const past = dates.length > 0 ? dates.every((d) => d < today) : pastWord;
  const vague = dates.length === 0 && /今週|こんしゅう|来週|らいしゅう|再来週/.test(s);
  return { dates, past, vague, masked: s };
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
  return { refs: uniq(refs), masked: cleaned };
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
  past?: boolean;
  vague?: boolean;
  /** 動詞のない節の食材（「卵、牛乳、豆腐買った」の卵・牛乳）。後ろの節の在庫・特売の語を当てる。 */
  pending: string[];
  memberRefs?: string[];
  /** 質問の文（「？」「っけ」「かな」）。 */
  question: boolean;
}

/** キーワードのすぐ後ろが否定か。 */
function negatedAfter(text: string, r: RegExp): boolean {
  const m = r.exec(text);
  if (!m) return false;
  return NEG_AFTER.test(text.slice(m.index + m[0].length));
}

function parseClause(raw: string, ctx: ParseContext, carry: Carry): ParsedCommand[] {
  const t = n(raw);
  if (!t) return [];
  const vocab = vocabOf(ctx.catalog);
  const found = findDates(t, ctx.today);
  if (found.dates.length > 0 || found.past || found.vague) {
    carry.dates = found.dates;
    carry.past = found.past;
    carry.vague = found.vague;
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
  const { refs } = findMemberRefs(rest, ctx.members);
  if (refs.length > 0) carry.memberRefs = refs;
  const hypo = HYPO.test(rest);

  if (SHOW_SHOPPING.test(rest) && ingIds.length === 0 && !/買い忘れ|かいわすれ/.test(rest)) return [{ type: 'show_shopping' }];

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

  // 欠席の取り消し：「木曜のお泊まりなくなった」（欠席の語より先に見る。「お泊まり中止」を新しい欠席にしない）。
  const cancel = (who: string[]): ParsedCommand[] =>
    (dates.length > 0 ? dates : [today]).flatMap((d) => who.map((r) => ({ type: 'absence' as const, date: d, memberRef: r, cancel: true })));
  if (CANCEL_EVENT.test(rest) && !question && !hypo && !past) {
    return cancel(refs.length > 0 ? refs : carry.memberRefs ?? ['みんな']);
  }

  const out: ParsedCommand[] = [];
  // 欠席：「水曜は夫が飲み会」「明日と明後日はパパいない」
  const absenceHit = ABSENCE.test(rest) && !FREQUENCY.test(rest);
  const absenceNegated = absenceHit && negatedAfter(rest, ABSENCE);
  const noNeed = refs.length === 0 && !carry.memberRefs && NO_NEED.test(rest);
  let askWho = false;
  if (absenceHit && !absenceNegated) {
    if (question) return [lookAt(firstDate)];
    if (!hypo && !past && !(carry.vague && dates.length === 0)) {
      const who = refs.length > 0 ? refs : carry.memberRefs ?? (EAT_OUT.test(rest) ? ['みんな'] : []);
      if (who.length > 0) {
        for (const d of dates.length > 0 ? dates : [today]) for (const r of who) out.push({ type: 'absence', date: d, memberRef: r });
      } else if (!noNeed) {
        askWho = true; // 誰がいないか分からない。ほかに読めることがなければ聞き返す。
      }
    }
  } else if (!absenceHit && refs.length > 0 && PRESENCE.test(rest) && !question && !hypo && !past) {
    // 「木曜ははるといる」「やっぱりパパも食べる」
    return cancel(refs);
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
  // 質問・仮定（「豆腐あったっけ？」「卵が切れたら」）は、在庫を変えずに今の状態を答える。
  if (question || hypo) for (const id of stock.keys()) stock.set(id, 'ask');
  if (stock.size > 0) carry.pending = [];
  for (const [id, kind] of stock) {
    if (kind === 'out') out.push({ type: 'out_of_stock', ingredientId: id });
    else if (kind === 'have') out.push({ type: 'have', ingredientId: id });
    else if (kind === 'froze') out.push({ type: 'have', ingredientId: id, frozen: true });
    else out.push({ type: 'have', ingredientId: id, question: true });
  }
  if (out.length > 0) return out;

  // 今日は無理：「疲れた」「今日は無理」（ほかの日なら、その日の差し替え）。あいさつの「おつかれさま」は除く。
  const restImp = rest.replace(/お(疲れ|つかれ)(さま|様|さん|です|でした)?/g, '');
  if (IMPOSSIBLE.test(restImp) || noNeed) {
    const r = IMPOSSIBLE.test(restImp) ? IMPOSSIBLE : NO_NEED;
    if (negatedAfter(restImp, r)) return [lookAt(firstDate)]; // 「今日は無理じゃない」→ そのまま
    if (question) return [lookAt(firstDate)];
    if (hypo || past) return []; // 「無理なら」「昨日は無理だった」は、今日を変えない
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
  // 「明日のごはんは？」「明日なに？」のように今日以外の日を聞かれたら、週の献立を見せる。
  if (firstDate && firstDate !== today && (MEAL_WORDS.test(shown) || WHAT.test(shown))) return [{ type: 'show_week' }];
  if (askWho) return [{ type: 'absence', date: firstDate ?? today, memberRef: '' }];
  if (SHOW_TODAY.test(shown)) return [{ type: 'show_today' }];
  if (SHOW_WEEK.test(shown)) return [{ type: 'show_week' }];
  if (SHOW_SHOPPING.test(shown)) return [{ type: 'show_shopping' }];
  if (ingIds.length > 0) carry.pending = uniq([...carry.pending, ...ingIds]);
  return [];
}

/** 公開API：ルールベースで話し言葉を解釈する。「@きめとく」の有無は問わない。 */
export function parseMessage(text: string, ctx: ParseContext): ParsedCommand[] {
  const cleaned = text.normalize('NFKC').replace(/@\s*(きめとく|キメトク|kimetoku)/gi, ' ');
  // 文の区切りの「？」は、質問の印として残す。
  const pieces = cleaned.split(/([。．.!！?？\n]+)/);
  const out: ParsedCommand[] = [];
  for (let i = 0; i < pieces.length; i += 2) {
    const sentence = pieces[i].trim();
    if (!sentence) continue;
    const delim = pieces[i + 1] ?? '';
    const question = /[?？]/.test(delim) || QUESTION_END.test(n(sentence).replace(/[、,\s]+$/, ''));
    const carry: Carry = { pending: [], question };
    const clauses = sentence
      .split(/[、,]+|けれど|けど/)
      .map((x) => x.trim())
      .filter(Boolean);
    const found: ParsedCommand[] = [];
    for (const clause of clauses) found.push(...parseClause(clause, ctx, carry));
    if (found.length === 0 && clauses.length > 1) found.push(...parseClause(sentence, ctx, { pending: [], question }));
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
