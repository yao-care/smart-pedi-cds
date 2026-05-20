import type { Assessment, Child } from '../db/schema';
import * as assessmentDao from '../db/assessments';
import { ageGroupCDSA, type AgeGroupCDSA } from '../utils/age-groups';
import type { BehaviorMetrics } from '../../engine/cdsa/behavior-analysis';
import type { VoiceMetrics } from '../../engine/cdsa/voice-analysis';
import type { DrawingAnalysisResult } from '../../engine/cdsa/drawing-analysis';
import type { GrossMotorResult } from '../../engine/cdsa/gross-motor-analysis';
import type { TriageResult } from '../../engine/cdsa/triage';

// 移除 'analyzing' 步驟——分析在各模組完成時即時執行
const STEPS = ['profile', 'questionnaire', 'game', 'voice', 'video', 'drawing', 'result'] as const;
export type AssessmentStep = typeof STEPS[number];
export type SkippableModule = 'game' | 'voice' | 'video' | 'drawing';

export const STEP_LABELS: Record<AssessmentStep, string> = {
  profile: '基本資料',
  questionnaire: '問卷',
  game: '互動遊戲',
  voice: '語音互動',
  video: '影片錄製',
  drawing: '繪圖測試',
  result: '評估結果',
};

/** 各模組即時產出的分析結果 */
export interface PartialAnalysis {
  questionnaireScores?: Record<string, number>;
  /** Per-domain max score for the questionnaire that produced
   *  questionnaireScores. Lets triage compute the correct normalised
   *  ratio instead of dividing by a hardcoded 10. */
  questionnaireMaxScores?: Record<string, number>;
  behaviorMetrics?: BehaviorMetrics;
  voiceMetrics?: VoiceMetrics;
  drawingResult?: DrawingAnalysisResult;
  grossMotorResult?: GrossMotorResult;
}

class AssessmentStore {
  child = $state<Child | null>(null);
  assessment = $state<Assessment | null>(null);
  currentStepIndex = $state(0);
  isLoading = $state(false);
  error = $state<string | null>(null);

  /** 各模組即時累積的分析結果 */
  partialAnalysis = $state<PartialAnalysis>({});

  /** 最終分流結果（進入 result 步驟時由 ResultView 計算） */
  triageResult = $state<TriageResult | null>(null);

  /** 強制完整評估模式（不 skip 任何模組） */
  forceFullAssessment = $state<boolean>(false);

  currentStep = $derived(STEPS[this.currentStepIndex] ?? 'profile');
  ageGroup = $derived<AgeGroupCDSA | null>(
    this.child?.birthDate ? ageGroupCDSA(this.child.birthDate) : null
  );
  isFirstStep = $derived(this.currentStepIndex === 0);
  isLastStep = $derived(this.currentStepIndex === STEPS.length - 1);
  progress = $derived(this.currentStepIndex / (STEPS.length - 1));
  steps = STEPS;

  skippedModules = $derived.by<Set<SkippableModule>>(() => {
    if (this.forceFullAssessment) return new Set();
    const scores = this.partialAnalysis.questionnaireScores ?? {};
    const max = this.partialAnalysis.questionnaireMaxScores ?? {};
    const next = new Set<SkippableModule>();
    if (max.gross_motor && max.gross_motor >= 4 && scores.gross_motor === max.gross_motor) {
      next.add('video');
    }
    if (max.fine_motor && max.fine_motor >= 4 && scores.fine_motor === max.fine_motor) {
      next.add('drawing');
    }
    const lcFull = max.language_comprehension && max.language_comprehension >= 4 &&
                   scores.language_comprehension === max.language_comprehension;
    const leFull = max.language_expression && max.language_expression >= 4 &&
                   scores.language_expression === max.language_expression;
    if (lcFull && leFull) next.add('voice');
    return next;
  });

  effectiveSteps = $derived.by<AssessmentStep[]>(() =>
    STEPS.filter(s => !this.skippedModules.has(s as SkippableModule))
  );

  effectiveStepIndex = $derived.by<number>(() => {
    const idx = this.effectiveSteps.indexOf(this.currentStep);
    if (idx >= 0) return idx;
    for (let i = this.currentStepIndex - 1; i >= 0; i--) {
      const name = STEPS[i];
      const j = this.effectiveSteps.indexOf(name);
      if (j >= 0) return j;
    }
    return 0;
  });

  /** 各模組完成時呼叫，累積分析結果 */
  addAnalysis(partial: Partial<PartialAnalysis>): void {
    // ⚠ 此 warn 依賴 addAnalysis 為 shallow spread（partial.questionnaireScores
    // 整個替換 this.partialAnalysis.questionnaireScores 而非深 merge）。若日後改深 merge，
    // 此守護需重寫（newKeys 將包含 prev 所有 key + new，永遠抓不到 drop）。
    if (import.meta.env.DEV && partial.questionnaireScores) {
      const prevKeys = Object.keys(this.partialAnalysis.questionnaireScores ?? {});
      const newKeys = Object.keys(partial.questionnaireScores);
      const missing = prevKeys.filter(k => !newKeys.includes(k));
      if (missing.length > 0) {
        console.warn(
          `[AssessmentStore] addAnalysis(questionnaireScores) drops previously-set domains: ${missing.join(', ')}`
        );
      }
    }
    this.partialAnalysis = { ...this.partialAnalysis, ...partial };
  }

  async startNew(childData: Omit<Child, 'id' | 'createdAt'>): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const child: Child = {
        ...childData,
        id: crypto.randomUUID(),
        createdAt: new Date(),
      };
      await assessmentDao.createChild(child);
      this.child = child;
      const assessment = await assessmentDao.createAssessment(child.id);
      this.assessment = assessment;
      this.currentStepIndex = 1;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to start assessment';
    } finally {
      this.isLoading = false;
    }
  }

  async setForceFullAssessment(value: boolean): Promise<void> {
    this.forceFullAssessment = value;
    if (this.assessment) {
      await assessmentDao.updateAssessmentForceFull(this.assessment.id, value);
      // sync local assessment object
      this.assessment = { ...this.assessment, forceFullAssessment: value };
    }
  }

  async resume(assessmentId: string): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const assessment = await assessmentDao.getAssessment(assessmentId);
      if (!assessment) throw new Error('Assessment not found');
      const child = await assessmentDao.getChild(assessment.childId);
      if (!child) throw new Error('Child not found');
      this.assessment = assessment;
      this.child = child;
      this.currentStepIndex = assessment.currentStep;
      this.forceFullAssessment = (assessment as Assessment & { forceFullAssessment?: boolean }).forceFullAssessment ?? false;
      await assessmentDao.updateAssessmentStatus(assessmentId, 'resumed');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to resume assessment';
    } finally {
      this.isLoading = false;
    }
  }

  async nextStep(): Promise<void> {
    let idx = this.currentStepIndex;
    while (idx < STEPS.length - 1) {
      idx++;
      const name = STEPS[idx];
      if (!this.skippedModules.has(name as SkippableModule)) {
        this.currentStepIndex = idx;
        if (this.assessment) {
          await assessmentDao.updateAssessmentStep(this.assessment.id, idx);
        }
        return;
      }
    }
  }

  async prevStep(): Promise<void> {
    let idx = this.currentStepIndex;
    while (idx > 0) {
      idx--;
      const name = STEPS[idx];
      if (!this.skippedModules.has(name as SkippableModule)) {
        this.currentStepIndex = idx;
        if (this.assessment) {
          await assessmentDao.updateAssessmentStep(this.assessment.id, idx);
        }
        return;
      }
    }
  }

  async pause(): Promise<void> {
    if (this.assessment) {
      await assessmentDao.updateAssessmentStatus(this.assessment.id, 'paused');
      this.assessment = { ...this.assessment, status: 'paused' };
    }
  }

  async complete(): Promise<void> {
    if (this.assessment) {
      await assessmentDao.updateAssessmentStatus(this.assessment.id, 'completed');
      this.assessment = { ...this.assessment, status: 'completed', completedAt: new Date() };
    }
  }

  reset(): void {
    this.child = null;
    this.assessment = null;
    this.currentStepIndex = 0;
    this.error = null;
    this.partialAnalysis = {};
    this.triageResult = null;
    this.forceFullAssessment = false;
  }
}

export const assessmentStore = new AssessmentStore();
