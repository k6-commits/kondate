// 家族と設定。いちばん上に注意（householdNotices）を必ず出す。
import { useEffect, useRef, useState } from 'react';
import type { AppState, Catalog, Household, HouseholdSettings, Member } from '../../engine';
import { householdNotices } from '../../engine';
import type { AiMode, AiStatus } from '../ai';
import { AI_MODES } from '../ai';
import { SIDE_POLICY, cls, nextMemberId, normalizeForSearch } from '../lib';
import { parseImportedState } from '../storage';
import type { MemberDraft } from './Forms';
import { MemberEditor, PlanPicker, Segmented, WeekdayPicker, exclusionSummary, memberLine } from './Forms';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export interface HouseholdChange {
  regenerate: boolean;
  toast: string;
  removedMemberIds?: string[];
}

const MAX_MEMBERS = 6;

export function aiStatusText(status: AiStatus): string {
  switch (status) {
    case 'checking':
      return 'AI が使えるか確かめています。そのあいだはルールで読み取ります。';
    case 'claude':
      return 'この画面では、Claude に読み取りを頼めます（あなたの Claude の利用枠を使います）。';
    case 'server':
      return '開発用のサーバーに読み取りを頼みます。';
    case 'blocked':
      return 'この画面では AI を使えません。ルールだけで読み取ります。';
    default:
      return 'AI につながっていないため、ルールだけで読み取ります。';
  }
}

export function NoticeList({ household }: { household: Household }) {
  const notices = householdNotices(household);
  return (
    <ul className="notices">
      {notices.map((n) => (
        <li key={n.text} className={cls('notice-item', n.level === 'warning' && 'is-warning')}>
          {n.level === 'warning' ? (
            <span className="warn-label">
              <Icon name="alert" size={15} />
              注意
            </span>
          ) : (
            <span className="info-label">お知らせ</span>
          )}
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}

function toDraft(m: Member): MemberDraft {
  return { nickname: m.nickname, ageBand: m.ageBand, role: m.role, exclusions: m.exclusions };
}

export function HouseholdSheet({
  state,
  catalog,
  aiMode,
  aiStatus,
  onAiModeChange,
  onHouseholdChange,
  onImport,
  onReset,
  onStartOver,
  onBack,
  onToast,
}: {
  state: AppState;
  catalog: Catalog;
  aiMode: AiMode;
  aiStatus: AiStatus;
  onAiModeChange: (mode: AiMode) => void;
  onHouseholdChange: (next: Household, change: HouseholdChange) => void;
  onImport: (state: AppState) => void;
  onReset: () => void;
  onStartOver: () => void;
  onBack: () => void;
  onToast: (text: string) => void;
}) {
  const h = state.household;
  const settings = h.settings;
  const [editing, setEditing] = useState<{ id: string | null; draft: MemberDraft } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const setSettings = (patch: Partial<HouseholdSettings>, change: HouseholdChange) =>
    onHouseholdChange({ ...h, settings: { ...settings, ...patch } }, change);
  const regen = (toast: string): HouseholdChange => ({ regenerate: true, toast });

  const saveMember = () => {
    if (!editing) return;
    const nickname = editing.draft.nickname.trim();
    if (!nickname) {
      setEditError('ニックネームを入れてください。');
      return;
    }
    const clash = h.members.some((m) => m.id !== editing.id && normalizeForSearch(m.nickname) === normalizeForSearch(nickname));
    if (clash) {
      setEditError('同じニックネームの家族がいます。別の名前にしてください。');
      return;
    }
    const member: Member = {
      id: editing.id ?? nextMemberId(h.members),
      nickname,
      ageBand: editing.draft.ageBand,
      ...(editing.draft.role ? { role: editing.draft.role } : {}),
      exclusions: editing.draft.exclusions,
    };
    const members = editing.id ? h.members.map((m) => (m.id === editing.id ? member : m)) : [...h.members, member];
    setEditing(null);
    setEditError(null);
    onHouseholdChange({ ...h, members }, regen(editing.id ? `${nickname}を直しました。` : `${nickname}を加えました。`));
  };

  const deleteMember = (id: string) => {
    const name = h.members.find((m) => m.id === id)?.nickname ?? '';
    setConfirmDelete(null);
    onHouseholdChange(
      { ...h, members: h.members.filter((m) => m.id !== id) },
      { regenerate: true, toast: `${name}を家族から外しました。`, removedMemberIds: [id] },
    );
  };

  return (
    <Sheet id="household" title="家族と設定" onBack={onBack}>
      <section className="block" aria-labelledby="notices-title">
        <h3 className="block-title" id="notices-title">
          大切なお知らせ
        </h3>
        <NoticeList household={h} />
      </section>

      <section className="block" aria-labelledby="family-title">
        <h3 className="block-title" id="family-title">
          家族
          <span className="block-count num">
            {h.members.length}人（最大{MAX_MEMBERS}人）
          </span>
        </h3>
        <ul className="members">
          {h.members.map((m) =>
            editing?.id === m.id ? (
              <li key={m.id} className="member-card is-editing">
                <MemberEditor idPrefix={`edit-${m.id}`} value={editing.draft} onChange={(draft) => setEditing({ id: m.id, draft })} catalog={catalog} />
                {editError ? <p className="form-error" role="alert">{editError}</p> : null}
                <div className="row-actions">
                  <button type="button" className="btn btn--primary" onClick={saveMember}>
                    保存する
                  </button>
                  <button type="button" className="btn" onClick={() => { setEditing(null); setEditError(null); }}>
                    やめる
                  </button>
                </div>
              </li>
            ) : (
              <li key={m.id} className="member-card">
                <div className="member-main">
                  <span className="member-name">{m.nickname}</span>
                  <span className="member-sub">{memberLine(m)}</span>
                  <span className="member-ex">{exclusionSummary(m.exclusions, catalog)}</span>
                </div>
                {confirmDelete === m.id ? (
                  <div className="confirm" role="group" aria-label={`${m.nickname}を外すかの確認`}>
                    <p>{m.nickname}を家族から外しますか？</p>
                    <div className="row-actions">
                      <button type="button" className="btn btn--danger" onClick={() => deleteMember(m.id)}>
                        外す
                      </button>
                      <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                        やめる
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={!!editing}
                      onClick={() => {
                        setEditing({ id: m.id, draft: toDraft(m) });
                        setEditError(null);
                      }}
                    >
                      <Icon name="edit" size={16} />
                      直す
                    </button>
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={h.members.length <= 1 || !!editing}
                      onClick={() => setConfirmDelete(m.id)}
                    >
                      <Icon name="trash" size={16} />
                      外す
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
          {editing && editing.id === null ? (
            <li className="member-card is-editing">
              <MemberEditor idPrefix="edit-new" value={editing.draft} onChange={(draft) => setEditing({ id: null, draft })} catalog={catalog} />
              {editError ? <p className="form-error" role="alert">{editError}</p> : null}
              <div className="row-actions">
                <button type="button" className="btn btn--primary" onClick={saveMember}>
                  加える
                </button>
                <button type="button" className="btn" onClick={() => { setEditing(null); setEditError(null); }}>
                  やめる
                </button>
              </div>
            </li>
          ) : null}
        </ul>
        {!editing ? (
          <button
            type="button"
            className="btn"
            disabled={h.members.length >= MAX_MEMBERS}
            onClick={() => setEditing({ id: null, draft: { nickname: '', ageBand: 'adult', role: 'other', exclusions: [] } })}
          >
            <Icon name="plus" size={18} />
            家族を加える
          </button>
        ) : null}
      </section>

      <section className="block" aria-labelledby="days-title">
        <h3 className="block-title" id="days-title">
          献立の曜日
        </h3>
        <WeekdayPicker
          label="献立を作る曜日"
          value={settings.dinnerWeekdays}
          onChange={(dinnerWeekdays) => setSettings({ dinnerWeekdays }, regen('献立の曜日を変えました。'))}
        />
        <h3 className="block-title" id="shop-title">
          買い物の曜日
        </h3>
        <WeekdayPicker
          label="買い物の曜日"
          value={settings.shoppingWeekdays}
          onChange={(shoppingWeekdays) => setSettings({ shoppingWeekdays }, regen('買い物の曜日を変えました。'))}
        />
      </section>

      <section className="block" aria-labelledby="plan-rule-title">
        <h3 className="block-title" id="plan-rule-title">
          献立の決め方
        </h3>
        <div className="setting-row">
          <div>
            <p className="setting-name">ラク日の数（1週間）</p>
            <p className="field-note">冷凍食品や惣菜で済ませる日です。</p>
          </div>
          <Segmented
            label="ラク日の数"
            options={[0, 1, 2].map((n) => ({ value: n, label: `${n}日` }))}
            value={settings.rakuPerWeek}
            onChange={(rakuPerWeek) => setSettings({ rakuPerWeek }, regen(`ラク日を週${rakuPerWeek}日にしました。`))}
          />
        </div>
        <div className="setting-row">
          <div>
            <p className="setting-name">新しい料理の数（1週間）</p>
            <p className="field-note">定番にない料理を混ぜる数です。</p>
          </div>
          <Segmented
            label="新しい料理の数"
            options={[0, 1, 2].map((n) => ({ value: n, label: `${n}品` }))}
            value={settings.newPerWeek}
            onChange={(newPerWeek) => setSettings({ newPerWeek }, regen(`新しい料理を週${newPerWeek}品にしました。`))}
          />
        </div>
        <fieldset className="field">
          <legend className="setting-name">副菜の方針</legend>
          <div className="radio-list">
            {SIDE_POLICY.map((p) => (
              <label key={p.id} className={cls('radio-card', settings.sidePolicy === p.id && 'is-on')}>
                <input
                  type="radio"
                  name="side-policy"
                  checked={settings.sidePolicy === p.id}
                  onChange={() => setSettings({ sidePolicy: p.id }, regen(`副菜の方針を「${p.label}」にしました。`))}
                />
                <span>
                  <span className="radio-title">{p.label}</span>
                  <span className="field-note">{p.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="toggle-row">
          <input
            id="allow-uncertain"
            type="checkbox"
            checked={settings.allowUncertainWithExclusions}
            onChange={(e) =>
              setSettings(
                { allowUncertainWithExclusions: e.target.checked },
                regen(e.target.checked ? '「要確認」の料理も出すようにしました。' : '「要確認」の料理は出さないようにしました。'),
              )
            }
          />
          <label htmlFor="allow-uncertain">
            <span className="setting-name">要確認の料理も出す</span>
            <span className="field-note">
              除外のある家族で、市販のルウ・冷凍食品・惣菜など、銘柄で原材料が変わる物を使う料理も献立に出します。出すときは「要確認」の注意を付けるので、パッケージの表示を必ず確かめてください。ふだんはオフにしておくのがおすすめです。
            </span>
          </label>
        </div>
      </section>

      <section className="block" aria-labelledby="plan-title">
        <h3 className="block-title" id="plan-title">
          プラン
        </h3>
        <p className="field-note">試作なので、本物の課金はありません。有料の動きを試せます。</p>
        <PlanPicker
          name="settings-plan"
          value={settings.plan}
          onChange={(plan) =>
            setSettings(
              { plan },
              { regenerate: false, toast: plan === 'paid' ? '有料版にしました。翌日へ進むと、配信が届きます。' : '無料版にしました。' },
            )
          }
        />
      </section>

      <section className="block" aria-labelledby="ai-title">
        <h3 className="block-title" id="ai-title">
          AIの読み取り
        </h3>
        <p className={cls('ai-status', (aiStatus === 'blocked' || aiStatus === 'none') && 'is-off')} data-testid="ai-status">
          {aiStatusText(aiStatus)}
        </p>
        <div className="radio-list">
          {AI_MODES.map((m) => (
            <label key={m.id} className={cls('radio-card', aiMode === m.id && 'is-on')}>
              <input type="radio" name="ai-mode" checked={aiMode === m.id} onChange={() => onAiModeChange(m.id)} />
              <span>
                <span className="radio-title">{m.label}</span>
                <span className="field-note">{m.note}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="field-note">AI には家族の名前を送らず、「member_1」のような番号に置き換えます。</p>
      </section>

      <DataTools state={state} onImport={onImport} onReset={onReset} onStartOver={onStartOver} onToast={onToast} />
    </Sheet>
  );
}

function DataTools({
  state,
  onImport,
  onReset,
  onStartOver,
  onToast,
}: {
  state: AppState;
  onImport: (state: AppState) => void;
  onReset: () => void;
  onStartOver: () => void;
  onToast: (text: string) => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState(false);
  const exportRef = useRef<HTMLTextAreaElement>(null);
  const exportText = exportOpen ? JSON.stringify(state, null, 2) : '';

  useEffect(() => {
    if (copyFailed && exportRef.current) {
      exportRef.current.focus();
      exportRef.current.select();
    }
  }, [copyFailed]);

  const copy = () => {
    const fail = () => setCopyFailed(true);
    try {
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!clip || typeof clip.writeText !== 'function') {
        fail();
        return;
      }
      clip.writeText(exportText).then(() => {
        setCopyFailed(false);
        onToast('書き出したデータをコピーしました');
      }, fail);
    } catch {
      fail();
    }
  };

  return (
    <section className="block" aria-labelledby="data-title">
      <h3 className="block-title" id="data-title">
        データ
      </h3>
      <p className="field-note">状態は、このブラウザの中だけに保存しています。ほかの人や端末には届きません。</p>

      <div className="data-tool">
        <p className="setting-name">書き出し</p>
        {exportOpen ? (
          <>
            <label className="sr-only" htmlFor="export-text">
              書き出したデータ（JSON）
            </label>
            <textarea id="export-text" ref={exportRef} className="code-area" readOnly rows={6} value={exportText} />
            {copyFailed ? <p className="hint">コピーできませんでした。テキストを選択してコピーしてください。</p> : null}
            <div className="row-actions">
              <button type="button" className="btn btn--small" onClick={copy}>
                <Icon name="copy" size={16} />
                コピー
              </button>
              <button type="button" className="btn btn--small" onClick={() => { setExportOpen(false); setCopyFailed(false); }}>
                閉じる
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn btn--small" onClick={() => setExportOpen(true)}>
            書き出す（JSON）
          </button>
        )}
      </div>

      <div className="data-tool">
        <label className="setting-name" htmlFor="import-text">
          読み込み
        </label>
        <textarea
          id="import-text"
          className="code-area"
          rows={4}
          placeholder="書き出したテキストを貼り付けてください"
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setImportError(null);
          }}
        />
        {importError ? (
          <p className="form-error" role="alert">
            {importError}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            const r = parseImportedState(importText);
            if (!r.ok) {
              setImportError(r.error);
              return;
            }
            setImportText('');
            setImportError(null);
            onImport(r.state);
          }}
        >
          読み込む
        </button>
      </div>

      <div className="data-tool">
        <p className="setting-name">やり直す</p>
        <div className="row-actions">
          <button type="button" className="btn btn--small" onClick={onStartOver}>
            はじめから設定する
          </button>
          {!resetStep ? (
            <button type="button" className="btn btn--small" onClick={() => setResetStep(true)}>
              リセット
            </button>
          ) : null}
        </div>
        {resetStep ? (
          <div className="confirm" role="group" aria-label="リセットの確認">
            <p>保存した内容を消して、デモの家族で始め直します。元には戻せません。</p>
            <div className="row-actions">
              <button type="button" className="btn btn--danger" onClick={() => { setResetStep(false); onReset(); }}>
                本当にリセットする
              </button>
              <button type="button" className="btn" onClick={() => setResetStep(false)}>
                やめる
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
