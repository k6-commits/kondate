// 会話（DESIGN.md 3-9）。書き込みとボタンを処理し、返事（カードとボタンつき）を chat に追加する。
import type { Action, AppState, Catalog, ISODate, ParsedCommand, Reaction, StepResult } from './types';
import { addDays, isISODate, weekStartOf } from './dates';
import { findDishIn, mealOn } from './context';
import { isReasonableDate, parseMessage } from './parser';
import {
  absence,
  acceptProposal,
  chooseAlternative,
  have,
  outOfStock,
  regenerateWeek,
  rejectProposal,
  request,
  requestAlternatives,
  sale,
  todayImpossible,
} from './replan';
import { FREEZE_NOTE } from './shopping';
import { lowerStockForMeal, setStock } from './state';
import {
  BTN_SHOPPING,
  BTN_TODAY,
  BTN_WEEK,
  HELP_EXAMPLES,
  addMealMessage,
  addWeekMessage,
  lastWeekSummaryText,
  reactionActions,
} from './messages';
import { dateLabel, mealTitle, namesLine } from './text';
import { addBotMessage, addUserMessage, chatIds, clone, newBotMessages } from './util';

const PROTEINS = ['chicken', 'pork', 'beef', 'ground', 'fish', 'seafood', 'egg', 'tofu', 'none'];
const GENRES = ['wa', 'yo', 'chu', 'other'];

/** サーバーの LLM などから来た解釈を検証する（マスタにない id や不正な日付は捨てる）。 */
export function validateCommands(s: AppState, catalog: Catalog, parsed: ParsedCommand[]): ParsedCommand[] {
  const okDate = (d: unknown) => typeof d === 'string' && isISODate(d) && isReasonableDate(d, s.today);
  const okIng = (id: unknown) => typeof id === 'string' && catalog.ingredientById.has(id);
  const out: ParsedCommand[] = [];
  for (const c of Array.isArray(parsed) ? parsed : []) {
    if (!c || typeof c !== 'object') continue;
    switch (c.type) {
      case 'show_week':
      case 'show_today':
      case 'show_shopping':
      case 'today_impossible':
      case 'help':
        out.push({ type: c.type });
        break;
      case 'want_alternatives':
        if (c.date === undefined || okDate(c.date)) out.push(c.date ? { type: c.type, date: c.date } : { type: c.type });
        break;
      case 'absence':
        if (okDate(c.date) && typeof c.memberRef === 'string' && c.memberRef.trim()) out.push({ ...c });
        break;
      case 'sale':
      case 'out_of_stock':
      case 'have':
        if (okIng(c.ingredientId)) out.push({ type: c.type, ingredientId: c.ingredientId });
        break;
      case 'request': {
        if (c.date !== undefined && !okDate(c.date)) break;
        if (c.dishId !== undefined && !findDishIn(s.household, catalog, c.dishId)) break;
        if (c.protein !== undefined && !PROTEINS.includes(c.protein)) break;
        if (c.genre !== undefined && !GENRES.includes(c.genre)) break;
        if (!c.dishId && !c.protein && !c.genre) break;
        out.push({ ...c });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 表示の返事
// ---------------------------------------------------------------------------

function showWeek(s: AppState, catalog: Catalog): void {
  const ws = weekStartOf(s.today);
  const next = addDays(ws, 7);
  const remaining = s.meals.some((m) => weekStartOf(m.date) === ws && m.date >= s.today);
  const hasNext = s.meals.some((m) => weekStartOf(m.date) === next);
  if (remaining) addWeekMessage(s, catalog, ws);
  if (hasNext) {
    // 終わった週の振り返りは、次の週の献立と一緒に伝える。
    addWeekMessage(s, catalog, next, { summary: remaining ? undefined : lastWeekSummaryText(s, catalog) || undefined });
  }
  if (!remaining && !hasNext) {
    if (s.meals.some((m) => weekStartOf(m.date) === ws)) {
      addWeekMessage(s, catalog, ws, { intro: '今週の夕食です。来週の献立は、買い物日の前日に作ります。' });
    } else {
      addBotMessage(s, '献立はまだありません。来週の献立は、買い物日の前日に作ります。', { actions: [BTN_TODAY] });
    }
  }
}

function showToday(s: AppState, catalog: Catalog): void {
  const meal = mealOn(s, s.today);
  if (meal && meal.status === 'cooked') {
    addBotMessage(s, `今日の${mealTitle(s, catalog, meal)}は「作った」と記録しています。家族の反応はどうでしたか？`, {
      card: { kind: 'meal', date: s.today },
      actions: reactionActions(s, s.today),
    });
    return;
  }
  if (meal) {
    addMealMessage(s, catalog, s.today);
    return;
  }
  const next = s.meals.find((m) => m.date > s.today && m.status === 'planned');
  if (next) addMealMessage(s, catalog, next.date, { intro: '今日は献立の日ではありません。次はこちらです。' });
  else addBotMessage(s, '今日は献立の日ではありません。', { actions: [BTN_WEEK] });
}

function showShopping(s: AppState): void {
  const lists = s.shopping.filter((l) => l.date >= s.today);
  if (lists.length === 0) {
    addBotMessage(s, '今は買う物はありません。', { actions: [BTN_WEEK] });
    return;
  }
  lists.slice(0, 3).forEach((list, i) => {
    const left = list.items.filter((it) => !it.checked).length;
    const lines = [`${dateLabel(s.today, list.date)}の買い物リストです（${left}品）。`];
    if (i === 0 && list.items.some((it) => it.notes.some((nt) => nt.startsWith(FREEZE_NOTE)))) {
      lines.push('「買ったら冷凍」の物は、帰ったら冷凍してください。');
    }
    if (i === 0 && list.pantry.length > 0) lines.push('調味料などは、家にあるか確かめてください。');
    addBotMessage(s, lines.join('\n'), { card: { kind: 'shopping', date: list.date }, actions: i === 0 ? [BTN_WEEK] : undefined });
  });
}

function showHelp(s: AppState): void {
  addBotMessage(s, ['こんなふうに送ってください。', ...HELP_EXAMPLES.map((e) => `・${e}`)].join('\n'), {
    actions: [BTN_WEEK, BTN_TODAY, BTN_SHOPPING],
  });
}

function showUnknown(s: AppState): void {
  addBotMessage(
    s,
    ['すみません、うまく読み取れませんでした。たとえば、こう送ってください。', '・今日は無理', '・水曜は夫が飲み会', '・卵切れた'].join('\n'),
    { actions: [BTN_TODAY, BTN_WEEK] },
  );
}

/** 日付の指定がない「別のに」の対象：今日の献立があれば今日、なければ次の献立の日。 */
function defaultTargetDate(s: AppState): ISODate {
  const today = mealOn(s, s.today);
  if (today && (today.status === 'planned' || today.status === 'unconfirmed')) return s.today;
  return s.meals.find((m) => m.date > s.today && m.status === 'planned')?.date ?? s.today;
}

function runCommand(s: AppState, catalog: Catalog, cmd: ParsedCommand): void {
  switch (cmd.type) {
    case 'show_week':
      return showWeek(s, catalog);
    case 'show_today':
      return showToday(s, catalog);
    case 'show_shopping':
      return showShopping(s);
    case 'today_impossible':
      return todayImpossible(s, catalog, s.today);
    case 'want_alternatives':
      return requestAlternatives(s, catalog, cmd.date ?? defaultTargetDate(s));
    case 'absence':
      return absence(s, catalog, cmd.date, cmd.memberRef);
    case 'sale':
      return sale(s, catalog, cmd.ingredientId);
    case 'out_of_stock':
      return outOfStock(s, catalog, cmd.ingredientId);
    case 'have':
      return have(s, catalog, cmd.ingredientId);
    case 'request':
      return request(s, catalog, cmd);
    case 'help':
      return showHelp(s);
    case 'unknown':
      return showUnknown(s);
  }
}

/** 公開API：利用者の書き込みを処理する。 */
export function handleUserText(state: AppState, catalog: Catalog, text: string, parsed?: ParsedCommand[]): StepResult {
  const s = clone(state);
  const before = chatIds(s);
  addUserMessage(s, text);
  let commands = parsed ? validateCommands(s, catalog, parsed) : [];
  if (commands.length === 0) {
    commands = parseMessage(text, { today: s.today, members: s.household.members, catalog });
  }
  for (const cmd of commands.slice(0, 5)) runCommand(s, catalog, cmd);
  return { state: s, replies: newBotMessages(s, before) };
}

// ---------------------------------------------------------------------------
// ボタン
// ---------------------------------------------------------------------------

const MARK: Record<Reaction, string> = { great: '◎', ok: '○', meh: '△' };

function recordCooked(s: AppState, catalog: Catalog, date: ISODate): boolean {
  const meal = mealOn(s, date);
  if (!meal || meal.dishIds.length === 0) return false;
  if (meal.status === 'cooked') return true;
  meal.status = 'cooked';
  const key = meal.dishIds.join(',');
  s.history = s.history.filter((r) => !(r.date === date && r.dishIds.join(',') === key));
  s.history.push({ date, dishIds: [...meal.dishIds], status: 'cooked', reactions: [] });
  lowerStockForMeal(s, catalog, meal);
  return true;
}

function cooked(s: AppState, catalog: Catalog, date: ISODate): void {
  const meal = mealOn(s, date);
  if (!meal || meal.dishIds.length === 0) {
    addBotMessage(s, 'その日の献立が見つかりませんでした。');
    return;
  }
  if (date > s.today) {
    addBotMessage(s, 'まだ先の献立です。作ったら教えてください。', { card: { kind: 'meal', date } });
    return;
  }
  const already = meal.status === 'cooked';
  recordCooked(s, catalog, date);
  const paid = s.household.settings.plan === 'paid';
  addBotMessage(
    s,
    already
      ? 'もう記録してあります。家族の反応はどうでしたか？'
      : `おつかれさまでした。家族の反応はどうでしたか？${paid ? '\n一人ずつ押せます。' : ''}`,
    { card: { kind: 'meal', date }, actions: reactionActions(s, date) },
  );
}

function notCooked(s: AppState, catalog: Catalog, date: ISODate): void {
  const meal = mealOn(s, date);
  if (!meal || meal.dishIds.length === 0) {
    addBotMessage(s, 'その日の献立が見つかりませんでした。');
    return;
  }
  meal.status = 'skipped';
  const key = meal.dishIds.join(',');
  s.history = s.history.filter((r) => !(r.date === date && r.dishIds.join(',') === key));
  s.history.push({ date, dishIds: [...meal.dishIds], status: 'skipped', reactions: [] });
  addBotMessage(s, `記録しました。${mealTitle(s, catalog, meal)}は、また近いうちに入れます。\n使わなかった食材は、消費期限を確かめて早めに使いましょう。`);
}

function react(s: AppState, catalog: Catalog, date: ISODate, memberId: string, reaction: Reaction): void {
  let rec = s.history.find((r) => r.date === date && r.status === 'cooked');
  if (!rec) {
    if (date > s.today || !recordCooked(s, catalog, date)) {
      addBotMessage(s, 'まだ作った記録がありません。');
      return;
    }
    rec = s.history.find((r) => r.date === date && r.status === 'cooked');
  }
  if (!rec) return;
  rec.reactions = [...rec.reactions.filter((r) => r.memberId !== memberId), { memberId, reaction }];
  const who = memberId === 'household' ? '' : `${s.household.members.find((m) => m.id === memberId)?.nickname ?? ''}は`;
  const text =
    reaction === 'great'
      ? `${who}◎ですね。よかったです。また献立に入れます。`
      : reaction === 'ok'
        ? `${who}○ですね。ありがとうございます。参考にします。`
        : `${who}△ですね。わかりました。しばらくは出さないようにします。`;
  addBotMessage(s, text);
}

function checkItem(s: AppState, shoppingDate: ISODate, ingredientId: string, checked: boolean): void {
  const item = s.shopping.find((l) => l.date === shoppingDate)?.items.find((i) => i.ingredientId === ingredientId);
  if (!item) return;
  item.checked = checked;
  if (checked) {
    setStock(s, ingredientId, 'plenty', item.notes.includes(FREEZE_NOTE));
  } else {
    s.inventory = s.inventory.filter((i) => !(i.ingredientId === ingredientId && i.acquiredOn === s.today && i.level === 'plenty'));
  }
}

/** 公開API：ボタン（postback）の処理。利用者の発言として、ボタンの文言も chat に残す（買い物のチェックは残さない）。 */
export function applyAction(state: AppState, catalog: Catalog, action: Action): StepResult {
  const s = clone(state);
  const before = chatIds(s);
  switch (action.type) {
    case 'open_week':
      addUserMessage(s, '今週の献立');
      showWeek(s, catalog);
      break;
    case 'open_today':
      addUserMessage(s, '今日のごはん');
      showToday(s, catalog);
      break;
    case 'open_shopping':
      addUserMessage(s, '買い物リスト');
      showShopping(s);
      break;
    case 'cooked':
      addUserMessage(s, '作った');
      cooked(s, catalog, action.date);
      break;
    case 'not_cooked':
      addUserMessage(s, '作らなかった');
      notCooked(s, catalog, action.date);
      break;
    case 'request_alternatives':
      addUserMessage(s, '別のに');
      requestAlternatives(s, catalog, action.date);
      break;
    case 'choose_alternative':
      addUserMessage(s, namesLine(s, catalog, action.dishIds) || '別の案');
      chooseAlternative(s, catalog, action.date, action.dishIds);
      break;
    case 'today_impossible':
      addUserMessage(s, '今日は無理');
      if (action.date === s.today) todayImpossible(s, catalog, action.date);
      else requestAlternatives(s, catalog, action.date);
      break;
    case 'accept_proposal':
      addUserMessage(s, '替える');
      acceptProposal(s, catalog, action.proposalId);
      break;
    case 'reject_proposal':
      addUserMessage(s, 'そのまま');
      rejectProposal(s, action.proposalId);
      break;
    case 'react': {
      const nick = action.memberId === 'household' ? '' : `${s.household.members.find((m) => m.id === action.memberId)?.nickname ?? ''} `;
      addUserMessage(s, `${nick}${MARK[action.reaction]}`);
      react(s, catalog, action.date, action.memberId, action.reaction);
      break;
    }
    case 'check_item':
      checkItem(s, action.shoppingDate, action.ingredientId, action.checked);
      break;
    case 'regenerate_week':
      addUserMessage(s, '献立を作り直す');
      regenerateWeek(s, catalog, action.weekStart);
      break;
  }
  return { state: s, replies: newBotMessages(s, before) };
}
