// ホーム画面に置くアプリ（PWA）のための小さな窓口。画面（src/ui）は、PWA のことはここだけを使う。
// PWA の版（vite の mode が 'pwa'。npm run build:pwa → dist-pwa/、GitHub Pages で公開）だけで働き、
// claude.ai の Artifact の版・開発用の版では何もしない（APP_TARGET が 'web'）。
//
// 関数の形（名前・引数・戻り値）は変えないこと。中身（サービスワーカーの登録・更新・ホーム画面への追加）は
// シェルの担当が書く。画面の担当は、テストではこのモジュールを vi.mock で差し替える。

/** アプリの版：'pwa' はホーム画面に置く版、'web' はそれ以外（claude.ai の Artifact・開発用）。 */
export type AppTarget = 'pwa' | 'web';

/** このビルドの版。 */
export const APP_TARGET: AppTarget = import.meta.env.MODE === 'pwa' ? 'pwa' : 'web';

/** ホーム画面から開いているか（display-mode: standalone、または iOS の navigator.standalone）。 */
export function isStandalone(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
    return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** iPhone・iPad か（ホーム画面への追加の案内を出し分ける。Mac のふりをする iPadOS の Safari も含める）。 */
export function isIos(): boolean {
  try {
    if (typeof navigator === 'undefined') return false;
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  } catch {
    return false;
  }
}

/** LINE のアプリの中のブラウザか（ここではホーム画面に追加できない。外のブラウザで開くよう案内する）。 */
export function isLineInAppBrowser(): boolean {
  try {
    return typeof navigator !== 'undefined' && /\bLine\//i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

/**
 * サービスワーカーを登録する。新しい版が使えるようになったら onUpdateReady を呼ぶ（1つの新しい版につき1回）。
 * PWA の版でないとき・サービスワーカーが使えないときは何もしない。失敗しても投げない。
 */
export function registerServiceWorker(onUpdateReady: () => void): void {
  void onUpdateReady;
}

/** 待っている新しい版に切り替えて、ページを読み直す。新しい版がなければ何もしない。 */
export function applyUpdate(): void {}

/** この端末にデータを消さずに残すよう頼む（navigator.storage.persist）。頼めない・断られたら false。投げない。 */
export async function requestPersistentStorage(): Promise<boolean> {
  return false;
}

/**
 * 「アプリとして入れる」（Android の Chrome などの beforeinstallprompt）が使えるようになったら onAvailable を呼ぶ。
 * onAvailable に渡す install() は、ブラウザの確認を出し、入れたら true を返す。
 * 戻り値は、聞くのをやめる関数。PWA の版でないときは何もしない。
 */
export function listenInstallPrompt(onAvailable: (install: () => Promise<boolean>) => void): () => void {
  void onAvailable;
  return () => {};
}
