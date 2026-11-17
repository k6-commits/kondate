import { defaultCatalog } from './index';
import { INGREDIENTS } from './ingredients';
import { PRICES } from './prices';

// 値段の目安（prices.ts）の表の形を確かめる（もれ・単位・桁）。値段そのものの正しさは見ない。

const standardIds = new Set(INGREDIENTS.map((i) => i.id));
const priced = INGREDIENTS.filter((i) => PRICES[i.id] !== undefined);

describe('PRICES', () => {
  it('prices every standard ingredient that goes on the shopping list (not pantry)', () => {
    const missing = INGREDIENTS.filter((i) => !i.pantry && PRICES[i.id] === undefined).map((i) => i.id);
    expect(missing).toEqual([]);
  });

  it('uses only standard ingredient ids', () => {
    expect(Object.keys(PRICES).filter((id) => !standardIds.has(id))).toEqual([]);
  });

  it('has a positive whole-yen price for a positive amount', () => {
    for (const [id, p] of Object.entries(PRICES)) {
      expect(Number.isInteger(p.yen) && p.yen > 0, id).toBe(true);
      expect(p.per > 0, id).toBe(true);
    }
  });

  it('prices one pack (per = pack size), or 100 g/ml or 1 piece when there is no pack', () => {
    for (const i of priced) {
      const expected = i.pack ? i.pack.size : i.unit === 'g' || i.unit === 'ml' ? 100 : 1;
      expect(PRICES[i.id].per, i.id).toBe(expected);
    }
  });

  it('stays within sane bounds (10〜3000円, and 10〜2000円 per 100 g/ml)', () => {
    for (const i of priced) {
      const { yen, per } = PRICES[i.id];
      expect(yen >= 10 && yen <= 3000, `${i.id}: ${yen}円`).toBe(true);
      if (i.unit === 'g' || i.unit === 'ml') {
        const per100 = (yen / per) * 100;
        expect(per100 >= 10 && per100 <= 2000, `${i.id}: ${Math.round(per100)}円/100${i.unit}`).toBe(true);
      }
    }
  });

  it('is attached to the ingredients of the default catalog', () => {
    for (const i of priced) expect(defaultCatalog.ingredientById.get(i.id)?.price, i.id).toEqual(PRICES[i.id]);
  });
});
