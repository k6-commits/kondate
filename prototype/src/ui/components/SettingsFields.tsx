// 初回設定と「家族と設定」で共通の、あとから足した設定の入力部品：食事（夕食だけ／夕食＋お弁当／朝・昼・夕）、
// 買い物のしかた（何日分まとめて買うか）、国の料理、辛さ、1週間の食費の目安、平日の調理時間。と、食費の目安の表示
// （今週の献立・家族と設定）。設定の値は、エンジンの settings の関数で読む（ない項目は既定。記録は書き換えない）。
import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  BreakfastStyle,
  CuisineGenre,
  CuisineLevel,
  HouseholdSettings,
  LunchStyle,
  MealsScope,
  ShoppingPace,
  SpiceLevel,
  WeekCost,
  Weekday,
} from '../../engine';
import {
  BREAKFAST_LABEL,
  BUDGET_STEPS,
  CUISINE_GENRES,
  CUISINE_LABEL,
  CUISINE_LEVEL_LABEL,
  LUNCH_COUNT_MAX,
  LUNCH_LABEL,
  MEALS_LABEL,
  SHOPPING_PACES,
  SPICE_LABEL,
  WEEKDAY_JA,
  breakfastStyleOf,
  daysPerTrip,
  lunchCountOf,
  lunchStyleOf,
  mealsOf,
  paceOf,
  paceWeekdays,
  roundYen,
  yenText,
} from '../../engine';
import { WEEKDAYS_MON_FIRST, budgetText, cls, plainYen, weekdaysText } from '../lib';
import { CountStepper, RadioSeg, WeekdayPicker } from './Forms';
import { Icon } from './Icon';

// ---------------------------------------------------------------------------
// 食事
// ---------------------------------------------------------------------------

const MEALS_ORDER: MealsScope[] = ['dinner', 'dinner_bento', 'three'];

/** 食事の選び方の一言。 */
export const MEALS_NOTE: Record<MealsScope, string> = {
  dinner: '夕食の献立を決めます',
  dinner_bento: '夕食と、お昼のお弁当を決めます',
  three: '朝ごはん・お昼・夕食を決めます',
};

const BREAKFAST_OPTIONS = (['rice', 'bread', 'mix'] as const).map((v) => ({ value: v, label: BREAKFAST_LABEL[v] }));
const LUNCH_OPTIONS = (['bento', 'home'] as const).map((v) => ({ value: v, label: LUNCH_LABEL[v] }));

/** 食事の入力の値（ない項目は既定で埋める）。 */
export interface MealsValue {
  meals: MealsScope;
  breakfastStyle: BreakfastStyle;
  lunchStyle: LunchStyle;
  lunchCount: number;
}

/** 初回設定の最初の値（エンジンの既定と同じ）。 */
export const DEFAULT_MEALS_VALUE: MealsValue = { meals: 'dinner', breakfastStyle: 'mix', lunchStyle: 'bento', lunchCount: 1 };

export function mealsValueOf(settings: Pick<HouseholdSettings, 'meals' | 'breakfastStyle' | 'lunchStyle' | 'lunchCount'>): MealsValue {
  return {
    meals: mealsOf(settings),
    breakfastStyle: breakfastStyleOf(settings),
    lunchStyle: lunchStyleOf(settings),
    lunchCount: lunchCountOf(settings),
  };
}

/** お昼を家で食べるか（朝・昼・夕で、お昼を「家で食べる」にしたとき）。 */
function homeLunch(v: Pick<MealsValue, 'meals' | 'lunchStyle'>): boolean {
  return v.meals === 'three' && v.lunchStyle === 'home';
}

/** 夕食のほかの食事の呼び方（食費の目安の内訳）：「お弁当」「朝ごはんとお弁当」「朝ごはんとお昼」。 */
export function extrasLabelOf(settings: Pick<HouseholdSettings, 'meals' | 'lunchStyle'>): string {
  const meals = mealsOf(settings);
  if (meals === 'dinner_bento') return 'お弁当';
  return lunchStyleOf(settings) === 'home' ? '朝ごはんとお昼' : '朝ごはんとお弁当';
}

/** お弁当・お昼の人数の聞き方。 */
export function lunchCountQuestion(v: Pick<MealsValue, 'meals' | 'lunchStyle'>): string {
  return homeLunch(v) ? 'お昼は何人分？' : 'お弁当（お昼）は何人分？';
}

/** 食事の要約（確認の画面）：「夕食＋お弁当（お弁当2人分）」「朝・昼・夕（朝ごはん：日替わり、お昼：家で食べる 2人分）」。 */
export function mealsSummary(v: MealsValue): string {
  if (v.meals === 'dinner') return MEALS_LABEL.dinner;
  if (v.meals === 'dinner_bento') return `${MEALS_LABEL.dinner_bento}（お弁当${v.lunchCount}人分）`;
  return `${MEALS_LABEL.three}（朝ごはん：${BREAKFAST_LABEL[v.breakfastStyle]}、お昼：${LUNCH_LABEL[v.lunchStyle]} ${v.lunchCount}人分）`;
}

/**
 * どの食事を決めるか（大きな選択肢の札）。お弁当かお昼があれば人数、朝・昼・夕なら朝ごはんの主食と、お昼の食べ方も選ぶ。
 * idPrefix：radio の name と見出しの id の頭（初回設定と家族と設定で分ける）。labelledBy：選択肢の札の見出しの id。
 */
export function MealsFields({
  idPrefix,
  labelledBy,
  value,
  onChange,
}: {
  idPrefix: string;
  labelledBy: string;
  value: MealsValue;
  onChange: (patch: Partial<MealsValue>) => void;
}) {
  const countId = `${idPrefix}-lunch-count`;
  return (
    <>
      <div className="radio-list" role="radiogroup" aria-labelledby={labelledBy}>
        {MEALS_ORDER.map((m) => (
          <label key={m} className={cls('radio-card', value.meals === m && 'is-on')}>
            <input type="radio" name={`${idPrefix}-meals`} value={m} checked={value.meals === m} onChange={() => onChange({ meals: m })} />
            <span>
              <span className="radio-title">{MEALS_LABEL[m]}</span>
              <span className="field-note">{MEALS_NOTE[m]}</span>
            </span>
          </label>
        ))}
      </div>
      {value.meals === 'three' ? (
        <>
          <div className="pref-field">
            <p className="setting-name" id={`${idPrefix}-breakfast`}>
              朝ごはん
            </p>
            <RadioSeg
              name={`${idPrefix}-breakfast`}
              labelledBy={`${idPrefix}-breakfast`}
              options={BREAKFAST_OPTIONS}
              value={value.breakfastStyle}
              onChange={(breakfastStyle) => onChange({ breakfastStyle })}
              even
            />
            <p className="field-note">日替わりは、ごはんとパンを1日おきにします。</p>
          </div>
          <div className="pref-field">
            <p className="setting-name" id={`${idPrefix}-lunch`}>
              お昼
            </p>
            <RadioSeg
              name={`${idPrefix}-lunch`}
              labelledBy={`${idPrefix}-lunch`}
              options={LUNCH_OPTIONS}
              value={value.lunchStyle}
              onChange={(lunchStyle) => onChange({ lunchStyle })}
              even
            />
          </div>
        </>
      ) : null}
      {value.meals !== 'dinner' ? (
        <div className="pref-field">
          <p className="setting-name" id={countId}>
            {lunchCountQuestion(value)}
          </p>
          <CountStepper
            labelledBy={countId}
            value={value.lunchCount}
            min={1}
            max={LUNCH_COUNT_MAX}
            onChange={(lunchCount) => onChange({ lunchCount })}
          />
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// 買い物のしかた
// ---------------------------------------------------------------------------

/** 曜日を自分で選ぶときの札。 */
const CUSTOM_PACE = { label: '曜日を選ぶ', note: '買い物に行く曜日を、自分で選びます' } as const;

function sameWeekdays(a: readonly Weekday[], b: readonly Weekday[]): boolean {
  const key = (ws: readonly Weekday[]) => [...new Set(ws)].sort((x, y) => x - y).join(',');
  return key(a) === key(b);
}

/** 買い物のしかたの名前（「週2回」。どれにも当たらなければ「曜日を選ぶ」）。 */
export function paceLabel(pace: ShoppingPace | 'custom'): string {
  return pace === 'custom' ? CUSTOM_PACE.label : (SHOPPING_PACES.find((p) => p.id === pace)?.label ?? CUSTOM_PACE.label);
}

/** 買い物の要約（確認の画面）：「週2回（日・水）。1回の買い物で、だいたい3日分」。 */
export function shoppingSummary(shoppingWeekdays: readonly Weekday[], dinnerWeekdays: readonly Weekday[]): string {
  if (shoppingWeekdays.length === 0) return 'なし（献立の日に買う）';
  const pace = paceOf(shoppingWeekdays, dinnerWeekdays);
  const days = weekdaysText([...shoppingWeekdays].sort((a, b) => a - b));
  const head = pace === 'custom' ? days : `${paceLabel(pace)}（${days}）`;
  return `${head}。1回の買い物で、だいたい${daysPerTrip(shoppingWeekdays, dinnerWeekdays)}日分`;
}

/**
 * 買い物のしかた（毎日・週2回・週1回まとめて・曜日を選ぶ）。「曜日を選ぶ」を押すと、曜日のボタンを出す。下に、1回の買い物で
 * だいたい何日分かを、選ぶたびに出す。pace は、選んだ買い物のしかた（曜日を自分で選んだときは 'custom'）。
 * 曜日が変わらないときは onChange を呼ばない（「曜日を選ぶ」から、同じ曜日の「週2回」に戻したときなど）。
 */
export function ShoppingPaceFields({
  idPrefix,
  labelledBy,
  shoppingWeekdays,
  dinnerWeekdays,
  min = 1,
  onChange,
}: {
  idPrefix: string;
  labelledBy: string;
  shoppingWeekdays: Weekday[];
  dinnerWeekdays: readonly Weekday[];
  /** 曜日を自分で選ぶときに残す曜日の数（初回設定は 0。選ばずに［次へ］を押すと、そう知らせる）。 */
  min?: number;
  onChange: (next: Weekday[], pace: ShoppingPace | 'custom') => void;
}) {
  const matched = paceOf(shoppingWeekdays, dinnerWeekdays);
  // 「曜日を選ぶ」を押したか（選んだ曜日が、たまたま週2回などと同じになっても、曜日を選ぶまま出す）。
  const [custom, setCustom] = useState(matched === 'custom');
  const selected: ShoppingPace | 'custom' = custom ? 'custom' : matched;
  const sorted = [...shoppingWeekdays].sort((a, b) => a - b);
  return (
    <>
      <div className="radio-list" role="radiogroup" aria-labelledby={labelledBy}>
        {SHOPPING_PACES.map((p) => (
          <label key={p.id} className={cls('radio-card', selected === p.id && 'is-on')}>
            <input
              type="radio"
              name={`${idPrefix}-pace`}
              value={p.id}
              checked={selected === p.id}
              onChange={() => {
                setCustom(false);
                const next = paceWeekdays(p.id, dinnerWeekdays);
                if (!sameWeekdays(next, shoppingWeekdays)) onChange(next, p.id);
              }}
            />
            <span>
              <span className="radio-title">{p.label}</span>
              <span className="field-note">{p.note}</span>
            </span>
          </label>
        ))}
        <label className={cls('radio-card', selected === 'custom' && 'is-on')}>
          <input type="radio" name={`${idPrefix}-pace`} value="custom" checked={selected === 'custom'} onChange={() => setCustom(true)} />
          <span>
            <span className="radio-title">{CUSTOM_PACE.label}</span>
            <span className="field-note">{CUSTOM_PACE.note}</span>
          </span>
        </label>
      </div>
      {selected === 'custom' ? (
        <WeekdayPicker label="買い物の曜日" value={shoppingWeekdays} onChange={(next) => onChange(next, 'custom')} min={min} />
      ) : null}
      <p className="trip-note" aria-live="polite">
        {sorted.length > 0 ? (
          <>
            1回の買い物で、だいたい<strong className="num">{daysPerTrip(sorted, dinnerWeekdays)}日分</strong>
            <span className="trip-days">（{weekdaysText(sorted)}に買い物）</span>
          </>
        ) : (
          '買い物の曜日を、まだ選んでいません'
        )}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// 国の料理・辛さ
// ---------------------------------------------------------------------------

const LEVELS: CuisineLevel[] = ['often', 'sometimes', 'never'];
const LEVEL_OPTIONS = LEVELS.map((l) => ({ value: l, label: CUISINE_LEVEL_LABEL[l] }));

/** 国の料理の説明。 */
export const CUISINE_NOTE = 'ときどき＝週に1回まで。出さない＝献立に出しません（定番に選んだ料理は出します）。';

/**
 * 国の料理の好み。国ごとに1行で、よく出す・ときどき・出さないから選ぶ（行ごとに、国の名前の付いた radiogroup）。
 */
export function CuisineRows({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: Record<CuisineGenre, CuisineLevel>;
  onChange: (genre: CuisineGenre, level: CuisineLevel) => void;
}) {
  return (
    <div className="cuisine-rows">
      {CUISINE_GENRES.map((g) => {
        const id = `${idPrefix}-cuisine-${g}`;
        return (
          <div key={g} className="cuisine-row">
            <span className="cuisine-name" id={id}>
              {CUISINE_LABEL[g]}
            </span>
            <RadioSeg name={id} labelledBy={id} options={LEVEL_OPTIONS} value={value[g]} onChange={(level) => onChange(g, level)} even />
          </div>
        );
      })}
    </div>
  );
}

/** 国の料理の要約（確認の画面）：「よく出す：和食・洋食」のように、よく出す・ときどき・出さないごとに国を並べる（ない段は出さない）。 */
export function cuisineSummary(value: Record<CuisineGenre, CuisineLevel>): string[] {
  return LEVELS.map((level) => ({ level, names: CUISINE_GENRES.filter((g) => value[g] === level).map((g) => CUISINE_LABEL[g]) }))
    .filter((r) => r.names.length > 0)
    .map((r) => `${CUISINE_LEVEL_LABEL[r.level]}：${r.names.join('・')}`);
}

export const SPICE_OPTIONS = (['mild', 'normal', 'hot'] as const).map((v: SpiceLevel) => ({ value: v, label: SPICE_LABEL[v] }));

/** 辛さの説明（既定の「ふつう」が何をするか）。 */
export const SPICE_NOTE = 'ふつう＝子どもがいる日は、辛い料理を控えめにします。';

// ---------------------------------------------------------------------------
// 1週間の食費の目安
// ---------------------------------------------------------------------------

/** 値段の目安の説明（予算の欄・初回設定）。 */
export const PRICE_NOTE = '値段は全国の平均くらいの目安です（地域・季節・お店で変わります）。調味料などの常備品は数えません。';
/** 同じ説明の短い言い方（今週の献立・買い物リストの金額に添える）。 */
export const PRICE_SHORT_NOTE = '値段は全国の平均くらいの目安です。';
/** 週の食費の目安は「使う分」、買い物リストの合計は「パック単位で買う分」。2つの金額の違いを、それぞれに添える。 */
export const USE_COST_NOTE = '献立で使う分の材料費です（買い物では、パック単位で買うので多くなります）。';
export const PACK_COST_NOTE = 'パック単位で買う分の値段です（献立で使う分の目安より多くなります）。';

const BUDGET_MIN = 1000;
const BUDGET_MAX = 100000;
export const BUDGET_ERROR = '1,000円から10万円までの金額を、数字で入れてください。';

/**
 * 入れた金額を読む（全角の数字・「,」「円」もよい。「1.5万」「1万2000」も読む）。1,000円〜10万円でなければ null。
 */
export function parseYen(text: string): number | null {
  const t = text.normalize('NFKC').replace(/[,，、\s円]/g, '');
  let yen: number | null = null;
  const man = /^(\d+(?:\.\d+)?)万(\d+)?$/.exec(t);
  if (man) yen = Math.round(Number(man[1]) * 10000 + Number(man[2] ?? 0));
  else if (/^\d+$/.test(t)) yen = Number(t);
  return yen !== null && Number.isFinite(yen) && yen >= BUDGET_MIN && yen <= BUDGET_MAX ? yen : null;
}

/**
 * 1週間の食費の目安を選ぶ（目安なし・決まった額の札と、ほかの金額）。live：入れた金額を、そのまま使う（初回設定。打つたびに
 * 献立を作り直す家族と設定では、［この金額にする］で決める）。
 */
export function BudgetPicker({
  idPrefix,
  labelledBy,
  value,
  onChange,
  live = false,
}: {
  idPrefix: string;
  labelledBy: string;
  value: number | null;
  onChange: (yen: number | null) => void;
  live?: boolean;
}) {
  const custom = value !== null && !BUDGET_STEPS.includes(value);
  const [text, setText] = useState(custom ? String(value) : '');
  const [error, setError] = useState<string | null>(null);
  const inputId = `${idPrefix}-budget-other`;
  const pick = (next: number | null) => {
    setText('');
    setError(null);
    if (next !== value) onChange(next);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const yen = parseYen(text);
    if (yen === null) {
      setError(BUDGET_ERROR);
      return;
    }
    setError(null);
    if (yen !== value) onChange(yen);
  };
  return (
    <div className="budget-picker">
      <div className="choice-row" role="radiogroup" aria-labelledby={labelledBy}>
        <label className={cls('choice', value === null && 'is-on')}>
          <input type="radio" name={`${idPrefix}-budget`} checked={value === null} onChange={() => pick(null)} />
          目安なし
        </label>
        {BUDGET_STEPS.map((yen) => (
          <label key={yen} className={cls('choice', 'num', value === yen && 'is-on')}>
            <input type="radio" name={`${idPrefix}-budget`} checked={value === yen} onChange={() => pick(yen)} />
            {budgetText(yen)}
          </label>
        ))}
      </div>
      <form className={cls('budget-other', custom && 'is-on')} onSubmit={submit} noValidate>
        <label className="field-label field-label--sub" htmlFor={inputId}>
          ほかの金額
        </label>
        <span className="yen-input">
          <input
            id={inputId}
            className="text-input num"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="例：12000"
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              setError(null);
              if (!live) return;
              const yen = parseYen(next);
              if (yen !== null) onChange(yen);
              // ほかの金額を消したら、目安なしに戻す（決まった額の札を選んでいるときは、そのまま）。
              else if (next.trim() === '' && custom) onChange(null);
            }}
            onBlur={() => {
              if (live && text.trim() !== '' && parseYen(text) === null) setError(BUDGET_ERROR);
            }}
          />
          <span className="yen-unit" aria-hidden="true">
            円
          </span>
        </span>
        {live ? null : (
          <button type="submit" className="btn btn--small">
            この金額にする
          </button>
        )}
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 食費の目安（週の献立の材料費）と、予算があれば予算との比べ（棒）。棒は、予算の9割までが柿、9割をこえたら山吹、
 * 予算をこえたら朱（色だけに頼らず、こえたときは注意の印と文でも言う）。値段の目安のある材料がなければ、まだ出せないと言う。
 * label：「今週の目安」「今週の食費の目安」など（文の頭）。
 */
export function CostMeter({
  label,
  cost,
  budget,
  extrasLabel = 'ほかの食事',
}: {
  label: string;
  cost: WeekCost;
  budget: number | null;
  /** 夕食のほかの食事の呼び方（内訳に出す。extrasLabelOf）。 */
  extrasLabel?: string;
}) {
  const total = roundYen(cost.total);
  if (total <= 0) {
    return (
      <div className="cost">
        <p className="cost-line">{label}：まだ出せません（値段の目安がわかる材料がありません）</p>
      </div>
    );
  }
  const over = budget !== null && total > budget;
  const ratio = budget !== null && budget > 0 ? Math.min(1, total / budget) : 0;
  const tone = over ? 'over' : ratio >= 0.9 ? 'near' : 'ok';
  return (
    <div className="cost">
      <p className="cost-line">
        <span>{label}：</span>
        <strong className="cost-total num">{yenText(total)}</strong>
        {budget !== null ? <span className="cost-budget num">（予算 {plainYen(budget)}）</span> : null}
      </p>
      {roundYen(cost.extras) > 0 ? (
        <p className="cost-sub num">
          夕食 {yenText(cost.dinners)}・{extrasLabel} {yenText(cost.extras)}
        </p>
      ) : null}
      {budget !== null ? (
        <>
          <div
            className={cls('meter', `meter--${tone}`)}
            role="meter"
            aria-label={`${label}と予算`}
            aria-valuemin={0}
            aria-valuemax={budget}
            aria-valuenow={Math.min(total, budget)}
            aria-valuetext={`${yenText(total)}（予算 ${plainYen(budget)}）${over ? '。予算をこえています' : ''}`}
          >
            <div className="meter-fill" style={{ width: `${Math.round(ratio * 1000) / 10}%` }} />
          </div>
          {over ? (
            <p className="warn-inline">
              <Icon name="alert" size={15} />
              予算より{yenText(total - budget)}多くなりそうです。
            </p>
          ) : (
            <p className="cost-sub num">予算まで、あと{yenText(budget - total)}</p>
          )}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 平日の調理時間
// ---------------------------------------------------------------------------

/** 調理時間の選び方（0 は、こだわらない＝上限なし）。 */
export const COOK_TIME_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'こだわらない' },
  { value: 15, label: '15分' },
  { value: 30, label: '30分' },
  { value: 45, label: '45分' },
];

/** 献立を作る曜日の調理時間の上限が、どの曜日も同じなら、その分（0 はこだわらない）。曜日で違えば null。 */
export function cookTimeOf(settings: Pick<HouseholdSettings, 'dinnerWeekdays' | 'maxMinutes'>): number | null {
  const values = settings.dinnerWeekdays.map((w) => settings.maxMinutes[w] ?? 0);
  if (values.length === 0) return 0;
  return values.every((v) => v === values[0]) ? values[0] : null;
}

/** 曜日ごとの調理時間の上限（「月 15分・水 30分・金 こだわらない」）。月曜から並べる。 */
export function cookTimeDetail(settings: Pick<HouseholdSettings, 'dinnerWeekdays' | 'maxMinutes'>): string {
  return WEEKDAYS_MON_FIRST.filter((w) => settings.dinnerWeekdays.includes(w))
    .map((w) => {
      const m = settings.maxMinutes[w];
      return `${WEEKDAY_JA[w]} ${m ? `${m}分` : 'こだわらない'}`;
    })
    .join('・');
}

/** すべての献立の曜日に同じ上限を当てる（0 は、こだわらない＝上限なし）。 */
export function withCookTime(dinnerWeekdays: readonly Weekday[], minutes: number): Partial<Record<Weekday, number>> {
  if (minutes <= 0) return {};
  const out: Partial<Record<Weekday, number>> = {};
  for (const w of dinnerWeekdays) out[w] = minutes;
  return out;
}
