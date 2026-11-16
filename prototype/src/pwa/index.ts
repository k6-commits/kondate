// ホーム画面に置くアプリ（PWA）のための小さな窓口。画面（src/ui）は、PWA のことはここだけを使う。
// PWA の版（vite の mode が 'pwa'。npm run build:pwa → dist-pwa/、Netlify で公開）だけで働き、
// claude.ai の Artifact の版・開発用の版では何もしない（APP_TARGET が 'web'）。
//
// 関数の形（名前・引数・戻り値）は変えないこと。画面の担当は、テストではこのモジュールを vi.mock で差し替える。
//
// どの関数も、はじめに APP_TARGET を確かめる。'web' の版のビルドでは APP_TARGET が定数 'web' になるので、その先
// （サービスワーカー・インストールの確認・保存の依頼）はビルドから消える。サービスワーカーの登録と更新のコード
// （./updates）は、PWA の版で registerServiceWorker が呼ばれてから読み込む。

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

type Updates = typeof import('./updates');
let updates: Promise<Updates> | null = null;

/** サービスワーカーの登録と更新のコードを読み込む（1回だけ。読み込めなかったら、次に呼ばれたときにもう一度）。 */
function loadUpdates(): Promise<Updates> {
  updates ??= import('./updates').catch((error: unknown) => {
    updates = null;
    throw error;
  });
  return updates;
}

/**
 * サービスワーカーを登録する。新しい版が使えるようになったら onUpdateReady を呼ぶ（1つの新しい版につき1回）。
 * 自分では切り替えない（切り替えは applyUpdate）。開いている間も、60分ごとと、アプリが前に出てきたときに新しい版を確かめる。
 * 登録はページの読み込みが終わってから。2回呼んでも登録は1回（知らせる先が増えるだけ）。
 * PWA の版でないとき・開発用のサーバー・サービスワーカーが使えないときは何もしない。失敗しても投げない。
 */
export function registerServiceWorker(onUpdateReady: () => void): void {
  if (APP_TARGET !== 'pwa') return;
  // 開発用のサーバー（vite --mode pwa）には sw.js がない（index.html が返り、ブラウザがコンソールにエラーを出す）。
  // 登録するのは、ビルドした版（npm run build:pwa）だけ。
  if (import.meta.env.DEV) return;
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const begin = () => {
      loadUpdates()
        .then((m) => m.watchForUpdates(onUpdateReady))
        .catch(() => {
          // 登録できなくても、アプリはふだんどおり使える（オフラインと新しい版の知らせがないだけ）。
        });
    };
    if (document.readyState === 'complete') begin();
    else window.addEventListener('load', begin, { once: true });
  } catch {
    // 投げない。
  }
}

/**
 * 待っている新しい版に切り替えて、ページを読み直す（読み直しは1回だけ）。新しい版がなければ何もしない。
 * さらに新しい版がインストール中なら、済んでから（いちばん新しい版に）切り替える。
 * ほかの窓で先に切り替わっていたら、読み直すだけ。投げない。
 */
export function applyUpdate(): void {
  if (APP_TARGET !== 'pwa') return;
  try {
    if (!updates) return;
    updates
      .then((m) => m.applyUpdate())
      .catch(() => {
        // 投げない。
      });
  } catch {
    // 投げない。
  }
}

/**
 * この端末にデータを消さずに残すよう頼む（navigator.storage.persist）。すでに残すことになっていれば true。
 * PWA の版でないとき・頼めない・断られたら false。投げない。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (APP_TARGET !== 'pwa') return false;
  try {
    const storage = (navigator as Partial<Navigator>).storage;
    if (!storage || typeof storage.persist !== 'function') return false;
    if (typeof storage.persisted === 'function' && (await storage.persisted()) === true) return true;
    return (await storage.persist()) === true;
  } catch {
    return false;
  }
}

/** ブラウザの「アプリとして入れる」の確認（beforeinstallprompt。Android の Chrome などにある。標準の型にはない）。 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

type InstallListener = (install: () => Promise<boolean>) => void;

/** まだ使っていない、いちばん新しい確認（画面が聞き始める前に来た分も取っておく）。 */
let installPrompt: BeforeInstallPromptEvent | null = null;
/** 確認を出したもの（1つの確認は1回しか出せない）。 */
const usedInstallPrompts = new WeakSet<Event>();
const installListeners = new Set<InstallListener>();
let appInstalled = false;

function makeInstall(event: BeforeInstallPromptEvent): () => Promise<boolean> {
  return async () => {
    if (appInstalled || usedInstallPrompts.has(event)) return false;
    usedInstallPrompts.add(event);
    if (installPrompt === event) installPrompt = null;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      return choice?.outcome === 'accepted';
    } catch {
      return false;
    }
  };
}

function offerInstall(listener: InstallListener, event: BeforeInstallPromptEvent): void {
  try {
    listener(makeInstall(event));
  } catch {
    // 画面の失敗で、ほかの知らせる先とブラウザのイベントを止めない。
  }
}

function onBeforeInstallPrompt(event: Event): void {
  // ブラウザが自分で出す案内は止める（確認は、画面のボタンから出す）。
  event.preventDefault();
  installPrompt = event as BeforeInstallPromptEvent;
  for (const listener of [...installListeners]) offerInstall(listener, installPrompt);
}

function onAppInstalled(): void {
  appInstalled = true;
  installPrompt = null;
  installListeners.clear();
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.removeEventListener('appinstalled', onAppInstalled);
}

// PWA の版だけ：読み込んだときから聞いておく（ブラウザは、画面が聞き始める前に送ってくることがある）。
if (APP_TARGET === 'pwa') {
  try {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
  } catch {
    // 聞けなくても、メニューからの追加はできる。
  }
}

/**
 * 「アプリとして入れる」（Android の Chrome などの beforeinstallprompt）が使えるようになったら onAvailable を呼ぶ
 * （聞き始める前に来ていたら、すぐに呼ぶ）。ブラウザが自分で出す案内は止めて、確認は画面のボタンから出す。
 * onAvailable に渡す install() は、ブラウザの確認を出し、入れたら true を返す（確認を出せるのは1回だけ。2回目・断られた・
 * 出せなかったときは false。投げない）。ブラウザがまた使えるようにしたら、新しい install() でもう一度 onAvailable を呼ぶ。
 * アプリが入ったら（appinstalled）聞くのをやめる。
 * 戻り値は、聞くのをやめる関数。PWA の版でないときは何もしない。
 */
export function listenInstallPrompt(onAvailable: (install: () => Promise<boolean>) => void): () => void {
  if (APP_TARGET !== 'pwa') return () => {};
  try {
    if (appInstalled) return () => {};
    const listener: InstallListener = (install) => onAvailable(install);
    installListeners.add(listener);
    if (installPrompt && !usedInstallPrompts.has(installPrompt)) offerInstall(listener, installPrompt);
    return () => {
      installListeners.delete(listener);
    };
  } catch {
    return () => {};
  }
}
