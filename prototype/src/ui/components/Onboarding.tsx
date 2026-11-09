// 初回設定（DESIGN.md 4章の①〜④）。最後に注意を見せてから始める。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog, Household, ISODate, OnboardingInput, Weekday } from '../../engine';
import { WEEKDAY_JA, householdNotices } from '../../engine';
import { cls, normalizeForSearch } from '../lib';
import type { MemberDraft } from './Forms';
import { DishPicker, MemberEditor, PLAN_INFO, PlanPicker, WeekdayPicker, emptyMemberDraft, exclusionSummary, memberLine } from './Forms';
import { Icon } from './Icon';

const STEPS = ['家族', '買い物の日', '定番', 'プラン', '確認'] as const;
const MAX_MEMBERS = 6;
const SEVERE_TEXT = '重い食物アレルギー（アナフィラキシーの経験など）は、このプロトタイプの対象外です。医師の指示を優先してください';
/** 今の状態から開いたとき（onCancel があるとき）の、置き換えの注意。 */
const REPLACE_TEXT = '今の家族と記録は、この内容で置き換わります。元には戻せません。';

export function Onboarding({
  catalog,
  today,
  onStart,
  onDemo,
  onCancel,
}: {
  catalog: Catalog;
  today: ISODate;
  onStart: (input: OnboardingInput) => void;
  onDemo: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
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
  const [shoppingWeekdays, setShoppingWeekdays] = useState<Weekday[]>([0, 3]);
  const [favoriteDishIds, setFavoriteDishIds] = useState<string[]>([]);
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [plan, setPlan] = useState<'free' | 'paid'>('free');
  const [error, setError] = useState<string | null>(null);

  // 除外の印と注意のための、入力中の世帯。
  const draft: Household = useMemo(
    () => ({
      id: 'draft',
      members: members.map((m, i) => ({ ...m, nickname: m.nickname.trim() || `家族${i + 1}`, id: `member_${i + 1}` })),
      favorites: [],
      customDishes: [],
      settings: {
        plan,
        dinnerWeekdays: [1, 2, 3, 4, 5],
        shoppingWeekdays,
        rakuPerWeek: 1,
        newPerWeek: 1,
        sidePolicy: 'side_or_soup',
        maxMinutes: {},
        allowUncertainWithExclusions: false,
      },
      createdAt: today,
    }),
    [members, plan, shoppingWeekdays, today],
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

  const start = () => {
    const problem = checkFamily();
    if (problem) {
      setError(problem);
      setStep(0);
      return;
    }
    onStart({
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
    });
  };

  const notices = householdNotices(draft);
  const noticeLines = notices.some((n) => n.text === SEVERE_TEXT) ? notices : [...notices, { level: 'info' as const, text: SEVERE_TEXT }];

  return (
    <div className="onboarding">
      <header className="ob-head">
        <div className="ob-head-row">
          <h1 className="ob-title">はじめの設定</h1>
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
              <span className="step-name">{s}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className="ob-body">
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
            <button type="button" className="btn" ref={demoButtonRef} onClick={() => (onCancel ? setDemoConfirm(true) : onDemo())}>
              デモの家族で始める
            </button>
          )}
        </div>

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
                      <span className="member-ex">{exclusionSummary(m.exclusions, catalog)}</span>
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
              ② 買い物に行く曜日は？
            </h2>
            <p className="field-note">複数選べます。献立の材料を、その日に買う物としてまとめます。</p>
            <WeekdayPicker label="買い物の曜日" value={shoppingWeekdays} onChange={setShoppingWeekdays} min={0} />
            <p className="hint num">
              {shoppingWeekdays.length > 0 ? `${shoppingWeekdays.map((w) => WEEKDAY_JA[w]).join('・')}に買い物` : 'まだ選んでいません'}
            </p>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="ob-step" aria-labelledby="ob-fav">
            <h2 className="ob-step-title" id="ob-fav">
              ③ うちの定番を選んでください
            </h2>
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
          </section>
        ) : null}

        {step === 3 ? (
          <section className="ob-step" aria-labelledby="ob-plan">
            <h2 className="ob-step-title" id="ob-plan">
              ④ 無料と有料、どちらで試しますか？
            </h2>
            <p className="field-note">試作なので、本物の課金はありません。あとから「家族と設定」で変えられます。</p>
            <PlanPicker name="ob-plan" value={plan} onChange={setPlan} />
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
                      {m.nickname}（{memberLine(m)}）{m.exclusions.length > 0 ? ` ${exclusionSummary(m.exclusions, catalog)}` : ''}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>買い物の曜日</dt>
                <dd>{shoppingWeekdays.length > 0 ? shoppingWeekdays.map((w) => WEEKDAY_JA[w]).join('・') : 'なし（献立の日に買う）'}</dd>
              </div>
              <div>
                <dt>定番</dt>
                <dd className="num">{favoriteDishIds.length + customNames.length}品</dd>
              </div>
              <div>
                <dt>プラン</dt>
                <dd>{PLAN_INFO.find((p) => p.id === plan)?.title}</dd>
              </div>
            </dl>
            <div className="ob-notices" role="note" aria-label="始める前の注意">
              <p className="warn-label">
                <Icon name="alert" size={16} />
                始める前に読んでください
              </p>
              <ul>
                {onCancel ? <li key="replace">{REPLACE_TEXT}</li> : null}
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
