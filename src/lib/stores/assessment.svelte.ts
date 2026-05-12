import type { Assessment, Child, AssessmentStatus } from '../db/schema';
import * as assessmentDao from '../db/assessments';
import { ageGroupCDSA, type AgeGroupCDSA } from '../utils/age-groups';

const STEPS = ['profile', 'questionnaire', 'game', 'voice', 'video', 'drawing', 'analyzing', 'result'] as const;
export type AssessmentStep = typeof STEPS[number];

class AssessmentStore {
  child = $state<Child | null>(null);
  assessment = $state<Assessment | null>(null);
  currentStepIndex = $state(0);
  isLoading = $state(false);
  error = $state<string | null>(null);

  currentStep = $derived(STEPS[this.currentStepIndex] ?? 'profile');
  ageGroup = $derived<AgeGroupCDSA | null>(
    this.child?.birthDate ? ageGroupCDSA(this.child.birthDate) : null
  );
  isFirstStep = $derived(this.currentStepIndex === 0);
  isLastStep = $derived(this.currentStepIndex === STEPS.length - 1);
  progress = $derived(this.currentStepIndex / (STEPS.length - 1));
  steps = STEPS;

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
      await assessmentDao.updateAssessmentStatus(assessmentId, 'resumed');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to resume assessment';
    } finally {
      this.isLoading = false;
    }
  }

  async nextStep(): Promise<void> {
    if (this.currentStepIndex >= STEPS.length - 1) return;
    this.currentStepIndex++;
    if (this.assessment) {
      await assessmentDao.updateAssessmentStep(this.assessment.id, this.currentStepIndex);
    }
  }

  async prevStep(): Promise<void> {
    if (this.currentStepIndex <= 0) return;
    this.currentStepIndex--;
    if (this.assessment) {
      await assessmentDao.updateAssessmentStep(this.assessment.id, this.currentStepIndex);
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
  }
}

export const assessmentStore = new AssessmentStore();
