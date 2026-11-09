// 4週間の通しの模擬（受け入れテストで使う）。デモの家族で、作った・作らなかった・◎○△・今日は無理・差し替え・
// 特売・欠席・在庫切れ・買い物のチェックをまぜて28日進め、毎日（操作のたびに）不変条件を確かめる。
import type { Action, AppState, Catalog, ChatMessage, OnboardingInput, ParsedCommand, StepResult } from '../engine/index';
import { addDays, advanceDay, applyAction, createInitialState, handleUserText, weekStartOf } from '../engine/index';
import {
  dailyViolations,
  freshWeekViolations,
  ingredientObjs,
  dishesOf,
  mealOn,
  planDateForNextWeek,
  proteinViolations,
  weekMeals,
} from './invariants';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;

/** 返事は短く（6行以内）、絵文字を使わない（DESIGN.md 3-9）。 */
export function replyProblems(replies: ChatMessage[]): string[] {
  const out: string[] = [];
  for (const m of replies) {
    if (m.from !== 'bot') out.push(`bot 以外の返事：${m.text}`);
    if (m.text.split('\n').length > 6) out.push(`6行を超える：${m.text}`);
    if (EMOJI.test(m.text)) out.push(`絵文字：${m.text}`);
    if (m.text.trim().length === 0) out.push('空の返事');
  }
  return out;
}

/**
 * JSON にそのまま書けない値（undefined のプロパティ、関数、Map・Set・Date、NaN・Infinity など）の場所。
 * これが空なら JSON.parse(JSON.stringify(x)) は x と同じ構造になる。
 */
export function jsonProblems(value: unknown, path = 'state'): string[] {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${path}: ${value}`];
  if (Array.isArray(value)) return value.flatMap((v, i) => jsonProblems(v, `${path}[${i}]`));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      v === undefined ? [`${path}.${k}: undefined`] : jsonProblems(v, `${path}.${k}`),
    );
  }
  return [`${path}: ${typeof value === 'object' ? Object.prototype.toString.call(value) : typeof value}`];
}

/** 卵（派生原材料を含む）を使う料理（作らなかった日を除く）。 */
export function eggDishes(s: AppState, catalog: Catalog): string[] {
  return s.meals
    .filter((m) => m.status !== 'skipped')
    .flatMap((m) =>
      dishesOf(s, catalog, m)
        .filter((d) => ingredientObjs(s, catalog, d).some((i) => i.allergens.includes('egg')))
        .map((d) => `${m.date} ${d.name}`),
    );
}

export interface SimResult {
  state: AppState;
  problems: string[];
  replies: ChatMessage[];
  log: string[];
}

export interface SimOptions {
  input: OnboardingInput;
  catalog: Catalog;
  start: string; // 月曜
  /** 毎日（操作のたびに）不変条件と JSON の往復を確かめる。 */
  check: boolean;
}

/** start（月曜）から28日。日ごとの操作は下の plan のとおり（献立に合わせて、できる操作だけを行う）。 */
export function simulate({ input, catalog, start, check }: SimOptions): SimResult {
  let s = createInitialState(input, catalog, start);
  const problems: string[] = [];
  const replies: ChatMessage[] = [];
  const log: string[] = [];

  const verify = (what: string) => {
    if (!check) return;
    const at = `${s.today} ${what}`;
    problems.push(...dailyViolations(s, catalog).map((p) => `${at}: ${p}`));
    problems.push(...eggDishes(s, catalog).map((p) => `${at}: 卵 ${p}`));
    problems.push(...jsonProblems(s).map((p) => `${at}: JSON にできない値 ${p}`));
    // 保存（localStorage・サーバーの JSON）から読み込んだ state で続ける。
    s = JSON.parse(JSON.stringify(s)) as AppState;
  };
  const step = (what: string, r: StepResult) => {
    s = r.state;
    replies.push(...r.replies);
    log.push(`${s.today} ${what} → ${r.replies.map((m) => m.text.split('\n')[0]).join(' / ')}`);
    if (check) problems.push(...replyProblems(r.replies).map((p) => `${s.today} ${what}: ${p}`));
    verify(what);
  };
  const say = (text: string, parsed?: ParsedCommand[]) => step(text, handleUserText(s, catalog, text, parsed));
  const press = (what: string, action: Action) => step(what, applyAction(s, catalog, action));
  const cooked = (date = s.today) => {
    if (mealOn(s, date)?.dishIds.length) press(`作った ${date}`, { type: 'cooked', date });
  };
  const react = (reaction: 'great' | 'ok' | 'meh') => {
    if (s.history.some((r) => r.date === s.today && r.status === 'cooked')) {
      press(`反応 ${reaction}`, { type: 'react', date: s.today, memberId: 'household', reaction });
    }
  };
  const buyToday = () => {
    const list = s.shopping.find((l) => l.date === s.today);
    for (const it of list?.items ?? []) {
      press(`買った ${it.name}`, { type: 'check_item', shoppingDate: s.today, ingredientId: it.ingredientId, checked: true });
    }
  };
  const acceptLast = () => {
    const p = s.proposals.at(-1);
    if (p) press('替える', { type: 'accept_proposal', proposalId: p.id });
  };
  const rejectLast = () => {
    const p = s.proposals.at(-1);
    if (p) press('そのまま', { type: 'reject_proposal', proposalId: p.id });
  };
  const chooseAlternative = (index: number) => {
    press('別のに', { type: 'request_alternatives', date: s.today });
    const btns = replies.at(-1)?.actions ?? [];
    const btn = btns[index] ?? btns[0];
    if (btn && btn.action.type === 'choose_alternative') press('別の案を選ぶ', btn.action);
  };
  const todayImpossible = () => {
    const before = mealOn(s, s.today);
    say('@きめとく 今日は無理');
    const after = mealOn(s, s.today);
    if (check && before && before.status !== 'cooked' && after?.kind !== 'raku') problems.push(`${s.today}: 今日は無理でラク日にならない`);
  };

  // 日ごとの操作（i = 0 が start の月曜）。
  const plan: Record<number, () => void> = {
    // 1週目
    0: () => {
      say('@きめとく 水曜は夫が飲み会');
      buyToday();
      cooked();
      react('great');
    },
    1: () => {
      say('@きめとく 鶏むねが安い');
      acceptLast();
      cooked();
      react('ok');
    },
    2: () => {
      cooked();
      react('great');
    },
    3: () => {
      buyToday();
      todayImpossible(); // 木曜：その週のラク日（水）は過ぎている → 来週の候補へ
    },
    4: () => {
      cooked(addDays(s.today, -1)); // 「昨日の〇〇は作りましたか？」に答える
      chooseAlternative(0);
      press('作らなかった', { type: 'not_cooked', date: s.today });
    },
    // 2週目
    7: () => {
      buyToday();
      say('@きめとく 玉ねぎ切れた');
      cooked();
      react('meh');
    },
    9: () => {
      cooked(addDays(s.today, -1));
      todayImpossible(); // 水曜（ラク日）
    },
    10: () => {
      buyToday();
      say('@きめとく 豚こま買った');
      acceptLast();
      cooked();
      react('great');
    },
    11: () => {
      say('@きめとく さばが安い');
      rejectLast();
      cooked();
      react('ok');
    },
    // 3週目
    14: () => {
      buyToday();
      todayImpossible(); // 月曜 → 元の料理はその週のラク日へ
    },
    15: () => {
      cooked(addDays(s.today, -1));
      say('@きめとく 金曜はパパがいない');
      cooked();
      react('great');
    },
    16: () => {
      say('@きめとく 卵切れた');
      cooked();
    },
    17: () => {
      buyToday();
      say('@きめとく 牛こまが安い');
      acceptLast();
      cooked();
      react('meh');
    },
    18: () => {
      chooseAlternative(1);
      cooked();
      react('great');
    },
    // 4週目
    21: () => {
      buyToday();
      cooked();
      react('great');
    },
    22: () => {
      say('@きめとく 鶏ももが安い');
      acceptLast();
      press('作らなかった', { type: 'not_cooked', date: s.today });
    },
    23: () => {
      todayImpossible();
      cooked();
    },
    24: () => {
      buyToday();
      say('@きめとく 木曜はみんな外食');
    },
    25: () => {
      say('今日のごはん');
      say('買い物リスト');
      cooked();
      react('ok');
    },
  };

  verify('はじめ');
  for (let i = 0; i < 28; i++) {
    plan[i]?.();
    const weeksBefore = new Set(s.meals.map((m) => weekStartOf(m.date)));
    step('翌日へ', advanceDay(s, catalog));
    if (!check) continue;
    // 来週の献立は、最初の買い物日の前日にできている（それより前には作らない）。
    const planDate = planDateForNextWeek(s)!;
    const next = addDays(weekStartOf(s.today), 7);
    const hasNext = s.meals.some((m) => weekStartOf(m.date) === next);
    if (s.today >= planDate && !hasNext) problems.push(`${s.today}: 来週の献立がまだない（作る日は ${planDate}）`);
    if (s.today < planDate && hasNext) problems.push(`${s.today}: 来週の献立が早すぎる（作る日は ${planDate}）`);
    // 新しくできた週は、月〜金がそろい、ラク日が1日、新しい料理が1品以内、前日と同じたんぱく源が続かない。
    for (const ws of new Set(s.meals.map((m) => weekStartOf(m.date)))) {
      if (weeksBefore.has(ws)) continue;
      const week = weekMeals(s, ws);
      problems.push(...freshWeekViolations(week, s.household.settings.newPerWeek));
      problems.push(...proteinViolations(s, catalog, week));
      if (week.map((m) => m.date).join(',') !== [0, 1, 2, 3, 4].map((k) => addDays(ws, k)).join(',')) {
        problems.push(`${ws}: 月〜金がそろっていない`);
      }
    }
  }
  return { state: s, problems, replies, log };
}
