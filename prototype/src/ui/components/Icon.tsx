// インラインの SVG アイコン（絵文字は使わない）。色は currentColor。
import type { ReactNode } from 'react';

export type IconName =
  | 'week'
  | 'bowl'
  | 'basket'
  | 'family'
  | 'alert'
  | 'check'
  | 'back'
  | 'next'
  | 'chevronDown'
  | 'chevronUp'
  | 'help'
  | 'copy'
  | 'bell'
  | 'plus'
  | 'close'
  | 'edit'
  | 'trash'
  | 'snow'
  | 'search';

const PATHS: Record<IconName, ReactNode> = {
  week: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
    </>
  ),
  bowl: (
    <>
      <path d="M3 12h18c0 4.1-3.4 7.5-7.5 7.5h-3C6.4 19.5 3 16.1 3 12z" />
      <path d="M9 21h6M13.5 9.5 20 3.5M10.5 9.5 17 3" />
    </>
  ),
  basket: (
    <>
      <path d="M3.5 9.5h17l-1.7 9a2 2 0 0 1-2 1.6H7.2a2 2 0 0 1-2-1.6z" />
      <path d="m8.5 9.5 3-5.5M15.5 9.5l-3-5.5M9.5 13.5V17M14.5 13.5V17" />
    </>
  ),
  family: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5c0-3.1 2.5-5.6 5.5-5.6s5.5 2.5 5.5 5.6" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M16 14.1c.3-.1.7-.1 1-.1 2.2 0 4 1.8 4 4.3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.8 21 19.5H3z" />
      <path d="M12 10v4.4M12 17.1v.2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M5 12h13M13 6l6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.8-1.1 1.5v.6M12 16.8v.2" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />,
  snow: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
};

export function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  );
}

/** きめとくの印（朱の判子）。 */
export function Hanko({ size = 36 }: { size?: number }) {
  return (
    <span className="hanko" style={{ width: size, height: size }} aria-hidden="true">
      <span className="hanko-text">きめ</span>
    </span>
  );
}
