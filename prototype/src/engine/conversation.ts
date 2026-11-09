// 会話（DESIGN.md 3-9）。書き込みとボタンを処理し、返事（カードとボタンつき）を chat に追加する。
import type { Action, ActionButton, AppState, Catalog, ChatMessage, ISODate, ParsedCommand, Proposal, Reaction, StepResult } from './types';
import { addDays, formatJa, isISODate, weekStartOf, weekdayOf } from './dates';
import { eatingMembers, everyoneOut, findDishIn, ingredientsOf, mealOn } from './context';
import { SELF_WORDS, dateAnswer, findDates, isReasonableDate, memberAnswer, parseMessage } from './parser';
import {
  absence,
  acceptProposal,
  chooseAlternative,
  dateOfDish,
  froze,
  have,
  isAskWhichDay,
  isAskWho,
  newTurn,
  outOfStock,
  regenerateWeek,
  rejectProposal,
  request,
  requestAlternatives,
  resolveMembers,
  sale,
  stockAnswer,
  todayImpossible,
  type Turn,
} from './replan';
import { BOUGHT_NOTE, FREEZE_NOTE, buildShoppingLists, capacityOf } from './shopping';
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
import { dateLabel, dayWord, dishName, mealTitle, namesLine } from './text';
import { addBotMessage, addUserMessage, chatIds, clone, newBotMessages, normalizeJa } from './util';

const PROTEINS = ['chicken', 'pork', 'beef', 'ground', 'fish', 'seafood', 'egg', 'tofu', 'none'];
const GENRES = ['wa', 'yo', 'chu', 'other'];

/** LLM に見せた member の id（member_2）。LLM が書き方を変えたもの（member-2・member 2・メンバー2）も同じ id とみなす（NFKC のあと）。 */
const MEMBER_ID = /(?:member|メンバー)[\s_\-‐－ー・]*(\d+)/giu;
/** 数字のない「member」「メンバー」も、LLM が id を書きかけたもの（家族の言い方ではない）。 */
const MEMBER_WORD = /member|メンバー/iu;

/** サーバーの LLM などから来た解釈を検証する（マスタにない id や不正な日付は捨てる）。 */
export function validateCommands(s: AppState, catalog: Catalog, parsed: ParsedCommand[]): ParsedCommand[] {
  const okDate = (d: unknown) => typeof d === 'string' && isISODate(d) && isReasonableDate(d, s.today);
  const okIng = (id: unknown) => typeof id === 'string' && catalog.ingredientById.has(id);
  const okDish = (id: unknown): id is string => typeof id === 'string' && !!findDishIn(s.household, catalog, id);
  const out: ParsedCommand[] = [];
  for (const c of Array.isArray(parsed) ? parsed : []) {
    if (!c || typeof c !== 'object') continue;
    switch (c.type) {
      case 'show_today':
      case 'show_shopping':
        // 日付があれば、その日の献立・買い物（「明日の夕飯なに？」）。読めない日付は捨てて、今日の分にする。
        out.push(okDate(c.date) && c.date !== s.today ? { type: c.type, date: c.date } : { type: c.type });
        break;
      case 'show_week':
      case 'today_impossible':
      case 'help':
        out.push({ type: c.type });
        break;
      case 'want_alternatives': {
        if (c.date !== undefined && !okDate(c.date)) break;
        if (c.dishId !== undefined && !okDish(c.dishId)) break;
        out.push({ type: c.type, ...(c.date ? { date: c.date } : {}), ...(c.dishId ? { dishId: c.dishId } : {}) });
        break;
      }
      case 'absence': {
        if (!okDate(c.date) || typeof c.memberRef !== 'string' || !c.memberRef.trim()) break;
        const flags = c.cancel === true ? { cancel: true } : {};
        // LLM には名前の代わりに member の id を見せている。家族にいない id（member_9 など）は読みちがいなので、その欠席は
        // 使わない（返事に id を出さない）。書き方を変えた id（「member-9」「メンバー9」「member９」）と、数字のない「member」も
        // 同じ。id がいくつか書かれていたら（「member_2とmember_3」）、1人ずつの欠席にする（画面の checkMemberRefs と同じ）。
        const ref = c.memberRef.normalize('NFKC');
        const ids = [...new Set([...ref.matchAll(MEMBER_ID)].map((m) => `member_${m[1]}`))];
        if (ids.length === 0) {
          if (!MEMBER_WORD.test(ref)) out.push({ type: c.type, date: c.date, memberRef: c.memberRef, ...flags });
          break;
        }
        if (ids.some((id) => !s.household.members.some((m) => m.id === id))) break;
        for (const id of ids) out.push({ type: c.type, date: c.date, memberRef: id, ...flags });
        break;
      }
      case 'sale':
        if (okIng(c.ingredientId)) out.push({ type: c.type, ingredientId: c.ingredientId });
        break;
      case 'out_of_stock':
        if (okIng(c.ingredientId)) out.push({ type: c.type, ingredientId: c.ingredientId, ...(c.question === true ? { question: true } : {}) });
        break;
      case 'have':
        if (okIng(c.ingredientId)) {
          out.push({
            type: c.type,
            ingredientId: c.ingredientId,
            ...(c.question === true ? { question: true } : {}),
            ...(c.frozen === true ? { frozen: true } : {}),
          });
        }
        break;
      case 'request': {
        if (c.date !== undefined && !okDate(c.date)) break;
        if (c.dishId !== undefined && !okDish(c.dishId)) break;
        if (c.protein !== undefined && !PROTEINS.includes(c.protein)) break;
        if (c.genre !== undefined && !GENRES.includes(c.genre)) break;
        if (c.ingredientId !== undefined && !okIng(c.ingredientId)) break;
        const dishIds = Array.isArray(c.dishIds) ? c.dishIds.filter(okDish) : undefined;
        if (!c.dishId && !c.protein && !c.genre && !c.ingredientId && !dishIds?.length) break;
        out.push({
          type: c.type,
          ...(c.date ? { date: c.date } : {}),
          ...(c.dishId ? { dishId: c.dishId } : {}),
          ...(c.protein ? { protein: c.protein } : {}),
          ...(c.genre ? { genre: c.genre } : {}),
          ...(c.ingredientId ? { ingredientId: c.ingredientId } : {}),
          ...(dishIds?.length ? { dishIds } : {}),
        });
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

function showToday(s: AppState, catalog: Catalog, date?: ISODate): void {
  if (date && date !== s.today) {
    // 「明日の夕飯なに？」：その日の献立。献立がなければ、次の献立の日を見せる。
    const day = mealOn(s, date);
    if (day) {
      addMealMessage(s, catalog, date);
      return;
    }
    const later = s.meals.find((m) => m.date > date && m.status === 'planned' && !everyoneOut(s.household, m));
    if (later) addMealMessage(s, catalog, later.date, { intro: `${dateLabel(s.today, date)}は献立の日ではありません。次はこちらです。` });
    else addBotMessage(s, `${dateLabel(s.today, date)}の献立はありません。`, { actions: [BTN_WEEK] });
    return;
  }
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
  const next = s.meals.find((m) => m.date > s.today && m.status === 'planned' && !everyoneOut(s.household, m));
  if (next) addMealMessage(s, catalog, next.date, { intro: '今日は献立の日ではありません。次はこちらです。' });
  else addBotMessage(s, '今日は献立の日ではありません。', { actions: [BTN_WEEK] });
}

/** 「明日何買えばいい？」：その日の買い物リスト。その日が買い物の日でなければ、そう伝えて、次のリストを見せる。 */
function showShoppingOn(s: AppState, date: ISODate): void {
  const when = dateLabel(s.today, date);
  const list = s.shopping.find((l) => l.date === date);
  if (list) {
    const left = list.items.filter((it) => !it.checked).length;
    addBotMessage(s, `${when}の買い物リストです（${left}品）。`, { card: { kind: 'shopping', date }, actions: [BTN_WEEK] });
    return;
  }
  const head = s.household.settings.shoppingWeekdays.includes(weekdayOf(date)) ? `${when}に買う物はありません。` : `${when}は買い物の日ではありません。`;
  // その日の夕食の材料が、前の買い物日のリストに残っていれば（まだチェックしていなければ）、そう伝える。
  const earlier = s.shopping.filter((l) => l.date >= s.today && l.date < date);
  const forDay = earlier.find((l) => l.items.some((i) => !i.checked && i.forDates.includes(date)));
  if (forDay) {
    const n = forDay.items.filter((i) => !i.checked && i.forDates.includes(date)).length;
    addBotMessage(s, `${head}\n${when}の夕食の材料は、${dateLabel(s.today, forDay.date)}の買い物リストに入っています（${n}品）。`, {
      card: { kind: 'shopping', date: forDay.date },
      actions: [BTN_WEEK],
    });
    return;
  }
  const next = s.shopping.find((l) => l.date > date);
  if (next) {
    const left = next.items.filter((it) => !it.checked).length;
    addBotMessage(s, `${head}\n次は${dateLabel(s.today, next.date)}の買い物です（${left}品）。`, {
      card: { kind: 'shopping', date: next.date },
      actions: [BTN_WEEK],
    });
    return;
  }
  addBotMessage(s, head, { actions: [BTN_WEEK] });
}

function showShopping(s: AppState, date?: ISODate): void {
  if (date && date !== s.today) {
    showShoppingOn(s, date);
    return;
  }
  const lists = s.shopping.filter((l) => l.date >= s.today);
  // 過ぎた買い物日のリストで、これからの献立に使うのにチェックしていない物（買えなかった物）も見せる。
  // 今日のリストへは移さない（チェックを使わずに買う人が、二重に買わないように）。
  // みんな外で食べる日（夕食なし）の分は、もう買わなくてよいので数えない。
  const needed = (d: ISODate) => {
    if (d < s.today) return false;
    const meal = mealOn(s, d);
    return !meal || !everyoneOut(s.household, meal);
  };
  const leftover = s.shopping
    .filter((l) => l.date < s.today)
    .map((l) => ({ l, left: l.items.filter((i) => !i.checked && i.forDates.some(needed)) }))
    .filter((x) => x.left.length > 0)
    .at(-1);
  if (leftover) {
    addBotMessage(
      s,
      `${formatJa(leftover.l.date)}のリストで、まだチェックしていない物があります（${leftover.left.length}品）。\n買ってあれば、チェックするか「〇〇買った」と送ってください。`,
      { card: { kind: 'shopping', date: leftover.l.date } },
    );
  }
  if (lists.length === 0) {
    if (leftover) return;
    // 来週の献立がまだなら、いつリストができるかも伝える。
    const hasNext = s.meals.some((m) => weekStartOf(m.date) === addDays(weekStartOf(s.today), 7));
    addBotMessage(s, hasNext ? '今は買う物はありません。' : '今は買う物はありません。来週の分は、来週の献立と一緒に作ります。', {
      actions: [BTN_WEEK],
    });
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
  // 「今日のごはん」はボタンがあるので、例からは外して、アレルギーの登録先を添える（6行まで）。
  const examples = HELP_EXAMPLES.filter((e) => e !== '今日のごはん');
  addBotMessage(
    s,
    ['こんなふうに送ってください。', ...examples.map((e) => `・${e}`), 'アレルギーや食べられない物は、「家族と設定」で登録します。'].join('\n'),
    { actions: [BTN_WEEK, BTN_TODAY, BTN_SHOPPING] },
  );
}

const THANKS = /ありがと|さんきゅー|助かる|助かった|感謝/;
const OKAY = /^(了解|りょうかい|わかった|分かった|わかりました|分かりました|ok|おっけー|おけ|はーい|いいね|よろしく)/;
const HELLO = /^(おはよう|こんにちは|こんばんは|おつかれ|お疲れ)/;
/** おまかせ（「何でもいい」）。今の献立のまま進める。 */
const ANY = /^(何でも|なんでも|おまかせ|お任せ|任せる|まかせる|任せます|まかせます)/;
/** アレルギー・食べられない物の話（「はるとはえびアレルギー」「卵アレルギーの子が遊びに来る」）。トークでは登録できない。 */
const ALLERGY = /あれるぎー|食べられない|たべられない|除外/;
/** 家族ではない人（お客さん）の話。 */
const GUEST = /遊びに来|あそびにく|あそびに来|来客|お客|おきゃく|友達|ともだち|友だち|親戚|しんせき|お泊まりに来|泊まりに来/;
/** 時間の短い料理の希望（「20分で作れるのがいい」「時短で」）。 */
const QUICK = /\d+分|時短|じたん|手早|てばや|簡単な|かんたんな|すぐできる|すぐ作れる|早く作れる/;
/** まだ決まっていない話（「かも」「未定」）。「何を作ればいいかわからない」は含めない。 */
const UNSURE = /かも|未定|みてい|決まってない|きまってない|決まっていない/;
/** 日を決められない時期（「月末は外食」「年末は実家」「来月は旅行」）。今日のことにせず、日付で送ってもらう。 */
const VAGUE_WHEN = /月末|げつまつ|年末|ねんまつ|月初|年始|年明け|お盆|おぼん|正月|しょうがつ|連休|れんきゅう|夏休み|冬休み|春休み|再来月|来月|らいげつ|今週|こんしゅう|来週|らいしゅう|再来週/;
/** 家で食べない予定の話（VAGUE_WHEN と一緒のときだけ、日付を聞く。「正月料理がいい」には言わない）。 */
const AWAY_PLAN = /外食|いない|出張|旅行|実家|帰省|飲み会|いらない|留守|泊ま|外で食べ|食べてくる|出かけ/;

/** 書き込みの本文（「@きめとく」を外し、照合用に正規化して、文末の記号を外したもの）。 */
function bodyOf(text: string): string {
  return normalizeJa(text.normalize('NFKC').replace(/@\s*(きめとく|キメトク|kimetoku)/gi, ' ')).replace(/[!！。、.,\s〜~♪]+$/u, '');
}

function showUnknown(s: AppState, text = ''): void {
  // あいさつ・お礼には、短く返す（毎回「読み取れませんでした」と言わない）。
  const t = bodyOf(text);
  if (ALLERGY.test(t)) {
    // アレルギーはトークでは登録できない。登録する所を案内する（お客さんの分は、その日の材料を確かめてもらう）。
    const lines = ['アレルギーや食べられない物は、トークでは登録できません。「家族と設定」で家族ごとに登録すると、その食材を使う料理は献立に入れません。'];
    if (GUEST.test(t)) lines.push('お客さんの分は登録できないので、その日の献立の材料を確かめてください。');
    addBotMessage(s, lines.join('\n'), { actions: [BTN_TODAY, BTN_WEEK] });
    return;
  }
  // お礼・あいさつ・決まっていない話のあとも、直前の返事の案（提案・「どちらにしますか？」）は選べるように出し直す。
  if (THANKS.test(t)) {
    reshowOpen(s, 'どういたしまして。', 'どういたしまして。困ったときは、いつでも送ってください。', [BTN_TODAY]);
    return;
  }
  if (OKAY.test(t) || HELLO.test(t) || ANY.test(t)) {
    reshowOpen(s, 'はい。献立はこのまま進めます。', 'はい。献立はこのまま進めます。変えたいときは、いつでも送ってください。', [BTN_TODAY, BTN_WEEK]);
    return;
  }
  if (QUICK.test(t)) {
    // 「今日は20分で作れるのがいい」：時間の短い料理への近道を案内する（時間で選ぶ命令はまだない）。
    const today = mealOn(s, s.today);
    const cookToday = !!today && today.status === 'planned' && !everyoneOut(s.household, today) && today.kind === 'normal';
    addBotMessage(
      s,
      cookToday
        ? '時間の短い料理がよければ、「今日は無理」でラク日（10〜15分ほどの料理）にできます。\nほかの料理を見るなら「別のに」と送ってください。'
        : '時間の短い料理がよければ「別のに」で、ほかの案を見てください。',
      {
        actions: cookToday
          ? [
              { label: '今日は無理', action: { type: 'today_impossible', date: s.today } },
              { label: '別のに', action: { type: 'request_alternatives', date: s.today } },
            ]
          : [BTN_WEEK],
      },
    );
    return;
  }
  if (UNSURE.test(t)) {
    reshowOpen(
      s,
      'まだ決まっていないんですね。献立はこのままにしておきます。',
      'まだ決まっていないんですね。献立はこのままにしておきます。決まったら、もう一度送ってください。',
      [BTN_TODAY, BTN_WEEK],
    );
    return;
  }
  if (VAGUE_WHEN.test(t) && AWAY_PLAN.test(t) && !/(かった|だった|でした|ました)$/.test(t)) {
    reshowOpen(
      s,
      'いつのことか、日付が分かりませんでした。献立はこのままです。',
      'いつのことか、日付が分かりませんでした。献立はこのままです。\n「11/30は外食」「金曜はパパがいない」のように、日付か曜日で送ってください。',
      [BTN_WEEK],
    );
    return;
  }
  // 直前の返事の案が残っていれば、そのボタンをもう一度出す（読み取れなくても、案を選べるように）。
  reshowOpen(
    s,
    'すみません、うまく読み取れませんでした。',
    ['すみません、うまく読み取れませんでした。たとえば、こう送ってください。', '・今日のごはん', '・今日は無理', '・卵切れた'].join('\n'),
    [BTN_TODAY, BTN_WEEK],
  );
}

/**
 * 直前の返事の、まだ選べる案（「どちらにしますか？」のボタン、提案の［替える］［そのまま］）を、lead に続けて出し直す。
 * 案がなければ none の文と actions のボタンで返す。お礼や読み取れない書き込みのあとも、案を選べるようにするため。
 */
function reshowOpen(s: AppState, lead: string, none: string, actions: ActionButton[]): void {
  const choice = lastChoice(s);
  if (choice) {
    const n = (choice.actions ?? []).filter((a) => a.action.type === 'choose_alternative').length;
    addBotMessage(s, `${lead}\n案は、ボタンか「1」${n >= 3 ? '「2」「3」' : '「2」'}で選べます。`, { card: choice.card, actions: choice.actions });
    return;
  }
  const pending = pendingProposals(s);
  if (pending.length === 1) {
    const p = pending[0];
    addBotMessage(s, `${lead}\n${dateLabel(s.today, p.date)}の案は、［替える］か［そのまま］で選べます。`, {
      card: { kind: 'meal', date: p.date },
      actions: proposalButtons(p.id),
    });
    return;
  }
  if (pending.length > 1) {
    addBotMessage(s, `${lead}\n案は、それぞれのボタンで選べます。`);
    for (const p of pending) addBotMessage(s, p.text, { card: { kind: 'meal', date: p.date }, actions: proposalButtons(p.id) });
    return;
  }
  addBotMessage(s, none, { actions });
}

/**
 * 同じ返事で出した、ほかの提案（まだ選べるもの）を出し直す（「鶏むねが安い。豚こまも安い」で案が2つ出て、片方を選んだとき）。
 * ボタンは最後の書き込みのあとの返事にしか出ない（LINE のクイックリプライも最後のメッセージだけ）ので、出し直さないと
 * もう片方の案をボタンで選べなくなる。
 */
function reshowOtherProposals(s: AppState, others: Proposal[]): void {
  const live = others.filter((p) => s.proposals.some((x) => x.id === p.id));
  live.forEach((p, i) => {
    const lead = i > 0 ? [] : [live.length === 1 ? 'もう1つの案も、ボタンで選べます。' : 'ほかの案も、それぞれのボタンで選べます。'];
    addBotMessage(s, [...lead, p.text].join('\n'), { card: { kind: 'meal', date: p.date }, actions: proposalButtons(p.id) });
  });
}

/** 提案の［替える］［そのまま］。 */
function proposalButtons(proposalId: string): ActionButton[] {
  return [
    { label: '替える', action: { type: 'accept_proposal', proposalId } },
    { label: 'そのまま', action: { type: 'reject_proposal', proposalId } },
  ];
}

/** 直前の返事（いまの書き込みの1つ前の、bot のメッセージのまとまり）と、その前の利用者の発言。 */
function previousTurn(s: AppState): { bots: ChatMessage[]; user?: ChatMessage } {
  const bots: ChatMessage[] = [];
  let i = s.chat.length - 2; // いちばん最後は、いまの書き込み
  for (; i >= 0 && s.chat[i].from === 'bot'; i--) bots.unshift(s.chat[i]);
  return { bots, user: i >= 0 ? s.chat[i] : undefined };
}

/**
 * 直前の返事で出した、まだ選べる提案（今日の返事のもの）。前日の確認（「作りましたか？」）があとにあれば、そちらへの答えとして読む。
 */
function pendingProposals(s: AppState): Proposal[] {
  const { bots } = previousTurn(s);
  const out: Proposal[] = [];
  bots.forEach((m, i) => {
    if (!m.at.startsWith(s.today)) return;
    if (bots.slice(i + 1).some((later) => later.actions?.some((a) => a.action.type === 'cooked'))) return;
    for (const a of m.actions ?? []) {
      if (a.action.type !== 'accept_proposal') continue;
      const id = a.action.proposalId;
      const p = s.proposals.find((x) => x.id === id);
      if (p && !out.includes(p)) out.push(p);
    }
  });
  return out;
}

/** 提案への文字の答え（「はい」「お願い」「替えて」／「いいえ」「そのまま」「大丈夫です」）。全体がこの言葉のときだけ。 */
const YES =
  /^(はい|はーい|うん|ええ|お願い(します)?|おねがい(します)?|それで(お願い(します)?|いい|大丈夫)?|それにする|それにして|替える|かえる|替えて|かえて|変えて|変える|替えてください|変えてください|いいよ|いいね|いいです(ね)?|いいと思う|ok|おっけー|了解|りょうかい|わかった|分かった|わかりました|分かりました|そうして|そうする|よろしく(お願いします)?|ぜひ|yes)(です)?$/;
const NO =
  /^(いいえ|いや|ううん|いえ|そのまま(で|でいい|でお願い(します)?)?|このまま(で|でいい)?|今のまま(で)?|やめとく|やめておく|やめる|替えない|かえない|変えない|大丈夫|だいじょうぶ|結構|けっこう|いらない|no)(です)?$/;

/** 答えに添える言葉（「ありがとう、それで」「じゃあ、お願いします」）。これだけでは、はい・いいえにしない。 */
const FILLER = /^(ありがとう(ございます)?|どうも|すみません|じゃあ|じゃ|では|それなら|なら)$/;

/**
 * 提案への答え：書き込み全体が「はい」「お願いします」などか（「はい、お願いします」「ありがとう、それで」のように、
 * 読点で区切った言葉がどれも、はいの言葉か添える言葉なら、はい）。いいえも同じ。どちらでもなければ null。
 */
function yesNo(text: string): 'yes' | 'no' | null {
  const parts = text
    .normalize('NFKC')
    .replace(/@\s*(きめとく|キメトク|kimetoku)/gi, ' ')
    .split(/[、,。.!！\s]+/)
    .map((p) => bodyOf(p))
    .filter(Boolean);
  let yes = false;
  let no = false;
  for (const p of parts) {
    if (YES.test(p)) yes = true;
    else if (NO.test(p)) no = true;
    else if (!FILLER.test(p)) return null;
  }
  return yes === no ? null : yes ? 'yes' : 'no';
}

/** 直前の提案への「はい」「いいえ」を、ボタンと同じに扱う。提案が2つあれば、ボタンで選んでもらう。扱ったら true。 */
function answerProposal(s: AppState, catalog: Catalog, text: string): boolean {
  const answer = yesNo(text);
  if (!answer) return false;
  const yes = answer === 'yes';
  const live = pendingProposals(s);
  if (live.length === 0) return false;
  if (live.length > 1) {
    addBotMessage(s, `案が${live.length}つあるので、${live.length === 2 ? 'どちら' : 'どれ'}の案か分かりませんでした。それぞれのボタンで選んでください。`);
    for (const p of live) addBotMessage(s, p.text, { card: { kind: 'meal', date: p.date }, actions: proposalButtons(p.id) });
    return true;
  }
  if (yes) acceptProposal(s, catalog, live[0].id);
  else rejectProposal(s, live[0].id);
  return true;
}

/**
 * 「誰が食べませんか？」への、名前だけの答え（「パパ」「はるとです」「みんな」）。聞いた日の欠席にする。扱ったら true。
 * 聞いた日は、その前の書き込みをもう一度読んで決める（「明日飲み会」→ 明日）。
 */
/**
 * 聞き返しの文の初めにある日（「明日から11/12(木)までは、誰が食べませんか？」「明日いない「夫」が誰か…」）を、
 * 聞いた日を基準に読む。前の書き込みは読み直さない（サーバーは利用者の発言の原文を残さないため。LINE でも同じに動くように）。
 */
function askedWhoDays(s: AppState, ask: ChatMessage): ISODate[] {
  const head = /^(.+?)(?:は、誰が食べませんか|いない「)/.exec(ask.text.split('\n')[0]);
  if (!head) return [];
  return findDates(normalizeJa(head[1]), ask.at.slice(0, 10)).dates.filter((d) => d >= s.today);
}

/** 「どの日の予定がなくなりましたか？」で挙げた日と人（「明日（パパ）・11/12(木)（みんな）が、いない日に…」の行から読む）。 */
function askedWhichDays(s: AppState, ask: ChatMessage): { date: ISODate; refs: string[] }[] {
  const line = ask.text.split('\n')[1] ?? '';
  const out: { date: ISODate; refs: string[] }[] = [];
  for (const m of line.matchAll(/([^・（）]+)（([^（）]+)）/g)) {
    const date = findDates(normalizeJa(m[1]), ask.at.slice(0, 10)).dates[0];
    if (date && date >= s.today) out.push({ date, refs: m[2].split('・') });
  }
  return out;
}

function answerWho(s: AppState, catalog: Catalog, text: string, senderId?: string): boolean {
  const { bots, user } = previousTurn(s);
  const ask = [...bots].reverse().find((m) => isAskWho(m.text));
  if (!user || !ask) return false;
  const answer = memberAnswer(text, s.household.members);
  if (!answer) return false;
  const refs = answer.map((r) => (senderId && SELF_WORDS.includes(r) ? senderId : r));
  const asked0 = askedWhoDays(s, ask).sort();
  if (asked0.length === 0) return false;
  // 範囲（「金曜から日曜まで旅行」）の中の、献立を作らない曜日は飛ばす（献立の日があれば）。
  const dinner = asked0.filter((d) => !!mealOn(s, d) || s.household.settings.dinnerWeekdays.includes(weekdayOf(d)));
  for (const d of dinner.length > 0 ? dinner : asked0) absence(s, catalog, d, refs);
  return true;
}

/** 「どの日の予定がなくなりましたか？」への、日付だけの答え（「木曜」「明日のほう」）。その日の欠席を取り消す。扱ったら true。 */
/** 「どの日の予定がなくなりましたか？」への「全部」の答え。 */
const ALL_DAYS = /^(全部|ぜんぶ|全て|すべて|どれも|両方|りょうほう|どっちも|どちらも|(\d|二|三|四|五|ふつか|みっか|よっか)日とも)(です|で|なくなった|なくなりました|お願い(します)?)?$/;

function answerWhichDay(s: AppState, catalog: Catalog, text: string): boolean {
  const { bots, user } = previousTurn(s);
  const ask = [...bots].reverse().find((m) => isAskWhichDay(m.text));
  if (!user || !ask) return false;
  // 聞いた日と人は、聞き返しの文から読む（サーバーは利用者の発言の原文を残さないため）。
  const listed = askedWhichDays(s, ask);
  if (listed.length === 0) return false;
  const all = ALL_DAYS.test(bodyOf(text));
  const dates = all ? listed.map((e) => e.date) : dateAnswer(text, s.today);
  if (!dates || dates.length === 0) return false;
  const everyone = [...new Set(listed.flatMap((e) => e.refs))];
  for (const d of dates) {
    const refs = listed.find((e) => e.date === d)?.refs ?? everyone;
    absence(s, catalog, d, refs, true, undefined, newTurn(dates));
  }
  return true;
}

/** 「どちらにしますか？」への文字の答え（「1」「案2」「2番目で」、料理の名前）。ボタンと同じに扱う。扱ったら true。 */
const ORDINAL = /^(案)?([1-3]|一|二|三|ひとつ|ふたつ|みっつ)(つ目|番目|番|個目)?(の方|のほう|の案)?(で|にする|にして|がいい|でお願い(します)?|お願い(します)?|です)?$/;
const ORDINAL_NUM: Record<string, number> = { 1: 1, 2: 2, 3: 3, 一: 1, 二: 2, 三: 3, ひとつ: 1, ふたつ: 2, みっつ: 3 };

/** 直前の返事の「どちらにしますか？」（案のボタンのあるメッセージ）。今日の返事のものだけ。 */
function lastChoice(s: AppState): ChatMessage | undefined {
  const { bots } = previousTurn(s);
  return [...bots].reverse().find((m) => m.at.startsWith(s.today) && m.actions?.some((a) => a.action.type === 'choose_alternative'));
}

function answerChoice(s: AppState, catalog: Catalog, text: string): boolean {
  const last = lastChoice(s);
  if (!last) return false;
  const options = (last.actions ?? []).filter((a) => a.action.type === 'choose_alternative');
  const t = bodyOf(text);
  // ほかの日を書いた書き込み（「唐揚げは明日がいい」）は、この案への答えにしない。
  const optionDate = options[0]?.action.type === 'choose_alternative' ? options[0].action.date : undefined;
  if (findDates(t, s.today).dates.some((d) => d !== optionDate)) return false;
  const m = ORDINAL.exec(t);
  let pick = m ? options[(ORDINAL_NUM[m[2]] ?? 0) - 1] : undefined;
  if (!pick && t.length >= 3) {
    const named = options.filter((o) => {
      const name = normalizeJa(o.label);
      return t.length <= name.length + 10 && (t.includes(name) || name.includes(t));
    });
    if (named.length === 1) pick = named[0];
  }
  if (!pick || pick.action.type !== 'choose_alternative') return false;
  chooseAlternative(s, catalog, pick.action.date, pick.action.dishIds);
  return true;
}

/**
 * LLM の欠席の安全網：ルールで「遅くなるだけ」「まだ決まっていない」と読める人・日の欠席（LLM の結果）は使わない。
 * 欠席にすると、その人の除外（アレルギーなど）がゆるむため（「水曜ははるとが塾」で卵の料理を出さない）。かわりにルールの返事にする。
 */
function guardTentative(s: AppState, catalog: Catalog, text: string, commands: ParsedCommand[], senderId?: string): ParsedCommand[] {
  if (!commands.some((c) => c.type === 'absence' && !c.cancel)) return commands;
  const rules = parseMessage(text, { today: s.today, members: s.household.members, catalog, ...(senderId ? { senderId } : {}) });
  const absences = rules.filter((c): c is Extract<ParsedCommand, { type: 'absence' }> => c.type === 'absence' && !c.cancel);
  const tentative = absences.filter((c) => !!c.tentative);
  if (tentative.length === 0) return commands;
  const members = s.household.members;
  const ids = (ref: string) => (ref.trim() ? resolveMembers(members, ref).map((m) => m.id) : members.map((m) => m.id));
  const real = absences.filter((c) => !c.tentative);
  const isReal = (date: ISODate, id: string) => real.some((r) => r.date === date && ids(r.memberRef).includes(id));
  const unsure = (date: ISODate, id: string) => tentative.some((t) => t.date === date && ids(t.memberRef).includes(id));
  const kept = commands.filter((c) => {
    if (c.type !== 'absence' || c.cancel) return true;
    return !ids(c.memberRef).some((id) => unsure(c.date, id) && !isReal(c.date, id));
  });
  for (const t of tentative) if (!kept.some((c) => c.type === 'absence' && !c.cancel && c.date === t.date)) kept.push(t);
  return kept;
}

/** 前日（など）の献立を作ったかどうかの、文字での答え（「作った」「作らなかった」「昨日は無理だった」）。 */
const COOKED_WORDS = /(作った|作りました|つくった|作れた|つくれた|できた|食べた|たべた|食べました)(?!い|く|ら|り|っけ)/;
const NOT_COOKED_WORDS =
  /作らなかった|つくらなかった|作れなかった|つくれなかった|作ってない|作っていない|つくってない|作れず|無理だった|むりだった|できなかった|外食(だった|した|にした|に行った|でした)|食べに行った|出前|でまえ|ぱすした|休んだ/;

function cookedReport(s: AppState, text: string): { date: ISODate; cooked: boolean } | null {
  const t = bodyOf(text);
  // 短い答えだけを読む（長い文や質問は、ほかの話のことが多い）。
  if (t.length > 24 || /[?？]/.test(t)) return null;
  // これからの日の話（「明日は出前にする」「金曜は外食した」の書きまちがい）は、前日の確認への答えにしない（今日を記録しない）。
  if (findDates(t, s.today).dates.some((d) => d > s.today)) return null;
  const last = [...s.chat].reverse().find((m) => m.from === 'bot');
  const asked = last?.actions?.some((a) => a.action.type === 'cooked');
  const askedDate = last?.actions?.find((a) => a.action.type === 'cooked')?.action;
  const pastWord = /一昨日|おととい|昨日|きのう|昨晩|昨夜|ゆうべ/.test(t);
  let cooked: boolean | null = null;
  if (NOT_COOKED_WORDS.test(t) || (pastWord && /無理|むり|外食|疲れ|休み|ぱす/.test(t))) cooked = false;
  else if (COOKED_WORDS.test(t)) cooked = true;
  else if (asked && /^(はい|うん|ええ)$/.test(t)) cooked = true;
  else if (asked && /^(いいえ|ううん|いや)$/.test(t)) cooked = false;
  if (cooked === null) return null;
  let date: ISODate | undefined = /一昨日|おととい/.test(t)
    ? addDays(s.today, -2)
    : /昨日|きのう|昨晩|昨夜|ゆうべ/.test(t)
      ? addDays(s.today, -1)
      : /今日|今夜|今晩/.test(t)
        ? s.today
        : undefined;
  if (!date && askedDate && askedDate.type === 'cooked') date = askedDate.date;
  date ??= s.meals.filter((m) => m.date < s.today && m.status === 'unconfirmed').map((m) => m.date).sort().at(-1) ?? s.today;
  const meal = mealOn(s, date);
  if (!meal || meal.dishIds.length === 0 || date > s.today) return null;
  return { date, cooked };
}

/** 日付の指定がない「別のに」の対象：今日の献立があれば今日、なければ次の献立の日（みんな外で食べる日は除く）。 */
function defaultTargetDate(s: AppState): ISODate {
  const today = mealOn(s, s.today);
  if (today && (today.status === 'planned' || today.status === 'unconfirmed') && !everyoneOut(s.household, today)) return s.today;
  return s.meals.find((m) => m.date > s.today && m.status === 'planned' && !everyoneOut(s.household, m))?.date ?? s.today;
}

function runCommand(s: AppState, catalog: Catalog, cmd: ParsedCommand, turn: Turn, refs?: string[], days?: ISODate[]): void {
  switch (cmd.type) {
    case 'show_week':
      return showWeek(s, catalog);
    case 'show_today':
      return showToday(s, catalog, cmd.date);
    case 'show_shopping':
      return showShopping(s, cmd.date);
    case 'today_impossible':
      return todayImpossible(s, catalog, s.today, turn);
    case 'want_alternatives': {
      // 「キーマカレー飽きた」：その料理の日（なければ今日か次の献立の日）
      if (!cmd.date && cmd.dishId) {
        const date = dateOfDish(s, cmd.dishId);
        if (!date) {
          addBotMessage(s, `${dishName(s, catalog, cmd.dishId)}は、この先の献立には入っていません。`, { actions: [BTN_WEEK] });
          return;
        }
        return requestAlternatives(s, catalog, date, undefined, turn);
      }
      return requestAlternatives(s, catalog, cmd.date ?? defaultTargetDate(s), undefined, turn);
    }
    case 'absence':
      return absence(s, catalog, days ?? cmd.date, refs ?? cmd.memberRef, cmd.cancel === true, cmd.tentative, turn);
    case 'sale':
      return sale(s, catalog, cmd.ingredientId, turn);
    case 'out_of_stock':
      return cmd.question ? stockAnswer(s, catalog, cmd.ingredientId) : outOfStock(s, catalog, cmd.ingredientId, turn);
    case 'have':
      if (cmd.question) return stockAnswer(s, catalog, cmd.ingredientId);
      return cmd.frozen ? froze(s, catalog, cmd.ingredientId) : have(s, catalog, cmd.ingredientId, turn);
    case 'request':
      return request(s, catalog, cmd, turn);
    case 'help':
      return showHelp(s);
    case 'unknown':
      return showUnknown(s, cmd.text);
  }
}

/**
 * 献立がまだない日（来週の献立を作る前の日）の欠席は、2日以上なら1つの返事にまとめる
 * （「明日から十日間パパ出張」で「献立はまだありません」を日の数だけ出さない）。
 */
function unplannedAbsences(s: AppState, commands: ParsedCommand[]): { dates: ISODate[]; rest: ParsedCommand[] } {
  const unplanned = (c: ParsedCommand) =>
    c.type === 'absence' &&
    !c.cancel &&
    !c.tentative &&
    c.date >= s.today &&
    !mealOn(s, c.date) &&
    s.household.settings.dinnerWeekdays.includes(weekdayOf(c.date));
  const dates = [...new Set(commands.filter(unplanned).map((c) => (c.type === 'absence' ? c.date : '')))].sort();
  if (dates.length < 2) return { dates: [], rest: commands };
  return { dates, rest: commands.filter((c) => !unplanned(c)) };
}

/** いくつかの日の言い方（続いた日なら「11/16(月)から11/19(木)まで」）。 */
function daysText(s: AppState, dates: ISODate[]): string {
  const consecutive = dates.every((d, i) => i === 0 || d === addDays(dates[i - 1], 1));
  if (consecutive) return `${dateLabel(s.today, dates[0])}から${dateLabel(s.today, dates[dates.length - 1])}まで`;
  return dates.map((d) => dateLabel(s.today, d)).join('・');
}

/** 献立のない、献立を作らない曜日の欠席（「今週末は外食」）は、1つの返事にまとめる。 */
function offDayAbsences(s: AppState, commands: ParsedCommand[]): { dates: ISODate[]; rest: ParsedCommand[] } {
  const off = (c: ParsedCommand) =>
    c.type === 'absence' && !c.cancel && !mealOn(s, c.date) && !s.household.settings.dinnerWeekdays.includes(weekdayOf(c.date));
  const rest = commands.filter((c) => !off(c));
  // 範囲（「金曜から月曜まで」）の中の、献立を作らない曜日は、黙って飛ばす（献立の日の返事だけにする）。
  if (rest.some((c) => c.type === 'absence' && !c.cancel)) return { dates: [], rest };
  const dates = [...new Set(commands.filter(off).map((c) => (c.type === 'absence' ? c.date : '')))].sort();
  return { dates, rest };
}

/**
 * 1つの書き込みの命令を処理する順（DESIGN.md 3-9）。同じ順位の中は、書かれた順。
 * 0：その日の予定を変える命令（欠席・欠席の取り消し・今日は無理）。案を出したあとで、その日の献立や食べる人が変わり、
 *    案が使えなくなる、を防ぐ（「鶏むねが安い。金曜はみんな外食」でも、金曜の提案を出さない）。
 * 1：日を決めて案を出す命令（日付つきのリクエスト・別のに）。
 * 2：日を選んで案を出す命令（特売・在庫・日付のないリクエスト）と、見るだけの命令。前の案のない日を選ぶ。
 */
function commandRank(c: ParsedCommand): number {
  switch (c.type) {
    case 'absence':
    case 'today_impossible':
      return 0;
    case 'want_alternatives':
      return 1;
    case 'request':
      return c.date ? 1 : 2;
    default:
      return 2;
  }
}

/** 同じ命令は1回だけ（LLM の結果に同じ命令が2つあっても、提案を2つ作らない）。そのあと処理する順に並べる。 */
function orderCommands(commands: ParsedCommand[]): ParsedCommand[] {
  const seen = new Set<string>();
  const unique = commands.filter((c) => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.map((c, i) => ({ c, i })).sort((a, b) => commandRank(a.c) - commandRank(b.c) || a.i - b.i).map((x) => x.c);
}

/**
 * 欠席の命令を、返事の単位にまとめる。
 * - 同じ日の欠席（と、欠席の取り消し）は1つの返事に（「パパとはるとがいない」を人ごとの返事に分けると、
 *   前の返事の人数と、カードの人数が食い違うため）。
 * - まだ決まっていない書き込み（tentative：「木曜まで残業」「明日から3日間出張かも」）は、人ごとに、日をまとめて1つの返事に。
 * - 人が分からない欠席（「明日から木曜まで出張」）は、日をまとめて1回だけ聞く。
 */
function groupAbsences(commands: ParsedCommand[]): { cmd: ParsedCommand; refs?: string[]; days?: ISODate[] }[] {
  const out: { cmd: ParsedCommand; refs?: string[]; days?: ISODate[] }[] = [];
  const byKey = new Map<string, { refs: string[]; days: ISODate[] }>();
  for (const c of commands) {
    if (c.type !== 'absence') {
      out.push({ cmd: c });
      continue;
    }
    const unknownWho = !c.tentative && !c.cancel && !c.memberRef.trim();
    const key = c.tentative
      ? `t|${c.tentative}|${c.cancel === true}|${c.memberRef}`
      : unknownWho
        ? 'who'
        : `${c.date}|${c.cancel === true}`;
    const group = byKey.get(key);
    if (group) {
      if (!group.refs.includes(c.memberRef)) group.refs.push(c.memberRef);
      if (!group.days.includes(c.date)) group.days.push(c.date);
      continue;
    }
    const fresh = { refs: [c.memberRef], days: [c.date] };
    byKey.set(key, fresh);
    out.push({ cmd: c, refs: fresh.refs, days: fresh.days });
  }
  // まだ決まっていない書き込みで、日が同じ人たち（「金曜はなおみとけんじが外食かも」）は、1つの返事にする。
  const merged: typeof out = [];
  for (const e of out) {
    const c = e.cmd;
    if (c.type === 'absence' && c.tentative && e.days && e.refs) {
      const sig = (x: typeof e) =>
        x.cmd.type === 'absence' ? `${x.cmd.tentative}|${x.cmd.cancel === true}|${[...(x.days ?? [])].sort().join(',')}` : '';
      const same = merged.find((m) => m.cmd.type === 'absence' && m.cmd.tentative && sig(m) === sig(e));
      if (same && same.refs) {
        for (const r of e.refs) if (!same.refs.includes(r)) same.refs.push(r);
        continue;
      }
    }
    merged.push(e);
  }
  return merged;
}

/** handleUserText の追加の情報。 */
export interface UserTextOptions {
  /** 書き込んだ人（member の id。画面の「送る人」）。人を書かない「明日飲み会」「今日はいらない」を、この人の欠席として読む。 */
  senderId?: string;
}

/** 公開API：利用者の書き込みを処理する。 */
export function handleUserText(
  state: AppState,
  catalog: Catalog,
  text: string,
  parsed?: ParsedCommand[],
  opts: UserTextOptions = {},
): StepResult {
  const s = clone(state);
  const before = chatIds(s);
  addUserMessage(s, text);
  const senderId = s.household.members.some((m) => m.id === opts.senderId) ? opts.senderId : undefined;
  // 直前の提案への「はい」「替えて」「そのまま」は、ボタンを押したのと同じに扱う。
  // 「誰が食べませんか？」への名前だけの答え（「パパ」）は、聞いた日の欠席にする。
  // どちらも直前の返事への答えなので、LLM の結果より先に見る（LLM は直前の返事を知らない）。
  if (
    answerProposal(s, catalog, text) ||
    answerChoice(s, catalog, text) ||
    answerWho(s, catalog, text, senderId) ||
    answerWhichDay(s, catalog, text)
  ) {
    return { state: s, replies: newBotMessages(s, before) };
  }
  let commands = parsed ? validateCommands(s, catalog, parsed) : [];
  if (commands.length > 0) commands = guardTentative(s, catalog, text, commands, senderId);
  // 前日の確認への答え（「作った」「昨日は無理だった」）は、ルールで読む（LLM は直前の確認を知らないので、
  // 「昨日は無理だった」を今日の「今日は無理」と読みちがえて、今日の献立を変えることがある）。
  if (commands.length > 0 && cookedReport(s, text)) {
    const rules = parseMessage(text, { today: s.today, members: s.household.members, catalog, ...(senderId ? { senderId } : {}) });
    if (rules.every((c) => c.type === 'unknown')) commands = [];
  }
  if (commands.length === 0) {
    commands = parseMessage(text, { today: s.today, members: s.household.members, catalog, ...(senderId ? { senderId } : {}) });
  }
  if (commands.length === 1 && commands[0].type === 'unknown') {
    // 「作った」「作らなかった」「昨日は無理だった」は、前日（など）の確認への答えとして扱う。
    const report = cookedReport(s, text);
    if (report) {
      if (report.cooked) cooked(s, catalog, report.date);
      else notCooked(s, catalog, report.date);
      return { state: s, replies: newBotMessages(s, before) };
    }
  }
  const { dates: offDays, rest: rest0 } = offDayAbsences(s, commands);
  if (offDays.length > 0) {
    addBotMessage(s, `${offDays.map((d) => dateLabel(s.today, d)).join('・')}は献立の日ではありません。この日はそのままで大丈夫です。`);
  }
  const { dates: unplanned, rest } = unplannedAbsences(s, rest0);
  // 同じ返事の中で、同じ日に2つ目の案を出さない（turn.offered）。書いた日（turn.written）は、取り消しの日の見分けに使う。
  const turn = newTurn(findDates(bodyOf(text), s.today).dates, bodyOf(text));
  for (const { cmd, refs, days } of groupAbsences(orderCommands(rest)).slice(0, 8)) runCommand(s, catalog, cmd, turn, refs, days);
  if (unplanned.length > 0) {
    addBotMessage(s, `${daysText(s, unplanned)}の献立はまだありません。献立ができたら、もう一度教えてください。`);
  }
  return { state: s, replies: newBotMessages(s, before) };
}

// ---------------------------------------------------------------------------
// ボタン
// ---------------------------------------------------------------------------

const MARK: Record<Reaction, string> = { great: '◎', ok: '○', meh: '△' };

/** みんな外で食べる日に「作った」「作らなかった」と来たときの返事（記録はしない）。 */
function outDayRecordReply(s: AppState, date: ISODate, cookedAtHome: boolean): void {
  const when = dateLabel(s.today, date);
  if (date < s.today) {
    addBotMessage(s, `${when}は、みんな外で食べる日でした（夕食なし）。このままで大丈夫です。`);
    return;
  }
  const lines = [`${when}は、みんな外で食べる日にしています（夕食なし）。`];
  const solo = eatingMembers(s.household).length <= 1;
  if (cookedAtHome && date === s.today) lines.push(`家で食べたなら、先に「${dayWord(s.today, date)}は${solo ? 'やっぱり家で食べる' : 'みんないる'}」と送ってください。`);
  addBotMessage(s, lines.join('\n'), { card: { kind: 'meal', date } });
}

function recordCooked(s: AppState, catalog: Catalog, date: ISODate): boolean {
  const meal = mealOn(s, date);
  if (!meal || meal.dishIds.length === 0 || everyoneOut(s.household, meal)) return false;
  if (meal.status === 'cooked') return true;
  meal.status = 'cooked';
  const key = meal.dishIds.join(',');
  s.history = s.history.filter((r) => !(r.date === date && r.dishIds.join(',') === key));
  s.history.push({ date, dishIds: [...meal.dishIds], status: 'cooked', reactions: [] });
  lowerStockForMeal(s, catalog, meal);
  // 在庫が減ったので、この先の買い物リストも合わせる（使い切った食材を次のリストに入れる）。
  s.shopping = buildShoppingLists(s, catalog);
  return true;
}

function cooked(s: AppState, catalog: Catalog, date: ISODate): void {
  const meal = mealOn(s, date);
  if (!meal || meal.dishIds.length === 0) {
    addBotMessage(s, 'その日の献立が見つかりませんでした。');
    return;
  }
  if (everyoneOut(s.household, meal)) {
    outDayRecordReply(s, date, true);
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
  if (everyoneOut(s.household, meal)) {
    outDayRecordReply(s, date, false);
    return;
  }
  meal.status = 'skipped';
  const key = meal.dishIds.join(',');
  s.history = s.history.filter((r) => !(r.date === date && r.dishIds.join(',') === key));
  s.history.push({ date, dishIds: [...meal.dishIds], status: 'skipped', reactions: [] });
  const lines = [`記録しました。${mealTitle(s, catalog, meal)}は、また近いうちに入れます。`];
  if (date >= s.today) {
    // 今日（これから）の夕食を作らない日にした：その日の分は、もう買わなくてよいので、買い物リストから外す。
    const forDay = (lists: AppState['shopping']) =>
      lists.filter((l) => l.date >= s.today).flatMap((l) => l.items.filter((i) => i.forDates.includes(date)));
    const before = forDay(s.shopping);
    s.shopping = buildShoppingLists(s, catalog);
    const after = new Set(forDay(s.shopping).map((i) => i.ingredientId));
    const removed = before.filter((i) => !i.checked && !after.has(i.ingredientId));
    if (removed.length > 0) lines.push(`${dateLabel(s.today, date)}の分は、買い物リストから外しました。`);
    const ingIds = new Set(
      meal.dishIds.flatMap((id) => {
        const d = findDishIn(s.household, catalog, id);
        return d ? ingredientsOf(s.household, d).map((di) => di.ingredientId) : [];
      }),
    );
    const stocked = s.inventory.some((v) => ingIds.has(v.ingredientId) && v.level !== 'none' && !catalog.ingredientById.get(v.ingredientId)?.pantry);
    if (before.some((i) => i.checked) || stocked) lines.push('買ってある食材は、消費期限を確かめて早めに使いましょう。');
  } else {
    lines.push('使わなかった食材は、消費期限を確かめて早めに使いましょう。');
  }
  addBotMessage(s, lines.join('\n'));
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
  // 有料版は一人ずつ：まだ押していない人のボタンを付け直す（トークでも LINE のクイックリプライでも、続けて押せるように）。
  if (memberId !== 'household' && s.household.settings.plan === 'paid') {
    const done = new Set(rec.reactions.map((r) => r.memberId));
    const left = reactionActions(s, date).filter((a) => a.action.type === 'react' && !done.has(a.action.memberId));
    if (left.length > 0) addBotMessage(s, `${text}\nほかの人の分もどうぞ。`, { card: { kind: 'meal', date }, actions: left });
    else addBotMessage(s, `${text}\n全員分そろいました。ありがとうございます。`);
    return;
  }
  addBotMessage(s, text);
}

/**
 * 買い物のチェック。買った量（bought）も記録する（あとで要る量が増えたとき、足りない分だけを買う物にするため）。
 * 「あと1パック」の行をチェックしたら、前に買った分と合わせた量。チェックを外したら、その行の分を戻す。
 */
function checkItem(s: AppState, catalog: Catalog, shoppingDate: ISODate, ingredientId: string, checked: boolean): void {
  const item = s.shopping.find((l) => l.date === shoppingDate)?.items.find((i) => i.ingredientId === ingredientId);
  if (!item) return;
  const ing = catalog.ingredientById.get(ingredientId);
  const partial = item.notes.some((n) => n.endsWith(BOUGHT_NOTE));
  if (checked && !item.checked) {
    item.bought = (partial ? item.bought ?? 0 : 0) + capacityOf(item, ing);
  } else if (!checked && item.checked) {
    // 「あと1パック」の行のチェックを外したら、前に買った分は残す。ふつうの行なら、買った記録を消す。
    const rest = partial ? (item.bought ?? 0) - capacityOf(item, ing) : 0;
    if (rest > 1e-9) item.bought = rest;
    else delete item.bought;
  }
  item.checked = checked;
  if (checked) {
    setStock(s, ingredientId, 'plenty', item.notes.includes(FREEZE_NOTE));
  } else {
    s.inventory = s.inventory.filter((i) => !(i.ingredientId === ingredientId && i.acquiredOn === s.today && i.level === 'plenty'));
  }
}

/**
 * 押したボタンの文言（直近の bot のメッセージで、同じ action のボタン）。見つからなければ fallback。
 * 「ほかの案」「作らない日にする」のように、同じ action でも場面で文言が違うボタンを、そのままの文言で残すため。
 */
function tappedLabel(s: AppState, action: Action, fallback: string): string {
  const key = JSON.stringify(action);
  for (let i = s.chat.length - 1; i >= 0; i--) {
    const m = s.chat[i];
    if (m.from !== 'bot' || !m.actions) continue;
    const hit = m.actions.find((a) => JSON.stringify(a.action) === key);
    if (hit) return hit.label;
  }
  return fallback;
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
      addUserMessage(s, tappedLabel(s, action, action.date >= s.today ? '作らない日にする' : '作らなかった'));
      notCooked(s, catalog, action.date);
      break;
    case 'request_alternatives':
      addUserMessage(s, tappedLabel(s, action, '別のに'));
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
    case 'accept_proposal': {
      addUserMessage(s, '替える');
      const others = pendingProposals(s).filter((p) => p.id !== action.proposalId);
      acceptProposal(s, catalog, action.proposalId);
      reshowOtherProposals(s, others);
      break;
    }
    case 'reject_proposal': {
      addUserMessage(s, 'そのまま');
      const others = pendingProposals(s).filter((p) => p.id !== action.proposalId);
      rejectProposal(s, action.proposalId);
      reshowOtherProposals(s, others);
      break;
    }
    case 'react': {
      const nick = action.memberId === 'household' ? '' : `${s.household.members.find((m) => m.id === action.memberId)?.nickname ?? ''} `;
      addUserMessage(s, `${nick}${MARK[action.reaction]}`);
      react(s, catalog, action.date, action.memberId, action.reaction);
      break;
    }
    case 'check_item':
      checkItem(s, catalog, action.shoppingDate, action.ingredientId, action.checked);
      break;
    case 'regenerate_week':
      addUserMessage(s, '献立を作り直す');
      regenerateWeek(s, catalog, action.weekStart, { keepSafe: action.keepSafe === true });
      break;
  }
  return { state: s, replies: newBotMessages(s, before) };
}
