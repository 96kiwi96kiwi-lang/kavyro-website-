import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const COLOR_TOKENS = [
  'color-bg',
  'color-surface',
  'color-text',
  'color-text-muted',
  'color-link',
  'color-button-bg',
  'color-button-text',
  'color-border',
  'color-focus',
];

/** Text on the background it is painted on. WCAG AA normal text is 4.5:1. */
/** @type {Array<[string, string]>} */
const TEXT_PAIRS = [
  ['color-text', 'color-bg'],
  ['color-text', 'color-surface'],
  ['color-text-muted', 'color-bg'],
  ['color-text-muted', 'color-surface'],
  ['color-link', 'color-bg'],
  ['color-link', 'color-surface'],
  ['color-button-text', 'color-button-bg'],
];

/** Adjacent UI colors. WCAG 2.1 non-text contrast is 3:1. */
/** @type {Array<[string, string]>} */
const UI_PAIRS = [
  ['color-border', 'color-bg'],
  ['color-border', 'color-surface'],
  ['color-button-bg', 'color-bg'],
  ['color-button-bg', 'color-surface'],
  ['color-focus', 'color-bg'],
  ['color-focus', 'color-surface'],
];

/**
 * @param {number} channel
 * @returns {number}
 */
function linearize(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {string} hex
 * @returns {number}
 */
function luminance(hex) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (0.2126 * linearize(red)) + (0.7152 * linearize(green)) + (0.0722 * linearize(blue));
}

/**
 * @param {string} foreground
 * @param {string} background
 * @returns {number}
 */
function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * @param {string} block
 * @returns {Map<string, string>}
 */
function colorTokens(block) {
  /** @type {Map<string, string>} */
  const tokens = new Map();
  for (const match of block.matchAll(/--(color-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) {
      continue;
    }
    tokens.set(name, value.toLowerCase());
  }
  return tokens;
}

/**
 * @param {string} source
 * @param {string} selector
 * @returns {string}
 */
function ruleBody(source, selector) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  const bodies = [];
  for (const match of source.matchAll(pattern)) {
    bodies.push(match[1] ?? '');
  }
  return bodies.join('\n');
}

const lightBlock = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
const darkBlock = css.match(/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{[\s\S]*?:root\s*\{([^}]*)\}/)?.[1] ?? '';
const light = colorTokens(lightBlock);
const dark = colorTokens(darkBlock);

/**
 * @param {string} theme
 * @param {Map<string, string>} tokens
 * @param {Array<[string, string]>} pairs
 * @param {number} minimum
 */
function assertPairs(theme, tokens, pairs, minimum) {
  for (const [foregroundName, backgroundName] of pairs) {
    const foreground = tokens.get(foregroundName);
    const background = tokens.get(backgroundName);
    assert.equal(typeof foreground, 'string', `${theme} defines --${foregroundName}`);
    assert.equal(typeof background, 'string', `${theme} defines --${backgroundName}`);
    if (typeof foreground !== 'string' || typeof background !== 'string') {
      return;
    }
    const ratio = contrastRatio(foreground, background);
    assert.ok(
      ratio >= minimum,
      `${theme} --${foregroundName} ${foreground} on --${backgroundName} ${background} is ${ratio.toFixed(2)}:1; minimum is ${minimum}:1`,
    );
  }
}

test('stylesheet explains the contrast bar and how to adjust a token', () => {
  assert.match(css, /4\.5:1/);
  assert.match(css, /3:1/);
  assert.match(css, /To adjust a color, change its custom property/);
  assert.match(css, /prefers-color-scheme:\s*dark/);
});

test('light and dark themes define the same color tokens', () => {
  assert.deepEqual([...light.keys()].sort(), [...COLOR_TOKENS].sort());
  assert.deepEqual([...dark.keys()].sort(), [...COLOR_TOKENS].sort());
});

test('primary text on the main background is at least 4.5:1', () => {
  assertPairs('light', light, [['color-text', 'color-bg']], 4.5);
  assertPairs('dark', dark, [['color-text', 'color-bg']], 4.5);
});

test('body text and UI pairs keep their contrast on every adjacent background', () => {
  assertPairs('light', light, TEXT_PAIRS, 4.5);
  assertPairs('dark', dark, TEXT_PAIRS, 4.5);
  assertPairs('light', light, UI_PAIRS, 3);
  assertPairs('dark', dark, UI_PAIRS, 3);
});

test('component colors come from tokens rather than raw color values', () => {
  const componentCss = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/:root\s*\{[^}]*\}/g, '');

  assert.doesNotMatch(componentCss, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(componentCss, /\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch)a?\s*\(/i);
  assert.doesNotMatch(componentCss, /\b(?:white|black|gray|grey|navy|silver)\b/i);

  assert.match(ruleBody(css, 'body'), /background-color:\s*var\(--color-bg\)/);
  assert.match(ruleBody(css, 'body'), /color:\s*var\(--color-text\)/);
  assert.match(ruleBody(css, '.panel'), /background-color:\s*var\(--color-surface\)/);
  assert.match(ruleBody(css, '.panel'), /color:\s*var\(--color-text\)/);
  assert.match(ruleBody(css, '.panel'), /border:\s*1px solid var\(--color-border\)/);
  assert.match(ruleBody(css, '.lede,\n.note'), /color:\s*var\(--color-text-muted\)/);
  assert.match(ruleBody(css, 'a'), /color:\s*var\(--color-link\)/);
  assert.match(ruleBody(css, '.button'), /background-color:\s*var\(--color-button-bg\)/);
  assert.match(ruleBody(css, '.button'), /color:\s*var\(--color-button-text\)/);
  assert.match(ruleBody(css, 'a:focus,\na:focus-visible,\n.button:focus,\n.button:focus-visible'), /outline:\s*3px solid var\(--color-focus\)/);
  assert.doesNotMatch(css, /outline\s*:\s*(?:none|0)\b|outline-style\s*:\s*none\b/);
});

test('the page paints text and controls with the contrast stylesheet', () => {
  assert.match(html, /<link\s+rel="stylesheet"\s+href="src\/styles\.css">/);
  assert.doesNotMatch(html, /<style\b|style\s*=/i);
  assert.match(html, /<main\b[^>]*\bid="main"/);
  assert.match(html, /class="lede"/);
  assert.match(html, /class="panel"/);
  assert.match(html, /class="note"/);
  assert.match(html, /class="button"/);
  assert.match(html, /<a\b[^>]*\bhref="#liquidity-rewards"[^>]*>Read the safety notes<\/a>/);
});
