/**
 * Smoke test for the built bundles.
 *
 * The test suite runs against `src/`, so a bundling mistake -- a bad `exports`
 * condition, an over-aggressive terser pass, a broken IIFE global -- would
 * otherwise reach consumers with every test green.
 *
 * Usage: node scripts/check-bundles.js
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ENTRIES } from '../build/entries.js';

const require = createRequire(import.meta.url);
const PAYLOAD = 'BUNDLE SMOKE TEST 12345';
const failures = [];
const checks = [];

/**
 * Runs one check. **Awaits** `fn` -- an async callback whose rejection is not
 * awaited would be reported as passing, which is a vacuous check dressed up as
 * evidence.
 */
const check = async (label, fn) => {
  try {
    await fn();
    checks.push(`  ok    ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    checks.push(`  FAIL  ${label}`);
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const dist = (file) => new URL(`../dist/${file}`, import.meta.url);

// --- the default entry, in every flavour ------------------------------------
await check('dist/libqr.cjs encodes', () => {
  const { qr } = require('../dist/libqr.cjs');
  const result = qr(PAYLOAD, { ecLevel: 'Q' });
  assert(result.size === 4 * result.version + 17, 'size does not match version');
});

await check('dist/libqr.esm.js encodes', async () => {
  const { qr } = await import('../dist/libqr.esm.js');
  assert(qr(PAYLOAD, { ecLevel: 'M' }).version > 0, 'no version returned');
});

await check('dist/libqr.esm.min.js encodes and renders', async () => {
  const { qr, toSvg } = await import('../dist/libqr.esm.min.js');
  assert(qr(PAYLOAD).version > 0, 'no version returned');
  const svg = toSvg(PAYLOAD);
  assert(svg.startsWith('<svg'), 'svg output malformed');
  assert(svg.endsWith('</svg>'), 'svg output truncated');
});

await check('dist/libqr.iife.min.js exposes the libqr global', () => {
  const source = readFileSync(dist('libqr.iife.min.js'), 'utf8');
  assert(/\blibqr\s*=/.test(source), 'no libqr global assignment found');
});

// --- ADR-0009: assert() must not survive into production -------------------
await check('minified bundles contain no assert() machinery', () => {
  for (const file of ['libqr.esm.min.js', 'libqr.iife.min.js']) {
    const source = readFileSync(dist(file), 'utf8');
    assert(
      !source.includes('Internal invariant violated'),
      `${file} still contains assert() -- ADR-0009 requires it stripped`,
    );
  }
});

await check('unminified bundle does contain assert(), so the check above means something', () => {
  const source = readFileSync(dist('libqr.esm.js'), 'utf8');
  assert(
    source.includes('Internal invariant violated'),
    'assert() is missing from the unminified bundle, so the stripping check is vacuous',
  );
});

// --- ADR-0006: no external references, no leaked optional entry points -----
await check('bundles are self-contained', () => {
  const source = readFileSync(dist('libqr.esm.min.js'), 'utf8');
  assert(!/\bimport\s*\(/.test(source), 'bundle contains a dynamic import');
  assert(!/^import /m.test(source), 'bundle contains a bare import');
});

await check('default bundle omits the optional entry points', () => {
  const source = readFileSync(dist('libqr.esm.min.js'), 'utf8');
  // The string 'shift-jis' legitimately appears -- the option validator lists it
  // as an accepted value. What must be absent is anything that *implements* it.
  for (const marker of [
    'toCanvas', 'toDataUrl', 'customElements', 'createElementNS',
    'shift_jis', 'TextDecoder', 'Kanji-mode character',
  ]) {
    assert(!source.includes(marker), `default bundle mentions ${marker}`);
  }
});

check('default bundle carries no Kanji machinery', async () => {
  // ADR-0016 derives the Shift-JIS mapping from the platform decoder rather than
  // shipping a table, so a leak shows up as `TextDecoder` in the default bundle
  // rather than as a size jump. Checked from both directions.
  const dflt = readFileSync(dist('libqr.esm.min.js'), 'utf8');
  const kanji = readFileSync(dist('libqr-kanji.esm.min.js'), 'utf8');

  assert(!dflt.includes('shift_jis'), 'default bundle references the Shift-JIS decoder');
  assert(kanji.includes('shift_jis'), 'kanji bundle does not reference the Shift-JIS decoder, so the check above is vacuous');

  const { qr } = await import('../dist/libqr.esm.min.js');
  const japanese = qr('\u6f22\u5b57', { ecLevel: 'M' });
  // Without the entry point the payload must still encode -- as UTF-8 byte mode.
  assert(japanese.segments.every((s) => s.mode === 'byte'), 'default bundle used a non-byte mode for Japanese text');
  assert(japanese.eci === 26, `expected ECI 26 for UTF-8 byte mode, got ${japanese.eci}`);
});

check('kanji bundle encodes Japanese text in Kanji mode', async () => {
  const kanjiModule = await import('../dist/libqr-kanji.esm.min.js');
  assert(typeof kanjiModule.canEncode === 'function', 'kanji bundle exports no canEncode');
  // The ISO/IEC 18004 section 8.4.5 worked examples.
  assert(kanjiModule.canEncode(0x70b9), 'kanji bundle cannot encode U+70B9');
  assert(kanjiModule.canEncode(0x8317), 'kanji bundle cannot encode U+8317');
  assert(!kanjiModule.canEncode(0x41), 'kanji bundle wrongly claims to encode ASCII A');
});

await check('default bundle refuses shift-jis rather than silently using UTF-8', async () => {
  const { qr } = await import('../dist/libqr.esm.min.js');
  let threw = false;
  try {
    qr('text', { encoding: 'shift-jis' });
  } catch (error) {
    threw = true;
    assert(/libqr\/kanji/.test(error.message), `error does not name the entry point: ${error.message}`);
  }
  assert(threw, 'shift-jis was accepted without the Kanji entry point');
});

// --- every built entry produced every flavour ------------------------------
for (const entry of ENTRIES) {
  if (!existsSync(new URL(`../${entry.input}`, import.meta.url))) continue;
  await check(`${entry.name} produced all four flavours`, () => {
    for (const suffix of ['.esm.js', '.esm.min.js', '.cjs', '.iife.min.js']) {
      assert(existsSync(dist(`${entry.file}${suffix}`)), `missing ${entry.file}${suffix}`);
    }
  });
}

console.log('check-bundles:');
console.log(checks.join('\n'));

if (failures.length > 0) {
  console.error('\ncheck-bundles FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\ncheck-bundles: PASS');
