// サービスワーカーの登録と、新しい版の知らせ・切り替え（ホーム画面に置く版だけ）。
// index.ts の registerServiceWorker が、PWA の版で初めて呼ばれたときに読み込む（ほかの版のビルドには入らない）。
//
// ブラウザの標準の API だけで書く（workbox-window は使わない）。workbox-window は、読み込みから60秒より後に見つかった
// 更新を「外から来たもの」とみなし、そのあとは updatefound を聞くのをやめる。ホーム画面のアプリは開いたままになりやすく、
// 2つめの新しい版に気づけなくなるので使わない。
//
// サービスワーカー（vite-plugin-pwa の generateSW で作る dist-pwa/sw.js）の決まり：
// - 新しい版は、インストールのあと待つ（自分では skipWaiting しない）。{ type: 'SKIP_WAITING' } を受けると切り替わる。
// - 切り替わると、開いているページを受け持つ（clientsClaim）。

/** サービスワーカーのファイル（ページと同じフォルダ。Netlify ではサイトの一番上の /sw.js）。 */
export const SW_URL = './sw.js';
/** 受け持つ範囲（ページと同じフォルダより下）。 */
export const SW_SCOPE = './';
/** 新しい版を確かめる間隔。ホーム画面のアプリは閉じずに使い続けることが多いので、開いている間も確かめる。 */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** 待っている新しい版に「切り替えて」と頼むメッセージ（generateSW のサービスワーカーが聞く形）。 */
export const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;

/** ページを読み直す（テストで差し替える）。 */
export const page = {
  reload(): void {
    window.location.reload();
  },
};

let registration: ServiceWorkerRegistration | null = null;
let starting: Promise<void> | null = null;
/** 知らせる先。値は、その先に最後に知らせた版（1つの新しい版につき1回だけ知らせる）。 */
const listeners = new Map<() => void, ServiceWorker | null>();
/** いちばん新しく知らせた、待っている版。 */
let offered: ServiceWorker | null = null;
let checking = false;
let reloading = false;
/** ［更新する］のあと、インストールが済むのを待っている版（同じ版を重ねて待たない）。 */
let awaitingInstall: ServiceWorker | null = null;

/**
 * 新しい版が待っている状態になったら onUpdateReady を呼ぶ（1つの新しい版につき1回）。
 * はじめて呼ばれたときにサービスワーカーを登録し、更新を確かめ始める（2回目からは知らせる先を足すだけ）。
 * 登録に失敗したら reject する（呼ぶ側で受ける）。次に呼ばれたときに、もう一度登録を試す。
 */
export function watchForUpdates(onUpdateReady: () => void): Promise<void> {
  if (!listeners.has(onUpdateReady)) listeners.set(onUpdateReady, null);
  if (offered && registration?.waiting === offered) tell(onUpdateReady, offered);
  starting ??= start().catch((error: unknown) => {
    starting = null;
    throw error;
  });
  return starting;
}

/**
 * 待っている新しい版に切り替えて、切り替わったら1回だけ読み直す。さらに新しい版がインストール中なら、済んでから切り替える。
 * 新しい版が待っていなければ何もしない（ほかの窓で先に切り替わっていたら、読み直すだけ）。
 */
export function applyUpdate(): void {
  const reg = registration;
  if (!reg) return;
  // さらに新しい版をインストールしている途中なら、終わってから切り替える。どの版も同じ入れ物（precache）を使うので、
  // 待っていた古い方の版を先に動かすと、その版の片付けが、入れている途中の新しい版のファイル（index.html など）を消し、
  // 新しい版に切り替えたあと、オフラインで開けなくなる。インストールが済んだら（失敗しても）、待っている版に切り替える。
  const installing = reg.installing;
  if (installing && (installing.state === 'parsed' || installing.state === 'installing')) {
    if (awaitingInstall === installing) return;
    awaitingInstall = installing;
    const onStateChange = () => {
      if (installing.state === 'parsed' || installing.state === 'installing') return;
      installing.removeEventListener('statechange', onStateChange);
      if (awaitingInstall === installing) awaitingInstall = null;
      try {
        applyUpdate();
      } catch {
        // 投げない（切り替えられなくても、次に開いたときに新しい版になる）。
      }
    };
    installing.addEventListener('statechange', onStateChange);
    return;
  }
  const next = reg.waiting;
  if (next) {
    // ページを受け持つ版が変わったら（controllerchange）読み直す。受け持たれていないページは、新しい版が動き始めたら読み直す。
    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
    next.addEventListener('statechange', () => {
      if (next.state === 'activated') reloadOnce();
    });
    next.postMessage(SKIP_WAITING_MESSAGE);
    return;
  }
  if (offered && reg.active === offered) reloadOnce();
}

async function start(): Promise<void> {
  // はじめて開いたとき（まだサービスワーカーが受け持っていないページ）：受け持たれたら、先に読み込んだフォントを取っておく。
  if (!navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', keepEarlyFonts, { once: true });
  }
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  registration = reg;
  // 前に開いたときに見つかって、待ったままの版。
  if (reg.waiting && reg.active) offer(reg.waiting);
  if (reg.installing) follow(reg, reg.installing);
  reg.addEventListener('updatefound', () => {
    if (reg.installing) follow(reg, reg.installing);
  });
  // 開いたままのアプリでも、ときどき・前に出てきたときに確かめる。
  setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

/** Google Fonts（和文のフォントの CSS と、字の範囲ごとのフォントのファイル）。サービスワーカーが取っておく（vite.pwa.ts）。 */
const GOOGLE_FONTS_URL = /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//;

/**
 * はじめて開いたときは、フォントの CSS と、最初の画面で使うフォントのファイルを、サービスワーカーが動き始める前に読み込む
 * （サービスワーカーを通らないので、取っておけていない）。このままだと、次にオフラインで開いたときにフォントの CSS が
 * 読み込めず、ブラウザの字の形になる。そこで、受け持たれたときに、それまでに読み込んだ分をサービスワーカーを通して
 * 読み込み直す（たいていブラウザのキャッシュから届くので、通信はほとんど増えない）。失敗しても何もしない。
 */
export function keepEarlyFonts(): void {
  try {
    const urls = new Set(
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => GOOGLE_FONTS_URL.test(url)),
    );
    for (const url of urls) {
      fetch(url).catch(() => {
        // つながらない：オフラインのときにブラウザの字の形になるだけ。
      });
    }
  } catch {
    // 投げない。
  }
}

/** インストール中の版を見守り、インストールが済んで待つことになったら知らせる。はじめての版（前の版がない）は知らせない。 */
function follow(reg: ServiceWorkerRegistration, worker: ServiceWorker): void {
  const onStateChange = () => {
    if (worker.state === 'installing') return;
    worker.removeEventListener('statechange', onStateChange);
    if (worker.state === 'installed' && reg.active && reg.waiting === worker) offer(worker);
  };
  worker.addEventListener('statechange', onStateChange);
}

function offer(worker: ServiceWorker): void {
  if (worker.state === 'redundant') return;
  offered = worker;
  for (const listener of listeners.keys()) tell(listener, worker);
}

function tell(listener: () => void, worker: ServiceWorker): void {
  if (listeners.get(listener) === worker) return;
  listeners.set(listener, worker);
  try {
    listener();
  } catch {
    // 知らせる先の失敗は、ほかの知らせる先と更新の確かめに影響させない。
  }
}

function checkForUpdate(): void {
  const reg = registration;
  if (!reg || checking || reg.installing) return;
  if (navigator.onLine === false) return;
  checking = true;
  Promise.resolve()
    .then(() => reg.update())
    .catch(() => {
      // つながらない・サーバーの不調：次の機会に確かめる。
    })
    .finally(() => {
      checking = false;
    });
}

function reloadOnce(): void {
  if (reloading) return;
  reloading = true;
  page.reload();
}
