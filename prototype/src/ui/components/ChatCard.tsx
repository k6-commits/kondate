// トークのカード（Card）。カードは参照だけを持つので、中身は今の state から描く。
import type { AppState, Card, Catalog, ISODate } from '../../engine';
import {
  AISLE_LABEL,
  AISLE_ORDER,
  CHECKIN_SUMMARY_LABEL,
  WEEKDAY_JA,
  addDays,
  findDish,
  formatJa,
  weekStartOf,
  weekdayOf,
  weeklySummary,
} from '../../engine';
import { NO_DINNER_TEXT, cls, dishNames, leftCount, nobodyEats } from '../lib';
import { Icon } from './Icon';
import { MealDetails, RakuBadge, StatusBadge, statusBadgeShown } from './MealDetails';

export interface CardHandlers {
  onOpenWeek: (weekStart: ISODate) => void;
  onOpenShopping: (date: ISODate) => void;
}

export function ChatCard({ card, state, catalog, handlers }: { card: Card; state: AppState; catalog: Catalog; handlers: CardHandlers }) {
  switch (card.kind) {
    case 'week':
      return <WeekCard weekStart={card.weekStart} state={state} catalog={catalog} handlers={handlers} />;
    case 'meal':
      return <MealCard date={card.date} state={state} catalog={catalog} />;
    case 'shopping':
      return <ShoppingCard date={card.date} state={state} handlers={handlers} />;
    case 'alternatives':
      return <AlternativesCard date={card.date} options={card.options} state={state} catalog={catalog} />;
    case 'summary':
      return <SummaryCard weekStart={card.weekStart} state={state} catalog={catalog} />;
    case 'notice':
      return <NoticeCard level={card.level} lines={card.lines} />;
    default:
      return null;
  }
}

function WeekCard({ weekStart, state, catalog, handlers }: { weekStart: ISODate; state: AppState; catalog: Catalog; handlers: CardHandlers }) {
  const meals = state.meals.filter((m) => weekStartOf(m.date) === weekStart);
  const thisWeek = weekStartOf(state.today);
  const past = weekStart < thisWeek;
  // 過ぎた週は、献立が残っている先週の分だけ開ける（週の献立の画面は、先週・今週・来週を出せる）。
  const canOpen = !past || (weekStart === addDays(thisWeek, -7) && meals.length > 0);
  return (
    <section className="card" data-card="week" aria-label={`${formatJa(weekStart)}からの週の献立`}>
      <header className="card-head">
        <Icon name="week" size={18} />
        <span className="card-title">{formatJa(weekStart)}〜の夕食</span>
      </header>
      {meals.length === 0 ? (
        <p className="card-empty">{past ? '過ぎた週の献立は、もう表示できません。' : 'この週の献立はまだありません。'}</p>
      ) : (
        <ul className="week-list">
          {meals.map((m) => {
            // みんな外で食べる日は、料理の名前・ラク日・注意の印の代わりに「夕食なし」と出す。
            const none = nobodyEats(state, m);
            return (
              <li
                key={m.date}
                className={cls('week-row', m.date === state.today && 'is-today')}
                aria-current={m.date === state.today ? 'date' : undefined}
              >
                <span className="week-day num">
                  <span className="week-wd">{WEEKDAY_JA[weekdayOf(m.date)]}</span>
                  <span className="week-date">{formatJa(m.date).replace(/\(.\)$/, '')}</span>
                </span>
                <span className="week-names">
                  {none ? (
                    <span className="week-none">{NO_DINNER_TEXT}</span>
                  ) : (
                    <>
                      {m.kind === 'raku' ? <RakuBadge /> : null}
                      <span>{m.dishIds.length > 0 ? dishNames(state, catalog, m.dishIds) : '外食や買ってきたもの'}</span>
                    </>
                  )}
                </span>
                <span className="week-flags">
                  {m.date === state.today ? <span className="badge badge--today">今日</span> : null}
                  {m.status !== 'planned' && statusBadgeShown(state, m) ? <StatusBadge meal={m} /> : null}
                  {m.warnings.length > 0 && !none ? (
                    <span className="badge badge--warn">
                      <Icon name="alert" size={13} />
                      注意
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {canOpen ? (
        <footer className="card-foot">
          <button type="button" className="text-btn" onClick={() => handlers.onOpenWeek(weekStart)}>
            献立を開く
            <Icon name="next" size={16} />
          </button>
        </footer>
      ) : null}
    </section>
  );
}

function MealCard({ date, state, catalog }: { date: ISODate; state: AppState; catalog: Catalog }) {
  const meal = state.meals.find((m) => m.date === date);
  return (
    <section className="card" data-card="meal" aria-label={`${formatJa(date)}の夕食`}>
      <header className="card-head">
        <Icon name="bowl" size={18} />
        <span className="card-title">{formatJa(date)}の夕食</span>
        {meal?.date === state.today ? <span className="badge badge--today">今日</span> : null}
        {meal?.kind === 'raku' && !nobodyEats(state, meal) ? <RakuBadge /> : null}
        {meal && meal.status !== 'planned' && statusBadgeShown(state, meal) ? <StatusBadge meal={meal} /> : null}
      </header>
      {meal ? (
        <MealDetails state={state} catalog={catalog} meal={meal} />
      ) : (
        <p className="card-empty">この日の献立はありません。</p>
      )}
    </section>
  );
}

function ShoppingCard({ date, state, handlers }: { date: ISODate; state: AppState; handlers: CardHandlers }) {
  const list = state.shopping.find((l) => l.date === date);
  const counts = AISLE_ORDER.map((aisle) => ({
    aisle,
    n: list ? list.items.filter((i) => i.aisle === aisle).length : 0,
  })).filter((x) => x.n > 0);
  // 過ぎた買い物日のリストは、これからの献立に使う物だけを数える（エンジンの返事の「まだチェックしていない物（〇品）」と同じ）。
  const left = list ? leftCount(state, list) : 0;
  return (
    <section className="card" data-card="shopping" aria-label={`${formatJa(date)}の買い物`}>
      <header className="card-head">
        <Icon name="basket" size={18} />
        <span className="card-title">{formatJa(date)}の買い物</span>
        {list ? <span className="card-sub num">のこり{left}品</span> : null}
      </header>
      {!list ? (
        <p className="card-empty">この日の買い物リストは、もうありません。</p>
      ) : list.items.length === 0 ? (
        <p className="card-empty">買う物はありません。</p>
      ) : (
        <ul className="aisle-counts">
          {counts.map(({ aisle, n }) => (
            <li key={aisle}>
              <span>{AISLE_LABEL[aisle]}</span>
              <span className="num">{n}品</span>
            </li>
          ))}
        </ul>
      )}
      {list ? (
        <footer className="card-foot">
          <button type="button" className="text-btn" onClick={() => handlers.onOpenShopping(date)}>
            リストを開く
            <Icon name="next" size={16} />
          </button>
        </footer>
      ) : null}
    </section>
  );
}

function AlternativesCard({ date, options, state, catalog }: { date: ISODate; options: string[][]; state: AppState; catalog: Catalog }) {
  return (
    <section className="card" data-card="alternatives" aria-label={`${formatJa(date)}の別の案`}>
      <header className="card-head">
        <span className="card-title">{formatJa(date)}の別の案</span>
      </header>
      {options.length === 0 ? (
        <p className="card-empty">ほかに合う料理が見つかりませんでした。</p>
      ) : (
        <ol className="alt-list">
          {options.map((o, i) => (
            <li key={i}>
              <span className="alt-no num">案{i + 1}</span>
              <span>{o.map((id) => findDish(state, catalog, id)?.name ?? id).join('／')}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * 記録（作った・作らなかった）のある献立日の数。記録のない過ぎた日（unconfirmedDays）と、まだ来ていない日は数えない。
 * エンジンの振り返りの文（renderCardText の summary）と同じ数え方。みんな外で食べる日は献立の日に数えないので、
 * まだ来ていない日からも除く。
 */
function recordedDays(state: AppState, weekStart: ISODate, plannedDays: number, unconfirmedDays: number): number {
  const end = addDays(weekStart, 6);
  const upcoming = new Set(
    state.meals
      .filter(
        (m) =>
          m.date >= weekStart &&
          m.date <= end &&
          m.dishIds.length > 0 &&
          m.date >= state.today &&
          m.status !== 'cooked' &&
          m.status !== 'skipped' &&
          !nobodyEats(state, m),
      )
      .map((m) => m.date),
  ).size;
  return Math.max(0, plannedDays - unconfirmedDays - upcoming);
}

/**
 * 週末の質問（自分で考えた夕食は何日？）の答えの1行。答えた週だけ出す（weeklySummary の checkin）。
 * 「自分で考えた日（週末の質問）：2日／5日」と1行で読めるように、見出しと数を続けて出す（ほかの行の2列にしない）。
 * 見出しはエンジンの CHECKIN_SUMMARY_LABEL（LINE の文・次の週の献立のメッセージと同じ言い方）。
 */
function CheckinLine({ checkin }: { checkin: { plannedDays: number; thoughtDays: number } }) {
  return (
    <div className="summary-line" data-testid="summary-checkin">
      <dt>{CHECKIN_SUMMARY_LABEL}：</dt>
      <dd className="num">
        <strong>{checkin.thoughtDays}日</strong>／{checkin.plannedDays}日
      </dd>
    </div>
  );
}

export function SummaryBody({ weekStart, state, catalog }: { weekStart: ISODate; state: AppState; catalog: Catalog }) {
  const s = weeklySummary(state, catalog, weekStart);
  if (s.plannedDays === 0) {
    // 献立の日がない週（どの日もみんな外で食べた など）。答えがあれば、それだけは出す（エンジンの振り返りの文と同じ）。
    return s.checkin ? (
      <>
        <p className="card-empty">この週の記録はありません。</p>
        <dl className="summary">
          <CheckinLine checkin={s.checkin} />
        </dl>
      </>
    ) : (
      <p className="card-empty">この週の記録はありません。</p>
    );
  }
  // 記録のない日は「分からない日」。0日とは言わない（記録が1日もなければ、数を出さない）。
  const unknown = s.unconfirmedDays ?? 0;
  const recorded = recordedDays(state, weekStart, s.plannedDays, unknown);
  return (
    <dl className="summary">
      {recorded > 0 ? (
        <div>
          <dt>考えずに済んだ日</dt>
          <dd className="num">
            {recorded < s.plannedDays ? `記録のあった${recorded}日のうち` : `${s.plannedDays}日のうち`}
            <strong>{s.decidedWithoutThinking}日</strong>
          </dd>
        </div>
      ) : (
        <div>
          <dt>献立の日</dt>
          <dd className="num">{s.plannedDays}日分（作った・作らなかったの記録はありません）</dd>
        </div>
      )}
      {s.checkin ? <CheckinLine checkin={s.checkin} /> : null}
      {s.skippedOrImpossible > 0 ? (
        <div>
          {/* 長い見出しは、語の途中（「作れなか／った日」）でなく「予定どおり／作れなかった日」で折り返す（styles.css の keep-all）。 */}
          <dt>
            予定どおり
            <wbr />
            作れなかった日
          </dt>
          <dd className="num">{s.skippedOrImpossible}日</dd>
        </div>
      ) : null}
      {unknown > 0 && recorded > 0 ? (
        <div>
          <dt>記録なし</dt>
          <dd className="num">{unknown}日</dd>
        </div>
      ) : null}
      {s.topDishIds.length > 0 ? (
        <div>
          <dt>人気（◎が多い）</dt>
          <dd>{s.topDishIds.slice(0, 3).map((id) => findDish(state, catalog, id)?.name ?? id).join('・')}</dd>
        </div>
      ) : null}
      {s.usedUpIngredientIds.length > 0 ? (
        <div>
          <dt>使い切った</dt>
          <dd>{s.usedUpIngredientIds.map((id) => catalog.ingredientById.get(id)?.name ?? id).join('・')}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function SummaryCard({ weekStart, state, catalog }: { weekStart: ISODate; state: AppState; catalog: Catalog }) {
  return (
    <section className="card" data-card="summary" aria-label={`${formatJa(weekStart)}からの週の振り返り`}>
      <header className="card-head">
        <span className="card-title">{formatJa(weekStart)}〜の振り返り</span>
      </header>
      <SummaryBody weekStart={weekStart} state={state} catalog={catalog} />
    </section>
  );
}

function NoticeCard({ level, lines }: { level: 'info' | 'warning'; lines: string[] }) {
  return (
    <section className={cls('card', 'notice', level === 'warning' && 'notice--warning')} data-card="notice" aria-label="お知らせ">
      <header className="card-head">
        {level === 'warning' ? (
          <span className="warn-label">
            <Icon name="alert" size={16} />
            注意
          </span>
        ) : (
          <span className="card-title">お知らせ</span>
        )}
      </header>
      <ul className="notice-lines">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
