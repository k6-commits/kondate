// ［集計を文にしてコピー］の文（純粋関数）。チームのチャットなどに貼る。家族につけた名前は入れず、家族A・家族B…で書く。
import type { Aggregate, FamilyRow } from './aggregate';
import {
  CLOCK_LABEL,
  COOKED_TARGET,
  MIN_DAYS,
  MIN_FAMILIES,
  STAR_GOAL,
  STAR_LEVEL_LABEL,
  STAR_MINIMUM,
  THOUGHT_TARGET,
  VERDICT_LABEL,
  checkinText,
  familyNote,
  familyText,
  percentText,
  periodText,
  reactionsText,
  violationText,
} from './aggregate';
import { formatJa } from '../engine/index';

/** 1週間の試用では測れない目安（ページと共有する文で同じ1行）。 */
export const NOT_MEASURABLE = '4週継続60%以上・前払い5組以上は、1週間の試用では測れません。';
/** 数え方（ページと共有する文で同じ）。 */
export const COUNT_RULE = '家で食べる献立の日は、献立の日から、みんな外で食べた日を除いた日です。記録なしの日は、作らなかった日として数えます。';
/** 「まだ分からない」の決まり（ページと共有する文で同じ1行）。 */
export const UNKNOWN_RULE = `家族が${MIN_FAMILIES}組より少ないか、日数が合わせて${MIN_DAYS}日より少ないうちは「まだ分からない」と出します（除外の違反は、1件でもあれば「届いていない」です）。`;

/** 北極星の判定の文（数が少ないうちは「まだ分からない」と、今の値での判定を添える）。 */
export function starVerdictText(star: Aggregate['star']): string {
  if (star.level === 'none') return STAR_LEVEL_LABEL.none;
  return star.enough ? STAR_LEVEL_LABEL[star.level] : `まだ分からない（今の値では「${STAR_LEVEL_LABEL[star.level]}」）`;
}

/** 家族ごとの北極星の文：「80%（4日／5日）」。 */
export function familyStarText(row: FamilyRow): string {
  if (row.star.level === 'none') return 'まだ答えていません';
  return `${percentText(row.star.notThought, row.star.planned, 'down')}（${row.star.notThought}日／${row.star.planned}日）`;
}

function familyLines(row: FamilyRow): string[] {
  const r = row.report;
  const d = r.days;
  return [
    `・${row.label}：${periodText(r)}（${CLOCK_LABEL[r.clock]}・${formatJa(r.madeOn)}に作成）／${familyText(r)}（${familyNote(r)}）`,
    `　献立の日 ${d.dinner}日：作った ${d.cooked}日（そのまま ${d.cookedAsPlanned}日・替えて ${d.cookedChanged}日）／作らなかった ${d.skipped}日／記録なし ${d.unconfirmed}日／みんな外食 ${d.everyoneOut}日／自分でラク日にした日 ${d.todayImpossible}日`,
    `　週末の答え（自分で考えた日／聞いた日）${checkinText(r)}／反応 ${reactionsText(r.reactions)}／除外の違反 ${violationText(r)}／読み取れなかった ${r.talk.unreadable}件（書き込み ${r.talk.messages}件）`,
  ];
}

/**
 * 共有する文。removed は外した家族のラベル（数には入っていない）。
 */
export function summaryText(agg: Aggregate, removed: string[] = []): string {
  const c = agg.criteria;
  const lines: string[] = [`きめとく 試用の集計（${agg.rows.length}家族）`];
  if (agg.madeOn) {
    const { first, last } = agg.madeOn;
    lines.push(`記録を作った日：${first === last ? formatJa(first) : `${formatJa(first)}〜${formatJa(last)}`}`);
  }
  if (agg.samples.length > 0) lines.push(`※見本の記録が入っています（${agg.samples.join('・')}）。`);
  if (removed.length > 0) lines.push(`外した記録：${removed.join('・')}（数に入れていません）`);
  if (agg.rows.length === 0) {
    lines.push('', 'まだ記録がありません。');
    return lines.join('\n');
  }

  lines.push(
    '',
    '【続行の目安（企画書 12章）】',
    `・提案の${COOKED_TARGET}%以上を作る：${percentText(c.cooked.cooked, c.cooked.planned, 'down')}（作った ${c.cooked.cooked}日／家で食べる献立の日 ${c.cooked.planned}日）→ ${VERDICT_LABEL[c.cooked.verdict]}`,
    `・自分で考えた日が半分以下：${percentText(c.thought.thought, c.thought.planned, 'up')}（自分で考えた ${c.thought.thought}日／聞いた日 ${c.thought.planned}日。${c.thought.of}家族のうち ${c.thought.answered}家族が答えました）→ ${VERDICT_LABEL[c.thought.verdict]}`,
    `・除外の違反 0件：${c.safety.violations}件${c.safety.families.length > 0 ? `（${c.safety.families.join('・')}）` : ''} → ${VERDICT_LABEL[c.safety.verdict]}`,
    `・${NOT_MEASURABLE}`,
    `※${UNKNOWN_RULE}${COUNT_RULE}`,
  );
  if (agg.demo.length > 0) lines.push(`※［翌日へ進む］で進めた記録（${agg.demo.join('・')}）も数に入っています。`);

  lines.push(
    '',
    `【北極星：考えずに済んだ夕食の割合（目標 ${STAR_GOAL}%・最低 ${STAR_MINIMUM}%）】`,
    agg.star.level === 'none'
      ? `・全体：${STAR_LEVEL_LABEL.none}`
      : `・全体：${percentText(agg.star.notThought, agg.star.planned, 'down')}（考えずに済んだ ${agg.star.notThought}日／聞いた日 ${agg.star.planned}日）→ ${starVerdictText(agg.star)}`,
    ...agg.rows.map((row) => `・${row.label}：${familyStarText(row)}`),
  );

  lines.push('', '【家族ごと】', ...agg.rows.flatMap(familyLines));
  const t = agg.totals;
  lines.push(
    `・合計：献立の日 ${t.dinner}日：作った ${t.cooked}日（そのまま ${t.cookedAsPlanned}日・替えて ${t.cookedChanged}日）／作らなかった ${t.skipped}日／記録なし ${t.unconfirmed}日／みんな外食 ${t.everyoneOut}日／自分でラク日にした日 ${t.todayImpossible}日／反応 ${reactionsText(t)}／除外の違反 ${t.violations}件／読み取れなかった ${t.unreadable}件（書き込み ${t.messages}件）`,
  );

  const notes = agg.rows.flatMap((row) => row.flags.map((f) => `・${row.label}：${f.text}`));
  if (notes.length > 0) lines.push('', '【気をつけること】', ...notes);

  if (agg.unreadable.length > 0) {
    lines.push('', '【読み取れなかった書き込み】');
    for (const g of agg.unreadable) {
      if (g.texts && g.texts.length > 0) lines.push(...g.texts.map((text) => `・${g.label}：「${text}」`));
      else lines.push(`・${g.label}：文は入っていません（${g.count}件）`);
    }
  }
  return lines.join('\n');
}
