// 1日の献立の中身（トークのカードと「今週の献立」で共通）。すべて今の state から描く。
import type { AppState, Catalog, PlannedMeal } from '../../engine';
import { findDish } from '../../engine';
import { STATUS_LABEL, absentNames, cls, dishRoleLabel, mealMinutes, servingsLabel } from '../lib';
import { Icon } from './Icon';

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
  const minutes = mealMinutes(state, catalog, meal);
  const absent = absentNames(state, meal);
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
        <span className="num">{servingsLabel(meal.servings)}</span>
        {absent.length > 0 ? <span>{absent.join('・')}はいません</span> : null}
      </p>
      {meal.reasons.length > 0 && !compact ? (
        <p className="meal-line">
          <span className="meal-key">理由</span>
          <span>{meal.reasons.join('／')}</span>
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
