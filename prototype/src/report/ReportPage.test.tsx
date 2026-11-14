// @vitest-environment jsdom
// 試用の集計ページ：エンジンで作った3家族の記録と、途中で切れた記録を貼り付けて、表・判定・読めなかった記録・名前・外す・
// すべて消す（ページの中の確認）・コピー・保存を確かめる。
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TRIAL_REPORT_MARKER, formatTrialReport, trialReport } from '../engine/index';
import { defaultCatalog } from '../data/index';
import type { TrialReport } from '../engine/index';
import { ReportPage } from './ReportPage';
import type { StorageLike } from './storage';
import { REPORT_STORAGE_KEY } from './storage';
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

const A = calendarFamily();
const B = paidFamily();
const C = demoFamily();
const NAMES = [...A.names, ...B.names, ...C.names];
const BROKEN = `${TRIAL_REPORT_MARKER}{"v":1,"from":"2026-11-16","to":`;
const PASTED = ['田中です。1週間ありがとうございました。', A.text, '', '鈴木です', B.text, '', C.text, '', '佐藤です（途中で切れました）', BROKEN].join('\n');

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const plannedOf = (r: TrialReport) => r.days.dinner - r.days.everyoneOut;

const pasteArea = () => screen.getByLabelText('家族から届いた試用の記録を、まとめて貼り付けてください') as HTMLTextAreaElement;
const paste = (text: string) => fireEvent.change(pasteArea(), { target: { value: text } });
const familyTable = () => screen.getByRole('table', { name: '家族ごとの表' });
const bodyRows = () => [...familyTable().querySelectorAll('tbody tr')] as HTMLTableRowElement[];
const criteriaRow = (key: string) => screen.getByRole('table', { name: '続行の目安（企画書 12章）' }).querySelector(`tr[data-row="${key}"]`) as HTMLElement;
const status = () => screen.getByTestId('paste-status').textContent;

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: writeText ? { writeText } : undefined });
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator, 'clipboard');
  vi.restoreAllMocks();
});

describe('台本の記録（エンジンで作った）', () => {
  it('3家族とも名前を含まず、それぞれ読める形', () => {
    for (const m of [A, B, C]) {
      for (const name of m.names) expect(m.text).not.toContain(name);
      expect(m.text.length).toBeLessThan(4500);
    }
    expect(C.report.clock).toBe('demo');
    expect(A.report.checkins).toHaveLength(1);
    expect(B.report.talk.unreadableTexts).toEqual(['ふにゃふにゃ']);
  });
});

describe('集計ページ：貼り付けて読む', () => {
  it('3家族と、読めなかった記録を出す。目安の表・北極星・家族ごとの表・読み取れなかった書き込み', () => {
    render(<ReportPage storage={new MemoryStorage()} />);
    expect(screen.getByRole('heading', { level: 1, name: '試用の集計' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '見本を入れてみる' })).toBeTruthy();

    paste(PASTED);
    expect(status()).toBe('3家族分の記録を読みました。');
    expect(screen.queryByTestId('sample-banner')).toBeNull(); // 本物の記録（見本ではない）
    const errors = screen.getByTestId('paste-errors');
    expect(within(errors).getByText('読めなかった記録があります（1件）')).toBeTruthy();
    expect(within(errors).getByText('4件目：記録の数字の行を読めませんでした（途中で切れているかもしれません）')).toBeTruthy();

    // 続行の目安（数はエンジンの記録から数え直す）
    const reports = [A.report, B.report, C.report];
    const planned = sum(reports.map(plannedOf));
    const cooked = sum(reports.map((r) => r.days.cooked));
    expect(planned).toBeGreaterThanOrEqual(12);
    const cookedRow = criteriaRow('cooked');
    expect(cookedRow.textContent).toContain(`${Math.floor((cooked * 100) / planned)}%`);
    expect(cookedRow.textContent).toContain(`作った ${cooked}日／家で食べる献立の日 ${planned}日`);
    expect(within(cookedRow).getByText(cooked * 100 >= planned * 70 ? '届いた' : '届いていない')).toBeTruthy();

    const answered = reports.filter((r) => r.checkins.length > 0);
    expect(answered).toHaveLength(2);
    const thought = sum(answered.flatMap((r) => r.checkins.map((c) => c.thoughtDays)));
    const asked = sum(answered.flatMap((r) => r.checkins.map((c) => c.plannedDays)));
    const thoughtRow = criteriaRow('thought');
    expect(thoughtRow.textContent).toContain(`${Math.ceil((thought * 100) / asked)}%`);
    expect(thoughtRow.textContent).toContain('3家族のうち 2家族が答えました');
    expect(within(thoughtRow).getByText('まだ分からない')).toBeTruthy();

    const safetyRow = criteriaRow('safety');
    expect(safetyRow.textContent).toContain('0件');
    expect(within(safetyRow).getByText('届いた')).toBeTruthy();
    expect(screen.getByText('4週継続60%以上・前払い5組以上は、1週間の試用では測れません。')).toBeTruthy();
    expect(screen.getByTestId('demo-callout').textContent).toContain('（家族C）');

    // 北極星
    expect(screen.getByTestId('star-value').textContent).toBe(`${Math.floor(((asked - thought) * 100) / asked)}%`);
    expect(screen.getByTestId('star-verdict').textContent).toMatch(/^まだ分からない/);

    // 家族ごとの表
    const rows = bodyRows();
    expect(rows.map((r) => r.dataset.family)).toEqual(['家族A', '家族B', '家族C']);
    expect(rows[0].textContent).toContain('カレンダーどおり');
    expect(rows[0].textContent).toContain(`${A.report.days.cooked}日（${A.report.days.cookedAsPlanned}／${A.report.days.cookedChanged}）`);
    expect(rows[1].textContent).toContain('有料版');
    expect(rows[2].textContent).toContain('［翌日へ進む］');
    expect(rows[2].textContent).toContain('本物の日付ではありません');
    expect(rows[2].textContent).toContain('まだ'); // 週末の答え
    const foot = familyTable().querySelector('tfoot tr') as HTMLElement;
    expect(foot.textContent).toContain(`${sum(reports.map((r) => r.days.dinner))}日`);

    // 気をつけること
    const demoFlag = screen.getByText('［翌日へ進む］で進めた記録です。本物の日付ではありません。').closest('li') as HTMLElement;
    expect(demoFlag.textContent).toContain('家族C');
    const unconfirmed = C.report.days.unconfirmed;
    expect(unconfirmed).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(`記録なしの日が多いです（${plannedOf(C.report)}日のうち ${unconfirmed}日）。作った割合が低めに出ているかもしれません。`)).toBeTruthy();

    // 読み取れなかった書き込み
    const unreadable = screen.getByRole('heading', { name: '読み取れなかった書き込み' }).closest('section') as HTMLElement;
    expect(within(unreadable).getByText('「ふにゃふにゃ」')).toBeTruthy();
    expect(unreadable.textContent).toContain('家族B');

    // 名前は画面のどこにも出ない（記録に入っていない）
    for (const name of NAMES) expect(document.body.textContent).not.toContain(name);
  });

  it('記録の印がなければ、そう知らせる。同じ記録を2回貼ったら1つとして数える', () => {
    render(<ReportPage storage={new MemoryStorage()} />);
    paste('こんにちは。記録はあとで送ります。');
    expect(status()).toBe('記録が見つかりませんでした。「きめとく試用データ:」で始まる行も、いっしょに貼り付けてください。');
    expect(screen.getByText('読める記録がまだありません。上の欄の案内を見てください。')).toBeTruthy();
    paste(`${A.text}\n${B.text}\n${A.text}`);
    expect(status()).toBe('2家族分の記録を読みました。同じ記録が重なっていたので、1つとして数えています（1件）。');
    expect(bodyRows()).toHaveLength(2);
  });
});

describe('集計ページ：名前・外す・すべて消す・保存', () => {
  it('名前はこのブラウザにだけ保存し、表に出す。外した家族は数に入れず、戻せる', () => {
    const storage = new MemoryStorage();
    const first = render(<ReportPage storage={storage} />);
    paste(PASTED);
    fireEvent.change(screen.getByLabelText('家族Aの名前'), { target: { value: '田中さん' } });
    expect(bodyRows()[0].querySelector('th')?.textContent).toContain('田中さん');
    expect(JSON.parse(storage.getItem(REPORT_STORAGE_KEY)!).names).toEqual({ [Object.keys(JSON.parse(storage.getItem(REPORT_STORAGE_KEY)!).names)[0]]: '田中さん' });

    const before = criteriaRow('cooked').textContent;
    fireEvent.click(screen.getByRole('button', { name: '家族Bを外す' }));
    expect(status()).toBe('家族Bを外しました。数には入れません。');
    expect(bodyRows().map((r) => r.dataset.family)).toEqual(['家族A', '家族C']);
    const planned = plannedOf(A.report) + plannedOf(C.report);
    const cooked = A.report.days.cooked + C.report.days.cooked;
    expect(criteriaRow('cooked').textContent).toContain(`作った ${cooked}日／家で食べる献立の日 ${planned}日`);
    expect(criteriaRow('cooked').textContent).not.toBe(before);
    const restore = screen.getByRole('button', { name: '家族Bを戻す' });
    expect(document.activeElement).toBe(restore);
    expect(screen.queryByText('「ふにゃふにゃ」')).toBeNull();

    // 閉じて開き直しても、貼り付けた文・名前・外した家族はそのまま
    first.unmount();
    render(<ReportPage storage={storage} />);
    expect(pasteArea().value).toBe(PASTED);
    expect((screen.getByLabelText('家族Aの名前') as HTMLInputElement).value).toBe('田中さん');
    expect(bodyRows().map((r) => r.dataset.family)).toEqual(['家族A', '家族C']);
    fireEvent.click(screen.getByRole('button', { name: '家族Bを戻す' }));
    expect(bodyRows().map((r) => r.dataset.family)).toEqual(['家族A', '家族B', '家族C']);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '家族Bを外す' }));
    expect(status()).toBe('家族Bを戻しました。');
  });

  it('［すべて消す］は、ページの中で確かめてから消す（confirm は使わない）', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    const storage = new MemoryStorage();
    render(<ReportPage storage={storage} />);
    paste(PASTED);
    fireEvent.change(screen.getByLabelText('家族Cの名前'), { target: { value: '佐藤さん' } });

    fireEvent.click(screen.getByRole('button', { name: 'すべて消す' }));
    const question = screen.getByRole('group', { name: '貼り付けた記録と、家族につけた名前を、すべて消します。元には戻せません。' });
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'やめる' }));
    fireEvent.click(within(question).getByRole('button', { name: 'やめる' }));
    expect(screen.queryByRole('group', { name: /すべて消します/ })).toBeNull();
    expect(pasteArea().value).toBe(PASTED);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'すべて消す' }));

    fireEvent.click(screen.getByRole('button', { name: 'すべて消す' }));
    fireEvent.click(within(screen.getByRole('group', { name: /すべて消します/ })).getByRole('button', { name: 'すべて消す' }));
    expect(pasteArea().value).toBe('');
    expect(document.activeElement).toBe(pasteArea());
    expect(status()).toBe('すべて消しました。');
    expect(storage.getItem(REPORT_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: '見本を入れてみる' })).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('保存できないブラウザでも動き、そう知らせる', () => {
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
    render(<ReportPage storage={throwing} />);
    expect(screen.getByText('このブラウザには保存できません。ページを閉じると、貼り付けた文と名前は消えます。')).toBeTruthy();
    paste(PASTED);
    expect(bodyRows()).toHaveLength(3);
  });

  it('見本を入れて試し、［見本を消す］で消す', () => {
    render(<ReportPage storage={new MemoryStorage()} />);
    fireEvent.click(screen.getByRole('button', { name: '見本を入れてみる' }));
    expect(screen.getByTestId('sample-banner')).toBeTruthy();
    expect(bodyRows()).toHaveLength(3);
    expect(bodyRows().every((r) => r.textContent?.includes('見本'))).toBe(true);
    // 本物の記録を足しても、見本だけを消せる（見本と同じ台本でも、文を入れなかった記録は別の記録）
    const real = formatTrialReport(trialReport(B.state, defaultCatalog, { clock: 'calendar' }));
    paste(`${pasteArea().value}\n\n${real}`);
    expect(bodyRows()).toHaveLength(4);
    expect(bodyRows()[3].textContent).not.toContain('見本');
    fireEvent.click(screen.getByRole('button', { name: '見本を消す' }));
    expect(screen.queryByTestId('sample-banner')).toBeNull();
    expect(bodyRows().map((r) => r.dataset.family)).toEqual(['家族A']);
    expect(pasteArea().value.trim()).toBe(real);
  });
});

describe('集計ページ：集計を文にしてコピー', () => {
  it('クリックの中でクリップボードに書く。名前は入れない', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    setClipboard(writeText);
    render(<ReportPage storage={new MemoryStorage()} />);
    paste(PASTED);
    fireEvent.change(screen.getByLabelText('家族Aの名前'), { target: { value: '田中さん' } });
    fireEvent.click(screen.getByRole('button', { name: '家族Cを外す' }));
    fireEvent.click(screen.getByRole('button', { name: '集計を文にしてコピー' }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text.split('\n')[0]).toBe('きめとく 試用の集計（2家族）');
    expect(text).toContain('外した記録：家族C（数に入れていません）');
    expect(text).toContain('【続行の目安（企画書 12章）】');
    expect(text).toContain('・4週継続60%以上・前払い5組以上は、1週間の試用では測れません。');
    expect(text).toContain('・家族B：「ふにゃふにゃ」');
    expect(text).not.toContain('田中さん');
    for (const name of NAMES) expect(text).not.toContain(name);
    await waitFor(() => expect(screen.getByText('コピーしました。チームのチャットなどに貼り付けてください。')).toBeTruthy());
  });

  it('コピーできなければ、文を出して選ぶ（クリップボードがない・断られた）', async () => {
    setClipboard(undefined);
    render(<ReportPage storage={new MemoryStorage()} />);
    paste(PASTED);
    fireEvent.click(screen.getByRole('button', { name: '集計を文にしてコピー' }));
    const area = (await screen.findByLabelText('集計の文')) as HTMLTextAreaElement;
    expect(area.readOnly).toBe(true);
    expect(area.value.split('\n')[0]).toBe('きめとく 試用の集計（3家族）');
    expect(document.activeElement).toBe(area);
    expect(screen.getByText('コピーできませんでした。下の文を選んで、コピーしてください。')).toBeTruthy();

    const rejected = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    setClipboard(rejected);
    fireEvent.click(screen.getByRole('button', { name: '家族Aを外す' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '集計を文にしてコピー' }));
    });
    expect(rejected).toHaveBeenCalledTimes(1);
    // 出している文は、今の集計（家族Aを外したあと）
    await waitFor(() => expect((screen.getByLabelText('集計の文') as HTMLTextAreaElement).value).toContain('外した記録：家族A'));
  });
});
