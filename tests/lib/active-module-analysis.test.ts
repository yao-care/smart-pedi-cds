import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordEvent, saveMedia } from '../../src/lib/db/assessment-events';
import {
  analyzeVoiceForAssessment,
  analyzeGrossMotorForAssessment,
} from '../../src/lib/assessment/active-module-analysis';
import { analyzeGrossMotor } from '../../src/engine/cdsa/gross-motor-analysis';

// MediaPipe 重 ML：mock 掉，測試只驗 wiring（有無影片 → 有無呼叫 → 結果 / null）。
vi.mock('../../src/engine/cdsa/gross-motor-analysis', () => ({
  analyzeGrossMotor: vi.fn(),
}));

const childId = 'child-1';

async function seedVoiceEnd(assessmentId: string, duration: number) {
  await recordEvent({
    assessmentId,
    childId,
    moduleType: 'voice',
    eventType: 'voice_end',
    timestamp: new Date(),
    data: { duration, promptId: 'v-01' },
  });
}

describe('analyzeVoiceForAssessment', () => {
  it('sums voice_end durations into voiceDurationTotal', async () => {
    const id = 'assess-voice-1';
    await seedVoiceEnd(id, 3);
    await seedVoiceEnd(id, 4.5);

    const metrics = await analyzeVoiceForAssessment(id);

    expect(metrics.voiceDurationTotal).toBeCloseTo(7.5, 5);
  });

  it('returns voiceDurationTotal 0 when no voice events exist', async () => {
    const metrics = await analyzeVoiceForAssessment('assess-voice-empty');
    expect(metrics.voiceDurationTotal).toBe(0);
  });
});

describe('analyzeGrossMotorForAssessment', () => {
  beforeEach(() => {
    vi.mocked(analyzeGrossMotor).mockReset();
  });

  async function seedVideo(assessmentId: string) {
    await saveMedia({
      assessmentId,
      childId,
      fileType: 'video',
      blob: new Blob(['fake-video'], { type: 'video/webm' }),
      mimeType: 'video/webm',
      fileSize: 10,
      duration: 15,
    });
  }

  it('runs MediaPipe analysis on the stored video and returns its result', async () => {
    const id = 'assess-gm-1';
    await seedVideo(id);
    const fake = {
      classification: 'delayed' as const,
      confidence: 0.9,
      features: {} as never,
      frameCount: 30,
      poseDetectionRate: 1,
    };
    vi.mocked(analyzeGrossMotor).mockResolvedValue(fake);

    const result = await analyzeGrossMotorForAssessment(id, '25-36m');

    // fake-indexeddb 取回的 blob 非真 Blob 實例，故只驗有傳入 stored blob + ageGroup。
    expect(analyzeGrossMotor).toHaveBeenCalledTimes(1);
    const [blobArg, ageArg] = vi.mocked(analyzeGrossMotor).mock.calls[0];
    expect(blobArg).toBeDefined();
    expect(ageArg).toBe('25-36m');
    expect(result).toEqual(fake);
  });

  it('returns null and never calls MediaPipe when no video was recorded', async () => {
    const result = await analyzeGrossMotorForAssessment('assess-gm-none', '25-36m');
    expect(result).toBeNull();
    expect(analyzeGrossMotor).not.toHaveBeenCalled();
  });

  it('returns null when MediaPipe analysis throws (non-blocking)', async () => {
    const id = 'assess-gm-throw';
    await seedVideo(id);
    vi.mocked(analyzeGrossMotor).mockRejectedValue(new Error('model download failed'));

    const result = await analyzeGrossMotorForAssessment(id, '25-36m');

    expect(result).toBeNull();
  });
});
