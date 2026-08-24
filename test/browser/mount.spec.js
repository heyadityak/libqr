/**
 * M9 gate (ADR-0011): the imperative mount helper.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/harness.html');
  await page.waitForFunction(() => window.libqrReady === true);
});

test('renders into an element', async ({ page }) => {
  const info = await page.evaluate(() => {
    const handle = window.libqrHarness.mount('#mount', 'MOUNT TEST', { ecLevel: 'Q' });
    return { version: handle.result().version, html: document.getElementById('mount').innerHTML.slice(0, 4) };
  });

  expect(info.version).toBe(1);
  expect(info.html).toBe('<svg');
  await expect(page.locator('#mount svg')).toBeVisible();
});

test('accepts an element as well as a selector', async ({ page }) => {
  const rendered = await page.evaluate(() => {
    const target = document.getElementById('mount');
    window.libqrHarness.mount(target, 'BY ELEMENT');
    return target.querySelectorAll('svg').length;
  });
  expect(rendered).toBe(1);
});

test('replaces the previous symbol on update', async ({ page }) => {
  const result = await page.evaluate(() => {
    const handle = window.libqrHarness.mount('#mount', 'BEFORE', { ecLevel: 'L' });
    const before = document.querySelector('#mount path').getAttribute('d');
    handle.update('AFTER, AND CONSIDERABLY LONGER THAN BEFORE', { ecLevel: 'L' });
    return {
      before,
      after: document.querySelector('#mount path').getAttribute('d'),
      count: document.querySelectorAll('#mount svg').length,
      version: handle.result().version,
    };
  });

  expect(result.after).not.toBe(result.before);
  // Update replaces rather than appends.
  expect(result.count).toBe(1);
  expect(result.version).toBeGreaterThan(1);
});

test('removes the symbol on destroy', async ({ page }) => {
  const after = await page.evaluate(() => {
    const handle = window.libqrHarness.mount('#mount', 'TRANSIENT');
    handle.destroy();
    return { html: document.getElementById('mount').innerHTML, result: handle.result() };
  });

  expect(after.html).toBe('');
  expect(after.result).toBeNull();
});

test('throws a typed error for a selector that matches nothing', async ({ page }) => {
  const error = await page.evaluate(() => {
    try {
      window.libqrHarness.mount('#nothing-here', 'X');
      return null;
    } catch (thrown) {
      return { name: thrown.name, option: thrown.option, message: thrown.message };
    }
  });

  expect(error.name).toBe('OptionError');
  expect(error.option).toBe('target');
  expect(error.message).toMatch(/#nothing-here/);
});

test('throws a typed error for a target that is not an element', async ({ page }) => {
  const error = await page.evaluate(() => {
    try {
      window.libqrHarness.mount(42, 'X');
      return null;
    } catch (thrown) {
      return thrown.name;
    }
  });
  expect(error).toBe('OptionError');
});

test('propagates encoding errors to the caller', async ({ page }) => {
  // Unlike the custom element, mount() is called directly, so throwing gives the
  // caller a useful stack.
  const error = await page.evaluate(() => {
    try {
      window.libqrHarness.mount('#mount', '9'.repeat(200), { ecLevel: 'H', version: 1 });
      return null;
    } catch (thrown) {
      return thrown.name;
    }
  });
  expect(error).toBe('CapacityError');
});
