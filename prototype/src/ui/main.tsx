import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Artifact として公開するときは <html> が外で作られるので、言語をここで指定する（和文の字形と読み上げのため）。
document.documentElement.lang = 'ja';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
