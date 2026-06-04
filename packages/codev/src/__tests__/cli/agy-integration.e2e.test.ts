/**
 * Guarded real-`agy` integration smoke for the gemini consult lane (Phase 1, #778).
 *
 * Runs the REAL Antigravity CLI (this file deliberately does NOT mock
 * node:child_process). When agy is unavailable or unauthenticated (e.g. CI),
 * the lane's non-blocking COMMENT skip is detected and the assertion is bypassed
 * — so the test is a no-op there rather than a failure. When agy is installed
 * and signed in, it provides real acceptance evidence that `consult -m gemini`
 * (agy backend) returns a review that actually used file contents.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveAgyBin, _runAgyConsultation } from '../../commands/consult/index.js';

describe('agy lane integration (guarded; real agy)', () => {
  it('returns a review that used file contents, or skips non-blockingly', async () => {
    if (!resolveAgyBin()) {
      // agy CLI not installed in this environment — nothing to verify.
      return;
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-integ-'));
    try {
      const marker = `PLANTED_${Date.now()}`;
      fs.writeFileSync(path.join(dir, 'planted.txt'), `The codeword is ${marker}.\n`);
      const outputPath = path.join(dir, 'review.txt');

      await _runAgyConsultation(
        'Read the file planted.txt in this directory and reply with ONLY the codeword it contains.',
        'You are a terse reviewer.',
        dir,
        outputPath,
      );

      const out = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
      const skipped = out.includes('VERDICT: COMMENT') && /Skipped/i.test(out);
      if (skipped) {
        // agy unavailable/unauthenticated here — the non-blocking skip is the
        // correct behavior; no further assertion in this environment.
        return;
      }

      // Authed run: the review must reflect the file's contents (agentic reading).
      expect(out).toContain(marker);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000); // generous: real agy network round-trip
});
