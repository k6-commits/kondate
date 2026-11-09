// 組み直し（DESIGN.md 3-7・3-8）。ここの関数は、複製済みの state（s）を書き換え、bot の返事を追加する。
import type { AppState, Catalog, Dish, ISODate, Ingredient, Member, PlannedMeal, Proposal } from './types';
import { addDays, diffDays, formatJa, weekStartOf } from './dates';
import {
  allDishes,
  eatingMembers,
  findDishIn,
  ingredientsOf,
  isFavorite,
  isMeat,
  mealOn,
  proteinOfKind,
  servingsFor,
  sortMeals,
} from './context';
import { alternativesFor, bestRakuFor, isSafeOn, planWeek, rakuReason, rebuildMeal, scoreMainOn, sidesFor } from './planner';
import { isAllowed } from './safety';
import { buildShoppingLists } from './shopping';
import { setStock } from './state';
import { addBotMessage, nextId, normalizeJa } from './util';
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

/** 安全の判定（ユーザーの指定でもゆるめない）。だめなら理由の文を返す。 */
function safetyProblem(s: AppState, catalog: Catalog, dish: Dish, absent: string[]): string | null {
  const res = isSafeOn(s, catalog, dish, absent);
  if (isAllowed(res, s.household)) return null;
  const branded = res.hits.filter((h) => h.reason.endsWith('銘柄で原材料が違います'));
  if (res.status === 'excluded') {
    // 除外に当たった理由（卵 など）を先に。銘柄の注意は、ほかに理由がないときだけ。
    const strong = res.hits.filter((h) => !branded.includes(h) && !h.reason.includes('要確認'));
    const reasons = (strong.length > 0 ? strong : res.hits).map((h) => h.reason.replace(/（派生原材料）$/, ''));
    return `${dish.name}は除外の条件（${[...new Set(reasons)].slice(0, 2).join('・')}）に当たるため、入れられません。`;
  }
  const names = [...new Set(branded.map((h) => catalog.ingredientById.get(h.ingredientId)?.name).filter((n): n is string => !!n))];
  const why = names.length > 0 ? `${names.slice(0, 2).join('・')}は銘柄で原材料が違います` : '材料がわかりません';
  return `${dish.name}は「要確認」（${why}）のため、提案していません。`;
}

// ---------------------------------------------------------------------------
// 今日は無理
// ---------------------------------------------------------------------------

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
    addBotMessage(s, `${when}はもともとラク日です。${namesLine(s, catalog, meal.dishIds) || 'あるもの'}で十分です。`, {
      card: { kind: 'meal', date },
      actions: [{ label: 'ほかの案', action: { type: 'request_alternatives', date } }],
    });
    return;
  }

  const original = [...meal.dishIds];
  const originalDishes = original.map((id) => findDishIn(s.household, catalog, id)).filter((d): d is Dish => !!d);
  const originalMain = originalDishes[0];
  const ws = weekStartOf(date);
  const target = s.meals.find(
    (m) =>
      m.date > date &&
      weekStartOf(m.date) === ws &&
      m.kind === 'raku' &&
      m.status === 'planned' &&
      originalDishes.every((d) => isAllowed(isSafeOn(s, catalog, d, m.absentMemberIds), s.household)),
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
  lines.push(
    target ? `${mainName}は${label(s, target.date)}に回します。` : `${mainName}は、来週の候補に回します。`,
  );
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
  const perishable = originalDishes
    .flatMap((d) => ingIdsOf(s, d))
    .map((id) => catalog.ingredientById.get(id))
    .filter((i): i is NonNullable<typeof i> => !!i && !i.pantry && i.shelfLifeDays <= 2 && i.freezable);
  const names = [...new Set(perishable.map((i) => i.name))].slice(0, 2);
  if (names.length > 0) lines.push(`${names.join('と')}は消費期限を確かめて、明日までに使えなければ今夜冷凍してください。`);
  addBotMessage(s, lines.join('\n'), {
    card: { kind: 'meal', date },
    actions: [{ label: 'ほかの案', action: { type: 'request_alternatives', date } }, BTN_WEEK],
  });
}

// ---------------------------------------------------------------------------
// 別のに
// ---------------------------------------------------------------------------

export function requestAlternatives(s: AppState, catalog: Catalog, date: ISODate): void {
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
  addBotMessage(s, `${label(s, date)}の別の案です。どちらにしますか？`, {
    card: { kind: 'alternatives', date, options },
    actions: options.map((o) => ({
      label: dishName(s, catalog, o[0]),
      action: { type: 'choose_alternative' as const, date, dishIds: o },
    })),
  });
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
  replaceMeal(s, rebuildMeal(s, catalog, date, dishIds, { changedBy: 'user' }));
  dropProposalsFor(s, [date]);
  refreshShopping(s, catalog);
  addBotMessage(s, `${label(s, date)}は${namesLine(s, catalog, dishIds)}にしました。買い物リストも直しました。`, {
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
  if (where) lines.push(`${label(s, where.date)}の買い物リストに入れました。`);
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
  setStock(s, ingredientId, 'plenty');
  refreshShopping(s, catalog);
  const uses = usesOf(s, catalog, ingredientId);
  if (uses.length > 0) {
    const days = uses.map((m) => `${label(s, m.date)}の${mealTitle(s, catalog, m)}`).join('、');
    addBotMessage(s, `${ing.name}を在庫に入れました。${days}で使います。\n買い物リストからも外しました。`, {
      actions: [BTN_SHOPPING],
    });
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

/** 「夫」「パパ」「上の子」やニックネーム、member の id からメンバーを探す。 */
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
  if (has(r, HUSBAND)) {
    const nick = adults.find((m) => nickIn(m, HUSBAND));
    if (nick) return [nick];
    const others = adults.filter((m) => !nickIn(m, WIFE));
    if (others.length === 1) return others;
    const partner = adults.find((m) => m.role === 'partner');
    return partner ? [partner] : [];
  }
  if (has(r, WIFE)) {
    const nick = adults.find((m) => nickIn(m, WIFE));
    if (nick) return [nick];
    const others = adults.filter((m) => !nickIn(m, HUSBAND));
    if (others.length === 1) return others;
    const parent = adults.find((m) => m.role === 'parent');
    return parent ? [parent] : [];
  }
  const byAge = [...kids].sort((a, b) => AGE_RANK[b.ageBand] - AGE_RANK[a.ageBand]);
  if (r.includes('上の子') || r.includes('長男') || r.includes('長女')) return byAge.slice(0, 1);
  if (r.includes('下の子') || r.includes('末っ子')) return byAge.slice(-1);
  if (r.includes('息子') || r.includes('娘')) return kids.length === 1 ? kids : [];
  if (has(r, CHILD)) return kids.filter((m) => m.ageBand !== 'infant');
  return [];
}

export function absence(s: AppState, catalog: Catalog, date: ISODate, memberRef: string): void {
  const who = resolveMembers(s.household.members, memberRef);
  if (who.length === 0) {
    addBotMessage(s, `「${memberRef}」が誰か分かりませんでした。ニックネームで教えてください（例：水曜はパパが飲み会）。`);
    return;
  }
  const meal = mealOn(s, date);
  if (!meal) {
    addBotMessage(s, `${label(s, date)}の献立はまだありません。献立ができたら、もう一度教えてください。`);
    return;
  }
  if (!editable(s, meal)) {
    addBotMessage(s, `${label(s, date)}の献立は、もう変えられません。`);
    return;
  }
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
  addBotMessage(
    s,
    `了解です。${label(s, date)}は${names}の分を減らしました（${servingsText(meal.servings)}）。\n買い物リストも直しました。`,
    { card: { kind: 'meal', date }, actions: [BTN_SHOPPING] },
  );
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

export function request(
  s: AppState,
  catalog: Catalog,
  cmd: { date?: ISODate; dishId?: string; protein?: Dish['protein']; genre?: Dish['genre'] },
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
  let to: Dish | undefined = dish;
  if (!to) {
    const pool = allDishes(s.household, catalog).filter(
      (d) =>
        d.role === 'main' &&
        d.id !== meal.dishIds[0] &&
        (!cmd.protein || d.protein === cmd.protein) &&
        (!cmd.genre || d.genre === cmd.genre),
    );
    let bestScore = -Infinity;
    for (const d of pool) {
      const sc = scoreMainOn(s, catalog, meal.date, d);
      if (!sc.allowed) continue;
      const score = sc.score - (sc.recent ? 10 : 0);
      if (score > bestScore) {
        bestScore = score;
        to = d;
      }
    }
    if (!to) {
      addBotMessage(s, `${label(s, meal.date)}に合う料理が見つかりませんでした。`, { card: { kind: 'meal', date: meal.date } });
      return;
    }
  }
  // 安全はゆるめない。頼まれた料理が出せなければ、名前の近い、出せる料理をかわりに提案する（なければ理由だけ伝える）。
  const problem = safetyProblem(s, catalog, to, meal.absentMemberIds);
  const lead: string[] = [];
  if (problem) {
    const alt = dish ? similarAllowedDish(s, catalog, dish, meal) : undefined;
    if (!alt) {
      addBotMessage(s, problem, { card: { kind: 'meal', date: meal.date } });
      return;
    }
    lead.push(problem);
    to = alt;
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
  const lines = lead.length > 0 ? [...lead, `かわりに、${proposal.text}`] : [proposal.text];
  const sc = scoreMainOn(s, catalog, meal.date, to);
  if (to.role === 'main' && sc.recent) lines.push('最近も食べていますが、リクエストなので入れられます。');
  addBotMessage(s, lines.join('\n'), {
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
  addBotMessage(s, `${label(s, p.date)}を${namesLine(s, catalog, p.toDishIds)}に替えました。買い物リストも直しました。`, {
    card: { kind: 'meal', date: p.date },
    actions: [BTN_SHOPPING],
  });
}

export function rejectProposal(s: AppState, proposalId: string): void {
  const p = s.proposals.find((x) => x.id === proposalId);
  s.proposals = s.proposals.filter((x) => x.id !== proposalId);
  addBotMessage(s, p ? 'わかりました。そのままにします。' : 'その提案は、もう使えません。');
}

export function regenerateWeek(s: AppState, catalog: Catalog, weekStart: ISODate): void {
  const ws = weekStartOf(weekStart);
  const todayMeal = mealOn(s, s.today);
  const todayFixed = todayMeal && (todayMeal.status === 'cooked' || todayMeal.status === 'skipped');
  const from = ws > s.today ? ws : todayFixed ? addDays(s.today, 1) : s.today;
  const fresh = planWeek(s, catalog, ws, from, `regen${s.seq}`);
  if (fresh.length === 0) {
    addBotMessage(s, 'この週は、作り直せる日がありません。', { actions: [BTN_WEEK] });
    return;
  }
  const dates = new Set(fresh.map((m) => m.date));
  s.meals = sortMeals([...s.meals.filter((m) => !dates.has(m.date)), ...fresh]);
  dropProposalsFor(s, [...dates]);
  refreshShopping(s, catalog);
  addWeekMessage(s, catalog, ws, { intro: `${formatJa(from)}からの献立を作り直しました。` });
}

