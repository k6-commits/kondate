// シークレットの比較・署名・ハッシュ。
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 文字列を一定時間で比べる。両方を SHA-256 にしてから timingSafeEqual で比べるので、
 * 長さが違っても例外を出さず、長さの違いも時間に出ない。
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** HMAC-SHA256 を base64 で（LINE の x-line-signature と同じ形）。 */
export function hmacSha256Base64(secret: string, body: Uint8Array | string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 「Authorization: Bearer xxx」からトークンを取り出す。なければ null。 */
export function bearerToken(header: string | undefined | null): string | null {
  if (!header) return null;
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header);
  return m ? m[1] : null;
}
