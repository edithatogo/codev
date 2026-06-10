/**
 * Public API for @cluesmith/codev-artifact-canvas.
 *
 * Phase 1 surface: the locked adapter interfaces + data types + component props, and a
 * placeholder `ArtifactCanvas` component. Renderer/overlay/marker behavior lands in later
 * phases. The default theme stylesheet is a separate export:
 *   import '@cluesmith/codev-artifact-canvas/default-theme.css';
 */

export type { FileAdapter } from './adapters/FileAdapter.js';
export type { MarkerAdapter } from './adapters/MarkerAdapter.js';
export type { ThemeAdapter } from './adapters/ThemeAdapter.js';
export type { Disposable, ReviewMarker, ArtifactCanvasProps } from './types.js';

export { ArtifactCanvas } from './components/ArtifactCanvas.js';
