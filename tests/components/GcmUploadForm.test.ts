import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import GcmUploadForm from '../../src/components/assess/GcmUploadForm.svelte';

vi.mock('../../src/lib/fhir/gcm-submit', () => ({
  startGcmUpload: vi.fn().mockResolvedValue(undefined),
}));
import { startGcmUpload } from '../../src/lib/fhir/gcm-submit';

describe('GcmUploadForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('暱稱空白時不呼叫 startGcmUpload', async () => {
    render(GcmUploadForm, { props: { assessmentId: 'aid-1' } });
    await fireEvent.click(screen.getByRole('button', { name: /上傳到 GCM/ }));
    expect(startGcmUpload).not.toHaveBeenCalled();
  });

  it('填暱稱後呼叫 startGcmUpload 並帶 assessmentId', async () => {
    render(GcmUploadForm, { props: { assessmentId: 'aid-1' } });
    await fireEvent.input(screen.getByLabelText(/暱稱/), { target: { value: '小明' } });
    await fireEvent.click(screen.getByRole('button', { name: /上傳到 GCM/ }));
    expect(startGcmUpload).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(startGcmUpload).mock.calls[0];
    expect(payload).toMatchObject({ assessmentId: 'aid-1', nickname: '小明' });
  });
});
