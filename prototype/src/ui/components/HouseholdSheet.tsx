// 家族と設定。いちばん上に注意（householdNotices）を必ず出す。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Catalog, Exclusion, Household, HouseholdSettings, ISODate, Member, Weekday } from '../../engine';
import {
  BREAKFAST_LABEL,
  addDays,
  CUISINE_LABEL,
  CUISINE_LEVEL_LABEL,
  LUNCH_LABEL,
  MEALS_LABEL,
  SPICE_LABEL,
  budgetOf,
  checkDishSafety,
  cuisinesOf,
  findDish,
  formatTrialReport,
  householdNotices,
  lunchStyleOf,
  mealsOf,
  paceOf,
  paceWeekdays,
  spiceOf,
  trialReport,
  weekCost,
  weekStartOf,
} from '../../engine';
import type { AppTarget } from '../../pwa';
import type { AiMode, AiStatus } from '../ai';
import { PWA_AI_PRIVACY_TEXT, PWA_AI_SERVER_TEXT, RULES_ONLY_TEXT, aiModesFor } from '../ai';
import { SERVINGS_NOTE, SIDE_POLICY, budgetText, cls, hasPartialServings, nextMemberId, normalizeForSearch, planToast } from '../lib';
import { parseImportedState } from '../storage';
import type { ClockMode } from '../storage';
import type { MemberDraft } from './Forms';
import { MemberEditor, PlanPicker, RadioSeg, Segmented, WeekdayPicker, emptyMemberDraft, exclusionLine, memberLine } from './Forms';
import { Icon } from './Icon';
import type { MealsValue } from './SettingsFields';
import {
  BudgetPicker,
  COOK_TIME_OPTIONS,
  CUISINE_NOTE,
  CostMeter,
  CuisineRows,
  MealsFields,
  PRICE_NOTE,
  SPICE_NOTE,
  SPICE_OPTIONS,
  ShoppingPaceFields,
  cookTimeDetail,
  cookTimeOf,
  extrasLabelOf,
  mealsValueOf,
  paceLabel,
  withCookTime,
} from './SettingsFields';
import { Sheet } from './Sheet';

export interface HouseholdChange {
  regenerate: boolean;
  toast: string;
  removedMemberIds?: string[];
  /**
   * 家族の変更（人を加える・外す・年齢帯や除外を直す）。作り直しは、今の家族で出せなくなった日だけにする
   * （エンジンの regenerate_week の keepSafe。今の家族でも出せる日は、だれが決めた日でも残し、人数と買い物リストは直す）。
   * 献立の曜日・買い物の曜日・ラク日・新しい料理・副菜・要確認・国の料理・辛さ・食費の目安・調理時間の変更では使わない
   * （週を作り直す）。
   */
  keepSafe?: boolean;
  /**
   * 作り直さずに、買い物リストだけを作り直す（regenerate が false のとき）。食事（お弁当・朝ごはん・お昼）と、その人数の変更。
   * 夕食の献立はそのままで、買い物リストに足す・外す物だけが変わる。
   */
  reshop?: boolean;
}

const MAX_MEMBERS = 6;

/** 日付の進め方の選び方（家族と設定）。 */
export const CLOCK_MODES: { id: ClockMode; label: string; note: string }[] = [
  {
    id: 'calendar',
    label: '本物の日付で進める（試用）',
    note: '日付は、日本時間の今日に合わせて毎日進みます。1週間の試用は、こちらを選んでください。',
  },
  { id: 'demo', label: '［翌日へ進む］で進める（デモ）', note: '画面の上の［翌日へ進む］を押すと、1日進みます。' },
];

/**
 * データの欄などの文のうち、ホーム画面に置く版（pwa）で言い方を変えるもの（ブラウザ・ページの言い方を、この端末・
 * このアプリの言い方にする）。
 */
export const DATA_TEXT = {
  stored: {
    web: '状態は、このブラウザの中だけに保存しています。ほかの人や端末には届きません。',
    pwa: '家族と記録は、この端末のこのアプリの中だけに保存しています。ほかの人や端末には届きません。',
  },
  saveFailed: {
    web: 'このブラウザには保存できていません。ページを閉じると、家族と記録が消えます。プライベートブラウズを使っていないか、サイトのデータを保存する設定になっているかを確かめてください。',
    pwa: 'この端末に保存できていません。アプリを閉じると、家族と記録が消えます。プライベートブラウズを使っていないか、サイトのデータを保存する設定になっているかを確かめてください。',
  },
  reset: {
    web: '保存した内容を消して、デモの家族で始め直します。元には戻せません。',
    pwa: '保存した内容を消して、はじめの画面に戻ります。元には戻せません。',
  },
  /** プランの欄の添え書き。ホーム画面に置く版（本番）は「試作」と言わない。 */
  plan: {
    web: '試作なので、本物の課金はありません。有料の動きを試せます。',
    pwa: '本物の支払いはありません。有料の動きも試せます。',
  },
} as const;

/**
 * 国の料理をまだ選んでいない世帯（前の版の記録・LINE の世帯）への一言。選ぶまでは、前からの料理だけで献立を作る
 * （エンジンは、cuisines のない世帯に世界の料理を出さない）。
 */
export const CUISINES_UNSET_NOTE = 'まだ選んでいません。いまは前からの料理だけで献立を作っています（選ぶと、新しい国の料理も入ります）。';

/** 試用の記録を送るときの題（navigator.share の title）。 */
export const SHARE_TITLE = 'きめとく 試用の記録';
/** ［LINE などで送る］で送れなかったとき（閉じただけのときは出さない）。 */
export const SHARE_FAILED_TOAST = '送れませんでした。［コピー］を押して、LINE などに貼り付けて送ってください。';

/** 試用の記録の説明。［LINE などで送る］があるときは、その送り方も書く。 */
export const TRIAL_NOTE = {
  copy: '1週間の試用のあとに、この記録を主催者に送ってください。名前は入らず、数だけをまとめています。LINE やメールに貼り付けて送れます。',
  share: '1週間の試用のあとに、この記録を主催者に送ってください。名前は入らず、数だけをまとめています。［LINE などで送る］で送るか、［コピー］して LINE やメールに貼り付けてください。',
} as const;

/** 端末の共有の画面（navigator.share）が使えるか。 */
function canShareText(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  } catch {
    return false;
  }
}

/** 共有の画面を閉じただけ（送らなかった）か。 */
function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

/**
 * 試用の記録を、端末の共有の画面で送る（押したときの処理の中で呼ぶ）。閉じただけ（AbortError）なら何もしない。
 * それ以外で送れなかったら onFail（［コピー］を案内する）。
 */
function shareText(text: string, onFail: () => void): void {
  const fail = (e: unknown) => {
    if (!isAbort(e)) onFail();
  };
  try {
    navigator.share({ title: SHARE_TITLE, text }).then(() => undefined, fail);
  } catch (e) {
    fail(e);
  }
}

export function aiStatusText(status: AiStatus): string {
  switch (status) {
    case 'checking':
      return 'AI が使えるか確かめています。そのあいだはルールで読み取ります。';
    case 'claude':
      return 'この画面では、Claude に読み取りを頼めます（あなたの Claude の利用枠を使います）。';
    case 'server':
      return '開発用のサーバーに読み取りを頼みます。サーバーで使えないときは、ルールで読み取ります。';
    case 'blocked':
      return 'この画面では AI を使えません。ルールだけで読み取ります。';
    default:
      return 'AI につながっていないため、ルールだけで読み取ります。';
  }
}

export function NoticeList({ household }: { household: Household }) {
  const notices = householdNotices(household);
  return (
    <ul className="notices">
      {notices.map((n) => (
        <li key={n.text} className={cls('notice-item', n.level === 'warning' && 'is-warning')}>
          {n.level === 'warning' ? (
            <span className="warn-label">
              <Icon name="alert" size={15} />
              注意
            </span>
          ) : (
            <span className="info-label">お知らせ</span>
          )}
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}

function toDraft(m: Member): MemberDraft {
  return { nickname: m.nickname, ageBand: m.ageBand, role: m.role, exclusions: m.exclusions };
}

/** 除外の中身を、順序によらず比べるための文字列（重いアレルギーの印も含める）。 */
function exclusionsKey(exclusions: Exclusion[]): string {
  return exclusions
    .map((e) =>
      e.type === 'allergen' ? `a:${e.id}:${e.severe ? 1 : 0}` : e.type === 'ingredient' ? `i:${e.id}` : `t:${normalizeForSearch(e.text)}`,
    )
    .sort()
    .join('|');
}

/**
 * 献立に効く変更か。年齢帯は量と料理の選び方に、除外は安全に効く。
 * ニックネームと続柄は献立に効かないので、それだけを直したときは献立（今日の分や選んだ差し替え）を作り直さない。
 */
export function memberChangeAffectsMeals(before: Member, after: Member): boolean {
  if (before.ageBand !== after.ageBand) return true;
  // 乳児（1歳未満）は献立の「食べる人」に含めないので、除外を直しても献立は変わらない（エンジンは乳児の除外で献立を選ばない）。
  if (after.ageBand === 'infant') return false;
  return exclusionsKey(before.exclusions) !== exclusionsKey(after.exclusions);
}

export function HouseholdSheet({
  state,
  catalog,
  aiMode,
  aiStatus,
  clock = 'demo',
  target = 'web',
  saveFailed = false,
  onClockChange = () => null,
  onAiModeChange,
  onHouseholdChange,
  onImport,
  onReset,
  onStartOver,
  onBack,
  onToast,
}: {
  state: AppState;
  catalog: Catalog;
  aiMode: AiMode;
  aiStatus: AiStatus;
  /** 日付の進め方。 */
  clock?: ClockMode;
  /** アプリの版。'pwa'（ホーム画面に置く版）は AI を使わず、試用の記録を共有の画面で送れる。 */
  target?: AppTarget;
  /** このブラウザに記録を保存できなかったか（データの欄に、そう書く）。 */
  saveFailed?: boolean;
  /** 日付の進め方を切り替える。切り替えられなければ、わけを返す（その場で出す）。 */
  onClockChange?: (mode: ClockMode) => string | null;
  onAiModeChange: (mode: AiMode) => void;
  onHouseholdChange: (next: Household, change: HouseholdChange) => void;
  /** 読み込む。読み込めなければ、わけを返す（その場で出す。貼り付けた文は消さない）。 */
  onImport: (state: AppState) => string | null | void;
  onReset: () => void;
  onStartOver: () => void;
  onBack: () => void;
  onToast: (text: string) => void;
}) {
  const h = state.household;
  const settings = h.settings;
  const pwa = target === 'pwa';
  const [editing, setEditing] = useState<{ id: string | null; draft: MemberDraft } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);

  const changeClock = (mode: ClockMode) => setClockError(onClockChange(mode));

  const setSettings = (patch: Partial<HouseholdSettings>, change: HouseholdChange) =>
    onHouseholdChange({ ...h, settings: { ...settings, ...patch } }, change);
  const regen = (toast: string): HouseholdChange => ({ regenerate: true, toast });
  /** 家族の変更：出せなくなった日だけを作り直す。 */
  const regenFamily = (toast: string): HouseholdChange => ({ regenerate: true, toast, keepSafe: true });
  /** 食事の変更：夕食の献立はそのままで、買い物リストだけを作り直す。 */
  const reshop = (toast: string): HouseholdChange => ({ regenerate: false, reshop: true, toast });

  const changeMeals = (patch: Partial<MealsValue>) => {
    if (patch.meals) {
      setSettings({ meals: patch.meals }, reshop(`食事を「${MEALS_LABEL[patch.meals]}」にしました。夕食の献立はそのままです。`));
    } else if (patch.breakfastStyle) {
      setSettings({ breakfastStyle: patch.breakfastStyle }, reshop(`朝ごはんを「${BREAKFAST_LABEL[patch.breakfastStyle]}」にしました。`));
    } else if (patch.lunchStyle) {
      setSettings({ lunchStyle: patch.lunchStyle }, reshop(`お昼を「${LUNCH_LABEL[patch.lunchStyle]}」にしました。`));
    } else if (patch.lunchCount !== undefined) {
      const home = mealsOf(settings) === 'three' && lunchStyleOf(settings) === 'home';
      setSettings({ lunchCount: patch.lunchCount }, reshop(`${home ? 'お昼' : 'お弁当'}を${patch.lunchCount}人分にしました。`));
    }
  };

  /** 調理時間を、どの曜日も同じにしているか（0 はこだわらない。曜日で違えば null）。 */
  const cookTime = cookTimeOf(settings);

  const changeDinnerDays = (dinnerWeekdays: Weekday[]) => {
    const patch: Partial<HouseholdSettings> = { dinnerWeekdays };
    // どの曜日も同じ調理時間にしていたら、足した曜日にも同じ時間を当てる（曜日ごとに違う時間にならないように）。
    if (cookTime !== null && cookTime > 0) patch.maxMinutes = withCookTime(dinnerWeekdays, cookTime);
    // 買い物を「毎日」にしていたら、買い物の曜日も献立の曜日に合わせる。
    if (paceOf(settings.shoppingWeekdays, settings.dinnerWeekdays) === 'daily') patch.shoppingWeekdays = paceWeekdays('daily', dinnerWeekdays);
    setSettings(patch, regen('献立の曜日を変えました。'));
  };

  const budget = budgetOf(settings);
  // 食費の目安は今週の分。今週の献立がなく、来週の献立があれば（週末に始めたときなど）来週の分を出す。
  const thisWeek = weekStartOf(state.today);
  const nextWeek = addDays(thisWeek, 7);
  const hasWeek = (ws: ISODate) => state.meals.some((m) => weekStartOf(m.date) === ws);
  const costWeek = !hasWeek(thisWeek) && hasWeek(nextWeek) ? nextWeek : thisWeek;

  const saveMember = () => {
    if (!editing) return;
    const nickname = editing.draft.nickname.trim();
    if (!nickname) {
      setEditError('ニックネームを入れてください。');
      return;
    }
    const clash = h.members.some((m) => m.id !== editing.id && normalizeForSearch(m.nickname) === normalizeForSearch(nickname));
    if (clash) {
      setEditError('同じニックネームの家族がいます。別の名前にしてください。');
      return;
    }
    const member: Member = {
      id: editing.id ?? nextMemberId(h.members),
      nickname,
      ageBand: editing.draft.ageBand,
      ...(editing.draft.role ? { role: editing.draft.role } : {}),
      exclusions: editing.draft.exclusions,
    };
    const members = editing.id ? h.members.map((m) => (m.id === editing.id ? member : m)) : [...h.members, member];
    const before = editing.id ? h.members.find((m) => m.id === editing.id) : undefined;
    setEditing(null);
    setEditError(null);
    if (!before) {
      onHouseholdChange({ ...h, members }, regenFamily(`${nickname}を加えました。`));
      return;
    }
    onHouseholdChange(
      { ...h, members },
      memberChangeAffectsMeals(before, member) ? regenFamily(`${nickname}を直しました。`) : { regenerate: false, toast: `${nickname}を直しました。` },
    );
  };

  const deleteMember = (id: string) => {
    const name = h.members.find((m) => m.id === id)?.nickname ?? '';
    setConfirmDelete(null);
    onHouseholdChange(
      { ...h, members: h.members.filter((m) => m.id !== id) },
      { regenerate: true, keepSafe: true, toast: `${name}を家族から外しました。`, removedMemberIds: [id] },
    );
  };

  return (
    <Sheet id="household" title="家族と設定" onBack={onBack}>
      <section className="block" aria-labelledby="notices-title">
        <h3 className="block-title" id="notices-title">
          大切なお知らせ
        </h3>
        <NoticeList household={h} />
      </section>

      <section className="block" aria-labelledby="family-title">
        <h3 className="block-title" id="family-title">
          家族
          <span className="block-count num">
            {h.members.length}人（最大{MAX_MEMBERS}人）
          </span>
        </h3>
        <ul className="members">
          {h.members.map((m) =>
            editing?.id === m.id ? (
              <li key={m.id} className="member-card is-editing">
                <MemberEditor idPrefix={`edit-${m.id}`} value={editing.draft} onChange={(draft) => setEditing({ id: m.id, draft })} catalog={catalog} pwa={pwa} />
                {editError ? <p className="form-error" role="alert">{editError}</p> : null}
                <div className="row-actions">
                  <button type="button" className="btn btn--primary" onClick={saveMember}>
                    保存する
                  </button>
                  <button type="button" className="btn" onClick={() => { setEditing(null); setEditError(null); }}>
                    やめる
                  </button>
                </div>
              </li>
            ) : (
              <li key={m.id} className="member-card">
                <div className="member-main">
                  <span className="member-name">{m.nickname}</span>
                  <span className="member-sub">{memberLine(m)}</span>
                  <span className="member-ex">{exclusionLine(m, catalog)}</span>
                </div>
                {confirmDelete === m.id ? (
                  <div className="confirm" role="group" aria-label={`${m.nickname}を外すかの確認`}>
                    <p>{m.nickname}を家族から外しますか？</p>
                    <div className="row-actions">
                      <button type="button" className="btn btn--danger" onClick={() => deleteMember(m.id)}>
                        外す
                      </button>
                      <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                        やめる
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={!!editing}
                      onClick={() => {
                        setEditing({ id: m.id, draft: toDraft(m) });
                        setEditError(null);
                      }}
                    >
                      <Icon name="edit" size={16} />
                      直す
                    </button>
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={h.members.length <= 1 || !!editing}
                      onClick={() => setConfirmDelete(m.id)}
                    >
                      <Icon name="trash" size={16} />
                      外す
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
          {editing && editing.id === null ? (
            <li className="member-card is-editing">
              <MemberEditor idPrefix="edit-new" value={editing.draft} onChange={(draft) => setEditing({ id: null, draft })} catalog={catalog} pwa={pwa} />
              {editError ? <p className="form-error" role="alert">{editError}</p> : null}
              <div className="row-actions">
                <button type="button" className="btn btn--primary" onClick={saveMember}>
                  加える
                </button>
                <button type="button" className="btn" onClick={() => { setEditing(null); setEditError(null); }}>
                  やめる
                </button>
              </div>
            </li>
          ) : null}
        </ul>
        {!editing ? (
          <button
            type="button"
            className="btn"
            disabled={h.members.length >= MAX_MEMBERS}
            onClick={() => setEditing({ id: null, draft: emptyMemberDraft(h.members.length) })}
          >
            <Icon name="plus" size={18} />
            家族を加える
          </button>
        ) : null}
        {hasPartialServings(h.members) ? <p className="field-note">{SERVINGS_NOTE}</p> : null}
      </section>

      <section className="block" aria-labelledby="meals-title">
        <h3 className="block-title" id="meals-title">
          食事
        </h3>
        <p className="field-note">献立を決める食事と、曜日です。お弁当や朝ごはんを変えても、夕食の献立はそのままです。</p>
        <MealsFields idPrefix="st" labelledBy="meals-title" value={mealsValueOf(settings)} onChange={changeMeals} />
        <div className="pref-field">
          <p className="setting-name" id="days-title">
            献立を作る曜日
          </p>
          <WeekdayPicker label="献立を作る曜日" value={settings.dinnerWeekdays} onChange={changeDinnerDays} />
        </div>
      </section>

      <section className="block" aria-labelledby="shop-title">
        <h3 className="block-title" id="shop-title">
          買い物のしかた
        </h3>
        <p className="field-note">何日分をまとめて買うかです。買い物リストは、買い物の日ごとに作ります。</p>
        <ShoppingPaceFields
          idPrefix="st"
          labelledBy="shop-title"
          shoppingWeekdays={settings.shoppingWeekdays}
          dinnerWeekdays={settings.dinnerWeekdays}
          onChange={(shoppingWeekdays, pace) =>
            setSettings(
              { shoppingWeekdays },
              regen(pace === 'custom' ? '買い物の曜日を変えました。' : `買い物を「${paceLabel(pace)}」にしました。`),
            )
          }
        />
      </section>

      <section className="block" aria-labelledby="taste-title">
        <h3 className="block-title" id="taste-title">
          好み
        </h3>
        <p className="field-note">国の料理と辛さの好みです。変えると、今週の献立を作り直します。</p>
        <p className="setting-name">国の料理</p>
        <CuisineRows
          idPrefix="st"
          value={cuisinesOf(settings)}
          onChange={(genre, level) =>
            setSettings(
              // 1つ変えたら、7つの国をすべて書く（画面に出ている選び方のまま。書いたあとは、世界の料理も選び方どおりに入る）。
              { cuisines: { ...cuisinesOf(settings), [genre]: level } },
              regen(`${CUISINE_LABEL[genre]}を「${CUISINE_LEVEL_LABEL[level]}」にしました。`),
            )
          }
        />
        {settings.cuisines === undefined ? <p className="field-note">{CUISINES_UNSET_NOTE}</p> : null}
        <p className="field-note">{CUISINE_NOTE}</p>
        <div className="pref-field">
          <p className="setting-name" id="spice-title">
            辛さ
          </p>
          <RadioSeg
            name="st-spice"
            labelledBy="spice-title"
            options={SPICE_OPTIONS}
            value={spiceOf(settings)}
            onChange={(spice) => setSettings({ spice }, regen(`辛さを「${SPICE_LABEL[spice]}」にしました。`))}
          />
          <p className="field-note">{SPICE_NOTE}</p>
        </div>
      </section>

      <section className="block" aria-labelledby="budget-title">
        <h3 className="block-title" id="budget-title">
          1週間の食費
        </h3>
        <p className="field-note">1週間の食費の目安です。選ぶと、目安に近い献立にします。</p>
        <BudgetPicker
          idPrefix="st"
          labelledBy="budget-title"
          value={budget}
          onChange={(weeklyBudget) =>
            setSettings(
              { weeklyBudget },
              regen(
                weeklyBudget === null ? '1週間の食費の目安を「目安なし」にしました。' : `1週間の食費の目安を${budgetText(weeklyBudget)}にしました。`,
              ),
            )
          }
        />
        {hasWeek(costWeek) ? (
          <CostMeter
            label={costWeek === nextWeek ? '来週の目安' : '今週の目安'}
            cost={weekCost(state, catalog, costWeek)}
            budget={budget}
            extrasLabel={extrasLabelOf(settings)}
          />
        ) : (
          <p className="hint">献立ができたら、ここに今週の食費の目安を出します。</p>
        )}
        <p className="field-note">{PRICE_NOTE}</p>
      </section>

      <section className="block" aria-labelledby="time-title">
        <h3 className="block-title" id="time-title">
          平日の調理時間
        </h3>
        <p className="field-note">夕食づくりにかけられる時間です。主菜は、この時間でできる料理を優先します。</p>
        <RadioSeg
          name="st-time"
          labelledBy="time-title"
          options={COOK_TIME_OPTIONS}
          value={cookTime}
          onChange={(minutes) =>
            setSettings(
              { maxMinutes: withCookTime(settings.dinnerWeekdays, minutes) },
              regen(`平日の調理時間を「${minutes === 0 ? 'こだわらない' : `${minutes}分`}」にしました。`),
            )
          }
        />
        {cookTime === null ? (
          <p className="hint">今は、曜日ごとに違う時間です（{cookTimeDetail(settings)}）。選ぶと、どの曜日も同じ時間にします。</p>
        ) : !COOK_TIME_OPTIONS.some((o) => o.value === cookTime) ? (
          <p className="hint">今は、どの曜日も{cookTime}分です。選ぶと、どの曜日もその時間にします。</p>
        ) : null}
      </section>

      <FavoritesBlock state={state} catalog={catalog} pwa={pwa} />

      <section className="block" aria-labelledby="plan-rule-title">
        <h3 className="block-title" id="plan-rule-title">
          献立の決め方
        </h3>
        <div className="setting-row">
          <div>
            <p className="setting-name">ラク日の数（1週間）</p>
            <p className="field-note">冷凍食品・惣菜や、火をほとんど使わない料理で済ませる日です（アレルギーの除外がある家族では、市販品はふだん使いません）。</p>
          </div>
          <Segmented
            label="ラク日の数"
            options={[0, 1, 2].map((n) => ({ value: n, label: `${n}日` }))}
            value={settings.rakuPerWeek}
            onChange={(rakuPerWeek) => setSettings({ rakuPerWeek }, regen(`ラク日を週${rakuPerWeek}日にしました。`))}
          />
        </div>
        <div className="setting-row">
          <div>
            <p className="setting-name">新しい料理の数（1週間）</p>
            <p className="field-note">定番にない料理を混ぜる数です。</p>
          </div>
          <Segmented
            label="新しい料理の数"
            options={[0, 1, 2].map((n) => ({ value: n, label: `${n}品` }))}
            value={settings.newPerWeek}
            onChange={(newPerWeek) => setSettings({ newPerWeek }, regen(`新しい料理を週${newPerWeek}品にしました。`))}
          />
        </div>
        <fieldset className="field">
          <legend className="setting-name">副菜の方針</legend>
          <div className="radio-list">
            {SIDE_POLICY.map((p) => (
              <label key={p.id} className={cls('radio-card', settings.sidePolicy === p.id && 'is-on')}>
                <input
                  type="radio"
                  name="side-policy"
                  checked={settings.sidePolicy === p.id}
                  onChange={() => setSettings({ sidePolicy: p.id }, regen(`副菜の方針を「${p.label}」にしました。`))}
                />
                <span>
                  <span className="radio-title">{p.label}</span>
                  <span className="field-note">{p.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {/* 行のどこを押しても切り替わるように、行全体を label にする（チェックボックスは label の中）。 */}
        <label className="toggle-row" htmlFor="allow-uncertain">
          <input
            id="allow-uncertain"
            type="checkbox"
            checked={settings.allowUncertainWithExclusions}
            onChange={(e) =>
              setSettings(
                { allowUncertainWithExclusions: e.target.checked },
                regen(e.target.checked ? '「要確認」の料理も出すようにしました。' : '「要確認」の料理は出さないようにしました。'),
              )
            }
          />
          <span>
            <span className="setting-name">要確認の料理も出す</span>
            <span className="field-note">
              除外のある家族で、市販のルウ・冷凍食品・惣菜など、銘柄で原材料が変わる物を使う料理も献立に出します。出すときは「要確認」の注意を付けるので、パッケージの表示を必ず確かめてください。ふだんはオフにしておくのがおすすめです。
            </span>
          </span>
        </label>
      </section>

      <section className="block" aria-labelledby="plan-title">
        <h3 className="block-title" id="plan-title">
          プラン
        </h3>
        <p className="field-note">{DATA_TEXT.plan[pwa ? 'pwa' : 'web']}</p>
        <PlanPicker name="settings-plan" value={settings.plan} onChange={(plan) => setSettings({ plan }, { regenerate: false, toast: planToast(plan, clock) })} />
      </section>

      {/* ホーム画面に置く版（本番）は、いつも本物の日付で進める（［翌日へ進む］のデモはない）ので、選ばせない。 */}
      {pwa ? null : (
        <section className="block" aria-labelledby="clock-title">
          <h3 className="block-title" id="clock-title">
            日付の進め方
          </h3>
          <div className="radio-list" role="radiogroup" aria-labelledby="clock-title">
            {CLOCK_MODES.map((m) => (
              <label key={m.id} className={cls('radio-card', clock === m.id && 'is-on')}>
                <input type="radio" name="clock-mode" value={m.id} checked={clock === m.id} onChange={() => changeClock(m.id)} />
                <span>
                  <span className="radio-title">{m.label}</span>
                  <span className="field-note">{m.note}</span>
                </span>
              </label>
            ))}
          </div>
          {clockError ? (
            <p className="form-error" role="alert">
              {clockError}
            </p>
          ) : null}
        </section>
      )}

      <section className="block" aria-labelledby="ai-title">
        <h3 className="block-title" id="ai-title">
          AIの読み取り
        </h3>
        {pwa && aiStatus !== 'server' ? (
          // ホーム画面に置く版で AI を使えないとき（鍵がない・電波がない・確かめている途中）は、ルールだけで読むと書く。
          // 選べない設定（おまかせ・いつも AI・使わない）は出さない。
          <p className="ai-status is-off" data-testid="ai-status">
            {RULES_ONLY_TEXT}
          </p>
        ) : (
          <>
            <p className={cls('ai-status', (aiStatus === 'blocked' || aiStatus === 'none') && 'is-off')} data-testid="ai-status">
              {pwa ? PWA_AI_SERVER_TEXT : aiStatusText(aiStatus)}
            </p>
            <div className="radio-list">
              {aiModesFor(pwa).map((m) => (
                <label key={m.id} className={cls('radio-card', aiMode === m.id && 'is-on')}>
                  <input type="radio" name="ai-mode" checked={aiMode === m.id} onChange={() => onAiModeChange(m.id)} />
                  <span>
                    <span className="radio-title">{m.label}</span>
                    <span className="field-note">{m.note}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="field-note">{pwa ? PWA_AI_PRIVACY_TEXT : 'AI には家族の名前を送らず、「member_1」のような番号に置き換えます。'}</p>
          </>
        )}
      </section>

      <DataTools
        state={state}
        catalog={catalog}
        clock={clock}
        target={target}
        saveFailed={saveFailed}
        onImport={onImport}
        onReset={onReset}
        onStartOver={onStartOver}
        onToast={onToast}
      />
    </Sheet>
  );
}

/** うちの定番の一覧。献立に出ない定番（除外に当たる・要確認）には、そのわけを添える。 */
function FavoritesBlock({ state, catalog, pwa = false }: { state: AppState; catalog: Catalog; pwa?: boolean }) {
  const h = state.household;
  const allowUncertain = h.settings.allowUncertainWithExclusions;
  // 自由入力の定番（customDishes）も定番として扱う（エンジンの isFavorite と同じ）。
  const ids = [...h.favorites.map((f) => f.dishId), ...h.customDishes.map((d) => d.id)].filter((id, i, all) => all.indexOf(id) === i);
  const rows = ids.map((id) => {
    const dish = findDish(state, catalog, id);
    return { id, name: dish?.name ?? id, custom: !!dish?.custom, status: dish ? checkDishSafety(dish, h, catalog).status : 'ok' };
  });
  const hiddenUncertain = !allowUncertain && rows.some((r) => r.status === 'uncertain');
  return (
    <section className="block" aria-labelledby="fav-title">
      <h3 className="block-title" id="fav-title">
        うちの定番
        <span className="block-count num">{rows.length}品</span>
      </h3>
      <p className="field-note">献立は、この定番を中心に組みます（定番の追加と削除は、{pwa ? 'まだできません' : 'この試作ではまだできません'}）。</p>
      {rows.length === 0 ? (
        <p className="field-note">定番はまだありません。</p>
      ) : (
        <ul className="fav-list">
          {rows.map((r) => (
            <li key={r.id} className="fav-item">
              <span className="fav-name">{r.name}</span>
              {r.custom ? <span className="badge badge--planned">名前だけ</span> : null}
              {r.status === 'excluded' ? (
                <span className="badge badge--warn">除外に当たるので出しません</span>
              ) : r.status === 'uncertain' ? (
                <span className="badge badge--uncertain">{allowUncertain ? '要確認（注意を付けて出します）' : '要確認なので出しません'}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {hiddenUncertain ? (
        <p className="hint">
          「要確認」は、材料がわからない料理（名前だけの定番）や、銘柄で原材料が変わる物を使う料理です。アレルギーの除外がある家族では、献立に出しません。下の「要確認の料理も出す」をオンにすると、注意を付けて出します。
        </p>
      ) : null}
    </section>
  );
}

/**
 * テキスト欄の中身をクリップボードにコピーする（押したときの処理の中で書く）。使えないときは、テキスト欄を選択して
 * 「選択してコピーしてください」と出す（何度失敗しても、そのたびに選択し直す）。
 */
function copyFromArea(area: HTMLTextAreaElement | null, text: string, onDone: () => void, onFail: () => void): void {
  const fail = () => {
    onFail();
    if (!area) return;
    try {
      area.focus();
      area.select();
      area.setSelectionRange(0, area.value.length);
    } catch {
      // 選択できなくても、案内は出ている。
    }
  };
  try {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip || typeof clip.writeText !== 'function') {
      fail();
      return;
    }
    clip.writeText(text).then(onDone, fail);
  } catch {
    fail();
  }
}

/**
 * 試用の記録（1週間の試用のあとに、主催者に送る文）。名前は入らず、数だけ（エンジンの trialReport）。
 * 家族と設定を開いたときに作る（トークの書き込みのたびには作らない）。
 */
function TrialRecord({
  state,
  catalog,
  clock,
  target,
  onToast,
}: {
  state: AppState;
  catalog: Catalog;
  clock: ClockMode;
  target: AppTarget;
  onToast: (text: string) => void;
}) {
  // 読み取れなかった書き込みの文は、送る人が選んだときだけ入れる（既定は入れない。エンジンの trialReport の既定と同じ）。
  const [includeTexts, setIncludeTexts] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const text = useMemo(() => formatTrialReport(trialReport(state, catalog, { includeTexts, clock })), [state, catalog, includeTexts, clock]);
  // ホーム画面に置く版で、端末の共有の画面が使えるときは、［LINE などで送る］も出す（［コピー］は残す）。
  const canShare = target === 'pwa' && canShareText();

  const copyButton = (
    <button
      type="button"
      className="btn btn--small"
      onClick={() =>
        copyFromArea(
          areaRef.current,
          text,
          () => {
            setCopyFailed(false);
            onToast('試用の記録をコピーしました');
          },
          () => setCopyFailed(true),
        )
      }
    >
      <Icon name="copy" size={16} />
      コピー
    </button>
  );

  return (
    <div className="data-tool trial-record" role="group" aria-labelledby="trial-title">
      <p className="setting-name" id="trial-title">
        試用の記録
      </p>
      <p className="field-note">{canShare ? TRIAL_NOTE.share : TRIAL_NOTE.copy}</p>
      <label className="toggle-row" htmlFor="trial-texts">
        <input id="trial-texts" type="checkbox" checked={includeTexts} onChange={(e) => setIncludeTexts(e.target.checked)} />
        <span className="toggle-text">読み取れなかった書き込みの文も入れる（読み取りの改善に使います）</span>
      </label>
      <label className="sr-only" htmlFor="trial-text">
        試用の記録（送る文）
      </label>
      <textarea id="trial-text" ref={areaRef} className="code-area" readOnly rows={8} value={text} />
      {copyFailed ? <p className="hint">コピーできませんでした。テキストを選択してコピーしてください。</p> : null}
      {canShare ? (
        <div className="row-actions">
          <button type="button" className="btn btn--small" onClick={() => shareText(text, () => onToast(SHARE_FAILED_TOAST))}>
            <Icon name="share" size={16} />
            LINE などで送る
          </button>
          {copyButton}
        </div>
      ) : (
        copyButton
      )}
    </div>
  );
}

function DataTools({
  state,
  catalog,
  clock,
  target,
  saveFailed,
  onImport,
  onReset,
  onStartOver,
  onToast,
}: {
  state: AppState;
  catalog: Catalog;
  clock: ClockMode;
  target: AppTarget;
  saveFailed: boolean;
  onImport: (state: AppState) => string | null | void;
  onReset: () => void;
  onStartOver: () => void;
  onToast: (text: string) => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState(false);
  const exportRef = useRef<HTMLTextAreaElement>(null);
  const exportText = exportOpen ? JSON.stringify(state, null, 2) : '';
  const version = target === 'pwa' ? 'pwa' : 'web';

  useEffect(() => {
    if (copyFailed && exportRef.current) {
      exportRef.current.focus();
      exportRef.current.select();
    }
  }, [copyFailed]);

  const copy = () => {
    const fail = () => setCopyFailed(true);
    try {
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clip || typeof clip.writeText !== 'function') {
        fail();
        return;
      }
      clip.writeText(exportText).then(() => {
        setCopyFailed(false);
        onToast('書き出したデータをコピーしました');
      }, fail);
    } catch {
      fail();
    }
  };

  return (
    <section className="block" aria-labelledby="data-title">
      <h3 className="block-title" id="data-title">
        データ
      </h3>
      {saveFailed ? (
        <p className="field-note">{DATA_TEXT.saveFailed[version]}</p>
      ) : (
        <p className="field-note">{DATA_TEXT.stored[version]}</p>
      )}

      <TrialRecord state={state} catalog={catalog} clock={clock} target={target} onToast={onToast} />

      <div className="data-tool">
        <p className="setting-name">書き出し</p>
        {exportOpen ? (
          <>
            <label className="sr-only" htmlFor="export-text">
              書き出したデータ（JSON）
            </label>
            <textarea id="export-text" ref={exportRef} className="code-area" readOnly rows={6} value={exportText} />
            {copyFailed ? <p className="hint">コピーできませんでした。テキストを選択してコピーしてください。</p> : null}
            <div className="row-actions">
              <button type="button" className="btn btn--small" onClick={copy}>
                <Icon name="copy" size={16} />
                コピー
              </button>
              <button type="button" className="btn btn--small" onClick={() => { setExportOpen(false); setCopyFailed(false); }}>
                閉じる
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn btn--small" onClick={() => setExportOpen(true)}>
            書き出す（JSON）
          </button>
        )}
      </div>

      <div className="data-tool">
        <label className="setting-name" htmlFor="import-text">
          読み込み
        </label>
        <textarea
          id="import-text"
          className="code-area"
          rows={4}
          placeholder="書き出したテキストを貼り付けてください"
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setImportError(null);
          }}
        />
        {importError ? (
          <p className="form-error" role="alert">
            {importError}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            const r = parseImportedState(importText);
            if (!r.ok) {
              setImportError(r.error);
              return;
            }
            const refused = onImport(r.state);
            if (refused) {
              setImportError(refused);
              return;
            }
            setImportText('');
            setImportError(null);
          }}
        >
          読み込む
        </button>
      </div>

      <div className="data-tool">
        <p className="setting-name">やり直す</p>
        <div className="row-actions">
          <button type="button" className="btn btn--small" onClick={onStartOver}>
            はじめから設定する
          </button>
          {!resetStep ? (
            <button type="button" className="btn btn--small" onClick={() => setResetStep(true)}>
              リセット
            </button>
          ) : null}
        </div>
        {resetStep ? (
          <div className="confirm" role="group" aria-label="リセットの確認">
            <p>{DATA_TEXT.reset[version]}</p>
            <div className="row-actions">
              <button type="button" className="btn btn--danger" onClick={() => { setResetStep(false); onReset(); }}>
                本当にリセットする
              </button>
              <button type="button" className="btn" onClick={() => setResetStep(false)}>
                やめる
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
