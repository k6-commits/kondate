// 夕方の配信（POST /cron/evening）：保存されたすべての送り元について日付を今日まで進め、
// 有料版の世帯にだけ、たまっている配信（今日の分と、届けそびれた週の献立）を push で送ってから空にする。無料版には送らない。
// 文面は送る直前の state で作り直す（pushesToSend）。週の献立は土日にもできるので、cron は毎日（土日も）呼ぶ。
import type { Catalog } from '../src/engine/index';
import { jstToday, pushesToSend, syncRecord } from './household';
import { toLineMessages, type LineClient } from './line';
import { errorKind, type Logger } from './log';
import type { Store } from './store';

export interface EveningDeps {
  store: Store;
  catalog: Catalog;
  line: LineClient | null;
  now: () => Date;
  logger: Logger;
}

export interface EveningResult {
  /** 保存されている世帯（送り元）の数。 */
  households: number;
  /** push を送った世帯の数。 */
  pushed: number;
}

export async function runEvening(deps: EveningDeps): Promise<EveningResult> {
  const { store, catalog, line, logger } = deps;
  const today = jstToday(deps.now());
  const records = await store.list();
  let pushed = 0;
  let warnedNoToken = false;
  for (const listed of records) {
    try {
      await store.update(listed.key, async (current) => {
        if (!current) return null;
        // 31日より古い世帯は、ここでは作り直さない（次の書き込みのときに、あいさつと一緒に作り直す）。
        const synced = syncRecord(current, catalog, today);
        if (!synced) return null;
        if (synced.state.household.settings.plan !== 'paid') return { ...synced, pendingPush: [] };
        // 有料版：同期でできた「作りましたか？」（まだ届けていないもの）と、今日の配信（今の献立で作り直したもの）を送る。
        const messages = [...synced.pendingReply, ...pushesToSend(synced.state, catalog, synced.pendingPush)];
        if (messages.length === 0) return { ...synced, pendingPush: [] }; // もう送るものがない（作った日の分など）
        if (!line) {
          if (!warnedNoToken) logger.warn('LINE_CHANNEL_ACCESS_TOKEN がないので、配信できません');
          warnedNoToken = true;
          return synced;
        }
        const ok = await line.push(synced.sourceId, toLineMessages(synced.state, catalog, messages));
        if (!ok) return synced; // 送れなかった分は残す（同じ日にもう一度呼べば送り直す）
        pushed += 1;
        return { ...synced, pendingPush: [], pendingReply: [] };
      });
    } catch (e) {
      logger.error('夕方の配信で、世帯の処理に失敗しました', { error: errorKind(e) });
    }
  }
  return { households: records.length, pushed };
}
