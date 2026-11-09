// エンジンの公開API。UI とサーバーはここから import する（内部モジュールを直接 import しない）。
// すべて純粋関数：入力の state を書き換えず、新しい state を返す。乱数は seed から作る。
//
// 実装は planner.ts / safety.ts / shopping.ts / replan.ts / parser.ts / conversation.ts / state.ts などに分け、
// ここで re-export する。シグネチャを変えるときは DESIGN.md と UI・サーバーも直すこと。

import type {
  Action,
  AppState,
  Catalog,
  Dish,
  Household,
  ISODate,
  Notice,
  OnboardingInput,
  ParseContext,
  ParsedCommand,
  PlannedMeal,
  SafetyResult,
  ShoppingList,
  StepResult,
  WeeklySummary,
} from './types';

export * from './types';
export * from './dates';
export { createRng, seedFrom } from './rng';

const NI = (name: string): never => {
  throw new Error(`engine: ${name} is not implemented yet`);
};

// ----- 状態の作成と時間の進行 -----

/** 初回の質問の答えから状態を作り、今日以降の今週分の献立と買い物リストを作る。最初のあいさつも chat に入れる。 */
export function createInitialState(input: OnboardingInput, catalog: Catalog, today: ISODate): AppState {
  return NI('createInitialState');
}

/** 1日進める。前日の献立の確認、来週の献立の作成（最初の買い物日の前日）、有料版の配信メッセージなどを行う。 */
export function advanceDay(state: AppState, catalog: Catalog): StepResult {
  return NI('advanceDay');
}

// ----- 献立 -----

/** weekStart（月曜）の週の献立を作る。fromDate より前の日は作らない（初回は今日から）。 */
export function generateWeekMeals(
  state: AppState,
  catalog: Catalog,
  weekStart: ISODate,
  fromDate?: ISODate,
): PlannedMeal[] {
  return NI('generateWeekMeals');
}

/** その日の差し替え候補（既定2つ）。各候補は dishIds の配列。 */
export function alternativesFor(state: AppState, catalog: Catalog, date: ISODate, count?: number): string[][] {
  return NI('alternativesFor');
}

/** 世帯の除外条件に照らした料理の判定。 */
export function checkDishSafety(dish: Dish, household: Household, catalog: Catalog): SafetyResult {
  return NI('checkDishSafety');
}

/** 世帯に出す注意（免責、乳児のはちみつ、窒息、重いアレルギーは対象外 など）。 */
export function householdNotices(household: Household): Notice[] {
  return NI('householdNotices');
}

/** 料理を引く（世帯の自由入力の定番も含む）。 */
export function findDish(state: AppState, catalog: Catalog, dishId: string): Dish | undefined {
  return NI('findDish');
}

// ----- 買い物 -----

/** 献立と在庫から買い物リストを作り直す。既存リストのチェック状態は引き継ぐ。 */
export function buildShoppingLists(state: AppState, catalog: Catalog): ShoppingList[] {
  return NI('buildShoppingLists');
}

// ----- 会話 -----

/** ルールベースで話し言葉を解釈する（LLM がないときもこれで動く）。 */
export function parseMessage(text: string, ctx: ParseContext): ParsedCommand[] {
  return NI('parseMessage');
}

/**
 * 利用者の書き込みを処理する。parsed を渡せばそれを使い（サーバーの LLM の結果など）、なければ parseMessage を使う。
 * 利用者の発言と bot の返事を state.chat に追加する。
 */
export function handleUserText(
  state: AppState,
  catalog: Catalog,
  text: string,
  parsed?: ParsedCommand[],
): StepResult {
  return NI('handleUserText');
}

/** ボタン（postback）の処理。 */
export function applyAction(state: AppState, catalog: Catalog, action: Action): StepResult {
  return NI('applyAction');
}

// ----- 振り返り -----

export function weeklySummary(state: AppState, catalog: Catalog, weekStart: ISODate): WeeklySummary {
  return NI('weeklySummary');
}

/** カードの中身をテキストにする（LINE やテストで使う）。 */
export function renderCardText(state: AppState, catalog: Catalog, card: NonNullable<import('./types').ChatMessage['card']>): string {
  return NI('renderCardText');
}
