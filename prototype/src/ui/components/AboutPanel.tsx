// 案内パネル「このプロトタイプについて」。PC では左に、スマホでは「?」で開く。
import { useEffect, useRef } from 'react';
import type { AppTarget } from '../../pwa';
import type { AiMode, AiStatus } from '../ai';
import { RULES_ONLY_TEXT } from '../ai';
import type { ClockMode } from '../storage';
import { aiStatusText } from './HouseholdSheet';
import { Icon } from './Icon';

/**
 * 試してほしいこと。文は、デモの家族での実際の返事に合わせる（エンジンの動きが変わったら直す）。
 * 本物の日付で進める（試用）ときは［翌日へ進む］がないので、日付を進める2つは「次の日」の言い方にする。
 */
function tryThese(clock: ClockMode): { action: string; result: string }[] {
  const calendar = clock === 'calendar';
  return [
    { action: '「今日は無理」と送る', result: '今日がラク日になり、元の料理は後ろの日に回ります。' },
    { action: '「鶏むねが安い」と送る', result: '鶏肉の日（なければほかの肉の日）を、鶏むねを使う料理に替える提案をします。' },
    { action: '「水曜は夫が飲み会」と送る', result: '水曜の人数が減り、買い物リストの量も直ります。' },
    { action: calendar ? '次の日に［作った］→ ◎○△' : '［翌日へ進む］→［作った］→ ◎○△', result: '家族の反応が、次の週の献立に効きます。' },
    { action: '買い物リストでチェックする', result: '買った物は在庫として覚えます。' },
    { action: calendar ? '有料に切り替えて、次の日を待つ' : '有料に切り替えて［翌日へ進む］', result: '「今日はこれ」などの配信のメッセージが届きます。' },
  ];
}

/** AI の読み取りの説明（「家族と設定」の AI の読み取りの設定に合わせる）。 */
function aiModeText(mode: AiMode): string {
  const privacy = '家族の名前は送らず、「member_1」のような番号に置き換えます。';
  switch (mode) {
    case 'always':
      return `書き込みは、claude.ai で開いているときは、毎回 Claude に読み取りを頼みます（見ている人の Claude の利用枠を使います）。${privacy}`;
    case 'off':
      return '書き込みは、AI を使わずにルールだけで読み取ります（「家族と設定」で変えられます）。';
    default:
      return `書き込みは、ふだんはルールで読み取ります。claude.ai で開いているときは、ルールで読めない書き込みだけ Claude に読み取りを頼みます（見ている人の Claude の利用枠を使います）。${privacy}`;
  }
}

/**
 * 案内の文のうち、ホーム画面に置く版（pwa）で言い方を変えるもの。claude.ai やブラウザのタブの中でしか合わない言い方
 * （「ブラウザだけで再現」「このブラウザの中だけに保存」）を、この端末・このアプリの言い方にする。
 */
export const ABOUT_TEXT = {
  scope: {
    web: 'LINE のグループで使う想定のトーク画面（試作）と、今週の献立・買い物リスト・家族と設定の画面を、ブラウザだけで再現しています。はじめは、デモの家族（大人2人、小学生1人、幼児1人。小学生の子が卵アレルギー）で動きます。',
    pwa: 'LINE のグループで使う想定のトーク画面（試作）と、今週の献立・買い物リスト・家族と設定の画面を、この端末の中だけで動かしています。デモの家族（大人2人、小学生1人、幼児1人。小学生の子が卵アレルギー）で試すこともできます。',
  },
  storageCalendar: {
    web: '状態はこのブラウザの中だけに保存します。日付は、本物の日付（日本時間）に合わせて進みます。',
    pwa: '家族と記録は、この端末のこのアプリの中だけに保存します。日付は、本物の日付（日本時間）に合わせて進みます。',
  },
  storageDemo: {
    web: '状態はこのブラウザの中だけに保存します。日付は［翌日へ進む］で動かします。',
    pwa: '家族と記録は、この端末のこのアプリの中だけに保存します。日付は［翌日へ進む］で動かします。',
  },
} as const;

export function AboutPanel({
  aiStatus,
  aiMode = 'auto',
  clock = 'demo',
  target = 'web',
  onStartOver,
  onClose,
}: {
  aiStatus: AiStatus;
  aiMode?: AiMode;
  /** 日付の進め方（本物の日付で進めるときは、［翌日へ進む］の案内を出さない）。 */
  clock?: ClockMode;
  /** アプリの版。'pwa'（ホーム画面に置く版）は AI を使わず、記録はこの端末のこのアプリの中だけ。 */
  target?: AppTarget;
  onStartOver: () => void;
  onClose?: () => void;
}) {
  const pwa = target === 'pwa';
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="about">
      <div className="about-head">
        <p className="about-kicker">試作・きめとく（仮）</p>
        {/* 左に出す案内の見出しは、幅が広がって重ねた案内が閉じたときのフォーカスの行き先（tabindex=-1）。 */}
        <h2 className="about-title" id={onClose ? 'about-overlay-title' : 'about-title'} tabIndex={onClose ? undefined : -1}>
          このプロトタイプについて
        </h2>
        {onClose ? (
          <button type="button" ref={closeRef} className="icon-btn about-close" aria-label="閉じる" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        ) : null}
      </div>
      <p>
        家族の平日の夕食と買い物リストを、買い物の日に合わせて先に決めておく「献立当番」の試作です。何もしなければそのまま確定し、予定が崩れたら1タップで組み直します。
      </p>
      <p>{pwa ? ABOUT_TEXT.scope.pwa : ABOUT_TEXT.scope.web}</p>

      <h3 className="about-sub">試してほしいこと</h3>
      <ul className="try-list">
        <li className="try-start">
          <span className="try-action">自分の家族で始めてみる</span>
          <span className="try-result">家族・買い物の曜日・定番の料理を答えると、すぐに献立ができます。</span>
          <span className="try-button">
            <button type="button" className="btn btn--small" onClick={onStartOver}>
              はじめから設定する
            </button>
          </span>
        </li>
        {tryThese(clock).map((t) => (
          <li key={t.action}>
            <span className="try-action">{t.action}</span>
            <span className="try-result">{t.result}</span>
          </li>
        ))}
      </ul>
      {/* デモの家族（小学生の子が卵アレルギー）での動きの説明。本物の日付で試す家族は自分の家族なので出さない。 */}
      {clock === 'calendar' ? null : (
        <p className="hint">
          「金曜はカレーがいい」は、アレルギーの判定を見る例です。卵アレルギーの家族がいるので、市販のルウ（銘柄で原材料が違います）を使うカレーライスは「要確認」として出さず、ルウを使わないキーマカレーを代わりに提案します。
        </p>
      )}

      <h3 className="about-sub">AI の読み取り</h3>
      {/* ホーム画面に置く版は AI を使わない（ルールだけ）。設定の説明や、使えるかの様子は出さない。 */}
      <p data-testid="about-ai-mode">{pwa ? RULES_ONLY_TEXT : aiModeText(aiMode)}</p>
      {pwa ? null : <p className="about-status">{aiStatusText(aiStatus)}</p>}

      <h3 className="about-sub">注意</h3>
      <ul className="about-notes">
        <li>アプリは除外の補助で、アレルギーの安全を保証するものではありません。重い食物アレルギーは対象外です。</li>
        <li>献立・分量・在庫は試作の計算です。消費期限を優先してください。</li>
        <li>{(clock === 'calendar' ? ABOUT_TEXT.storageCalendar : ABOUT_TEXT.storageDemo)[pwa ? 'pwa' : 'web']}</li>
      </ul>
    </div>
  );
}
