import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` で、エンジンもUIも1つのHTMLに入った版を dist-single/ に出す。
// `npm run build:report` で、試用の集計ページ（report.html）を1つのHTMLにして dist-report/ に出す（アプリの build とは別）。
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' || mode === 'report' ? [react(), viteSingleFile()] : [react()],
  build:
    mode === 'report'
      ? { outDir: 'dist-report', rolldownOptions: { input: fileURLToPath(new URL('./report.html', import.meta.url)) } }
      : { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'],
  },
}));
