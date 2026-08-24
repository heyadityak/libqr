/**
 * Loads the library, and explains itself when it cannot.
 *
 * The examples import the library by relative path -- `../src/index.js` -- which
 * only resolves when the server's root is the repository. Serving `examples/`
 * itself is an easy and reasonable mistake: `cd examples && npx http-server`
 * puts the root one level too deep, `../src/` escapes it, and the browser reports
 * a bare `404 /src/index.js` that says nothing about the cause.
 *
 * So the import is dynamic and guarded, and failure renders the fix.
 */

/** Where each example expects the library to be, relative to `examples/`. */
const LIBRARY_ROOT = '../src/';

/**
 * Imports modules from the library, or replaces the page with instructions.
 *
 * @param {string[]} paths module paths relative to `src/`, e.g. `['index.js']`
 * @returns {Promise<object[]>} the loaded module namespaces, in order
 */
export async function loadLibqr(paths) {
  try {
    return await Promise.all(paths.map((path) => import(`${LIBRARY_ROOT}${path}`)));
  } catch (cause) {
    showServerHelp(cause);
    // Stop the caller proceeding with undefined modules.
    throw cause;
  }
}

/** Replaces the page body with an explanation and the commands that work. */
function showServerHelp(cause) {
  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText = 'font:16px/1.6 system-ui,sans-serif;max-width:44rem;margin:2rem auto;'
    + 'padding:1.25rem;border:2px solid #b00;border-radius:6px;background:#fff5f5;color:#222';

  panel.innerHTML = `
    <h2 style="margin:0 0 .5rem;font-size:1.1rem;color:#b00">Could not load libqr</h2>
    <p style="margin:.5rem 0">
      This page imports <code>${LIBRARY_ROOT}index.js</code>, so the server's root has to be the
      <strong>repository root</strong> &mdash; not the <code>examples/</code> directory.
      Serving <code>examples/</code> puts <code>src/</code> outside the root, and the browser
      reports a bare <code>404</code> for <code>/src/index.js</code>.
    </p>
    <p style="margin:.5rem 0">From the repository root, either of these works:</p>
    <pre style="background:#f2f2f2;padding:.75rem;border-radius:4px;overflow-x:auto;margin:.5rem 0"
      >npm run serve        # then open http://localhost:8974/examples/

npx http-server .    # then open http://localhost:8080/examples/</pre>
    <p style="margin:.5rem 0 0;color:#555;font-size:.9rem">
      Underlying error: <code>${String(cause && cause.message ? cause.message : cause)}</code>
    </p>
  `;

  document.body.replaceChildren(panel);
}
