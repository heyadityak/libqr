/**
 * M9 gate (ADR-0011): the <qr-code> custom element in a live document.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/harness.html');
  await page.waitForFunction(() => window.libqrReady === true);
});

/** Adds a <qr-code> with the given attributes and returns its selector. */
async function addElement(page, attributes) {
  return page.evaluate((attrs) => {
    const element = document.createElement('qr-code');
    element.id = 'subject';
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    document.getElementById('elements').replaceChildren(element);
    return '#subject';
  }, attributes);
}

test('is registered on import', async ({ page }) => {
  const defined = await page.evaluate(() => customElements.get('qr-code') !== undefined);
  expect(defined).toBe(true);
});

test('renders an SVG from its attributes', async ({ page }) => {
  const selector = await addElement(page, { data: 'HELLO WORLD', 'ec-level': 'Q' });
  await expect(page.locator(`${selector} svg`)).toBeVisible();

  const info = await page.evaluate((s) => {
    const element = document.querySelector(s);
    return { version: element.result.version, ecLevel: element.result.ecLevel, error: element.error };
  }, selector);

  expect(info.ecLevel).toBe('Q');
  expect(info.version).toBe(1);
  expect(info.error).toBeNull();
});

test('renders the same modules the encoder produced', async ({ page }) => {
  const selector = await addElement(page, { data: 'ELEMENT CHECK', 'ec-level': 'M' });

  const matches = await page.evaluate((s) => {
    const element = document.querySelector(s);
    const { matrix, size } = element.result;
    // The SVG path is built from merged horizontal runs, so every dark run must
    // appear as a subpath starting at its module coordinate.
    const path = element.querySelector('path').getAttribute('d');
    let expected = 0;
    for (let row = 0; row < size; row += 1) {
      let inRun = false;
      for (let col = 0; col < size; col += 1) {
        const dark = matrix.get(row, col);
        if (dark && !inRun) {
          expected += 1;
          if (!path.includes(`M${col + 4} ${row + 4}h`)) return false;
        }
        inRun = dark;
      }
    }
    return expected > 0;
  }, selector);

  expect(matches).toBe(true);
});

test('re-renders when an attribute changes', async ({ page }) => {
  const selector = await addElement(page, { data: 'FIRST', 'ec-level': 'L' });
  const before = await page.locator(`${selector} path`).getAttribute('d');

  await page.evaluate((s) => document.querySelector(s).setAttribute('data', 'A MUCH LONGER PAYLOAD THAN BEFORE'), selector);
  const after = await page.locator(`${selector} path`).getAttribute('d');

  expect(after).not.toBe(before);
});

test('honours scale, shape, and colours', async ({ page }) => {
  const selector = await addElement(page, {
    data: 'STYLED', 'ec-level': 'M', scale: '10', shape: 'dot', dark: '#123456', light: '#abcdef',
  });

  const svg = await page.locator(`${selector} svg`);
  await expect(svg).toHaveAttribute('width', String((21 + 8) * 10));
  expect(await page.locator(`${selector} circle`).count()).toBeGreaterThan(0);
  await expect(page.locator(`${selector} g`)).toHaveAttribute('fill', '#123456');
  await expect(page.locator(`${selector} rect`).first()).toHaveAttribute('fill', '#abcdef');
});

test('renders a title when labelled', async ({ page }) => {
  const selector = await addElement(page, { data: 'LABELLED', label: 'Order code' });
  await expect(page.locator(`${selector} title`)).toHaveText('Order code');
});

test('fires qr-render with the result', async ({ page }) => {
  const detail = await page.evaluate(() => new Promise((resolve) => {
    const element = document.createElement('qr-code');
    element.addEventListener('qr-render', (event) => resolve({
      version: event.detail.version,
      mask: event.detail.mask,
      size: event.detail.size,
    }));
    element.setAttribute('data', 'EVENT TEST');
    document.getElementById('elements').replaceChildren(element);
  }));

  expect(detail.version).toBe(1);
  expect(detail.size).toBe(21);
  expect(detail.mask).toBeGreaterThanOrEqual(0);
});

test('reports an invalid attribute instead of throwing', async ({ page }) => {
  // A custom element callback that throws produces an unhandled error with no
  // useful call site for the page author, so errors surface on the element.
  const selector = await addElement(page, { data: 'X', 'ec-level': 'NOPE' });

  const state = await page.evaluate((s) => {
    const element = document.querySelector(s);
    return { html: element.innerHTML, error: element.error?.message ?? null, name: element.error?.name ?? null };
  }, selector);

  expect(state.html).toBe('');
  expect(state.name).toBe('OptionError');
  expect(state.error).toMatch(/ecLevel/);
});

test('reports an over-capacity payload instead of throwing', async ({ page }) => {
  const selector = await addElement(page, { data: '9'.repeat(200), 'ec-level': 'H', version: '1' });

  const state = await page.evaluate((s) => {
    const element = document.querySelector(s);
    return { name: element.error?.name ?? null, message: element.error?.message ?? null };
  }, selector);

  expect(state.name).toBe('CapacityError');
  expect(state.message).toMatch(/version 1 at EC level H/);
});

test('fires qr-error on failure', async ({ page }) => {
  const name = await page.evaluate(() => new Promise((resolve) => {
    const element = document.createElement('qr-code');
    element.addEventListener('qr-error', (event) => resolve(event.detail.name));
    element.setAttribute('data', 'X');
    element.setAttribute('scale', '-5');
    document.getElementById('elements').replaceChildren(element);
  }));

  expect(name).toBe('OptionError');
});

test('recovers when a bad attribute is corrected', async ({ page }) => {
  const selector = await addElement(page, { data: 'RECOVER', 'ec-level': 'BAD' });
  await expect(page.locator(`${selector} svg`)).toHaveCount(0);

  await page.evaluate((s) => document.querySelector(s).setAttribute('ec-level', 'Q'), selector);
  await expect(page.locator(`${selector} svg`)).toHaveCount(1);

  const error = await page.evaluate((s) => document.querySelector(s).error, selector);
  expect(error).toBeNull();
});

test('renders an empty payload rather than failing', async ({ page }) => {
  const selector = await addElement(page, {});
  await expect(page.locator(`${selector} svg`)).toHaveCount(1);
  const error = await page.evaluate((s) => document.querySelector(s).error, selector);
  expect(error).toBeNull();
});

test('the entry point also exports mount', async ({ page }) => {
  // README documents `import { mount } from 'libqr/element'`, so one DOM entry
  // point has to cover both the declarative and imperative paths.
  const exported = await page.evaluate(async () => {
    const module = await import('/src/dom/element.js');
    return Object.keys(module).sort();
  });
  expect(exported).toEqual(['QrCodeElement', 'TAG_NAME', 'defineElement', 'mount']);
});

test('does not re-register when imported twice', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { defineElement } = await import('/src/dom/element.js');
    return defineElement();
  });
  expect(result).toBe(false);
});
