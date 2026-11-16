#!/usr/bin/env node
// ホーム画面に置く版（PWA）のビルド（vite build --mode pwa → dist-pwa/）を検査する。だめなら exit 1。
// npm run build:pwa の最後に走る。ほかのフォルダのビルドを検査するときは、フォルダを引数で渡す：
//   node scripts/check-pwa.mjs <出力フォルダ>
//
// 確かめること：
// - マニフェスト：名前・説明・言語・start_url/scope（'./'）・id（公開先のフォルダ）・display・色・分類・アイコン（192・512・maskable 512）。
//   アイコンのファイルがあり、PNG の大きさ（IHDR の幅と高さ）が sizes のとおりか。
// - sw.js：あるか。index.html とページの JS・CSS を先に入れるか。ナビゲーションで index.html を返すか。
//   新しい版を勝手に切り替えないか（SKIP_WAITING を受けて切り替える形か）。読み込む workbox のファイルがあるか。
//   Google Fonts を取っておく決まりに、オフラインで取れないときの代わりの返事（handlerDidError）があるか。
// - index.html：マニフェストとアイコンのリンク、ホーム画面のアプリの meta、説明。'/…'（先頭が '/'）の URL がないか。
//   claude.ai の Artifact だけで使う meta（claude:…）が残っていないか。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'dist-pwa'));

const NAME = 'きめとく';
const DESCRIPTION = '平日の夕食を、家族の定番から先に決めておく献立アプリ（試用版）';
const THEME_COLOR = '#e7e3db';
/** GitHub Pages の公開先。マニフェストの id（ホーム画面のアプリを見分ける名前）が、ここを指すかを確かめる。 */
const PAGES_URL = 'https://k6-commits.github.io/kondate/';
const MANIFEST_ICONS = [
  { sizes: '192x192', purpose: 'any' },
  { sizes: '512x512', purpose: 'any' },
  { sizes: '512x512', purpose: 'maskable' },
];
const HEAD_META = {
  'apple-mobile-web-app-capable': 'yes',
  'mobile-web-app-capable': 'yes',
  'apple-mobile-web-app-title': NAME,
  'apple-mobile-web-app-status-bar-style': 'default',
  description: DESCRIPTION,
};
/** 先に入れるファイルの合計の上限（目安。超えたら、何か大きなものが紛れ込んでいる）。 */
const MAX_PRECACHE_BYTES = 5 * 1024 * 1024;

const problems = [];
const show = (p) => relative(process.cwd(), p) || '.';

function die(message) {
  console.error(`check-pwa: ${message}`);
  process.exit(1);
}

if (!existsSync(OUT) || !statSync(OUT).isDirectory()) {
  die(`${show(OUT)} がありません。先に「vite build --mode pwa」を実行してください。`);
}

/** 出力フォルダの中の相対 URL をファイルの場所にする。外を指す・'/' で始まる・ないときは null。 */
function fileFor(url, base = '') {
  if (typeof url !== 'string' || url === '' || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/')) return null;
  const path = resolve(OUT, base, url.split(/[?#]/)[0]);
  if (!path.startsWith(OUT + '/') && path !== OUT) return null;
  return path;
}

/** PNG の幅と高さ（IHDR）。PNG でなければ null。 */
function pngSize(path) {
  const buf = readFileSync(path);
  const signature = '89504e470d0a1a0a';
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== signature || buf.subarray(12, 16).toString('latin1') !== 'IHDR') {
    return null;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function checkPng(label, url, size, base = '') {
  const path = fileFor(url, base);
  if (!path) {
    problems.push(`${label}：URL が相対ではありません：${url}`);
    return;
  }
  if (!existsSync(path)) {
    problems.push(`${label}：${url} のファイルがありません`);
    return;
  }
  const actual = pngSize(path);
  if (!actual) {
    problems.push(`${label}：${url} が PNG ではありません`);
    return;
  }
  const [width, height] = size.split('x').map(Number);
  if (actual.width !== width || actual.height !== height) {
    problems.push(`${label}：${url} が ${actual.width}x${actual.height} です（${size} のはず）`);
  }
}

// ---------------------------------------------------------------------------
// index.html
// ---------------------------------------------------------------------------

const indexPath = join(OUT, 'index.html');
if (!existsSync(indexPath)) die(`${show(indexPath)} がありません。`);
const html = readFileSync(indexPath, 'utf8');

const tags = (name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
const attr = (tag, key) => new RegExp(`\\b${key}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)?.[2] ?? null;
const links = tags('link');
const metas = tags('meta');
const linkWithRel = (rel) => links.filter((tag) => (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/).includes(rel));

if (!/<html\b[^>]*\blang=["']ja["']/i.test(html)) problems.push('index.html：<html lang="ja"> がありません');
if (!/<title>\s*きめとく\s*<\/title>/.test(html)) problems.push('index.html：<title>きめとく</title> がありません');
if (!metas.some((tag) => attr(tag, 'name') === 'theme-color')) problems.push('index.html：theme-color の meta がありません');

for (const [name, content] of Object.entries(HEAD_META)) {
  const found = metas.filter((tag) => attr(tag, 'name') === name);
  if (found.length === 0) problems.push(`index.html：<meta name="${name}"> がありません`);
  else if (found.some((tag) => attr(tag, 'content') !== content)) problems.push(`index.html：<meta name="${name}"> の content が「${content}」ではありません`);
}
for (const tag of metas) {
  if ((attr(tag, 'name') ?? '').startsWith('claude:')) problems.push(`index.html：claude.ai の Artifact だけで使う meta が残っています：${tag}`);
}

// '/…' や '//…' で始まる URL（サイトの一番上からの URL）は、/kondate/ の下に置くと壊れる。
for (const m of html.matchAll(/\b(?:src|href|content)\s*=\s*(["'])(\/[^"']*)\1/gi)) {
  problems.push(`index.html：先頭が '/' の URL があります：${m[2]}`);
}

const manifestLinks = linkWithRel('manifest');
let manifestUrl = null;
if (manifestLinks.length !== 1) problems.push(`index.html：<link rel="manifest"> が1つではありません（${manifestLinks.length}）`);
else {
  manifestUrl = attr(manifestLinks[0], 'href');
  if (!fileFor(manifestUrl) || !existsSync(fileFor(manifestUrl))) problems.push(`index.html：マニフェスト ${manifestUrl} がありません（相対の URL で）`);
}

const appleIcons = linkWithRel('apple-touch-icon');
if (appleIcons.length === 0) problems.push('index.html：<link rel="apple-touch-icon"> がありません');
for (const tag of appleIcons) checkPng('apple-touch-icon', attr(tag, 'href'), '180x180');

const icons = linkWithRel('icon');
if (icons.length === 0) problems.push('index.html：<link rel="icon">（favicon）がありません');
for (const tag of icons) {
  const href = attr(tag, 'href');
  const sizes = attr(tag, 'sizes');
  if (sizes && /^\d+x\d+$/.test(sizes)) checkPng('favicon', href, sizes);
  else if (!fileFor(href) || !existsSync(fileFor(href))) problems.push(`favicon：${href} がありません（相対の URL で）`);
}

// ページが読み込む JS・CSS（vite が付けたもの）。
const pageAssets = [
  ...tags('script').map((tag) => attr(tag, 'src')),
  ...linkWithRel('stylesheet').map((tag) => attr(tag, 'href')),
  ...linkWithRel('modulepreload').map((tag) => attr(tag, 'href')),
].filter((url) => url && !/^https?:/i.test(url));
if (!pageAssets.some((url) => /\.js$/.test(url))) problems.push('index.html：アプリの JS を読み込んでいません');
for (const url of pageAssets) {
  if (!fileFor(url) || !existsSync(fileFor(url))) problems.push(`index.html：${url} がありません（相対の URL で）`);
}

// ---------------------------------------------------------------------------
// マニフェスト
// ---------------------------------------------------------------------------

let manifest = null;
const manifestPath = manifestUrl ? fileFor(manifestUrl) : null;
if (manifestPath && existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    problems.push(`マニフェスト：JSON として読めません（${error.message}）`);
  }
}
if (manifest) {
  const manifestDir = relative(OUT, dirname(manifestPath));
  const expect = {
    name: NAME,
    short_name: NAME,
    description: DESCRIPTION,
    lang: 'ja',
    start_url: './',
    scope: './',
    display: 'standalone',
    theme_color: THEME_COLOR,
    background_color: THEME_COLOR,
  };
  for (const [key, value] of Object.entries(expect)) {
    if (manifest[key] !== value) problems.push(`マニフェスト：${key} が「${value}」ではありません（${JSON.stringify(manifest[key])}）`);
  }
  // id は、マニフェストの場所ではなく start_url の origin（https://k6-commits.github.io）を基準に読まれる。'./' や '/' だと
  // origin の一番上になり、同じ github.io に置いたほかのアプリと同じ名前になる。公開先のフォルダ（/kondate/）を指すこと。
  if (typeof manifest.id !== 'string' || manifest.id === '') {
    problems.push('マニフェスト：id がありません');
  } else if (typeof manifest.start_url === 'string') {
    const deployedManifest = new URL(relative(OUT, manifestPath).split(/[\\/]/).join('/'), PAGES_URL);
    const start = new URL(manifest.start_url, deployedManifest);
    const id = new URL(manifest.id, start.origin);
    if (id.href !== PAGES_URL) {
      problems.push(`マニフェスト：id「${manifest.id}」は ${id.href} を指します（公開先 ${PAGES_URL} を指すこと。id は start_url の origin を基準に読まれます）`);
    }
  }
  const categories = Array.isArray(manifest.categories) ? manifest.categories : [];
  for (const category of ['food', 'lifestyle']) {
    if (!categories.includes(category)) problems.push(`マニフェスト：categories に ${category} がありません`);
  }
  const manifestIcons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const want of MANIFEST_ICONS) {
    const found = manifestIcons.filter(
      (icon) => icon.sizes === want.sizes && (icon.purpose ?? 'any').split(/\s+/).includes(want.purpose),
    );
    if (found.length === 0) problems.push(`マニフェスト：${want.sizes}（purpose: ${want.purpose}）のアイコンがありません`);
  }
  for (const icon of manifestIcons) {
    if (icon.type !== 'image/png') problems.push(`マニフェスト：アイコン ${icon.src} の type が image/png ではありません`);
    checkPng(`マニフェストのアイコン（${icon.sizes}、${icon.purpose ?? 'any'}）`, icon.src, icon.sizes ?? '', manifestDir);
  }
}

// ---------------------------------------------------------------------------
// サービスワーカー
// ---------------------------------------------------------------------------

const swPath = join(OUT, 'sw.js');
if (!existsSync(swPath)) {
  problems.push('sw.js がありません');
} else {
  const sw = readFileSync(swPath, 'utf8');
  const precached = [...sw.matchAll(/\burl\s*:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  if (!precached.includes('index.html')) problems.push('sw.js：index.html を先に入れていません');
  for (const url of precached) {
    if (url.startsWith('/')) problems.push(`sw.js：先頭が '/' の URL を先に入れています：${url}`);
    else if (!existsSync(join(OUT, url))) problems.push(`sw.js：先に入れる ${url} がありません`);
  }
  // ページの JS・CSS と、あとから読み込む JS（サービスワーカーの登録のコードなど）は、すべて先に入れる。
  const assetsDir = join(OUT, 'assets');
  const builtAssets = existsSync(assetsDir)
    ? readdirSync(assetsDir).filter((name) => /\.(js|css)$/.test(name)).map((name) => `assets/${name}`)
    : [];
  for (const url of new Set([...pageAssets.map((u) => u.replace(/^\.\//, '')), ...builtAssets])) {
    if (!precached.includes(url)) problems.push(`sw.js：${url} を先に入れていません（オフラインで開けません）`);
  }
  if (manifestUrl && !precached.includes(manifestUrl.replace(/^\.\//, ''))) problems.push('sw.js：マニフェストを先に入れていません');
  if (!/NavigationRoute/.test(sw) || !/createHandlerBoundToURL\(\s*["']index\.html["']\s*\)/.test(sw)) {
    problems.push('sw.js：ページを開くとき（ナビゲーション）に index.html を返していません');
  }
  if (!/SKIP_WAITING/.test(sw)) problems.push('sw.js：SKIP_WAITING を受けて切り替える形ではありません（新しい版を勝手に切り替えるおそれ）');
  // Google Fonts（CSS とフォントのファイル）：オフラインで取っておいた分がないときの代わりの返事（読み込みのエラーにしない）。
  const routes = sw.split('registerRoute(').slice(1);
  for (const host of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
    const route = routes.find((r) => r.startsWith(`/^https:\\/\\/${host.replaceAll('.', '\\.')}`));
    if (!route) problems.push(`sw.js：${host} を取っておく決まりがありません`);
    else if (!route.includes('handlerDidError')) problems.push(`sw.js：${host} が取れないとき（オフライン）の代わりの返事（handlerDidError）がありません`);
  }
  for (const m of sw.matchAll(/define\(\s*\[\s*["']\.\/([^"']+)["']/g)) {
    if (!existsSync(join(OUT, `${m[1]}.js`))) problems.push(`sw.js：読み込む ${m[1]}.js がありません`);
  }
  const total = precached.reduce((sum, url) => sum + (existsSync(join(OUT, url)) ? statSync(join(OUT, url)).size : 0), 0);
  if (total > MAX_PRECACHE_BYTES) problems.push(`sw.js：先に入れるファイルが大きすぎます（${(total / 1024).toFixed(0)} KB）`);
  if (problems.length === 0) {
    console.log(`check-pwa: 先に入れるファイル ${precached.length} 個（${(total / 1024).toFixed(1)} KB）`);
  }
}

// CSS の中の '/…' の url()。
const assetsDir = join(OUT, 'assets');
if (existsSync(assetsDir)) {
  for (const name of readdirSync(assetsDir).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(join(assetsDir, name), 'utf8');
    for (const m of css.matchAll(/url\(\s*["']?(\/[^"')]*)/gi)) problems.push(`assets/${name}：先頭が '/' の url() があります：${m[1]}`);
  }
}

if (problems.length > 0) {
  console.error(`check-pwa: ${show(OUT)} の検査に通りませんでした。`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-pwa: ${show(OUT)} の検査はすべて通りました（マニフェスト・アイコン・sw.js・index.html）。`);
