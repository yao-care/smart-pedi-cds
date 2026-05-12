import { db, type AssessmentEvent, type MediaFile } from './schema';

// ---- Event DAO ----
export async function recordEvent(event: Omit<AssessmentEvent, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  await db.assessmentEvents.put({ ...event, id });
  return id;
}

export async function recordEvents(events: Omit<AssessmentEvent, 'id'>[]): Promise<void> {
  const withIds = events.map(e => ({ ...e, id: crypto.randomUUID() }));
  await db.assessmentEvents.bulkPut(withIds);
}

export async function getEventsForAssessment(assessmentId: string): Promise<AssessmentEvent[]> {
  return db.assessmentEvents.where('assessmentId').equals(assessmentId).sortBy('timestamp');
}

export async function getEventsByModule(
  assessmentId: string,
  moduleType: AssessmentEvent['moduleType'],
): Promise<AssessmentEvent[]> {
  return db.assessmentEvents.where('[assessmentId+moduleType]').equals([assessmentId, moduleType]).sortBy('timestamp');
}

export async function getEventCount(assessmentId: string): Promise<number> {
  return db.assessmentEvents.where('assessmentId').equals(assessmentId).count();
}

// ---- Media DAO ----
export async function saveMedia(media: Omit<MediaFile, 'id' | 'createdAt' | 'processed'>): Promise<string> {
  const id = crypto.randomUUID();
  await db.mediaFiles.put({ ...media, id, createdAt: new Date(), processed: false });
  return id;
}

export async function getMediaForAssessment(assessmentId: string): Promise<MediaFile[]> {
  return db.mediaFiles.where('assessmentId').equals(assessmentId).toArray();
}

export async function getMediaByType(
  assessmentId: string,
  fileType: MediaFile['fileType'],
): Promise<MediaFile[]> {
  return db.mediaFiles.where('[assessmentId+fileType]').equals([assessmentId, fileType]).toArray();
}

export async function markMediaProcessed(id: string): Promise<void> {
  await db.mediaFiles.update(id, { processed: true });
}
