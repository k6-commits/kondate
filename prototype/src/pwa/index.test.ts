// @vitest-environment jsdom
// PWA の窓口：'web' の版（テストの mode は 'test' なので APP_TARGET は 'web'）では何もしないこと、と端末の判定。
// 'pwa' の版のふるまいは pwa-target.test.ts。
import {
  APP_TARGET,
  applyUpdate,
  isIos,
  isLineInAppBrowser,
  isStandalone,
  listenInstallPrompt,
  registerServiceWorker,
  requestPersistentStorage,
} from './index';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPHONE_LINE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.10.0';
const ANDROID_LINE_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 Line/15.10.1/IAB';
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';

const stubbed: Array<[object, string]> = [];
function stub(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  stubbed.push([target, key]);
}

afterEach(() => {
  for (const [target, key] of stubbed.splice(0)) Reflect.deleteProperty(target, key);
  vi.restoreAllMocks();
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("'web' の版（claude.ai の Artifact・開発用）", () => {
  it('APP_TARGET は web', () => {
    expect(APP_TARGET).toBe('web');
  });

  it('registerServiceWorker は、サービスワーカーが使えても登録しない', async () => {
    await import('./updates'); // 読み込みを先に済ませておき、もし登録に進んだらすぐ register に届くようにする
    const register = vi.fn(async () => ({ addEventListener: vi.fn(), installing: null, waiting: null, active: null }));
    stub(navigator, 'serviceWorker', { register, addEventListener: vi.fn() });
    const onUpdateReady = vi.fn();
    expect(() => registerServiceWorker(onUpdateReady)).not.toThrow();
    for (let i = 0; i < 5; i += 1) await flush();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(register).not.toHaveBeenCalled();
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it('applyUpdate は何もしない（投げない）', () => {
    expect(() => applyUpdate()).not.toThrow();
  });

  it('requestPersistentStorage は頼まずに false', async () => {
    const persist = vi.fn(async () => true);
    stub(navigator, 'storage', { persist, persisted: vi.fn(async () => false) });
    await expect(requestPersistentStorage()).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('listenInstallPrompt は聞かない（ブラウザの案内も止めない）', () => {
    const onAvailable = vi.fn();
    const stop = listenInstallPrompt(onAvailable);
    expect(typeof stop).toBe('function');
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onAvailable).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});

describe('isStandalone', () => {
  it('iOS のホーム画面から開いた（navigator.standalone）', () => {
    stub(navigator, 'standalone', true);
    expect(isStandalone()).toBe(true);
  });

  it('display-mode: standalone なら true、ブラウザのタブなら false', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === '(display-mode: standalone)' }));
    stub(window, 'matchMedia', matchMedia);
    expect(isStandalone()).toBe(true);
    stub(window, 'matchMedia', vi.fn(() => ({ matches: false })));
    expect(isStandalone()).toBe(false);
  });

  it('matchMedia がない・投げるときは false', () => {
    stub(window, 'matchMedia', undefined);
    expect(isStandalone()).toBe(false);
    stub(
      window,
      'matchMedia',
      vi.fn(() => {
        throw new Error('no');
      }),
    );
    expect(isStandalone()).toBe(false);
  });
});

describe('isIos', () => {
  it('iPhone は true', () => {
    stub(navigator, 'userAgent', IPHONE_UA);
    expect(isIos()).toBe(true);
  });

  it('Mac のふりをする iPadOS の Safari（MacIntel でタッチできる）は true、本物の Mac は false', () => {
    stub(navigator, 'userAgent', MAC_SAFARI_UA);
    stub(navigator, 'platform', 'MacIntel');
    stub(navigator, 'maxTouchPoints', 5);
    expect(isIos()).toBe(true);
    stub(navigator, 'maxTouchPoints', 0);
    expect(isIos()).toBe(false);
  });

  it('Android は false', () => {
    stub(navigator, 'userAgent', ANDROID_CHROME_UA);
    stub(navigator, 'platform', 'Linux armv8l');
    expect(isIos()).toBe(false);
  });
});

describe('isLineInAppBrowser', () => {
  it('LINE のアプリの中のブラウザ（iPhone・Android）は true', () => {
    stub(navigator, 'userAgent', IPHONE_LINE_UA);
    expect(isLineInAppBrowser()).toBe(true);
    stub(navigator, 'userAgent', ANDROID_LINE_UA);
    expect(isLineInAppBrowser()).toBe(true);
  });

  it('Safari・Chrome は false', () => {
    stub(navigator, 'userAgent', IPHONE_UA);
    expect(isLineInAppBrowser()).toBe(false);
    stub(navigator, 'userAgent', ANDROID_CHROME_UA);
    expect(isLineInAppBrowser()).toBe(false);
  });
});
