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

/**
 * LLM に送る前に id に置き換える名前か。エンジン（parser の名前の照合）が名前として読むものと同じにする：
 * 2文字以上か、1文字ならかな（ひらがな・カタカナ）でないもの（漢字・英字など）。
 * かな1文字は、ほかの言葉の一部（「ゆでたまご」の「ゆ」）に当たりやすく、エンジンも名前として読まない。
 * 英字1文字（「K」）はエンジンが名前として読むので、置き換えないと LLM に名前が渡る。
 * 画面の maskNames（src/ui/ai.ts）も同じ決まり。照合（nicknameIn）は、これより厳しい usableNickname を使う。
 */
export function maskableNickname(nickname: string): boolean {
  const base = nickname.normalize('NFKC').trim();
  if (!base) return false;
  return [...base].length > 1 || /[^\u3040-\u309f]/u.test(toHiragana(base));
}

/** 文の中に出てくる家族のニックネーム（長いものを優先）。なければ undefined。 */
export function nicknameIn(text: string, members: Pick<Member, 'nickname'>[]): string | undefined {
  const folded = foldName(text);
  return members
    .map((m) => m.nickname.trim())
    .filter((n) => usableNickname(n) && folded.includes(foldName(n)))
    .sort((a, b) => foldName(b).length - foldName(a).length)[0];
}
