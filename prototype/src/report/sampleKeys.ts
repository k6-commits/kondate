// 見本の記録を見分ける（見本の文を一度だけ読んで、記録の鍵を覚える）。
import { readPaste } from './aggregate';
import { SAMPLE_TEXT } from './sample';

let keys: Set<string> | null = null;

/** 見本の記録の鍵か。 */
export function isSampleKey(key: string): boolean {
  keys ??= new Set(readPaste(SAMPLE_TEXT).families.map((f) => f.key));
  return keys.has(key);
}
