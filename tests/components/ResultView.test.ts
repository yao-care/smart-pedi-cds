import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ResultView from '../../src/components/assess/ResultView.svelte';
import { assessmentStore } from '../../src/lib/stores/assessment.svelte';
import { saveMedia } from '../../src/lib/db/assessment-events';
import { analyzeGrossMotor } from '../../src/engine/cdsa/gross-motor-analysis';
import { db } from '../../src/lib/db/schema';
import { getQuestionnaireMaxScores } from '../../src/lib/questionnaire/max-scores';
import type { Child, Assessment } from '../../src/lib/db/schema';

// MediaPipe 重 ML：mock 掉，讓 ResultView 的 gross-motor 背景 enrich 可確定性測試。
vi.mock('../../src/engine/cdsa/gross-motor-analysis', () => ({
  analyzeGrossMotor: vi.fn(),
}));

/** Build a minimal Child whose age (derived from birthDate) falls in 25-36m. */
function makeChild(birthOffsetMonths: number): Child {
  const birth = new Date();
  birth.setMonth(birth.getMonth() - birthOffsetMonths);
  return {
    id: 'test-child',
    birthDate: birth,
    sex: 'male',
    createdAt: new Date(),
  };
}

function makeAssessment(): Assessment {
  return {
    id: 'test-assess',
    childId: 'test-child',
    status: 'in-progress',
    currentStep: 6,
    startedAt: new Date(),
    fhirSubmitted: false,
  };
}

describe('ResultView', () => {
  beforeEach(async () => {
    assessmentStore.reset();
    vi.mocked(analyzeGrossMotor).mockReset();
    await db.mediaFiles.clear(); // 隔離：避免跨測試殘留影片誤觸 enrich
  });

  afterEach(() => {
    cleanup();
    assessmentStore.reset();
  });

  it('shows computing placeholder before triage result is ready', () => {
    // No ageGroup → $effect early-returns → triageResult stays null → loading
    render(ResultView);
    expect(screen.getByText(/正在產生評估結果/)).toBeInTheDocument();
  });

  it('still shows the computing placeholder while triage is pending', () => {
    // With store fields set, triage starts but is async; first render is the
    // placeholder. Async resolve verified separately to keep this fast.
    assessmentStore.child = makeChild(30); // 30 mo → 25-36m
    assessmentStore.assessment = makeAssessment();
    render(ResultView);
    expect(screen.getByText(/正在產生評估結果/)).toBeInTheDocument();
  });

  it('renders one of the three category labels once triage resolves', async () => {
    assessmentStore.child = makeChild(30);
    assessmentStore.assessment = makeAssessment();
    assessmentStore.partialAnalysis = {
      questionnaireScores: { gross_motor: 4, fine_motor: 4 },
      questionnaireMaxScores: { gross_motor: 4, fine_motor: 4 },
    };

    render(ResultView);

    // computeTriage is async but resolves quickly (no external IO).
    // findByText polls until visible.
    // 用精確 selector 鎖 triage-card 的分類標籤（h2）。分類為 normal 時 summary
    // 「各面向發展在正常範圍內」也含「正常」，寬鬆 findByText 會命中 h2+summary
    // 兩個元素而報 multiple；改用 heading level 2 只匹配分類標籤本身。
    const label = await screen.findByRole('heading', { level: 2, name: /正常|追蹤觀察|建議轉介/ });
    expect(label).toBeInTheDocument();

    // The radar / education match / pdf sections are gated by computing
    // state — finding the category label confirms isComputing flipped false.
    expect(screen.queryByText(/正在產生評估結果/)).not.toBeInTheDocument();
  });

  it('renders a summary paragraph from the triage result', async () => {
    assessmentStore.child = makeChild(30);
    assessmentStore.assessment = makeAssessment();
    assessmentStore.partialAnalysis = {
      questionnaireScores: { gross_motor: 4 },
      questionnaireMaxScores: { gross_motor: 4 },
    };

    const { container } = render(ResultView);
    await screen.findByRole('heading', { level: 2, name: /正常|追蹤觀察|建議轉介/ });

    // After resolution, the result section should contain non-empty text.
    // The triage summary is a sentence — assert there's substantive content.
    expect(container.textContent ?? '').toMatch(/評估|建議|追蹤|正常|轉介/);
  });

  it('enriches triage with gross-motor analysis when a video was recorded', async () => {
    // VideoModule 只存影片；粗大動作分析由 ResultView 背景 enrich 補跑。此測試證明
    // 「有影片 → ResultView 觸發 analyzeGrossMotor → 結果進入 triage」整條 wiring。
    assessmentStore.child = makeChild(30); // 25-36m
    assessmentStore.assessment = makeAssessment();
    assessmentStore.partialAnalysis = {
      questionnaireScores: { gross_motor: 4 },
      questionnaireMaxScores: { gross_motor: 4 },
    };
    await saveMedia({
      assessmentId: 'test-assess',
      childId: 'test-child',
      fileType: 'video',
      blob: new Blob(['fake-video'], { type: 'video/webm' }),
      mimeType: 'video/webm',
      fileSize: 10,
      duration: 15,
    });
    vi.mocked(analyzeGrossMotor).mockResolvedValue({
      classification: 'delayed',
      confidence: 0.9,
      features: {} as never,
      frameCount: 30,
      poseDetectionRate: 1,
    });

    render(ResultView);

    // triage 完成 → 分類標籤出現，且 enrich 確實呼叫過 MediaPipe 分析
    await screen.findByRole('heading', { level: 2, name: /正常|追蹤觀察|建議轉介/ });
    expect(analyzeGrossMotor).toHaveBeenCalledTimes(1);
    expect(vi.mocked(analyzeGrossMotor).mock.calls[0][1]).toBe('25-36m');
  });

  it('renders all questionnaire domains in the radar when all provided', async () => {
    // 原 skip 顧慮「triageResult 是 ResultView 私有」；改斷言渲染出來的雷達
    // DOM（RadarChart 對每個 detail 的 domain 畫一個 .radar-label 中文標籤），
    // 走真實 computeTriage 路徑，不需注入私有 state。
    assessmentStore.child = makeChild(30); // 25-36m
    assessmentStore.assessment = makeAssessment();
    const maxScores = getQuestionnaireMaxScores('25-36m');
    const scores = Object.fromEntries(
      Object.entries(maxScores).map(([d, m]) => [d, Math.floor(m / 2)]),
    );
    assessmentStore.partialAnalysis = { questionnaireScores: scores, questionnaireMaxScores: maxScores };

    const { container } = render(ResultView);
    await screen.findByRole('heading', { level: 2, name: /正常|追蹤觀察|建議轉介/ });

    // 25-36m 的 6 個問卷面向中文標籤都應出現在雷達
    for (const zh of ['認知', '細動作', '粗動作', '語言理解', '語言表達', '社會情緒']) {
      expect(container.textContent ?? '', `雷達應含面向「${zh}」`).toContain(zh);
    }
  });
});
