import { describe, it, expect } from 'vitest';
import {
  MEDIAPIPE_WASM_URL,
  POSE_LANDMARKER_MODEL_URL,
} from '../../src/engine/cdsa/gross-motor-analysis';

// Followup B2 (2026-07-08): the MediaPipe WASM + pose model URLs must be pinned
// to explicit versions, never `@latest` / `/latest/`. An unpinned CDN URL lets
// an upstream release break us (or shift behaviour) without warning — a
// reliability / supply-chain concern for a clinical tool. These guards fail the
// build if a `latest` sneaks back in.
describe('MediaPipe CDN URLs are version-pinned (B2)', () => {
  it('WASM URL pins the tasks-vision version, not @latest', () => {
    expect(MEDIAPIPE_WASM_URL).not.toContain('@latest');
    expect(MEDIAPIPE_WASM_URL).toMatch(/@mediapipe\/tasks-vision@\d+\.\d+\.\d+\//);
  });

  it('pose model URL pins a version dir, not /latest/', () => {
    expect(POSE_LANDMARKER_MODEL_URL).not.toContain('/latest/');
    expect(POSE_LANDMARKER_MODEL_URL).toMatch(/\/float16\/\d+\//);
  });
});
