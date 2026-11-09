// トークの上に重なる全画面のシート（LIFF に似せた画面）。
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Sheet({
  id,
  title,
  onBack,
  children,
  backLabel = '戻る',
}: {
  id: string;
  title: string;
  onBack: () => void;
  children: ReactNode;
  backLabel?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [id]);
  return (
    <section className="sheet" data-sheet={id} aria-labelledby={`${id}-title`}>
      <header className="sheet-head">
        <button type="button" className="back-btn" onClick={onBack}>
          <Icon name="back" size={20} />
          {backLabel}
        </button>
        <h2 id={`${id}-title`} className="sheet-title" tabIndex={-1} ref={headingRef}>
          {title}
        </h2>
      </header>
      <div className="sheet-body">{children}</div>
    </section>
  );
}
