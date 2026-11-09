// 話し言葉の解釈（ルールベース。DESIGN.md 3-8）。LLM がないときもこれで動く。
// 照合はすべて normalizeJa（NFKC・カタカナ→ひらがな）した文で行う。
import type { Catalog, Dish, Genre, ISODate, Member, ParseContext, ParsedCommand, Protein } from './types';
import { addDays, isISODate, nextWeekday, weekStartOf } from './dates';
import { proteinOfKind } from './context';
import { normalizeJa, uniq } from './util';

const n = normalizeJa;
const re = (words: string[]) => new RegExp(words.map((w) => n(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));

const HELP = re(['使い方', '使いかた', 'つかいかた', 'ヘルプ', 'help', '何ができる', 'なにができる', 'どう使う', 'どうやって使う']);
const SHOW_SHOPPING = re(['買い物リスト', '買い物', 'かいもの', 'リスト', '買うもの', '買う物', 'かうもの']);
const SHOW_TODAY = re([
  '今日のごはん', '今日のご飯', '今日の夕飯', '今日の夕食', '今日の献立', '今日のメニュー', 'きょうのごはん',
  '今夜のごはん', '今晩のごはん', '今日は何', '今日はなに', '今日なに', '晩ごはん', '晩ご飯', '夕飯', '夕食', 'ばんごはん',
]);
const MEAL_WORDS = re(['ごはん', 'ご飯', '夕飯', '夕食', '晩ごはん', '献立', 'メニュー', '何作る', 'なに作る', 'なんだっけ']);
const SHOW_WEEK = re(['今週の献立', '来週の献立', '献立', 'こんだて', '今週', '来週', '一週間', 'メニュー']);
const SALE = re([
  '安い', 'やすい', '安かった', 'やすかった', '特売', 'とくばい', 'セール', 'お買い得', 'おかいどく', '割引', 'わりびき',
  '半額', 'はんがく', '値引き', 'ねびき', '見切り', 'みきり',
]);
const EASY = /(食べ|たべ|作り|つくり|使い|つかい|扱い|あつかい)やすい/g;
const ABSENCE = re([
  '飲み会', 'のみかい', 'いらない', '要らない', '不要', '外食', 'がいしょく', '遅い', 'おそい', '遅く', 'おそく', '出張',
  'しゅっちょう', 'いない', '居ない', '留守', 'るす', 'ごはんなし', 'ご飯なし', '夕飯なし', '食べない', 'たべない',
  '食べてくる', 'たべてくる', '食べてきます', '残業', 'ざんぎょう', '会食', '泊まり', 'とまり', 'お泊', '旅行', 'りょこう',
  '部活', '塾', 'じゅく', '欠席', '実家', '帰省', 'いません', '外で食べる', '給食',
]);
const EAT_OUT = re(['外食', 'がいしょく', '外で食べる', 'そとで食べる']);
const OUT_AFTER = /^(が|は|も|を)?(もう)?(ない|無い|なかった|ありません|切れ|きれ|切らし|きらし|なくなっ|無くなっ|使い切っ|使いきっ|つかいきっ|品切れ|買い忘れ|かいわすれ)/;
const HAVE_AFTER = /^(が|は|も|を)?(まだ)?(買っ|かっ|買いまし|かいまし|ある|あり|あっ|もらっ|貰っ|いただい|頂い|届い|とどい|残って|のこって|余って|あまって|冷凍して)/;
const OUT_ANY = /(切れた|きれた|切れてる|きれてる|切らし|きらし|なくなっ|無くなっ|使い切っ|使いきっ|つかいきっ|品切れ|買い忘れ|かいわすれ|(が|は|も)(ない|無い|なかった|ありません))/;
const HAVE_ANY = /(買った|買ってき|かってき|買いまし|かいまし|もらっ|貰っ|いただい|頂い|届い|とどい|残って|のこって|余って|あまって|(が|は|も)(ある|あります|あった))/;
const IMPOSSIBLE = re([
  '無理', 'むり', '疲れ', 'つかれ', 'しんどい', '作れない', 'つくれない', '作る気', 'つくる気', 'つくるき', '手抜き', 'てぬき',
  'ラクしたい', '楽したい', 'ラクにしたい', '楽にしたい', '余裕がない', 'よゆうがない', 'ぐったり', 'へとへと', 'だるい',
  '体調', '気力', 'できない', '作りたくない', 'つくりたくない', '帰りが遅', 'かえりがおそ',
]);
const CHANGE = re([
  '別の', 'べつの', 'ほかの', '他の', '違うの', 'ちがうの', '変えて', '替えて', '代えて', '変えたい', '替えたい', '変更',
  'へんこう', '気分じゃない', 'きぶんじゃない', '飽きた', 'あきた', '差し替え', 'さしかえ', 'チェンジ', 'ほかに',
]);
const REQUEST = re([
  'がいい', 'が良い', 'がよい', 'にして', 'にしたい', 'にしよう', '食べたい', 'たべたい', '希望', 'きぼう', 'リクエスト',
  '作りたい', 'つくりたい', 'がほしい', 'が欲しい', 'でお願い', 'でおねがい', 'がいいな',
]);
const REQUEST_SPLIT = /(がいい|が良い|がよい|にして|にしたい|にしよう|が食べたい|がたべたい|食べたい|たべたい|が希望|がきぼう|をりくえすと|が作りたい|がつくりたい|がほしい|が欲しい|でお願い|でおねがい|に変えて|に替えて|にかえて)/;

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
const ROLE_WORDS = [
  '上の子', '下の子', '末っ子', '長男', '長女', '次男', '次女', '息子', '娘', '旦那', 'だんな', '主人', 'お父さん', 'お母さん',
  '奥さん', 'パパ', 'ママ', '子ども', '子供', 'こども', 'みんな', '全員', '家族', '夫', '妻', '嫁',
];
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

function vocabOf(catalog: Catalog): Vocab {
  const cached = vocabCache.get(catalog);
  if (cached) return cached;
  const terms: Term[] = [];
  for (const ing of catalog.ingredients) {
    for (const raw of uniq([ing.name, ...ing.aliases])) {
      const term = n(raw);
      // ひらがな1文字の語は誤って当たりやすいので使わない（漢字1文字の「卵」などは使う）。
      if (term.length === 0 || (term.length === 1 && /[\u3040-\u309f]/.test(term))) continue;
      terms.push({ term, id: ing.id, kind: 'ing', nameLen: term.length });
    }
  }
  for (const d of catalog.dishes) {
    const name = n(d.name);
    const variants = uniq([name, name.replace(/[（(].*[）)]$/, ''), name.replace(/らいす$/, '')]);
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

function findSpans(t: string, terms: Term[]): (Span & { kind: Term['kind'] })[] {
  const found: (Span & { kind: Term['kind'] })[] = [];
  for (const { term, id, kind } of terms) {
    let from = 0;
    for (;;) {
      const at = t.indexOf(term, from);
      if (at < 0) break;
      const end = at + term.length;
      if (!overlaps(found, at, end)) found.push({ id, start: at, end, kind });
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

/** 日付の表現（今日、明日、あさって、〇曜、来週の〇曜、11/13、13日 など）。 */
export function findDate(t: string, today: ISODate): ISODate | undefined {
  if (/あさって|明後日/.test(t)) return addDays(today, 2);
  if (/明日|あした/.test(t)) return addDays(today, 1);
  if (/今日|きょう|今夜|今晩|こんや|こんばん/.test(t)) return today;
  let m = t.match(/(来週|らいしゅう|今週|こんしゅう)?の?([月火水木金土日])曜/);
  if (m) {
    const wd = WD_KANJI[m[2]];
    if (m[1]) return addDays(weekStartOf(today), (/来週|らいしゅう/.test(m[1]) ? 7 : 0) + ((wd + 6) % 7));
    return nextWeekday(today, wd as 0 | 1 | 2 | 3 | 4 | 5 | 6);
  }
  m = t.match(/(げつ|か|すい|もく|きん|ど|にち)よう/);
  if (m) return nextWeekday(today, WD_KANA[m[1]] as 0 | 1 | 2 | 3 | 4 | 5 | 6);
  m = t.match(/(\d{1,2})[/月](\d{1,2})日?/);
  if (m) {
    const year = Number(today.slice(0, 4));
    const pad = (x: number) => String(x).padStart(2, '0');
    for (const y of [year, year + 1]) {
      const d = `${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
      if (isISODate(d) && d >= addDays(today, -60)) return d;
    }
  }
  m = t.match(/(?:^|[^\d/])(\d{1,2})日(?:は|に|の|も|$)/);
  if (m) {
    const day = Number(m[1]);
    const [y, mo] = today.split('-').map(Number);
    for (let k = 0; k < 2; k++) {
      const yy = mo + k > 12 ? y + 1 : y;
      const mm = ((mo + k - 1) % 12) + 1;
      const d = `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (isISODate(d) && d >= today) return d;
    }
  }
  m = t.match(/^([月火水木金土日])(?:は|に|の|も)/);
  if (m) return nextWeekday(today, WD_KANJI[m[1]] as 0 | 1 | 2 | 3 | 4 | 5 | 6);
  return undefined;
}

function findMemberRef(t: string, members: Member[]): string | undefined {
  const cleaned = t.replace(/大丈夫|だいじょうぶ/g, '');
  const nicks = members
    .map((m) => ({ ref: m.nickname, key: n(m.nickname) }))
    .filter((x) => x.key.length >= 2 || (x.key.length === 1 && /[^぀-ゟ]/.test(x.key)))
    .sort((a, b) => b.key.length - a.key.length);
  for (const x of nicks) if (cleaned.includes(x.key)) return x.ref;
  for (const w of ROLE_WORDS) if (cleaned.includes(n(w))) return w;
  return undefined;
}

function findProtein(t: string): Protein | undefined {
  for (const [p, words] of PROTEIN_WORDS) if (words.some((w) => t.includes(n(w)))) return p;
  return undefined;
}

function findGenre(t: string): Genre | undefined {
  for (const [g, words] of GENRE_WORDS) if (words.some((w) => t.includes(n(w)))) return g;
  return undefined;
}

/** 「カレーがいい」の「カレー」から料理を探す（料理名に含まれていれば当てる）。 */
const DATE_PREFIX = /^(来週|らいしゅう|今週|こんしゅう)?の?([月火水木金土日]曜日?|今日|明日|あさって|明後日|あした|きょう|今夜|今晩|\d{1,2}[/月]\d{1,2}日?|\d{1,2}日|[月火水木金土日](?=は|も|の))/;

/** 「から揚げ／からあげ」「焼き／やき」などの書き分けをそろえる。 */
function kanaKey(s: string): string {
  return s
    .replace(/揚げ/g, 'あげ')
    .replace(/焼き/g, 'やき')
    .replace(/炒め/g, 'いため')
    .replace(/煮/g, 'に')
    .replace(/唐/g, 'から')
    .replace(/[のノ]/g, '');
}

function looseDish(rest: string, catalog: Catalog): Dish | undefined {
  const before = rest.split(REQUEST_SPLIT)[0];
  if (!before || before === rest) return undefined;
  let noun = before.replace(/＿/g, '');
  const dm = noun.match(DATE_PREFIX);
  if (dm) noun = noun.slice(dm[0].length).replace(/^(は|も|の|に)/, '');
  noun = noun.replace(/^(を|が)/, '').replace(/(が|を|で)$/, '');
  if (noun.length < 2) return undefined;
  const key = kanaKey(noun);
  const hits = catalog.dishes.filter((d) => kanaKey(n(d.name)).includes(key));
  if (hits.length === 0) return undefined;
  return [...hits].sort((a, b) => Number(b.role === 'main') - Number(a.role === 'main') || a.name.length - b.name.length)[0];
}

interface Carry {
  date?: ISODate;
  ingredients: string[];
  memberRef?: string;
}

function parseClause(raw: string, ctx: ParseContext, carry: Carry): ParsedCommand[] {
  const t = n(raw);
  if (!t) return [];
  const vocab = vocabOf(ctx.catalog);
  const date = findDate(t, ctx.today);
  if (date) carry.date = date;
  if (HELP.test(t)) return [{ type: 'help' }];

  const preferDish = REQUEST.test(t) || CHANGE.test(t);
  const spans = findSpans(t, preferDish ? vocab.dishFirst : vocab.ingFirst);
  const dishSpans = spans.filter((s) => s.kind === 'dish');
  const ingSpans = spans.filter((s) => s.kind === 'ing');
  const rest = mask(t, spans);
  const ingIds = uniq(ingSpans.map((s) => s.id));
  const memberRef = findMemberRef(rest, ctx.members);
  if (memberRef) carry.memberRef = memberRef;
  if (ingIds.length > 0) carry.ingredients = ingIds;

  if (SHOW_SHOPPING.test(rest) && ingIds.length === 0 && !/買い忘れ|かいわすれ/.test(rest)) return [{ type: 'show_shopping' }];

  // 特売：「鶏むねが安い」
  if (SALE.test(rest.replace(EASY, ''))) {
    const ids = ingIds.length > 0 ? ingIds : carry.ingredients;
    if (ids.length > 0) return ids.map((id) => ({ type: 'sale' as const, ingredientId: id }));
  }

  const out: ParsedCommand[] = [];
  // 欠席：「水曜は夫が飲み会」
  if (ABSENCE.test(rest)) {
    const ref = memberRef ?? carry.memberRef ?? (EAT_OUT.test(rest) ? 'みんな' : undefined);
    if (ref) out.push({ type: 'absence', date: carry.date ?? ctx.today, memberRef: ref });
  }

  // 在庫：食材ごとに、すぐ後ろの言葉で判断する（「卵はあるけど牛乳がない」）。
  const stock = new Map<string, 'out' | 'have'>();
  ingSpans.forEach((span, i) => {
    const after = t.slice(span.end, ingSpans[i + 1]?.start ?? t.length);
    if (OUT_AFTER.test(after)) stock.set(span.id, 'out');
    else if (HAVE_AFTER.test(after)) stock.set(span.id, 'have');
  });
  const targets = ingIds.length > 0 ? ingIds : out.length === 0 ? carry.ingredients : [];
  const anyOut = OUT_ANY.test(rest);
  const anyHave = HAVE_ANY.test(rest);
  for (const id of targets) {
    if (stock.has(id)) continue;
    if (anyOut) stock.set(id, 'out');
    else if (anyHave) stock.set(id, 'have');
  }
  for (const [id, kind] of stock) out.push({ type: kind === 'out' ? 'out_of_stock' : 'have', ingredientId: id });
  if (out.length > 0) return out;

  // 今日は無理：「疲れた」「今日は無理」（ほかの日なら、その日の差し替え）
  if (IMPOSSIBLE.test(rest)) {
    if (!carry.date || carry.date === ctx.today) return [{ type: 'today_impossible' }];
    return [{ type: 'want_alternatives', date: carry.date }];
  }

  const change = CHANGE.test(rest);
  const wants = REQUEST.test(rest);
  const dishId = dishSpans[0]?.id ?? ((wants || change) ? looseDish(rest, ctx.catalog)?.id : undefined);
  if (dishId && (wants || change || carry.date)) {
    return [{ type: 'request', ...(carry.date ? { date: carry.date } : {}), dishId }];
  }
  if (change) return [{ type: 'want_alternatives', ...(carry.date ? { date: carry.date } : {}) }];
  if (wants) {
    const fromIng = ingIds.map((id) => ctx.catalog.ingredientById.get(id)).find((i) => i && proteinOfKind(i.kind) !== 'none');
    const protein = findProtein(rest) ?? (fromIng ? proteinOfKind(fromIng.kind) : undefined);
    const genre = findGenre(rest);
    if (protein || genre) {
      return [{ type: 'request', ...(carry.date ? { date: carry.date } : {}), ...(protein ? { protein } : {}), ...(genre ? { genre } : {}) }];
    }
  }
  // 「明日のごはんは？」のように今日以外の日を聞かれたら、週の献立を見せる。
  if (carry.date && carry.date !== ctx.today && MEAL_WORDS.test(rest)) return [{ type: 'show_week' }];
  if (SHOW_TODAY.test(rest)) return [{ type: 'show_today' }];
  if (SHOW_WEEK.test(rest)) return [{ type: 'show_week' }];
  if (SHOW_SHOPPING.test(rest)) return [{ type: 'show_shopping' }];
  return [];
}

/** 公開API：ルールベースで話し言葉を解釈する。「@きめとく」の有無は問わない。 */
export function parseMessage(text: string, ctx: ParseContext): ParsedCommand[] {
  const cleaned = text.normalize('NFKC').replace(/@\s*(きめとく|キメトク|kimetoku)/gi, ' ');
  const sentences = cleaned
    .split(/[。．.!?\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: ParsedCommand[] = [];
  for (const sentence of sentences) {
    const carry: Carry = { ingredients: [] };
    const clauses = sentence
      .split(/[、,]+|けれど|けど/)
      .map((x) => x.trim())
      .filter(Boolean);
    const found: ParsedCommand[] = [];
    for (const clause of clauses) found.push(...parseClause(clause, ctx, carry));
    if (found.length === 0 && clauses.length > 1) found.push(...parseClause(sentence, ctx, { ingredients: [] }));
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
