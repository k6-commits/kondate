// トーク画面（LINE のグループで使う想定のトーク画面の試作）。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import type { Action, ActionButton, AppState, Card, Catalog, ChatMessage, ISODate, Member } from '../../engine';
import { formatJa, weekStartOf } from '../../engine';
import type { AiStatus } from '../ai';
import { cls, formerSenderName, nobodyEatsOn } from '../lib';
import { ChatCard } from './ChatCard';
import type { CardHandlers } from './ChatCard';
import { Hanko, Icon } from './Icon';

export const EXAMPLE_TEXTS = ['今日は無理', '鶏むねが安い', '水曜は夫が飲み会', '卵切れた', '金曜は魚がいい', '金曜はカレーがいい'];

const MENTION = '@きめとく';

export interface TalkProps {
  state: AppState;
  catalog: Catalog;
  marks: Record<string, 'ai' | 'rules'>;
  senders: Record<string, string>;
  senderId: string;
  adults: Member[];
  onSenderChange: (id: string) => void;
  busy: boolean;
  pendingText: string | null;
  aiStatus: AiStatus;
  onSend: (text: string) => void;
  onAction: (action: Action) => void;
  cardHandlers: CardHandlers;
  onMenuWeek: () => void;
  onMenuToday: () => void;
  onMenuShopping: () => void;
  onMenuHousehold: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
  /** トークが見えているか（シートを閉じたときに下までスクロールする）。 */
  visible: boolean;
  /**
   * 吹き出しの横に時刻を出すか（既定は出す）。エンジンの時刻は日付と採番から作る目安なので、本物の日付で進める（試用）ときは
   * 出さない（夜に書いた書き込みが「08:28」と出て、本物の時刻と合わないため）。日の区切りは出す。
   */
  showTimes?: boolean;
}

function lastUserIndex(chat: ChatMessage[]): number {
  for (let i = chat.length - 1; i >= 0; i--) if (chat[i].from === 'user') return i;
  return -1;
}

function timeOf(at: string): string {
  return /T(\d{2}:\d{2})/.exec(at)?.[1] ?? '';
}

/**
 * 出す時刻（メッセージの id ごと）。同じ日の中で、前のメッセージより早い時刻にはしない（前の時刻にそろえる）。
 * エンジンの時刻は日付と採番から作る目安で、書き込みとその返事は朝、配信は夕方の時刻になる。そのままだと、
 * 夕方の配信（17:18）のあとに書いた「作った」が 08:19 と出て、時刻が戻って見える。
 */
export function displayTimes(chat: ChatMessage[]): Map<string, string> {
  const out = new Map<string, string>();
  let day = '';
  let latest = '';
  for (const m of chat) {
    const d = m.at.slice(0, 10);
    if (d !== day) {
      day = d;
      latest = '';
    }
    const t = timeOf(m.at);
    if (t > latest) latest = t;
    out.set(m.id, t ? latest : '');
  }
  return out;
}

/** ボタンの日付（同じ文字のボタンを見分けるため。LINE のクイックリプライの actionDate（server/line.ts）と同じ）。 */
function actionDate(state: AppState, action: Action): ISODate | null {
  switch (action.type) {
    case 'cooked':
    case 'not_cooked':
    case 'request_alternatives':
    case 'choose_alternative':
    case 'today_impossible':
    case 'react':
      return action.date;
    case 'check_item':
      return action.shoppingDate;
    case 'regenerate_week':
    case 'weekly_checkin':
      return action.weekStart;
    case 'accept_proposal':
    case 'reject_proposal':
      return state.proposals.find((p) => p.id === action.proposalId)?.date ?? null;
    default:
      return null;
  }
}

/**
 * 今出すボタンの文字（メッセージごと。groups と同じ並び）。同じ文字のボタン（「作った」など）が2つ以上のメッセージに
 * あるときは、そのメッセージの、今日でない日のボタンに日付を付けて見分ける（LINE のクイックリプライと同じ）。
 * 例：有料版で翌日へ進むと、昨日の確認は［11/9(月) 作った］［11/9(月) 作らなかった］、今日の配信は［作った］。
 */
export function actionLabels(state: AppState, groups: ActionButton[][]): string[][] {
  const messagesByLabel = new Map<string, number>();
  for (const g of groups) for (const label of new Set(g.map((b) => b.label))) messagesByLabel.set(label, (messagesByLabel.get(label) ?? 0) + 1);
  return groups.map((g) => {
    const shared = g.some((b) => (messagesByLabel.get(b.label) ?? 0) > 1);
    return g.map((b) => {
      const date = actionDate(state, b.action);
      return shared && date && date !== state.today ? `${formatJa(date)} ${b.label}` : b.label;
    });
  });
}

/**
 * あとのメッセージに、同じ日（週）のカードがあるメッセージの id。
 * 1日のカードと週のカードは日付だけを持ち、中身を今の献立で描く。あとで献立が変わると、古いメッセージの文と
 * カードが食い違うので、古いカードは畳んで「いまの献立を見る」にする（その日の最新のカードは、そのまま出す）。
 * 1日のカードは、あとの同じ日の1日のカードか、その週の週のカードで新しくなったとみなす。
 */
export function supersededCards(chat: ChatMessage[]): Set<string> {
  const out = new Set<string>();
  const laterDays = new Set<ISODate>();
  const laterWeeks = new Set<ISODate>();
  for (let i = chat.length - 1; i >= 0; i--) {
    const { id, card } = chat[i];
    if (card?.kind === 'meal') {
      if (laterDays.has(card.date) || laterWeeks.has(weekStartOf(card.date))) out.add(id);
      laterDays.add(card.date);
    } else if (card?.kind === 'week') {
      if (laterWeeks.has(card.weekStart)) out.add(id);
      laterWeeks.add(card.weekStart);
    }
  }
  return out;
}

/** その日の献立を作る・替えるボタン（作った・作らなかった・別のに・案を選ぶ・今日は無理）。 */
const DAY_ACTIONS: ReadonlySet<Action['type']> = new Set<Action['type']>([
  'cooked',
  'not_cooked',
  'request_alternatives',
  'choose_alternative',
  'today_impossible',
]);

/** 献立を替えるボタン（別のに・案を選ぶ・今日は無理）。過ぎた日の献立は、もう変えられない。 */
const CHANGE_ACTIONS: ReadonlySet<Action['type']> = new Set<Action['type']>(['request_alternatives', 'choose_alternative', 'today_impossible']);

/** その週（月曜の日付）の、週末の質問の答えがあるか。 */
function answeredWeek(state: AppState, weekStart: ISODate): boolean {
  return (state.checkins ?? []).some((c) => c.weekStart === weekStart);
}

/** 週末の質問のボタン（weekly_checkin）の週。ほかのボタンなら null。 */
function checkinWeek(b: ActionButton): ISODate | null {
  return b.action.type === 'weekly_checkin' ? b.action.weekStart : null;
}

/** ［作った］［作らなかった］のボタンの日。ほかのボタンなら null。 */
function cookedCheckDate(b: ActionButton): ISODate | null {
  return b.action.type === 'cooked' || b.action.type === 'not_cooked' ? b.action.date : null;
}

/** まだ答えのない過ぎた日か（「作りましたか？」を聞いて、作った・作らなかったの記録がまだない。献立が残っている）。 */
function unansweredPastDay(state: AppState, date: ISODate): boolean {
  return date < state.today && state.meals.some((m) => m.date === date && m.status === 'unconfirmed');
}

/**
 * トークで今出すボタン（メッセージの id → ボタン。出すボタンのないメッセージは入れない）。
 * - ふつうのボタンは、最後の利用者の書き込みより後の bot のメッセージにだけ出す（LINE のクイックリプライと同じ）。
 * - 週末の質問（weekly_checkin）のボタンは、その週の答えが入るまで、ほかの書き込みのあとも出しておく
 *   （［作った］など、ほかのボタンを先に押しても消えないように）。同じ週の質問が2つ以上あれば、いちばん新しいメッセージにだけ出す。
 * - 過ぎた日の［作った］［作らなかった］も、その日の答えが入るまで残す（本物の日付で進めると、開かなかった日の
 *   「作りましたか？」が一度に2つ以上届く。片方に答えても、もう片方のボタンが消えないように）。その日のボタンのある
 *   いちばん新しいメッセージ（ふつうは「作りましたか？」）にだけ出す。
 * どれも visibleActions で、今は押しても意味のないボタンを除く。
 */
export function shownActions(state: AppState): Map<string, ActionButton[]> {
  const chat = state.chat;
  const lastUser = lastUserIndex(chat);
  const latestQuestion = new Map<ISODate, string>();
  const latestCheck = new Map<ISODate, string>();
  for (const m of chat) {
    if (m.from !== 'bot') continue;
    for (const b of m.actions ?? []) {
      const week = checkinWeek(b);
      if (week) latestQuestion.set(week, m.id);
      const day = cookedCheckDate(b);
      if (day) latestCheck.set(day, m.id);
    }
  }
  const out = new Map<string, ActionButton[]>();
  chat.forEach((m, i) => {
    if (m.from !== 'bot') return;
    const shown = visibleActions(state, m.actions).filter((b) => {
      const week = checkinWeek(b);
      if (week) return latestQuestion.get(week) === m.id;
      if (i > lastUser) return true;
      const day = cookedCheckDate(b);
      return !!day && latestCheck.get(day) === m.id && unansweredPastDay(state, day);
    });
    if (shown.length > 0) out.set(m.id, shown);
  });
  return out;
}

/**
 * 返事のボタンのうち、今出すもの。
 * - みんな外で食べる日（家で食べる人がいない日）の、作る・替えるボタンは出さない。
 * - 過ぎた日の献立を替えるボタン（［別のに］［今日は無理］、別の案）は出さない（押しても「もう変えられません」になるだけ）。
 *   作った・作らなかったの記録のボタンは、過ぎた日にも出す。
 * - もうない提案（日が過ぎた・作り直しで片づいた提案）の［替える］［そのまま］は出さない（押しても「その提案は、もう
 *   使えません」になるだけ）。LINE のクイックリプライ（server/line.ts の isGoneProposal）と同じ。
 */
export function visibleActions(state: AppState, actions: ActionButton[] | undefined): ActionButton[] {
  return (actions ?? []).filter((b) => {
    const a = b.action;
    if (a.type === 'accept_proposal' || a.type === 'reject_proposal') return state.proposals.some((p) => p.id === a.proposalId);
    // 週末の質問（自分で考えた夕食は何日？）は、過ぎた週のことを聞くので、日が過ぎても出す。その週の答えが入ったら出さない。
    if (a.type === 'weekly_checkin') return !answeredWeek(state, a.weekStart);
    if (!('date' in a)) return true;
    if (DAY_ACTIONS.has(a.type) && nobodyEatsOn(state, a.date)) return false;
    return !(CHANGE_ACTIONS.has(a.type) && a.date < state.today);
  });
}

function foldLabel(card: Card): string {
  if (card.kind === 'week') return `いまの献立を見る（${formatJa(card.weekStart)}〜）`;
  if (card.kind === 'meal') return `いまの献立を見る（${formatJa(card.date)}）`;
  return 'いまの内容を見る';
}

function UserText({ text }: { text: string }) {
  if (text.startsWith(MENTION)) {
    return (
      <>
        <span className="mention-inline">{MENTION}</span> {text.slice(MENTION.length).trim()}
      </>
    );
  }
  return <>{text}</>;
}

function DayDivider({ day, today }: { day: ISODate; today: ISODate }) {
  return (
    <div className="day-divider" role="separator" aria-label={formatJa(day)}>
      <span className="num">
        {day === today ? '今日 ' : ''}
        {formatJa(day)}
      </span>
    </div>
  );
}

export function Talk(props: TalkProps) {
  const { state, catalog } = props;
  const logRef = useRef<HTMLDivElement>(null);
  const chat = state.chat;
  const nameOf = (id: string | undefined) =>
    formerSenderName(id) || (id && state.household.members.find((m) => m.id === id)?.nickname) || props.adults[0]?.nickname || 'わたし';

  const innerRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // 新しいメッセージが来たら下までスクロールする。
  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinned.current = true;
  }, [chat.length, props.pendingText, props.visible]);

  // 文字（Web フォント）の読み込みなどで中身の高さが変わっても、いちばん下を見ていたら下に留める。
  useEffect(() => {
    const el = logRef.current;
    const inner = innerRef.current;
    if (!el || !inner || typeof ResizeObserver === 'undefined') return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(inner);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  const superseded = supersededCards(chat);
  const times = props.showTimes === false ? null : displayTimes(chat);
  // ボタンは、最後の書き込みより後のメッセージにだけ出す（週末の質問は、答えるまで出す）。同じ文字のボタンは、日付を付けて見分ける。
  const actionGroups = [...shownActions(state)].map(([id, actions]) => ({ id, actions }));
  const labels = actionLabels(state, actionGroups.map((g) => g.actions));
  const actionsById = new Map(actionGroups.map((g, k) => [g.id, g.actions.map((b, j) => ({ ...b, label: labels[k][j] }))]));
  const rows: ReactElement[] = [];
  let prevDay = '';
  let prevFrom: ChatMessage['from'] | null = null;
  chat.forEach((m) => {
    const day = m.at.slice(0, 10);
    const newDay = day !== prevDay;
    if (newDay) rows.push(<DayDivider key={`day-${m.id}`} day={day} today={state.today} />);
    const startsGroup = newDay || prevFrom !== m.from;
    prevDay = day;
    prevFrom = m.from;
    if (m.from === 'user') {
      rows.push(
        <div key={m.id} className={cls('msg', 'msg--user', startsGroup && 'starts-group')} data-from="user">
          <div className="msg-body">
            {startsGroup ? <div className="msg-name msg-name--user">{nameOf(props.senders[m.id])}</div> : null}
            <div className="msg-line msg-line--user">
              {times ? <span className="msg-time num">{times.get(m.id)}</span> : null}
              <div className="bubble bubble--user">
                <UserText text={m.text} />
              </div>
            </div>
          </div>
        </div>,
      );
      return;
    }
    const mark = props.marks[m.id];
    const actions = actionsById.get(m.id) ?? [];
    const showActions = actions.length > 0;
    rows.push(
      <div key={m.id} className={cls('msg', 'msg--bot', startsGroup && 'starts-group')} data-from="bot">
        <div className="msg-avatar">{startsGroup ? <Hanko /> : null}</div>
        <div className="msg-body">
          {startsGroup ? <div className="msg-name">きめとく</div> : null}
          <div className="msg-line">
            <div className="bubble bubble--bot">{m.text}</div>
            {times ? <span className="msg-time num">{times.get(m.id)}</span> : null}
          </div>
          {m.card ? (
            superseded.has(m.id) ? (
              <details className="card-fold">
                <summary>
                  <Icon name="chevronDown" size={16} />
                  {foldLabel(m.card)}
                </summary>
                <ChatCard card={m.card} state={state} catalog={catalog} handlers={props.cardHandlers} />
              </details>
            ) : (
              <ChatCard card={m.card} state={state} catalog={catalog} handlers={props.cardHandlers} />
            )
          ) : null}
          {m.push || mark ? (
            <div className="msg-tags">
              {m.push ? (
                <span className="tag tag--push">
                  <Icon name="bell" size={13} />
                  配信
                </span>
              ) : null}
              {mark ? <span className={cls('tag', mark === 'ai' ? 'tag--ai' : 'tag--rules')}>{mark === 'ai' ? 'AIで読み取り' : 'ルールで読み取り'}</span> : null}
            </div>
          ) : null}
          {showActions ? (
            <div
              className={cls('chips', actions.some((b) => b.action.type === 'weekly_checkin') && 'chips--checkin')}
              role="group"
              aria-label="返事のボタン"
            >
              {actions.map((b, k) => (
                <button key={k} type="button" className="chip chip--action" disabled={props.busy} onClick={() => props.onAction(b.action)}>
                  {b.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>,
    );
  });

  const members = state.household.members.length;
  return (
    <div className="talk">
      <header className="talk-head">
        <h1 className="talk-title">うちの献立</h1>
        <span className="talk-count num">家族{members}人・きめとく</span>
      </header>
      <div className="log" ref={logRef} role="log" aria-label="トーク">
        <div className="log-inner" ref={innerRef}>
          {rows}
          {props.pendingText ? (
            <div className="msg msg--user starts-group is-pending" aria-busy="true">
              <div className="msg-body">
                <div className="msg-name msg-name--user">{nameOf(props.senderId)}</div>
                <div className="msg-line msg-line--user">
                  <span className="msg-time">読み取り中…</span>
                  <div className="bubble bubble--user">
                    <UserText text={`${MENTION} ${props.pendingText}`} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <Composer {...props} />
      <RichMenu {...props} />
    </div>
  );
}

function Composer(props: TalkProps) {
  const [text, setText] = useState('');
  const composing = useRef(false);
  const send = (value: string) => {
    const t = value.trim();
    if (!t || props.busy) return;
    props.onSend(t);
    setText('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // 日本語入力の変換中の Enter は、確定のための Enter なので送らない。
    if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    send(text);
  };
  return (
    <div className="composer-wrap">
      <div className="composer-tools">
        <label className="sender">
          <span className="sender-label">送る人</span>
          <select id="sender-select" value={props.senderId} onChange={(e) => props.onSenderChange(e.target.value)}>
            {props.adults.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nickname}
              </option>
            ))}
          </select>
        </label>
        <div className="examples" role="group" aria-label="ためしに送る書き込み">
          <span className="examples-label">ためしに</span>
          {EXAMPLE_TEXTS.map((t) => (
            <button key={t} type="button" className="chip chip--example" disabled={props.busy} onClick={() => send(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <form
        className="composer"
        data-ai-status={props.aiStatus}
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {/* label にして、「@きめとく」や余白を押しても入力欄に入れるようにする（押せる所を広く）。 */}
        <label className="composer-field">
          <span className="mention" aria-hidden="true">
            {MENTION}
          </span>
          <input
            id="composer-input"
            type="text"
            aria-label="きめとくへの書き込み"
            placeholder="書き込む"
            autoComplete="off"
            enterKeyHint="send"
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
          />
        </label>
        <button type="submit" className="send-btn" disabled={props.busy || !text.trim()}>
          {props.busy ? '読み取り中…' : '送る'}
        </button>
      </form>
    </div>
  );
}

function RichMenu(props: TalkProps) {
  const open = props.menuOpen;
  return (
    <nav className={cls('menu', open && 'is-open')} aria-label="メニュー">
      <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="rich-menu-tiles" onClick={props.onMenuToggle}>
        <span>メニュー</span>
        <Icon name={open ? 'chevronDown' : 'chevronUp'} size={18} />
      </button>
      {open ? (
        <div id="rich-menu-tiles" className="menu-tiles">
          <button type="button" className="tile" onClick={props.onMenuWeek}>
            <Icon name="week" size={26} />
            <span>今週の献立</span>
          </button>
          <button type="button" className="tile" onClick={props.onMenuToday} disabled={props.busy}>
            <Icon name="bowl" size={26} />
            <span>今日のごはん</span>
          </button>
          <button type="button" className="tile" onClick={props.onMenuShopping}>
            <Icon name="basket" size={26} />
            <span>買い物リスト</span>
          </button>
          <button type="button" className="tile" onClick={props.onMenuHousehold}>
            <Icon name="family" size={26} />
            <span>家族と設定</span>
          </button>
        </div>
      ) : null}
    </nav>
  );
}
