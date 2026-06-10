import * as React from 'react';
import type { ArtifactCanvasProps } from '../types.js';

/**
 * ArtifactCanvas — **Phase 1 placeholder**.
 *
 * This locks the public component surface (`ArtifactCanvasProps`) without shipping behavior.
 * The markdown renderer arrives in Phase 2; the comment overlay, marker rendering, and
 * adapter wire-up arrive in Phase 3. The placeholder intentionally does not touch any adapter.
 */
export function ArtifactCanvas(_props: ArtifactCanvasProps): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'codev-artifact-canvas', 'data-placeholder': 'phase-1' },
    'artifact-canvas: renderer arrives in a later phase',
  );
}
