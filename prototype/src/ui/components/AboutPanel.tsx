// 案内パネル「このプロトタイプについて」。PC では左に、スマホでは「?」で開く。
import { useEffect, useRef } from 'react';
import type { AiMode, AiStatus } from '../ai';
import { aiStatusText } from './HouseholdSheet';
import { Icon } from './Icon';

/** 試してほしいこと。文は、デモの家族での実際の返事に合わせる（エンジンの動きが変わったら直す）。 */
const TRY_THESE: { action: string; result: string }[] = [
  { action: '「今日は無理」と送る', result: '今日がラク日になり、元の料理は後ろの日に回ります。' },
  { action: '「鶏むねが安い」と送る', result: '鶏肉の日（なければほかの肉の日）を、鶏むねを使う料理に替える提案をします。' },
  { action: '「水曜は夫が飲み会」と送る', result: '水曜の人数が減り、買い物リストの量も直ります。' },
  { action: '［翌日へ進む］→［作った］→ ◎○△', result: '家族の反応が、次の週の献立に効きます。' },
  { action: '買い物リストでチェックする', result: '買った物は在庫として覚えます。' },
  { action: '有料に切り替えて［翌日へ進む］', result: '「今日はこれ」などの配信のメッセージが届きます。' },
];

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

export function AboutPanel({
  aiStatus,
  aiMode = 'auto',
  onStartOver,
  onClose,
}: {
  aiStatus: AiStatus;
  aiMode?: AiMode;
  onStartOver: () => void;
  onClose?: () => void;
}) {
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
      <p>
        LINE のグループで使う想定のトーク画面（試作）と、今週の献立・買い物リスト・家族と設定の画面を、ブラウザだけで再現しています。はじめは、デモの家族（大人2人、小学生1人、幼児1人。小学生の子が卵アレルギー）で動きます。
      </p>

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
        {TRY_THESE.map((t) => (
          <li key={t.action}>
            <span className="try-action">{t.action}</span>
            <span className="try-result">{t.result}</span>
          </li>
        ))}
      </ul>
      <p className="hint">
        「金曜はカレーがいい」は、アレルギーの判定を見る例です。卵アレルギーの家族がいるので、市販のルウ（銘柄で原材料が違います）を使うカレーライスは「要確認」として出さず、ルウを使わないキーマカレーを代わりに提案します。
      </p>

      <h3 className="about-sub">AI の読み取り</h3>
      <p data-testid="about-ai-mode">{aiModeText(aiMode)}</p>
      <p className="about-status">{aiStatusText(aiStatus)}</p>

      <h3 className="about-sub">注意</h3>
      <ul className="about-notes">
        <li>アプリは除外の補助で、アレルギーの安全を保証するものではありません。重い食物アレルギーは対象外です。</li>
        <li>献立・分量・在庫は試作の計算です。消費期限を優先してください。</li>
        <li>状態はこのブラウザの中だけに保存します。日付は［翌日へ進む］で動かします。</li>
      </ul>
    </div>
  );
}
