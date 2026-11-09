// LINE の webhook のイベントを処理する（署名の検証と 200 の返却は app.ts）。
// - 送り元のキーは groupId ?? roomId ?? userId。状態は送り元ごとに保存する。
// - グループ・ルームでは「@きめとく」で始まる発言か、bot へのメンションがある発言だけを処理する。
//   それ以外の発言は、処理も保存もしない（中身をログにも出さない）。1対1のトークはすべて処理する。
// - 処理の前に「@きめとく」とメンションの部分を取り除く（ほかの人へのメンションは、家族のニックネームだけ残す）。
// - イベントを処理する前に、日付を日本時間の今日まで進める（household.ts）。
// - 保存してから返信する（返信に失敗しても、状態は進んでいる）。発言の原文は保存しない（store.ts で空にする）。
// - unfollow（ブロック）・leave（グループ・ルームからの退出）では、その送り元の記録を消す。
import { z } from 'zod';
import {
  applyAction,
  handleUserText,
  isISODate,
  type Action,
  type AppState,
  type Catalog,
  type ChatMessage,
  type StepResult,
} from '../src/engine/index';
import { WELCOME_BACK, jstToday, prepareRecord, serverMessage, type SourceRef } from './household';
import { interpretWithLlm } from './interpret';
import { LINE_LIMITS, isAddressedToBot, stripMentions, toLineMessages, type LineClient } from './line';
import type { LlmInterpreter } from './llm';
import { errorKind, type Logger } from './log';
import { nicknameIn } from './names';
import type { Store } from './store';

// ---------------------------------------------------------------------------
// postback の data（Action の JSON）
// ---------------------------------------------------------------------------

const isoDate = z.string().refine(isISODate);
const ref = z.string().min(1).max(100);

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open_week') }),
  z.object({ type: z.literal('open_today') }),
  z.object({ type: z.literal('open_shopping') }),
  z.object({ type: z.literal('cooked'), date: isoDate }),
  z.object({ type: z.literal('not_cooked'), date: isoDate }),
  z.object({ type: z.literal('request_alternatives'), date: isoDate }),
  z.object({ type: z.literal('choose_alternative'), date: isoDate, dishIds: z.array(ref).min(1).max(6) }),
  z.object({ type: z.literal('today_impossible'), date: isoDate }),
  z.object({ type: z.literal('accept_proposal'), proposalId: ref }),
  z.object({ type: z.literal('reject_proposal'), proposalId: ref }),
  z.object({
    type: z.literal('react'),
    date: isoDate,
    memberId: ref,
    reaction: z.enum(['great', 'ok', 'meh']),
  }),
  z.object({ type: z.literal('check_item'), shoppingDate: isoDate, ingredientId: ref, checked: z.boolean() }),
  z.object({ type: z.literal('regenerate_week'), weekStart: isoDate, keepSafe: z.boolean().optional() }),
]);

/** postback の data を Action にする。JSON でない・形が違う・長すぎるものは null（無視する）。 */
export function parseAction(data: string): Action | null {
  if (data.length === 0 || data.length > LINE_LIMITS.postbackData) return null;
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const result = ActionSchema.safeParse(json);
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------------------
// イベントの形（使うところだけ確かめる。ほかのイベントは無視する）
// ---------------------------------------------------------------------------

const SourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), userId: z.string().min(1) }),
  z.object({ type: z.literal('group'), groupId: z.string().min(1), userId: z.string().optional() }),
  z.object({ type: z.literal('room'), roomId: z.string().min(1), userId: z.string().optional() }),
]);

const common = {
  replyToken: z.string().optional(),
  source: SourceSchema,
  webhookEventId: z.string().optional(),
  mode: z.string().optional(),
};

const MentioneeSchema = z.object({
  index: z.number(),
  length: z.number(),
  isSelf: z.boolean().optional(),
  type: z.string().optional(),
});

export const LineEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    ...common,
    message: z.object({
      type: z.string(),
      text: z.string().optional(),
      mention: z.object({ mentionees: z.array(MentioneeSchema) }).optional(),
    }),
  }),
  z.object({ type: z.literal('postback'), ...common, postback: z.object({ data: z.string() }) }),
  z.object({ type: z.literal('follow'), ...common }),
  z.object({ type: z.literal('join'), ...common }),
  z.object({ type: z.literal('unfollow'), ...common }),
  z.object({ type: z.literal('leave'), ...common }),
]);

export type LineEvent = z.infer<typeof LineEventSchema>;

export const WebhookBodySchema = z.object({
  destination: z.string().optional(),
  events: z.array(z.unknown()),
});

/** LINE の「検証」ボタンなどで届く、返信できないダミーのトークン。 */
const DUMMY_REPLY_TOKENS = new Set(['00000000000000000000000000000000', 'ffffffffffffffffffffffffffffffff']);

function sourceOf(source: LineEvent['source']): SourceRef {
  switch (source.type) {
    case 'user':
      return { key: source.userId, sourceType: 'user', sourceId: source.userId };
    case 'group':
      return { key: source.groupId, sourceType: 'group', sourceId: source.groupId };
    case 'room':
      return { key: source.roomId, sourceType: 'room', sourceId: source.roomId };
  }
}

// ---------------------------------------------------------------------------
// 処理
// ---------------------------------------------------------------------------

export interface WebhookDeps {
  store: Store;
  catalog: Catalog;
  line: LineClient | null;
  llm: LlmInterpreter | null;
  now: () => Date;
  logger: Logger;
}

interface Outgoing {
  state: AppState;
  messages: ChatMessage[];
}

const RECENT_EVENT_IDS = 1000;

/** webhook のイベントを順に処理する関数を作る（再送で同じイベントが届いても、1回だけ処理する）。 */
export function createWebhookHandler(deps: WebhookDeps): (events: unknown[]) => Promise<void> {
  const { store, catalog, line, llm, now, logger } = deps;
  const recent = new Set<string>();
  let warnedNoToken = false;

  function alreadyHandled(event: LineEvent): boolean {
    const id = event.webhookEventId;
    if (!id) return false;
    if (recent.has(id)) return true;
    recent.add(id);
    if (recent.size > RECENT_EVENT_IDS) {
      const oldest = recent.values().next().value;
      if (oldest !== undefined) recent.delete(oldest);
    }
    return false;
  }

  async function reply(replyToken: string | undefined, out: Outgoing | null): Promise<void> {
    if (!out || out.messages.length === 0 || !replyToken) return;
    if (!line) {
      if (!warnedNoToken) logger.warn('LINE_CHANNEL_ACCESS_TOKEN がないので、返信できません');
      warnedNoToken = true;
      return;
    }
    const messages = toLineMessages(out.state, catalog, out.messages);
    if (messages.length > 0) await line.reply(replyToken, messages);
  }

  /** 状態を準備して（作る・日付を進める）、step を実行して保存する。返信する内容を返す。 */
  async function run(
    source: SourceRef,
    step: (state: AppState, created: 'new' | 'reset' | null) => Promise<{ result: StepResult; lead: ChatMessage[] }>,
    introFilter: (m: ChatMessage) => boolean,
  ): Promise<Outgoing | null> {
    let out = null as Outgoing | null;
    await store.update(source.key, async (current) => {
      const prepared = prepareRecord(current, source, catalog, jstToday(now()));
      const { result, lead } = await step(prepared.record.state, prepared.created);
      out = {
        state: result.state,
        messages: [...prepared.intro.filter(introFilter), ...lead, ...prepared.carry, ...result.replies],
      };
      return { ...prepared.record, state: result.state };
    });
    return out;
  }

  const notWeek = (m: ChatMessage) => m.card?.kind !== 'week';
  const everything = () => true;

  async function onMessage(event: Extract<LineEvent, { type: 'message' }>, source: SourceRef): Promise<void> {
    const raw = event.message.text;
    if (event.message.type !== 'text' || typeof raw !== 'string') return;
    const mentionees = event.message.mention?.mentionees;
    // グループ・ルームで bot あてでない発言は、処理も保存もしない（ログにも出さない）。
    if (source.sourceType !== 'user' && !isAddressedToBot(raw, mentionees)) return;
    if (alreadyHandled(event)) return;
    const out = await run(
      source,
      async (state) => {
        // 「@きめとく」と bot へのメンションは取り除く。ほかの人へのメンション（LINE の表示名）は、
        // 家族のニックネームが入っていればそのニックネームに、なければ取り除く（表示名は保存も LLM への送信もしない）。
        const members = state.household.members;
        const text = stripMentions(raw, mentionees, (mention) => nicknameIn(mention, members) ?? '');
        if (text.length === 0) {
          // 「@きめとく」だけのときは、使い方を返す。
          return { result: handleUserText(state, catalog, '@きめとく', [{ type: 'help' }]), lead: [] };
        }
        const parsed = await interpretWithLlm(llm, catalog, state, text);
        return { result: handleUserText(state, catalog, text, parsed ?? undefined), lead: [] };
      },
      notWeek,
    );
    await reply(event.replyToken, out);
  }

  async function onPostback(event: Extract<LineEvent, { type: 'postback' }>, source: SourceRef): Promise<void> {
    const action = parseAction(event.postback.data);
    if (!action) return; // 不正な data は無視する
    if (alreadyHandled(event)) return;
    const out = await run(source, async (state) => ({ result: applyAction(state, catalog, action), lead: [] }), notWeek);
    await reply(event.replyToken, out);
  }

  /** follow（友だち追加）と join（グループ参加）。 */
  async function onGreeting(event: Extract<LineEvent, { type: 'follow' | 'join' }>, source: SourceRef): Promise<void> {
    if (alreadyHandled(event)) return;
    const out = await run(
      source,
      async (state, created) => {
        // 新しく作った（作り直した）ときは、あいさつと週の献立（intro）だけを返す。
        if (created) return { result: { state, replies: [] }, lead: [] };
        // もう状態があるときは、続きから使えることと、今週の献立を返す。
        return { result: applyAction(state, catalog, { type: 'open_week' }), lead: [serverMessage(WELCOME_BACK, now())] };
      },
      everything,
    );
    await reply(event.replyToken, out);
  }

  /** unfollow（ブロック）と leave（退出）：記録を消す（返信はできない）。また follow・join されたら、新しく作る。 */
  async function onFarewell(event: Extract<LineEvent, { type: 'unfollow' | 'leave' }>, source: SourceRef): Promise<void> {
    if (alreadyHandled(event)) return;
    if (await store.delete(source.key)) logger.info('ブロック・退出のため、記録を消しました', { event: event.type });
  }

  async function handleEvent(event: LineEvent): Promise<void> {
    const source = sourceOf(event.source);
    // ブロック・退出では、モードにかかわらず記録を消す。
    if (event.type === 'unfollow' || event.type === 'leave') return onFarewell(event, source);
    if (event.mode === 'standby') return; // ほかのチャネルが応答している間は何もしない
    if (event.replyToken && DUMMY_REPLY_TOKENS.has(event.replyToken)) return;
    switch (event.type) {
      case 'message':
        return onMessage(event, source);
      case 'postback':
        return onPostback(event, source);
      case 'follow':
      case 'join':
        return onGreeting(event, source);
    }
  }

  return async (events) => {
    for (const raw of events) {
      const parsed = LineEventSchema.safeParse(raw);
      if (!parsed.success) continue; // 使わない種類のイベント
      try {
        await handleEvent(parsed.data);
      } catch (e) {
        logger.error('LINE のイベントの処理に失敗しました', { event: parsed.data.type, error: errorKind(e) });
      }
    }
  };
}
