/**
 * The size gate is the enforcement mechanism for ADR-0006, so it gets tested
 * like any other code. A gate that silently passes everything is worse than no
 * gate, because it reads as evidence.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENTRIES } from '../../../build/entries.js';
import { evaluate, readBaseline } from '../../../scripts/size-check.js';

const entry = (name, budget) => ({ name, input: `src/${name}.js`, file: name, budget, note: 'test' });

describe('budget enforcement', () => {
  it('passes an entry inside its budget', () => {
    const result = evaluate({
      entries: [entry('a', 1000)],
      sizes: { a: 900 },
      baseline: { a: 900 },
    });
    expect([...result.overBudget, ...result.grown]).toEqual([]);
  });

  it('fails an entry over its budget', () => {
    const result = evaluate({
      entries: [entry('a', 1000)],
      sizes: { a: 1200 },
      baseline: { a: 1200 },
    });
    expect(result.overBudget).toHaveLength(1);
    expect(result.overBudget[0]).toMatch(/over its .* budget/);
    expect(result.grown).toEqual([]);
  });

  it('fails on exceeding the budget by a single byte', () => {
    const result = evaluate({
      entries: [entry('a', 1000)],
      sizes: { a: 1001 },
      baseline: { a: 1001 },
    });
    expect(result.overBudget).toHaveLength(1);
  });

  it('passes at exactly the budget', () => {
    const result = evaluate({
      entries: [entry('a', 1000)],
      sizes: { a: 1000 },
      baseline: { a: 1000 },
    });
    expect([...result.overBudget, ...result.grown]).toEqual([]);
  });
});

describe('growth enforcement', () => {
  it('fails when an entry grows, even inside its budget', () => {
    // This is what makes ADR-0011's "default entry size unchanged" gate for M9
    // and M10 mechanical rather than aspirational.
    const result = evaluate({
      entries: [entry('a', 10_000)],
      sizes: { a: 900 },
      baseline: { a: 800 },
    });
    expect(result.grown).toHaveLength(1);
    expect(result.grown[0]).toMatch(/grew by/);
    // Growth is reported separately from a budget overage, because --accept
    // may record growth but must never wave through an overage.
    expect(result.overBudget).toEqual([]);
  });

  it('passes when an entry shrinks', () => {
    const result = evaluate({
      entries: [entry('a', 10_000)],
      sizes: { a: 700 },
      baseline: { a: 800 },
    });
    expect([...result.overBudget, ...result.grown]).toEqual([]);
    expect(result.rows[0].delta).toBe(-100);
  });

  it('passes when an entry is unchanged', () => {
    const result = evaluate({
      entries: [entry('a', 10_000)],
      sizes: { a: 800 },
      baseline: { a: 800 },
    });
    expect([...result.overBudget, ...result.grown]).toEqual([]);
    expect(result.rows[0].delta).toBe(0);
  });

  it('treats an unrecorded entry as new rather than as growth', () => {
    const result = evaluate({
      entries: [entry('a', 10_000)],
      sizes: { a: 800 },
      baseline: {},
    });
    expect([...result.overBudget, ...result.grown]).toEqual([]);
    expect(result.rows[0].delta).toBeNull();
  });

  it('reports over-budget in preference to growth when both apply', () => {
    const result = evaluate({
      entries: [entry('a', 500)],
      sizes: { a: 900 },
      baseline: { a: 800 },
    });
    expect(result.overBudget).toHaveLength(1);
    expect(result.overBudget[0]).toMatch(/over its/);
    expect(result.grown).toEqual([]);
  });

  it('keeps growth and overage in separate buckets, so --accept cannot mask an overage', () => {
    // Regression: --accept used to exit on any failure before writing the
    // baseline, which made the escape hatch unreachable for the one case it
    // exists for. The two conditions are now distinct.
    const growthOnly = evaluate({
      entries: [entry('a', 10_000)],
      sizes: { a: 900 },
      baseline: { a: 800 },
    });
    expect(growthOnly.grown).toHaveLength(1);
    expect(growthOnly.overBudget).toEqual([]);

    const overageOnly = evaluate({
      entries: [entry('a', 500)],
      sizes: { a: 900 },
      baseline: { a: 900 },
    });
    expect(overageOnly.overBudget).toHaveLength(1);
    expect(overageOnly.grown).toEqual([]);
  });
});

describe('marginal budgets', () => {
  // ADR-0015: an entry that must bundle the encoder is judged on what it adds
  // over the default bundle, not on its total.
  const marginalEntry = (name, budget, marginal) => ({
    name, input: `src/${name}.js`, file: name, budget, marginal, note: 'test entry with a marginal budget',
  });

  it('reports what the entry adds over the default bundle', () => {
    const result = evaluate({
      entries: [entry('.', 10_000), marginalEntry('el', 10_000, 500)],
      sizes: { '.': 7000, el: 7100 },
      baseline: { '.': 7000, el: 7100 },
    });
    const row = result.rows.find((r) => r.entry.name === 'el');
    expect(row.marginal).toBe(100);
    expect([...result.overBudget, ...result.grown]).toEqual([]);
  });

  it('fails when the marginal cost exceeds its budget, even inside the total', () => {
    const result = evaluate({
      entries: [entry('.', 10_000), marginalEntry('el', 10_000, 100)],
      sizes: { '.': 7000, el: 7500 },
      baseline: { '.': 7000, el: 7500 },
    });
    expect(result.overBudget).toHaveLength(1);
    expect(result.overBudget[0]).toMatch(/over the default bundle/);
  });

  it('leaves marginal null for entries that do not declare one', () => {
    const result = evaluate({
      entries: [entry('.', 10_000), entry('svg', 1000)],
      sizes: { '.': 7000, svg: 900 },
      baseline: {},
    });
    expect(result.rows.find((r) => r.entry.name === 'svg').marginal).toBeNull();
  });

  it('skips the marginal check when the default entry was not built', () => {
    const result = evaluate({
      entries: [marginalEntry('el', 10_000, 100)],
      sizes: { el: 7500 },
      baseline: {},
    });
    expect(result.rows[0].marginal).toBeNull();
    expect(result.overBudget).toEqual([]);
  });

  it('gives the custom element a marginal budget, since it must bundle the encoder', () => {
    const element = ENTRIES.find((e) => e.name === './element');
    expect(element.marginal).toBeGreaterThan(0);
    expect(element.budget).toBeGreaterThan(element.marginal);
  });

  it('gives renderer-only entries no marginal budget, because their total is their cost', () => {
    for (const name of ['./svg', './canvas', './png']) {
      expect(ENTRIES.find((e) => e.name === name).marginal).toBeUndefined();
    }
  });
});

describe('unbuilt entries', () => {
  it('reports them as skipped rather than passing over them', () => {
    const result = evaluate({
      entries: [entry('built', 1000), entry('unbuilt', 1000)],
      sizes: { built: 900 },
      baseline: {},
    });
    expect(result.rows).toHaveLength(1);
    expect(result.skipped.map((e) => e.name)).toEqual(['unbuilt']);
    expect([...result.overBudget, ...result.grown]).toEqual([]);
  });

  it('does not let a skipped entry mask an over-budget sibling', () => {
    const result = evaluate({
      entries: [entry('built', 500), entry('unbuilt', 1000)],
      sizes: { built: 900 },
      baseline: {},
    });
    expect(result.overBudget).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });
});

describe('declared entry points', () => {
  it('covers every specifier in the package exports map', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
    const exported = Object.keys(pkg.exports).filter((key) => key !== './package.json');
    expect(new Set(ENTRIES.map((e) => e.name))).toEqual(new Set(exported));
  });

  it('gives every entry a budget and a note', () => {
    for (const item of ENTRIES) {
      expect(item.budget).toBeGreaterThan(0);
      expect(item.note.length).toBeGreaterThan(10);
    }
  });

  it('budgets the default path at the 8 KB from ADR-0006', () => {
    const defaultEntry = ENTRIES.find((e) => e.name === '.');
    expect(defaultEntry.budget).toBe(8 * 1024);
  });
});

describe('recorded baseline', () => {
  const baseline = readBaseline();

  it('records the default entry point', () => {
    expect(baseline.sizes['.']).toBeGreaterThan(0);
  });

  it('keeps the default entry inside its budget', () => {
    const defaultEntry = ENTRIES.find((e) => e.name === '.');
    expect(baseline.sizes['.']).toBeLessThanOrEqual(defaultEntry.budget);
  });

  it('only records entries that exist', () => {
    for (const name of Object.keys(baseline.sizes)) {
      expect(ENTRIES.map((e) => e.name)).toContain(name);
    }
  });
});
