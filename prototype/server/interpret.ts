// 書き込みの解釈（webhook と /api/parse で共通）：LLM があれば LLM → エンジンの validateCommands。
// 1件も残らなければ null を返す（呼ぶ側がルールベースの parseMessage / handleUserText に戻る）。
import {
  validateCommands,
  type AppState,
  type Catalog,
  type ISODate,
  type Member,
  type ParsedCommand,
} from '../src/engine/index';
import type { LlmInterpreter } from './llm';

/** これより長い書き込みは LLM に送らない（ルールで解釈する）。 */
export const MAX_LLM_TEXT = 500;

export async function interpretWithLlm(
  llm: LlmInterpreter | null,
  catalog: Catalog,
  state: AppState,
  text: string,
): Promise<ParsedCommand[] | null> {
  if (!llm) return null;
  const body = text.trim();
  if (body.length === 0 || body.length > MAX_LLM_TEXT) return null;
  let raw: ParsedCommand[] | null;
  try {
    raw = await llm.interpret({
      text: body,
      today: state.today,
      members: state.household.members,
      customDishes: state.household.customDishes,
    });
  } catch {
    raw = null;
  }
  if (!raw || raw.length === 0) return null;
  const valid = validateCommands(state, catalog, raw);
  return valid.length > 0 ? valid : null;
}

/** /api/parse 用：members だけから、validateCommands に渡せる最小の state（household だけ持つもの）を作る。 */
export function minimalState(today: ISODate, members: Member[]): AppState {
  return {
    version: 1,
    today,
    household: {
      id: 'api_parse',
      members,
      favorites: [],
      customDishes: [],
      settings: {
        plan: 'free',
        dinnerWeekdays: [1, 2, 3, 4, 5],
        shoppingWeekdays: [],
        rakuPerWeek: 1,
        newPerWeek: 1,
        sidePolicy: 'side_or_soup',
        maxMinutes: {},
        allowUncertainWithExclusions: false,
      },
      createdAt: today,
    },
    meals: [],
    history: [],
    inventory: [],
    shopping: [],
    chat: [],
    proposals: [],
    seq: 0,
  };
}
