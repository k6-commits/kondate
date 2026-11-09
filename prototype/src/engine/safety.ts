// 安全（DESIGN.md 3-4）。除外とアレルゲンの判定はコードで行い、わからない物は「要確認」で止める。
import type { Catalog, Dish, Exclusion, Household, Ingredient, Member, Notice, SafetyResult } from './types';
import { allergenName, eatingMembers, ingredientsOf } from './context';
import { normalizeJa } from './util';

type Hit = SafetyResult['hits'][number];

function namesOf(ing: Ingredient): string[] {
  return [ing.name, ...ing.aliases].map(normalizeJa).filter((n) => n.length > 0);
}

function pushHit(hits: Hit[], hit: Hit): void {
  if (!hits.some((h) => h.ingredientId === hit.ingredientId && h.reason === hit.reason)) hits.push(hit);
}

/**
 * 指定したメンバー（その日に食べる人）の除外条件で料理を判定する。
 * excluded：除外に当たる／uncertain：要確認／ok：判定できる範囲で問題なし。
 */
export function checkDishSafetyFor(dish: Dish, members: Member[], household: Household, catalog: Catalog): SafetyResult {
  const exclusions: Exclusion[] = members.filter((m) => m.ageBand !== 'infant').flatMap((m) => m.exclusions);
  const hits: Hit[] = [];
  if (exclusions.length === 0) return { status: 'ok', hits };

  const hasAllergen = exclusions.some((e) => e.type === 'allergen');
  let excluded = false;
  let uncertain = false;
  const dishName = normalizeJa(dish.name);

  // 料理名に除外の語が入っていれば除外（自由入力の定番にも効く）。
  for (const ex of exclusions) {
    if (ex.type !== 'text') continue;
    const t = normalizeJa(ex.text);
    if (t && dishName.includes(t)) {
      excluded = true;
      pushHit(hits, { ingredientId: '', reason: `除外：${ex.text.trim()}` });
    }
  }

  const ings = ingredientsOf(household, dish);
  if (ings.length === 0) {
    // 材料がわからない料理。料理名から分かる範囲だけ除外し、アレルゲンの除外があれば要確認にする。
    for (const ex of exclusions) {
      if (ex.type === 'ingredient') {
        const ing = catalog.ingredientById.get(ex.id);
        if (ing && namesOf(ing).some((n) => dishName.includes(n))) {
          excluded = true;
          pushHit(hits, { ingredientId: ing.id, reason: `除外：${ing.name}` });
        }
      } else if (ex.type === 'allergen') {
        const name = normalizeJa(allergenName(catalog, ex.id));
        const byIngredient = catalog.ingredients.find(
          (i) => i.allergens.includes(ex.id) && !i.pantry && namesOf(i).some((n) => n.length >= 2 && dishName.includes(n)),
        );
        if ((name.length >= 1 && dishName.includes(name)) || byIngredient) {
          excluded = true;
          pushHit(hits, { ingredientId: byIngredient?.id ?? '', reason: allergenName(catalog, ex.id) });
        }
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
      } else {
        const t = normalizeJa(ex.text);
        if (t && names.some((n) => n.includes(t))) {
          excluded = true;
          pushHit(hits, { ingredientId: ing.id, reason: `除外：${ex.text.trim()}` });
        }
      }
    }
    if (ing.uncertain && hasAllergen) {
      uncertain = true;
      pushHit(hits, { ingredientId: ing.id, reason: `${ing.name}は銘柄で原材料が違います` });
    }
  }

  return { status: excluded ? 'excluded' : uncertain ? 'uncertain' : 'ok', hits };
}

/** 世帯全体（乳児を除く全員）で判定する。 */
export function checkDishSafety(dish: Dish, household: Household, catalog: Catalog): SafetyResult {
  return checkDishSafetyFor(dish, eatingMembers(household), household, catalog);
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

/** 世帯に出す注意（免責、重いアレルギー、乳児、窒息）。 */
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
  if (
    !household.settings.allowUncertainWithExclusions &&
    members.some((m) => m.ageBand !== 'infant' && m.exclusions.some((e) => e.type === 'allergen'))
  ) {
    notices.push({ level: 'info', text: NOTICE_UNCERTAIN });
  }
  return notices;
}
