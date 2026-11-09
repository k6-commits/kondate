// 週の振り返りと、カードのテキスト化（LINE 用）。
import type { AppState, Card, Catalog, ISODate, WeeklySummary } from './types';
import { AISLE_LABEL, AISLE_ORDER } from './types';
import { addDays, formatJa, weekStartOf } from './dates';
import { findDishIn, ingredientsOf } from './context';
import { absentText, dishName, mealLine, mealMinutes, namesLine, newDishHint, servingsText, statusLabel, weekLines } from './text';

/** 公開API：その週の振り返り。 */
export function weeklySummary(state: AppState, catalog: Catalog, weekStart: ISODate): WeeklySummary {
  const end = addDays(weekStart, 6);
  const inWeek = (d: ISODate) => d >= weekStart && d <= end;
  const meals = state.meals.filter((m) => inWeek(m.date) && m.dishIds.length > 0);
  const records = state.history.filter((r) => inWeek(r.date));

  const cookedDates = new Set<ISODate>();
  for (const m of meals) if (m.status === 'cooked') cookedDates.add(m.date);
  for (const r of records) if (r.status === 'cooked') cookedDates.add(r.date);
  const plannedDates = new Set(meals.map((m) => m.date));

  const skipped = new Set<ISODate>();
  for (const m of meals) if (m.status === 'skipped') skipped.add(m.date);
  for (const r of records) if (r.status === 'skipped') skipped.add(r.date);

  const greatCount = new Map<string, number>();
  for (const r of records) {
    if (r.status !== 'cooked') continue;
    const main = r.dishIds[0];
    if (!main) continue;
    const n = r.reactions.filter((x) => x.reaction === 'great').length;
    if (n > 0) greatCount.set(main, (greatCount.get(main) ?? 0) + n);
  }
  const topDishIds = [...greatCount.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);

  const usedIngredients = new Set<string>();
  for (const m of meals) {
    if (m.status !== 'cooked') continue;
    for (const id of m.dishIds) {
      const dish = findDishIn(state.household, catalog, id);
      if (!dish) continue;
      for (const di of ingredientsOf(state.household, dish)) usedIngredients.add(di.ingredientId);
    }
  }
  const usedUpIngredientIds = state.inventory
    .filter((i) => i.level === 'none' && usedIngredients.has(i.ingredientId))
    .map((i) => i.ingredientId)
    .sort();

  // 過ぎた献立日のうち、作った・作らなかったの記録がない日（「分からない」日。0日とは言わない）。
  const unconfirmedDays = [...plannedDates].filter((d) => d < state.today && !cookedDates.has(d) && !skipped.has(d)).length;

  return {
    weekStart,
    plannedDays: plannedDates.size,
    decidedWithoutThinking: [...cookedDates].filter((d) => plannedDates.has(d)).length,
    skippedOrImpossible: skipped.size,
    topDishIds,
    usedUpIngredientIds,
    unconfirmedDays,
  };
}

/** 記録（作った・作らなかった）のある献立日の数。記録のない過ぎた日と、まだ来ていない日は数えない。 */
function recordedDays(state: AppState, summary: WeeklySummary): number {
  const end = addDays(summary.weekStart, 6);
  const upcoming = new Set(
    state.meals
      .filter((m) => m.date >= summary.weekStart && m.date <= end && m.dishIds.length > 0 && m.date >= state.today && m.status !== 'cooked' && m.status !== 'skipped')
      .map((m) => m.date),
  ).size;
  return Math.max(0, summary.plannedDays - (summary.unconfirmedDays ?? 0) - upcoming);
}

/**
 * 振り返りの一文。label は「今週」「先週」など。
 * 記録のない日は「分からない」として扱う：記録が1日もなければ数の文を出さない。一部だけなら「記録のあった〇日のうち」と言う。
 */
export function summaryText(state: AppState, catalog: Catalog, summary: WeeklySummary, label: string): string {
  if (summary.plannedDays === 0) return '';
  const recorded = recordedDays(state, summary);
  const parts: string[] = [];
  if (recorded <= 0) parts.push(`${label}は${summary.plannedDays}日分の献立でした。`);
  else if (recorded < summary.plannedDays) parts.push(`${label}は記録のあった${recorded}日のうち${summary.decidedWithoutThinking}日、考えずに済みました。`);
  else parts.push(`${label}は${summary.plannedDays}日のうち${summary.decidedWithoutThinking}日、考えずに済みました。`);
  if (summary.topDishIds.length > 0) parts.push(`いちばん人気は${dishName(state, catalog, summary.topDishIds[0])}でした。`);
  return parts.join('');
}

/** 振り返りの対象の週：今週の献立日がもう終わっていれば今週、そうでなければ先週。 */
export function summaryWeekFor(state: AppState): { weekStart: ISODate; label: string } {
  const ws = weekStartOf(state.today);
  const thisWeek = state.meals.filter((m) => weekStartOf(m.date) === ws);
  if (thisWeek.length > 0 && thisWeek.every((m) => m.date < state.today)) return { weekStart: ws, label: '今週' };
  return { weekStart: addDays(ws, -7), label: '先週' };
}

/** 公開API：カードの中身をテキストにする（LINE やテストで使う）。 */
export function renderCardText(state: AppState, catalog: Catalog, card: Card): string {
  switch (card.kind) {
    case 'week': {
      const lines = weekLines(state, catalog, card.weekStart);
      const head = `${formatJa(card.weekStart)}〜の夕食`;
      return lines.length > 0 ? [head, ...lines].join('\n') : `${head}\nこの週の献立はまだありません。`;
    }
    case 'meal': {
      const meal = state.meals.find((m) => m.date === card.date);
      if (!meal) return `${formatJa(card.date)}の献立はありません。`;
      const lines = [`${formatJa(meal.date)}の夕食${statusLabel(meal)}`];
      if (meal.dishIds.length === 0) {
        lines.push(mealLine(state, catalog, meal));
      } else {
        meal.dishIds.forEach((id, i) => {
          const dish = findDishIn(state.household, catalog, id);
          const role =
            i === 0 ? (meal.kind === 'raku' ? 'ラク日' : '主菜') : dish?.role === 'soup' ? '汁物' : '副菜';
          lines.push(`${role}：${dish?.name ?? id}${meal.newDishIds.includes(id) ? '（新しい料理）' : ''}`);
        });
      }
      const absent = absentText(state, meal);
      lines.push(`${mealMinutes(state, catalog, meal)}分・${servingsText(state, meal)}${absent ? `（${absent}）` : ''}`);
      if (meal.reasons.length > 0) lines.push(`理由：${meal.reasons.join('／')}`);
      // 新しい料理には、作り方の手がかりを添える（画面のカードの「作り方」と同じ文）。
      const hint = newDishHint(state, catalog, meal);
      if (hint) lines.push(`作り方：${hint}`);
      for (const w of meal.warnings) lines.push(`注意：${w}`);
      for (const n of meal.notes) lines.push(`メモ：${n}`);
      return lines.join('\n');
    }
    case 'shopping': {
      const list = state.shopping.find((l) => l.date === card.date);
      if (!list) return `${formatJa(card.date)}の買い物リストはありません。`;
      const lines = [`${formatJa(list.date)}の買い物`];
      for (const aisle of AISLE_ORDER) {
        const items = list.items.filter((i) => i.aisle === aisle);
        if (items.length === 0) continue;
        lines.push(`【${AISLE_LABEL[aisle]}】`);
        for (const i of items) {
          const extra = [...(i.uncertain ? ['要確認'] : []), ...i.notes];
          lines.push(`${i.checked ? '■' : '□'} ${i.label}${extra.length > 0 ? `（${extra.join('・')}）` : ''}`);
        }
      }
      if (list.items.length === 0) lines.push('買う物はありません。');
      if (list.pantry.length > 0) lines.push(`家にあるか確認：${list.pantry.join('・')}`);
      return lines.join('\n');
    }
    case 'alternatives': {
      const lines = [`${formatJa(card.date)}の別の案`];
      if (card.options.length === 0) lines.push('ほかに合う料理が見つかりませんでした。');
      card.options.forEach((o, i) => lines.push(`${i + 1}. ${namesLine(state, catalog, o)}`));
      return lines.join('\n');
    }
    case 'summary': {
      const s = weeklySummary(state, catalog, card.weekStart);
      const lines = [`${formatJa(card.weekStart)}〜の振り返り`];
      if (s.plannedDays === 0) {
        lines.push('この週の記録はありません。');
        return lines.join('\n');
      }
      const unknown = s.unconfirmedDays ?? 0;
      const recorded = recordedDays(state, s);
      if (recorded <= 0) lines.push(`${s.plannedDays}日分の献立でした（作った・作らなかったの記録はありません）。`);
      else if (recorded < s.plannedDays) lines.push(`記録のあった${recorded}日のうち${s.decidedWithoutThinking}日、考えずに済みました。`);
      else lines.push(`${s.plannedDays}日のうち${s.decidedWithoutThinking}日、考えずに済みました。`);
      if (s.skippedOrImpossible > 0) lines.push(`作れなかった日：${s.skippedOrImpossible}日`);
      if (unknown > 0 && recorded > 0) lines.push(`記録なし：${unknown}日`);
      if (s.topDishIds.length > 0) {
        lines.push(`人気：${s.topDishIds.slice(0, 3).map((id) => dishName(state, catalog, id)).join('・')}`);
      }
      if (s.usedUpIngredientIds.length > 0) {
        const names = s.usedUpIngredientIds.map((id) => catalog.ingredientById.get(id)?.name ?? id);
        lines.push(`使い切った：${names.join('・')}`);
      }
      return lines.join('\n');
    }
    case 'notice':
      return card.lines.map((l) => `・${l}`).join('\n');
  }
}
