// 画面で使う小さな道具（表示用の文言、日付、検索用の正規化など）。
import type { AppState, Catalog, Dish, ISODate, MealStatus, Member, PlannedMeal, Reaction, ShoppingList, Weekday } from '../engine';
import { SERVING_WEIGHT, WEEKDAY_JA, addDays, advanceDay, findDish, formatJa, isISODate } from '../engine';
import type { ClockMode } from './storage';

export type MemberRole = NonNullable<Member['role']>;

export const ROLE_LABEL: Record<MemberRole, string> = {
  parent: 'わたし',
  partner: 'パートナー',
  child: '子ども',
  other: 'その他',
};

export const ROLE_ORDER: MemberRole[] = ['parent', 'partner', 'child', 'other'];

export const STATUS_LABEL: Record<MealStatus, string> = {
  planned: '予定',
  cooked: '作った',
  skipped: '作らなかった',
  unconfirmed: '未確認',
};

export const SIDE_POLICY: { id: 'side_or_soup' | 'side_and_soup' | 'main_only'; label: string; note: string }[] = [
  { id: 'side_or_soup', label: '副菜か汁物を1品', note: '主菜に、副菜か汁物のどちらかを1品つけます' },
  { id: 'side_and_soup', label: '副菜と汁物', note: '主菜に、副菜と汁物を1品ずつつけます' },
  { id: 'main_only', label: '主菜だけ', note: '主菜だけを決めます' },
];

export const REACTIONS: { id: Reaction; mark: string; label: string }[] = [
  { id: 'great', mark: '◎', label: 'また食べたい' },
  { id: 'ok', mark: '○', label: 'ふつう' },
  { id: 'meh', mark: '△', label: 'いまひとつ' },
];

/** 月曜始まりの曜日の並び。 */
export const WEEKDAYS_MON_FIRST: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function weekdayLabel(wd: Weekday): string {
  return WEEKDAY_JA[wd];
}

/** 日本時間の今日（'YYYY-MM-DD'）。 */
export function japanToday(now: Date = new Date()): ISODate {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const iso = `${get('year')}-${get('month')}-${get('day')}`;
    if (isISODate(iso)) return iso;
  } catch {
    // タイムゾーンが使えない環境では、端末の日付を使う。
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------------------------------------------------------------------------
// 日付の進め方（試用モード：本物の日付で進める）
// ---------------------------------------------------------------------------

/** 1回の追いつきで進める日数の上限（長く開かなかったときも、画面を止めないように）。残りは次の機会に進める。 */
export const MAX_CATCH_UP_DAYS = 31;

/** 本物の日付に追いつくか確かめる間隔（画面を開いたまま日付が変わったとき）。 */
export const CATCH_UP_INTERVAL_MS = 60_000;

export interface CatchUp {
  state: AppState;
  /** 進めた日数（1以上）。 */
  days: number;
  /** 届いた配信（有料版）の数。 */
  pushed: number;
}

/**
 * 本物の今日（realToday）まで、advanceDay を1日ずつ繰り返して進める（最大 maxDays 日。純粋関数）。
 * 記録の日付が本物の今日と同じか先なら、何もしない（null。日付は戻さない）。
 */
export function catchUpTo(state: AppState, catalog: Catalog, realToday: ISODate, maxDays = MAX_CATCH_UP_DAYS): CatchUp | null {
  if (!isISODate(realToday) || !(state.today < realToday)) return null;
  let s = state;
  let days = 0;
  let pushed = 0;
  while (s.today < realToday && days < maxDays) {
    const r = advanceDay(s, catalog);
    s = r.state;
    days += 1;
    pushed += r.replies.filter((m) => m.push).length;
  }
  return { state: s, days, pushed };
}

/** 配信が届いたときの添え書き（［翌日へ進む］の知らせと同じ）。 */
export function pushedText(pushed: number): string {
  return pushed > 0 ? `配信が${pushed}件届きました。` : '';
}

/** 追いついたときの知らせ：1日なら「11/17(火)になりました。」、何日もなら「11/19(木)まで日付を進めました。」。 */
export function catchUpText(c: Pick<CatchUp, 'days' | 'pushed'> & { today: ISODate }): string {
  const head = c.days === 1 ? `${formatJa(c.today)}になりました。` : `${formatJa(c.today)}まで日付を進めました。`;
  return `${head}${pushedText(c.pushed)}`;
}

/** 本物の日付で進める（試用）に切り替えられないときのわけ（記録の日付が、本物の今日より先）。 */
export function clockAheadText(today: ISODate): string {
  return `記録の日付（${formatJa(today)}）が今日より先に進んでいるので、切り替えられません。［はじめから設定する］で、今日から始め直してください。`;
}

/** プランを変えたときの知らせ。有料版の配信が届く時を、日付の進め方に合わせて言う。 */
export function planToast(plan: 'free' | 'paid', clock: ClockMode): string {
  if (plan === 'free') return '無料版にしました。';
  return clock === 'calendar' ? '有料版にしました。次の日から、配信が届きます。' : '有料版にしました。翌日へ進むと、配信が届きます。';
}

/** 検索・照合用：NFKC、カタカナ→ひらがな、空白の除去、小文字化。 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function dishesOfMeal(state: AppState, catalog: Catalog, meal: PlannedMeal): Dish[] {
  return meal.dishIds.map((id) => findDish(state, catalog, id)).filter((d): d is Dish => !!d);
}

export function dishNames(state: AppState, catalog: Catalog, ids: string[]): string {
  return ids.map((id) => findDish(state, catalog, id)?.name ?? id).join('／');
}

/** 1食の目安時間：いちばん長い料理＋並行で作る分（エンジンの文面と同じ考え方）。 */
export function mealMinutes(state: AppState, catalog: Catalog, meal: PlannedMeal): number {
  const ds = dishesOfMeal(state, catalog, meal);
  if (ds.length === 0) return 0;
  return Math.max(...ds.map((d) => d.minutes)) + 5 * (ds.length - 1);
}

/** 献立の中での料理の役割（主菜・副菜・汁物・ラク日）。 */
export function dishRoleLabel(meal: PlannedMeal, index: number, dish: Dish | undefined): string {
  if (index === 0) return meal.kind === 'raku' ? 'ラク日' : dish?.role === 'side' ? '副菜' : dish?.role === 'soup' ? '汁物' : '主菜';
  return dish?.role === 'soup' ? '汁物' : '副菜';
}

/** その日に食べる人（乳児と、欠席の人を除く）。献立の量（servings）と同じ数え方。 */
export function eatersOf(state: AppState, meal: PlannedMeal): Member[] {
  return state.household.members.filter((m) => SERVING_WEIGHT[m.ageBand] > 0 && !meal.absentMemberIds.includes(m.id));
}

/** 家で食べる人がいない日（「金曜はみんな外食」）の表示。エンジンの文面と同じ言い方。 */
export const NO_DINNER_TEXT = '夕食なし（みんな外で食べる）';

/**
 * 家で食べる人がいない日か（みんな外で食べる）。献立は残るが（だれかが食べることになったら戻る）、
 * 量・作り方・［作った］［差し替え］［今日は無理］は出さない。
 */
export function nobodyEats(state: AppState, meal: PlannedMeal): boolean {
  return eatersOf(state, meal).length === 0;
}

/** その日の献立が「家で食べる人がいない日」か（献立がなければ false）。 */
export function nobodyEatsOn(state: AppState, date: ISODate): boolean {
  const meal = state.meals.find((m) => m.date === date);
  return !!meal && nobodyEats(state, meal);
}

/**
 * 買い物リストの「のこり」：まだチェックしていない物の数。過ぎた買い物日のリストは、これからの献立に使う物だけを数える
 * （過ぎた日の夕食の分と、みんな外で食べる日の分は、もう買わない。エンジンの「買い物リスト」の返事と同じ数え方）。
 */
export function leftCount(state: AppState, list: ShoppingList): number {
  const unchecked = list.items.filter((i) => !i.checked);
  if (list.date >= state.today) return unchecked.length;
  return unchecked.filter((i) => i.forDates.some((d) => d >= state.today && !nobodyEatsOn(state, d))).length;
}

/**
 * 量の表示。食べる人数を主にし、子どもがいて大人換算と違うときだけ換算を添える。
 * 例：'4人分（大人換算3.2）'、大人だけなら '2人分'。
 */
export function servingsLabel(servings: number, eaters: number): string {
  const n = Number.isInteger(servings) ? String(servings) : servings.toFixed(1);
  return Math.abs(servings - eaters) < 0.05 ? `${eaters}人分` : `${eaters}人分（大人換算${n}）`;
}

/** 大人換算の説明（小学生・幼児がいる家族にだけ出す）。 */
export const SERVINGS_NOTE = '量は、大人・中高生を1人分、小学生を0.7人分、幼児を0.5人分として計算しています（大人換算）。';

/** 大人換算が人数と違う家族か（小学生・幼児がいる）。 */
export function hasPartialServings(members: Member[]): boolean {
  return members.some((m) => SERVING_WEIGHT[m.ageBand] > 0 && SERVING_WEIGHT[m.ageBand] < 1);
}

export function absentNames(state: AppState, meal: PlannedMeal): string[] {
  return meal.absentMemberIds.map((id) => state.household.members.find((m) => m.id === id)?.nickname ?? id);
}

/** 「今日」「明日」「昨日」、それ以外は '11/10(火)'。 */
export function dayLabel(today: ISODate, date: ISODate): string {
  if (date === today) return '今日';
  if (date === addDays(today, 1)) return '明日';
  if (date === addDays(today, -1)) return '昨日';
  return formatJa(date);
}

/**
 * 家族から外した人の発言の「送った人」（画面の覚え書き）。member の id の代わりに、外したときの名前を残す
 * （id のままだと、外した人の発言が最初の大人の名前や、あとで同じ id で加えた人の名前で出てしまう）。
 */
const FORMER_SENDER = 'former:';

export function formerSender(nickname: string): string {
  return `${FORMER_SENDER}${nickname}`;
}

/** formerSender で残した名前（そうでなければ null）。 */
export function formerSenderName(sender: string | undefined): string | null {
  return sender && sender.startsWith(FORMER_SENDER) ? sender.slice(FORMER_SENDER.length) || null : null;
}

export function adultsOf(members: Member[]): Member[] {
  const adults = members.filter((m) => m.ageBand === 'adult');
  return adults.length > 0 ? adults : members;
}

/** 新しいメンバーの id（消したメンバーの id と重ならないように、いちばん大きい番号の次）。 */
export function nextMemberId(members: Member[]): string {
  const max = members.reduce((acc, m) => Math.max(acc, Number(/^member_(\d+)$/.exec(m.id)?.[1] ?? 0)), 0);
  return `member_${max + 1}`;
}

export function firstLine(text: string): string {
  return text.split('\n')[0] ?? '';
}

export function cls(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** ShoppingItem.label（'鶏もも肉 1パック（約300g）'）から量の部分だけを取り出す。 */
export function quantityOf(name: string, label: string): string {
  if (label.startsWith(`${name} `)) return label.slice(name.length + 1);
  if (label.startsWith(name)) return label.slice(name.length).trim();
  return label;
}
