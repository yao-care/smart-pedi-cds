import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../src/lib/db/schema';
import { createChild, createAssessment, markGcmSubmitted, getAssessment } from '../../../src/lib/db/assessments';

describe('markGcmSubmitted', () => {
  beforeEach(async () => {
    await db.assessments.clear();
    await db.children.clear();
  });

  it('寫入 gcmCaseId 與 gcmSubmittedAt', async () => {
    await createChild({ id: 'c1', birthDate: '2022-01-01', gender: 'male', createdAt: new Date() });
    const a = await createAssessment('c1');
    await markGcmSubmitted(a.id, 'GCM-0042');
    const after = await getAssessment(a.id);
    expect(after?.gcmCaseId).toBe('GCM-0042');
    expect(after?.gcmSubmittedAt).toBeInstanceOf(Date);
  });
});
