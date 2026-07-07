import type { Page, Download } from '@playwright/test';

/** 攔截 FHIR/GCM 上傳，回傳送出的 resourceType 清單與是否含媒體。攔截後回假成功，不真送。 */
export async function captureFhirUpload(
  page: Page, trigger: () => Promise<void>,
): Promise<{ resourceTypes: string[]; hasMedia: boolean }> {
  const resourceTypes: string[] = [];
  await page.route('**/*', async route => {
    const req = route.request();
    if (req.method() === 'POST' && /fhir|Observation|Bundle|Questionnaire/i.test(req.url())) {
      try {
        const body = req.postDataJSON() as { resourceType?: string; entry?: { resource?: { resourceType?: string } }[] };
        if (body.resourceType) resourceTypes.push(body.resourceType);
        for (const e of body.entry ?? []) if (e.resource?.resourceType) resourceTypes.push(e.resource.resourceType);
      } catch { /* 非 JSON body 略過 */ }
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{"resourceType":"OperationOutcome"}' });
      return;
    }
    await route.continue();
  });
  await trigger();
  await page.waitForTimeout(1_000);
  await page.unroute('**/*');
  const hasMedia = resourceTypes.some(t => t === 'Media' || t === 'DocumentReference' || t === 'Binary');
  return { resourceTypes, hasMedia };
}

/** 觸發 PDF 下載並回傳位元組（供檢查是否含音檔章節等）。 */
export async function downloadPdf(page: Page, trigger: () => Promise<void>): Promise<Buffer> {
  const [download]: [Download] = await Promise.all([
    page.waitForEvent('download'),
    trigger(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** 歷史頁是否存在「下載/匯出資料包」功能。 */
export async function hasHistoryDownload(page: Page): Promise<boolean> {
  await page.goto('/history/');
  const btn = page.getByRole('button', { name: /下載|匯出/ }).or(page.getByRole('link', { name: /下載|匯出/ }));
  return btn.first().isVisible().catch(() => false);
}
