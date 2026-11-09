// 画面で使う小さな道具（表示用の文言、日付、検索用の正規化など）。
import type { AppState, Catalog, Dish, ISODate, MealStatus, Member, PlannedMeal, Reaction, Weekday } from '../engine';
import { WEEKDAY_JA, addDays, findDish, formatJa, isISODate } from '../engine';

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

export function servingsLabel(servings: number): string {
  const n = Number.isInteger(servings) ? String(servings) : servings.toFixed(1);
  return `大人換算${n}人分`;
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
