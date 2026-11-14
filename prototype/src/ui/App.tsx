// きめとく（仮）プロトタイプの画面。状態は localStorage（使えなくても動く）。日付は［翌日へ進む］で動かす（デモ）か、
// 試用モード（本物の日付で進める）では、日本時間の今日に合わせて進める（開いたとき・画面に戻ったとき・1分ごと）。
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
  weekStartOf,
  weekdayOf,
} from '../engine';
import { DEMO_ONBOARDING, defaultCatalog } from '../data';
import { AiReader, prepareAiCommands, readableByRules } from './ai';
import type { AiMode, AiReading } from './ai';
import {
  CATCH_UP_INTERVAL_MS,
  adultsOf,
  catchUpText,
  catchUpTo,
  clockAheadText,
  cls,
  firstLine,
  formerSender,
  japanToday,
  nobodyEats,
  nobodyEatsOn,
  planToast,
  pushedText,
} from './lib';
import { STORAGE_KEY, clearStored, parseStoredState, readStoredRaw, readUiPrefs, writeStoredState, writeUiPrefs } from './storage';
import type { ClockMode } from './storage';
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

/** このブラウザに記録を保存できないときの知らせ（本物の日付で試しているときに、一度だけ）。 */
export const SAVE_FAILED_TOAST = 'このブラウザには保存できません。ページを閉じると、家族と記録が消えます。';

/** 案内を左に常に出す広い画面（styles.css の @media (min-width: 900px) と同じ幅）。 */
export const WIDE_QUERY = '(min-width: 900px)';

function wideMedia(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY) : null;
  } catch {
    return null;
  }
}

function subscribeWide(onChange: () => void): () => void {
  const mq = wideMedia();
  if (!mq) return () => {};
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }
  // 古いブラウザは addListener だけを持つ。
  mq.addListener?.(onChange);
  return () => mq.removeListener?.(onChange);
}

const isWide = (): boolean => wideMedia()?.matches ?? false;

/** 広い画面か。幅が変わると描き直す（matchMedia がない環境では false）。 */
function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, isWide, () => false);
}

const isSheet = (r: Route): boolean => r === 'week' || r === 'shopping' || r === 'household';

/** 今フォーカスのある要素（なければ null）。シートや案内を閉じたときに、ここへ戻す。 */
function focusedElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}

/** 画面に出ているか（display: none の中や hidden でない）。CSS のない環境（テスト）では、出ている扱い。 */
function isShown(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (n.hidden) return false;
    try {
      if (window.getComputedStyle(n).display === 'none') return false;
    } catch {
      // 調べられなければ、出ている扱い。
    }
  }
  return true;
}

/** フォーカスを移せる要素か（ページの中にあり、inert の中になく、画面に出ている）。 */
function focusable(e: Element | null): e is HTMLElement {
  return e instanceof HTMLElement && e.isConnected && !e.closest('[inert]') && isShown(e);
}

/** 今フォーカスが、使える要素にあるか（BODY や、隠れた・inert の要素にあるときは false）。 */
function hasUsableFocus(): boolean {
  const now = document.activeElement;
  return !!now && now !== document.body && focusable(now);
}

/**
 * シートや案内を閉じたあと、開いたときのボタンにフォーカスを戻す。そのボタンがもうない・隠れているときは、fallbacks の
 * 最初に使える要素へ。ほかの要素にフォーカスがあるとき（閉じる前に別の所を押した）は動かさない。
 */
function restoreFocus(ref: { current: HTMLElement | null }, fallbacks: string[]): void {
  const el = ref.current;
  ref.current = null;
  if (typeof document === 'undefined' || hasUsableFocus()) return;
  const target = [el, ...fallbacks.map((s) => document.querySelector<HTMLElement>(s))].find(focusable);
  target?.focus();
}

/** 広い画面で左に出る案内の見出し（tabindex=-1）。幅が広がって重ねた案内が閉じたら、ここへフォーカスを移す。 */
const ABOUT_COL_HEADING = '.about-col .about-title';

/** 広い画面で出ない所（styles.css・shell.css の @media (min-width: 900px) と、幅が広がると閉じる重ねた案内）。 */
const HIDDEN_WHEN_WIDE = '.about-toggle, .demo-hint, .about-overlay';

/** 狭い画面で出ない所（左の案内）。 */
const HIDDEN_WHEN_NARROW = '.about-col';

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

/**
 * 家族の変更で作り直した日（keepSafe の作り直しのあと、料理が変わった、今日以降の日）。
 * raku は、家族が決めたラク日（今日は無理・自分で選んだラク日）のまま料理だけを替えた日（エンジンの rakuRedone）。
 */
function redoneDays(before: AppState, after: AppState): { redone: ISODate[]; raku: ISODate[] } {
  const changed = after.meals
    .filter((m) => m.date >= after.today && m.status === 'planned')
    .filter((m) => {
      const old = before.meals.find((b) => b.date === m.date);
      return !old || old.dishIds.join('|') !== m.dishIds.join('|');
    });
  const userRaku = (m: { kind: string; changedBy?: string } | undefined) => !!m && m.kind === 'raku' && m.changedBy === 'user';
  const isRaku = (m: (typeof changed)[number]) => userRaku(m) && userRaku(before.meals.find((b) => b.date === m.date));
  return { redone: changed.filter((m) => !isRaku(m)).map((m) => m.date), raku: changed.filter(isRaku).map((m) => m.date) };
}

/**
 * 家族の変更の知らせの続き。トークの返事（エンジンの regenerate_week の keepSafe）の1行目と同じ言い方にする：
 * 「11/11(水)は、家族の変更に合わせて作り直しました。11/9(月)は、ラク日のまま料理を替えました。ほかの日は、そのままです。」
 * 週が2つ作り直されたときは、日をまとめて1つの文にする。
 */
function familyRedoText(redone: ISODate[], raku: ISODate[]): string {
  if (redone.length === 0 && raku.length === 0) return '家族の変更に当たる料理はないので、献立はそのままです。人数と買い物リストは直しました。';
  const a = redone.length > 0 ? `${redone.map(formatJa).join('・')}は、家族の変更に合わせて作り直しました。` : '';
  const b = raku.length > 0 ? `${raku.map(formatJa).join('・')}は、ラク日のまま料理を替えました。` : '';
  return `${a}${b}ほかの日は、そのままです。`;
}

/**
 * その週に、作り直せる献立の日があるか（エンジンの regenerate_week と同じ考え方）。
 * みんな外で食べる日（家で食べる人がいない日）は、エンジンが作り直さずに残すので数えない
 * （その日しか残っていなければ、作り直さずに買い物リストだけを直す）。
 */
function hasDaysToPlan(s: AppState, weekStart: ISODate): boolean {
  const todayMeal = s.meals.find((m) => m.date === s.today);
  const todayFixed = !!todayMeal && (todayMeal.status === 'cooked' || todayMeal.status === 'skipped');
  const from = weekStart > s.today ? weekStart : todayFixed ? addDays(s.today, 1) : s.today;
  const end = addDays(weekStart, 6);
  for (let d = from; d <= end; d = addDays(d, 1)) {
    if (s.household.settings.dinnerWeekdays.includes(weekdayOf(d)) && !nobodyEatsOn(s, d)) return true;
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

  const [initial] = useState(() => {
    const raw = readStoredRaw();
    const stored = parseStoredState(raw);
    const prefs = readUiPrefs();
    // 本物の日付で進めるのは、保存した記録から再開するときだけ（記録がなくデモで始めるときは、［翌日へ進む］のデモ）。
    const clock: ClockMode = stored && prefs.clock === 'calendar' ? 'calendar' : 'demo';
    return { state: stored ?? demoState(catalog, todayFn()), prefs, clock, raw: stored ? raw : null };
  });
  const [state, setState] = useState<AppState>(initial.state);
  const stateRef = useRef(state);
  /**
   * このタブが最後に読んだ・保存した記録の文字列。保存されている文字列がこれと違えば、同じページを開いたほかのタブが
   * あとから保存したということ（adoptStored で読み直す）。
   */
  const savedRaw = useRef<string | null>(initial.raw);
  const initialPrefs = initial.prefs;
  /** 日付の進め方。ref は、イベント（画面に戻った・1分ごと）の中で今の値を読むため（setClock で両方を変える）。 */
  const [clock, setClockState] = useState<ClockMode>(initial.clock);
  const clockRef = useRef<ClockMode>(initial.clock);
  const [senders, setSenders] = useState<Record<string, string>>(() => initialPrefs.senders ?? {});
  const [senderPref, setSenderPref] = useState<string | undefined>(initialPrefs.sender);
  const [aiMode, setAiMode] = useState<AiMode>(initialPrefs.aiMode ?? 'auto');
  const [menuOpen, setMenuOpen] = useState<boolean>(initialPrefs.menuOpen ?? true);
  /** 案内（このプロトタイプについて）を一度でも開いたか。まだなら、スマホ幅でデモの操作に「試し方を見る」を出す。 */
  const [aboutSeen, setAboutSeen] = useState<boolean>(initialPrefs.aboutSeen ?? false);
  const [marks, setMarks] = useState<Record<string, 'ai' | 'rules'>>({});
  const [route, setRoute] = useState<Route>(readRoute);
  const [weekParam, setWeekParam] = useState<ISODate | null>(null);
  const [shoppingParam, setShoppingParam] = useState<ISODate | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const busyRef = useRef(false);
  const toastSeq = useRef(0);
  /** 家族や記録を丸ごと入れ替えた回数（はじめからの設定・リセット・読み込み・家族を外す）。読み取り中に変わったら、その結果は使わない。 */
  const epochRef = useRef(0);
  const routeRef = useRef(route);
  routeRef.current = route;
  const sheetReturn = useRef<HTMLElement | null>(null);
  const aboutReturn = useRef<HTMLElement | null>(null);

  // 広い画面では案内が左に出ているので、重ねて開く案内は出さない（開いたまま幅が広がったら閉じる）。
  const wide = useWide();
  const aboutVisible = aboutOpen && !wide;
  useEffect(() => {
    if (!wide) return;
    setAboutOpen(false);
    setAboutSeen(true);
  }, [wide]);

  const adults = adultsOf(state.household.members);
  const senderId = adults.find((m) => m.id === senderPref)?.id ?? adults[0]?.id ?? '';
  const senderRef = useRef(senderId);
  senderRef.current = senderId;

  useEffect(() => {
    ai.start();
  }, [ai]);

  /** 記録をこのブラウザに保存できなかったか（サイトのデータを止めている・プライベートブラウズ など）。 */
  const [saveFailed, setSaveFailed] = useState(false);
  const saveWarned = useRef(false);
  useEffect(() => {
    const ok = writeStoredState(state);
    savedRaw.current = readStoredRaw();
    setSaveFailed(!ok);
    // 本物の日付で試している家族には、一度だけ知らせる（ページを閉じると、1週間の家族と記録が消えるため）。
    if (!ok && clockRef.current === 'calendar' && !saveWarned.current) {
      saveWarned.current = true;
      showToast(SAVE_FAILED_TOAST);
    }
  }, [state]);

  useEffect(() => {
    const ids = new Set(state.chat.map((m) => m.id));
    const kept = Object.fromEntries(Object.entries(senders).filter(([id]) => ids.has(id)));
    writeUiPrefs({ sender: senderPref, aiMode, menuOpen, senders: kept, aboutSeen, clock });
  }, [state.chat, senders, senderPref, aiMode, menuOpen, aboutSeen, clock]);

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

  const setClock = useCallback((next: ClockMode) => {
    clockRef.current = next;
    setClockState(next);
  }, []);

  /** AI の読み取り中で、追いつくのを見送ったか（読み取りが終わったら、すぐにもう一度試す）。 */
  const catchUpLater = useRef(false);

  /**
   * 試用モード（本物の日付で進める）で、記録の日付が日本時間の今日より前なら、今日まで1日ずつ進める（まとめて1回だけ保存する）。
   * AI の読み取り中は進めない（「明日」などを、送ったときの日付で読んでいるため）。読み取りが終わったら、もう一度試す。
   * 記録の日付が今日より先なら、何もしない（日付は戻さない）。lead は、知らせの前に付ける文（切り替え・読み込みのとき）。
   */
  const catchUp = (lead = ''): void => {
    if (clockRef.current !== 'calendar') return;
    if (busyRef.current) {
      catchUpLater.current = true;
      if (lead) showToast(lead);
      return;
    }
    const r = catchUpTo(stateRef.current, catalog, todayFn());
    if (!r) {
      if (lead) showToast(lead);
      return;
    }
    commit(r.state);
    showToast(`${lead}${catchUpText({ days: r.days, pushed: r.pushed, today: r.state.today })}`);
  };
  const catchUpRef = useRef(catchUp);
  catchUpRef.current = catchUp;

  /**
   * 同じページを開いたほかのタブ（LINE のリンクから開き直した、など）が、あとから記録を保存していたら、それを読み直す。
   * 読み直さないと、古いタブが日付を進めるとき（画面に戻った・1分ごと）に古い記録で上書きして、ほかのタブで答えた記録が消える。
   * 日付の進め方と、送った人の覚え書きも、ほかのタブが保存したものにそろえる。読み取り中の AI の結果は使わない（epoch）。
   * 読み直したら true。
   */
  const adoptStored = (): boolean => {
    const raw = readStoredRaw();
    if (raw === null || raw === savedRaw.current) return false;
    const next = parseStoredState(raw);
    if (!next) return false;
    savedRaw.current = raw;
    epochRef.current += 1;
    const prefs = readUiPrefs();
    if (prefs.clock) setClock(prefs.clock);
    if (prefs.senders) setSenders((cur) => ({ ...cur, ...prefs.senders }));
    // 「AIで読み取り」の印は、同じ id で同じ文のメッセージにだけ残す（ほかのタブで始め直すと、id がまた1から振られる）。
    const before = new Map(stateRef.current.chat.map((m) => [m.id, m.text]));
    const same = new Set(next.chat.filter((m) => before.get(m.id) === m.text).map((m) => m.id));
    setMarks((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => same.has(id))));
    commit(next);
    return true;
  };
  const adoptRef = useRef(adoptStored);
  adoptRef.current = adoptStored;

  // 開いたとき・画面に戻ったとき（別のアプリやタブから）・ウィンドウに戻ったとき・1分ごとに、本物の日付に追いつく
  // （ほかのタブが保存した記録があれば、先に読み直す）。
  useEffect(() => {
    const run = () => {
      adoptRef.current();
      catchUpRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') run();
    };
    // ほかのタブが保存した（このタブが開いたままでも届く）。localStorage.clear() のときは key が null。
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', run);
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(run, CATCH_UP_INTERVAL_MS);
    run();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', run);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, []);

  const navigate = useCallback((r: Route) => {
    // トークからシートを開くときは、押したボタンを覚えておき、閉じたらそこへフォーカスを戻す。
    if (isSheet(r) && !isSheet(routeRef.current)) sheetReturn.current = focusedElement();
    setRoute(r);
    setAboutOpen(false);
    try {
      if (window.location.hash !== `#${r}`) window.location.hash = r;
    } catch {
      // ハッシュを変えられなくても、画面は切り替える。
    }
  }, []);

  const openAbout = () => {
    // 広い画面では案内が左に出ているので、重ねて開かない（「?」も出ていない）。
    if (wide) return;
    aboutReturn.current = focusedElement();
    setAboutOpen(true);
    setAboutSeen(true);
  };

  const sheetOpen = isSheet(route);

  // シートや案内を閉じたら、開いたときのボタンにフォーカスを戻す（キーボードで続けて操作できるように）。
  const prevSheetOpen = useRef(sheetOpen);
  useEffect(() => {
    const was = prevSheetOpen.current;
    prevSheetOpen.current = sheetOpen;
    if (was && !sheetOpen && route === 'talk') restoreFocus(sheetReturn, ['.talk-layer .menu-toggle']);
  }, [sheetOpen, route]);
  const prevAboutVisible = useRef(aboutVisible);
  useEffect(() => {
    const was = prevAboutVisible.current;
    prevAboutVisible.current = aboutVisible;
    if (!was || aboutVisible || route === 'start') return;
    // 幅が広がって閉じたときは、開いたボタン（「?」「試し方を見る」）は出ていないので、左に出た案内の見出しへ移す。
    if (wide) aboutReturn.current = null;
    restoreFocus(aboutReturn, wide ? [ABOUT_COL_HEADING] : ['.about-toggle']);
  }, [aboutVisible, route, wide]);

  // 幅が変わって、フォーカスのあった所が隠れた・消えたとき（BODY に落ちないように）、同じ案内のある見える所へ移す。
  // 広い画面：「?」「試し方を見る」と重ねた案内は出ない → 左の案内の見出しへ。
  // 狭い画面：左の案内は出ない → 同じ案内を開く「?」へ（初回設定の画面なら、その見出しへ）。
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement) lastFocus.current = e.target;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  const prevWide = useRef(wide);
  useEffect(() => {
    const was = prevWide.current;
    prevWide.current = wide;
    if (was === wide) return;
    const hidden = wide ? HIDDEN_WHEN_WIDE : HIDDEN_WHEN_NARROW;
    const now = document.activeElement;
    const nowHidden = now instanceof HTMLElement && now !== document.body && !!now.closest(hidden);
    // フォーカスがほかの見える所にあれば動かさない。BODY に落ちていたら、落ちる前の所が今の幅で隠れる所だったときだけ移す。
    if (!nowHidden && (hasUsableFocus() || !lastFocus.current?.closest(hidden))) return;
    const targets = wide ? [ABOUT_COL_HEADING] : ['.about-toggle', '.phone .ob-title'];
    targets
      .map((s) => document.querySelector<HTMLElement>(s))
      .find((e) => focusable(e) && !e.closest(hidden))
      ?.focus();
  }, [wide]);

  // Esc でシートや案内を閉じる（日本語入力の変換中の Esc は除く）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      if (aboutVisible) setAboutOpen(false);
      else if (sheetOpen) navigate('talk');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** 新しく増えた利用者の発言に、送った人を記録する（画面だけの情報）。 */
  const recordSenders = (prev: AppState, next: AppState, who = senderRef.current) => {
    const before = new Set(prev.chat.map((m) => m.id));
    const added = next.chat.filter((m) => m.from === 'user' && !before.has(m.id));
    if (added.length === 0) return;
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
    const epoch = epochRef.current;
    // 送る人は、送ったときの人（AI の読み取り中に「送る人」を替えても、この書き込みは送ったときの人のもの）。
    const sender = senderRef.current;
    let reading: AiReading = { commands: null, source: 'rules' };
    if (ai.available && aiMode !== 'off') {
      // おまかせ：ルールで読めないときだけ AI（利用者の Claude の利用枠を使うので、呼ぶ回数を抑える）。
      // 命令だけでなく、前日の確認への答え（「作った」「昨日は無理だった」）と短いあいさつも、ルールで読めたとみなす。
      if (aiMode === 'always' || !readableByRules(cur, catalog, text, sender)) {
        busyRef.current = true;
        setPendingText(trimmed);
        try {
          reading = await ai.read(trimmed, cur, catalog);
        } finally {
          busyRef.current = false;
          setPendingText(null);
          // 読み取り中に日付が変わっていたら（試用モード）、この書き込みの返事を入れてから追いつく。
          if (catchUpLater.current) {
            catchUpLater.current = false;
            window.setTimeout(() => catchUpRef.current(), 0);
          }
        }
        if (epochRef.current !== epoch) {
          // 読み取りのあいだに家族や記録が入れ替わった。前の状態で読んだ結果（member の id や日付）は、新しい状態に入れない。
          showToast('家族やデータが入れ替わったので、さっきの書き込みは使いませんでした。');
          return;
        }
        if (reading.notice) showToast(reading.notice);
      }
    }
    const prev = stateRef.current;
    // AI の結果は、画面だけが知っていることで整える（「俺」「わたし」は送る人の欠席に、落とした日付はルールの日付に）。
    const commands = reading.commands ? prepareAiCommands(prev, catalog, text, reading.commands, sender) : undefined;
    // 送る人を渡す：人を書かない「明日飲み会」「今日はいらない」は、送った人の欠席にする（エンジンの UserTextOptions）。
    const r = handleUserText(prev, catalog, text, commands, { senderId: sender || undefined });
    recordSenders(prev, r.state, sender);
    const last = r.replies[r.replies.length - 1];
    if (last) setMarks((m) => ({ ...m, [last.id]: reading.source }));
    commit(r.state);
  };

  const advance = () => {
    // 読み取り中は進めない（「明日」などを、送ったときの日付で読んでいるため）。ボタンも押せなくしてある。
    if (busyRef.current) return;
    const r = advanceDay(stateRef.current, catalog);
    commit(r.state);
    const pushed = r.replies.filter((m) => m.push).length;
    showToast(`${formatJa(r.state.today)}になりました。${pushedText(pushed)}`);
  };

  /**
   * 日付の進め方を切り替える（家族と設定）。本物の日付に切り替えるときに、記録の日付が今日より先なら切り替えず、
   * わけを返す（その場で出す）。今日より前なら、すぐに追いつく。
   */
  const changeClock = (next: ClockMode): string | null => {
    if (next === clockRef.current) return null;
    if (next === 'demo') {
      setClock('demo');
      showToast('［翌日へ進む］で日付を進めます。');
      return null;
    }
    const cur = stateRef.current;
    if (cur.today > todayFn()) return clockAheadText(cur.today);
    setClock('calendar');
    catchUp('本物の日付で進めます。');
    return null;
  };

  const changeHousehold = (next: Household, change: HouseholdChange) => {
    const prev = stateRef.current;
    let s: AppState = { ...prev, household: next };
    const removed = change.removedMemberIds ?? [];
    // 家族を外したら、読み取り中の結果は使わない（外した人の id が、あとで加えた人に使われることがあるため）。
    if (prev.household.members.some((m) => !next.members.some((n) => n.id === m.id))) epochRef.current += 1;
    // 送る人を外したら、送る人の覚え書きも消す（最初の大人に戻す）。残すと、あとで加えた人が同じ id になったとき
    // （いちばん大きい番号の人を外すと、次に加えた人が同じ番号になる）、黙ってその人が送る人になり、その人の欠席が記録される。
    const goneMembers = prev.household.members.filter((m) => !next.members.some((n) => n.id === m.id));
    const gone = goneMembers.map((m) => m.id);
    if (gone.length > 0) {
      setSenderPref((p) => (p && gone.includes(p) ? undefined : p));
      // 外した人の発言は、外したときの名前で出し続ける（最初の大人や、同じ id で加えた人の名前にしない）。
      const names = new Map(goneMembers.map((m) => [m.id, m.nickname]));
      setSenders((cur) => Object.fromEntries(Object.entries(cur).map(([msg, who]) => [msg, names.has(who) ? formerSender(names.get(who) ?? '') : who])));
    }
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
    // 家族を加えたとき、加える前に過ぎた「みんな外で食べた日」は、加えた人も家で食べなかった日にしておく。振り返りと試用の記録は
    // 過ぎた日も今の家族で数えるので、そのままでは、その日が「記録なし」の献立の日に変わってしまう（作りましたか？も聞いていない）。
    const added = next.members.filter((m) => !prev.household.members.some((p) => p.id === m.id)).map((m) => m.id);
    if (added.length > 0) {
      s = {
        ...s,
        meals: s.meals.map((m) =>
          m.date < s.today && m.dishIds.length > 0 && nobodyEats(prev, m)
            ? { ...m, absentMemberIds: [...m.absentMemberIds, ...added.filter((id) => !m.absentMemberIds.includes(id))] }
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
        // 家族の変更（keepSafe）は、今の家族で出せなくなった日だけを作り直す。設定の変更は週を作り直す。
        s = applyAction(s, catalog, { type: 'regenerate_week', weekStart: w, ...(change.keepSafe ? { keepSafe: true } : {}) }).state;
        regenerated = true;
      }
      if (!regenerated) s = { ...s, shopping: buildShoppingLists(s, catalog) };
      // 設定からの作り直しは、家族の書き込みではない。エンジンが足す「献立を作り直す」の発言は残さない（送った人も付けない）。
      const before = new Set(prev.chat.map((m) => m.id));
      s = { ...s, chat: s.chat.filter((m) => m.from !== 'user' || before.has(m.id)) };
    }
    commit(s);
    if (!regenerated) {
      showToast(change.toast);
    } else if (change.keepSafe) {
      // トークの返事（エンジンの regenerate_week の keepSafe）と同じ言い方にする。
      const { redone, raku } = redoneDays(prev, s);
      showToast(`${change.toast}${familyRedoText(redone, raku)}`);
    } else {
      const kept = keptChangedDays(prev, s);
      const keptText = kept.length > 0 ? `自分で替えた日（${kept.map(formatJa).join('・')}）は、そのままです。` : '';
      showToast(`${change.toast}献立も作り直しました。${keptText}`);
    }
  };

  /** mode：日付の進め方。本物の日付（calendar）で始めるときは、today を日本時間の今日にする。 */
  const startWith = (input: OnboardingInput, today: ISODate, message: string, mode: ClockMode) => {
    const s = createInitialState(input, catalog, today);
    epochRef.current += 1;
    setSenders({});
    setMarks({});
    setSenderPref(adultsOf(s.household.members)[0]?.id);
    setClock(mode);
    commit(s);
    navigate('talk');
    showToast(message);
  };

  /** デモの家族は、いつも［翌日へ進む］で進める（今週の月曜から始まるので、本物の日付とは合わない）。 */
  const startDemo = (message = 'デモの家族で始めました。') =>
    startWith(DEMO_ONBOARDING, weekStartOf(todayFn()), message, 'demo');

  /** 書き出したデータを読み込んだあと、日付の進め方が記録の日付と合うようにする。 */
  const afterImport = (s: AppState) => {
    if (clockRef.current !== 'calendar') {
      showToast('読み込みました。');
      return;
    }
    if (s.today > todayFn()) {
      // 本物の日付より先の記録は、本物の日付では進められない（戻さない）ので、［翌日へ進む］のデモにする。
      setClock('demo');
      showToast(`読み込みました。記録の日付（${formatJa(s.today)}）が今日より先なので、［翌日へ進む］で進めるデモにしました。`);
      return;
    }
    catchUp('読み込みました。');
  };

  const setPlan = (plan: 'free' | 'paid') => {
    const h = stateRef.current.household;
    if (h.settings.plan === plan) return;
    changeHousehold({ ...h, settings: { ...h.settings, plan } }, { regenerate: false, toast: planToast(plan, clockRef.current) });
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

  const busy = pendingText !== null;

  /** AI の読み取りの設定を変えたときの知らせ。AI が使えないときは、そう言う（ルールで読み取る）。 */
  const aiModeToast = (mode: AiMode): string => {
    if (mode === 'off') return 'AI を使わずに読み取ります。';
    if (aiStatus === 'blocked') return 'この画面では AI を使えないので、ルールで読み取ります。';
    if (aiStatus === 'none') return '今は AI につながっていないので、ルールで読み取ります。';
    return mode === 'always' ? 'いつも AI に読み取りを頼みます。' : 'ルールで読めないときだけ AI に頼みます。';
  };

  return (
    <div className="shell">
      <aside className="about-col" aria-labelledby="about-title">
        <AboutPanel aiStatus={aiStatus} aiMode={aiMode} clock={clock} onStartOver={() => navigate('start')} />
      </aside>
      <main className="phone" aria-label="きめとく（試作）">
        {route === 'start' ? (
          <Onboarding
            catalog={catalog}
            today={todayFn()}
            onStart={(input, mode) => startWith(input, todayFn(), '設定しました。献立はトークに届いています。', mode)}
            onDemo={() => startDemo()}
            onCancel={() => navigate('talk')}
          />
        ) : (
          <>
            <DemoBar
              today={state.today}
              clock={clock}
              plan={state.household.settings.plan}
              busy={busy}
              showHint={!aboutSeen}
              inert={aboutVisible}
              onAdvance={advance}
              onPlanChange={setPlan}
              onHelp={openAbout}
            />
            <div className="app">
              <div className="talk-layer" inert={sheetOpen || aboutVisible}>
                <Talk
                  state={state}
                  catalog={catalog}
                  marks={marks}
                  senders={senders}
                  senderId={senderId}
                  adults={adults}
                  onSenderChange={setSenderPref}
                  busy={busy}
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
                  showTimes={clock !== 'calendar'}
                />
              </div>
              {/* 案内を重ねて開いているあいだは、シートにもフォーカスが出ないようにする（display: contents の入れ物）。 */}
              <div className="sheet-layer" inert={aboutVisible}>
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
                    clock={clock}
                    saveFailed={saveFailed}
                    onClockChange={changeClock}
                    onAiModeChange={(mode) => {
                      setAiMode(mode);
                      showToast(aiModeToast(mode));
                    }}
                    onHouseholdChange={changeHousehold}
                    onImport={(s) => {
                      epochRef.current += 1;
                      setSenders({});
                      setMarks({});
                      // 家族ごと入れ替わるので、送る人も読み込んだ家族の最初の大人にする（はじめからの設定と同じ）。
                      setSenderPref(adultsOf(s.household.members)[0]?.id);
                      commit(s);
                      navigate('talk');
                      afterImport(s);
                    }}
                    onReset={() => {
                      clearStored();
                      // 画面の設定（AI の読み取り・メニューの開閉・案内の印）も既定に戻す。画面が壊れたときのリセットと同じ結果にする。
                      setAiMode('auto');
                      setMenuOpen(true);
                      setAboutSeen(false);
                      startDemo('リセットしました。デモの家族で始めています。');
                    }}
                    onStartOver={() => navigate('start')}
                    onBack={() => navigate('talk')}
                    onToast={showToast}
                  />
                ) : null}
              </div>
              {aboutVisible ? (
                <div className="about-overlay" role="dialog" aria-modal="true" aria-labelledby="about-overlay-title">
                  <AboutPanel
                    aiStatus={aiStatus}
                    aiMode={aiMode}
                    clock={clock}
                    onStartOver={() => navigate('start')}
                    onClose={() => setAboutOpen(false)}
                  />
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
  clock,
  plan,
  busy,
  showHint,
  inert,
  onAdvance,
  onPlanChange,
  onHelp,
}: {
  today: ISODate;
  /** 本物の日付で進める（試用）ときは、［翌日へ進む］の代わりに、そう書いた小さな添え書きを出す。 */
  clock: ClockMode;
  plan: 'free' | 'paid';
  /** AI の読み取り中。日付を進めない。 */
  busy: boolean;
  /** 案内をまだ開いていなければ、スマホ幅で「試し方を見る」を出す（広い画面では案内が左に出ているので出さない）。 */
  showHint: boolean;
  /** 案内を重ねて開いているあいだは、外へフォーカスが出ないようにする。 */
  inert: boolean;
  onAdvance: () => void;
  onPlanChange: (plan: 'free' | 'paid') => void;
  onHelp: () => void;
}) {
  const calendar = clock === 'calendar';
  return (
    <div className="demo-bar" role="region" aria-label={calendar ? '日付とプラン' : 'デモの操作'} inert={inert} data-clock={clock}>
      <p className={cls('demo-today', showHint && 'has-hint')}>
        <span className="demo-label">{calendar ? '今日' : '今日（デモ）'}</span>
        <strong className="demo-date num" data-testid="demo-today">
          {formatJa(today)}
        </strong>
        {showHint ? (
          <button type="button" className="demo-hint" onClick={onHelp}>
            試し方を見る
            <Icon name="next" size={14} />
          </button>
        ) : null}
      </p>
      {calendar ? (
        <p className="clock-note" data-testid="clock-note">
          本物の日付で
          <wbr />
          進めています
          <wbr />
          （試用）
        </p>
      ) : (
        <button type="button" className="btn btn--small btn--demo" disabled={busy} onClick={onAdvance}>
          翌日へ進む
          <Icon name="next" size={16} />
        </button>
      )}
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
