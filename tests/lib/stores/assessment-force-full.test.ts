import { describe, it, expect, beforeEach } from 'vitest';
import { assessmentStore } from '../../../src/lib/stores/assessment.svelte';
import { db } from '../../../src/lib/db/schema';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

describe('forceFullAssessment persistence', () => {
  beforeEach(async () => {
    await db.assessments.clear();
    await db.children.clear();
    assessmentStore.reset();
  });

  it('setForceFullAssessment writes to IndexedDB', async () => {
    await assessmentStore.startNew({
      nickName: 'test',
      birthDate: isoDaysAgo(30 * 18),
      gender: 'male',
    });
    const id = assessmentStore.assessment!.id;
    await assessmentStore.setForceFullAssessment(true);

    const stored = await db.assessments.get(id);
    expect(stored?.forceFullAssessment).toBe(true);
  });

  it('setForceFullAssessment also updates in-memory state', async () => {
    await assessmentStore.startNew({
      nickName: 'test',
      birthDate: isoDaysAgo(30 * 18),
      gender: 'male',
    });
    await assessmentStore.setForceFullAssessment(true);

    expect(assessmentStore.forceFullAssessment).toBe(true);
    expect(assessmentStore.assessment?.forceFullAssessment).toBe(true);
  });

  it('resume reads forceFullAssessment from DB', async () => {
    await assessmentStore.startNew({
      nickName: 'test',
      birthDate: isoDaysAgo(30 * 18),
      gender: 'male',
    });
    const id = assessmentStore.assessment!.id;
    await assessmentStore.setForceFullAssessment(true);

    // Simulate resume: reset store then reload
    assessmentStore.reset();
    expect(assessmentStore.forceFullAssessment).toBe(false);

    await assessmentStore.resume(id);
    expect(assessmentStore.forceFullAssessment).toBe(true);
  });

  it('setForceFullAssessment(false) writes false to IndexedDB', async () => {
    await assessmentStore.startNew({
      nickName: 'test',
      birthDate: isoDaysAgo(30 * 18),
      gender: 'male',
    });
    const id = assessmentStore.assessment!.id;
    await assessmentStore.setForceFullAssessment(true);
    await assessmentStore.setForceFullAssessment(false);

    const stored = await db.assessments.get(id);
    expect(stored?.forceFullAssessment).toBe(false);
    expect(assessmentStore.forceFullAssessment).toBe(false);
  });
});
