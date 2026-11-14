// 安全（DESIGN.md 3-4）。除外とアレルゲンの判定はコードで行い、わからない物は「要確認」で止める。
import type { AllergenId, Catalog, Dish, Exclusion, Household, Ingredient, IngredientKind, Member, Notice, PlannedMeal, SafetyResult } from './types';
import {
  TEXT_SEPARATORS,
  allergenName,
  allergenWords,
  allergensOfText,
  eatingMembers,
  effectiveExclusions,
  findDishIn,
  ingredientsOf,
  textCategoryOf,
  textNameKey,
} from './context';
import { normalizeJa } from './util';

type Hit = SafetyResult['hits'][number];

function namesOf(ing: Ingredient): string[] {
  return [ing.name, ...ing.aliases].map(normalizeJa).filter((n) => n.length > 0);
}

/** 料理名の照合に使ってよい語か（ひらがな1文字は誤って当たりやすいので使わない。漢字1文字の「鮭」は使う）。 */
function nameWordOk(n: string): boolean {
  return n.length >= 2 || (n.length === 1 && !/[぀-ゟ]/.test(n));
}

function pushHit(hits: Hit[], hit: Hit): void {
  if (!hits.some((h) => h.ingredientId === hit.ingredientId && h.reason === hit.reason)) hits.push(hit);
}

/** 自由入力の除外の1語（「ピーマン、しいたけ」なら「ピーマン」と「しいたけ」）。 */
interface TextPart {
  text: string; // 表示用（区切った語）
  key: string; // 名前の照合用（normalizeJa し、「アレルギー」「類」「苦手」などの語尾を外したもの）
  kinds: IngredientKind[]; // 分類の語なら、その種類
  names: string[]; // 分類の語なら、名前に含まれていれば当てる語（練り物・かつお節など）
}

/** 自由入力の除外を語に分ける（区切り：、・,／ 空白 かっこ）。 */
export function textParts(text: string): TextPart[] {
  return text
    .normalize('NFKC')
    .split(TEXT_SEPARATORS)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      const cat = textCategoryOf(p);
      return { text: p, key: textNameKey(p), kinds: cat?.kinds ?? [], names: cat?.names ?? [] };
    })
    .filter((p) => p.key.length > 0);
}

/** その食材が自由入力の除外の1語に当たるか（名前・別名に含まれる、または分類の語の種類・名前に当たる）。 */
function textHitsIngredient(part: TextPart, ing: Ingredient, names: string[] = namesOf(ing)): boolean {
  if (names.some((n) => n.includes(part.key))) return true;
  if (part.kinds.includes(ing.kind)) return true;
  return part.names.some((w) => names.some((n) => n.includes(w)));
}

/**
 * 指定したメンバー（その日に食べる人）の除外条件で料理を判定する。
 * excluded：除外に当たる／uncertain：要確認／ok：判定できる範囲で問題なし。
 */
export function checkDishSafetyFor(dish: Dish, members: Member[], household: Household, catalog: Catalog): SafetyResult {
  // 自由入力の除外がアレルゲンの名前（「鶏肉」「えび」など）なら、アレルゲンの除外としても判定する。
  const exclusions: Exclusion[] = members.filter((m) => m.ageBand !== 'infant').flatMap(effectiveExclusions);
  const hits: Hit[] = [];
  if (exclusions.length === 0) return { status: 'ok', hits };

  const hasAllergen = exclusions.some((e) => e.type === 'allergen');
  let excluded = false;
  let uncertain = false;
  const dishName = normalizeJa(dish.name);
  const parts = exclusions.flatMap((ex) => (ex.type === 'text' ? textParts(ex.text) : []));

  // 料理名に除外の語が入っていれば除外（自由入力の定番にも効く）。
  for (const part of parts) {
    if (dishName.includes(part.key)) {
      excluded = true;
      pushHit(hits, { ingredientId: '', reason: `除外：${part.text}` });
    }
  }

  const ings = ingredientsOf(household, dish);
  if (ings.length === 0) {
    // 材料がわからない料理。料理名から分かる範囲だけ除外し、アレルゲンの除外があれば要確認にする。
    for (const ex of exclusions) {
      if (ex.type === 'ingredient') {
        const ing = catalog.ingredientById.get(ex.id);
        if (ing && namesOf(ing).some((n) => nameWordOk(n) && dishName.includes(n))) {
          excluded = true;
          pushHit(hits, { ingredientId: ing.id, reason: `除外：${ing.name}` });
        }
      } else if (ex.type === 'allergen') {
        // アレルゲンの呼び方（「鮭」「豚」などの漢字1文字を含む）か、そのアレルゲンを含む食材の名前が料理名にあれば除外。
        const byWord = allergenWords(ex.id, catalog).some((w) => dishName.includes(w));
        const byIngredient = catalog.ingredients.find(
          (i) => i.allergens.includes(ex.id) && !i.pantry && namesOf(i).some((n) => nameWordOk(n) && dishName.includes(n)),
        );
        if (byWord || byIngredient) {
          excluded = true;
          pushHit(hits, { ingredientId: byIngredient?.id ?? '', reason: allergenName(catalog, ex.id) });
        }
      }
    }
    // 分類の語（「魚」「きのこ」など）は、その種類の食材の名前が料理名にあれば除外（「鯵の南蛮漬け」と「魚」）。
    for (const part of parts) {
      if (part.kinds.length === 0 && part.names.length === 0) continue;
      const byCategory = catalog.ingredients.find((i) => {
        const names = namesOf(i);
        return (part.kinds.includes(i.kind) || part.names.some((w) => names.some((n) => n.includes(w)))) &&
          names.some((n) => nameWordOk(n) && dishName.includes(n));
      });
      if (byCategory) {
        excluded = true;
        pushHit(hits, { ingredientId: byCategory.id, reason: `除外：${part.text}` });
      }
    }
    if (!excluded && hasAllergen) {
      uncertain = true;
      pushHit(hits, { ingredientId: '', reason: '材料がわからない料理です（要確認）' });
    }
  }

  for (const di of ings) {
    const ing = catalog.ingredientById.get(di.ingredientId);
    if (!ing) {
      uncertain = true;
      pushHit(hits, { ingredientId: di.ingredientId, reason: '食材マスタにない材料です（要確認）' });
      continue;
    }
    const names = namesOf(ing);
    for (const ex of exclusions) {
      if (ex.type === 'allergen') {
        if (ing.allergens.includes(ex.id)) {
          excluded = true;
          const label = allergenName(catalog, ex.id);
          const direct = names.some((n) => n.includes(normalizeJa(label)));
          pushHit(hits, { ingredientId: ing.id, reason: direct ? label : `${label}（派生原材料）` });
        }
      } else if (ex.type === 'ingredient') {
        if (ing.id === ex.id) {
          excluded = true;
          pushHit(hits, { ingredientId: ing.id, reason: `除外：${ing.name}` });
        }
      }
    }
    for (const part of parts) {
      if (textHitsIngredient(part, ing, names)) {
        excluded = true;
        pushHit(hits, { ingredientId: ing.id, reason: `除外：${part.text}` });
      }
    }
    if (ing.uncertain && hasAllergen) {
      uncertain = true;
      pushHit(hits, { ingredientId: ing.id, reason: `${ing.name}は銘柄で原材料が違います` });
    }
  }

  return { status: excluded ? 'excluded' : uncertain ? 'uncertain' : 'ok', hits };
}

/** 自由入力の除外が何に当たるか（画面で「当たる食材」を見せるため）。 */
export interface TextExclusionTargets {
  /** アレルゲンとしても扱う id（「卵」「甲殻類アレルギー」「肉」など）。 */
  allergenIds: AllergenId[];
  /** 名前・別名・分類（魚・きのこ など）で当たる食材の id。アレルゲンで当たる食材（派生原材料）は含めない。 */
  ingredientIds: string[];
  /** 料理名に語が入っている料理の id。 */
  dishIds: string[];
  /** どの食材・料理・アレルゲンにも当たらない語。 */
  unmatched: string[];
}

/** 公開API：自由入力の除外の語が、どのアレルゲン・食材・料理に当たるか。登録のときに「当たる食材はありません」と分かるようにする。 */
export function textExclusionTargets(text: string, catalog: Catalog): TextExclusionTargets {
  const allergenIds = allergensOfText(text);
  const ingredientIds: string[] = [];
  const dishIds: string[] = [];
  const unmatched: string[] = [];
  for (const part of textParts(text)) {
    let hit = allergensOfText(part.text).length > 0;
    for (const ing of catalog.ingredients) {
      if (!textHitsIngredient(part, ing)) continue;
      hit = true;
      if (!ingredientIds.includes(ing.id)) ingredientIds.push(ing.id);
    }
    for (const d of catalog.dishes) {
      if (!normalizeJa(d.name).includes(part.key)) continue;
      hit = true;
      if (!dishIds.includes(d.id)) dishIds.push(d.id);
    }
    if (!hit) unmatched.push(part.text);
  }
  return { allergenIds, ingredientIds, dishIds, unmatched };
}

/** 世帯全体（乳児を除く全員）で判定する。 */
export function checkDishSafety(dish: Dish, household: Household, catalog: Catalog): SafetyResult {
  return checkDishSafetyFor(dish, eatingMembers(household), household, catalog);
}

/**
 * その日の献立のうち、その日に食べる家族（欠席の人を除く）の除外に当たる料理の数。みんな外で食べる日・料理のない日は 0。
 * 試用の記録の「除外の違反」に使う（advanceDay が、日の終わりに PlannedMeal.safetyAtDayEnd に残す）。
 */
export function excludedDishCount(household: Household, catalog: Catalog, meal: Pick<PlannedMeal, 'dishIds' | 'absentMemberIds'>): number {
  const eaters = eatingMembers(household, meal.absentMemberIds);
  if (eaters.length === 0) return 0;
  let count = 0;
  for (const id of meal.dishIds) {
    const dish = findDishIn(household, catalog, id);
    if (dish && checkDishSafetyFor(dish, eaters, household, catalog).status === 'excluded') count += 1;
  }
  return count;
}

/** 献立に出してよいか。'uncertain' は設定で許したときだけ。 */
export function isAllowed(result: SafetyResult, household: Household): boolean {
  if (result.status === 'ok') return true;
  return result.status === 'uncertain' && household.settings.allowUncertainWithExclusions;
}

/** 「要確認」の注意文。 */
export function uncertainWarning(dish: Dish, result: SafetyResult, catalog: Catalog): string {
  const names = result.hits
    .map((h) => (h.ingredientId ? catalog.ingredientById.get(h.ingredientId)?.name : undefined))
    .filter((n): n is string => !!n);
  const target = names.length > 0 ? [...new Set(names)].join('・') : dish.name;
  if (names.length === 0) {
    return `要確認：${target}は材料がわかりません。材料を確かめてから作ってください`;
  }
  return `要確認：${target}は銘柄で原材料が違います。パッケージの表示を確かめてください`;
}

const HONEY_WORDS = ['はちみつ', '蜂蜜'];

/** はちみつ（はちみつ入りの加工品を含む）を使う料理か。 */
export function usesHoney(dish: Dish, household: Household, catalog: Catalog): boolean {
  if (HONEY_WORDS.some((w) => normalizeJa(dish.name).includes(normalizeJa(w)))) return true;
  return ingredientsOf(household, dish).some((di) => {
    const ing = catalog.ingredientById.get(di.ingredientId);
    if (!ing) return false;
    return ing.id === 'honey' || namesOf(ing).some((n) => HONEY_WORDS.some((w) => n.includes(normalizeJa(w))));
  });
}

export const NOTICE_DISCLAIMER = 'アプリは除外の補助で、アレルギーの安全を保証するものではありません';
export const NOTICE_SEVERE = '重い食物アレルギー（アナフィラキシーの経験など）は、このプロトタイプの対象外です。医師の指示を優先してください';
export const NOTICE_INFANT_SERVING = '1歳未満の子は献立の『食べる人』に含めていません（離乳食は対象外）';
export const NOTICE_INFANT_HONEY = '1歳未満の子には、はちみつ（はちみつ入りの加工品を含む）を与えないでください';
export const NOTICE_CHOKING = '5歳以下の子には、豆・ナッツ類など、のどに詰まりやすい食品に注意してください';
export const NOTICE_UNCERTAIN = '市販のルウ・冷凍食品・惣菜は銘柄で原材料が違うため、「要確認」として献立に出していません';
export const NOTICE_FOOD_SAFETY = '消費期限を優先してください。においや色では安全を判断できません';

/** 大豆・小麦は、醤油・味噌・サラダ油・酢などの調味料にも入る（食材マスタの派生原材料）。 */
const SEASONING_ALLERGENS: { id: AllergenId; name: string; seasonings: string[] }[] = [
  { id: 'soy', name: '大豆', seasonings: ['醤油', '味噌', 'サラダ油'] },
  { id: 'wheat', name: '小麦', seasonings: ['醤油', '酢', 'めんつゆ'] },
];

/** 大豆・小麦の除外があるときの注意。調味料にも当たるため、出せる料理が少なくなる。 */
export function seasoningNotice(ids: AllergenId[]): string | null {
  const hit = SEASONING_ALLERGENS.filter((a) => ids.includes(a.id));
  if (hit.length === 0) return null;
  const names = hit.map((a) => a.name).join('・');
  const seasonings = [...new Set(hit.flatMap((a) => a.seasonings))].slice(0, 4).join('・');
  const much = ids.includes('soy') ? 'かなり' : '';
  return `${names}の除外は、${seasonings}などの調味料にも当たるため、出せる料理が${much}少なくなります。組めない日は、その日の注意でお知らせします`;
}

/** 世帯に出す注意（免責、重いアレルギー、乳児、窒息、調味料に入るアレルゲン、要確認）。 */
export function householdNotices(household: Household): Notice[] {
  const notices: Notice[] = [{ level: 'info', text: NOTICE_DISCLAIMER }];
  const members = household.members;
  if (members.some((m) => m.exclusions.some((e) => e.type === 'allergen' && e.severe))) {
    notices.push({ level: 'warning', text: NOTICE_SEVERE });
  }
  if (members.some((m) => m.ageBand === 'infant')) {
    notices.push({ level: 'warning', text: NOTICE_INFANT_SERVING });
    notices.push({ level: 'warning', text: NOTICE_INFANT_HONEY });
  }
  if (members.some((m) => m.ageBand === 'infant' || m.ageBand === 'preschool')) {
    notices.push({ level: 'warning', text: NOTICE_CHOKING });
  }
  // 自由入力の「鶏肉」「えび」なども、アレルゲンの除外として数える。
  const allergenIds = members
    .filter((m) => m.ageBand !== 'infant')
    .flatMap((m) => effectiveExclusions(m))
    .flatMap((e) => (e.type === 'allergen' ? [e.id] : []));
  const seasoning = seasoningNotice(allergenIds);
  if (seasoning) notices.push({ level: 'info', text: seasoning });
  if (!household.settings.allowUncertainWithExclusions && allergenIds.length > 0) {
    notices.push({ level: 'info', text: NOTICE_UNCERTAIN });
  }
  return notices;
}
