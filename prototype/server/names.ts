// 名前の照合に使う小さな道具（LLM への名前の置き換えと、メンションの扱いで使う）。
import type { Member } from '../src/engine/index';

export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 照合用：NFKC、カタカナ→ひらがな、空白の除去、小文字化。 */
export function foldName(s: string): string {
  return toHiragana(s.normalize('NFKC')).replace(/\s+/g, '').toLowerCase();
}

const HAN_CHAR = /^\p{Script=Han}$/u;

/**
 * 名前として照合してよいか。1文字の名前は漢字のときだけ使う
 * （かなや英字1文字は、ほかの言葉の一部に当たりやすい）。
 */
export function usableNickname(nickname: string): boolean {
  const base = nickname.normalize('NFKC').trim();
  if (!base) return false;
  return [...base].length > 1 || HAN_CHAR.test(base);
}

/** 文の中に出てくる家族のニックネーム（長いものを優先）。なければ undefined。 */
export function nicknameIn(text: string, members: Pick<Member, 'nickname'>[]): string | undefined {
  const folded = foldName(text);
  return members
    .map((m) => m.nickname.trim())
    .filter((n) => usableNickname(n) && folded.includes(foldName(n)))
    .sort((a, b) => foldName(b).length - foldName(a).length)[0];
}
