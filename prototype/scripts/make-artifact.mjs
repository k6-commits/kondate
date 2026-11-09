#!/usr/bin/env node
// dist-single/index.html（vite build --mode single）から、claude.ai の Artifact として公開する
// 「ページの断片」dist-artifact/kimetoku.html を作り、公開の制約を検査する。だめなら exit 1。
//
// 断片の形（公開のときに <!doctype>・<html>・<head>・<body> で包まれる）：
//   <title>きめとく</title>
//   <meta name="claude:viewport-fit-sides" content="cover">
//   <link rel="stylesheet" href="https://fonts.googleapis.com/...">
//   <style>…インライン化した CSS…</style>
//   <div id="root"></div>
//   <script type="module">…インライン化した JS…</script>
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'dist-single', 'index.html');
const OUT_DIR = join(ROOT, 'dist-artifact');
const OUT = join(OUT_DIR, 'kimetoku.html');
const TITLE = 'きめとく';
const MAX_BYTES = 16 * 1024 * 1024;
const TITLE_WINDOW = 8 * 1024;
const FONT_HOST = 'https://fonts.googleapis.com/';
/** 自分のコード（バンドルに入るもの）。ライブラリの文字列を誤って拾わないように、検査はここで行う。 */
const OWN_SOURCES = ['src/ui', 'src/engine', 'src/data'];

const problems = [];
const rel = (p) => relative(ROOT, p);

function die(message) {
  console.error(`make-artifact: ${message}`);
  process.exit(1);
}

let html;
try {
  html = readFileSync(SOURCE, 'utf8');
} catch {
  die(`${rel(SOURCE)} がありません。先に「vite build --mode single」を実行してください。`);
}

// ---------------------------------------------------------------------------
// 1. 取り出す（script を先に抜いてから、残りの HTML で style と link を探す）
// ---------------------------------------------------------------------------

const scripts = [];
let shell = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_, attrs, body) => {
  if (/\bsrc\s*=/i.test(attrs)) problems.push(`外部の script を読み込んでいます：<script${attrs}>`);
  else if (body.trim()) scripts.push(body);
  return '';
});

const styles = [];
shell = shell.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, css) => {
  styles.push(css);
  return '';
});

const fontLinks = [];
for (const m of shell.matchAll(/<link\b[^>]*>/gi)) {
  const tag = m[0];
  const relAttr = (/\brel\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? '').toLowerCase();
  const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
  if (relAttr === 'stylesheet') {
    if (href.startsWith(FONT_HOST)) fontLinks.push(href);
    else problems.push(`Google Fonts 以外の stylesheet があります：${href}`);
  }
  // preconnect などは Artifact では使わないので落とす。
}

if (scripts.length === 0) problems.push('インライン化された script が見つかりません');
if (styles.length === 0) problems.push('インライン化された style が見つかりません');

const css = styles.join('\n');
for (const m of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi)) {
  if (!m[1].startsWith(FONT_HOST)) problems.push(`CSS が外部を読み込んでいます：@import ${m[1]}`);
}
for (const m of css.matchAll(/url\(\s*["']?([^"')]+)/gi)) {
  if (!m[1].startsWith('data:') && !m[1].startsWith('#')) problems.push(`CSS に外部の url() があります：${m[1]}`);
}

// ---------------------------------------------------------------------------
// 2. 組み立てる
// ---------------------------------------------------------------------------

const head = [
  `<title>${TITLE}</title>`,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  ...[...new Set(fontLinks)].map((href) => `<link rel="stylesheet" href="${href}">`),
];
const out = [
  ...head,
  `<style>${css}</style>`,
  '<div id="root"></div>',
  ...scripts.map((js) => `<script type="module">${js}</script>`),
  '',
].join('\n');

// ---------------------------------------------------------------------------
// 3. 検査する
// ---------------------------------------------------------------------------

const bytes = Buffer.byteLength(out, 'utf8');
if (bytes >= MAX_BYTES) problems.push(`大きすぎます：${bytes} バイト（16MB 未満にする）`);

const titleEnd = out.indexOf('</title>');
if (!out.startsWith(`<title>${TITLE}</title>`) || titleEnd < 0 || Buffer.byteLength(out.slice(0, titleEnd + 8)) > TITLE_WINDOW) {
  problems.push('タイトルが先頭8KB以内にありません');
}

// script と style の中身を除いた「外側」で、文書のタグと外部の読み込みを確かめる。
const outer = out
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
for (const tag of ['<!doctype', '<html', '<head', '<body']) {
  if (outer.toLowerCase().includes(tag)) problems.push(`断片に ${tag}> のタグが入っています`);
}
if (/<script\b[^>]*\bsrc\s*=/i.test(outer)) problems.push('外部の script の src があります');
for (const m of outer.matchAll(/<link\b[^>]*>/gi)) {
  if (!/\brel\s*=\s*["']?stylesheet/i.test(m[0]) || !m[0].includes(`href="${FONT_HOST}`)) {
    problems.push(`使えない link があります：${m[0]}`);
  }
}
if (/<(iframe|object|embed|img)\b/i.test(outer)) problems.push('外部の画像や埋め込みのタグがあります');
if ((outer.match(/<div id="root"><\/div>/g) ?? []).length !== 1) problems.push('<div id="root"></div> が1つではありません');

if (/<a\b[^>]*\bdownload\b/i.test(outer)) problems.push('<a download> を使っています');

// 全体（ライブラリを含む）で確かめられるもの。
if (/\bwindow\.print\b/.test(out)) problems.push('window.print を使っています');
if (/06c755/i.test(out)) problems.push('LINE の緑（#06C755）が入っています');
if (/https?:\/\/(localhost|127\.0\.0\.1)/i.test(out)) problems.push('開発用のサーバーの URL が入っています（Artifact では外部へ通信しない）');

// 自分のコードで使っていないこと（React などライブラリ内の文字列は対象にしない）。
function listSources(dir) {
  const abs = join(ROOT, dir);
  const files = [];
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) files.push(...listSources(join(dir, name)));
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) && !p.includes('__fixtures__')) files.push(p);
  }
  return files;
}
const FORBIDDEN_IN_SOURCE = [
  [/(?<![\w$.])(alert|confirm|prompt)\s*\(/, 'alert( / confirm( / prompt('],
  [/\bwindow\.(alert|confirm|prompt|open|print)\b/, 'window.alert / confirm / prompt / open / print'],
  [/\bdownload\s*=\s*[{"']|setAttribute\(\s*["']download/, 'download 属性（<a download>）'],
  [/<iframe\b/i, '<iframe>'],
  [/06c755/i, 'LINE の緑（#06C755）'],
];
for (const file of OWN_SOURCES.flatMap(listSources)) {
  const text = readFileSync(file, 'utf8');
  for (const [re, label] of FORBIDDEN_IN_SOURCE) {
    if (re.test(text)) problems.push(`${rel(file)} で ${label} を使っています`);
  }
}

if (problems.length > 0) {
  console.error('make-artifact: 検査に通りませんでした。');
  for (const p of problems) console.error(`  - ${p}`);
  rmSync(OUT, { force: true }); // 古い出力を残さない
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, out);
console.log(`make-artifact: ${rel(OUT)} を作りました（${(bytes / 1024).toFixed(1)} KB、script ${scripts.length}・style ${styles.length}・font ${fontLinks.length}）。検査はすべて通りました。`);
