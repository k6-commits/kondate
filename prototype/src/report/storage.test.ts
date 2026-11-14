// 集計ページの保存（storage.ts）と見本（sample.ts）。
import { TRIAL_REPORT_MARKER, formatTrialReport, trialReport } from '../engine/index';
import { defaultCatalog } from '../data/index';
import { aggregate, readPaste } from './aggregate';
import { SAMPLE_TEXT } from './sample';
import { isSampleKey } from './sampleKeys';
import type { StorageLike } from './storage';
import { EMPTY_SAVED, MAX_NAME_LENGTH, REPORT_STORAGE_KEY, loadSaved, saveSaved } from './storage';
import { calendarFamily, demoFamily, paidFamily } from './__fixtures__/records';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('保存（このブラウザの localStorage だけ）', () => {
  it('保存して読み直す。空になったら消す', () => {
    const s = new MemoryStorage();
    expect(saveSaved(s, { text: 'abc', names: { r1: '田中さん', r2: '  ' }, removed: ['r3'] })).toBe(true);
    expect(JSON.parse(s.getItem(REPORT_STORAGE_KEY)!)).toEqual({ v: 1, text: 'abc', names: { r1: '田中さん' }, removed: ['r3'] });
    expect(loadSaved(s)).toEqual({ text: 'abc', names: { r1: '田中さん' }, removed: ['r3'] });
    expect(saveSaved(s, EMPTY_SAVED)).toBe(true);
    expect(s.getItem(REPORT_STORAGE_KEY)).toBeNull();
  });

  it('使えない・壊れた・版の違う保存は、空として扱う（例外を外に出さない）', () => {
    expect(loadSaved(null)).toEqual(EMPTY_SAVED);
    expect(loadSaved(throwing)).toEqual(EMPTY_SAVED);
    expect(saveSaved(null, { text: 'x', names: {}, removed: [] })).toBe(false);
    expect(saveSaved(throwing, { text: 'x', names: {}, removed: [] })).toBe(false);
    expect(saveSaved(throwing, EMPTY_SAVED)).toBe(false);
    const s = new MemoryStorage();
    for (const raw of ['{', 'null', '[]', '"text"', JSON.stringify({ v: 2, text: 'x' })]) {
      s.setItem(REPORT_STORAGE_KEY, raw);
      expect(loadSaved(s)).toEqual(EMPTY_SAVED);
    }
  });

  it('読み込むときに、形の違う値を落とし、名前の長さをそろえる', () => {
    const s = new MemoryStorage();
    const long = 'あ'.repeat(MAX_NAME_LENGTH + 5);
    s.setItem(REPORT_STORAGE_KEY, JSON.stringify({ v: 1, text: 7, names: { a: 'A家', b: 3, c: long, d: '' }, removed: ['x', 5, null] }));
    expect(loadSaved(s)).toEqual({ text: '', names: { a: 'A家', c: 'あ'.repeat(MAX_NAME_LENGTH) }, removed: ['x'] });
  });
});

describe('見本（まだ記録が届いていないときに試す）', () => {
  it('エンジンで作った3家族分。読めて、どれにも見本の印が付く', () => {
    const reading = readPaste(SAMPLE_TEXT, isSampleKey);
    expect(reading.errors).toEqual([]);
    expect(reading.families.map((f) => [f.label, f.sample])).toEqual([
      ['家族A', true],
      ['家族B', true],
      ['家族C', true],
    ]);
    expect(SAMPLE_TEXT.split(TRIAL_REPORT_MARKER)).toHaveLength(4);
    const agg = aggregate(reading.families);
    expect(agg.samples).toEqual(['家族A', '家族B', '家族C']);
    expect(agg.demo).toEqual(['家族C']);
    // 目安の3つの判定が、それぞれ違う形で出る（届いた・届いていない・まだ分からない）
    expect(new Set(Object.values(agg.criteria).map((c) => c.verdict))).toEqual(new Set(['reached', 'missed', 'unknown']));
  });

  it('見本に、台本の家族の呼び名は入っていない', () => {
    for (const name of [calendarFamily(), paidFamily(), demoFamily()].flatMap((m) => m.names)) expect(SAMPLE_TEXT).not.toContain(name);
  });

  it('本物の記録は見本と見分ける（同じ台本でも、日付の進め方などが違えば別の記録）', () => {
    const made = calendarFamily();
    const real = trialReport(made.state, defaultCatalog, { clock: 'unknown' });
    const families = readPaste(formatTrialReport(real), isSampleKey).families;
    expect(families).toHaveLength(1);
    expect(families[0].sample).toBeUndefined();
  });
});
