// @vitest-environment jsdom
// PWA の窓口：'pwa' の版（vite の mode が 'pwa'）のふるまい。サービスワーカーとブラウザの API は偽物に差し替える。
// 偽物は、ブラウザと同じ順で動かす（登録の waiting・active が変わってから、ワーカーの statechange が届く）。
import type * as PwaModule from './index';
import type * as UpdatesModule from './updates';

type WorkerState = 'parsed' | 'installing' | 'installed' | 'activating' | 'activated' | 'redundant';

class FakeWorker extends EventTarget {
  state: WorkerState;
  readonly scriptURL = 'http://localhost:3000/sw.js';
  readonly postMessage = vi.fn();
  constructor(state: WorkerState) {
    super();
    this.state = state;
  }
  to(state: WorkerState): void {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;
  readonly update = vi.fn(async () => this);
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null = null;
  readonly registration = new FakeRegistration();
  readonly register = vi.fn(async (_url: string, _options?: RegistrationOptions) => this.registration);
}

/** 前の版が動いているところに、新しい版が見つかってインストールされる（前の版があるので待つ）。 */
function findNewVersion(reg: FakeRegistration): FakeWorker {
  const worker = new FakeWorker('installing');
  reg.installing = worker;
  reg.dispatchEvent(new Event('updatefound'));
  reg.waiting = worker;
  reg.installing = null;
  worker.to('installed');
  return worker;
}

/** はじめてのインストール（前の版がないので、待たずに動き始め、clientsClaim でページを受け持つ）。 */
function installFirstVersion(container: FakeContainer): FakeWorker {
  const reg = container.registration;
  const worker = new FakeWorker('installing');
  reg.installing = worker;
  reg.dispatchEvent(new Event('updatefound'));
  reg.waiting = worker;
  reg.installing = null;
  worker.to('installed');
  reg.waiting = null;
  reg.active = worker;
  worker.to('activating');
  container.controller = worker;
  container.dispatchEvent(new Event('controllerchange'));
  worker.to('activated');
  return worker;
}

/** 待っている版が SKIP_WAITING を受けて動き始める（claimed: ページを受け持つか）。 */
function activateWaiting(container: FakeContainer, claimed = true): FakeWorker {
  const reg = container.registration;
  const worker = reg.waiting!;
  reg.waiting = null;
  reg.active = worker;
  worker.to('activating');
  if (claimed) {
    container.controller = worker;
    container.dispatchEvent(new Event('controllerchange'));
  }
  worker.to('activated');
  return worker;
}

/** 前に開いたときから動いている版（このページを受け持っている）。 */
function withActiveVersion(container: FakeContainer): FakeWorker {
  const worker = new FakeWorker('activated');
  container.registration.active = worker;
  container.controller = worker;
  return worker;
}

const stubbed: Array<[object, string]> = [];
function stub(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  stubbed.push([target, key]);
}
function stubGetter(target: object, key: string, get: () => unknown): void {
  Object.defineProperty(target, key, { get, configurable: true });
  stubbed.push([target, key]);
}

function useContainer(container = new FakeContainer()): FakeContainer {
  stub(navigator, 'serviceWorker', container);
  return container;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let pwa: typeof PwaModule;
let updates: typeof UpdatesModule;
let reload: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('MODE', 'pwa');
  vi.stubEnv('DEV', false); // ビルドした版（開発用のサーバーでは登録しない）
  pwa = await import('./index');
  updates = await import('./updates');
  reload = vi.fn<() => void>();
  vi.spyOn(updates.page, 'reload').mockImplementation(reload);
});

afterEach(() => {
  // 前のテストのモジュールが window に付けた聞き手を外す（appinstalled で聞くのをやめる）。
  window.dispatchEvent(new Event('appinstalled'));
  for (const [target, key] of stubbed.splice(0)) Reflect.deleteProperty(target, key);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** registerServiceWorker のあと、登録が済むまで待つ。 */
async function registered(container: FakeContainer): Promise<void> {
  await vi.waitFor(() => expect(container.register).toHaveBeenCalled());
  await flush();
}

describe("'pwa' の版", () => {
  it('APP_TARGET は pwa', () => {
    expect(pwa.APP_TARGET).toBe('pwa');
  });
});

describe('registerServiceWorker', () => {
  it('ページと同じフォルダの sw.js を、同じフォルダより下を受け持つよう登録する', async () => {
    const container = useContainer();
    pwa.registerServiceWorker(vi.fn());
    await registered(container);
    expect(container.register).toHaveBeenCalledTimes(1);
    expect(container.register).toHaveBeenCalledWith('./sw.js', { scope: './' });
  });

  it('はじめてのインストールでは知らせない', async () => {
    const container = useContainer();
    const onUpdateReady = vi.fn();
    pwa.registerServiceWorker(onUpdateReady);
    await registered(container);
    installFirstVersion(container);
    await flush();
    expect(onUpdateReady).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('ページの読み込みが終わってから登録する', async () => {
    const container = useContainer();
    stubGetter(document, 'readyState', () => 'interactive');
    pwa.registerServiceWorker(vi.fn());
    await flush();
    await flush();
    expect(container.register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    await registered(container);
    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it('開発用のサーバー（vite --mode pwa）では登録しない（sw.js がなく、ブラウザがエラーを出すので）', async () => {
    vi.stubEnv('DEV', true);
    const container = useContainer();
    const onUpdateReady = vi.fn();
    expect(() => pwa.registerServiceWorker(onUpdateReady)).not.toThrow();
    await flush();
    await flush();
    expect(container.register).not.toHaveBeenCalled();
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it('サービスワーカーが使えないブラウザでは何もしない（投げない）', async () => {
    expect('serviceWorker' in navigator).toBe(false);
    const onUpdateReady = vi.fn();
    expect(() => pwa.registerServiceWorker(onUpdateReady)).not.toThrow();
    await flush();
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it('前に開いたときから待っている新しい版があれば、1回だけ知らせる', async () => {
    const container = useContainer();
    withActiveVersion(container);
    container.registration.waiting = new FakeWorker('installed');
    const onUpdateReady = vi.fn();
    pwa.registerServiceWorker(onUpdateReady);
    await registered(container);
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it('開いている間に見つかった新しい版を、版ごとに1回ずつ知らせる', async () => {
    const container = useContainer();
    withActiveVersion(container);
    const onUpdateReady = vi.fn();
    pwa.registerServiceWorker(onUpdateReady);
    await registered(container);
    expect(onUpdateReady).not.toHaveBeenCalled();

    const second = findNewVersion(container.registration);
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
    // 同じ版の知らせが重なっても、もう一度は呼ばない。
    second.dispatchEvent(new Event('statechange'));
    container.registration.dispatchEvent(new Event('updatefound'));
    expect(onUpdateReady).toHaveBeenCalledTimes(1);

    // さらに新しい版（前に待っていた版は捨てられる）。
    second.to('redundant');
    findNewVersion(container.registration);
    expect(onUpdateReady).toHaveBeenCalledTimes(2);
  });

  it('登録の時点でインストール中の版も見守る', async () => {
    const container = useContainer();
    withActiveVersion(container);
    const installing = new FakeWorker('installing');
    container.registration.installing = installing;
    const onUpdateReady = vi.fn();
    pwa.registerServiceWorker(onUpdateReady);
    await registered(container);
    container.registration.waiting = installing;
    container.registration.installing = null;
    installing.to('installed');
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it('インストールに失敗した版は知らせない', async () => {
    const container = useContainer();
    withActiveVersion(container);
    const onUpdateReady = vi.fn();
    pwa.registerServiceWorker(onUpdateReady);
    await registered(container);
    const worker = new FakeWorker('installing');
    container.registration.installing = worker;
    container.registration.dispatchEvent(new Event('updatefound'));
    container.registration.installing = null;
    worker.to('redundant');
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it('2回呼んでも登録は1回。どちらの知らせる先にも、版ごとに1回ずつ知らせる（後から来た先には、待っている版をすぐ知らせる）', async () => {
    const container = useContainer();
    withActiveVersion(container);
    const first = vi.fn();
    const second = vi.fn();
    pwa.registerServiceWorker(first);
    await registered(container);
    findNewVersion(container.registration);
    expect(first).toHaveBeenCalledTimes(1);

    pwa.registerServiceWorker(second);
    pwa.registerServiceWorker(first);
    await flush();
    expect(container.register).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('知らせる先が投げても、ほかの先には知らせる（投げない）', async () => {
    const container = useContainer();
    withActiveVersion(container);
    const broken = vi.fn(() => {
      throw new Error('画面の不調');
    });
    const fine = vi.fn();
    pwa.registerServiceWorker(broken);
    pwa.registerServiceWorker(fine);
    await registered(container);
    expect(() => findNewVersion(container.registration)).not.toThrow();
    expect(broken).toHaveBeenCalledTimes(1);
    expect(fine).toHaveBeenCalledTimes(1);
  });

  it('登録に失敗しても投げない。次に呼ばれたら、もう一度登録を試す', async () => {
    const container = useContainer();
    container.register.mockRejectedValueOnce(new DOMException('sw.js が読めません', 'SecurityError'));
    const onUpdateReady = vi.fn();
    expect(() => pwa.registerServiceWorker(onUpdateReady)).not.toThrow();
    await registered(container);
    expect(onUpdateReady).not.toHaveBeenCalled();

    pwa.registerServiceWorker(onUpdateReady);
    await vi.waitFor(() => expect(container.register).toHaveBeenCalledTimes(2));
  });

  it('register がその場で投げても、投げない', async () => {
    const container = useContainer();
    container.register.mockImplementationOnce(() => {
      throw new TypeError('壊れた register');
    });
    expect(() => pwa.registerServiceWorker(vi.fn())).not.toThrow();
    await registered(container);
  });

  describe('はじめて開いたときのフォント', () => {
    const FONT_CSS = 'https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap';
    const FONT_FILE = 'https://fonts.gstatic.com/s/bizudpgothic/v16/a.0.woff2';
    function loadedResources(names: string[]) {
      stub(performance, 'getEntriesByType', (type: string) => (type === 'resource' ? names.map((name) => ({ name })) : []));
    }

    it('サービスワーカーが受け持ったら、それまでに読み込んだ Google Fonts だけを、サービスワーカーを通して読み込み直す', async () => {
      const container = useContainer();
      const fetchMock = vi.fn(async (_url: string) => new Response(''));
      vi.stubGlobal('fetch', fetchMock);
      loadedResources([FONT_CSS, FONT_FILE, FONT_FILE, 'http://localhost:3000/assets/index-abc.js', 'https://example.com/a.css']);
      pwa.registerServiceWorker(vi.fn());
      await registered(container);
      expect(fetchMock).not.toHaveBeenCalled();
      installFirstVersion(container);
      await flush();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([FONT_CSS, FONT_FILE]);
      // そのあとの切り替え（controllerchange）では、もう読み込み直さない。
      container.dispatchEvent(new Event('controllerchange'));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('前に開いたときから受け持たれているページでは、読み込み直さない（フォントはサービスワーカーを通って届いている）', async () => {
      const container = useContainer();
      withActiveVersion(container);
      const fetchMock = vi.fn(async (_url: string) => new Response(''));
      vi.stubGlobal('fetch', fetchMock);
      loadedResources([FONT_CSS, FONT_FILE]);
      pwa.registerServiceWorker(vi.fn());
      await registered(container);
      findNewVersion(container.registration);
      activateWaiting(container);
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('読み込み直しに失敗しても・調べられなくても、投げない', async () => {
      const container = useContainer();
      // vi.fn は返した Promise に自分で then を付ける（拒否が「受けた」ことになる）ので、ふつうの関数で数える。
      let fetched = 0;
      vi.stubGlobal('fetch', (_url: string) => {
        fetched += 1;
        return Promise.reject(new TypeError('Failed to fetch'));
      });
      loadedResources([FONT_CSS]);
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);
      pwa.registerServiceWorker(vi.fn());
      await registered(container);
      expect(() => installFirstVersion(container)).not.toThrow();
      await flush();
      await flush();
      process.off('unhandledRejection', onUnhandled);
      expect(fetched).toBe(1);
      expect(unhandled).toEqual([]);
      stub(performance, 'getEntriesByType', () => {
        throw new Error('使えません');
      });
      expect(() => updates.keepEarlyFonts()).not.toThrow();
    });
  });

  describe('新しい版を確かめる', () => {
    it('60分ごとに確かめる', async () => {
      const MINUTE = 60 * 1000;
      expect(updates.UPDATE_CHECK_INTERVAL_MS).toBe(60 * MINUTE);
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const container = useContainer();
      withActiveVersion(container);
      pwa.registerServiceWorker(vi.fn());
      await registered(container);
      const { update } = container.registration;
      vi.advanceTimersByTime(59 * MINUTE);
      await flush();
      expect(update).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1 * MINUTE);
      await flush();
      expect(update).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60 * MINUTE);
      await flush();
      expect(update).toHaveBeenCalledTimes(2);
    });

    it('アプリが前に出てきたとき（visibilitychange で visible）に確かめる。隠れたときは確かめない', async () => {
      const container = useContainer();
      withActiveVersion(container);
      pwa.registerServiceWorker(vi.fn());
      await registered(container);
      const { update } = container.registration;

      stubGetter(document, 'visibilityState', () => 'hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(update).not.toHaveBeenCalled();

      stubGetter(document, 'visibilityState', () => 'visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('確かめている途中・インストール中・オフラインのときは、重ねて確かめない', async () => {
      const container = useContainer();
      withActiveVersion(container);
      pwa.registerServiceWorker(vi.fn());
      await registered(container);
      const reg = container.registration;
      stubGetter(document, 'visibilityState', () => 'visible');

      let finish: () => void = () => {};
      reg.update.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve(reg))));
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(reg.update).toHaveBeenCalledTimes(1);
      finish();
      await flush();

      reg.installing = new FakeWorker('installing');
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(reg.update).toHaveBeenCalledTimes(1);
      reg.installing = null;

      stub(navigator, 'onLine', false);
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(reg.update).toHaveBeenCalledTimes(1);

      stub(navigator, 'onLine', true);
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(reg.update).toHaveBeenCalledTimes(2);
    });

    it('確かめるのに失敗しても投げず、次の機会にまた確かめる', async () => {
      const container = useContainer();
      withActiveVersion(container);
      pwa.registerServiceWorker(vi.fn());
      await registered(container);
      const reg = container.registration;
      stubGetter(document, 'visibilityState', () => 'visible');
      reg.update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      reg.update.mockImplementationOnce(() => {
        throw new Error('その場で投げる');
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(reg.update).toHaveBeenCalledTimes(3);
    });
  });
});

describe('applyUpdate', () => {
  it('待っている版に SKIP_WAITING を送り、ページを受け持つ版が変わったら1回だけ読み直す', async () => {
    const container = useContainer();
    withActiveVersion(container);
    pwa.registerServiceWorker(vi.fn());
    await registered(container);
    const next = findNewVersion(container.registration);

    pwa.applyUpdate();
    pwa.applyUpdate(); // 2回押しても
    await flush();
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled(); // 切り替わるまでは読み直さない

    activateWaiting(container);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('受け持たれていなかったページは、新しい版が動き始めたら読み直す', async () => {
    const container = useContainer();
    container.registration.active = new FakeWorker('activated'); // 動いているが、このページは受け持っていない
    pwa.registerServiceWorker(vi.fn());
    await registered(container);
    findNewVersion(container.registration);
    pwa.applyUpdate();
    await flush();
    activateWaiting(container, false);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('さらに新しい版がインストール中なら、終わるのを待ってから、いちばん新しい版に切り替える（待っていた版を先に動かさない）', async () => {
    const container = useContainer();
    withActiveVersion(container);
    pwa.registerServiceWorker(vi.fn());
    await registered(container);
    const reg = container.registration;
    const second = findNewVersion(reg);
    const third = new FakeWorker('installing');
    reg.installing = third;
    reg.dispatchEvent(new Event('updatefound'));

    pwa.applyUpdate();
    pwa.applyUpdate(); // 待っているあいだに、もう一度押しても
    await flush();
    expect(second.postMessage).not.toHaveBeenCalled();
    expect(third.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    // ブラウザと同じ順：前に待っていた版が捨てられ、新しい版が待つ側に移ってから installed になる。
    second.to('redundant');
    reg.waiting = third;
    reg.installing = null;
    third.to('installed');
    await flush();
    expect(second.postMessage).not.toHaveBeenCalled();
    expect(third.postMessage).toHaveBeenCalledTimes(1);
    expect(third.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    activateWaiting(container);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('インストールを待ったあとに SKIP_WAITING を送れなくても、投げない', async () => {
    const container = useContainer();
    withActiveVersion(container);
    pwa.registerServiceWorker(vi.fn());
    await registered(container);
    const reg = container.registration;
    const second = findNewVersion(reg);
    const third = new FakeWorker('installing');
    third.postMessage.mockImplementation(() => {
      throw new DOMException('もう動いていません', 'InvalidStateError');
    });
    reg.installing = third;
    reg.dispatchEvent(new Event('updatefound'));
    pwa.applyUpdate();
    await flush();
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener('error', onError);
    second.to('redundant');
    reg.waiting = third;
    reg.installing = null;
    expect(() => third.to('installed')).not.toThrow();
    await flush();
    window.removeEventListener('error', onError);
    expect(third.postMessage).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('インストール中の版が失敗したら、待っていた版に切り替える', async () => {
    const container = useContainer();
    withActiveVersion(container);
    pwa.registerServiceWorker(vi.fn());
    await registered(container);
    const reg = container.registration;
    const second = findNewVersion(reg);
    const third = new FakeWorker('installing');
    reg.installing = third;
    reg.dispatchEvent(new Event('updatefound'));

    pwa.applyUpdate();
    await flush();
    expect(second.postMessage).not.toHaveBeenCalled();
    reg.installing = null;
    third.to('redundant');
    await flush();
    expect(second.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    activateWaiting(container);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('新しい版が待っていなければ何もしない', async () => {
    const container = useContainer();
    withActiveVersion(container);
    pwa.registerServiceWorker(vi.fn());
    await registered(container);
    pwa.applyUpdate();
    await flush();
    container.dispatchEvent(new Event('controllerchange'));
    await flush();
    expect(reload).not.toHaveBeenCalled();
  });

  it('知らせた版が、ほかの窓で先に切り替わっていたら、読み直すだけ', async () => {
    const container = useContainer();
    withActiveVersion(container);
    pwa.registerServiceWorker(vi.fn());
    await registered(container);
    const next = findNewVersion(container.registration);
    activateWaiting(container); // ほかの窓で［更新する］
    await flush();
    expect(reload).not.toHaveBeenCalled(); // 頼まれていないので、自分では読み直さない

    pwa.applyUpdate();
    await flush();
    expect(next.postMessage).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('登録の前・サービスワーカーが使えないときは何もしない（投げない）', async () => {
    expect(() => pwa.applyUpdate()).not.toThrow();
    await flush();
    expect(reload).not.toHaveBeenCalled();
  });

  it('SKIP_WAITING を送れなくても投げない', async () => {
    const container = useContainer();
    withActiveVersion(container);
    pwa.registerServiceWorker(vi.fn());
    await registered(container);
    const next = findNewVersion(container.registration);
    next.postMessage.mockImplementation(() => {
      throw new DOMException('もう動いていません', 'InvalidStateError');
    });
    expect(() => pwa.applyUpdate()).not.toThrow();
    await flush();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('requestPersistentStorage', () => {
  it('頼んで、残すことになったら true', async () => {
    const persist = vi.fn(async () => true);
    stub(navigator, 'storage', { persist, persisted: vi.fn(async () => false) });
    await expect(pwa.requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('すでに残すことになっていれば、頼まずに true', async () => {
    const persist = vi.fn(async () => true);
    stub(navigator, 'storage', { persist, persisted: vi.fn(async () => true) });
    await expect(pwa.requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('断られたら false', async () => {
    stub(navigator, 'storage', { persist: vi.fn(async () => false), persisted: vi.fn(async () => false) });
    await expect(pwa.requestPersistentStorage()).resolves.toBe(false);
  });

  it('頼めない（storage・persist がない）・失敗した・その場で投げたら false', async () => {
    await expect(pwa.requestPersistentStorage()).resolves.toBe(false);
    stub(navigator, 'storage', {});
    await expect(pwa.requestPersistentStorage()).resolves.toBe(false);
    stub(navigator, 'storage', { persist: vi.fn(async () => Promise.reject(new Error('拒否'))) });
    await expect(pwa.requestPersistentStorage()).resolves.toBe(false);
    stub(navigator, 'storage', {
      persist: vi.fn(() => {
        throw new Error('その場で投げる');
      }),
    });
    await expect(pwa.requestPersistentStorage()).resolves.toBe(false);
  });
});

describe('listenInstallPrompt', () => {
  function installPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
    return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome, platform: 'web' }),
    });
  }

  it('確認が使えるようになったら、ブラウザの案内を止めて install を渡す。入れたら true、確認は1回だけ', async () => {
    const onAvailable = vi.fn();
    const stop = pwa.listenInstallPrompt(onAvailable);
    const event = installPromptEvent('accepted');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onAvailable).toHaveBeenCalledTimes(1);
    const install = onAvailable.mock.calls[0][0] as () => Promise<boolean>;
    await expect(install()).resolves.toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    await expect(install()).resolves.toBe(false);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    stop();
  });

  it('聞き始める前に来ていた確認も、聞き始めたときに渡す', async () => {
    const event = installPromptEvent('accepted');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const onAvailable = vi.fn();
    pwa.listenInstallPrompt(onAvailable);
    expect(onAvailable).toHaveBeenCalledTimes(1);
    const install = onAvailable.mock.calls[0][0] as () => Promise<boolean>;
    await expect(install()).resolves.toBe(true);
    // 使った確認は、あとから聞き始めた先には渡さない。
    const later = vi.fn();
    pwa.listenInstallPrompt(later);
    expect(later).not.toHaveBeenCalled();
  });

  it('断られた・確認を出せなかったら false（投げない）', async () => {
    const onAvailable = vi.fn();
    pwa.listenInstallPrompt(onAvailable);
    window.dispatchEvent(installPromptEvent('dismissed'));
    const dismissed = onAvailable.mock.calls[0][0] as () => Promise<boolean>;
    await expect(dismissed()).resolves.toBe(false);

    const broken = installPromptEvent();
    broken.prompt.mockRejectedValueOnce(new DOMException('ユーザーの操作がありません', 'NotAllowedError'));
    window.dispatchEvent(broken);
    expect(onAvailable).toHaveBeenCalledTimes(2);
    const failing = onAvailable.mock.calls[1][0] as () => Promise<boolean>;
    await expect(failing()).resolves.toBe(false);
  });

  it('聞くのをやめたら、もう渡さない', () => {
    const onAvailable = vi.fn();
    const stop = pwa.listenInstallPrompt(onAvailable);
    stop();
    window.dispatchEvent(installPromptEvent());
    expect(onAvailable).not.toHaveBeenCalled();
  });

  it('アプリが入ったら（appinstalled）聞くのをやめ、残っていた install も false', async () => {
    const onAvailable = vi.fn();
    pwa.listenInstallPrompt(onAvailable);
    const event = installPromptEvent();
    window.dispatchEvent(event);
    const install = onAvailable.mock.calls[0][0] as () => Promise<boolean>;
    window.dispatchEvent(new Event('appinstalled'));
    await expect(install()).resolves.toBe(false);
    expect(event.prompt).not.toHaveBeenCalled();

    const next = installPromptEvent();
    window.dispatchEvent(next);
    expect(next.defaultPrevented).toBe(false);
    expect(onAvailable).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    pwa.listenInstallPrompt(late);
    expect(late).not.toHaveBeenCalled();
  });

  it('知らせる先が投げても、投げない', () => {
    pwa.listenInstallPrompt(() => {
      throw new Error('画面の不調');
    });
    const event = installPromptEvent();
    expect(() => window.dispatchEvent(event)).not.toThrow();
    expect(event.defaultPrevented).toBe(true);
  });
});
