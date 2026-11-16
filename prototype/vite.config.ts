import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { PWA_OUT_DIR, PWA_PUBLIC_DIR, pwaPlugins } from './vite.pwa.ts';

// `npm run build:single` で、エンジンもUIも1つのHTMLに入った版を dist-single/ に出す。
// `npm run build:report` で、試用の集計ページ（report.html）を1つのHTMLにして dist-report/ に出す（アプリの build とは別）。
// `npm run build:pwa` で、ホーム画面に置く版（PWA）を dist-pwa/ に出す（設定は vite.pwa.ts。この mode のときだけ読む）。
export default defineConfig(async ({ mode }) => ({
  ...(mode === 'pwa' ? { base: './', publicDir: PWA_PUBLIC_DIR } : {}),
  plugins:
    mode === 'single' || mode === 'report'
      ? [react(), viteSingleFile()]
      : mode === 'pwa'
        ? [react(), ...(await pwaPlugins())]
        : [react()],
  build:
    mode === 'report'
      ? { outDir: 'dist-report', rolldownOptions: { input: fileURLToPath(new URL('./report.html', import.meta.url)) } }
      : { outDir: mode === 'single' ? 'dist-single' : mode === 'pwa' ? PWA_OUT_DIR : 'dist' },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'],
  },
}));
