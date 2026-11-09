// きめとく（仮）プロトタイプの画面。状態は localStorage（使えなくても動く）、日付は「翌日へ進む」で動かす。
// エンジンとマスタは src/engine/index.ts と src/data/index.ts からだけ使う。
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import type { Action, AppState, Catalog, Household, ISODate, OnboardingInput } from '../engine';
import {
  addDays,
  advanceDay,
  applyAction,
  buildShoppingLists,
  createInitialState,
  formatJa,
  handleUserText,
  parseMessage,
  weekStartOf,
  weekdayOf,
} from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import { AiReader } from './ai';
import type { AiMode, AiReading } from './ai';
import { adultsOf, firstLine, japanToday } from './lib';
import { clearStored, readStoredState, readUiPrefs, writeStoredState, writeUiPrefs } from './storage';
import { AboutPanel } from './components/AboutPanel';
import { HouseholdSheet } from './components/HouseholdSheet';
import type { HouseholdChange } from './components/HouseholdSheet';
import { Icon } from './components/Icon';
import { Onboarding } from './components/Onboarding';
import { ShoppingSheet } from './components/ShoppingSheet';
import { Talk } from './components/Talk';
import { WeekSheet } from './components/WeekSheet';

/** 画面の名前（ハッシュ）。ASCII だけ。claude.ai が使う名前（settings など）は使わない。 */
export type Route = 'talk' | 'week' | 'shopping' | 'household' | 'start';
export const ROUTES: readonly Route[] = ['talk', 'week', 'shopping', 'household', 'start'];

function readRoute(): Route {
  try {
    const h = window.location.hash.replace(/^#/, '');
    return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'talk';
  } catch {
    return 'talk';
  }
}

/** デモの家族ですぐ始まった状態。開始日は今日を含む週の月曜日。 */
export function demoState(catalog: Catalog, today: ISODate): AppState {
  return createInitialState(DEMO_ONBOARDING, catalog, weekStartOf(today));
}

/**
 * 作り直しのあとも残った、自分で替えた日・特売で替えた日（エンジンの regenerate_week は、まだ安全・旬なら残す）。
 * 知らせの文を、トークの返事「自分で替えた日（…）は、そのままです」とそろえるために使う。
 */
function keptChangedDays(before: AppState, after: AppState): ISODate[] {
  return before.meals
    .filter((m) => m.date >= before.today && m.status === 'planned' && (m.changedBy === 'user' || m.changedBy === 'sale'))
    .filter((m) => after.meals.some((n) => n.date === m.date && n.changedBy === m.changedBy && n.dishIds.join('|') === m.dishIds.join('|')))
    .map((m) => m.date);
}

/** その週に、作り直せる献立の日があるか（エンジンの regenerate_week と同じ考え方）。 */
function hasDaysToPlan(s: AppState, weekStart: ISODate): boolean {
  const todayMeal = s.meals.find((m) => m.date === s.today);
  const todayFixed = !!todayMeal && (todayMeal.status === 'cooked' || todayMeal.status === 'skipped');
  const from = weekStart > s.today ? weekStart : todayFixed ? addDays(s.today, 1) : s.today;
  const end = addDays(weekStart, 6);
  for (let d = from; d <= end; d = addDays(d, 1)) {
    if (s.household.settings.dinnerWeekdays.includes(weekdayOf(d))) return true;
  }
  return false;
}

export interface AppProps {
  catalog?: Catalog;
  /** 日本時間の今日（テストで差し替える）。 */
  todayFn?: () => ISODate;
  ai?: AiReader;
}

export function App(props: AppProps) {
  const [generation, setGeneration] = useState(0);
  return (
    <ErrorBoundary
      onReset={() => {
        clearStored();
        setGeneration((g) => g + 1);
      }}
    >
      <KimetokuApp key={generation} {...props} />
    </ErrorBoundary>
  );
}

function KimetokuApp({ catalog = defaultCatalog, todayFn = japanToday, ai: aiProp }: AppProps) {
  const aiRef = useRef<AiReader | null>(null);
  if (!aiRef.current) aiRef.current = aiProp ?? new AiReader();
  const ai = aiRef.current;
  const aiStatus = useSyncExternalStore(ai.subscribe, ai.getSnapshot, ai.getSnapshot);

  const [state, setState] = useState<AppState>(() => readStoredState() ?? demoState(catalog, todayFn()));
  const stateRef = useRef(state);
  const [initialPrefs] = useState(readUiPrefs);
  const [senders, setSenders] = useState<Record<string, string>>(() => initialPrefs.senders ?? {});
  const [senderPref, setSenderPref] = useState<string | undefined>(initialPrefs.sender);
  const [aiMode, setAiMode] = useState<AiMode>(initialPrefs.aiMode ?? 'auto');
  const [menuOpen, setMenuOpen] = useState<boolean>(initialPrefs.menuOpen ?? true);
  const [marks, setMarks] = useState<Record<string, 'ai' | 'rules'>>({});
  const [route, setRoute] = useState<Route>(readRoute);
  const [weekParam, setWeekParam] = useState<ISODate | null>(null);
  const [shoppingParam, setShoppingParam] = useState<ISODate | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const busyRef = useRef(false);
  const toastSeq = useRef(0);

  const adults = adultsOf(state.household.members);
  const senderId = adults.find((m) => m.id === senderPref)?.id ?? adults[0]?.id ?? '';
  const senderRef = useRef(senderId);
  senderRef.current = senderId;

  useEffect(() => {
    ai.start();
  }, [ai]);

  useEffect(() => {
    writeStoredState(state);
  }, [state]);

  useEffect(() => {
    const ids = new Set(state.chat.map((m) => m.id));
    const kept = Object.fromEntries(Object.entries(senders).filter(([id]) => ids.has(id)));
    writeUiPrefs({ sender: senderPref, aiMode, menuOpen, senders: kept });
  }, [state.chat, senders, senderPref, aiMode, menuOpen]);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const commit = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const showToast = useCallback((text: string) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text });
  }, []);

  const navigate = useCallback((r: Route) => {
    setRoute(r);
    setAboutOpen(false);
    try {
      if (window.location.hash !== `#${r}`) window.location.hash = r;
    } catch {
      // ハッシュを変えられなくても、画面は切り替える。
    }
  }, []);

  // Esc でシートや案内を閉じる（日本語入力の変換中の Esc は除く）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      if (aboutOpen) setAboutOpen(false);
      else if (route === 'week' || route === 'shopping' || route === 'household') navigate('talk');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** 新しく増えた利用者の発言に、送った人を記録する（画面だけの情報）。 */
  const recordSenders = (prev: AppState, next: AppState) => {
    const before = new Set(prev.chat.map((m) => m.id));
    const added = next.chat.filter((m) => m.from === 'user' && !before.has(m.id));
    if (added.length === 0) return;
    const who = senderRef.current;
    setSenders((s) => ({ ...s, ...Object.fromEntries(added.map((m) => [m.id, who])) }));
  };

  const runAction = (action: Action, opts: { toast?: boolean } = {}) => {
    const prev = stateRef.current;
    const r = applyAction(prev, catalog, action);
    recordSenders(prev, r.state);
    commit(r.state);
    if (opts.toast && r.replies[0]) showToast(firstLine(r.replies[0].text));
  };

  const sendText = async (body: string) => {
    const trimmed = body.trim();
    if (!trimmed || busyRef.current) return;
    const text = `@きめとく ${trimmed}`;
    const cur = stateRef.current;
    let reading: AiReading = { commands: null, source: 'rules' };
    if (ai.available && aiMode !== 'off') {
      const rules = parseMessage(text, { today: cur.today, members: cur.household.members, catalog });
      const onlyUnknown = rules.every((c) => c.type === 'unknown');
      // おまかせ：ルールで読めないときだけ AI（利用者の Claude の利用枠を使うので、呼ぶ回数を抑える）。
      if (aiMode === 'always' || onlyUnknown) {
        busyRef.current = true;
        setPendingText(trimmed);
        try {
          reading = await ai.read(trimmed, cur, catalog);
        } finally {
          busyRef.current = false;
          setPendingText(null);
        }
        if (reading.notice) showToast(reading.notice);
      }
    }
    const prev = stateRef.current;
    const r = handleUserText(prev, catalog, text, reading.commands ?? undefined);
    recordSenders(prev, r.state);
    const last = r.replies[r.replies.length - 1];
    if (last) setMarks((m) => ({ ...m, [last.id]: reading.source }));
    commit(r.state);
  };

  const advance = () => {
    const r = advanceDay(stateRef.current, catalog);
    commit(r.state);
    const pushed = r.replies.filter((m) => m.push).length;
    showToast(`${formatJa(r.state.today)}になりました。${pushed > 0 ? `配信が${pushed}件届きました。` : ''}`);
  };

  const changeHousehold = (next: Household, change: HouseholdChange) => {
    const prev = stateRef.current;
    let s: AppState = { ...prev, household: next };
    const removed = change.removedMemberIds ?? [];
    if (removed.length > 0) {
      s = {
        ...s,
        meals: s.meals.map((m) =>
          m.absentMemberIds.some((id) => removed.includes(id))
            ? { ...m, absentMemberIds: m.absentMemberIds.filter((id) => !removed.includes(id)) }
            : m,
        ),
      };
    }
    let regenerated = false;
    if (change.regenerate) {
      // 献立の曜日から外れた、これからの献立は消す（作り直しでは上書きされないため）。
      const dinner = new Set<number>(next.settings.dinnerWeekdays);
      s = {
        ...s,
        meals: s.meals.filter(
          (m) => m.date < s.today || dinner.has(weekdayOf(m.date)) || m.status === 'cooked' || m.status === 'skipped',
        ),
      };
      const thisWeek = weekStartOf(s.today);
      const nextWeek = addDays(thisWeek, 7);
      const weeks = [thisWeek, ...(s.meals.some((m) => weekStartOf(m.date) === nextWeek) ? [nextWeek] : [])];
      for (const w of weeks) {
        if (!hasDaysToPlan(s, w)) continue;
        s = applyAction(s, catalog, { type: 'regenerate_week', weekStart: w }).state;
        regenerated = true;
      }
      if (!regenerated) s = { ...s, shopping: buildShoppingLists(s, catalog) };
    }
    recordSenders(prev, s);
    commit(s);
    const kept = regenerated ? keptChangedDays(prev, s) : [];
    const keptText = kept.length > 0 ? `自分で替えた日（${kept.map(formatJa).join('・')}）は、そのままです。` : '';
    showToast(regenerated ? `${change.toast}献立も作り直しました。${keptText}` : change.toast);
  };

  const startWith = (input: OnboardingInput, today: ISODate, message: string) => {
    const s = createInitialState(input, catalog, today);
    setSenders({});
    setMarks({});
    setSenderPref(adultsOf(s.household.members)[0]?.id);
    commit(s);
    navigate('talk');
    showToast(message);
  };

  const startDemo = (message = 'デモの家族で始めました。') =>
    startWith(DEMO_ONBOARDING, weekStartOf(todayFn()), message);

  const setPlan = (plan: 'free' | 'paid') => {
    const h = stateRef.current.household;
    if (h.settings.plan === plan) return;
    changeHousehold(
      { ...h, settings: { ...h.settings, plan } },
      { regenerate: false, toast: plan === 'paid' ? '有料版にしました。翌日へ進むと、配信が届きます。' : '無料版にしました。' },
    );
  };

  const cardHandlers = {
    onOpenWeek: (ws: ISODate) => {
      setWeekParam(ws);
      navigate('week');
    },
    onOpenShopping: (date: ISODate) => {
      setShoppingParam(date);
      navigate('shopping');
    },
  };

  const sheetOpen = route === 'week' || route === 'shopping' || route === 'household';

  return (
    <div className="shell">
      <aside className="about-col" aria-labelledby="about-title">
        <AboutPanel aiStatus={aiStatus} onStartOver={() => navigate('start')} />
      </aside>
      <main className="phone" aria-label="きめとく（試作）">
        {route === 'start' ? (
          <Onboarding
            catalog={catalog}
            today={todayFn()}
            onStart={(input) => startWith(input, todayFn(), '設定しました。献立はトークに届いています。')}
            onDemo={() => startDemo()}
            onCancel={() => navigate('talk')}
          />
        ) : (
          <>
            <DemoBar
              today={state.today}
              plan={state.household.settings.plan}
              onAdvance={advance}
              onPlanChange={setPlan}
              onHelp={() => setAboutOpen(true)}
            />
            <div className="app">
              <div className="talk-layer" inert={sheetOpen || aboutOpen}>
                <Talk
                  state={state}
                  catalog={catalog}
                  marks={marks}
                  senders={senders}
                  senderId={senderId}
                  adults={adults}
                  onSenderChange={setSenderPref}
                  busy={pendingText !== null}
                  pendingText={pendingText}
                  aiStatus={aiStatus}
                  onSend={(t) => void sendText(t)}
                  onAction={(a) => runAction(a)}
                  cardHandlers={cardHandlers}
                  onMenuWeek={() => {
                    setWeekParam(null);
                    navigate('week');
                  }}
                  onMenuToday={() => runAction({ type: 'open_today' })}
                  onMenuShopping={() => {
                    setShoppingParam(null);
                    navigate('shopping');
                  }}
                  onMenuHousehold={() => navigate('household')}
                  menuOpen={menuOpen}
                  onMenuToggle={() => setMenuOpen((o) => !o)}
                  visible={!sheetOpen}
                />
              </div>
              {route === 'week' ? (
                <WeekSheet
                  state={state}
                  catalog={catalog}
                  weekStart={weekParam}
                  onWeekChange={setWeekParam}
                  onAction={(a) => runAction(a, { toast: true })}
                  onBack={() => navigate('talk')}
                />
              ) : null}
              {route === 'shopping' ? (
                <ShoppingSheet
                  state={state}
                  catalog={catalog}
                  date={shoppingParam}
                  onDateChange={setShoppingParam}
                  onAction={(a) => runAction(a)}
                  onBack={() => navigate('talk')}
                  onToast={showToast}
                />
              ) : null}
              {route === 'household' ? (
                <HouseholdSheet
                  state={state}
                  catalog={catalog}
                  aiMode={aiMode}
                  aiStatus={aiStatus}
                  onAiModeChange={(mode) => {
                    setAiMode(mode);
                    showToast(mode === 'off' ? 'AI を使わずに読み取ります。' : mode === 'always' ? 'いつも AI に読み取りを頼みます。' : 'ルールで読めないときだけ AI に頼みます。');
                  }}
                  onHouseholdChange={changeHousehold}
                  onImport={(s) => {
                    setSenders({});
                    setMarks({});
                    commit(s);
                    navigate('talk');
                    showToast('読み込みました。');
                  }}
                  onReset={() => {
                    clearStored();
                    startDemo('リセットしました。デモの家族で始めています。');
                  }}
                  onStartOver={() => navigate('start')}
                  onBack={() => navigate('talk')}
                  onToast={showToast}
                />
              ) : null}
              {aboutOpen ? (
                <div className="about-overlay" role="dialog" aria-modal="true" aria-labelledby="about-overlay-title">
                  <AboutPanel aiStatus={aiStatus} onStartOver={() => navigate('start')} onClose={() => setAboutOpen(false)} />
                </div>
              ) : null}
              <div className="toast-region" role="status" aria-live="polite">
                {toast ? (
                  <div className="toast" key={toast.id}>
                    {toast.text}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function DemoBar({
  today,
  plan,
  onAdvance,
  onPlanChange,
  onHelp,
}: {
  today: ISODate;
  plan: 'free' | 'paid';
  onAdvance: () => void;
  onPlanChange: (plan: 'free' | 'paid') => void;
  onHelp: () => void;
}) {
  return (
    <div className="demo-bar" role="region" aria-label="デモの操作">
      <p className="demo-today">
        <span className="demo-label">今日（デモ）</span>
        <strong className="demo-date num" data-testid="demo-today">
          {formatJa(today)}
        </strong>
      </p>
      <button type="button" className="btn btn--small btn--demo" onClick={onAdvance}>
        翌日へ進む
        <Icon name="next" size={16} />
      </button>
      <div className="seg seg--small" role="group" aria-label="プラン（デモ）">
        <button type="button" className="seg-btn" aria-pressed={plan === 'free'} onClick={() => onPlanChange('free')}>
          無料
        </button>
        <button type="button" className="seg-btn" aria-pressed={plan === 'paid'} onClick={() => onPlanChange('paid')}>
          有料
        </button>
      </div>
      <button type="button" className="icon-btn about-toggle" aria-label="このプロトタイプについて" onClick={onHelp}>
        <Icon name="help" size={22} />
      </button>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('きめとく：画面の表示に失敗しました', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="shell">
        <main className="phone">
          <div className="crash" role="alert">
            <h1 className="ob-title">表示できませんでした</h1>
            <p>保存されていた状態を読み込めなかったようです。デモの家族で始め直せます。</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                this.props.onReset();
                this.setState({ failed: false });
              }}
            >
              デモの家族で始め直す
            </button>
          </div>
        </main>
      </div>
    );
  }
}
