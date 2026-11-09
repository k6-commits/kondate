// サーバーのログ。利用者の本文・トークン・シークレット・LINE の ID は出さない（呼ぶ側も meta に入れない）。

export type LogMeta = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

function format(message: string, meta?: LogMeta): string {
  if (!meta) return `[kimetoku] ${message}`;
  const parts = Object.entries(meta)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  return parts.length > 0 ? `[kimetoku] ${message} (${parts.join(', ')})` : `[kimetoku] ${message}`;
}

export const consoleLogger: Logger = {
  info: (message, meta) => console.log(format(message, meta)),
  warn: (message, meta) => console.warn(format(message, meta)),
  error: (message, meta) => console.error(format(message, meta)),
};

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** テスト用：ログを配列にためる。 */
export function memoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (message, meta) => lines.push(format(message, meta)),
    warn: (message, meta) => lines.push(format(message, meta)),
    error: (message, meta) => lines.push(format(message, meta)),
  };
}

/**
 * 例外の種類だけを返す（message は返さない）。
 * JSON.parse などの例外の message には入力の一部が入ることがあるため、ログには種類だけを出す。
 */
export function errorKind(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return typeof code === 'string' && /^[A-Z_]+$/.test(code) ? `${e.name}:${code}` : e.name;
  }
  return typeof e;
}
