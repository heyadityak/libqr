/**
 * M9 gate (ADR-0011): PNG output in a real browser.
 *
 * Each test renders a PNG, loads it back as an image, and compares the decoded
 * pixels against the encoder's matrix. That catches a PNG that is well-formed
 * but wrong, which a "does it start with data:image/png" check would not.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/harness.html');
  await page.waitForFunction(() => window.libqrReady === true);
});

test('produces a PNG whose pixels match the encoder', async ({ page }) => {
  const result = await page.evaluate(() => window.libqrHarness.pngRoundTrip('HELLO WORLD', { ecLevel: 'M' }));
  expect(result.isPng).toBe(true);
  expect(result.drawn).toEqual(result.expected);
});

test('sizes the image to the symbol plus quiet zone', async ({ page }) => {
  const result = await page.evaluate(() => window.libqrHarness.pngRoundTrip('SIZE', { scale: 8 }));
  expect(result.width).toBe(result.expectedWidth);
  expect(result.width).toBe((21 + 8) * 8);
});

for (const ecLevel of ['L', 'M', 'Q', 'H']) {
  test(`round-trips through PNG at level ${ecLevel}`, async ({ page }) => {
    const result = await page.evaluate(
      (level) => window.libqrHarness.pngRoundTrip('PNG TEST', { ecLevel: level }),
      ecLevel,
    );
    expect(result.drawn).toEqual(result.expected);
  });
}

for (const version of [1, 7, 20] ) {
  test(`round-trips through PNG at version ${version}`, async ({ page }) => {
    const result = await page.evaluate(
      (v) => window.libqrHarness.pngRoundTrip('DATA'.repeat(v * 2), { ecLevel: 'L', version: v, scale: 4 }),
      version,
    );
    expect(result.drawn).toEqual(result.expected);
  });
}

test('produces a blob with the PNG magic bytes', async ({ page }) => {
  const header = await page.evaluate(async () => {
    const { qr, matrixToBlob } = window.libqrHarness;
    const { matrix } = qr('BLOB', { ecLevel: 'M' });
    const blob = await matrixToBlob(matrix, { scale: 4 });
    const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    return { type: blob.type, size: blob.size, bytes: Array.from(bytes) };
  });

  expect(header.type).toBe('image/png');
  expect(header.size).toBeGreaterThan(0);
  // \x89PNG\r\n\x1a\n
  expect(header.bytes).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test('honours colours through the PNG encode', async ({ page }) => {
  const sample = await page.evaluate(async () => {
    const { qr, matrixToDataUrl } = window.libqrHarness;
    const { matrix } = qr('COLOUR PNG', { ecLevel: 'M' });
    const url = await matrixToDataUrl(matrix, { scale: 8, dark: '#ff0000', light: '#0000ff' });

    const image = new Image();
    await new Promise((done, fail) => {
      image.onload = done;
      image.onerror = fail;
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);

    const dark = ctx.getImageData(Math.floor((4 + 3.5) * 8), Math.floor((4 + 3.5) * 8), 1, 1).data;
    const light = ctx.getImageData(2, 2, 1, 1).data;
    return { dark: [dark[0], dark[1], dark[2]], light: [light[0], light[1], light[2]] };
  });

  expect(sample.dark).toEqual([255, 0, 0]);
  expect(sample.light).toEqual([0, 0, 255]);
});

test('two payloads produce different images, so the comparison is not vacuous', async ({ page }) => {
  const urls = await page.evaluate(async () => {
    const { qr, matrixToDataUrl } = window.libqrHarness;
    return [
      await matrixToDataUrl(qr('FIRST').matrix, { scale: 4 }),
      await matrixToDataUrl(qr('SECOND').matrix, { scale: 4 }),
    ];
  });
  expect(urls[0]).not.toBe(urls[1]);
});
