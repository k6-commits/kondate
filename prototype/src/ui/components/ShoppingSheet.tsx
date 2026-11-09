// 買い物リスト：買い物日ごとのタブ、売り場順、チェック、常備品の確認、テキストでコピー。
import { useEffect, useRef, useState } from 'react';
import type { Action, AppState, Catalog, ISODate } from '../../engine';
import { AISLE_LABEL, AISLE_ORDER, formatJa, renderCardText } from '../../engine';
import { cls, leftCount, quantityOf } from '../lib';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const FREEZE = '買ったら冷凍';

export function ShoppingSheet({
  state,
  catalog,
  date,
  onDateChange,
  onAction,
  onBack,
  onToast,
}: {
  state: AppState;
  catalog: Catalog;
  date: ISODate | null;
  onDateChange: (date: ISODate) => void;
  onAction: (action: Action) => void;
  onBack: () => void;
  onToast: (text: string) => void;
}) {
  const lists = [...state.shopping].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const current = lists.find((l) => l.date === date) ?? lists.find((l) => l.date >= state.today) ?? lists[0];
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCopyFallback(null);
  }, [current?.date]);

  useEffect(() => {
    const el = fallbackRef.current;
    if (copyFallback !== null && el) {
      el.focus();
      el.select();
    }
  }, [copyFallback]);

  // クリップボードへの書き込みは、クリックの中で呼ぶ。だめなら、テキスト欄を選択状態にして案内する。
  const copy = () => {
    if (!current) return;
    const text = renderCardText(state, catalog, { kind: 'shopping', date: current.date });
    const fail = () => setCopyFallback(text);
    try {
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clip || typeof clip.writeText !== 'function') {
        fail();
        return;
      }
      clip.writeText(text).then(() => {
        setCopyFallback(null);
        onToast('買い物リストをコピーしました');
      }, fail);
    } catch {
      fail();
    }
  };

  return (
    <Sheet id="shopping" title="買い物リスト" onBack={onBack}>
      {lists.length === 0 || !current ? (
        <p className="empty">今は買い物リストはありません。献立ができると、買い物の日ごとに作ります。</p>
      ) : (
        <>
          <div className="tabs" role="group" aria-label="買い物の日">
            {lists.map((l) => {
              const left = leftCount(state, l);
              return (
                <button
                  key={l.date}
                  type="button"
                  className="tab"
                  aria-pressed={l.date === current.date}
                  onClick={() => onDateChange(l.date)}
                >
                  <span className="num">{formatJa(l.date)}の買い物</span>
                  <span className="tab-note num">
                    {l.date === state.today ? '今日・' : l.date < state.today ? '済んだ日・' : ''}のこり{left}品
                  </span>
                </button>
              );
            })}
          </div>

          <div className="list-head">
            <p className="list-sum num">
              {current.items.length}品
              {current.items.some((i) => i.checked) ? `（買った ${current.items.filter((i) => i.checked).length}品）` : ''}
            </p>
            <button type="button" className="btn btn--small" onClick={copy}>
              <Icon name="copy" size={18} />
              テキストでコピー
            </button>
          </div>
          {current.date < state.today ? (
            <p className="hint">済んだ買い物日のリストです。「のこり」は、まだチェックしていない物のうち、これからの献立に使う物の数です。</p>
          ) : null}
          {copyFallback !== null ? (
            <div className="copy-fallback">
              <label htmlFor="shopping-copy-text">コピーできませんでした。下のテキストを選択してコピーしてください。</label>
              <textarea id="shopping-copy-text" ref={fallbackRef} readOnly rows={8} value={copyFallback} />
            </div>
          ) : null}

          {current.items.length === 0 ? <p className="empty">買う物はありません。</p> : null}
          <div className="memo-paper">
            {AISLE_ORDER.map((aisle) => {
              const items = current.items.filter((i) => i.aisle === aisle);
              if (items.length === 0) return null;
              const headingId = `aisle-${current.date}-${aisle}`;
              return (
                <section key={aisle} className="aisle" aria-labelledby={headingId}>
                  <h3 className="aisle-title" id={headingId} data-aisle={aisle}>
                    {AISLE_LABEL[aisle]}
                    <span className="aisle-count num">{items.length}品</span>
                  </h3>
                  <ul className="items">
                    {items.map((item) => {
                      const inputId = `item-${current.date}-${item.ingredientId}`;
                      return (
                        <li key={item.ingredientId} className={cls('item', item.checked && 'is-checked')}>
                          <input
                            id={inputId}
                            type="checkbox"
                            className="item-check"
                            checked={item.checked}
                            onChange={(e) =>
                              onAction({
                                type: 'check_item',
                                shoppingDate: current.date,
                                ingredientId: item.ingredientId,
                                checked: e.target.checked,
                              })
                            }
                          />
                          <label htmlFor={inputId} className="item-label">
                            <span className="item-name">{item.name}</span>
                            <span className="item-qty num">{quantityOf(item.name, item.label)}</span>
                          </label>
                          {item.notes.length > 0 || item.uncertain ? (
                            <span className="item-tags">
                              {item.uncertain ? (
                                <span className="badge badge--uncertain">
                                  <Icon name="alert" size={13} />
                                  要確認
                                </span>
                              ) : null}
                              {item.notes.map((n) => (
                                <span key={n} className={cls('badge', n.startsWith(FREEZE) ? 'badge--freeze' : 'badge--note')}>
                                  {n.startsWith(FREEZE) ? <Icon name="snow" size={13} /> : null}
                                  {n}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {item.forDates.length > 0 ? (
                            <span className="item-for num">{item.forDates.map(formatJa).join('・')}に使う</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          {current.pantry.length > 0 ? (
            <section className="pantry" aria-labelledby="pantry-title">
              <h3 className="aisle-title" id="pantry-title">
                家にあるか確認
              </h3>
              <p className="hint">調味料などの常備品です。切れていたら、いっしょに買ってください。</p>
              <ul className="pantry-list">
                {current.pantry.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {current.items.some((i) => i.uncertain) ? (
            <p className="hint">「要確認」は、銘柄で原材料が違う加工品です。買うときにパッケージの表示を確かめてください。</p>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
