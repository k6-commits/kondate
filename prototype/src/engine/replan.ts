// 組み直し（DESIGN.md 3-7・3-8）。ここの関数は、複製済みの state（s）を書き換え、bot の返事を追加する。
import type { ActionButton, AppState, Catalog, Dish, ISODate, Ingredient, Member, PlannedMeal, Proposal } from './types';
import { addDays, diffDays, formatJa, weekStartOf, weekdayOf } from './dates';
import {
  allDishes,
  allergenName,
  eatingMembers,
  effectiveExclusions,
  findDishIn,
  ingredientsOf,
  isFavorite,
  isMeat,
  mealOn,
  proteinOfKind,
  servingsFor,
  sortMeals,
} from './context';
import {
  alternativesFor,
  bestRakuFor,
  inSeason,
  isSafeOn,
  makeEnv,
  nearestGap,
  planWeek,
  rakuReason,
  rebuildMeal,
  scoreMainOn,
  sidesFor,
} from './planner';
import { checkDishSafetyFor, isAllowed } from './safety';
import { buildShoppingLists } from './shopping';
import { setStock } from './state';
import { addBotMessage, nextId, normalizeJa, uniq } from './util';
import { seedFrom } from './rng';
import { BTN_SHOPPING, BTN_WEEK, addWeekMessage, mealActions } from './messages';
import { dateLabel, dishName, mealTitle, namesLine, servingsText } from './text';

function label(s: AppState, date: ISODate): string {
  return dateLabel(s.today, date);
}

export function replaceMeal(s: AppState, meal: PlannedMeal): void {
  s.meals = sortMeals([...s.meals.filter((m) => m.date !== meal.date), meal]);
}

export function refreshShopping(s: AppState, catalog: Catalog): void {
  s.shopping = buildShoppingLists(s, catalog);
}

function dropProposalsFor(s: AppState, dates: ISODate[]): void {
  s.proposals = s.proposals.filter((p) => !dates.includes(p.date));
}

function ingIdsOf(s: AppState, dish: Dish): string[] {
  return ingredientsOf(s.household, dish).map((di) => di.ingredientId);
}

/** 変えてよい献立か（今日以降で、まだ作っていない）。 */
function editable(s: AppState, meal: PlannedMeal | undefined): meal is PlannedMeal {
  return !!meal && meal.date >= s.today && (meal.status === 'planned' || meal.status === 'unconfirmed');
}

/** 除外に当たった理由（卵 など）。銘柄の注意は、ほかに理由がないときだけ。 */
function strongReasons(hits: { ingredientId: string; reason: string }[]): string[] {
  const branded = hits.filter((h) => h.reason.endsWith('銘柄で原材料が違います'));
  const strong = hits.filter((h) => !branded.includes(h) && !h.reason.includes('要確認'));
  return [...new Set((strong.length > 0 ? strong : hits).map((h) => h.reason.replace(/（派生原材料）$/, '')))];
}

/** 安全の判定（ユーザーの指定でもゆるめない）。だめなら理由の文を返す。 */
function safetyProblem(s: AppState, catalog: Catalog, dish: Dish, absent: string[]): string | null {
  const res = isSafeOn(s, catalog, dish, absent);
  if (isAllowed(res, s.household)) return null;
  if (res.status === 'excluded') {
    return `${dish.name}は除外の条件（${strongReasons(res.hits).slice(0, 2).join('・')}）に当たるため、入れられません。`;
  }
  const branded = res.hits.filter((h) => h.reason.endsWith('銘柄で原材料が違います'));
  const names = [...new Set(branded.map((h) => catalog.ingredientById.get(h.ingredientId)?.name).filter((n): n is string => !!n))];
  const why = names.length > 0 ? `${names.slice(0, 2).join('・')}は銘柄で原材料が違います` : '材料がわかりません';
  return `${dish.name}は「要確認」（${why}）のため、提案していません。`;
}

/** 世帯で食べる人（乳児を除く）のうち、その食材を除外している人と理由。いなければ null。 */
function ingredientExclusion(s: AppState, catalog: Catalog, ing: Ingredient): { names: string[]; reason: string } | null {
  const probe: Dish = {
    id: `__ingredient_${ing.id}`,
    name: ing.name,
    role: 'side',
    protein: 'none',
    genre: 'other',
    minutes: 1,
    ingredients: [{ ingredientId: ing.id, amount: 1 }],
    kidFriendly: true,
    spicy: false,
    tags: [],
  };
  let reason = '';
  const names: string[] = [];
  for (const m of eatingMembers(s.household)) {
    const res = checkDishSafetyFor(probe, [m], s.household, catalog);
    if (res.status !== 'excluded') continue;
    names.push(m.nickname);
    reason ||= strongReasons(res.hits)[0] ?? '';
  }
  return names.length > 0 ? { names, reason: reason.replace(/^除外：/, '') } : null;
}

/**
 * 欠席者がいるから出せる料理（全員なら除外に当たる）の注意。予定が変わったら取り消せることも伝える。
 * 例：「はるとがいない日なので入れています（ハンバーグ）。予定が変わったら『木曜ははるともいる』と送ってください。」
 */
function absenceDependentNote(s: AppState, catalog: Catalog, date: ISODate, dishIds: string[]): string | null {
  const meal = mealOn(s, date);
  if (!meal || meal.absentMemberIds.length === 0) return null;
  const absentees = s.household.members.filter((m) => m.ageBand !== 'infant' && meal.absentMemberIds.includes(m.id));
  const dishes = dishIds.map((id) => findDishIn(s.household, catalog, id)).filter((d): d is Dish => !!d);
  const blocked = (d: Dish, m: Member) => !isAllowed(checkDishSafetyFor(d, [m], s.household, catalog), s.household);
  const who = absentees.filter((m) => dishes.some((d) => blocked(d, m)));
  if (who.length === 0) return null;
  const dish = dishes.find((d) => who.some((m) => blocked(d, m)))!;
  const names = who.map((m) => m.nickname).join('・');
  return `${names}がいない日なので入れています（${dish.name}）。予定が変わったら「${label(s, date)}は${who[0].nickname}もいる」と送ってください。`;
}

/** 買い物リストの、その食材の行（買い物日｜使う日）。返事で「実際にどう変わったか」を言うために使う。 */
function listEntries(s: AppState, ingredientId: string): Set<string> {
  const out = new Set<string>();
  for (const l of s.shopping) {
    if (l.date < s.today) continue;
    for (const it of l.items) if (it.ingredientId === ingredientId) for (const d of it.forDates) out.add(`${l.date}|${d}`);
  }
  return out;
}

/** 新しく買い物リストに入った物（作り直しの前後で比べる）。 */
function newListItems(before: AppState['shopping'], after: AppState['shopping'], today: ISODate): { date: ISODate; names: string[] }[] {
  const had = new Set(before.flatMap((l) => l.items.map((i) => `${l.date}|${i.ingredientId}`)));
  return after
    .filter((l) => l.date >= today)
    .map((l) => ({ date: l.date, names: l.items.filter((i) => !had.has(`${l.date}|${i.ingredientId}`)).map((i) => i.name) }))
    .filter((x) => x.names.length > 0);
}

// ---------------------------------------------------------------------------
// 今日は無理
// ---------------------------------------------------------------------------

/**
 * 元の料理をその日へ移してよいか：安全（その日に食べる人）、旬、7日以内に同じ主菜がない（元の日を除いて数える）、
 * その曜日の調理時間の上限を超えない。
 */
function canMoveTo(s: AppState, catalog: Catalog, fromDate: ISODate, to: PlannedMeal, dishes: Dish[]): boolean {
  if (dishes.length === 0) return false;
  if (!dishes.every((d) => inSeason(d, to.date) && isAllowed(isSafeOn(s, catalog, d, to.absentMemberIds), s.household))) return false;
  const main = dishes[0];
  if (main.role === 'main') {
    const env = makeEnv(s, catalog, new Set([fromDate, to.date]), seedFrom(`${s.household.id}${to.date}move`));
    const gap = nearestGap(env, main.id, to.date);
    if (gap !== null && gap <= 7) return false;
  }
  const max = s.household.settings.maxMinutes[weekdayOf(to.date)];
  return max === undefined || main.minutes <= max;
}

export function todayImpossible(s: AppState, catalog: Catalog, date: ISODate): void {
  const meal = mealOn(s, date);
  const when = label(s, date);
  if (!meal) {
    addBotMessage(s, `${when}は献立の日ではありません。無理せず、あるもので済ませてください。`, { actions: [BTN_WEEK] });
    return;
  }
  if (meal.status === 'cooked') {
    addBotMessage(s, `${when}の夕食は、もう「作った」と記録しています。`, { card: { kind: 'meal', date } });
    return;
  }
  if (meal.kind === 'raku') {
    addBotMessage(
      s,
      `${when}はもともとラク日です。${namesLine(s, catalog, meal.dishIds) || 'あるもの'}で十分です。\n作るのも大変なら、外食や買ってきたもので済ませても大丈夫です。`,
      {
        card: { kind: 'meal', date },
        actions: [
          { label: 'ほかの案', action: { type: 'request_alternatives', date } },
          { label: '作らない日にする', action: { type: 'not_cooked', date } },
        ],
      },
    );
    return;
  }

  const original = [...meal.dishIds];
  const originalDishes = original.map((id) => findDishIn(s.household, catalog, id)).filter((d): d is Dish => !!d);
  const originalMain = originalDishes[0];
  const ws = weekStartOf(date);
  const shoppingBefore = s.shopping;
  // 移す先：同じ週のあとのラク日で、旬・7日以内の重複・調理時間の上限・安全のどれにも当たらない日。
  const target = s.meals.find(
    (m) =>
      m.date > date &&
      weekStartOf(m.date) === ws &&
      m.kind === 'raku' &&
      m.status === 'planned' &&
      canMoveTo(s, catalog, date, m, originalDishes),
  );
  const targetRakuId = target?.dishIds[0];

  // 元の料理を先に移しておき（仮）、今日のラク日の料理は、移した先と同じたんぱく源を避けて選ぶ。
  if (target) replaceMeal(s, { ...target, dishIds: original, kind: 'normal' });
  // 今日はラク日に（在庫や冷凍で済むものを優先）。
  const raku = bestRakuFor(s, catalog, date, meal.absentMemberIds)[0]?.dish;
  const rakuIds = raku ? [raku.id, ...sidesFor(s, catalog, date, raku, original)] : [];
  s.history.push({ date, dishIds: original, status: 'skipped', reactions: [] });
  replaceMeal(
    s,
    rebuildMeal(s, catalog, date, rakuIds, {
      kind: 'raku',
      changedBy: 'replan',
      reasons: raku ? [`今日はラクする日。${raku.name}で十分`] : ['今日は外食や買ってきたもので'],
    }),
  );
  if (target) {
    replaceMeal(
      s,
      rebuildMeal(s, catalog, target.date, original, {
        kind: 'normal',
        changedBy: 'replan',
        reasons: [`${formatJa(date)}の分を移しました`],
      }),
    );
  }
  dropProposalsFor(s, [date, ...(target ? [target.date] : [])]);
  refreshShopping(s, catalog);

  const lines = ['了解です。今日はラクしましょう。'];
  lines.push(raku ? `${namesLine(s, catalog, rakuIds)}でどうでしょう。` : 'あるものや買ってきたもので済ませてください。');
  const mainName = originalMain?.name ?? '元の献立';
  // 来週の献立がもうあれば「来週の候補に回します」とは言わない（来週の日と入れ替える案を出す）。
  const nextWeekPlanned = s.meals.some((m) => weekStartOf(m.date) > ws);
  let swap: PlannedMeal | undefined;
  if (target) lines.push(`${mainName}は${label(s, target.date)}に回します。`);
  else if (!nextWeekPlanned) lines.push(`${mainName}は、来週の候補に回します。`);
  else {
    const later = s.meals.filter((m) => weekStartOf(m.date) > ws && m.kind === 'normal' && editable(s, m) && m.dishIds.length > 0);
    const ok = later.filter((m) => canMoveTo(s, catalog, date, m, originalDishes));
    const sameProtein = (m: PlannedMeal) => findDishIn(s.household, catalog, m.dishIds[0])?.protein === originalMain?.protein;
    swap = ok.find(sameProtein) ?? ok[0];
    lines.push(swap ? `${mainName}は、来週の日と入れ替える案を下に出します。` : `${mainName}は、また近いうちに入れます。`);
  }
  // 入れ替えたラク日の料理は、もう買ってあり、日持ちする（冷凍食品など）ときだけ「次のラク日に使う」と伝える。
  // 買っていなければ、買い物リストから外れるので何も言わない（次のラク日にも使えない約束はしない）。
  const displaced = targetRakuId && targetRakuId !== raku?.id ? findDishIn(s.household, catalog, targetRakuId) : undefined;
  if (target && displaced) {
    const stocked = ingIdsOf(s, displaced)
      .map((id) => catalog.ingredientById.get(id))
      .filter((i): i is Ingredient => !!i && !i.pantry)
      .filter((i) => s.inventory.some((v) => v.ingredientId === i.id && v.level !== 'none'));
    const keeps = (i: Ingredient) =>
      i.aisle === 'frozen' || i.shelfLifeDays >= 7 || s.inventory.some((v) => v.ingredientId === i.id && v.frozen);
    if (stocked.length > 0 && stocked.every(keeps)) lines.push(`${displaced.name}は次のラク日に使います。`);
  }
  // 冷凍の案内は、もう買ってある傷みやすい食材だけ。移した先の日まで持たないなら、言い切る。
  const bought = uniq(originalDishes.flatMap((d) => ingIdsOf(s, d)))
    .map((id) => catalog.ingredientById.get(id))
    .filter((i): i is Ingredient => !!i && !i.pantry && i.freezable)
    .filter((i) => s.inventory.some((v) => v.ingredientId === i.id && v.level !== 'none' && !v.frozen));
  const expiry = (i: Ingredient) => addDays(s.inventory.find((v) => v.ingredientId === i.id)!.acquiredOn, i.shelfLifeDays);
  if (target) {
    const late = bought.filter((i) => expiry(i) < target.date).map((i) => i.name);
    if (late.length > 0) {
      lines.push(`${late.slice(0, 2).join('と')}は${label(s, target.date)}まで持たないので、今夜冷凍して「${late[0]}冷凍した」と送ってください。`);
    }
  } else {
    const soon = bought.filter((i) => expiry(i) <= addDays(date, 1)).map((i) => i.name);
    if (soon.length > 0) lines.push(`${soon.slice(0, 2).join('と')}は使う日が決まっていないので、早めに使うか、今夜冷凍してください。`);
  }
  // 組み直しで買い物リストに新しく入った物（買い直しなど）は、黙って足さずに伝える。
  const added = newListItems(shoppingBefore, s.shopping, s.today)[0];
  if (added) lines.push(`${label(s, added.date)}の買い物リストに${added.names.slice(0, 2).join('・')}を入れました。`);
  addBotMessage(s, lines.slice(0, 6).join('\n'), {
    card: { kind: 'meal', date },
    actions: [{ label: 'ほかの案', action: { type: 'request_alternatives', date } }, BTN_WEEK],
  });
  if (swap) {
    const proposal: Proposal = {
      id: nextId(s, 'prop'),
      kind: 'request',
      date: swap.date,
      fromDishIds: [...swap.dishIds],
      toDishIds: original,
      text: `${label(s, swap.date)}の${mealTitle(s, catalog, swap)}を、${mainName}に替えますか？（${formatJa(date)}にできなかった分）`,
    };
    s.proposals = [...s.proposals.filter((p) => p.date !== swap!.date), proposal];
    addBotMessage(s, proposal.text, {
      card: { kind: 'meal', date: swap.date },
      actions: [
        { label: '替える', action: { type: 'accept_proposal', proposalId: proposal.id } },
        { label: 'そのまま', action: { type: 'reject_proposal', proposalId: proposal.id } },
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// 別のに
// ---------------------------------------------------------------------------

/** 「キーマカレー飽きた」：その料理が入っている、変えられる日（今日以降）。 */
export function dateOfDish(s: AppState, dishId: string): ISODate | undefined {
  return s.meals.find((m) => editable(s, m) && m.dishIds.includes(dishId))?.date;
}

export function requestAlternatives(s: AppState, catalog: Catalog, date: ISODate, lead?: string): void {
  const meal = mealOn(s, date);
  if (!editable(s, meal)) {
    addBotMessage(s, meal ? `${label(s, date)}の献立は、もう変えられません。` : `${label(s, date)}は献立の日ではありません。`, {
      actions: [BTN_WEEK],
    });
    return;
  }
  const options = alternativesFor(s, catalog, date, 2);
  if (options.length === 0) {
    addBotMessage(s, `${label(s, date)}は、ほかに合う料理が見つかりませんでした。`, { card: { kind: 'meal', date } });
    return;
  }
  const note = absenceDependentNote(s, catalog, date, options.flat());
  const lines = [...(lead ? [lead] : []), `${label(s, date)}の別の案です。どちらにしますか？`, ...(note ? [note] : [])];
  addBotMessage(s, lines.join('\n'), {
    card: { kind: 'alternatives', date, options },
    actions: options.map((o) => ({
      label: dishName(s, catalog, o[0]),
      action: { type: 'choose_alternative' as const, date, dishIds: o },
    })),
  });
}

/**
 * 押した時点で、主菜を入れてよいか（候補や提案を作ったあとに、ほかの日が変わっていることがある）。
 * 旬の外・7日以内に同じ主菜がある（リクエストの提案は、7日以内でも入れる）なら理由を返す。
 */
function staleReason(s: AppState, catalog: Catalog, date: ISODate, dishIds: string[], allowRecent = false): string | null {
  const dishes = dishIds.map((id) => findDishIn(s.household, catalog, id)).filter((d): d is Dish => !!d);
  const out = dishes.find((d) => !inSeason(d, date));
  if (out) return `${out.name}は旬の時期ではありません`;
  const main = dishes[0];
  if (main?.role === 'main' && !allowRecent && scoreMainOn(s, catalog, date, main).recent) return `${main.name}が7日以内に入っています`;
  return null;
}

export function chooseAlternative(s: AppState, catalog: Catalog, date: ISODate, dishIds: string[]): void {
  const meal = mealOn(s, date);
  if (!editable(s, meal)) {
    addBotMessage(s, `${label(s, date)}の献立は、もう変えられません。`, { actions: [BTN_WEEK] });
    return;
  }
  const dishes = dishIds.map((id) => findDishIn(s.household, catalog, id));
  if (dishes.length === 0 || dishes.some((d) => !d)) {
    addBotMessage(s, 'その料理が見つかりませんでした。', { card: { kind: 'meal', date } });
    return;
  }
  for (const d of dishes as Dish[]) {
    const problem = safetyProblem(s, catalog, d, meal.absentMemberIds);
    if (problem) {
      addBotMessage(s, problem, { card: { kind: 'meal', date } });
      return;
    }
  }
  const stale = staleReason(s, catalog, date, dishIds);
  if (stale) {
    requestAlternatives(s, catalog, date, `献立が変わったので、この案は使えません（${stale}）。`);
    return;
  }
  replaceMeal(s, rebuildMeal(s, catalog, date, dishIds, { changedBy: 'user' }));
  dropProposalsFor(s, [date]);
  refreshShopping(s, catalog);
  const note = absenceDependentNote(s, catalog, date, dishIds);
  addBotMessage(s, [`${label(s, date)}は${namesLine(s, catalog, dishIds)}にしました。買い物リストも直しました。`, ...(note ? [note] : [])].join('\n'), {
    card: { kind: 'meal', date },
    actions: mealActions(s, date),
  });
}

// ---------------------------------------------------------------------------
// 特売・在庫で使い切る提案
// ---------------------------------------------------------------------------

interface SwapOption {
  meal: PlannedMeal;
  to: Dish;
  score: number;
}

const isSeafood = (p: Dish['protein']) => p === 'fish' || p === 'seafood';

/**
 * その食材を使う料理への差し替えを探す。
 * まず、その食材の代わりになる食材（substitutes）を使う日と、同じたんぱく源の日を探す。
 * なければ、肉なら肉の日、魚介なら魚介の日まで広げる（鶏肉の日がない週でも「鶏むねが安い」を活かせるように）。
 */
function findSwapFor(s: AppState, catalog: Catalog, ingredientId: string): SwapOption | null {
  const ing = catalog.ingredientById.get(ingredientId);
  if (!ing) return null;
  const protein = proteinOfKind(ing.kind);
  return (
    searchSwap(s, catalog, ing, (main, usesSub) => usesSub || (protein !== 'none' && main.protein === protein)) ??
    searchSwap(
      s,
      catalog,
      ing,
      (main) => (isMeat(protein) && isMeat(main.protein)) || (isSeafood(protein) && isSeafood(main.protein)),
    )
  );
}

function searchSwap(
  s: AppState,
  catalog: Catalog,
  ing: Ingredient,
  target: (main: Dish, usesSub: boolean) => boolean,
): SwapOption | null {
  const users = allDishes(s.household, catalog).filter((d) => d.role === 'main' && ingIdsOf(s, d).includes(ing.id));
  let best: SwapOption | null = null;
  for (const meal of s.meals) {
    if (meal.date < s.today || meal.status !== 'planned' || meal.kind !== 'normal' || meal.dishIds.length === 0) continue;
    const main = findDishIn(s.household, catalog, meal.dishIds[0]);
    if (!main) continue;
    const mainIngs = ingIdsOf(s, main);
    if (mainIngs.includes(ing.id)) continue;
    const usesSub = mainIngs.some(
      (id) => ing.substitutes?.includes(id) || catalog.ingredientById.get(id)?.substitutes?.includes(ing.id),
    );
    if (!target(main, usesSub)) continue;
    for (const to of users) {
      if (to.id === main.id) continue;
      const sc = scoreMainOn(s, catalog, meal.date, to);
      if (!sc.allowed || sc.recent) continue;
      if (to.protein !== main.protein && to.protein !== 'none') {
        const nb = [mealOn(s, addDays(meal.date, -1)), mealOn(s, addDays(meal.date, 1))]
          .map((m) => (m ? findDishIn(s.household, catalog, m.dishIds[0] ?? '') : undefined))
          .filter((d): d is Dish => !!d);
        if (nb.some((d) => d.protein === to.protein)) continue;
      }
      const days = diffDays(meal.date, s.today);
      const fresh = days <= ing.shelfLifeDays ? 1.5 : ing.freezable ? 0 : -3;
      const score = sc.score + (usesSub ? 3 : 0) + fresh - days * 0.1;
      if (!best || score > best.score) best = { meal, to, score };
    }
  }
  return best;
}

function addSwapProposal(s: AppState, catalog: Catalog, kind: Proposal['kind'], option: SwapOption, text: string, extra: string[] = []): void {
  const { meal, to } = option;
  const toIds = [to.id, ...meal.dishIds.slice(1)];
  const proposal: Proposal = {
    id: nextId(s, 'prop'),
    kind,
    date: meal.date,
    fromDishIds: [...meal.dishIds],
    toDishIds: toIds,
    text,
  };
  s.proposals = [...s.proposals.filter((p) => p.date !== meal.date), proposal];
  addBotMessage(s, [text, ...extra].join('\n'), {
    card: { kind: 'meal', date: meal.date },
    actions: [
      { label: '替える', action: { type: 'accept_proposal', proposalId: proposal.id } },
      { label: 'そのまま', action: { type: 'reject_proposal', proposalId: proposal.id } },
    ],
  });
}

export function sale(s: AppState, catalog: Catalog, ingredientId: string): void {
  const ing = catalog.ingredientById.get(ingredientId);
  if (!ing) {
    addBotMessage(s, 'その食材が見つかりませんでした。');
    return;
  }
  // 家族の除外に当たる食材は、献立に使わない（「来週の候補に入れます」とは言わない）。
  const excluded = ingredientExclusion(s, catalog, ing);
  if (excluded) {
    addBotMessage(s, `${ing.name}は${excluded.names.join('・')}の除外（${excluded.reason}）に当たるので、献立には使いません。`);
    return;
  }
  const option = findSwapFor(s, catalog, ingredientId);
  if (!option) {
    addBotMessage(
      s,
      `${ing.name}、いいですね。今の献立には、替えられる日がありません。\n買ったら「${ing.name}買った」と送ってください。来週の候補に入れます。`,
    );
    return;
  }
  const fromMain = findDishIn(s.household, catalog, option.meal.dishIds[0]);
  const text = `${label(s, option.meal.date)}の${fromMain?.name ?? '献立'}を、${option.to.name}に替えますか？ ${ing.name}が安いので。`;
  const extra: string[] = [];
  const replaced = fromMain ? ingIdsOf(s, fromMain).map((id) => catalog.ingredientById.get(id)).filter((i) => !!i) : [];
  const stocked = replaced.find(
    (i) => i && !i.pantry && i.freezable && s.inventory.some((v) => v.ingredientId === i.id && v.level !== 'none'),
  );
  if (stocked) extra.push(`${stocked.name}は冷凍して、来週に回せます。`);
  addSwapProposal(s, catalog, 'sale_swap', option, text, extra);
}

// ---------------------------------------------------------------------------
// 在庫
// ---------------------------------------------------------------------------

function usesOf(s: AppState, catalog: Catalog, ingredientId: string): PlannedMeal[] {
  return s.meals.filter(
    (m) =>
      m.date >= s.today &&
      m.status === 'planned' &&
      m.dishIds.some((id) => {
        const d = findDishIn(s.household, catalog, id);
        return !!d && ingIdsOf(s, d).includes(ingredientId);
      }),
  );
}

export function outOfStock(s: AppState, catalog: Catalog, ingredientId: string): void {
  const ing = catalog.ingredientById.get(ingredientId);
  if (!ing) {
    addBotMessage(s, 'その食材が見つかりませんでした。');
    return;
  }
  setStock(s, ingredientId, 'none');
  refreshShopping(s, catalog);
  const uses = usesOf(s, catalog, ingredientId);
  if (uses.length === 0) {
    addBotMessage(s, `${ing.name}を「なし」にしました。今の献立では使いません。`);
    return;
  }
  const where = s.shopping.find((l) => l.date >= s.today && l.items.some((i) => i.ingredientId === ingredientId));
  const days = uses.map((m) => `${label(s, m.date)}の${mealTitle(s, catalog, m)}`).join('、');
  const lines = [`${ing.name}を「なし」にしました。`, `${days}で使います。`];
  if (where) lines.push(`${label(s, where.date)}の買い物リストに入れました${ing.pantry ? '（常備品の買い足し）' : ''}。`);
  else if (ing.pantry) lines.push('次の買い物で買い足してください。');
  addBotMessage(s, lines.join('\n'), { actions: [BTN_SHOPPING] });

  // 今日使う予定なら、使わない料理への差し替えも出す。
  const todayUse = uses.find((m) => m.date === s.today && m.kind === 'normal');
  if (todayUse) {
    const option = alternativesFor(s, catalog, s.today, 3).find((o) =>
      o.every((id) => {
        const d = findDishIn(s.household, catalog, id);
        return !!d && !ingIdsOf(s, d).includes(ingredientId);
      }),
    );
    const to = option ? findDishIn(s.household, catalog, option[0]) : undefined;
    if (option && to) {
      const proposal: Proposal = {
        id: nextId(s, 'prop'),
        kind: 'stock_swap',
        date: s.today,
        fromDishIds: [...todayUse.dishIds],
        toDishIds: option,
        text: `今日の${mealTitle(s, catalog, todayUse)}で${ing.name}を使います。${to.name}に替えますか？`,
      };
      s.proposals = [...s.proposals.filter((p) => p.date !== s.today), proposal];
      addBotMessage(s, `${proposal.text}\n買ってくるなら、そのままで大丈夫です。`, {
        card: { kind: 'meal', date: s.today },
        actions: [
          { label: '替える', action: { type: 'accept_proposal', proposalId: proposal.id } },
          { label: 'そのまま', action: { type: 'reject_proposal', proposalId: proposal.id } },
        ],
      });
    }
  }
}

export function have(s: AppState, catalog: Catalog, ingredientId: string): void {
  const ing = catalog.ingredientById.get(ingredientId);
  if (!ing) {
    addBotMessage(s, 'その食材が見つかりませんでした。');
    return;
  }
  const before = listEntries(s, ingredientId);
  setStock(s, ingredientId, 'plenty');
  refreshShopping(s, catalog);
  const after = listEntries(s, ingredientId);
  const uses = usesOf(s, catalog, ingredientId);
  if (uses.length > 0) {
    const days = uses.map((m) => `${label(s, m.date)}の${mealTitle(s, catalog, m)}`).join('、');
    const lines = [`${ing.name}を在庫に入れました。${days}で使います。`];
    // リストが実際にどう変わったかだけを言う（常備品はもともとリストに載らない）。
    if ([...before].some((k) => !after.has(k))) lines.push('買い物リストからも外しました。');
    const late = uses.filter((m) => [...after].some((k) => k.endsWith(`|${m.date}`)));
    if (!ing.pantry && late.length > 0) {
      const when = label(s, late[0].date);
      lines.push(
        ing.freezable
          ? `${ing.name}は${when}までは持たないので、冷凍したら「${ing.name}冷凍した」と送ってください（リストの分は残しています）。`
          : `${ing.name}は${when}までは持たないかもしれません。リストの分は残しています。`,
      );
    }
    addBotMessage(s, lines.join('\n'), { actions: [BTN_SHOPPING] });
    return;
  }
  const excluded = ingredientExclusion(s, catalog, ing);
  if (excluded) {
    addBotMessage(s, `${ing.name}を在庫に入れました。${excluded.names.join('・')}の除外（${excluded.reason}）に当たるので、献立には使いません。`);
    return;
  }
  if (ing.shelfLifeDays <= 4) {
    const option = findSwapFor(s, catalog, ingredientId);
    if (option) {
      const fromMain = mealTitle(s, catalog, option.meal);
      addBotMessage(s, `${ing.name}を在庫に入れました。`);
      addSwapProposal(
        s,
        catalog,
        'stock_swap',
        option,
        `${ing.name}を使い切るために、${label(s, option.meal.date)}の${fromMain}を${option.to.name}に替えますか？`,
      );
      return;
    }
  }
  addBotMessage(s, `${ing.name}を在庫に入れました。次の献立で使えるようにします。`);
}

/** 「〇〇冷凍した」：在庫を冷凍ありにする（買った日は変えない）。 */
export function froze(s: AppState, catalog: Catalog, ingredientId: string): void {
  const ing = catalog.ingredientById.get(ingredientId);
  if (!ing) {
    addBotMessage(s, 'その食材が見つかりませんでした。');
    return;
  }
  const before = listEntries(s, ingredientId);
  const inv = s.inventory.find((i) => i.ingredientId === ingredientId);
  if (inv && inv.level !== 'none') inv.frozen = true;
  else setStock(s, ingredientId, 'plenty', true);
  refreshShopping(s, catalog);
  const after = listEntries(s, ingredientId);
  const uses = usesOf(s, catalog, ingredientId);
  const lines = [`${ing.name}を「冷凍」にしました。`];
  if (uses.length > 0) {
    const how =
      ing.thaw === 'from_frozen'
        ? '凍ったまま加熱してください'
        : uses[0].date === s.today
          ? '今日使う分は、電子レンジの解凍などで戻してください'
          : '使う日の前日の夜に、冷蔵室へ移してください';
    lines.push(`${label(s, uses[0].date)}の${mealTitle(s, catalog, uses[0])}で使います。${how}。`);
  }
  if ([...before].some((k) => !after.has(k))) lines.push('買い物リストの買い直しも外しました。');
  addBotMessage(s, lines.join('\n'), { actions: [BTN_SHOPPING] });
}

/** 在庫を聞かれた・買い物を頼まれた（「豆腐あったっけ？」「豆腐買ってきて」）：状態は変えずに、今の在庫とリストで答える。 */
export function stockAnswer(s: AppState, catalog: Catalog, ingredientId: string): void {
  const ing = catalog.ingredientById.get(ingredientId);
  if (!ing) {
    addBotMessage(s, 'その食材が見つかりませんでした。');
    return;
  }
  const lines: string[] = [];
  const inv = s.inventory.find((i) => i.ingredientId === ingredientId);
  const usable = !!inv && inv.level !== 'none' && (inv.frozen || diffDays(s.today, inv.acquiredOn) <= ing.shelfLifeDays);
  if (inv && inv.level === 'none') lines.push(`${ing.name}は「なし」にしています。`);
  else if (usable) lines.push(`${ing.name}は在庫にあります（${formatJa(inv!.acquiredOn)}に登録${inv!.frozen ? '・冷凍' : ''}）。`);
  else lines.push(ing.pantry ? `${ing.name}は常備品なので、在庫は記録していません。` : `${ing.name}は在庫に登録がありません。`);
  const list = s.shopping.find((l) => l.date >= s.today && l.items.some((i) => i.ingredientId === ingredientId));
  const item = list?.items.find((i) => i.ingredientId === ingredientId);
  if (list && item) lines.push(`${label(s, list.date)}の買い物リストに入っています（${item.label.replace(`${ing.name} `, '')}）。`);
  else if (!ing.pantry) lines.push('今の買い物リストには入っていません。');
  lines.push(`買ったら「${ing.name}買った」、なければ「${ing.name}切れた」と送ってください。`);
  addBotMessage(s, lines.join('\n'), { actions: [BTN_SHOPPING] });
}

// ---------------------------------------------------------------------------
// 欠席
// ---------------------------------------------------------------------------

const HUSBAND = ['夫', '旦那', 'だんな', 'パパ', 'お父さん', '父', '主人', 'おっと'];
const WIFE = ['妻', '嫁', 'ママ', 'お母さん', '母', '奥さん', 'つま'];
const CHILD = ['子ども', '子供', 'こども', 'キッズ', '子'];
const ALL = ['みんな', '全員', '家族'];
const AGE_RANK = { teen: 3, child: 2, preschool: 1, infant: 0, adult: 4 } as const;

function has(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(normalizeJa(w)));
}

/**
 * 「夫」「パパ」「上の子」やニックネーム、member の id からメンバーを探す。
 * 「夫」「妻」は、ニックネーム（パパ・ママ など）で決まるときだけ使う。役割（わたし／パートナー）から性別は推測しない。
 * 決められなければ空（呼び出し側で聞き返す）。
 */
export function resolveMembers(members: Member[], ref: string): Member[] {
  const r = normalizeJa(ref);
  if (!r) return [];
  const byId = members.find((m) => m.id === ref.trim());
  if (byId) return [byId];
  const exact = members.filter((m) => normalizeJa(m.nickname) === r);
  if (exact.length > 0) return exact;
  const partial = members.filter((m) => {
    const n = normalizeJa(m.nickname);
    return n.length >= 2 && (r.includes(n) || n.includes(r));
  });
  if (partial.length === 1) return partial;
  const adults = members.filter((m) => m.ageBand === 'adult' && m.role !== 'child');
  const kids = members.filter((m) => m.role === 'child' || ['teen', 'child', 'preschool'].includes(m.ageBand));
  const nickIn = (m: Member, words: string[]) => has(normalizeJa(m.nickname), words);
  if (has(r, ALL)) return members.filter((m) => m.ageBand !== 'infant');
  for (const [mine, theirs] of [
    [HUSBAND, WIFE],
    [WIFE, HUSBAND],
  ]) {
    if (!has(r, mine)) continue;
    const nick = adults.filter((m) => nickIn(m, mine));
    if (nick.length === 1) return nick;
    // ほかの大人がニックネームで「妻」（「夫」）と分かるなら、残りの1人。大人が1人なら、その人。
    const others = adults.filter((m) => !nickIn(m, theirs));
    return others.length === 1 ? others : [];
  }
  const byAge = [...kids].sort((a, b) => AGE_RANK[b.ageBand] - AGE_RANK[a.ageBand]);
  if (r.includes('上の子') || r.includes('長男') || r.includes('長女')) return byAge.slice(0, 1);
  if (r.includes('下の子') || r.includes('末っ子')) return byAge.slice(-1);
  if (r.includes('息子') || r.includes('娘')) return kids.length === 1 ? kids : [];
  if (has(r, CHILD)) return kids.filter((m) => m.ageBand !== 'infant');
  return [];
}

/** 誰か分からないときの聞き返し。「夫」「妻」で大人が2人以上なら、どちらかを聞く。 */
function askWho(s: AppState, date: ISODate, memberRef: string): void {
  const adults = s.household.members.filter((m) => m.ageBand === 'adult' && m.role !== 'child');
  const example = adults[1]?.nickname ?? adults[0]?.nickname ?? s.household.members[0]?.nickname ?? 'パパ';
  const when = label(s, date);
  if (!memberRef.trim()) {
    addBotMessage(s, `誰がいないか教えてください（例：${when}は${example}が出張）。`);
    return;
  }
  if (has(normalizeJa(memberRef), [...HUSBAND, ...WIFE]) && adults.length >= 2) {
    addBotMessage(
      s,
      `「${memberRef}」が誰か、決められませんでした。${adults.map((m) => m.nickname).join('・')}のどなたですか？\nニックネームで送ってください（例：${when}は${example}が飲み会）。`,
    );
    return;
  }
  addBotMessage(s, `「${memberRef}」が誰か分かりませんでした。ニックネームで教えてください（例：${when}は${example}が飲み会）。`);
}

/** 欠席でゆるむ除外（欠席する人の除外のうち、食べる人のだれも持っていないもの）の名前。 */
function looseningOf(s: AppState, catalog: Catalog, who: Member[], meal: PlannedMeal): string[] {
  const eaters = eatingMembers(s.household, meal.absentMemberIds);
  const key = (e: ReturnType<typeof effectiveExclusions>[number]) => (e.type === 'text' ? `text:${normalizeJa(e.text)}` : `${e.type}:${e.id}`);
  const kept = new Set(eaters.flatMap((m) => effectiveExclusions(m).map(key)));
  const names: string[] = [];
  for (const m of who) {
    if (m.ageBand === 'infant') continue;
    for (const e of effectiveExclusions(m)) {
      if (kept.has(key(e))) continue;
      names.push(e.type === 'allergen' ? allergenName(catalog, e.id) : e.type === 'ingredient' ? catalog.ingredientById.get(e.id)?.name ?? e.id : e.text);
    }
  }
  return uniq(names);
}

export function absence(s: AppState, catalog: Catalog, date: ISODate, memberRef: string, cancel = false): void {
  if (cancel) {
    presence(s, catalog, date, memberRef);
    return;
  }
  const who = memberRef.trim() ? resolveMembers(s.household.members, memberRef) : [];
  if (who.length === 0) {
    askWho(s, date, memberRef);
    return;
  }
  const meal = mealOn(s, date);
  if (!meal) {
    // 献立を作らない曜日（土日など）には「献立ができたら」と約束しない。
    if (!s.household.settings.dinnerWeekdays.includes(weekdayOf(date))) {
      addBotMessage(s, `${label(s, date)}は献立の日ではありません。この日はそのままで大丈夫です。`);
      return;
    }
    addBotMessage(s, `${label(s, date)}の献立はまだありません。献立ができたら、もう一度教えてください。`);
    return;
  }
  if (!editable(s, meal)) {
    addBotMessage(s, `${label(s, date)}の献立は、もう変えられません。`);
    return;
  }
  const newly = who.filter((m) => !meal.absentMemberIds.includes(m.id));
  meal.absentMemberIds = [...new Set([...meal.absentMemberIds, ...who.map((m) => m.id)])];
  meal.servings = servingsFor(s.household, meal.absentMemberIds);
  meal.changedBy = 'absence';
  refreshShopping(s, catalog);
  const names = who.map((m) => m.nickname).join('・');
  if (eatingMembers(s.household, meal.absentMemberIds).length === 0) {
    addBotMessage(s, `了解です。${label(s, date)}はみんな外で食べるんですね。夕食の分は買い物リストから外しました。`, {
      card: { kind: 'meal', date },
    });
    return;
  }
  const lines = [`了解です。${label(s, date)}は${names}の分を減らしました（${servingsText(meal.servings)}）。`, '買い物リストも直しました。'];
  // 除外のある人がいない日は、その除外がゆるむ。予定が変わったら取り消せることも伝える。
  const loosened = looseningOf(s, catalog, newly, meal);
  if (loosened.length > 0) {
    const first = newly.find((m) => effectiveExclusions(m).length > 0) ?? newly[0];
    lines.push(
      `${names}がいない日なので、${loosened.slice(0, 2).join('・')}を使う料理も入ることがあります。予定が変わったら「${label(s, date)}は${first.nickname}もいる」と送ってください。`,
    );
  }
  addBotMessage(s, lines.join('\n'), { card: { kind: 'meal', date }, actions: [BTN_SHOPPING] });
}

/**
 * 欠席の取り消し（「木曜ははるといる」「お泊まりなくなった」）。人数を戻し、その日の料理を、食べる人の除外でもう一度判定する。
 * 当たる料理があれば、出せる別の案に替える（なければ、はっきり注意して［別のに］を出す）。
 */
export function presence(s: AppState, catalog: Catalog, date: ISODate, memberRef: string): void {
  const who = memberRef.trim() ? resolveMembers(s.household.members, memberRef) : [];
  if (who.length === 0) {
    askWho(s, date, memberRef);
    return;
  }
  const ids = who.map((m) => m.id);
  const isAbsent = (m: PlannedMeal | undefined) => !!m && m.absentMemberIds.some((id) => ids.includes(id));
  let meal = mealOn(s, date);
  if (!isAbsent(meal)) {
    // その日に欠席がなければ、この先で欠席にしている日を探す（「はるとのお泊まり中止」）。
    const other = s.meals.find((m) => editable(s, m) && isAbsent(m));
    if (!other) {
      const names = memberRef === 'みんな' ? 'みんな' : who.map((m) => m.nickname).join('・');
      addBotMessage(s, `${names}は、${label(s, date)}も食べる予定になっています。このままで大丈夫です。`, {
        card: meal ? { kind: 'meal', date } : undefined,
      });
      return;
    }
    meal = other;
  }
  const targetDate = meal?.date ?? date;
  if (!editable(s, meal)) {
    addBotMessage(s, `${label(s, targetDate)}の献立は、もう変えられません。`);
    return;
  }
  const back = s.household.members.filter((m) => ids.includes(m.id) && meal!.absentMemberIds.includes(m.id));
  const names = back.map((m) => m.nickname).join('・');
  const day = meal.date;
  meal.absentMemberIds = meal.absentMemberIds.filter((id) => !ids.includes(id));
  meal.servings = servingsFor(s.household, meal.absentMemberIds);
  const lines = [`了解です。${label(s, day)}は${names}も食べるんですね（${servingsText(meal.servings)}）。`];
  const actions: ActionButton[] = [BTN_SHOPPING];
  // 食べる人が増えたので、安全をもう一度判定する（欠席の日だから入っていた料理を、そのままにしない）。
  const unsafe = meal.dishIds
    .map((id) => findDishIn(s.household, catalog, id))
    .filter((d): d is Dish => !!d && !!safetyProblem(s, catalog, d, meal!.absentMemberIds));
  if (unsafe.length > 0) {
    const res = isSafeOn(s, catalog, unsafe[0], meal.absentMemberIds);
    const reason = strongReasons(res.hits).slice(0, 2).join('・');
    const pick = alternativesFor(s, catalog, day, 3).find((o) =>
      o.every((id) => {
        const d = findDishIn(s.household, catalog, id);
        return !!d && !safetyProblem(s, catalog, d, meal!.absentMemberIds);
      }),
    );
    if (pick) {
      replaceMeal(s, rebuildMeal(s, catalog, day, pick, { changedBy: 'replan' }));
      dropProposalsFor(s, [day]);
      lines.push(`${unsafe[0].name}は${names}の除外（${reason}）に当たるので、${namesLine(s, catalog, pick)}に替えました。`);
    } else {
      lines.push(`${unsafe[0].name}は${names}の除外（${reason}）に当たります。「別のに」で替えてください。`);
      actions.unshift({ label: '別のに', action: { type: 'request_alternatives', date: day } });
    }
  }
  refreshShopping(s, catalog);
  lines.push('買い物リストも直しました。');
  addBotMessage(s, lines.join('\n'), { card: { kind: 'meal', date: day }, actions });
}

// ---------------------------------------------------------------------------
// リクエスト
// ---------------------------------------------------------------------------

/** 料理名の芯（「カレーライス」→「かれー」、「青椒肉絲（チンジャオロース）」→「青椒肉絲」）。 */
function nameCore(name: string): string {
  return normalizeJa(name).replace(/[（(].*[）)]$/, '').replace(/らいす$/, '');
}

/**
 * 頼まれた料理が除外・要確認に当たるとき、名前の近い、出してよい料理（「カレー」→ ルウを使わないキーマカレー）。
 * 同じ役割（主菜なら主菜）で、名前に芯を含むものから、最近食べていないもの・定番・名前の短いものの順に選ぶ。
 */
function similarAllowedDish(s: AppState, catalog: Catalog, dish: Dish, meal: PlannedMeal): Dish | undefined {
  const core = nameCore(dish.name);
  if (core.length < 2) return undefined;
  return allDishes(s.household, catalog)
    .filter((d) => d.id !== dish.id && d.role === dish.role && normalizeJa(d.name).includes(core))
    .filter((d) => !safetyProblem(s, catalog, d, meal.absentMemberIds))
    .map((d) => ({ d, sc: scoreMainOn(s, catalog, meal.date, d) }))
    .filter((x) => x.sc.allowed)
    .sort(
      (a, b) =>
        Number(a.sc.recent) - Number(b.sc.recent) ||
        Number(isFavorite(s.household, b.d.id)) - Number(isFavorite(s.household, a.d.id)) ||
        a.d.name.length - b.d.name.length,
    )[0]?.d;
}

/** 旬の月の書き方（[9, 10] →「9〜10月」、[12, 1, 2] →「12〜2月」）。 */
function monthsText(months: number[]): string {
  if (months.length === 1) return `${months[0]}月`;
  return `${months[0]}〜${months[months.length - 1]}月`;
}

/**
 * 同じ主菜の、近い日（前後7日以内）。作った記録（食べた日）と、これからの予定を分けて返す。
 * 「最近も食べています」は作った記録があるときだけ言う。
 */
function nearbySame(s: AppState, dishId: string, date: ISODate): { eaten?: ISODate; planned?: ISODate } {
  const near = (d: ISODate) => d !== date && Math.abs(diffDays(d, date)) <= 7;
  const eaten = s.history
    .filter((r) => r.status === 'cooked' && r.dishIds[0] === dishId && near(r.date))
    .map((r) => r.date)
    .sort()
    .at(-1);
  const planned = s.meals
    .filter((m) => m.status !== 'skipped' && m.status !== 'cooked' && m.dishIds[0] === dishId && near(m.date))
    .map((m) => m.date)
    .sort()[0];
  return { eaten, planned };
}

export function request(
  s: AppState,
  catalog: Catalog,
  cmd: { date?: ISODate; dishId?: string; protein?: Dish['protein']; genre?: Dish['genre']; ingredientId?: string; dishIds?: string[] },
): void {
  const dish = cmd.dishId ? findDishIn(s.household, catalog, cmd.dishId) : undefined;
  if (cmd.dishId && !dish) {
    addBotMessage(s, 'その料理が見つかりませんでした。');
    return;
  }
  const candidates = cmd.date
    ? [mealOn(s, cmd.date)].filter((m): m is PlannedMeal => !!m)
    : s.meals.filter((m) => m.date > s.today && m.status === 'planned' && m.kind === 'normal');
  const meal = candidates.find((m) => editable(s, m));
  if (!meal) {
    const when = cmd.date ? label(s, cmd.date) : 'この先';
    addBotMessage(s, `${when}は変えられる献立がありません。`, { actions: [BTN_WEEK] });
    return;
  }
  const lead: string[] = [];
  let to: Dish | undefined = dish;
  // 料理を頼まれていて、候補から選ぶ（「塩焼きがいい」「肉がいい」）。出せる候補が2つ以上なら、選んでもらう。
  if (!to && cmd.dishIds && cmd.dishIds.length > 0) {
    const all = uniq(cmd.dishIds)
      .map((id) => findDishIn(s.household, catalog, id))
      .filter((d): d is Dish => !!d);
    const cands = all.filter((d) => !meal.dishIds.includes(d.id));
    const ok = cands
      .filter((d) => !safetyProblem(s, catalog, d, meal.absentMemberIds) && inSeason(d, meal.date))
      .map((d) => ({ d, sc: d.role === 'main' ? scoreMainOn(s, catalog, meal.date, d) : undefined }))
      .filter((x) => !x.sc || x.sc.allowed)
      .sort((a, b) => Number(!!a.sc?.recent) - Number(!!b.sc?.recent) || (b.sc?.score ?? 0) - (a.sc?.score ?? 0));
    if (ok.length === 0) {
      const current = all.find((d) => meal.dishIds.includes(d.id));
      if (current) {
        addBotMessage(s, `${label(s, meal.date)}は、もう${current.name}の予定です。`, { card: { kind: 'meal', date: meal.date } });
        return;
      }
      const names = cands.slice(0, 2).map((d) => d.name).join('・');
      addBotMessage(s, `合う料理（${names || '候補'}など）は、除外の条件や旬に当たるため、今は出せません。`, {
        card: { kind: 'meal', date: meal.date },
      });
      return;
    }
    const fresh = ok.filter((x) => !x.sc?.recent);
    if (fresh.length >= 2) {
      const options = fresh.slice(0, 3).map(({ d }) =>
        d.role === 'side' || d.role === 'soup' ? [meal.dishIds[0], d.id].filter((x): x is string => !!x) : [d.id, ...sidesFor(s, catalog, meal.date, d)],
      );
      const note = absenceDependentNote(s, catalog, meal.date, options.flat());
      addBotMessage(s, [`${label(s, meal.date)}を、どれにしますか？`, ...(note ? [note] : [])].join('\n'), {
        card: { kind: 'alternatives', date: meal.date, options },
        actions: options.map((o) => ({ label: dishName(s, catalog, o[0]), action: { type: 'choose_alternative' as const, date: meal.date, dishIds: o } })),
      });
      return;
    }
    to = (fresh[0] ?? ok[0]).d;
  }
  if (!to) {
    const fits = (d: Dish) =>
      d.id !== meal.dishIds[0] && (!cmd.protein || d.protein === cmd.protein) && (!cmd.genre || d.genre === cmd.genre);
    const best = (pool: Dish[]) => {
      let bestScore = -Infinity;
      let pick: Dish | undefined;
      for (const d of pool) {
        const sc = scoreMainOn(s, catalog, meal.date, d);
        if (!sc.allowed) continue;
        const score = sc.score - (sc.recent ? 10 : 0);
        if (score > bestScore) {
          bestScore = score;
          pick = d;
        }
      }
      return pick;
    };
    const all = allDishes(s.household, catalog);
    // 食材を名指ししたら、まずその食材を使う主菜（なければラク日用の料理）から選ぶ（「さばがいい」→ さばの料理）。
    const ing = cmd.ingredientId ? catalog.ingredientById.get(cmd.ingredientId) : undefined;
    if (ing) {
      const uses = (d: Dish, ids: string[]) => ingIdsOf(s, d).some((id) => ids.includes(id));
      to =
        best(all.filter((d) => d.role === 'main' && d.id !== meal.dishIds[0] && uses(d, [ing.id]))) ??
        best(all.filter((d) => d.role === 'raku' && uses(d, [ing.id, ...(ing.substitutes ?? [])])));
      if (!to && (cmd.protein || cmd.genre)) lead.push(`${ing.name}を使う料理は、今は出せないので、ほかの料理にしました。`);
    }
    to ??= cmd.protein || cmd.genre ? best(all.filter((d) => d.role === 'main' && fits(d))) : undefined;
    if (!to) {
      addBotMessage(s, `${label(s, meal.date)}に合う料理が見つかりませんでした。`, { card: { kind: 'meal', date: meal.date } });
      return;
    }
  }
  // 安全はゆるめない。頼まれた料理が出せなければ、名前の近い、出せる料理をかわりに提案する（なければ理由だけ伝える）。
  const problem = safetyProblem(s, catalog, to, meal.absentMemberIds);
  let substituted = false;
  if (problem) {
    const alt = dish ? similarAllowedDish(s, catalog, dish, meal) : undefined;
    if (!alt) {
      addBotMessage(s, problem, { card: { kind: 'meal', date: meal.date } });
      return;
    }
    lead.push(problem);
    to = alt;
    substituted = true;
  }
  if (meal.dishIds.includes(to.id)) {
    addBotMessage(s, [...lead, `${label(s, meal.date)}は、もう${to.name}の予定です。`].join('\n'), {
      card: { kind: 'meal', date: meal.date },
    });
    return;
  }
  let toIds: string[];
  if (to.role === 'side' || to.role === 'soup') {
    toIds = [meal.dishIds[0], to.id].filter((x): x is string => !!x);
  } else {
    toIds = [to.id, ...sidesFor(s, catalog, meal.date, to)];
  }
  const proposal: Proposal = {
    id: nextId(s, 'prop'),
    kind: 'request',
    date: meal.date,
    fromDishIds: [...meal.dishIds],
    toDishIds: toIds,
    text: `${label(s, meal.date)}を${namesLine(s, catalog, toIds)}にしますか？`,
  };
  s.proposals = [...s.proposals.filter((p) => p.date !== meal.date), proposal];
  const lines = lead.length > 0 && substituted ? [...lead, `かわりに、${proposal.text}`] : [...lead, proposal.text];
  // 旬の外の料理は、入れられるが一言添える（売っていないことがある）。
  if (to.seasonMonths && to.seasonMonths.length > 0 && !inSeason(to, meal.date)) {
    lines.push(`${to.name}は${monthsText(to.seasonMonths)}ごろの料理です（売っていなければ「そのまま」を）。`);
  }
  // 7日以内の同じ主菜：作った記録なら「食べたばかり」、これからの予定なら、その日付を伝える。
  if (to.role === 'main') {
    const near = nearbySame(s, to.id, meal.date);
    if (near.planned) lines.push(`${label(s, near.planned)}にも${to.name}の予定があります。`);
    else if (near.eaten) lines.push(`${formatJa(near.eaten)}に食べたばかりですが${substituted ? '' : '、リクエストなので入れられます'}。`);
  }
  const note = absenceDependentNote(s, catalog, meal.date, toIds);
  if (note) lines.push(note);
  addBotMessage(s, lines.slice(0, 6).join('\n'), {
    card: { kind: 'meal', date: meal.date },
    actions: [
      { label: '替える', action: { type: 'accept_proposal', proposalId: proposal.id } },
      { label: 'そのまま', action: { type: 'reject_proposal', proposalId: proposal.id } },
    ],
  });
}

// ---------------------------------------------------------------------------
// 提案の承諾・見送り、週の作り直し
// ---------------------------------------------------------------------------

export function acceptProposal(s: AppState, catalog: Catalog, proposalId: string): void {
  const p = s.proposals.find((x) => x.id === proposalId);
  if (!p) {
    addBotMessage(s, 'その提案は、もう使えません。');
    return;
  }
  s.proposals = s.proposals.filter((x) => x.id !== proposalId);
  const meal = mealOn(s, p.date);
  if (!editable(s, meal) || meal.dishIds.join(',') !== p.fromDishIds.join(',')) {
    addBotMessage(s, '献立が変わったので、この提案は使えませんでした。', { card: { kind: 'meal', date: p.date } });
    return;
  }
  for (const id of p.toDishIds) {
    const d = findDishIn(s.household, catalog, id);
    const problem = d ? safetyProblem(s, catalog, d, meal.absentMemberIds) : 'その料理が見つかりませんでした。';
    if (problem) {
      addBotMessage(s, problem, { card: { kind: 'meal', date: p.date } });
      return;
    }
  }
  // 提案を作ったあとに、ほかの日が変わっていることがある。特売・在庫の提案は、旬・7日以内の重複を押した時点で確かめ直す
  // （リクエストは、頼まれた料理なので旬・7日以内でも入れる。そのときは返事で知らせる）。
  if (p.kind !== 'request') {
    const stale = staleReason(s, catalog, p.date, p.toDishIds);
    if (stale) {
      requestAlternatives(s, catalog, p.date, `献立が変わったので、この案は使えません（${stale}）。`);
      return;
    }
  }
  const fromMain = findDishIn(s.household, catalog, p.fromDishIds[0] ?? '');
  const toMain = findDishIn(s.household, catalog, p.toDishIds[0] ?? '');
  const reasons: string[] = [];
  if (toMain) {
    const fromIngs = new Set(fromMain ? ingIdsOf(s, fromMain) : []);
    const fresh = ingIdsOf(s, toMain)
      .map((id) => catalog.ingredientById.get(id))
      .find((i) => i && !i.pantry && !fromIngs.has(i.id));
    if (p.kind === 'sale_swap' && fresh) reasons.push(`${fresh.name}が安かったので`);
    if (p.kind === 'stock_swap') reasons.push('在庫に合わせて');
    if (p.kind === 'request') reasons.push('リクエストに合わせて');
  }
  const changedBy = p.kind === 'sale_swap' ? 'sale' : p.kind === 'request' ? 'user' : 'replan';
  replaceMeal(
    s,
    rebuildMeal(s, catalog, p.date, p.toDishIds, {
      changedBy,
      reasons: toMain?.role === 'raku' ? [rakuReason(toMain)] : reasons.length > 0 ? reasons : undefined,
    }),
  );
  dropProposalsFor(s, [p.date]);
  refreshShopping(s, catalog);
  const lines = [`${label(s, p.date)}を${namesLine(s, catalog, p.toDishIds)}に替えました。買い物リストも直しました。`];
  if (toMain?.role === 'main') {
    const near = nearbySame(s, toMain.id, p.date);
    if (near.planned) lines.push(`${label(s, near.planned)}にも${toMain.name}の予定があります。`);
  }
  const note = absenceDependentNote(s, catalog, p.date, p.toDishIds);
  if (note) lines.push(note);
  addBotMessage(s, lines.join('\n'), {
    card: { kind: 'meal', date: p.date },
    actions: [BTN_SHOPPING],
  });
}

export function rejectProposal(s: AppState, proposalId: string): void {
  const p = s.proposals.find((x) => x.id === proposalId);
  s.proposals = s.proposals.filter((x) => x.id !== proposalId);
  addBotMessage(s, p ? 'わかりました。そのままにします。' : 'その提案は、もう使えません。');
}

/**
 * 週の作り直し（設定を変えたときなど）。自分で替えた日・特売で替えた日（changedBy が user・sale）は、
 * 安全・旬・献立の曜日にまだ合うかぎり残し、ほかの日だけを作り直す。
 */
export function regenerateWeek(s: AppState, catalog: Catalog, weekStart: ISODate): void {
  const ws = weekStartOf(weekStart);
  const todayMeal = mealOn(s, s.today);
  const todayFixed = todayMeal && (todayMeal.status === 'cooked' || todayMeal.status === 'skipped');
  const from = ws > s.today ? ws : todayFixed ? addDays(s.today, 1) : s.today;
  const end = addDays(ws, 6);
  const settings = s.household.settings;
  const kept = s.meals.filter((m) => {
    if (m.date < from || m.date > end || m.status !== 'planned') return false;
    if (m.changedBy !== 'user' && m.changedBy !== 'sale') return false;
    if (!settings.dinnerWeekdays.includes(weekdayOf(m.date)) || m.dishIds.length === 0) return false;
    return m.dishIds.every((id) => {
      const d = findDishIn(s.household, catalog, id);
      return !!d && inSeason(d, m.date) && !safetyProblem(s, catalog, d, m.absentMemberIds);
    });
  });
  // 残す日も、人数・注意・メモは今の家族で計算し直す。
  for (const m of kept) {
    replaceMeal(s, rebuildMeal(s, catalog, m.date, m.dishIds, { kind: m.kind, changedBy: m.changedBy, reasons: m.reasons }));
  }
  const keepDates = new Set(kept.map((m) => m.date));
  const fresh = planWeek(s, catalog, ws, from, `regen${s.seq}`, keepDates);
  if (fresh.length === 0 && keepDates.size === 0) {
    addBotMessage(s, 'この週は、作り直せる日がありません。', { actions: [BTN_WEEK] });
    return;
  }
  const dates = new Set(fresh.map((m) => m.date));
  s.meals = sortMeals([...s.meals.filter((m) => !dates.has(m.date)), ...fresh]);
  dropProposalsFor(s, [...dates]);
  refreshShopping(s, catalog);
  const keptText = keepDates.size > 0 ? `自分で替えた日（${[...keepDates].sort().map(formatJa).join('・')}）は、そのままです。` : '';
  addWeekMessage(s, catalog, ws, { intro: `${formatJa(from)}からの献立を作り直しました。${keptText}` });
}
