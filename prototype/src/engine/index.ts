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
 *   1日進める。前日の献立の確認、週末の質問（その週の最後の献立の日の翌日に1回。下の「1週間の試用」）、
 *   来週の献立の作成（最初の買い物日の前日）、有料版の配信メッセージなどを行う。
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
 * handleUserText(state, catalog, text, parsed?, opts?): StepResult
 *   利用者の書き込みを処理する。parsed を渡せばそれを使い（サーバーの LLM の結果など）、なければ parseMessage を使う。
 *   利用者の発言と bot の返事を state.chat に追加する。parsed は validateCommands で検証し、使えなければ parseMessage に戻る。
 *   parsed の見るだけの命令（show_today・show_shopping）に日付がなければ、ルールで読んだ日付で補う（「明日の夕飯なに？」）。
 *   opts.senderId：書き込んだ人（member の id。画面の「送る人」）。人を書かない「明日飲み会」「今日はいらない」をこの人の欠席にする
 *   （なければ、誰の分かを聞き返す）。直前の提案への「はい」「そのまま」、聞き返しへの名前だけの答え（「パパ」）も、ここで読む。
 * applyAction(state, catalog, action): StepResult — ボタン（postback）の処理。
 * validateCommands(state, catalog, parsed): ParsedCommand[] — LLM の解釈の検証（マスタにない id・不正な日付を捨てる）。
 */
export { handleUserText, applyAction, validateCommands } from './conversation';
export type { UserTextOptions } from './conversation';
/**
 * UNREADABLE_REPLY — 読み取れなかったときの返事の書き出し（「すみません、うまく読み取れませんでした。」）。
 * 試用の記録は、この返事のすぐ前の書き込みを「読み取れなかった書き込み」に数える。画面が AI に頼むかを決めるときも、これで見分ける。
 */
export { UNREADABLE_REPLY } from './conversation';

// ----- 1週間の試用 -----

/**
 * 週末の質問（北極星「自分で考えた夕食は何日？」）は、advanceDay がその週の最後の献立の日の翌日に1回だけ出す
 * （［0日］…［N日］のボタン＝ weekly_checkin。N はみんな外で食べた日を除いた献立の日）。答えは applyAction の weekly_checkin と、
 * handleUserText の数だけの書き込み（「2」「2日」「全部」など。週末の質問がいちばん新しい答え待ちの質問のとき）で state.checkins に
 * 記録する。weeklySummary の checkin と、振り返りの文（「自分で考えた日（週末の質問）：2日／5日」）にも出る。
 *
 * trialReport(state, catalog, opts?): TrialReport — 試用の記録（名前を入れずに数える。opts.includeTexts で読み取れなかった
 *   書き込みの文を入れるか（既定 false。入れるときも呼び名は「〇〇」）、opts.clock で日付の進め方を記す）。数え方と weeklySummary
 *   との関係は trial.ts の先頭。
 * formatTrialReport(report): string — 家族が送る文（読める行 + 集計ページが読む「きめとく試用データ:{JSON}」の1行。
 *   TRIAL_MAX_REPORT_LENGTH（4500字）まで。超えるときは古い書き込みの文から外す）。
 * parseTrialReports(text): { reports, errors } — 貼り付けた文から記録をすべて取り出す（集計ページで使う。途中の改行も読む）。
 * checkTrialReport(value): string | null — 記録の形を確かめる（使えなければ、わけ）。
 * checkinQuestionWeek(message): ISODate | undefined — 週末の質問のメッセージ（［0日］…のボタンつき）なら、その週の月曜。
 * CHECKIN_SUMMARY_LABEL — 振り返りの見出し「自分で考えた日（週末の質問）」（画面の振り返りも、この言い方で出す）。
 */
export { checkinQuestionWeek, CHECKIN_SUMMARY_LABEL } from './checkin';
export {
  trialReport,
  formatTrialReport,
  parseTrialReports,
  checkTrialReport,
  TRIAL_REPORT_VERSION,
  TRIAL_REPORT_MARKER,
  TRIAL_MAX_TEXTS,
  TRIAL_MAX_TEXT_LENGTH,
  TRIAL_MAX_REPORT_LENGTH,
  TRIAL_MAX_CHECKINS,
} from './trial';
export type { TrialReport, TrialReportOptions, TrialClock } from './trial';

// ----- 振り返り -----

/**
 * weeklySummary(state, catalog, weekStart): WeeklySummary
 * renderCardText(state, catalog, card): string — カードの中身をテキストにする（LINE やテストで使う）。
 */
export { weeklySummary, renderCardText } from './summary';
