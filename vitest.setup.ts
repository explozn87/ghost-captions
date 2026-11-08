// Registers @testing-library/jest-dom matchers for component tests.
import '@testing-library/jest-dom/vitest';

// jsdom has no canvas backend, so HTMLCanvasElement.getContext throws and logs
// a noisy "Not implemented" error to stderr every time the Player mounts. The
// Player already tolerates a missing context (the overlay is purely visual;
// every piece of information also lives in the text event list), so the test
// run is green either way. We install a minimal no-op 2D context here only to
// keep stderr clean, so a genuine failure is never buried under this noise.
// This does not assert anything about the overlay — the overlay's geometry is
// covered by the pure layout/draw tests that run without jsdom's canvas.
function makeNoopCtx(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        // `draw()` reads `ctx.canvas.width`/`.height` (see Ctx2D in
        // src/overlay/draw.ts), so the stub must expose the real canvas, not
        // `undefined` — otherwise `ctx.canvas.width` throws and crashes the
        // Player's render loop. Everything else is a no-op; measureText needs
        // an object. Numeric-ish state reads return 0.
        if (prop === 'canvas') return canvas;
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'createRadialGradient')
          return () => ({ addColorStop: () => undefined });
        return () => undefined;
      },
      set() {
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    contextId: string,
  ): CanvasRenderingContext2D | null {
    return contextId === '2d' ? makeNoopCtx(this) : null;
  } as HTMLCanvasElement['getContext'];
}


// The export flow creates an <a download> and calls .click() to start a local
// download — correct browser behaviour (the `download` attribute means the
// browser saves the blob instead of navigating). jsdom cannot follow the blob:
// URL and raises "Not implemented: navigation (except hash changes)".
//
// jsdom runs an anchor's activation behaviour (which follows the hyperlink and
// hits that navigation path) for ANY click event dispatch on the element,
// trusted or synthetic — so simply dispatching a synthetic click is not enough
// to avoid it. We instead blank the `href` for the duration of the dispatch so
// there is no URL to navigate to, then restore it. The click event itself
// still fires, so any onClick handlers under test run normally; only the
// navigation side effect is neutralised.
if (typeof HTMLAnchorElement !== 'undefined') {
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    if (this.hasAttribute('download')) {
      const savedHref = this.getAttribute('href');
      this.removeAttribute('href');
      try {
        this.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        );
      } finally {
        if (savedHref !== null) this.setAttribute('href', savedHref);
      }
      return;
    }
    return realClick.call(this);
  };
}
