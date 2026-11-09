// 1日の献立の中身（トークのカードと「今週の献立」で共通）。すべて今の state から描く。
import type { AppState, Catalog, PlannedMeal } from '../../engine';
import { findDish } from '../../engine';
import { NO_DINNER_TEXT, STATUS_LABEL, absentNames, cls, dishNames, dishRoleLabel, eatersOf, mealMinutes, nobodyEats, servingsLabel } from '../lib';
import { Icon } from './Icon';

/**
 * 見出しに献立の状態の印（予定・未確認・作った など）を出すか。家で食べる人がいない日は出さない（中身の「夕食なし」で分かる）。
 * 記録（作った・作らなかった）があっても出さない：みんな外で食べる日は、献立の日に数えない（週の振り返りにも入れない）。
 * エンジンのカードの文（renderCardText）と週の行（LINE）も、この日は状態を付けない。
 */
export function statusBadgeShown(state: AppState, meal: PlannedMeal): boolean {
  return !nobodyEats(state, meal);
}

export function StatusBadge({ meal }: { meal: PlannedMeal }) {
  return <span className={cls('badge', `badge--${meal.status}`)}>{STATUS_LABEL[meal.status] ?? meal.status}</span>;
}

export function RakuBadge() {
  return <span className="badge badge--raku">ラク日</span>;
}

/** 注意（色だけでなく「注意」の文字とアイコンで示す）。 */
export function Warnings({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="warn" role="note">
      <span className="warn-label">
        <Icon name="alert" size={16} />
        注意
      </span>
      <ul className="warn-lines">
        {lines.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function MealDetails({
  state,
  catalog,
  meal,
  compact = false,
}: {
  state: AppState;
  catalog: Catalog;
  meal: PlannedMeal;
  compact?: boolean;
}) {
  if (nobodyEats(state, meal)) {
    // みんな外で食べる日：量・作り方・理由・注意は出さない。だれかが食べることになったら戻る献立を、小さく添える。
    return (
      <div className="meal">
        <p className="meal-empty">{NO_DINNER_TEXT}</p>
        {meal.dishIds.length > 0 ? (
          <p className="meal-was">
            <span className="meal-was-key">もとの献立</span>
            <span>{dishNames(state, catalog, meal.dishIds)}</span>
          </p>
        ) : null}
      </div>
    );
  }
  const minutes = mealMinutes(state, catalog, meal);
  const absent = absentNames(state, meal);
  // 新しい料理（はじめて作る料理）には、作り方の手がかりを添える（アプリは作り方の本文を持たない）。
  const newNames =
    meal.status === 'planned'
      ? meal.dishIds.filter((id) => meal.newDishIds.includes(id)).map((id) => findDish(state, catalog, id)?.name ?? id)
      : [];
  return (
    <div className="meal">
      {meal.dishIds.length === 0 ? (
        <p className="meal-empty">外食や買ってきたものでどうでしょう。</p>
      ) : (
        <ul className="dish-list">
          {meal.dishIds.map((id, i) => {
            const dish = findDish(state, catalog, id);
            return (
              <li key={`${id}-${i}`} className="dish-row">
                <span className={cls('dish-role', i === 0 && 'dish-role--main')}>{dishRoleLabel(meal, i, dish)}</span>
                <span className="dish-name">
                  {dish?.name ?? id}
                  {meal.newDishIds.includes(id) ? <span className="badge badge--new">新しい料理</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="meal-meta">
        {minutes > 0 ? <span className="num">{minutes}分</span> : null}
        <span className="num">{servingsLabel(meal.servings, eatersOf(state, meal).length)}</span>
        {absent.length > 0 ? <span>{absent.join('・')}はいません</span> : null}
      </p>
      {meal.reasons.length > 0 && !compact ? (
        <p className="meal-line">
          <span className="meal-key">理由</span>
          <span>{meal.reasons.join('／')}</span>
        </p>
      ) : null}
      {newNames.length > 0 && !compact ? (
        <p className="meal-line">
          <span className="meal-key">作り方</span>
          <span>
            {newNames.map((n) => `「${n}」`).join('')}ははじめての料理です。作り方は、料理名でレシピを探してください。
          </span>
        </p>
      ) : null}
      <Warnings lines={meal.warnings} />
      {meal.notes.length > 0 ? (
        <ul className="memo-lines">
          {meal.notes.map((n, i) => (
            <li key={i} className="meal-line">
              <span className="meal-key">メモ</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
