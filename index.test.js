import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const styleBlock = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

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
 * @param {string} css
 * @returns {boolean}
 */
function hidesContent(css) {
  return /display\s*:\s*none\b|visibility\s*:\s*hidden\b|opacity\s*:\s*0\b|content-visibility\s*:\s*hidden\b|(?:left|top|right)\s*:\s*-\d{3,}/.test(css);
}

test('skip link is visible at the top and is the first tab stop', () => {
  const bodyStart = html.search(/<body\b/i);
  const skipLink = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/i);
  assert.ok(bodyStart >= 0, 'page has a body');
  assert.ok(skipLink?.index !== undefined && skipLink.index > bodyStart, 'skip link is inside the body');

  const tag = skipLink[0];
  assert.match(tag, /\bclass="skip-link"/);
  assert.match(tag, /\bhref="#main"/);
  assert.equal(tag.replace(/<[^>]+>/g, '').trim(), 'Skip to content');
  assert.doesNotMatch(tag, /\baria-hidden\s*=\s*["']true["']/i);
  assert.doesNotMatch(tag, /\bhidden\b/i);
  assert.doesNotMatch(tag, /\btabindex\s*=\s*["']-1["']/i);

  const beforeSkipLink = html.slice(bodyStart, skipLink.index);
  assert.doesNotMatch(
    beforeSkipLink,
    /<(a|button|input|select|textarea|summary)\b|\btabindex\s*=\s*["'](?!-1)\d/i,
    'no focusable control precedes the skip link',
  );

  const skipLinkRule = ruleBody(styleBlock, '.skip-link');
  assert.notEqual(skipLinkRule.trim(), '', 'skip link has a style rule');
  assert.equal(hidesContent(skipLinkRule), false, 'skip link stays visible before it is focused');
});

test('skip link targets a focusable main region placed after navigation', () => {
  const skipLinkAt = html.search(/<a\b[^>]*\bclass="skip-link"/);
  const navAt = html.search(/<nav\b/);
  const mainTag = html.match(/<main\b[^>]*>/i);
  assert.ok(mainTag?.index !== undefined, 'main element exists');
  assert.ok(skipLinkAt < navAt && navAt < mainTag.index, 'skip link comes before navigation and main');

  const mains = html.match(/<main\b[^>]*>/gi) ?? [];
  assert.equal(mains.length, 1);
  assert.match(mainTag[0], /\bid="main"/);
  assert.match(mainTag[0], /\btabindex="-1"/);
  assert.equal((html.match(/\bid="main"/g) ?? []).length, 1);
});

test('focused skip link and main content use a clearly visible outline', () => {
  const skipFocus = `${ruleBody(styleBlock, '.skip-link:focus')}\n${ruleBody(styleBlock, '.skip-link:focus-visible')}`;
  const mainFocus = ruleBody(styleBlock, 'main:focus');

  for (const [name, css] of [['skip link', skipFocus], ['main', mainFocus]]) {
    assert.match(css, /outline\s*:\s*3px\s+solid\s+#0b1f33\b/, `${name} focus outline is a 3px solid dark ring`);
    assert.doesNotMatch(css, /outline\s*:\s*(none|0)\b|outline-style\s*:\s*none\b/, `${name} focus outline is not removed`);
  }

  assert.match(skipFocus, /background\s*:\s*#ffbf47\b/);
  assert.match(skipFocus, /color\s*:\s*#0b1f33\b/);
  assert.equal(hidesContent(skipFocus), false);
});
