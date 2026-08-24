/**
 * Exercises the declarations for every sub-entry point.
 *
 * ADR-0002 accepts hand-maintained types, so these fixtures are what stops them
 * drifting. ADR-0015 makes the sub-entries renderer-only, which is the shape
 * asserted here.
 */
import type { Matrix, QrResult } from '../../src/types/index.d.ts';
import type { CanvasRenderOptions } from '../../src/types/canvas.d.ts';
import type { PngRenderOptions } from '../../src/types/png.d.ts';
import type { Mounted } from '../../src/types/element.d.ts';

declare const api: typeof import('../../src/types/index.d.ts');
declare const svg: typeof import('../../src/types/svg.d.ts');
declare const canvas: typeof import('../../src/types/canvas.d.ts');
declare const png: typeof import('../../src/types/png.d.ts');
declare const element: typeof import('../../src/types/element.d.ts');

const matrix: Matrix = api.qr('DATA').matrix;

// --- libqr/svg -------------------------------------------------------------
const svgString: string = svg.matrixToSvg(matrix, { scale: 4, shape: 'dot' });
void svgString;

// --- libqr/canvas ----------------------------------------------------------
declare const ctx: CanvasRenderingContext2D;

const canvasOptions: CanvasRenderOptions = {
  scale: 8,
  quietZone: 2,
  dark: '#000',
  light: null,
  shape: 'rounded',
  x: 10,
  y: 10,
  resize: false,
};

const drawn: { width: number; height: number } = canvas.matrixToCanvas(ctx, matrix, canvasOptions);
const pixels: number = canvas.canvasSizeFor(matrix, { scale: 8, quietZone: 2 });
void [drawn, pixels];

// --- libqr/png -------------------------------------------------------------
const pngOptions: PngRenderOptions = { scale: 8, quietZone: 4, dark: '#000', light: '#fff', shape: 'square' };

async function pngSurface(): Promise<void> {
  const url: string = await png.matrixToDataUrl(matrix, pngOptions);
  const blob: Blob = await png.matrixToBlob(matrix, pngOptions);
  void [url, blob];
}
void pngSurface;

// --- libqr/element ---------------------------------------------------------
const tag: 'qr-code' = element.TAG_NAME;
const registered: boolean = element.defineElement();
const namedRegistration: boolean = element.defineElement('my-qr');
void [tag, registered, namedRegistration];

declare const instance: InstanceType<typeof element.QrCodeElement>;
const instanceResult: QrResult | null = instance.result;
const instanceError: Error | null = instance.error;
instance.render();
void [instanceResult, instanceError];

const observed: string[] = element.QrCodeElement.observedAttributes;
void observed;

const mounted: Mounted = element.mount('#container', 'DATA', { ecLevel: 'Q' });
mounted.update('NEW DATA');
mounted.update('NEW DATA', { scale: 6 });
const mountedResult: QrResult | null = mounted.result();
mounted.destroy();
void mountedResult;

declare const el: Element;
void element.mount(el, 'DATA');
