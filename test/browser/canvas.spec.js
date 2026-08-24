/**
 * M9 gate (ADR-0011): the canvas renderer in a real browser.
 *
 * Each test compares the pixels actually drawn against the matrix the encoder
 * produced, module by module. That is stronger than decoding the result: a
 * lenient decoder would forgive a renderer that shifted the symbol by a pixel or
 * dropped the quiet zone.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/harness.html');
  await page.waitForFunction(() => window.libqrReady === true);
});

test('draws exactly the modules the encoder produced', async ({ page }) => {
  const result = await page.evaluate(() => window.libqrHarness.canvasRoundTrip('HELLO WORLD', { ecLevel: 'M' }));
  expect(result.drawn).toEqual(result.expected);
});

test('sizes the canvas to fit the symbol and its quiet zone', async ({ page }) => {
  const result = await page.evaluate(() => window.libqrHarness.canvasRoundTrip('HELLO WORLD', { scale: 6 }));
  expect(result.canvasWidth).toBe(result.pixels);
  // 21 modules plus 4 either side, at 6 pixels each.
  expect(result.pixels).toBe((21 + 8) * 6);
});

for (const ecLevel of ['L', 'M', 'Q', 'H']) {
  test(`draws correctly at level ${ecLevel}`, async ({ page }) => {
    const result = await page.evaluate(
      (level) => window.libqrHarness.canvasRoundTrip('CANVAS TEST', { ecLevel: level }),
      ecLevel,
    );
    expect(result.drawn).toEqual(result.expected);
  });
}

for (const version of [1, 7, 20, 40]) {
  test(`draws correctly at version ${version}`, async ({ page }) => {
    const result = await page.evaluate(
      (v) => window.libqrHarness.canvasRoundTrip('DATA'.repeat(v * 2), { ecLevel: 'L', version: v, scale: 3 }),
      version,
    );
    expect(result.version).toBe(version);
    expect(result.drawn).toEqual(result.expected);
  });
}

test('draws correctly at scale 1, where a module is one pixel', async ({ page }) => {
  const result = await page.evaluate(() => window.libqrHarness.canvasRoundTrip('TIGHT', { scale: 1 }));
  expect(result.drawn).toEqual(result.expected);
});

test('draws correctly with no quiet zone', async ({ page }) => {
  const result = await page.evaluate(() => window.libqrHarness.canvasRoundTrip('NO MARGIN', { quietZone: 0 }));
  expect(result.drawn).toEqual(result.expected);
});

for (const shape of ['square', 'dot', 'rounded']) {
  test(`centre pixels are correct for ${shape} modules`, async ({ page }) => {
    // Every shape is drawn centred in its module, so the centre pixel carries
    // the module's colour regardless of the shape's outline.
    const result = await page.evaluate(
      (s) => window.libqrHarness.canvasRoundTrip('SHAPES 123', { shape: s, scale: 8 }),
      shape,
    );
    expect(result.drawn).toEqual(result.expected);
  });
}

test('honours custom colours', async ({ page }) => {
  const sample = await page.evaluate(() => {
    const { qr, matrixToCanvas } = window.libqrHarness;
    const { matrix } = qr('COLOURS', { ecLevel: 'M' });
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    matrixToCanvas(ctx, matrix, { scale: 8, dark: '#ff0000', light: '#0000ff' });

    // A finder-pattern centre is always dark; the quiet zone is always light.
    const dark = ctx.getImageData(Math.floor((4 + 3.5) * 8), Math.floor((4 + 3.5) * 8), 1, 1).data;
    const light = ctx.getImageData(2, 2, 1, 1).data;
    return { dark: [dark[0], dark[1], dark[2]], light: [light[0], light[1], light[2]] };
  });

  expect(sample.dark).toEqual([255, 0, 0]);
  expect(sample.light).toEqual([0, 0, 255]);
});

test('leaves existing content when light is null', async ({ page }) => {
  const preserved = await page.evaluate(() => {
    const { qr, matrixToCanvas, canvasSizeFor } = window.libqrHarness;
    const { matrix } = qr('OVERLAY', { ecLevel: 'M' });
    const canvas = document.getElementById('canvas');
    const size = canvasSizeFor(matrix, { scale: 6, quietZone: 4 });
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.fillStyle = '#00ff00';
    ctx.fillRect(0, 0, size, size);
    matrixToCanvas(ctx, matrix, { scale: 6, light: null, resize: false });

    // The quiet zone was never painted over, so the green shows through.
    const corner = ctx.getImageData(2, 2, 1, 1).data;
    return [corner[0], corner[1], corner[2]];
  });

  expect(preserved).toEqual([0, 255, 0]);
});

test('draws at an offset without clipping', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { qr, matrixToCanvas, canvasSizeFor } = window.libqrHarness;
    const encoded = qr('OFFSET', { ecLevel: 'M' });
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    matrixToCanvas(ctx, encoded.matrix, { scale: 6, x: 20, y: 20 });

    const size = canvasSizeFor(encoded.matrix, { scale: 6, quietZone: 4 });
    return {
      canvasWidth: canvas.width,
      expectedWidth: size + 20,
      // Shift the sample origin by the offset.
      drawn: (() => {
        const rows = [];
        for (let row = 0; row < encoded.size; row += 1) {
          let line = '';
          for (let col = 0; col < encoded.size; col += 1) {
            const x = 20 + Math.floor((4 + col + 0.5) * 6);
            const y = 20 + Math.floor((4 + row + 0.5) * 6);
            const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
            line += (r + g + b) / 3 < 128 ? '1' : '0';
          }
          rows.push(line);
        }
        return rows;
      })(),
      expected: (() => {
        const rows = [];
        for (let row = 0; row < encoded.size; row += 1) {
          let line = '';
          for (let col = 0; col < encoded.size; col += 1) line += encoded.matrix.get(row, col) ? '1' : '0';
          rows.push(line);
        }
        return rows;
      })(),
    };
  });

  expect(result.canvasWidth).toBe(result.expectedWidth);
  expect(result.drawn).toEqual(result.expected);
});

test('sampled grid differs when the payload differs, so the comparison is not vacuous', async ({ page }) => {
  const [first, second] = await page.evaluate(() => [
    window.libqrHarness.canvasRoundTrip('FIRST PAYLOAD').drawn,
    window.libqrHarness.canvasRoundTrip('SECOND PAYLOAD').drawn,
  ]);
  expect(first).not.toEqual(second);
});
