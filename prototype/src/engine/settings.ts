// あとから足した世帯の設定（国の料理・辛さ・食事・お昼の人数・予算・買い物のしかた）を読む関数。
// 前からの記録・LINE の世帯には、これらの項目がない。読むときは、ここの関数で既定を当てる（記録は書き換えない）。
import type {
  BreakfastStyle,
  CuisineGenre,
  CuisineLevel,
  Genre,
  HouseholdSettings,
  LunchStyle,
  MealsScope,
  SpiceLevel,
  Weekday,
} from './types';
import { CUISINE_GENRES } from './types';

/**
 * 国・ジャンルの好みの既定（設定のない記録・LINE の世帯・初回設定の最初の選択）。和食・洋食・中華・韓国は「よく出す」、
 * イタリアン・エスニック・メキシカンは「出さない」（前から使っている家族の献立を変えない。初回設定と家族と設定で選べる）。
 */
export const DEFAULT_CUISINES: Readonly<Record<CuisineGenre, CuisineLevel>> = {
  wa: 'often',
  yo: 'often',
  chu: 'often',
  kr: 'often',
  it: 'never',
  eth: 'never',
  mx: 'never',
};

export const CUISINE_LEVEL_LABEL: Record<CuisineLevel, string> = { often: 'よく出す', sometimes: 'ときどき', never: '出さない' };

/** ジャンルの好み。その他（other）は選ばないので、いつも「よく出す」と同じ扱い。 */
export function cuisineLevel(settings: Pick<HouseholdSettings, 'cuisines'>, genre: Genre): CuisineLevel {
  if (genre === 'other') return 'often';
  return settings.cuisines?.[genre] ?? DEFAULT_CUISINES[genre];
}

/** 家族が「よく出す」をはっきり選んだジャンルか（既定の「よく出す」では点を足さない。前からの献立を変えないため）。 */
export function prefersCuisine(settings: Pick<HouseholdSettings, 'cuisines'>, genre: Genre): boolean {
  return genre !== 'other' && settings.cuisines?.[genre] === 'often';
}

/** すべてのジャンルの好み（既定で埋める）。 */
export function cuisinesOf(settings: Pick<HouseholdSettings, 'cuisines'>): Record<CuisineGenre, CuisineLevel> {
  const out = { ...DEFAULT_CUISINES };
  for (const g of CUISINE_GENRES) {
    const v = settings.cuisines?.[g];
    if (v === 'often' || v === 'sometimes' || v === 'never') out[g] = v;
  }
  return out;
}

export const SPICE_LABEL: Record<SpiceLevel, string> = { mild: '辛くないものだけ', normal: 'ふつう', hot: '辛いのも好き' };

export function spiceOf(settings: Pick<HouseholdSettings, 'spice'>): SpiceLevel {
  const v = settings.spice;
  return v === 'mild' || v === 'hot' ? v : 'normal';
}

export const MEALS_LABEL: Record<MealsScope, string> = { dinner: '夕食だけ', dinner_bento: '夕食＋お弁当', three: '朝・昼・夕' };

export function mealsOf(settings: Pick<HouseholdSettings, 'meals'>): MealsScope {
  const v = settings.meals;
  return v === 'dinner_bento' || v === 'three' ? v : 'dinner';
}

export const BREAKFAST_LABEL: Record<BreakfastStyle, string> = { rice: 'ごはん', bread: 'パン', mix: '日替わり' };

export function breakfastStyleOf(settings: Pick<HouseholdSettings, 'breakfastStyle'>): BreakfastStyle {
  const v = settings.breakfastStyle;
  return v === 'rice' || v === 'bread' ? v : 'mix';
}

export const LUNCH_LABEL: Record<LunchStyle, string> = { bento: 'お弁当', home: '家で食べる' };

/** 昼の食べ方。夕食＋お弁当は、いつもお弁当。 */
export function lunchStyleOf(settings: Pick<HouseholdSettings, 'meals' | 'lunchStyle'>): LunchStyle {
  if (mealsOf(settings) === 'dinner_bento') return 'bento';
  return settings.lunchStyle === 'home' ? 'home' : 'bento';
}

export const LUNCH_COUNT_MAX = 6;

/** お昼（お弁当・家の昼）を食べる人数（1〜6。既定1）。 */
export function lunchCountOf(settings: Pick<HouseholdSettings, 'lunchCount'>): number {
  const v = settings.lunchCount;
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.min(LUNCH_COUNT_MAX, Math.max(1, Math.round(v)));
}

/** 1週間の食費の目安（円）。ない・0 以下は目安なし（null）。 */
export function budgetOf(settings: Pick<HouseholdSettings, 'weeklyBudget'>): number | null {
  const v = settings.weeklyBudget;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/** 予算の選び方（円・1週間）。画面では、これと「目安なし」から選ぶ（細かい額は数字で入れられる）。 */
export const BUDGET_STEPS: readonly number[] = [5000, 7000, 10000, 13000, 16000, 20000, 25000];

// ---------------------------------------------------------------------------
// 買い物のしかた（何日分まとめて買うか）
// ---------------------------------------------------------------------------

/** 毎日（その日の分）／週2回（2〜3日分ずつ）／週1回まとめて。どれでもなければ custom（曜日を自分で選んだ）。 */
export type ShoppingPace = 'daily' | 'twice' | 'weekly';

export const SHOPPING_PACES: readonly { id: ShoppingPace; label: string; note: string }[] = [
  { id: 'daily', label: '毎日', note: 'その日の夕食の分を、その日に買う' },
  { id: 'twice', label: '週2回', note: '日曜と水曜に、2〜3日分ずつ' },
  { id: 'weekly', label: '週1回まとめて', note: '日曜に、1週間分をまとめて' },
];

/** 買い物のしかたに合う買い物の曜日。毎日は、献立を作る曜日のすべて。 */
export function paceWeekdays(pace: ShoppingPace, dinnerWeekdays: readonly Weekday[]): Weekday[] {
  if (pace === 'daily') return [...dinnerWeekdays].sort((a, b) => a - b);
  if (pace === 'twice') return [0, 3];
  return [0];
}

/** 今の買い物の曜日が、どの買い物のしかたに当たるか（どれでもなければ custom）。 */
export function paceOf(shoppingWeekdays: readonly Weekday[], dinnerWeekdays: readonly Weekday[]): ShoppingPace | 'custom' {
  const key = (ws: readonly Weekday[]) => [...new Set(ws)].sort((a, b) => a - b).join(',');
  for (const p of SHOPPING_PACES) {
    if (key(shoppingWeekdays) === key(paceWeekdays(p.id, dinnerWeekdays))) return p.id;
  }
  return 'custom';
}

/**
 * 1回の買い物で、だいたい何日分の献立を買うか（献立を作る曜日と買い物の曜日から。買い物の日の分から、次の買い物の日の
 * 前の日の分まで）。買い物の曜日がなければ、献立の日ごとに買うので1。献立の日がなければ0。
 */
export function daysPerTrip(shoppingWeekdays: readonly Weekday[], dinnerWeekdays: readonly Weekday[]): number {
  const dinners = [...new Set(dinnerWeekdays)];
  if (dinners.length === 0) return 0;
  const shops = [...new Set(shoppingWeekdays)].sort((a, b) => a - b);
  if (shops.length === 0) return 1;
  const counts = new Map<number, number>();
  for (const d of dinners) {
    // d の日の夕食を買う日：d から前へさかのぼって、最初の買い物の曜日。
    let s = d;
    for (let i = 0; i < 7; i++) {
      const w = (((d - i) % 7) + 7) % 7;
      if (shops.includes(w as Weekday)) {
        s = w as Weekday;
        break;
      }
    }
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const trips = [...counts.values()];
  return Math.round(trips.reduce((a, b) => a + b, 0) / trips.length);
}

// ---------------------------------------------------------------------------
// 読み込みの検査
// ---------------------------------------------------------------------------

/** あとから足した設定の形を確かめる（ない項目はよい）。正しくなければ、わけを返す。 */
export function checkSettingsExtras(st: Record<string, unknown>): string | null {
  if (st.cuisines !== undefined) {
    if (typeof st.cuisines !== 'object' || st.cuisines === null || Array.isArray(st.cuisines)) return '国の料理の設定が正しくありません';
    for (const [k, v] of Object.entries(st.cuisines)) {
      if (!(CUISINE_GENRES as readonly string[]).includes(k) || (v !== 'often' && v !== 'sometimes' && v !== 'never')) {
        return '国の料理の設定が正しくありません';
      }
    }
  }
  if (st.spice !== undefined && st.spice !== 'mild' && st.spice !== 'normal' && st.spice !== 'hot') return '辛さの設定が正しくありません';
  if (st.meals !== undefined && st.meals !== 'dinner' && st.meals !== 'dinner_bento' && st.meals !== 'three') {
    return '食事の設定が正しくありません';
  }
  if (st.breakfastStyle !== undefined && st.breakfastStyle !== 'rice' && st.breakfastStyle !== 'bread' && st.breakfastStyle !== 'mix') {
    return '朝ごはんの設定が正しくありません';
  }
  if (st.lunchStyle !== undefined && st.lunchStyle !== 'bento' && st.lunchStyle !== 'home') return 'お昼の設定が正しくありません';
  if (st.lunchCount !== undefined && (typeof st.lunchCount !== 'number' || !Number.isFinite(st.lunchCount))) {
    return 'お昼の人数が正しくありません';
  }
  if (st.weeklyBudget !== undefined && st.weeklyBudget !== null && (typeof st.weeklyBudget !== 'number' || !Number.isFinite(st.weeklyBudget))) {
    return '予算の設定が正しくありません';
  }
  return null;
}
