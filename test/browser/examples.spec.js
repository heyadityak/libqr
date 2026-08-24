/**
 * The examples are documentation, and consumers copy them. Untested, they rot
 * silently -- `examples/element.html` shipped with a status line that never
 * populated, because it attached a `qr-render` listener after the parser had
 * already rendered the elements. Nothing caught it: `examples/` is excluded from
 * lint, and no test loaded the pages.
 *
 * So each page is checked twice: that it loads clean, and that it actually does
 * what it claims.
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const PAGES = ['index.html', 'basic.html', 'canvas.html', 'element.html', 'logo.html'];

const EXAMPLES_DIR = resolve(import.meta.dirname, '../../examples');

/** Collects console errors and uncaught exceptions for the life of the page. */
function watchForErrors(page) {
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

describeLoads();

function describeLoads() {
  for (const name of PAGES) {
    test(`examples/${name} loads without console errors`, async ({ page }) => {
      const problems = watchForErrors(page);
      const response = await page.goto(`/examples/${name}`);
      expect(response.status()).toBe(200);
      await page.waitForLoadState('networkidle');
      expect(problems).toEqual([]);
    });
  }
}

test('examples/index.html links to every other page', async ({ page }) => {
  await page.goto('/examples/index.html');
  const hrefs = await page.locator('li a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  for (const name of PAGES.filter((p) => p !== 'index.html')) {
    expect(hrefs).toContain(name);
  }
});

test('basic.html renders and responds to input', async ({ page }) => {
  await page.goto('/examples/basic.html');
  await expect(page.locator('#out svg')).toBeVisible();
  await expect(page.locator('#meta')).toContainText('version');

  const before = await page.locator('#out path').getAttribute('d');
  await page.fill('#text', 'A COMPLETELY DIFFERENT AND MUCH LONGER PAYLOAD');
  expect(await page.locator('#out path').getAttribute('d')).not.toBe(before);

  await expect(page.locator('#meta')).toContainText('version');
  await expect(page.locator('#error')).toHaveText('');
});

test('basic.html reports an over-capacity payload instead of breaking', async ({ page }) => {
  await page.goto('/examples/basic.html');
  await page.fill('#text', '9'.repeat(9000));
  await expect(page.locator('#error')).toContainText('CapacityError');
  // Recovers when the payload shrinks again.
  await page.fill('#text', 'SHORT');
  await expect(page.locator('#error')).toHaveText('');
  await expect(page.locator('#out svg')).toBeVisible();
});

test('canvas.html actually draws dark pixels', async ({ page }) => {
  await page.goto('/examples/canvas.html');

  // Wait for the first render before sampling pixels.
  await expect(page.locator('#meta')).toContainText('version');

  const info = await page.evaluate(() => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 128) dark += 1;
    return { width: canvas.width, dark };
  });

  expect(info.width).toBeGreaterThan(50);
  expect(info.dark).toBeGreaterThan(100);
  await expect(page.locator('#meta')).toContainText('version');
});

test('canvas.html redraws when the shape changes', async ({ page }) => {
  await page.goto('/examples/canvas.html');
  await expect(page.locator('#meta')).toContainText('version');
  const before = await page.evaluate(() => document.getElementById('canvas').toDataURL());
  await page.selectOption('#shape', 'dot');
  const after = await page.evaluate(() => document.getElementById('canvas').toDataURL());
  expect(after).not.toBe(before);
});

test('element.html renders the whole gallery and reports state immediately', async ({ page }) => {
  await page.goto('/examples/element.html');
  await expect(page.locator('qr-code svg')).toHaveCount(4);

  // The regression this file exists for: the elements render in
  // connectedCallback, before the page script can attach a listener, so the
  // status must come from reading the element rather than only from the event.
  await expect(page.locator('#status')).toContainText('version');
  await expect(page.locator('#status')).not.toHaveClass('error');
});

test('element.html updates every code in the gallery together', async ({ page }) => {
  await page.goto('/examples/element.html');
  const before = await page.locator('qr-code path').first().getAttribute('d');
  await page.fill('#text', 'https://example.com/a-much-longer-changed-url');
  await expect(page.locator('qr-code svg')).toHaveCount(4);
  expect(await page.locator('qr-code path').first().getAttribute('d')).not.toBe(before);
});

test('logo.html paints a logo the browser can actually load', async ({ page }) => {
  await page.goto('/examples/logo.html');
  await expect(page.locator('#out svg')).toBeVisible();
  await expect(page.locator('#out image')).toHaveCount(1);

  const loaded = await page.evaluate(() => {
    const href = document.querySelector('#out image').getAttribute('href');
    return new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve({ ok: true, width: probe.naturalWidth });
      probe.onerror = () => resolve({ ok: false, href: href.slice(0, 60) });
      probe.src = href;
    });
  });

  expect(loaded.ok, `logo failed to load: ${JSON.stringify(loaded)}`).toBe(true);
  expect(loaded.width).toBeGreaterThan(0);
});

test('logo.html reports both size limits', async ({ page }) => {
  await page.goto('/examples/logo.html');
  // Auto-retrying assertions, because the library now loads through an awaited
  // dynamic import -- a one-shot textContent() can read the element before the
  // first render.
  await expect(page.locator('#meta')).toContainText('EC budget allows');
  await expect(page.locator('#meta')).toContainText('finder clearance allows');
});

test('logo.html refuses an oversized logo, and still shows the symbol', async ({ page }) => {
  await page.goto('/examples/logo.html');
  await page.selectOption('#level', 'L');
  await page.fill('#ratio', '0.6');
  await page.dispatchEvent('#ratio', 'input');

  await expect(page.locator('#error')).toContainText('OptionError');
  // Refusing is the feature -- but the symbol itself must still render.
  await expect(page.locator('#out svg')).toBeVisible();
  await expect(page.locator('#out image')).toHaveCount(0);
});

test('logo.html recovers when the logo shrinks back', async ({ page }) => {
  await page.goto('/examples/logo.html');
  await page.selectOption('#level', 'L');
  await page.fill('#ratio', '0.6');
  await page.dispatchEvent('#ratio', 'input');
  await expect(page.locator('#error')).toContainText('OptionError');

  await page.fill('#ratio', '0.1');
  await page.dispatchEvent('#ratio', 'input');
  await expect(page.locator('#error')).toHaveText('');
  await expect(page.locator('#out image')).toHaveCount(1);
});


/**
 * Serves a directory, so a test can reproduce the wrong server root.
 *
 * `cd examples && npx http-server` is an easy mistake: it puts the root one level
 * too deep, `../src/` escapes it, and the browser reports a bare 404 that says
 * nothing about the cause. `examples/boot.js` exists to turn that into an
 * explanation, and an unguarded guard is decoration -- so it gets tested against
 * the actual failure.
 */
function serveDirectory(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

  const server = createServer((request, response) => {
    const requested = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
      .replace(/^(\.\.[/\\])+/, '');
    let target = join(root, requested);

    try {
      if (statSync(target).isDirectory()) target = join(target, 'index.html');
      statSync(target);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': `${types[extname(target)] ?? 'application/octet-stream'}; charset=utf-8`,
    });
    createReadStream(target).pipe(response);
  });

  return new Promise((ready) => {
    server.listen(0, () => ready({ server, port: server.address().port }));
  });
}

test.describe('served from the wrong root', () => {
  let handle;

  test.beforeAll(async () => {
    handle = await serveDirectory(EXAMPLES_DIR);
  });

  test.afterAll(async () => {
    await new Promise((done) => handle.server.close(done));
  });

  for (const name of ['basic.html', 'canvas.html', 'element.html', 'logo.html']) {
    test(`${name} explains the problem instead of failing silently`, async ({ page }) => {
      await page.goto(`http://localhost:${handle.port}/${name}`);

      const panel = page.locator('[role="alert"]');
      await expect(panel).toHaveCount(1);
      await expect(panel).toContainText('Could not load libqr');
      // The fix has to be in the message, not just the diagnosis.
      await expect(panel).toContainText('repository root');
      await expect(panel).toContainText('npm run serve');
      await expect(panel).toContainText('http-server');
    });
  }

  test('the page is replaced, so no half-working UI is left behind', async ({ page }) => {
    await page.goto(`http://localhost:${handle.port}/basic.html`);
    await expect(page.locator('[role="alert"]')).toHaveCount(1);
    // basic.html's own controls must be gone rather than sitting there inert.
    await expect(page.locator('#text')).toHaveCount(0);
    await expect(page.locator('#out')).toHaveCount(0);
  });
});
