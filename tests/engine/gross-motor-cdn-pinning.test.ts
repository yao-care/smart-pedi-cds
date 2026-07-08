import { describe, it, expect } from 'vitest';
import {
  MEDIAPIPE_WASM_URL,
  POSE_LANDMARKER_MODEL_URL,
} from '../../src/engine/cdsa/gross-motor-analysis';

// Followup B2 收斂 (2026-07-08): MediaPipe WASM + pose 模型改為 self-host 自本站
// `/models/`，不再走任何外部 CDN。外部 URL 讓上游釋出可無預警破壞 / 改變行為，且
// 無網路即無法分析 —— 對臨床工具是可靠性 / 供應鏈風險。這些守門確保外部 host 不會
// 偷偷回來（jsdelivr / Google Storage / 任意 http(s) host），URL 必須是本站相對路徑。
const EXTERNAL_HOST = /^https?:\/\//i;

describe('MediaPipe assets are self-hosted, no external host (B2)', () => {
  it('WASM URL is a local /models/ path, not an external CDN', () => {
    expect(MEDIAPIPE_WASM_URL).not.toMatch(EXTERNAL_HOST);
    expect(MEDIAPIPE_WASM_URL).not.toContain('jsdelivr');
    expect(MEDIAPIPE_WASM_URL).not.toContain('@latest');
    expect(MEDIAPIPE_WASM_URL).toMatch(/\/models\/mediapipe-wasm$/);
  });

  it('pose model URL is a local /models/ path, not Google Storage', () => {
    expect(POSE_LANDMARKER_MODEL_URL).not.toMatch(EXTERNAL_HOST);
    expect(POSE_LANDMARKER_MODEL_URL).not.toContain('storage.googleapis.com');
    expect(POSE_LANDMARKER_MODEL_URL).not.toContain('/latest/');
    expect(POSE_LANDMARKER_MODEL_URL).toMatch(/\/models\/pose_landmarker_lite\.task$/);
  });
});
