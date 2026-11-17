// 初回設定（DESIGN.md 4章の①〜④）。最後に注意を見せてから始める。
// ①家族 ②食事と買い物（どの食事を決めるか・何日分まとめて買うか）③好みと定番（国の料理・辛さ・うちの定番）
// ④予算とプラン（1週間の食費の目安・無料と有料）⑤確認。選ぶだけで進められ、どれも既定のままでよい。
// 確認（⑤）で、日付の進め方を選ぶ：本物の日付で進める（1週間の試用。既定）か、［翌日へ進む］で進めるデモか。
// ホーム画面に置く版（target が 'pwa'。本番）は、デモの家族で始めるボタンも、日付の進め方の選択もない（いつも本物の日付）。
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog, CuisineGenre, CuisineLevel, Household, ISODate, OnboardingInput, SpiceLevel, Weekday } from '../../engine';
import type { AppTarget } from '../../pwa';
import { DEFAULT_CUISINES, SPICE_LABEL, householdNotices } from '../../engine';
import { budgetText, cls, normalizeForSearch } from '../lib';
import type { ClockMode } from '../storage';
import type { MemberDraft } from './Forms';
import { DishPicker, MemberEditor, PLAN_INFO, PlanPicker, RadioSeg, emptyMemberDraft, exclusionLine, memberLine } from './Forms';
import { Icon } from './Icon';
import type { MealsValue } from './SettingsFields';
import {
  BudgetPicker,
  CUISINE_NOTE,
  CuisineRows,
  DEFAULT_MEALS_VALUE,
  MealsFields,
  PRICE_NOTE,
  SPICE_NOTE,
  SPICE_OPTIONS,
  ShoppingPaceFields,
  cuisineSummary,
  mealsSummary,
  shoppingSummary,
} from './SettingsFields';

const STEPS = ['家族', '食事と買い物', '好みと定番', '予算とプラン', '確認'] as const;
/** 初回設定の献立の曜日（エンジンの既定と同じ月〜金。家族と設定で変えられる）。 */
const DINNER_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const MAX_MEMBERS = 6;
const SEVERE_TEXT = '重い食物アレルギー（アナフィラキシーの経験など）は、このプロトタイプの対象外です。医師の指示を優先してください';
/** 同じ注意の、ホーム画面に置く版（本番の試用）の言い方（エンジンの文は LINE と共通なので、画面で置き換える）。 */
export const SEVERE_TEXT_PWA = '重い食物アレルギー（アナフィラキシーの経験など）は、この試用の対象外です。医師の指示を優先してください';
/** 今の状態から開いたとき（onCancel があるとき）の、置き換えの注意。 */
const REPLACE_TEXT = '今の家族と記録は、この内容で置き換わります。元には戻せません。';
/** プランの選択（④）の添え書き。ホーム画面に置く版（本番）は「試作」と言わない。 */
export const PLAN_NOTE = {
  web: '試作なので、本物の課金はありません。あとから「家族と設定」で変えられます。',
  pwa: '本物の支払いはありません。あとから「家族と設定」で変えられます。',
} as const;

export function Onboarding({
  catalog,
  today,
  onStart,
  onDemo,
  onCancel,
  replaces = !!onCancel,
  focusTitle = false,
  target = 'web',
}: {
  catalog: Catalog;
  today: ISODate;
  /**
   * clock：日付の進め方（確認の画面のチェックで選ぶ。デモの家族で始めるときは、いつも demo。ホーム画面に置く版は、いつも
   * calendar）。
   */
  onStart: (input: OnboardingInput, clock: ClockMode) => void;
  /** デモの家族で始める（ホーム画面に置く版では使わない）。 */
  onDemo?: () => void;
  onCancel?: () => void;
  /**
   * 今の家族と記録を置き換えるか（既定は、やめて戻れるとき＝今の状態から開いたとき）。置き換えるときは、デモで始め直す前に
   * ページの中で確かめ、確認（⑤）に置き換えの注意を出す。はじめの画面から開いたとき（ホーム画面に置く版）は、置き換えない。
   */
  replaces?: boolean;
  /** 開いたら見出しへフォーカスを移す（はじめの画面のボタンから開いたとき。押したボタンは消えるので）。 */
  focusTitle?: boolean;
  /** アプリの版。'pwa'（ホーム画面に置く版。本番）は、デモの家族で始めるボタンと日付の進め方の選択を出さない。 */
  target?: AppTarget;
}) {
  const pwa = target === 'pwa';
  const demo = !pwa && !!onDemo;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusOnOpen = useRef(focusTitle);
  useEffect(() => {
    // 開いたときだけ（あとで focusTitle が変わっても動かさない）。
    if (focusOnOpen.current) titleRef.current?.focus({ preventScroll: true });
  }, []);
  const [step, setStep] = useState(0);
  /** 本物の日付で進める（1週間の試用）。自分の家族で試す人のための既定。 */
  const [calendar, setCalendar] = useState(true);
  const [members, setMembers] = useState<MemberDraft[]>(() => [emptyMemberDraft(0)]);
  // 今の状態から開いたとき（onCancel がある）は、デモで始め直す前にページの中で確かめる（リセットと同じ）。
  const [demoConfirm, setDemoConfirm] = useState(false);
  const demoButtonRef = useRef<HTMLButtonElement>(null);
  const demoConfirmRef = useRef<HTMLDivElement>(null);
  const confirmWasOpen = useRef(false);
  useEffect(() => {
    // 確認を開いたら確認の文へ、やめたら元のボタンへフォーカスを移す（消えたボタンに残さない）。
    if (demoConfirm) demoConfirmRef.current?.focus();
    else if (confirmWasOpen.current) demoButtonRef.current?.focus();
    confirmWasOpen.current = demoConfirm;
  }, [demoConfirm]);
  const [editing, setEditing] = useState<number | null>(0);
  // 買い物は、週2回（日・水）で始める。
  const [shoppingWeekdays, setShoppingWeekdays] = useState<Weekday[]>([0, 3]);
  const [mealsValue, setMealsValue] = useState<MealsValue>(DEFAULT_MEALS_VALUE);
  const [cuisines, setCuisines] = useState<Record<CuisineGenre, CuisineLevel>>(() => ({ ...DEFAULT_CUISINES }));
  const [spice, setSpice] = useState<SpiceLevel>('normal');
  const [budget, setBudget] = useState<number | null>(null);
  /** 予算を選んだか（選ばなければ、設定に書かない）。 */
  const [budgetTouched, setBudgetTouched] = useState(false);
  const [favoriteDishIds, setFavoriteDishIds] = useState<string[]>([]);
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [plan, setPlan] = useState<'free' | 'paid'>('free');
  const [error, setError] = useState<string | null>(null);

  // 除外の印と注意と、定番の選び方（国の料理の好みの順）のための、入力中の世帯。
  const draft: Household = useMemo(
    () => ({
      id: 'draft',
      members: members.map((m, i) => ({ ...m, nickname: m.nickname.trim() || `家族${i + 1}`, id: `member_${i + 1}` })),
      favorites: [],
      customDishes: [],
      settings: {
        plan,
        dinnerWeekdays: DINNER_WEEKDAYS,
        shoppingWeekdays,
        rakuPerWeek: 1,
        newPerWeek: 1,
        sidePolicy: 'side_or_soup',
        maxMinutes: {},
        allowUncertainWithExclusions: false,
        cuisines,
        spice,
      },
      createdAt: today,
    }),
    [members, plan, shoppingWeekdays, cuisines, spice, today],
  );

  const checkFamily = (): string | null => {
    if (members.length === 0) return '家族を1人以上入れてください。';
    const names = members.map((m) => normalizeForSearch(m.nickname));
    if (names.some((n) => !n)) return 'ニックネームが空の家族がいます。';
    if (new Set(names).size !== names.length) return '同じニックネームの家族がいます。別の名前にしてください。';
    return null;
  };

  const next = () => {
    const problem = step === 0 ? checkFamily() : step === 1 && shoppingWeekdays.length === 0 ? '買い物の曜日を1つ以上選んでください。' : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setEditing(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  /**
   * 選んだ、あとから足した設定。食事・国の料理・辛さは、いつも選んだとおりに書く。朝ごはんとお昼は朝・昼・夕のとき、人数は
   * お弁当かお昼があるときだけ。予算は選んだときだけ（目安なしを選んだら null）。
   */
  const chosenExtras = (): NonNullable<OnboardingInput['extras']> => {
    const x: NonNullable<OnboardingInput['extras']> = { meals: mealsValue.meals, cuisines: { ...cuisines }, spice };
    if (mealsValue.meals === 'three') {
      x.breakfastStyle = mealsValue.breakfastStyle;
      x.lunchStyle = mealsValue.lunchStyle;
    }
    if (mealsValue.meals !== 'dinner') x.lunchCount = mealsValue.lunchCount;
    if (budgetTouched) x.weeklyBudget = budget;
    return x;
  };

  const start = () => {
    const problem = checkFamily();
    if (problem) {
      setError(problem);
      setStep(0);
      return;
    }
    onStart(
      {
        members: members.map((m) => ({
          nickname: m.nickname.trim(),
          ageBand: m.ageBand,
          ...(m.role ? { role: m.role } : {}),
          exclusions: m.exclusions,
        })),
        shoppingWeekdays,
        favoriteDishIds,
        customFavoriteNames: customNames,
        plan,
        extras: chosenExtras(),
      },
      pwa || calendar ? 'calendar' : 'demo',
    );
  };

  const notices = householdNotices(draft);
  const noticeLines = (notices.some((n) => n.text === SEVERE_TEXT) ? notices : [...notices, { level: 'info' as const, text: SEVERE_TEXT }]).map((n) =>
    pwa && n.text === SEVERE_TEXT ? { ...n, text: SEVERE_TEXT_PWA } : n,
  );

  return (
    <div className="onboarding">
      <header className="ob-head">
        <div className="ob-head-row">
          {/* 幅が狭くなって左の案内が隠れたときの、フォーカスの行き先（tabindex=-1）。 */}
          <h1 className="ob-title" tabIndex={-1} ref={titleRef}>
            はじめの設定
          </h1>
          {onCancel ? (
            <button type="button" className="text-btn" onClick={onCancel}>
              やめて戻る
            </button>
          ) : null}
        </div>
        <ol className="stepper" aria-label="設定の順番">
          {STEPS.map((s, i) => (
            <li key={s} className={cls(i === step && 'is-current', i < step && 'is-done')} aria-current={i === step ? 'step' : undefined}>
              <span className="step-no num">{i + 1}</span>
              {/* 狭い幅では「と」のあとで折り返す（「食事と／買い物」）。 */}
              <span className="step-name">
                {s.split('と').map((part, k) => (
                  <Fragment key={k}>
                    {k > 0 ? (
                      <>
                        と<wbr />
                      </>
                    ) : null}
                    {part}
                  </Fragment>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </header>

      <div className="ob-body">
        {demo ? (
          <div className="demo-start">
            <p>すぐに試すなら、デモの家族（大人2人、小学生1人、幼児1人。小学生の子が卵アレルギー）で始められます。</p>
            {demoConfirm ? (
              <div
                className="confirm"
                role="group"
                aria-label="デモの家族で始め直すかの確認"
                aria-describedby="demo-confirm-text"
                tabIndex={-1}
                ref={demoConfirmRef}
              >
                <p id="demo-confirm-text">今の家族と記録は消えて、デモの家族で始め直します。元には戻せません。</p>
                <div className="row-actions">
                  <button type="button" className="btn btn--danger" onClick={onDemo}>
                    デモで始め直す
                  </button>
                  <button type="button" className="btn" onClick={() => setDemoConfirm(false)}>
                    やめる
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn" ref={demoButtonRef} onClick={() => (replaces ? setDemoConfirm(true) : onDemo?.())}>
                デモの家族で始める
              </button>
            )}
          </div>
        ) : null}

        {step === 0 ? (
          <section className="ob-step" aria-labelledby="ob-family">
            <h2 className="ob-step-title" id="ob-family">
              ① 家族を教えてください
            </h2>
            <p className="field-note">いっしょに夕食を食べる人です（最大{MAX_MEMBERS}人）。アレルギーや食べない物があれば、除外に入れてください。</p>
            <ul className="members">
              {members.map((m, i) =>
                editing === i ? (
                  <li key={i} className="member-card is-editing">
                    <MemberEditor
                      idPrefix={`ob-${i}`}
                      value={m}
                      catalog={catalog}
                      pwa={pwa}
                      onChange={(v) => setMembers(members.map((x, k) => (k === i ? v : x)))}
                    />
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => {
                          if (!m.nickname.trim()) {
                            setError('ニックネームを入れてください。');
                            return;
                          }
                          setError(null);
                          setEditing(null);
                        }}
                      >
                        できた
                      </button>
                      {members.length > 1 ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setMembers(members.filter((_, k) => k !== i));
                            setEditing(null);
                          }}
                        >
                          外す
                        </button>
                      ) : null}
                    </div>
                  </li>
                ) : (
                  <li key={i} className="member-card">
                    <div className="member-main">
                      <span className="member-name">{m.nickname || '（名前なし）'}</span>
                      <span className="member-sub">{memberLine(m)}</span>
                      <span className="member-ex">{exclusionLine(m, catalog)}</span>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="btn btn--small" disabled={editing !== null} onClick={() => setEditing(i)}>
                        <Icon name="edit" size={16} />
                        直す
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
            {editing === null ? (
              <button
                type="button"
                className="btn"
                disabled={members.length >= MAX_MEMBERS}
                onClick={() => {
                  setMembers([...members, emptyMemberDraft(members.length)]);
                  setEditing(members.length);
                }}
              >
                <Icon name="plus" size={18} />
                家族を加える
              </button>
            ) : null}
          </section>
        ) : null}

        {step === 1 ? (
          <section className="ob-step" aria-labelledby="ob-shop">
            <h2 className="ob-step-title" id="ob-shop">
              ② 食事と買い物
            </h2>
            <div className="block">
              <h3 className="block-title" id="ob-meals">
                どの食事を決めますか？
              </h3>
              <p className="field-note">夕食のほかに、お弁当や朝ごはんも決められます。あとから「家族と設定」で変えられます。</p>
              <MealsFields
                idPrefix="ob"
                labelledBy="ob-meals"
                value={mealsValue}
                onChange={(patch) => setMealsValue((v) => ({ ...v, ...patch }))}
              />
            </div>
            <div className="block">
              <h3 className="block-title" id="ob-pace">
                買い物は？
              </h3>
              <p className="field-note">何日分をまとめて買いますか。献立の材料を、買い物の日ごとのリストにまとめます。</p>
              <ShoppingPaceFields
                idPrefix="ob"
                labelledBy="ob-pace"
                shoppingWeekdays={shoppingWeekdays}
                dinnerWeekdays={DINNER_WEEKDAYS}
                min={0}
                onChange={(next) => {
                  setShoppingWeekdays(next);
                  if (next.length > 0) setError(null);
                }}
              />
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="ob-step" aria-labelledby="ob-fav">
            <h2 className="ob-step-title" id="ob-fav">
              ③ 好みと定番
            </h2>
            <div className="block">
              <h3 className="block-title" id="ob-cuisine">
                国の料理
              </h3>
              <p className="field-note">どの国の料理を、どのくらい献立に出しますか。{CUISINE_NOTE}</p>
              <CuisineRows idPrefix="ob" value={cuisines} onChange={(genre, level) => setCuisines((c) => ({ ...c, [genre]: level }))} />
            </div>
            <div className="block">
              <h3 className="block-title" id="ob-spice">
                辛さ
              </h3>
              <RadioSeg name="ob-spice" labelledBy="ob-spice" options={SPICE_OPTIONS} value={spice} onChange={setSpice} />
              <p className="field-note">{SPICE_NOTE}</p>
            </div>
            <div className="block">
              <h3 className="block-title" id="ob-fav-list">
                うちの定番を選んでください
              </h3>
              <p className="field-note">ふだん作っている料理です。主菜を中心に、5品以上選ぶと献立が組みやすくなります。マスタにない料理は名前だけで加えられます。</p>
              <DishPicker
                catalog={catalog}
                household={draft}
                selectedIds={favoriteDishIds}
                customNames={customNames}
                onChange={(ids, names) => {
                  setFavoriteDishIds(ids);
                  setCustomNames(names);
                }}
              />
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="ob-step" aria-labelledby="ob-money">
            <h2 className="ob-step-title" id="ob-money">
              ④ 予算とプラン
            </h2>
            <div className="block">
              <h3 className="block-title" id="ob-budget">
                1週間の食費の目安
              </h3>
              <p className="field-note">選ぶと、目安に近い献立にします。決めなくても始められます。{PRICE_NOTE}</p>
              <BudgetPicker
                idPrefix="ob"
                labelledBy="ob-budget"
                value={budget}
                live
                onChange={(yen) => {
                  setBudget(yen);
                  setBudgetTouched(true);
                }}
              />
            </div>
            <div className="block">
              <h3 className="block-title" id="ob-plan">
                無料と有料、どちらで試しますか？
              </h3>
              <p className="field-note">{PLAN_NOTE[pwa ? 'pwa' : 'web']}</p>
              <PlanPicker name="ob-plan" value={plan} onChange={setPlan} />
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="ob-step" aria-labelledby="ob-confirm">
            <h2 className="ob-step-title" id="ob-confirm">
              この内容で始めます
            </h2>
            <dl className="confirm-list">
              <div>
                <dt>家族</dt>
                <dd>
                  {members.map((m) => (
                    <span key={m.nickname} className="confirm-member">
                      {m.nickname}（{memberLine(m)}）{m.exclusions.length > 0 ? ` ${exclusionLine(m, catalog)}` : ''}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>食事</dt>
                <dd>{mealsSummary(mealsValue)}</dd>
              </div>
              <div>
                <dt>買い物</dt>
                <dd className="num">{shoppingSummary(shoppingWeekdays, DINNER_WEEKDAYS)}</dd>
              </div>
              <div>
                <dt>国の料理</dt>
                <dd>
                  {cuisineSummary(cuisines).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>辛さ</dt>
                <dd>{SPICE_LABEL[spice]}</dd>
              </div>
              <div>
                <dt>定番</dt>
                <dd className="num">{favoriteDishIds.length + customNames.length}品</dd>
              </div>
              <div>
                <dt>予算</dt>
                <dd className="num">{budget === null ? '目安なし' : `1週間 ${budgetText(budget)}`}</dd>
              </div>
              <div>
                <dt>プラン</dt>
                <dd>{PLAN_INFO.find((p) => p.id === plan)?.title}</dd>
              </div>
            </dl>
            {/* 行のどこを押しても切り替わるように、行全体を label にする（家族と設定の「要確認の料理も出す」と同じ）。
                ホーム画面に置く版（本番）は、いつも本物の日付で進めるので、選ばせない。 */}
            {pwa ? null : (
              <label className="toggle-row trial-clock" htmlFor="ob-calendar">
                <input id="ob-calendar" type="checkbox" checked={calendar} onChange={(e) => setCalendar(e.target.checked)} />
                <span>
                  <span className="setting-name">本物の日付で進める（1週間の試用）</span>
                  <span className="field-note">印を外すと、画面の［翌日へ進む］で日付を進めるデモになります。</span>
                </span>
              </label>
            )}
            <div className="ob-notices" role="note" aria-label="始める前の注意">
              <p className="warn-label">
                <Icon name="alert" size={16} />
                始める前に読んでください
              </p>
              <ul>
                {replaces ? <li key="replace">{REPLACE_TEXT}</li> : null}
                {noticeLines.map((n) => (
                  <li key={n.text}>{n.text}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="ob-foot">
        <button type="button" className="btn" disabled={step === 0} onClick={() => { setError(null); setStep((s) => Math.max(0, s - 1)); }}>
          戻る
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn--primary" onClick={next}>
            次へ
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={start}>
            この内容で始める
          </button>
        )}
      </footer>
    </div>
  );
}
