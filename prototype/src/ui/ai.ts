// AI での読み取り。ふだんはエンジンのルールベース（parseMessage）で読み、必要なときだけ AI に頼む。
//   1. claude.ai の Artifact の中：window.claude.use('sample') の sample.json（利用者の Claude の利用枠を使う）
//   2. 開発時：VITE_PARSE_API のサーバー（POST /api/parse）
//   3. どちらもなければルールだけ
// AI には家族のニックネームを送らない（member の id に置き換える）。日付はモデルに計算させず、表から選ばせる。
// 結果は必ずエンジンの validateCommands で検証し、1件も残らなければルールに戻る。
import type { AppState, Catalog, Genre, ISODate, Member, ParsedCommand, Protein } from '../engine';
import { GENRE_LABEL, PROTEIN_LABEL, WEEKDAY_JA, addDays, validateCommands, weekStartOf, weekdayOf } from '../engine';

export type AiMode = 'auto' | 'always' | 'off';

/** checking：Artifact の中で確かめている／claude：Claude が使える／server：開発用のサーバー／none：AI なし／blocked：この表示中は使えない。 */
export type AiStatus = 'checking' | 'claude' | 'server' | 'none' | 'blocked';

export const AI_MODES: { id: AiMode; label: string; note: string }[] = [
  {
    id: 'auto',
    label: 'おまかせ（ルールで読めないときだけ AI）',
    note: 'ルールで読めた書き込みは AI に送りません。Claude の利用枠を使う回数を抑えます。',
  },
  { id: 'always', label: 'いつも AI', note: '書き込みのたびに AI に頼みます。' },
  { id: 'off', label: '使わない', note: 'ルールだけで読み取ります。' },
];

export interface AiReading {
  /** 検証ずみで、1件以上あるときだけ入る。null ならルールで処理する。 */
  commands: ParsedCommand[] | null;
  source: 'ai' | 'rules';
  /** 画面に小さく出す知らせ（混み合っている、など）。 */
  notice?: string;
}

/** この表示中は AI を止めるエラー。 */
const BLOCKING_CODES = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

interface SampleLike {
  json: (input: string, options?: { modelTier?: 'quick' | 'default' | 'complex' }) => Promise<unknown>;
}

interface ClaudeHost {
  use?: (name: string) => unknown;
}

export interface AiReaderOptions {
  /** 開発用のサーバーの URL。省略すると VITE_PARSE_API を使う。 */
  parseApi?: string;
  /** window.claude を返す（テスト用に差し替えられる）。 */
  host?: () => ClaudeHost | undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isSample(v: unknown): v is SampleLike {
  return (typeof v === 'function' || isRecord(v)) && typeof (v as { json?: unknown }).json === 'function';
}

function defaultHost(): ClaudeHost | undefined {
  if (typeof window === 'undefined') return undefined;
  const claude = (window as unknown as { claude?: unknown }).claude;
  return isRecord(claude) || typeof claude === 'function' ? (claude as ClaudeHost) : undefined;
}

/** 開発用のサーバー。Artifact 用の1枚の HTML（--mode single）では使わない（外部へ通信しない）。 */
export function devParseApi(): string | undefined {
  if (import.meta.env.MODE === 'single') return undefined;
  const url = import.meta.env.VITE_PARSE_API;
  return typeof url === 'string' && url.trim() ? url.trim() : undefined;
}

export class AiReader {
  private statusValue: AiStatus;
  private sample: SampleLike | null = null;
  private started = false;
  private readonly listeners = new Set<() => void>();
  private readonly parseApi: string | undefined;
  private readonly host: () => ClaudeHost | undefined;

  constructor(options: AiReaderOptions = {}) {
    this.parseApi = options.parseApi ?? devParseApi();
    this.host = options.host ?? defaultHost;
    this.statusValue = 'checking';
  }

  get status(): AiStatus {
    return this.statusValue;
  }

  /** AI に頼める状態か。 */
  get available(): boolean {
    return this.statusValue === 'claude' || this.statusValue === 'server';
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): AiStatus => this.statusValue;

  private setStatus(status: AiStatus): void {
    if (this.statusValue === status) return;
    this.statusValue = status;
    for (const fn of [...this.listeners]) fn();
  }

  private fallbackStatus(): AiStatus {
    return this.parseApi ? 'server' : 'none';
  }

  /** 起動時に一度だけ呼ぶ。Artifact の中なら sample を裏で待つ（最大10秒ほど。画面は止めない）。 */
  start(): void {
    if (this.started) return;
    this.started = true;
    const host = this.host();
    if (!host || typeof host.use !== 'function') {
      this.setStatus(this.fallbackStatus());
      return;
    }
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(host.use('sample'));
    } catch {
      this.setStatus(this.fallbackStatus());
      return;
    }
    pending.then(
      (s) => {
        if (this.statusValue === 'blocked') return;
        if (isSample(s)) {
          this.sample = s;
          this.setStatus('claude');
        } else {
          this.setStatus(this.fallbackStatus());
        }
      },
      () => {
        if (this.statusValue !== 'blocked') this.setStatus(this.fallbackStatus());
      },
    );
  }

  /** 書き込み（「@きめとく」を除いた本文）を AI で読み取る。失敗してもルールに戻れるように、例外は投げない。 */
  async read(text: string, state: AppState, catalog: Catalog): Promise<AiReading> {
    if (this.statusValue === 'claude' && this.sample) return this.readWithClaude(text, state, catalog);
    if (this.statusValue === 'server' && this.parseApi) return this.readWithServer(text, state, catalog);
    return { commands: null, source: 'rules' };
  }

  private async readWithClaude(text: string, state: AppState, catalog: Catalog): Promise<AiReading> {
    const sample = this.sample;
    if (!sample) return { commands: null, source: 'rules' };
    const input = buildAiInstruction(maskNames(text, state.household.members), state, catalog);
    try {
      const raw = await sample.json(input, { modelTier: 'quick' });
      const commands = validateCommands(state, catalog, toParsedCommands(raw));
      return commands.length > 0 ? { commands, source: 'ai' } : { commands: null, source: 'rules' };
    } catch (e) {
      const code = isRecord(e) && typeof e.code === 'string' ? e.code : '';
      if (BLOCKING_CODES.has(code)) {
        this.sample = null;
        this.setStatus('blocked');
        return { commands: null, source: 'rules', notice: 'この画面では AI を使えないため、ルールで読み取りました。' };
      }
      if (code === 'rate_limited') {
        return { commands: null, source: 'rules', notice: 'AI が混み合っているため、ルールで読み取りました。' };
      }
      // invalid_json / refused / empty_completion / upstream_error など：この1回はルールで処理する（再試行しない）。
      return { commands: null, source: 'rules' };
    }
  }

  private async readWithServer(text: string, state: AppState, catalog: Catalog): Promise<AiReading> {
    const url = this.parseApi;
    if (!url || typeof fetch !== 'function') return { commands: null, source: 'rules' };
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 15_000) : null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, today: state.today, members: state.household.members }),
        signal: ctl?.signal,
      });
      if (!res.ok) return { commands: null, source: 'rules' };
      const data: unknown = await res.json();
      if (!isRecord(data) || data.source !== 'llm') return { commands: null, source: 'rules' };
      const commands = validateCommands(state, catalog, toParsedCommands(data.commands));
      return commands.length > 0 ? { commands, source: 'ai' } : { commands: null, source: 'rules' };
    } catch {
      return { commands: null, source: 'rules' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// 送る前の下ごしらえ（純粋関数）
// ---------------------------------------------------------------------------

const toHiragana = (s: string): string => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const toKatakana = (s: string): string => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/**
 * 名前として置き換えてよいか。エンジン（parser の名前の照合）が名前として読むものと同じにする：
 * 1文字の名前は、かな（ひらがな・カタカナ）でないとき（漢字・英字など）だけ。
 * かな1文字は、ほかの言葉の一部（「ゆでたまご」の「ゆ」）に当たりやすく、エンジンも名前として読まない。
 * 英字1文字（「K」）はエンジンが名前として読むので、置き換えないと AI に名前が渡る。
 */
function usableNickname(nickname: string): boolean {
  const base = nickname.normalize('NFKC').trim();
  if (!base) return false;
  if ([...base].length > 1) return true;
  return /[^぀-ゟ]/u.test(toHiragana(base));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 本文に出てくるメンバーのニックネームを、長い順に member の id に置き換える（AI に家族の名前を送らないため）。
 * サーバーの maskNicknames（server/llm.ts）と同じ考え方：
 * - 本文は NFKC にそろえる（全角英数・半角カナのゆれをなくす。そろえた文をそのまま送る）。
 * - ひらがな・カタカナの書き分け（「ゆい」「ユイ」）と、英字の大文字・小文字も置き換える（エンジンが同じ人とみなす表記）。
 * - 1文字のニックネームは、かなでないとき（漢字・英字など）だけ置き換える（エンジンの名前の照合と同じ）。
 * 1回の置き換えで済ませるので、短い名前が、置き換えた id の中に当たることはない。
 */
export function maskNames(text: string, members: Pick<Member, 'id' | 'nickname'>[]): string {
  const source = text.normalize('NFKC');
  const idByWord = new Map<string, string>();
  for (const m of members) {
    if (!usableNickname(m.nickname)) continue;
    const base = m.nickname.normalize('NFKC').trim();
    for (const word of [base, toHiragana(base), toKatakana(base)]) {
      const key = word.toLowerCase();
      if (!idByWord.has(key)) idByWord.set(key, m.id);
    }
  }
  if (idByWord.size === 0) return source;
  const words = [...idByWord.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(words.map(escapeRegExp).join('|'), 'giu');
  return source.replace(pattern, (hit) => idByWord.get(hit.toLowerCase()) ?? hit);
}

/** 今日から days 日分の日付と曜日の表（例：'2026-11-09(月) 今日・今週'）。 */
export function dateTable(today: ISODate, days = 14): string[] {
  const thisWeek = weekStartOf(today);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    const ws = weekStartOf(d);
    const week = ws === thisWeek ? '今週' : ws === addDays(thisWeek, 7) ? '来週' : '再来週';
    const rel = i === 0 ? '今日' : i === 1 ? '明日' : i === 2 ? 'あさって' : '';
    out.push(`${d}(${WEEKDAY_JA[weekdayOf(d)]}) ${[rel, week].filter(Boolean).join('・')}`);
  }
  return out;
}

const COMMAND_TYPES = [
  'show_week',
  'show_today',
  'show_shopping',
  'today_impossible',
  'want_alternatives',
  'absence',
  'sale',
  'out_of_stock',
  'have',
  'request',
  'help',
] as const;
type CommandType = (typeof COMMAND_TYPES)[number];

/** AI に渡す1つの文字列（指示・データ・出力の形をすべて入れる。AI は前の会話を覚えていない）。 */
export function buildAiInstruction(maskedText: string, state: AppState, catalog: Catalog): string {
  const members = state.household.members.map((m) =>
    JSON.stringify({ id: m.id, ageBand: m.ageBand, role: m.role ?? null }),
  );
  const ingredients = catalog.ingredients.map(
    (i) => `${i.id}：${i.name}${i.aliases.length > 0 ? `（${i.aliases.join('、')}）` : ''}`,
  );
  // 世帯が自由入力した料理名にも名前が入りうるので、置き換えてから入れる。
  const dishes = [
    ...catalog.dishes.map((d) => `${d.id}：${d.name}`),
    ...state.household.customDishes.map((d) => `${d.id}：${maskNames(d.name, state.household.members)}`),
  ];
  const proteins = (Object.keys(PROTEIN_LABEL) as Protein[]).map((p) => `${p}（${PROTEIN_LABEL[p]}）`).join('、');
  const genres = (Object.keys(GENRE_LABEL) as Genre[]).map((g) => `${g}（${GENRE_LABEL[g]}）`).join('、');
  const example =
    '{"commands":[{"type":"absence","date":"YYYY-MM-DD","memberRef":"member_2","ingredientId":null,"dishId":null,"protein":null,"genre":null,"cancel":null,"question":null,"frozen":null}]}';

  return [
    'あなたは、家族の夕食の献立アプリ「きめとく」で、家族の書き込みをアプリの命令に直す係です。',
    '下の「書き込み」を読み、「命令の種類」から当てはまるものを選んで、JSON だけを返してください。説明の文は書かないでください。',
    '',
    '# 日付の表（date はこの表の YYYY-MM-DD から選ぶ。自分で計算しない）',
    ...dateTable(state.today),
    '',
    '# 家族（名前は member の id に置き換えてある）',
    ...members,
    'memberRef には、書き込みに出てくる member の id（例：member_2）を入れる。id がなく「夫」「妻」「子ども」「上の子」「みんな」などの言い方なら、その語をそのまま入れる。',
    '',
    '# 命令の種類（type）',
    '- show_week：今週の献立を見たい',
    '- show_today：今日の夕食を知りたい',
    '- show_shopping：買い物リストを見たい',
    '- today_impossible：今日は作れない、疲れた、ラクしたい（今日の分）',
    '- want_alternatives：その日の料理を別のにしたい（date は任意。「キーマカレー飽きた」のように料理で指したら dishId）',
    '- absence：その日の夕食を食べない人がいる（飲み会、出張、外食など。date と memberRef が必要。日付がなければ今日）。食べないと伝えていた人が、やはり食べる（欠席の取り消し）なら cancel を true',
    '- sale：食材が安い、特売（ingredientId が必要）',
    '- out_of_stock：食材が切れた、ない（ingredientId が必要）',
    '- have：食材を買った、ある、もらった（ingredientId が必要）。冷凍したなら frozen を true',
    '- out_of_stock・have で、在庫を聞いているだけ（「豆腐あったっけ？」）、買ってきてと頼んでいる（「豆腐買ってきて」）、仮定（「卵が切れたら」）、打ち消し（「卵は切れてない」）なら question を true（在庫は変えない）',
    '- request：その日に食べたい料理、たんぱく源、和洋中（date は任意。dishId・protein・genre・ingredientId のどれか1つ以上が必要。食材を名指ししたら ingredientId）',
    '- help：使い方を知りたい',
    '1つの書き込みに複数の命令があってもよい。当てはまるものがなければ {"commands":[]} を返す。',
    '過ぎたことを話しているだけの文（「昨日は無理だった」）、打ち消し（「今日は無理じゃない」）、仮定（「無理なら」）では、today_impossible・want_alternatives・absence を出さない。',
    '',
    `# たんぱく源（protein）：${proteins}`,
    `# 和洋中（genre）：${genres}`,
    '',
    '# 食材（ingredientId：名前（別名））',
    ...ingredients,
    '',
    '# 料理（dishId：名前）',
    ...dishes,
    '',
    '# 出力の形（JSON だけ。使わない項目は null。1行の例）',
    example,
    '',
    '# 書き込み',
    maskedText,
  ].join('\n');
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** AI の出力（{commands:[...]}、null の項目つき）を ParsedCommand にする。検証は validateCommands で行う。 */
export function toParsedCommands(raw: unknown): ParsedCommand[] {
  const list: unknown[] = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.commands) ? raw.commands : [];
  const out: ParsedCommand[] = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.type !== 'string') continue;
    if (!(COMMAND_TYPES as readonly string[]).includes(item.type)) continue;
    const type = item.type as CommandType;
    switch (type) {
      case 'show_week':
      case 'show_today':
      case 'show_shopping':
      case 'today_impossible':
      case 'help':
        out.push({ type });
        break;
      case 'want_alternatives': {
        const date = str(item.date);
        const dishId = str(item.dishId);
        out.push({ type, ...(date ? { date } : {}), ...(dishId ? { dishId } : {}) });
        break;
      }
      case 'absence': {
        const date = str(item.date);
        const memberRef = str(item.memberRef);
        if (date && memberRef) out.push({ type, date, memberRef, ...(item.cancel === true ? { cancel: true } : {}) });
        break;
      }
      case 'sale': {
        const ingredientId = str(item.ingredientId);
        if (ingredientId) out.push({ type, ingredientId });
        break;
      }
      case 'out_of_stock': {
        const ingredientId = str(item.ingredientId);
        if (ingredientId) out.push({ type, ingredientId, ...(item.question === true ? { question: true } : {}) });
        break;
      }
      case 'have': {
        const ingredientId = str(item.ingredientId);
        if (ingredientId) {
          out.push({
            type,
            ingredientId,
            ...(item.question === true ? { question: true } : {}),
            ...(item.frozen === true ? { frozen: true } : {}),
          });
        }
        break;
      }
      case 'request': {
        const cmd: Extract<ParsedCommand, { type: 'request' }> = { type };
        const date = str(item.date);
        const dishId = str(item.dishId);
        const protein = str(item.protein);
        const genre = str(item.genre);
        const ingredientId = str(item.ingredientId);
        if (date) cmd.date = date;
        if (dishId) cmd.dishId = dishId;
        if (protein) cmd.protein = protein as Protein;
        if (genre) cmd.genre = genre as Genre;
        if (ingredientId) cmd.ingredientId = ingredientId;
        out.push(cmd);
        break;
      }
    }
  }
  return out;
}
