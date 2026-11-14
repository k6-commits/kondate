// 試用の集計ページ（主催者が使う）。家族から届いた「試用の記録」を貼り付けると、企画書 12章の続行の目安・北極星・家族ごとの表を出す。
// 数えるのは aggregate.ts（純粋関数）、共有する文は summary.ts。ここは画面だけ。
// 貼り付けた文・家族の名前・外した記録は、このブラウザの localStorage にだけ保存する（storage.ts。使えなくても動く）。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { TrialReport } from '../engine/index';
import type { Aggregate, Family, FamilyRow, StarLevel, Verdict } from './aggregate';
import {
  CLOCK_LABEL,
  COOKED_TARGET,
  STAR_GOAL,
  STAR_MINIMUM,
  THOUGHT_TARGET,
  VERDICT_LABEL,
  aggregate,
  checkinText,
  familyNoteParts,
  familyText,
  percent,
  percentText,
  periodText,
  reactionsText,
  readPaste,
} from './aggregate';
import { COUNT_RULE, NOT_MEASURABLE, UNKNOWN_RULE, familyStarText, starVerdictText, summaryText } from './summary';
import { SAMPLE_TEXT } from './sample';
import { isSampleKey } from './sampleKeys';
import type { StorageLike } from './storage';
import { MAX_NAME_LENGTH, loadSaved, saveSaved } from './storage';
import { formatJa } from '../engine/index';

// ---------------------------------------------------------------------------
// 小さな部品
// ---------------------------------------------------------------------------

function VerdictIcon({ verdict }: { verdict: Verdict }) {
  const path = verdict === 'reached' ? 'M3.5 8.5l3 3 6-7' : verdict === 'missed' ? 'M4.5 4.5l7 7M11.5 4.5l-7 7' : 'M6 6.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.3v.4M8 12h.01';
  return (
    <svg className="r-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 判定の印。狭い所では「まだ／分からない」「届いて／いない」の所でだけ折り返す（文字は VERDICT_LABEL のまま。何文字目で折るか）。 */
const VERDICT_BREAK: Record<Verdict, number> = { reached: 0, missed: 3, unknown: 2 };

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const label = VERDICT_LABEL[verdict];
  const at = VERDICT_BREAK[verdict];
  const head = at > 0 ? label.slice(0, at) : label;
  const tail = at > 0 ? label.slice(at) : '';
  return (
    <span className={`r-pill r-pill--${verdict}`}>
      <VerdictIcon verdict={verdict} />
      <span>
        {head}
        {tail ? (
          <>
            <wbr />
            {tail}
          </>
        ) : null}
      </span>
    </span>
  );
}

const LEVEL_TONE: Record<StarLevel, string> = { goal: 'reached', minimum: 'caution', below: 'missed', none: 'unknown' };

/** 北極星のメーター（数は横に文字で出すので、読み上げない）。50% と 80% に目盛り。 */
function Meter({ value, level, scale = false }: { value: number | null; level: StarLevel; scale?: boolean }) {
  return (
    <div className={`r-meter r-meter--${LEVEL_TONE[level]}${scale ? ' r-meter--big' : ''}`} aria-hidden="true">
      <div className="r-meter-bar">
        <div className="r-meter-track">
          <div className="r-meter-fill" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
        </div>
        <span className="r-meter-tick" style={{ left: `${STAR_MINIMUM}%` }} />
        <span className="r-meter-tick" style={{ left: `${STAR_GOAL}%` }} />
      </div>
      {scale ? (
        <div className="r-meter-scale">
          <span style={{ left: `${STAR_MINIMUM}%` }}>最低 {STAR_MINIMUM}%</span>
          <span style={{ left: `${STAR_GOAL}%` }}>目標 {STAR_GOAL}%</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 横にスクロールする表の入れ物。はみ出しているときだけ、キーボードで届くようにする（tabIndex と名前を付ける）。
 */
function ScrollBox({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className ? `r-scroll ${className}` : 'r-scroll'}
      {...(scrollable ? { tabIndex: 0, role: 'region', 'aria-label': `${label}（横にスクロールできます）` } : {})}
    >
      {children}
    </div>
  );
}

function FamilyName({ family, name }: { family: Pick<Family, 'label' | 'sample'>; name?: string }) {
  return (
    <>
      <span className="r-family-label">{family.label}</span>
      {name ? <span className="r-family-name">{name}</span> : null}
      {family.sample ? <span className="badge badge--note">見本</span> : null}
    </>
  );
}

/** 区切りの所でだけ折り返す文（「11/16(月)〜｜11/20(金)」「大人2・｜小学生1」）。表のセルを細くできるようにする。 */
function Breakable({ parts, sep = '' }: { parts: string[]; sep?: string }) {
  return (
    <>
      {parts.map((part, i) => (
        <span key={`${i}-${part}`}>
          {i > 0 ? <wbr /> : null}
          <span className="r-nowrap">
            {part}
            {i < parts.length - 1 ? sep : ''}
          </span>
        </span>
      ))}
    </>
  );
}

/** 日付の進め方（表では「カレンダー｜どおり」「［翌日へ｜進む］」で折り返せるようにする。文字は CLOCK_LABEL と同じ）。 */
const CLOCK_PARTS: Record<TrialReport['clock'], string[]> = {
  calendar: [CLOCK_LABEL.calendar.slice(0, 5), CLOCK_LABEL.calendar.slice(5)],
  demo: [CLOCK_LABEL.demo.slice(0, 4), CLOCK_LABEL.demo.slice(4)],
  unknown: [CLOCK_LABEL.unknown],
};

const periodParts = (r: TrialReport): string[] =>
  r.from && r.to && r.from !== r.to ? [`${formatJa(r.from)}〜`, formatJa(r.to)] : [periodText(r)];

// ---------------------------------------------------------------------------
// 出力の各部
// ---------------------------------------------------------------------------

function CriteriaSection({ agg }: { agg: Aggregate }) {
  const c = agg.criteria;
  return (
    <section className="r-section" aria-labelledby="criteria-title">
      <h2 className="r-title" id="criteria-title">
        続行の目安（企画書 12章）
      </h2>
      <ScrollBox label="続行の目安の表" className="r-scroll--criteria">
        <table className="r-table r-criteria" aria-labelledby="criteria-title">
          <thead>
            <tr>
              <th scope="col">目安</th>
              <th scope="col">今の値</th>
              <th scope="col" className="r-col-target">
                目標
              </th>
              <th scope="col">判定</th>
            </tr>
          </thead>
          <tbody>
            <tr data-row="cooked">
              <th scope="row">
                提案の{COOKED_TARGET}%以上を作る<span className="r-sub r-target-inline">目標：{COOKED_TARGET}%以上</span>
              </th>
              <td>
                <span className="r-big">{percentText(c.cooked.cooked, c.cooked.planned, 'down')}</span>
                <span className="r-sub">
                  作った {c.cooked.cooked}日／家で食べる献立の日 {c.cooked.planned}日
                </span>
              </td>
              <td className="r-nowrap r-col-target">{COOKED_TARGET}%以上</td>
              <td>
                <VerdictBadge verdict={c.cooked.verdict} />
              </td>
            </tr>
            <tr data-row="thought">
              <th scope="row">
                自分で考えた日が半分以下<span className="r-sub r-target-inline">目標：{THOUGHT_TARGET}%以下</span>
              </th>
              <td>
                <span className="r-big">{percentText(c.thought.thought, c.thought.planned, 'up')}</span>
                <span className="r-sub">
                  自分で考えた {c.thought.thought}日／聞いた日 {c.thought.planned}日
                </span>
                <span className="r-sub">
                  {c.thought.of}家族のうち {c.thought.answered}家族が答えました
                </span>
              </td>
              <td className="r-nowrap r-col-target">{THOUGHT_TARGET}%以下</td>
              <td>
                <VerdictBadge verdict={c.thought.verdict} />
              </td>
            </tr>
            <tr data-row="safety">
              <th scope="row">
                除外の違反 0件<span className="r-sub r-target-inline">目標：0件</span>
              </th>
              <td>
                <span className="r-big">{c.safety.violations}件</span>
                {c.safety.families.length > 0 ? <span className="r-sub">{c.safety.families.join('・')}</span> : null}
              </td>
              <td className="r-nowrap r-col-target">0件</td>
              <td>
                <VerdictBadge verdict={c.safety.verdict} />
              </td>
            </tr>
          </tbody>
        </table>
      </ScrollBox>
      <p className="r-text r-strong">{NOT_MEASURABLE}</p>
      <p className="r-fine">
        {UNKNOWN_RULE}
        {COUNT_RULE}
      </p>
      {agg.demo.length > 0 ? (
        <p className="r-callout" data-testid="demo-callout">
          ［翌日へ進む］で進めた記録（{agg.demo.join('・')}）も数に入っています。本物の日付で使った記録だけで見るときは、「読み取った記録」の［外す］で外してください。
        </p>
      ) : null}
    </section>
  );
}

function StarSection({ agg, names }: { agg: Aggregate; names: Record<string, string> }) {
  const star = agg.star;
  const value = percent(star.notThought, star.planned, 'down');
  return (
    <section className="r-section" aria-labelledby="star-title">
      <h2 className="r-title" id="star-title">
        北極星：考えずに済んだ夕食の割合
      </h2>
      <p className="r-text r-muted">
        週末の質問「今週、自分で考えた夕食は何日？」の答えから、1 − 自分で考えた日 ÷ 聞いた日 で出します。目標は {STAR_GOAL}%、最低ラインは {STAR_MINIMUM}% です。
      </p>
      <div className="r-star">
        <div className="r-star-top">
          <p className="r-star-label">全体</p>
          <p className="r-star-value" data-testid="star-value">
            {value === null ? '—' : `${value}%`}
          </p>
          <p className="r-star-detail">
            {star.level === 'none' ? 'まだ週末の質問の答えがありません' : `考えずに済んだ ${star.notThought}日／聞いた日 ${star.planned}日`}
          </p>
          <span className={`r-pill r-pill--${LEVEL_TONE[star.level]}`} data-testid="star-verdict">
            {starVerdictText(star)}
          </span>
        </div>
        <Meter value={value} level={star.level} scale />
      </div>
      <ul className="r-star-list" aria-label="家族ごとの、考えずに済んだ夕食の割合">
        {agg.rows.map((row) => (
          <li key={row.key} className="r-star-item">
            <div className="r-star-row">
              <span className="r-star-who">
                <FamilyName family={row} name={names[row.key]} />
              </span>
              <span className="r-num">{familyStarText(row)}</span>
            </div>
            <Meter value={percent(row.star.notThought, row.star.planned, 'down')} level={row.star.level} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FamilyTableRow({ row, name }: { row: FamilyRow; name?: string }) {
  const r = row.report;
  const d = r.days;
  return (
    <tr data-family={row.label}>
      <th scope="row">
        <FamilyName family={row} name={name} />
      </th>
      <td className="r-wrap">
        <Breakable parts={periodParts(r)} />
        <span className="r-sub">{formatJa(r.madeOn)}に作成</span>
      </td>
      <td className={r.clock === 'demo' ? 'r-wrap r-cell-warn' : 'r-wrap'}>
        <Breakable parts={CLOCK_PARTS[r.clock]} />
        {r.clock === 'demo' ? (
          <span className="r-sub">
            <Breakable parts={['本物の日付では', 'ありません']} />
          </span>
        ) : null}
      </td>
      <td className="r-wrap">
        <Breakable parts={familyText(r).split('・')} sep="・" />
        <span className="r-sub">
          <Breakable parts={familyNoteParts(r)} />
        </span>
      </td>
      <td className="r-num">{d.dinner}日</td>
      <td className="r-num r-wrap">
        <Breakable parts={[`${d.cooked}日`, `（${d.cookedAsPlanned}／${d.cookedChanged}）`]} />
      </td>
      <td className="r-num">{d.skipped}日</td>
      <td className={`r-num${row.manyUnconfirmed ? ' r-cell-warn' : ''}`}>
        {d.unconfirmed}日{row.manyUnconfirmed ? <span className="r-sub">多い</span> : null}
      </td>
      <td className="r-num">{d.everyoneOut}日</td>
      <td className="r-num">{d.todayImpossible}日</td>
      <td className="r-num r-wrap">
        <Breakable parts={checkinText(r).split('、')} sep="、" />
      </td>
      <td className="r-num r-wrap">
        <Breakable parts={reactionsText(r.reactions).split(' ')} sep=" " />
      </td>
      <td className={`r-num${r.safetyViolations > 0 ? ' r-cell-warn' : ''}`}>
        {r.safetyViolations}件
        {r.safetyViolationDays?.length ? <span className="r-sub">{r.safetyViolationDays.map(formatJa).join('・')}</span> : null}
      </td>
      <td className="r-num">
        {r.talk.unreadable}件
        <span className="r-sub">
          <Breakable parts={['書き込み', `${r.talk.messages}件`]} sep=" " />
        </span>
      </td>
    </tr>
  );
}

function FamiliesSection({ agg, names }: { agg: Aggregate; names: Record<string, string> }) {
  const t = agg.totals;
  const notes = agg.rows.flatMap((row) => row.flags.map((flag) => ({ row, flag })));
  return (
    <section className="r-section" aria-labelledby="families-title">
      <h2 className="r-title" id="families-title">
        家族ごとの表
      </h2>
      <p className="r-text r-muted">作った（そのまま／替えて）は、アプリの献立どおりに作った日と、替えてから作った日です。週末の答えは、自分で考えた日／聞いた日です。</p>
      <ScrollBox label="家族ごとの表">
        <table className="r-table r-families" aria-labelledby="families-title">
          <thead>
            <tr>
              <th scope="col">家族</th>
              <th scope="col">期間</th>
              <th scope="col">日付の進め方</th>
              <th scope="col">家族構成</th>
              <th scope="col">献立の日</th>
              <th scope="col">作った（そのまま／替えて）</th>
              <th scope="col">作らなかった</th>
              <th scope="col">記録なし</th>
              <th scope="col">みんな外食</th>
              <th scope="col">自分でラク日にした日</th>
              <th scope="col">週末の答え</th>
              <th scope="col">反応 ◎○△</th>
              <th scope="col">除外の違反</th>
              <th scope="col">読み取れなかった</th>
            </tr>
          </thead>
          <tbody>
            {agg.rows.map((row) => (
              <FamilyTableRow key={row.key} row={row} name={names[row.key]} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">合計</th>
              <td colSpan={3}>{agg.rows.length}家族</td>
              <td className="r-num">{t.dinner}日</td>
              <td className="r-num">
                {t.cooked}日（{t.cookedAsPlanned}／{t.cookedChanged}）
              </td>
              <td className="r-num">{t.skipped}日</td>
              <td className="r-num">{t.unconfirmed}日</td>
              <td className="r-num">{t.everyoneOut}日</td>
              <td className="r-num">{t.todayImpossible}日</td>
              <td className="r-num">{t.checkinPlanned > 0 ? `${t.thought}日／${t.checkinPlanned}日` : 'まだ'}</td>
              <td className="r-num">{reactionsText(t)}</td>
              <td className="r-num">{t.violations}件</td>
              <td className="r-num">
                {t.unreadable}件
                <span className="r-sub">
                  <Breakable parts={['書き込み', `${t.messages}件`]} sep=" " />
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </ScrollBox>
      {notes.length > 0 ? (
        <div className="r-notes">
          <h3 className="r-subtitle">気をつけること</h3>
          <ul className="r-flags">
            {notes.map(({ row, flag }) => (
              <li key={`${row.key}-${flag.kind}`} className={`r-flag r-flag--${flag.kind}`} data-flag={flag.kind}>
                <span className="r-flag-who">
                  <span className="r-nowrap">{row.label}</span>
                  {names[row.key] ? <span className="r-flag-name">{names[row.key]}</span> : null}
                </span>
                <span>{flag.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function UnreadableSection({ agg, names }: { agg: Aggregate; names: Record<string, string> }) {
  return (
    <section className="r-section" aria-labelledby="unreadable-title">
      <h2 className="r-title" id="unreadable-title">
        読み取れなかった書き込み
      </h2>
      <p className="r-text r-muted">
        読み取りを良くするために使います。文は、送る人が入れることを選んだ記録にだけ入っています（家族の呼び名は「〇〇」になっています）。
      </p>
      {agg.unreadable.length === 0 ? (
        <p className="r-text">ありません。</p>
      ) : (
        <ul className="r-unreadable">
          {agg.unreadable.map((g) => (
            <li key={g.key}>
              <p className="r-unreadable-head">
                {g.label}
                {names[g.key] ? `（${names[g.key]}）` : ''}：{g.count}件<span className="r-muted">（書き込み {g.messages}件のうち）</span>
              </p>
              {g.texts && g.texts.length > 0 ? (
                <ul className="r-quotes">
                  {g.texts.map((text, i) => (
                    <li key={`${i}-${text}`}>「{text}」</li>
                  ))}
                </ul>
              ) : (
                <p className="r-fine">文は入っていません。</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ShareSection({ agg, removed }: { agg: Aggregate; removed: string[] }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const text = useMemo(() => summaryText(agg, removed), [agg, removed]);

  // 集計が変わったら、前のコピーの知らせは消す（コピーできなかったときの文の欄は、今の集計の文を出し続ける）。
  const shown = useRef(text);
  useEffect(() => {
    if (shown.current === text) return;
    shown.current = text;
    setState((s) => (s === 'done' ? 'idle' : s));
  }, [text]);

  useEffect(() => {
    if (state !== 'failed' || !areaRef.current) return;
    try {
      areaRef.current.focus();
      areaRef.current.select();
    } catch {
      // 選べなくても、案内は出ている。
    }
  }, [state]);

  const copy = () => {
    const fail = () => setState('failed');
    try {
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clip || typeof clip.writeText !== 'function') {
        fail();
        return;
      }
      clip.writeText(text).then(() => setState('done'), fail);
    } catch {
      fail();
    }
  };

  return (
    <section className="r-section" aria-labelledby="share-title">
      <h2 className="r-title" id="share-title">
        チームに共有する
      </h2>
      <p className="r-text r-muted">続行の目安・北極星・家族ごとの数を、文にしてコピーします。家族につけた名前は入れず、家族A・家族B…で書きます。</p>
      <div className="r-share">
        <button type="button" className="btn btn--primary" onClick={copy}>
          集計を文にしてコピー
        </button>
        <p className="r-status" role="status">
          {state === 'done'
            ? 'コピーしました。チームのチャットなどに貼り付けてください。'
            : state === 'failed'
              ? 'コピーできませんでした。下の文を選んで、コピーしてください。'
              : ''}
        </p>
      </div>
      {state === 'failed' ? (
        <div className="r-fallback">
          <label className="field-label" htmlFor="summary-text">
            集計の文
          </label>
          <textarea id="summary-text" ref={areaRef} className="code-area r-summary-area" readOnly rows={12} value={text} />
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ページ
// ---------------------------------------------------------------------------

export function ReportPage({ storage }: { storage: StorageLike | null }) {
  const [initial] = useState(() => loadSaved(storage));
  const [text, setText] = useState(initial.text);
  const [names, setNames] = useState<Record<string, string>>(initial.names);
  const [removed, setRemoved] = useState<string[]>(initial.removed);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(storage !== null);
  const focusNext = useRef<string | null>(null);

  const reading = useMemo(() => readPaste(text, isSampleKey), [text]);
  const removedSet = useMemo(() => new Set(removed), [removed]);
  const included = useMemo(() => reading.families.filter((f) => !removedSet.has(f.key)), [reading, removedSet]);
  const excluded = useMemo(() => reading.families.filter((f) => removedSet.has(f.key)), [reading, removedSet]);
  const agg = useMemo(() => aggregate(included), [included]);
  const removedLabels = useMemo(() => excluded.map((f) => f.label), [excluded]);
  const hasSample = reading.families.some((f) => f.sample);

  useEffect(() => {
    setSaved(saveSaved(storage, { text, names, removed }));
  }, [storage, text, names, removed]);

  // 外す・戻す・すべて消すのあと、押したボタンの代わりになる所へフォーカスを移す。
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = null;
    document.getElementById(id)?.focus();
  });

  const changeText = (next: string) => {
    setText(next);
    setNotice('');
  };

  const remove = (f: Family) => {
    setRemoved((prev) => (prev.includes(f.key) ? prev : [...prev, f.key]));
    setNotice(`${f.label}を外しました。数には入れません。`);
    focusNext.current = `restore-${f.key}`;
  };

  const restore = (f: Family) => {
    setRemoved((prev) => prev.filter((k) => k !== f.key));
    setNotice(`${f.label}を戻しました。`);
    focusNext.current = `remove-${f.key}`;
  };

  const clearAll = () => {
    setText('');
    setNames({});
    setRemoved([]);
    setConfirming(false);
    setNotice('すべて消しました。');
    focusNext.current = 'paste';
  };

  const removeSample = () => {
    const sampleFamilies = reading.families.filter((f) => f.sample);
    if (text.includes(SAMPLE_TEXT)) {
      const rest = text.replace(SAMPLE_TEXT, '');
      setText(rest.trim() === '' ? '' : rest.replace(/^\s*\n/, ''));
      setRemoved((prev) => prev.filter((k) => !isSampleKey(k)));
    } else {
      // 見本の文を書き換えたときは、文はそのままにして、見本の記録を外す。
      setRemoved((prev) => [...new Set([...prev, ...sampleFamilies.map((f) => f.key)])]);
    }
    setNames((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !isSampleKey(k))));
    setNotice('見本を消しました。');
    focusNext.current = 'paste';
  };

  const status = (() => {
    if (notice) return notice;
    if (reading.noMarker) return '記録が見つかりませんでした。「きめとく試用データ:」で始まる行も、いっしょに貼り付けてください。';
    if (reading.families.length === 0) return '';
    const parts = [`${reading.families.length}家族分の記録を読みました。`];
    if (excluded.length > 0) parts.push(`そのうち ${excluded.length}家族は外しています。`);
    if (reading.duplicates > 0) parts.push(`同じ記録が重なっていたので、1つとして数えています（${reading.duplicates}件）。`);
    return parts.join('');
  })();

  const canClear = text !== '' || Object.keys(names).length > 0 || removed.length > 0;

  return (
    <main className="r-page">
      <div className="r-paper">
        <header className="r-head">
          <p className="r-kicker">きめとく</p>
          <h1 className="r-h1">試用の集計</h1>
          <p className="r-lead">
            試用した家族から届いた「試用の記録」を貼り付けると、続けるかどうかの目安（企画書 12章）と、家族ごとの数をまとめます。
          </p>
          <p className="r-fine">
            {saved
              ? '貼り付けた文と、家族につけた名前は、このブラウザの中だけに保存します。ほかの人には届きません。'
              : 'このブラウザには保存できません。ページを閉じると、貼り付けた文と名前は消えます。'}
          </p>
        </header>

        <section className="r-section" aria-labelledby="paste-title">
          <h2 className="r-title" id="paste-title">
            記録を貼り付ける
          </h2>
          <label className="field-label" htmlFor="paste">
            家族から届いた試用の記録を、まとめて貼り付けてください
          </label>
          <p className="r-text r-muted" id="paste-note">
            何家族分を続けて貼ってもかまいません。あいさつなどの文が混ざっていても、記録だけを読みます。最後の「きめとく試用データ:」で始まる行まで、そのまま貼ってください。
          </p>
          <textarea
            id="paste"
            className="r-paste"
            rows={8}
            value={text}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="paste-note"
            onChange={(e) => changeText(e.target.value)}
          />
          <p className="r-status" role="status" data-testid="paste-status">
            {status}
          </p>

          {reading.errors.length > 0 ? (
            <div className="r-errors" data-testid="paste-errors">
              <p className="r-errors-title">読めなかった記録があります（{reading.errors.length}件）</p>
              <ul>
                {reading.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <p className="r-fine">途中で切れているときは、その家族に、記録をもう一度送ってもらってください。</p>
            </div>
          ) : null}

          {included.length > 0 ? (
            <div className="r-block">
              <h3 className="r-subtitle">読み取った記録</h3>
              <p className="r-text r-muted">名前は、見分けるためのメモです。このブラウザの中だけに保存し、共有する文には入れません。</p>
              <ul className="r-family-list">
                {included.map((f) => (
                  <li key={f.key} className="r-family-item" data-family={f.label}>
                    <div className="r-family-head">
                      <FamilyName family={f} />
                      <span className="r-family-meta">
                        {periodText(f.report)}・{familyText(f.report)}
                      </span>
                    </div>
                    <div className="r-family-controls">
                      <label className="sr-only" htmlFor={`name-${f.key}`}>
                        {f.label}の名前
                      </label>
                      <input
                        id={`name-${f.key}`}
                        className="text-input"
                        type="text"
                        maxLength={MAX_NAME_LENGTH}
                        placeholder="名前（任意）"
                        autoComplete="off"
                        value={names[f.key] ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setNames((prev) => {
                            const next = { ...prev };
                            if (value === '') delete next[f.key];
                            else next[f.key] = value;
                            return next;
                          });
                        }}
                      />
                      <button type="button" className="btn btn--small" id={`remove-${f.key}`} aria-label={`${f.label}を外す`} onClick={() => remove(f)}>
                        外す
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {excluded.length > 0 ? (
            <div className="r-block">
              <h3 className="r-subtitle">外した記録（数に入れていません）</h3>
              <ul className="r-family-list">
                {excluded.map((f) => (
                  <li key={f.key} className="r-family-item r-family-item--out" data-family={f.label}>
                    <div className="r-family-head">
                      <FamilyName family={f} name={names[f.key]} />
                      <span className="r-family-meta">
                        {periodText(f.report)}・{familyText(f.report)}
                      </span>
                    </div>
                    <div className="r-family-controls r-family-controls--end">
                      <button type="button" className="btn btn--small" id={`restore-${f.key}`} aria-label={`${f.label}を戻す`} onClick={() => restore(f)}>
                        戻す
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canClear ? (
            confirming ? (
              <div className="confirm r-confirm" role="group" aria-labelledby="clear-question">
                <p id="clear-question">貼り付けた記録と、家族につけた名前を、すべて消します。元には戻せません。</p>
                <div className="r-buttons">
                  <button type="button" className="btn btn--danger" id="clear-yes" onClick={clearAll}>
                    すべて消す
                  </button>
                  <button
                    type="button"
                    className="btn"
                    id="clear-no"
                    onClick={() => {
                      setConfirming(false);
                      focusNext.current = 'clear';
                    }}
                  >
                    やめる
                  </button>
                </div>
              </div>
            ) : (
              <div className="r-buttons">
                <button
                  type="button"
                  className="btn btn--small"
                  id="clear"
                  onClick={() => {
                    setConfirming(true);
                    focusNext.current = 'clear-no';
                  }}
                >
                  すべて消す
                </button>
              </div>
            )
          ) : null}
        </section>

        {hasSample ? (
          <div className="r-banner" role="note" data-testid="sample-banner">
            <p>見本の記録が入っています。本物の記録を集計する前に、見本を消してください。</p>
            <button type="button" className="btn btn--small" onClick={removeSample}>
              見本を消す
            </button>
          </div>
        ) : null}

        {agg.rows.length === 0 ? (
          <section className="r-section" aria-labelledby="empty-title">
            <h2 className="r-title" id="empty-title">
              集計
            </h2>
            <div className="r-empty">
              {reading.families.length > 0 ? (
                <p>数に入れる記録がありません。外した記録を［戻す］と、ここに出ます。</p>
              ) : text.trim() !== '' ? (
                <p>読める記録がまだありません。上の欄の案内を見てください。</p>
              ) : (
                <>
                  <p>記録を貼り付けると、ここに続行の目安・北極星・家族ごとの表が出ます。</p>
                  <p className="r-muted">まだ記録が届いていないときは、見本で画面を試せます。</p>
                  <button type="button" className="btn btn--small" onClick={() => changeText(SAMPLE_TEXT)}>
                    見本を入れてみる
                  </button>
                </>
              )}
            </div>
          </section>
        ) : (
          <>
            <CriteriaSection agg={agg} />
            <StarSection agg={agg} names={names} />
            <FamiliesSection agg={agg} names={names} />
            <UnreadableSection agg={agg} names={names} />
            <ShareSection agg={agg} removed={removedLabels} />
          </>
        )}
      </div>
    </main>
  );
}
