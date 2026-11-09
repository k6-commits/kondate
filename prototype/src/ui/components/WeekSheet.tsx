// 今週の献立（と、できていれば来週）。差し替え・今日は無理・作った・反応をここから押せる。
import { useState } from 'react';
import type { Action, AppState, Catalog, ISODate, PlannedMeal } from '../../engine';
import { addDays, alternativesFor, findDish, formatJa, weekStartOf, weeklySummary } from '../../engine';
import { REACTIONS, SERVINGS_NOTE, cls, hasPartialServings, nobodyEats } from '../lib';
import { SummaryBody } from './ChatCard';
import { MealDetails, RakuBadge, StatusBadge, statusBadgeShown } from './MealDetails';
import { Sheet } from './Sheet';

export function WeekSheet({
  state,
  catalog,
  weekStart,
  onWeekChange,
  onAction,
  onBack,
}: {
  state: AppState;
  catalog: Catalog;
  weekStart: ISODate | null;
  onWeekChange: (weekStart: ISODate) => void;
  onAction: (action: Action) => void;
  onBack: () => void;
}) {
  const thisWeek = weekStartOf(state.today);
  const nextWeek = addDays(thisWeek, 7);
  const lastWeek = addDays(thisWeek, -7);
  const mealsOf = (ws: ISODate) => state.meals.filter((m) => weekStartOf(m.date) === ws);
  const hasNext = mealsOf(nextWeek).length > 0;
  // 今週の献立日がもう残っていない（すべて過ぎた、または今週の献立がない）。
  const thisWeekOver = mealsOf(thisWeek).every((m) => m.date < state.today);
  const shown =
    weekStart === lastWeek && mealsOf(lastWeek).length > 0
      ? lastWeek // トークに残っている先週のカードから開いた
      : weekStart === nextWeek && hasNext
        ? nextWeek
        : weekStart === thisWeek
          ? thisWeek
          : thisWeekOver && hasNext
            ? nextWeek // メニューから開いた日曜など：これからの献立がある週を開く
            : thisWeek;
  const meals = mealsOf(shown);
  const lastHasRecord = weeklySummary(state, catalog, lastWeek).plannedDays > 0;
  // 来週を開いたときは、終わった今週の振り返りを上に出す（トークの「今週の献立」の返事と同じ）。
  const thisWeekSummary = shown === nextWeek && thisWeekOver && weeklySummary(state, catalog, thisWeek).plannedDays > 0;
  const shownDone = meals.length > 0 && meals.every((m) => m.date < state.today);
  const title = shown === nextWeek ? '来週の献立' : shown === lastWeek ? '先週の献立' : '今週の献立';

  return (
    <Sheet id="week" title={title} onBack={onBack}>
      <div className="sheet-tools">
        <div className="seg" role="group" aria-label="表示する週">
          <button type="button" className="seg-btn" aria-pressed={shown === thisWeek} onClick={() => onWeekChange(thisWeek)}>
            今週
          </button>
          <button
            type="button"
            className="seg-btn"
            aria-pressed={shown === nextWeek}
            disabled={!hasNext}
            onClick={() => onWeekChange(nextWeek)}
          >
            来週
          </button>
        </div>
        <span className="range num">
          {formatJa(shown)}〜{formatJa(addDays(shown, 6))}
        </span>
      </div>
      {!hasNext && shown !== lastWeek ? <p className="hint">来週の献立は、来週の最初の買い物日の前日にできます。</p> : null}

      {shown === thisWeek && lastHasRecord ? (
        <section className="panel" aria-label="先週の振り返り">
          <h3 className="panel-title">先週の振り返り</h3>
          <SummaryBody weekStart={lastWeek} state={state} catalog={catalog} />
        </section>
      ) : null}
      {thisWeekSummary ? (
        <section className="panel" aria-label="今週の振り返り">
          <h3 className="panel-title">今週の振り返り</h3>
          <SummaryBody weekStart={thisWeek} state={state} catalog={catalog} />
        </section>
      ) : null}

      {meals.length === 0 ? (
        <p className="empty">この週の献立はまだありません。</p>
      ) : (
        <ol className="days">
          {meals.map((m) => (
            <DayCard key={`${m.date}|${m.dishIds.join(',')}|${m.status}`} state={state} catalog={catalog} meal={m} onAction={onAction} />
          ))}
        </ol>
      )}

      {shownDone ? (
        <section className="panel" aria-label="この週の振り返り">
          <h3 className="panel-title">この週の振り返り</h3>
          <SummaryBody weekStart={shown} state={state} catalog={catalog} />
        </section>
      ) : null}
      {meals.length > 0 && hasPartialServings(state.household.members) ? <p className="hint">{SERVINGS_NOTE}</p> : null}
    </Sheet>
  );
}

function DayCard({ state, catalog, meal, onAction }: { state: AppState; catalog: Catalog; meal: PlannedMeal; onAction: (a: Action) => void }) {
  const [alts, setAlts] = useState<string[][] | null>(null);
  const today = state.today;
  const date = meal.date;
  const isToday = date === today;
  const isPast = date < today;
  // みんな外で食べる日は、作る・替えるボタンを出さない（だれかが食べることになったら、トークで知らせると戻る）。
  const none = nobodyEats(state, meal);
  const open = !none && (meal.status === 'planned' || meal.status === 'unconfirmed');
  const editable = date >= today && open;
  const canCook = meal.dishIds.length > 0 && date <= today && open;
  const canSkip = canCook && isPast;
  const canImpossible = isToday && open && meal.status === 'planned' && meal.kind !== 'raku';

  return (
    <li className={cls('day', isToday && 'is-today', isPast && 'is-past')} data-date={date}>
      <header className="day-head">
        <span className="day-date num">{formatJa(date)}</span>
        {isToday ? <span className="badge badge--today">今日</span> : null}
        {meal.kind === 'raku' && !none ? <RakuBadge /> : null}
        {statusBadgeShown(state, meal) ? <StatusBadge meal={meal} /> : null}
      </header>
      <MealDetails state={state} catalog={catalog} meal={meal} />
      {canCook || canSkip || canImpossible || editable ? (
        <div className="day-actions">
          {canCook ? (
            <button type="button" className="btn btn--primary" onClick={() => onAction({ type: 'cooked', date })}>
              作った
            </button>
          ) : null}
          {canSkip ? (
            <button type="button" className="btn" onClick={() => onAction({ type: 'not_cooked', date })}>
              作らなかった
            </button>
          ) : null}
          {canImpossible ? (
            <button type="button" className="btn" onClick={() => onAction({ type: 'today_impossible', date })}>
              今日は無理
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              className="btn"
              aria-expanded={alts !== null}
              onClick={() => setAlts(alts ? null : alternativesFor(state, catalog, date, 2))}
            >
              差し替え
            </button>
          ) : null}
        </div>
      ) : null}
      {alts && editable ? (
        <div className="alts" role="group" aria-label={`${formatJa(date)}の別の案`}>
          {alts.length === 0 ? (
            <p className="hint">ほかに合う料理が見つかりませんでした。</p>
          ) : (
            alts.map((option, i) => {
              const dishes = option.map((id) => findDish(state, catalog, id));
              const minutes = Math.max(0, ...dishes.map((d) => d?.minutes ?? 0)) + 5 * Math.max(0, dishes.length - 1);
              return (
                <button
                  key={option.join(',')}
                  type="button"
                  className="alt-option"
                  onClick={() => {
                    setAlts(null);
                    onAction({ type: 'choose_alternative', date, dishIds: option });
                  }}
                >
                  <span className="alt-no num">案{i + 1}</span>
                  <span className="alt-names">{dishes.map((d, k) => d?.name ?? option[k]).join('／')}</span>
                  <span className="alt-min num">{minutes}分</span>
                </button>
              );
            })
          )}
          <button type="button" className="text-btn" onClick={() => setAlts(null)}>
            やめる
          </button>
        </div>
      ) : null}
      {meal.status === 'cooked' ? <Reactions state={state} meal={meal} onAction={onAction} /> : null}
    </li>
  );
}

function Reactions({ state, meal, onAction }: { state: AppState; meal: PlannedMeal; onAction: (a: Action) => void }) {
  const record = state.history.find((r) => r.date === meal.date && r.status === 'cooked');
  const current = (memberId: string) => record?.reactions.find((r) => r.memberId === memberId)?.reaction;
  if (state.household.settings.plan === 'paid') {
    const eaters = state.household.members.filter((m) => m.ageBand !== 'infant' && !meal.absentMemberIds.includes(m.id));
    return (
      <div className="reactions">
        <p className="reactions-title">家族の反応（一人ずつ）</p>
        {eaters.map((m) => (
          <div key={m.id} className="reaction-row" role="group" aria-label={`${m.nickname}の反応`}>
            <span className="reaction-name">{m.nickname}</span>
            {REACTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                className="react-btn"
                aria-pressed={current(m.id) === r.id}
                aria-label={`${m.nickname} ${r.mark} ${r.label}`}
                title={r.label}
                onClick={() => onAction({ type: 'react', date: meal.date, memberId: m.id, reaction: r.id })}
              >
                {r.mark}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="reactions">
      <p className="reactions-title">家族の反応</p>
      <div className="reaction-row" role="group" aria-label="家族の反応">
        {REACTIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="react-btn react-btn--wide"
            aria-pressed={current('household') === r.id}
            onClick={() => onAction({ type: 'react', date: meal.date, memberId: 'household', reaction: r.id })}
          >
            <span className="react-mark">{r.mark}</span>
            <span className="react-label">{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
