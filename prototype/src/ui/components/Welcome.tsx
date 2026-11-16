// はじめの画面（ホーム画面に置く版で、まだ何も保存していないとき）。デモの家族の代わりに出す。
// 自分の家族で始める（初回設定へ）か、デモを見る。ホーム画面への追加の案内は、開いている所で出し分ける。
import { useEffect, useRef } from 'react';
import { Hanko } from './Icon';

/**
 * ホーム画面への追加の案内。
 * none：もうホーム画面から開いている（案内しない）／line：LINE の中のブラウザ（追加できない。Safari か Chrome で開き直す）／
 * ios：iPhone・iPad（先に［共有］→［ホーム画面に追加］）／prompt：ブラウザの「アプリとして入れる」が使える（ボタンを出す）／
 * installed：そのボタンで追加した／hint：それ以外（Chrome のメニューからの追加を1行で案内する）。
 */
export type InstallGuide = 'none' | 'line' | 'ios' | 'prompt' | 'installed' | 'hint';

/** 案内の選び方。上から順に当てはめる（LINE の中は iPhone でも LINE の案内）。 */
export function installGuide(env: {
  standalone: boolean;
  line: boolean;
  ios: boolean;
  /** ブラウザの「アプリとして入れる」の確認を、今出せるか。 */
  canPrompt: boolean;
  /** その確認で、ホーム画面に追加したか。 */
  installed: boolean;
}): InstallGuide {
  if (env.standalone) return 'none';
  if (env.line) return 'line';
  if (env.ios) return 'ios';
  if (env.installed) return 'installed';
  if (env.canPrompt) return 'prompt';
  return 'hint';
}

export const WELCOME_TEXT = {
  kicker: 'うちの献立当番（試作）',
  lead: '平日の夕食の献立と買い物リストを、買い物の日に合わせて先に決めておきます。何もしなければそのまま決まり、予定が変わったら1タップで組み直します。',
  lineTitle: 'Safari か Chrome で開いてください',
  lineBody: 'LINE の中で開いたページは、ホーム画面に追加できません。LINE のメニューから、Safari か Chrome でこのページを開き直してください。',
  lineNote: '自分の家族で始めるのは、開き直してからにしてください。デモは、ここでも見られます。',
  // iPhone・iPad のブラウザは Safari とは限らない（Chrome などでも、［共有］からホーム画面に追加できる）。どのブラウザでも
  // 合う言い方にする（［共有］の場所は、Safari では画面の下の［…］の中、Chrome ではアドレスバーの右のことがある）。
  iosTitle: '先にホーム画面に追加してください',
  iosStep1: '［共有］ボタンを押して、［ホーム画面に追加］を選びます。［共有］は、画面の下の［…］の中や、アドレスバーの右にあることもあります。',
  iosStep2: 'ホーム画面にできた「きめとく」を開いて、そこで始めます。',
  iosNote: 'iPhone と iPad では、ホーム画面のアプリと、Safari などのブラウザとで、記録が別々になります。ブラウザで設定した家族は、ホーム画面のアプリには出ません。',
  iosAnyway: '追加しないで、このままブラウザで始めることもできます。',
  promptTitle: 'ホーム画面に追加できます',
  promptBody: '追加すると、ホーム画面からアプリのように開けます。',
  installed: 'ホーム画面に追加しました。次からは、ホーム画面の「きめとく」から開けます。',
  hint: 'ホーム画面に追加するには、Chrome のメニューから［ホーム画面に追加］か［アプリをインストール］を選びます。',
} as const;

export function Welcome({
  guide,
  installing = false,
  onInstall,
  onStart,
  onDemo,
}: {
  guide: InstallGuide;
  /** ブラウザの確認を出しているあいだ（ボタンを押せなくする）。 */
  installing?: boolean;
  onInstall: () => void;
  onStart: () => void;
  onDemo: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  // 開いたら見出しへフォーカスを移す（初回設定を［やめて戻る］で閉じて戻ったときも、BODY に落とさない）。
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  // ［ホーム画面に追加する］を押して確認が閉じたら、ボタンは消える。フォーカスは、代わりに出た文へ移す。
  const prevGuide = useRef(guide);
  useEffect(() => {
    const was = prevGuide.current;
    prevGuide.current = guide;
    if (was === 'prompt' && (guide === 'installed' || guide === 'hint')) resultRef.current?.focus({ preventScroll: true });
  }, [guide]);

  return (
    <div className="welcome">
      <div className="welcome-body">
        <header className="welcome-head">
          <Hanko size={56} />
          <div className="welcome-names">
            <p className="welcome-kicker">{WELCOME_TEXT.kicker}</p>
            {/* 幅が狭くなって左の案内が隠れたときの、フォーカスの行き先にもする（tabindex=-1）。 */}
            <h1 className="welcome-title" tabIndex={-1} ref={titleRef}>
              きめとく
            </h1>
          </div>
        </header>
        <p className="welcome-lead">{WELCOME_TEXT.lead}</p>

        {guide === 'line' ? (
          <section className="install-guide is-first" aria-labelledby="install-title">
            <h2 className="install-title" id="install-title">
              {WELCOME_TEXT.lineTitle}
            </h2>
            <p>{WELCOME_TEXT.lineBody}</p>
            <p className="install-note">{WELCOME_TEXT.lineNote}</p>
          </section>
        ) : null}

        {guide === 'ios' ? (
          <section className="install-guide is-first" aria-labelledby="install-title">
            <h2 className="install-title" id="install-title">
              {WELCOME_TEXT.iosTitle}
            </h2>
            <ol className="install-steps">
              <li>{WELCOME_TEXT.iosStep1}</li>
              <li>{WELCOME_TEXT.iosStep2}</li>
            </ol>
            <p className="install-note">{WELCOME_TEXT.iosNote}</p>
          </section>
        ) : null}

        {guide === 'prompt' ? (
          <section className="install-guide" aria-labelledby="install-title">
            <h2 className="install-title" id="install-title">
              {WELCOME_TEXT.promptTitle}
            </h2>
            <p>{WELCOME_TEXT.promptBody}</p>
            <button type="button" className="btn" disabled={installing} onClick={onInstall}>
              ホーム画面に追加する
            </button>
          </section>
        ) : null}

        {guide === 'installed' || guide === 'hint' ? (
          <p className="install-hint" tabIndex={-1} ref={resultRef} data-testid="install-hint">
            {guide === 'installed' ? WELCOME_TEXT.installed : WELCOME_TEXT.hint}
          </p>
        ) : null}

        <div className="welcome-actions">
          {guide === 'ios' ? <p className="install-hint">{WELCOME_TEXT.iosAnyway}</p> : null}
          {/* LINE の中では始めない（ホーム画面に追加できず、開き直すと記録が別になる）。デモは見られる。 */}
          {guide === 'line' ? null : (
            <button type="button" className="btn btn--primary" onClick={onStart}>
              自分の家族で始める
            </button>
          )}
          <button type="button" className="btn" onClick={onDemo}>
            デモを見てみる
          </button>
        </div>
      </div>
    </div>
  );
}
