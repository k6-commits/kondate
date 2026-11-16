#!/usr/bin/env node
// ホーム画面に置く版（PWA）のアイコンの PNG を、元の絵 public-pwa/icons/icon.svg から作る。
// 作った PNG はリポジトリに入れておく（npm run check・build:pwa では作らない。絵を変えたときだけ実行する）。
//
// 使い方（Playwright の Chromium で描く。Playwright はこのプロジェクトの依存には入れていない）：
//   NODE_PATH=<playwright が入っている node_modules> node scripts/make-icons.mjs
//
// 作るもの（public-pwa/icons/）：
//   icon-192.png・icon-512.png      … マニフェストの purpose: any（角を丸めた地。角の外は透明）
//   icon-maskable-512.png           … マニフェストの purpose: maskable（地を全面に。茶碗は中心の安全な円の内側）
//   apple-touch-icon.png（180×180） … iPhone・iPad のホーム画面（透明を使わない。角の丸めは iOS が付ける）
//   favicon-32.png                  … ブラウザのタブ
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = join(ROOT, 'public-pwa', 'icons');
const SOURCE = join(ICON_DIR, 'icon.svg');

/** shape: 'rounded' は元の絵のまま、'square' は地（#tile）の角の丸めをなくす。 */
const OUTPUTS = [
  { file: 'icon-192.png', size: 192, shape: 'rounded' },
  { file: 'icon-512.png', size: 512, shape: 'rounded' },
  { file: 'icon-maskable-512.png', size: 512, shape: 'square' },
  { file: 'apple-touch-icon.png', size: 180, shape: 'square' },
  { file: 'favicon-32.png', size: 32, shape: 'rounded' },
];

function die(message) {
  console.error(`make-icons: ${message}`);
  process.exit(1);
}

const svg = readFileSync(SOURCE, 'utf8');
const TILE = /<rect\b[^>]*\bid="tile"[^>]*>/;
const tile = TILE.exec(svg)?.[0];
if (!tile || !/\brx="[^"]*"/.test(tile)) die(`${relative(ROOT, SOURCE)} に <rect id="tile" rx="…"> がありません。`);
if (!/<g\b[^>]*\bid="mark"/.test(svg)) die(`${relative(ROOT, SOURCE)} に <g id="mark"> がありません。`);
const variants = {
  rounded: svg,
  square: svg.replace(TILE, tile.replace(/\brx="[^"]*"/, 'rx="0"')),
};

let playwright;
try {
  playwright = createRequire(import.meta.url)('playwright');
} catch {
  die('playwright が見つかりません。NODE_PATH に playwright の入った node_modules を指定して実行してください。');
}

const browser = await playwright.chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, shape } of OUTPUTS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${variants[shape]}`,
    );
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    // 念のため、PNG の大きさを確かめる（IHDR の幅と高さ）。
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width !== size || height !== size) die(`${file} が ${width}×${height} になりました（${size}×${size} のはず）。`);
    writeFileSync(join(ICON_DIR, file), png);
    console.log(`make-icons: ${relative(ROOT, join(ICON_DIR, file))}（${size}×${size}、${(png.length / 1024).toFixed(1)} KB）`);
  }
} finally {
  await browser.close();
}
