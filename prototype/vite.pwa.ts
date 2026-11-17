// ホーム画面に置く版（PWA）のビルドの設定。`npm run build:pwa`（vite build --mode pwa）→ dist-pwa/。Netlify で公開する
// （https://（プロジェクト名）.netlify.app/ 。サイトは、このアプリだけのオリジンの一番上に置く。公開の設定はリポジトリの直下の
// netlify.toml）。vite.config.ts が、mode が 'pwa' のときだけ使う。ほかの版（開発用・Artifact・集計ページ）は、この設定にも
// vite-plugin-pwa にも触れない（出力は前と同じ）。
//
// - マニフェストとサービスワーカーは vite-plugin-pwa（generateSW）で作る。登録は自分で行う（src/pwa の registerServiceWorker）。
// - 新しい版は自動では切り替えない（skipWaiting しない）。画面が「新しい版があります」を出し、［更新する］で切り替える。
// - アイコンは public-pwa/icons/（元の絵は icon.svg。PNG は scripts/make-icons.mjs で作る）。
// - Netlify（無料のプラン）が右下に足すバッジが出ているあいだは、画面の下をその分あける（NETLIFY_BADGE_SPACE_CSS）。
// - URL はすべて相対（先頭に '/' を付けない。base は './'）。ホスト名によらず、フォルダの下に置いても（手元で試すときなど）動く。
//   キャッシュの名前は 'kimetoku' で始める（ほかのキャッシュと見分けられるように）。
//   マニフェストの id だけは、オリジンの一番上（'/'）にする（URL ではなく、アプリを見分ける名前。PWA_ID を参照）。
import type { HtmlTagDescriptor, Plugin, PluginOption } from 'vite';
import type { VitePWAOptions } from 'vite-plugin-pwa';

export const PWA_OUT_DIR = 'dist-pwa';
export const PWA_PUBLIC_DIR = 'public-pwa';

export const PWA_NAME = 'きめとく';
export const PWA_DESCRIPTION = '平日の夕食を、家族の定番から先に決めておく献立アプリ（試用版）';
/**
 * ホーム画面のアプリを見分ける名前（マニフェストの id）。オリジンの一番上（Netlify では https://（プロジェクト名）.netlify.app/）。
 * id は、マニフェストの場所ではなく start_url の origin を基準に読まれるので、'/' はどのホスト名でもその一番上を指す
 * （Netlify では、このアプリだけのオリジン）。家族がホーム画面に入れたあとは変えないこと（変えると、入れたアプリが別のアプリと
 * みなされる）。公開先のアドレス（オリジン）も変えないこと（変えると、アプリも記録も別になる）。
 */
export const PWA_ID = '/';
/** styles.css の --door（明るいテーマの地の色）。index.html の theme-color（明るいテーマ）と同じ。 */
export const PWA_THEME_COLOR = '#e7e3db';

/** 新しい JS（約600KB）も確実に入れる上限。これを超えるファイルがあるとビルドが失敗する（黙って落とさない）。 */
const PRECACHE_MAX_BYTES = 4 * 1024 * 1024;
const YEAR_SECONDS = 60 * 60 * 24 * 365;

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  injectRegister: false,
  mode: 'production',
  manifestFilename: 'manifest.webmanifest',
  includeManifestIcons: true,
  // マニフェストに載せないアイコン（apple-touch-icon・favicon・元の SVG）も、オフラインで使えるよう先に入れておく。
  includeAssets: ['icons/*.png', 'icons/*.svg'],
  manifest: {
    id: PWA_ID,
    name: PWA_NAME,
    short_name: PWA_NAME,
    description: PWA_DESCRIPTION,
    lang: 'ja',
    start_url: './',
    scope: './',
    display: 'standalone',
    theme_color: PWA_THEME_COLOR,
    background_color: PWA_THEME_COLOR,
    categories: ['food', 'lifestyle'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    cacheId: 'kimetoku',
    globPatterns: ['**/*.{html,js,css}'],
    maximumFileSizeToCacheInBytes: PRECACHE_MAX_BYTES,
    // ページを開く（ナビゲーション）ときは、URL に ?openExternalBrowser=1（LINE が外のブラウザで開くときに付ける）などが
    // 付いていても、先に入れた index.html を返す。
    navigateFallback: 'index.html',
    // /api/ は Netlify の関数（AI の読み取り。/api/parse）。ブラウザで直接開いたときも、アプリではなく関数の返事を見せる。
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    // 新しい版は、家族が［更新する］を押すまで待たせる（入力の途中で読み直さない）。押したら SKIP_WAITING を送る。
    skipWaiting: false,
    // はじめて入ったときから、開いているページも受け持つ（そのページで［更新する］を押しても、切り替えのあと読み直せるように）。
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'kimetoku-google-fonts-css',
          cacheableResponse: { statuses: [0, 200] },
          expiration: { maxEntries: 8, maxAgeSeconds: YEAR_SECONDS, purgeOnQuotaError: true },
          // 取っておいた CSS がなく、つながらないとき：空の CSS を返す（端末のフォントで表示する。読み込みのエラーにしない）。
          // この関数は文字列にしてサービスワーカーに入る（外の変数は使えない）。
          plugins: [{ handlerDidError: async () => new Response('', { headers: { 'Content-Type': 'text/css; charset=utf-8' } }) }],
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'kimetoku-google-fonts-files',
          cacheableResponse: { statuses: [0, 200] },
          // 和文のフォントは字の範囲ごとに細かく分かれている（2書体×2太さで、使う分だけ数十〜数百）。
          expiration: { maxEntries: 400, maxAgeSeconds: YEAR_SECONDS, purgeOnQuotaError: true },
          // オフラインで、まだ取っておいていない字の範囲のファイルが要るとき：取っておいたほかのフォントのファイルを返す。
          // その字はそのファイルにないので、ブラウザは次のフォント（端末のフォント）で表示する（読み込みのエラーにしない）。
          // 返したファイルは、この字の範囲のものとしては取っておかない（つながれば、本物を取りに行く）。
          // この関数は文字列にしてサービスワーカーに入る（外の変数は使えない）。
          plugins: [
            {
              handlerDidError: async () => {
                const cache = await caches.open('kimetoku-google-fonts-files');
                const [cached] = await cache.keys();
                return cached ? cache.match(cached) : undefined;
              },
            },
          ],
        },
      },
    ],
  },
};

/**
 * Netlify の「Powered by Netlify」のバッジの分を、画面の下にあける決まり（PWA の版の <head> の style）。
 * 無料のプランでは、Netlify が返すページにバッジの script を足し、その script が右下に固定の枠（iframe#nl-badge-frame。
 * 高さ 64px。見る人は隠せない）を出す。そのままだと、はじめの設定の［次へ］やメニューのボタンに重なり、押すと Netlify の
 * 案内が開く。枠が出ているあいだだけ、画面（.shell）の下をその高さの分あける（下の安全領域（iPhone のホームバー）の分は、
 * 画面がもうあけているので差し引く）。枠がないとき（手元・オフライン・バッジを切ったプロジェクト）は何もしない。
 * 枠の id と高さは、Netlify の script の中の値で、決まりとして公開されてはいない（変わったら、ここも直す）。
 */
export const NETLIFY_BADGE_SPACE_CSS =
  'body:has(> #nl-badge-frame) .shell { bottom: max(0px, calc(64px - env(safe-area-inset-bottom, 0px))); }';

/**
 * PWA の版だけの <head> のタグ。説明・アイコン・ホーム画面のアプリの名前と表示・Netlify のバッジの分の余白。
 * claude.ai の Artifact だけで使う meta（claude:viewport-fit-sides）は、PWA の版からは除く。
 */
export const PWA_HEAD_TAGS: HtmlTagDescriptor[] = [
  { tag: 'meta', attrs: { name: 'description', content: PWA_DESCRIPTION }, injectTo: 'head' },
  { tag: 'link', attrs: { rel: 'icon', href: 'icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, injectTo: 'head' },
  { tag: 'link', attrs: { rel: 'icon', href: 'icons/icon.svg', type: 'image/svg+xml' }, injectTo: 'head' },
  { tag: 'link', attrs: { rel: 'apple-touch-icon', href: 'icons/apple-touch-icon.png', sizes: '180x180' }, injectTo: 'head' },
  { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
  { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
  { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: PWA_NAME }, injectTo: 'head' },
  { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }, injectTo: 'head' },
  { tag: 'style', children: NETLIFY_BADGE_SPACE_CSS, injectTo: 'head' },
];

const CLAUDE_ONLY_META = /[ \t]*<meta\s+name=["']claude:[^"']*["'][^>]*>[ \t]*\r?\n?/gi;

function pwaHeadTags(): Plugin {
  return {
    name: 'kimetoku-pwa-head',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return { html: html.replace(CLAUDE_ONLY_META, ''), tags: PWA_HEAD_TAGS };
      },
    },
  };
}

/** PWA の版のプラグイン（vite-plugin-pwa は、ここで初めて読み込む）。 */
export async function pwaPlugins(): Promise<PluginOption[]> {
  const { VitePWA } = await import('vite-plugin-pwa');
  return [VitePWA(pwaOptions), pwaHeadTags()];
}
