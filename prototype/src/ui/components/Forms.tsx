// 初回設定と「家族と設定」で共通の入力部品。
import { useMemo, useState } from 'react';
import type { AgeBand, AllergenId, Catalog, Dish, Exclusion, Household, Ingredient, Protein, Weekday } from '../../engine';
import { AGE_BAND_LABEL, PROTEIN_LABEL, WEEKDAY_JA, checkDishSafety } from '../../engine';
import type { MemberRole } from '../lib';
import { ROLE_LABEL, ROLE_ORDER, WEEKDAYS_MON_FIRST, cls, normalizeForSearch } from '../lib';
import { Icon } from './Icon';

export interface MemberDraft {
  nickname: string;
  ageBand: AgeBand;
  role?: MemberRole;
  exclusions: Exclusion[];
}

const AGE_BANDS: AgeBand[] = ['adult', 'teen', 'child', 'preschool', 'infant'];

// ---------------------------------------------------------------------------
// 曜日・数・プラン
// ---------------------------------------------------------------------------

export function WeekdayPicker({
  label,
  value,
  onChange,
  min = 1,
}: {
  label: string;
  value: Weekday[];
  onChange: (next: Weekday[]) => void;
  min?: number;
}) {
  return (
    <div className="weekdays" role="group" aria-label={label}>
      {WEEKDAYS_MON_FIRST.map((wd) => {
        const on = value.includes(wd);
        const locked = on && value.length <= min;
        return (
          <button
            key={wd}
            type="button"
            className={cls('wd-btn', wd === 0 && 'is-sun', wd === 6 && 'is-sat')}
            aria-pressed={on}
            aria-label={`${WEEKDAY_JA[wd]}曜日`}
            disabled={locked}
            title={locked ? '1つ以上選んでください' : undefined}
            onClick={() => onChange(on ? value.filter((x) => x !== wd) : [...value, wd].sort((a, b) => a - b))}
          >
            {WEEKDAY_JA[wd]}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="seg-btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const PLAN_INFO: { id: 'free' | 'paid'; title: string; points: string[] }[] = [
  {
    id: 'free',
    title: '無料',
    points: ['週の献立は、メニューの「今週の献立」で見る', '今日のごはんは、メニューから開く', '家族の反応は、世帯全体として覚える'],
  },
  {
    id: 'paid',
    title: '有料',
    points: [
      '献立ができたら、配信で届く',
      '平日の夕方に「今日はこれ」が届く（翌日へ進むと入ります）',
      '冷凍の食材を使う日の前日に、解凍の連絡が届く',
      '家族の反応を、一人ずつ覚える',
    ],
  },
];

export function PlanPicker({ name, value, onChange }: { name: string; value: 'free' | 'paid'; onChange: (plan: 'free' | 'paid') => void }) {
  return (
    <div className="plan-cards" role="radiogroup" aria-label="プラン">
      {PLAN_INFO.map((p) => (
        <label key={p.id} className={cls('plan-card', value === p.id && 'is-on')}>
          <span className="plan-top">
            <input type="radio" name={name} value={p.id} checked={value === p.id} onChange={() => onChange(p.id)} />
            <span className="plan-title">{p.title}</span>
          </span>
          <ul className="plan-points">
            {p.points.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 家族
// ---------------------------------------------------------------------------

export function exclusionSummary(exclusions: Exclusion[], catalog: Catalog): string {
  if (exclusions.length === 0) return '除外なし';
  const names = exclusions.map((e) => {
    if (e.type === 'allergen') {
      const name = catalog.allergens.find((a) => a.id === e.id)?.name ?? e.id;
      return e.severe ? `${name}（重い）` : name;
    }
    if (e.type === 'ingredient') return catalog.ingredientById.get(e.id)?.name ?? e.id;
    return `「${e.text}」`;
  });
  return `除外：${names.join('・')}`;
}

export function memberLine(m: MemberDraft): string {
  return [AGE_BAND_LABEL[m.ageBand], m.role ? ROLE_LABEL[m.role] : null].filter(Boolean).join('・');
}

function searchIngredients(catalog: Catalog, query: string, exclude: Set<string>): Ingredient[] {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const scored: { ing: Ingredient; rank: number }[] = [];
  for (const ing of catalog.ingredients) {
    if (exclude.has(ing.id)) continue;
    const names = [ing.name, ...ing.aliases].map(normalizeForSearch);
    if (names.some((n) => n === q)) scored.push({ ing, rank: 0 });
    else if (names.some((n) => n.startsWith(q))) scored.push({ ing, rank: 1 });
    else if (names.some((n) => n.includes(q))) scored.push({ ing, rank: 2 });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.ing.name.length - b.ing.name.length)
    .slice(0, 8)
    .map((x) => x.ing);
}

export function MemberEditor({
  idPrefix,
  value,
  onChange,
  catalog,
}: {
  idPrefix: string;
  value: MemberDraft;
  onChange: (next: MemberDraft) => void;
  catalog: Catalog;
}) {
  const mandatory = catalog.allergens.filter((a) => a.mandatory);
  const recommended = catalog.allergens.filter((a) => !a.mandatory);
  const allergenOf = (id: AllergenId) => value.exclusions.find((e): e is Extract<Exclusion, { type: 'allergen' }> => e.type === 'allergen' && e.id === id);
  const [showMore, setShowMore] = useState(() => recommended.some((a) => allergenOf(a.id)));
  const [query, setQuery] = useState('');
  const excludedIngredientIds = useMemo(
    () => new Set(value.exclusions.flatMap((e) => (e.type === 'ingredient' ? [e.id] : []))),
    [value.exclusions],
  );
  const results = useMemo(() => searchIngredients(catalog, query, excludedIngredientIds), [catalog, query, excludedIngredientIds]);
  const q = normalizeForSearch(query);
  const exact = q && catalog.ingredients.some((i) => [i.name, ...i.aliases].some((n) => normalizeForSearch(n) === q));
  const textTaken = value.exclusions.some((e) => e.type === 'text' && normalizeForSearch(e.text) === q);

  const set = (patch: Partial<MemberDraft>) => onChange({ ...value, ...patch });
  const toggleAllergen = (id: AllergenId) => {
    const has = !!allergenOf(id);
    set({
      exclusions: has
        ? value.exclusions.filter((e) => !(e.type === 'allergen' && e.id === id))
        : [...value.exclusions, { type: 'allergen', id }],
    });
  };
  const setSevere = (id: AllergenId, severe: boolean) =>
    set({
      exclusions: value.exclusions.map((e) =>
        e.type === 'allergen' && e.id === id ? (severe ? { type: 'allergen', id, severe: true } : { type: 'allergen', id }) : e,
      ),
    });
  const removeAt = (index: number) => set({ exclusions: value.exclusions.filter((_, i) => i !== index) });
  const selectedAllergens = value.exclusions.filter((e): e is Extract<Exclusion, { type: 'allergen' }> => e.type === 'allergen');

  const allergenChip = (a: { id: AllergenId; name: string }) => (
    <button key={a.id} type="button" className="chip chip--toggle" aria-pressed={!!allergenOf(a.id)} onClick={() => toggleAllergen(a.id)}>
      {allergenOf(a.id) ? <Icon name="check" size={15} /> : null}
      {a.name}
    </button>
  );

  return (
    <div className="member-editor">
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-nick`}>
          ニックネーム
        </label>
        <input
          id={`${idPrefix}-nick`}
          className="text-input"
          type="text"
          value={value.nickname}
          maxLength={12}
          placeholder="例：ママ、はると"
          onChange={(e) => set({ nickname: e.target.value })}
        />
        <p className="field-note">書き込みの「水曜は〇〇が飲み会」などで、この名前を使います。</p>
      </div>

      <fieldset className="field">
        <legend className="field-label">年齢</legend>
        <div className="choice-row">
          {AGE_BANDS.map((b) => (
            <label key={b} className={cls('choice', value.ageBand === b && 'is-on')}>
              <input type="radio" name={`${idPrefix}-age`} checked={value.ageBand === b} onChange={() => set({ ageBand: b })} />
              {AGE_BAND_LABEL[b]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">続柄</legend>
        <div className="choice-row">
          {ROLE_ORDER.map((r) => (
            <label key={r} className={cls('choice', value.role === r && 'is-on')}>
              <input type="radio" name={`${idPrefix}-role`} checked={value.role === r} onChange={() => set({ role: r })} />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">除外（アレルギー・食べない物）</legend>
        <p className="field-note">表示義務のある品目（特定原材料）</p>
        <div className="chip-grid">{mandatory.map(allergenChip)}</div>
        <button type="button" className="text-btn" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
          表示が推奨の品目（{recommended.length}品目）
          <Icon name={showMore ? 'chevronUp' : 'chevronDown'} size={16} />
        </button>
        {showMore ? <div className="chip-grid">{recommended.map(allergenChip)}</div> : null}

        {selectedAllergens.length > 0 ? (
          <ul className="severe-list">
            {selectedAllergens.map((e) => {
              const name = catalog.allergens.find((a) => a.id === e.id)?.name ?? e.id;
              const id = `${idPrefix}-severe-${e.id}`;
              return (
                <li key={e.id}>
                  <input id={id} type="checkbox" checked={!!e.severe} onChange={(ev) => setSevere(e.id, ev.target.checked)} />
                  <label htmlFor={id}>
                    {name}：重い（アナフィラキシーの経験など）
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}
        {selectedAllergens.some((e) => e.severe) ? (
          <p className="warn-inline">
            <Icon name="alert" size={15} />
            重い食物アレルギーは、このプロトタイプの対象外です。医師の指示を優先してください。
          </p>
        ) : null}

        <div className="field-sub">
          <label className="field-label field-label--sub" htmlFor={`${idPrefix}-ing`}>
            食材で除外する
          </label>
          <div className="search">
            <Icon name="search" size={18} />
            <input
              id={`${idPrefix}-ing`}
              className="text-input"
              type="search"
              value={query}
              placeholder="例：しいたけ、パクチー"
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {q ? (
            <div className="results" role="group" aria-label="食材の候補">
              {results.map((ing) => (
                <button
                  key={ing.id}
                  type="button"
                  className="chip"
                  onClick={() => {
                    set({ exclusions: [...value.exclusions, { type: 'ingredient', id: ing.id }] });
                    setQuery('');
                  }}
                >
                  <Icon name="plus" size={15} />
                  {ing.name}
                </button>
              ))}
              {!exact && !textTaken ? (
                <button
                  type="button"
                  className="chip chip--free"
                  onClick={() => {
                    set({ exclusions: [...value.exclusions, { type: 'text', text: query.trim() }] });
                    setQuery('');
                  }}
                >
                  <Icon name="plus" size={15} />「{query.trim()}」を除外する（マスタにない語）
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {value.exclusions.some((e) => e.type !== 'allergen') ? (
          <ul className="removable">
            {value.exclusions.map((e, i) =>
              e.type === 'allergen' ? null : (
                <li key={`${e.type}-${e.type === 'ingredient' ? e.id : e.text}`}>
                  <span>{e.type === 'ingredient' ? (catalog.ingredientById.get(e.id)?.name ?? e.id) : `「${e.text}」`}</span>
                  <button type="button" className="icon-btn" aria-label={`除外から外す：${e.type === 'ingredient' ? (catalog.ingredientById.get(e.id)?.name ?? e.id) : e.text}`} onClick={() => removeAt(i)}>
                    <Icon name="close" size={16} />
                  </button>
                </li>
              ),
            )}
          </ul>
        ) : null}
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 定番
// ---------------------------------------------------------------------------

const PROTEIN_ORDER: Protein[] = ['chicken', 'pork', 'beef', 'ground', 'fish', 'seafood', 'egg', 'tofu', 'none'];

export function DishPicker({
  catalog,
  household,
  selectedIds,
  customNames,
  onChange,
}: {
  catalog: Catalog;
  /** 除外の印を付けるための、入力中の世帯。 */
  household: Household;
  selectedIds: string[];
  customNames: string[];
  onChange: (ids: string[], customNames: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const q = normalizeForSearch(query);
  const safety = useMemo(() => {
    const map = new Map<string, 'ok' | 'excluded' | 'uncertain'>();
    for (const d of catalog.dishes) map.set(d.id, checkDishSafety(d, household, catalog).status);
    return map;
  }, [catalog, household]);

  const matches = q
    ? catalog.dishes
        .filter((d) => normalizeForSearch(d.name).includes(q))
        .sort((a, b) => Number(b.role === 'main') - Number(a.role === 'main') || a.name.length - b.name.length)
    : [];
  const exact = q && catalog.dishes.some((d) => normalizeForSearch(d.name) === q);
  const customTaken = customNames.some((n) => normalizeForSearch(n) === q);
  const total = selectedIds.length + customNames.length;

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id], customNames);

  const dishChip = (d: Dish) => {
    const s = safety.get(d.id) ?? 'ok';
    const on = selectedIds.includes(d.id);
    return (
      <button
        key={d.id}
        type="button"
        className={cls('chip', 'chip--toggle', s !== 'ok' && 'is-flagged')}
        aria-pressed={on}
        disabled={s === 'excluded' && !on}
        onClick={() => toggle(d.id)}
      >
        {on ? <Icon name="check" size={15} /> : null}
        {d.name}
        {s === 'excluded' ? <span className="chip-flag">除外</span> : s === 'uncertain' ? <span className="chip-flag">要確認</span> : null}
      </button>
    );
  };

  const groups = PROTEIN_ORDER.map((p) => ({
    protein: p,
    dishes: catalog.dishes.filter((d) => d.role === 'main' && d.protein === p),
  })).filter((g) => g.dishes.length > 0);

  return (
    <div className="dish-picker">
      <div className="picked" aria-live="polite">
        <p className="picked-count num">
          選んだ定番：<strong>{total}品</strong>
          {total < 5 ? '（5品以上がおすすめです）' : ''}
        </p>
        {total > 0 ? (
          <ul className="removable">
            {selectedIds.map((id) => (
              <li key={id}>
                <span>{catalog.dishById.get(id)?.name ?? id}</span>
                <button type="button" className="icon-btn" aria-label={`定番から外す：${catalog.dishById.get(id)?.name ?? id}`} onClick={() => toggle(id)}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
            {customNames.map((n) => (
              <li key={`custom-${n}`}>
                <span>{n}（マスタにない料理）</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`定番から外す：${n}`}
                  onClick={() => onChange(selectedIds, customNames.filter((x) => x !== n))}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="search">
        <Icon name="search" size={18} />
        <input
          id="favorite-search"
          className="text-input"
          type="search"
          aria-label="料理の名前で探す"
          placeholder="料理の名前で探す（例：生姜焼き）"
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {q ? (
        <div className="results" role="group" aria-label="料理の候補">
          {matches.slice(0, 16).map(dishChip)}
          {!exact && !customTaken ? (
            <button
              type="button"
              className="chip chip--free"
              onClick={() => {
                onChange(selectedIds, [...customNames, query.trim()]);
                setQuery('');
              }}
            >
              <Icon name="plus" size={15} />「{query.trim()}」を追加（マスタにない料理）
            </button>
          ) : null}
          {matches.length === 0 ? <p className="hint">マスタに見つかりませんでした。名前だけで追加できます（材料がわからないので、除外のある家族では「要確認」になります）。</p> : null}
        </div>
      ) : (
        <div className="dish-groups">
          {groups.map((g) => (
            <section key={g.protein} className="dish-group" aria-label={PROTEIN_LABEL[g.protein]}>
              <h4 className="dish-group-title">{g.protein === 'none' ? 'そのほか' : PROTEIN_LABEL[g.protein]}</h4>
              <div className="chip-grid">{g.dishes.map(dishChip)}</div>
            </section>
          ))}
        </div>
      )}
      <p className="hint">「除外」は家族の除外に当たる料理、「要確認」は銘柄で原材料が変わる物を使う料理です。</p>
    </div>
  );
}
