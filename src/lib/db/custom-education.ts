import { db, type CustomEducation } from './schema';

export async function getCustomEducation(tenantId: string): Promise<CustomEducation[]> {
  return db.customEducation
    .where('[tenantId+isActive]')
    .equals([tenantId, 1]) // Dexie uses 1 for true in compound index
    .toArray();
}

export async function getAllCustomEducation(tenantId: string): Promise<CustomEducation[]> {
  return db.customEducation
    .where('tenantId')
    .equals(tenantId)
    .reverse()
    .sortBy('createdAt');
}

export async function createCustomEducation(
  tenantId: string,
  data: Omit<CustomEducation, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isActive'>,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.customEducation.put({
    ...data,
    id,
    tenantId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateCustomEducation(
  id: string,
  data: Partial<Omit<CustomEducation, 'id' | 'tenantId' | 'createdAt'>>,
): Promise<void> {
  await db.customEducation.update(id, { ...data, updatedAt: new Date() });
}

export async function deleteCustomEducation(id: string): Promise<void> {
  await db.customEducation.delete(id);
}

export async function toggleCustomEducation(id: string, isActive: boolean): Promise<void> {
  await db.customEducation.update(id, { isActive, updatedAt: new Date() });
}
