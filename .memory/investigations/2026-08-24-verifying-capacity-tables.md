---
title: How to independently verify a data-codeword table row
date: 2026-08-24
type: investigation
status: current
area: scripts/gen-tables.js, src/core/constants.js
related: [2026-08-24-no-restricted-paths-needs-resolvable-target]
---

## What

`DATA_CODEWORDS[level][version-1]` can be checked without trusting our own tables, by deriving the **published character capacity** from it and comparing against the widely-published capacity figures.

For numeric mode:

```
bits      = dataCodewords * 8
usable    = bits - 4 (mode indicator) - countWidth
            countWidth: 10 for v1-9, 12 for v10-26, 14 for v27-40
groups    = floor(usable / 10)        // 3 digits per 10 bits
digits    = groups * 3
remainder = usable - groups * 10
            remainder >= 7 -> +2 digits;  remainder >= 4 -> +1 digit
```

Worked examples, all confirmed against published numeric capacities:

| Combination | Data codewords | Derived numeric capacity | Published |
| --- | --- | --- | --- |
| v26-L | 1370 | 3283 | 3283 |
| v26-M | 1062 | 2544 | 2544 |
| v26-Q | 754 | 1804 | 1804 |
| v26-H | 596 | 1425 | 1425 |
| v27-L | 1468 | 3517 | 3517 |
| v40-L | 2956 | 7089 | 7089 |

## Why it matters

The M1 gate caught three wrong expected values in `test/unit/core/constants.test.js` on first run — v20 total codewords, and all of v26 and v27. The **generator was correct**; the test's "known" figures were mis-remembered. Without a second, independent source those wrong expectations would either have been "fixed" by changing the generator (breaking correct tables) or the failures rationalised away.

Character capacities are much more widely published and more frequently quoted than raw codeword counts, which makes them the better cross-check — they are far less likely to be misremembered in the same direction as the thing being checked.

The three internal consistency tests that already pass — `data + ecc == total` across all 160 combinations, monotonic totals, strict L > M > Q > H ordering — are necessary but **not sufficient**. A generator with a wrong `ECC_PER_BLOCK` row satisfies all three while producing wrong tables.

## How to apply

Before changing anything in `ECC_PER_BLOCK` or `EC_BLOCKS` in `scripts/gen-tables.js`, or before "correcting" a failing expectation in `test/unit/core/constants.test.js`, run the derivation above for that row. If the derived numeric capacity matches the published figure, the table is right and the test expectation is wrong.

Note the count-width step at v10 and again at v27 — using the wrong width silently shifts the derived capacity by a few characters, which is enough to make a correct table look wrong.
