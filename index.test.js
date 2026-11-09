import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./src/styles.css', import.meta.url), 'utf8');
const pageUrl = new URL('./index.html', import.meta.url).href;

/**
 * @param {string} source
 * @param {string} selector
 * @returns {string}
 */
function ruleBody(source, selector) {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'g');
  const bodies = [];
  for (const match of source.matchAll(pattern)) {
    bodies.push(match[1] ?? '');
  }
  return bodies.join('\n');
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} block
 * @returns {boolean}
 */
function hidesContent(block) {
  return /display\s*:\s*none\b|visibility\s*:\s*hidden\b|opacity\s*:\s*0\b|content-visibility\s*:\s*hidden\b|(?:left|top|right)\s*:\s*-\d{3,}|clip\s*:|clip-path\s*:/.test(block);
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function mediaBodies(source) {
  /** @type {string[]} */
  const bodies = [];
  const marker = /@media[^{]*\{/g;
  for (const match of source.matchAll(marker)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let index = start;
    for (; index < source.length && depth > 0; index += 1) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') depth -= 1;
    }
    bodies.push(source.slice(start, index - 1));
  }
  return bodies;
}

/**
 * @param {number} channel
 * @returns {number}
 */
function linearize(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {[number, number, number]} rgb
 * @returns {number}
 */
function luminance(rgb) {
  return (0.2126 * linearize(rgb[0])) + (0.7152 * linearize(rgb[1])) + (0.0722 * linearize(rgb[2]));
}

/**
 * @param {string} color
 * @returns {[number, number, number]}
 */
function parseRgb(color) {
  const match = color.match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
  assert.ok(match, `expected an rgb color, received ${color}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * @param {string} foreground
 * @param {string} background
 * @returns {number}
 */
function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(parseRgb(foreground)), luminance(parseRgb(background)));
  const darker = Math.min(luminance(parseRgb(foreground)), luminance(parseRgb(background)));
  return (lighter + 0.05) / (darker + 0.05);
}

test('skip link is visible at the top and is the first tab stop', () => {
  const bodyStart = html.search(/<body\b/i);
  const skipLink = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/i);
  assert.ok(bodyStart >= 0, 'page has a body');
  assert.ok(skipLink?.index !== undefined && skipLink.index > bodyStart, 'skip link is inside the body');
  assert.ok(skipLink, 'skip link exists');

  const tag = skipLink[0];
  assert.match(tag, /\bclass="skip-link"/);
  assert.match(tag, /\bhref="#main"/);
  assert.equal(tag.replace(/<[^>]+>/g, '').trim(), 'Skip to content');
  assert.doesNotMatch(tag, /\baria-hidden\s*=\s*["']true["']/i);
  assert.doesNotMatch(tag, /\bhidden\b/i);
  assert.doesNotMatch(tag, /\btabindex\s*=\s*["']-1["']/i);
  assert.doesNotMatch(html, /<style\b|style\s*=/i);

  const beforeSkipLink = html.slice(bodyStart, skipLink.index);
  assert.doesNotMatch(
    beforeSkipLink,
    /<(a|button|input|select|textarea|summary)\b|\btabindex\s*=\s*["'](?!-1)\d/i,
    'no focusable control precedes the skip link',
  );

  const skipLinkRule = ruleBody(css, '.skip-link');
  assert.notEqual(skipLinkRule.trim(), '', 'skip link has a style rule');
  assert.equal(hidesContent(skipLinkRule), false, 'skip link stays visible before it is focused');
  assert.doesNotMatch(skipLinkRule, /position\s*:\s*(?:absolute|fixed)\b/);
  assert.match(skipLinkRule, /display\s*:\s*flex\b/);
  assert.match(skipLinkRule, /min-height\s*:\s*2\.75rem\b/);
  assert.match(skipLinkRule, /width\s*:\s*min\(40rem,\s*calc\(100%\s*-\s*2rem\)\)/);
  assert.match(skipLinkRule, /background-color\s*:\s*var\(--color-button-bg\)/);
  assert.match(skipLinkRule, /color\s*:\s*var\(--color-button-text\)/);
  assert.equal(
    mediaBodies(css).some((body) => body.includes('.skip-link')),
    false,
    'skip link styles are not limited to one viewport or color scheme',
  );
});

test('skip link targets a focusable main region placed after navigation', () => {
  const skipLinkAt = html.search(/<a\b[^>]*\bclass="skip-link"/);
  const navAt = html.search(/<nav\b/);
  const mainTag = html.match(/<main\b[^>]*>/i);
  assert.ok(mainTag?.index !== undefined, 'main element exists');
  assert.ok(mainTag, 'main element exists');
  assert.ok(skipLinkAt < navAt && navAt < mainTag.index, 'skip link comes before navigation and main');

  const mains = html.match(/<main\b[^>]*>/gi) ?? [];
  assert.equal(mains.length, 1);
  assert.match(mainTag[0], /\bid="main"/);
  assert.match(mainTag[0], /\btabindex="-1"/);
  assert.equal((html.match(/\bid="main"/g) ?? []).length, 1);
});

test('focused skip link and main content use a clearly visible outline', () => {
  const skipFocus = `${ruleBody(css, '.skip-link:focus')}\n${ruleBody(css, '.skip-link:focus-visible')}`;
  const mainFocus = ruleBody(css, 'main:focus');

  for (const [name, block] of [['skip link', skipFocus], ['main', mainFocus]]) {
    assert.match(block, /outline\s*:\s*3px\s+solid\s+var\(--color-focus\)\s*;/, `${name} focus outline is a 3px solid contrast ring`);
    assert.match(block, /outline-offset\s*:\s*[34]px\b/, `${name} focus ring is offset onto the page background`);
    assert.doesNotMatch(block, /outline\s*:\s*(?:none|0)\b|outline-style\s*:\s*none\b/, `${name} focus outline is not removed`);
    assert.equal(hidesContent(block), false, `${name} focus style stays visible`);
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, `${name} focus style uses contrast tokens`);
  }

  assert.match(skipFocus, /background-color\s*:\s*var\(--color-button-bg\)/);
  assert.match(skipFocus, /color\s*:\s*var\(--color-button-text\)/);
  assert.match(ruleBody(css, '.skip-link:visited'), /color\s*:\s*var\(--color-button-text\)/);
});

/**
 * @returns {string}
 */
function chromeBinary() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const candidate of [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return '';
}

/**
 * @returns {Promise<number>}
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not reserve a Chrome debugging port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * @typedef {{ id?: number, method?: string, params?: unknown, result?: any, error?: { message?: string } }} CdpMessage
 */

class CdpClient {
  /**
   * @param {WebSocket} ws
   */
  constructor(ws) {
    /** @type {WebSocket} */
    this.ws = ws;
    this.nextId = 1;
    /** @type {Map<number, { resolve: (value: any) => void, reject: (reason: Error) => void }>} */
    this.pending = new Map();
    /** @type {Map<string, Array<(params: any) => void>>} */
    this.events = new Map();
    ws.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      const message = /** @type {CdpMessage} */ (JSON.parse(raw));
      if (typeof message.id === 'number') {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message ?? 'CDP error'));
        else waiter.resolve(message.result);
        return;
      }
      if (typeof message.method === 'string') {
        for (const listener of this.events.get(message.method) ?? []) listener(message.params);
      }
    });
  }

  /**
   * @param {string} method
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<any>}
   */
  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  /**
   * @param {string} method
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  once(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timed out waiting for ${method}`));
      }, timeoutMs);
      const listeners = this.events.get(method) ?? [];
      /** @type {(params: any) => void} */
      const listener = (params) => {
        clearTimeout(timer);
        const remaining = (this.events.get(method) ?? []).filter((item) => item !== listener);
        this.events.set(method, remaining);
        resolve(params);
      };
      listeners.push(listener);
      this.events.set(method, listeners);
    });
  }

  close() {
    this.ws.close();
  }
}

/**
 * @typedef {{
 *   ok?: boolean,
 *   reason?: string,
 *   text?: string,
 *   href?: string | null,
 *   x?: number,
 *   y?: number,
 *   width?: number,
 *   height?: number,
 *   right?: number,
 *   bottom?: number,
 *   display?: string,
 *   visibility?: string,
 *   opacity?: number,
 *   innerWidth?: number,
 *   innerHeight?: number,
 *   scrollWidth?: number,
 *   hitIsSkipLink?: boolean,
 *   firstIsSkipLink?: boolean,
 *   textColor?: string,
 *   backgroundColor?: string,
 *   bodyBackground?: string,
 *   outlineColor?: string,
 *   outlineStyle?: string,
 *   outlineWidth?: string,
 * }} SkipLinkMeasurement
 */

const MEASURE_SKIP_LINK = `(() => {
  const link = document.querySelector('.skip-link');
  const main = document.getElementById('main');
  if (!(link instanceof HTMLElement) || !(main instanceof HTMLElement)) {
    return { ok: false, reason: 'missing skip link or main' };
  }
  const rect = link.getBoundingClientRect();
  const style = getComputedStyle(link);
  const bodyStyle = getComputedStyle(document.body);
  const hit = document.elementFromPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
  const focusable = [];
  for (const node of document.querySelectorAll('a, button, input, select, textarea, [tabindex]')) {
    if (!(node instanceof HTMLElement) || node.tabIndex < 0) continue;
    const nodeStyle = getComputedStyle(node);
    if (nodeStyle.display === 'none' || nodeStyle.visibility === 'hidden') continue;
    focusable.push(node);
  }
  return {
    ok: true,
    text: (link.textContent || '').replace(/\\s+/g, ' ').trim(),
    href: link.getAttribute('href'),
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
    display: style.display,
    visibility: style.visibility,
    opacity: Number(style.opacity),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    hitIsSkipLink: hit === link || (hit instanceof Node && link.contains(hit)),
    firstIsSkipLink: focusable[0] === link,
    textColor: style.color,
    backgroundColor: style.backgroundColor,
    bodyBackground: bodyStyle.backgroundColor,
    outlineColor: style.outlineColor,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
  };
})()`;

/**
 * @param {CdpClient} cdp
 * @param {string} expression
 * @returns {Promise<any>}
 */
async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  });
  const details = result?.exceptionDetails;
  if (details) {
    const description = details.exception?.description ?? details.text;
    throw new Error(description || 'page script failed');
  }
  return result?.result?.value;
}

/**
 * @param {CdpClient} cdp
 * @param {{ width: number, height: number, mobile: boolean }} viewport
 * @param {'light' | 'dark'} scheme
 * @param {string} label
 */
async function openPage(cdp, viewport, scheme, label) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await cdp.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  });
  const loaded = cdp.once('Page.loadEventFired');
  const separator = pageUrl.includes('?') ? '&' : '?';
  await cdp.send('Page.navigate', { url: `${pageUrl}${separator}case=${encodeURIComponent(label)}` });
  await loaded;
}

/**
 * @param {CdpClient} cdp
 * @param {string} key
 * @param {string} code
 * @param {number} keyCode
 * @param {string} [text]
 */
async function pressKey(cdp, key, code, keyCode, text) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: text ? 'keyDown' : 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    ...(text ? { text, unmodifiedText: text } : {}),
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

/**
 * @param {CdpClient} cdp
 * @returns {Promise<SkipLinkMeasurement>}
 */
async function measureSkipLink(cdp) {
  const measured = /** @type {SkipLinkMeasurement} */ (await evaluate(cdp, MEASURE_SKIP_LINK));
  assert.equal(measured?.ok, true, measured?.reason ?? 'could not measure the skip link');
  return measured;
}

/**
 * @param {string} label
 * @param {SkipLinkMeasurement} measured
 * @param {{ width: number, height: number }} viewport
 */
function assertSkipLinkVisible(label, measured, viewport) {
  assert.equal(measured.text, 'Skip to content', `${label} names the skip link`);
  assert.equal(measured.href, '#main', `${label} targets main`);
  assert.equal(measured.innerWidth, viewport.width, `${label} uses the requested viewport width`);
  assert.equal(measured.innerHeight, viewport.height, `${label} uses the requested viewport height`);
  assert.equal(measured.visibility, 'visible', `${label} skip link is visible`);
  assert.notEqual(measured.display, 'none', `${label} skip link is displayed`);
  assert.equal(measured.opacity, 1, `${label} skip link is opaque`);
  assert.equal(measured.firstIsSkipLink, true, `${label} skip link is the first tab stop`);
  assert.equal(measured.hitIsSkipLink, true, `${label} skip link is not covered`);
  assert.ok((measured.width ?? 0) >= 44, `${label} skip link is at least 44px wide`);
  assert.ok((measured.height ?? 0) >= 44, `${label} skip link is at least 44px tall`);
  assert.ok((measured.x ?? 0) >= 6, `${label} focus ring is inside the left edge`);
  assert.ok((measured.y ?? 0) >= 6, `${label} focus ring is inside the top edge`);
  assert.ok((measured.right ?? 0) <= (measured.innerWidth ?? 0) - 6, `${label} focus ring is inside the right edge`);
  assert.ok((measured.bottom ?? 0) <= (measured.innerHeight ?? 0), `${label} skip link is inside the viewport`);
  assert.ok((measured.scrollWidth ?? 0) <= (measured.innerWidth ?? 0) + 1, `${label} page does not scroll sideways`);
  const textContrast = contrastRatio(measured.textColor ?? '', measured.backgroundColor ?? '');
  assert.ok(textContrast >= 4.5, `${label} skip link text contrast is ${textContrast.toFixed(2)}:1`);
}

/**
 * @param {CdpClient} cdp
 * @param {string} label
 */
async function assertFocusedRing(cdp, label) {
  const measured = await measureSkipLink(cdp);
  assert.equal(measured.outlineWidth, '3px', `${label} focus outline is 3px`);
  assert.equal(measured.outlineStyle, 'solid', `${label} focus outline is solid`);
  const ringContrast = contrastRatio(measured.outlineColor ?? '', measured.bodyBackground ?? '');
  assert.ok(ringContrast >= 3, `${label} focus ring contrast is ${ringContrast.toFixed(2)}:1`);
}

/**
 * @param {string} binary
 */
async function launchChrome(binary) {
  const port = await freePort();
  const dataDir = await mkdtemp(join(tmpdir(), 'kavyro-skip-link-'));
  const child = spawn(binary, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${dataDir}`,
    'about:blank',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });

  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Chrome exited ${child.exitCode}: ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Chrome debugger did not start: ${stderr}`);

  const pages = /** @type {Array<{ type?: string, webSocketDebuggerUrl?: string }>} */ (
    await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  );
  const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) throw new Error(`Chrome did not open a page: ${stderr}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(undefined), { once: true });
    ws.addEventListener('error', () => reject(new Error('Chrome page socket failed')), { once: true });
  });
  const cdp = new CdpClient(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  return {
    cdp,
    /**
     * @returns {Promise<void>}
     */
    async close() {
      cdp.close();
      if (child.exitCode === null && child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
        await new Promise((resolve) => {
          child.once('exit', () => resolve(undefined));
          setTimeout(resolve, 2000);
        });
      }
      await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}

const chrome = chromeBinary();

test('skip link works for keyboard and pointer users on a phone and on desktop', {
  timeout: 60_000,
  skip: chrome ? false : 'Google Chrome is not installed',
}, async (t) => {
  const browser = await launchChrome(chrome);
  try {
    /**
     * @param {string} name
     * @param {{ width: number, height: number, mobile: boolean }} viewport
     */
    const checkViewport = async (name, viewport) => {
      for (const scheme of /** @type {const} */ (['light', 'dark'])) {
        const label = `${name} ${scheme}`;
        await openPage(browser.cdp, viewport, scheme, `${name}-${scheme}-keyboard`);
        const measured = await measureSkipLink(browser.cdp);
        assertSkipLinkVisible(label, measured, viewport);

        await browser.cdp.send('Page.bringToFront');
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: 1,
          y: 1,
          button: 'left',
          clickCount: 1,
        });
        await browser.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: 1,
          y: 1,
          button: 'left',
          clickCount: 1,
        });
        await pressKey(browser.cdp, 'Tab', 'Tab', 9);
        const afterTab = /** @type {{ className?: string }} */ (
          await evaluate(browser.cdp, `({ className: document.activeElement && document.activeElement.className || '' })`)
        );
        assert.equal(afterTab.className, 'skip-link', `${label} Tab focuses the skip link`);
        await assertFocusedRing(browser.cdp, label);

        await pressKey(browser.cdp, 'Enter', 'Enter', 13, '\r');
        const afterEnter = /** @type {{ id?: string, hash?: string }} */ (
          await evaluate(browser.cdp, `({ id: document.activeElement && document.activeElement.id || '', hash: location.hash })`)
        );
        assert.equal(afterEnter.id, 'main', `${label} Enter moves focus to main`);
        assert.equal(afterEnter.hash, '#main', `${label} Enter targets the main anchor`);
        const mainFocused = /** @type {SkipLinkMeasurement} */ (
          await evaluate(browser.cdp, `(() => {
            const main = document.getElementById('main');
            const style = main ? getComputedStyle(main) : null;
            const bodyStyle = getComputedStyle(document.body);
            return {
              ok: Boolean(main),
              outlineWidth: style ? style.outlineWidth : '',
              outlineStyle: style ? style.outlineStyle : '',
              outlineColor: style ? style.outlineColor : '',
              bodyBackground: bodyStyle.backgroundColor,
            };
          })()`)
        );
        assert.equal(mainFocused.outlineWidth, '3px', `${label} focused main has a 3px outline`);
        assert.equal(mainFocused.outlineStyle, 'solid', `${label} focused main outline is solid`);
        const mainContrast = contrastRatio(mainFocused.outlineColor ?? '', mainFocused.bodyBackground ?? '');
        assert.ok(mainContrast >= 3, `${label} main focus ring contrast is ${mainContrast.toFixed(2)}:1`);

        await openPage(browser.cdp, viewport, scheme, `${name}-${scheme}-pointer`);
        const pointerTarget = await measureSkipLink(browser.cdp);
        const x = (pointerTarget.x ?? 0) + ((pointerTarget.width ?? 0) / 2);
        const y = (pointerTarget.y ?? 0) + ((pointerTarget.height ?? 0) / 2);
        if (viewport.mobile) {
          await browser.cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x, y }],
          });
          await browser.cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          });
        } else {
          await browser.cdp.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button: 'left',
            clickCount: 1,
          });
          await browser.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button: 'left',
            clickCount: 1,
          });
        }
        const afterPointer = /** @type {{ id?: string }} */ (
          await evaluate(browser.cdp, `({ id: document.activeElement && document.activeElement.id || '' })`)
        );
        assert.equal(afterPointer.id, 'main', `${label} pointer activation moves focus to main`);
      }
    };

    await t.test('narrow phone viewport', async () => {
      await checkViewport('mobile', { width: 320, height: 568, mobile: true });
    });
    await t.test('desktop viewport', async () => {
      await checkViewport('desktop', { width: 1280, height: 800, mobile: false });
    });
  } finally {
    await browser.close();
  }
});
