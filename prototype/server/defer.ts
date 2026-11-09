// webhook の後処理（200 を返したあとに続ける処理）。終わるのを待てるようにしておく（テストと、止めるとき用）。
import { errorKind, type Logger } from './log';

export type Defer = (task: () => Promise<void>) => void;

export interface DeferQueue {
  defer: Defer;
  /** 今ある後処理（と、その間に増えた後処理）がすべて終わるまで待つ。 */
  idle(): Promise<void>;
  readonly size: number;
}

export function createDeferQueue(logger: Logger): DeferQueue {
  const pending = new Set<Promise<void>>();
  return {
    defer(task) {
      const p: Promise<void> = Promise.resolve()
        .then(task)
        .catch((e: unknown) => logger.error('後処理に失敗しました', { kind: errorKind(e) }))
        .finally(() => {
          pending.delete(p);
        });
      pending.add(p);
    },
    async idle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    get size() {
      return pending.size;
    },
  };
}
