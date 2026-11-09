// エンジンの公開API。UI とサーバーはここから import する（内部モジュールを直接 import しない）。
// すべて純粋関数：入力の state を書き換えず、新しい state を返す。乱数は seed から作る。
//
// 実装は planner.ts / safety.ts / shopping.ts / replan.ts / parser.ts / conversation.ts / state.ts などに分け、
// ここで re-export する。シグネチャを変えるときは DESIGN.md と UI・サーバーも直すこと。

import type { AppState, Catalog, Dish } from './types';
import { findDishIn } from './context';

export * from './types';
export * from './dates';
export { createRng, seedFrom } from './rng';

// ----- 状態の作成と時間の進行 -----

/**
 * createInitialState(input, catalog, today): AppState
 *   初回の質問の答えから状態を作り、今日以降の今週分の献立と買い物リストを作る。最初のあいさつも chat に入れる。
 * advanceDay(state, catalog): StepResult
 *   1日進める。前日の献立の確認、来週の献立の作成（最初の買い物日の前日）、有料版の配信メッセージなどを行う。
 */
export { createInitialState, advanceDay } from './state';

// ----- 献立 -----

/**
 * generateWeekMeals(state, catalog, weekStart, fromDate?): PlannedMeal[]
 *   weekStart（月曜）の週の献立を作る。fromDate より前の日は作らない（初回は今日から）。
 * alternativesFor(state, catalog, date, count?): string[][]
 *   その日の差し替え候補（既定2つ）。各候補は dishIds の配列。
 */
export { generateWeekMeals, alternativesFor } from './planner';

/**
 * checkDishSafety(dish, household, catalog): SafetyResult — 世帯の除外条件に照らした料理の判定。
 * householdNotices(household): Notice[] — 世帯に出す注意（免責、乳児のはちみつ、窒息、重いアレルギーは対象外 など）。
 * textExclusionTargets(text, catalog): TextExclusionTargets — 自由入力の除外の語が、どのアレルゲン・食材・料理に当たるか
 *   （登録のときに「当たる食材：…」「当たる食材はありません」を見せるため）。
 * allergensOfText(text): AllergenId[] — 自由入力の語がアレルゲンの名前なら、その id（「甲殻類アレルギー」→ えび・かに）。
 */
export { checkDishSafety, householdNotices, textExclusionTargets } from './safety';
export type { TextExclusionTargets } from './safety';
export { allergensOfText } from './context';

/** 料理を引く（世帯の自由入力の定番も含む）。 */
export function findDish(state: AppState, catalog: Catalog, dishId: string): Dish | undefined {
  return findDishIn(state.household, catalog, dishId);
}

// ----- 買い物 -----

/** buildShoppingLists(state, catalog): ShoppingList[] — 献立と在庫から買い物リストを作り直す。既存リストのチェック状態は引き継ぐ。 */
export { buildShoppingLists } from './shopping';

// ----- 会話 -----

/** parseMessage(text, ctx): ParsedCommand[] — ルールベースで話し言葉を解釈する（LLM がないときもこれで動く）。 */
export { parseMessage } from './parser';

/**
 * handleUserText(state, catalog, text, parsed?): StepResult
 *   利用者の書き込みを処理する。parsed を渡せばそれを使い（サーバーの LLM の結果など）、なければ parseMessage を使う。
 *   利用者の発言と bot の返事を state.chat に追加する。parsed は validateCommands で検証し、使えなければ parseMessage に戻る。
 * applyAction(state, catalog, action): StepResult — ボタン（postback）の処理。
 * validateCommands(state, catalog, parsed): ParsedCommand[] — LLM の解釈の検証（マスタにない id・不正な日付を捨てる）。
 */
export { handleUserText, applyAction, validateCommands } from './conversation';

// ----- 振り返り -----

/**
 * weeklySummary(state, catalog, weekStart): WeeklySummary
 * renderCardText(state, catalog, card): string — カードの中身をテキストにする（LINE やテストで使う）。
 */
export { weeklySummary, renderCardText } from './summary';
