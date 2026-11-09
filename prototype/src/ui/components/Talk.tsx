// トーク画面（LINE のグループで使う想定のトーク画面の試作）。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import type { Action, AppState, Card, Catalog, ChatMessage, ISODate, Member } from '../../engine';
import { formatJa, weekStartOf } from '../../engine';
import type { AiStatus } from '../ai';
import { cls } from '../lib';
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
}

function lastUserIndex(chat: ChatMessage[]): number {
  for (let i = chat.length - 1; i >= 0; i--) if (chat[i].from === 'user') return i;
  return -1;
}

function timeOf(at: string): string {
  return /T(\d{2}:\d{2})/.exec(at)?.[1] ?? '';
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
  const lastUser = lastUserIndex(chat);
  const nameOf = (id: string | undefined) =>
    (id && state.household.members.find((m) => m.id === id)?.nickname) || props.adults[0]?.nickname || 'わたし';

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
  const rows: ReactElement[] = [];
  let prevDay = '';
  let prevFrom: ChatMessage['from'] | null = null;
  chat.forEach((m, i) => {
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
              <span className="msg-time num">{timeOf(m.at)}</span>
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
    const showActions = i > lastUser && !!m.actions && m.actions.length > 0;
    rows.push(
      <div key={m.id} className={cls('msg', 'msg--bot', startsGroup && 'starts-group')} data-from="bot">
        <div className="msg-avatar">{startsGroup ? <Hanko /> : null}</div>
        <div className="msg-body">
          {startsGroup ? <div className="msg-name">きめとく</div> : null}
          <div className="msg-line">
            <div className="bubble bubble--bot">{m.text}</div>
            <span className="msg-time num">{timeOf(m.at)}</span>
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
            <div className="chips" role="group" aria-label="返事のボタン">
              {m.actions!.map((b, k) => (
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
        <div className="composer-field">
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
        </div>
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
