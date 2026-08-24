/**
 * ADR-0001 enforcement: this package has no runtime dependencies, permanently.
 * Adding one requires superseding that ADR -- so this check fails the build
 * rather than warning.
 */
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const problems = [];

const runtime = Object.keys(pkg.dependencies ?? {});
if (runtime.length > 0) {
  problems.push(`"dependencies" must be empty (ADR-0001). Found: ${runtime.join(', ')}`);
}

if (pkg.peerDependencies !== undefined) {
  problems.push('"peerDependencies" must be absent (ADR-0001). Optional peers still appear in consumer dependency graphs.');
}

if (pkg.optionalDependencies !== undefined) {
  problems.push('"optionalDependencies" must be absent (ADR-0001).');
}

if (problems.length > 0) {
  console.error('check-deps failed:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('check-deps: dependencies empty, no peers, no optionals. ADR-0001 holds.');
