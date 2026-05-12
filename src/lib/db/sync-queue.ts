import { db, type SyncQueueItem } from './schema';

export async function enqueue(
  item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount'>,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.syncQueue.put({
    ...item,
    id,
    createdAt: new Date(),
    retryCount: 0,
  });
  return id;
}

export async function dequeue(limit = 10): Promise<SyncQueueItem[]> {
  return db.syncQueue.orderBy('createdAt').limit(limit).toArray();
}

export async function markComplete(id: string): Promise<void> {
  await db.syncQueue.delete(id);
}

export async function incrementRetry(id: string): Promise<void> {
  await db.transaction('rw', db.syncQueue, async () => {
    const item = await db.syncQueue.get(id);
    if (item) {
      await db.syncQueue.update(id, { retryCount: item.retryCount + 1 });
    }
  });
}

export async function getQueueSize(): Promise<number> {
  return db.syncQueue.count();
}

export async function clearOldItems(maxRetries: number): Promise<number> {
  const toDelete = await db.syncQueue
    .filter(item => item.retryCount >= maxRetries)
    .toArray();

  await db.syncQueue.bulkDelete(toDelete.map(item => item.id));
  return toDelete.length;
}
