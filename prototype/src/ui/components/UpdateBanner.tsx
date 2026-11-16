// 新しい版の知らせ（ホーム画面に置く版だけ）。画面の上に小さく出し、操作は止めない。自分では読み直さない。
// 知らせの入れ物（role="status"）は、はじめから置いておく（あとから中身を入れたときに、読み上げで伝わるように）。
import { useEffect, useState } from 'react';

/** 新しい版があるときの文。 */
export const UPDATE_TEXT = '新しい版があります。更新しても、家族と記録はそのままです。';
/** ［更新する］を押したあと、読み直すまでのボタンの文（さらに新しい版を入れている途中なら、済むまで数秒かかる）。 */
export const UPDATING_TEXT = '更新しています…';
/**
 * ［更新する］を押してから、読み直さないままこの時間がたったら、ボタンを元に戻す（もう一度押せるように）。ふつうは、その前に
 * 読み直す。
 */
export const UPDATING_RESET_MS = 20_000;

export function UpdateBanner({
  shown,
  inert = false,
  onUpdate,
  onLater,
}: {
  shown: boolean;
  /** 案内を重ねて開いているあいだは、ここにもフォーカスが出ないようにする。 */
  inert?: boolean;
  /** ［更新する］：新しい版に切り替えて、読み直す。 */
  onUpdate: () => void;
  /** ［あとで］：次に開くまで出さない。 */
  onLater: () => void;
}) {
  return (
    <div className="update-region" role="status" inert={inert} data-testid="update-region">
      {shown ? <UpdateBannerBody onUpdate={onUpdate} onLater={onLater} /> : null}
    </div>
  );
}

/** 知らせの中身。出すたびに作り直す（［更新する］を押したあとの様子は、隠すと元に戻る）。 */
function UpdateBannerBody({ onUpdate, onLater }: { onUpdate: () => void; onLater: () => void }) {
  /** ［更新する］を押して、読み直すのを待っているか（重ねて押さない。［あとで］は出さない）。 */
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    if (!updating) return;
    const timer = window.setTimeout(() => setUpdating(false), UPDATING_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [updating]);

  return (
    <div className="update-banner">
      <p className="update-text">{UPDATE_TEXT}</p>
      <div className="update-actions">
        {/* 押したあとは押せない印（aria-disabled）にする。disabled にすると、キーボードで押したときのフォーカスが外れる。 */}
        <button
          type="button"
          className="btn btn--small btn--primary"
          aria-disabled={updating ? 'true' : undefined}
          onClick={() => {
            if (updating) return;
            setUpdating(true);
            onUpdate();
          }}
        >
          {updating ? UPDATING_TEXT : '更新する'}
        </button>
        {updating ? null : (
          <button type="button" className="btn btn--small" onClick={onLater}>
            あとで
          </button>
        )}
      </div>
    </div>
  );
}
