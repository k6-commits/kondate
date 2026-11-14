import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReportPage } from './ReportPage';
import { browserStorage } from './storage';
// 色・字・ボタンなどは、アプリと同じもの（styles.css のトークンとクラス）を使う。
import '../ui/styles.css';
import './report.css';

// Artifact として公開するときは <html> が外で作られるので、言語をここで指定する（和文の字形と読み上げのため）。
document.documentElement.lang = 'ja';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ReportPage storage={browserStorage()} />
    </StrictMode>,
  );
}
