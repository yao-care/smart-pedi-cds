<script lang="ts">
  import type { Assessment, Child } from '../../lib/db/schema';
  import { ageInMonths } from '../../lib/utils/age-groups';

  interface Props {
    assessment: Assessment;
    child: Child;
    onGenerated?: () => void;
  }

  let { assessment, child, onGenerated }: Props = $props();

  let generating = $state(false);
  let error = $state<string | null>(null);

  const categoryLabelsEn: Record<string, string> = {
    normal: 'Normal',
    monitor: 'Monitor',
    refer: 'Refer',
  };

  const categoryLabelsCn: Record<string, string> = {
    normal: '正常',
    monitor: '追蹤觀察',
    refer: '建議轉介',
  };

  function formatDate(d: Date | string): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  function formatTimestamp(d: Date): string {
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function abbreviateId(id: string): string {
    return id.length > 8 ? id.slice(0, 8) + '...' : id;
  }

  async function generatePdf() {
    if (generating) return;
    generating = true;
    error = null;

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Helper: draw text line and advance y
      function drawLine(text: string, fontSize: number, fontStyle: 'normal' | 'bold' = 'normal', align: 'left' | 'center' = 'left') {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', fontStyle);
        const x = align === 'center' ? pageWidth / 2 : margin;
        doc.text(text, x, y, { align });
        y += fontSize * 0.5 + 2;
      }

      function drawSeparator() {
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 4;
      }

      // ===== Title =====
      drawLine('CDSA - Child Development Smart Assessment', 16, 'bold', 'center');
      // Chinese subtitle
      drawLine('(Er Tong Fa Zhan Zhi Hui Ping Gu Bao Gao)', 10, 'normal', 'center');
      y += 4;
      drawSeparator();

      // ===== Basic Info =====
      drawLine('Assessment Information', 12, 'bold');
      y += 2;

      const assessDate = assessment.completedAt
        ? formatDate(assessment.completedAt)
        : formatDate(assessment.startedAt);
      const monthsAtAssess = ageInMonths(child.birthDate);

      drawLine(`Child ID: ${abbreviateId(child.id)}`, 10);
      drawLine(`Assessment Date: ${assessDate}`, 10);
      drawLine(`Age at Assessment: ${monthsAtAssess} months`, 10);
      drawLine(`Status: ${assessment.status}`, 10);
      y += 4;
      drawSeparator();

      // ===== Triage Result =====
      const triage = assessment.triageResult;
      if (triage) {
        drawLine('Triage Result', 12, 'bold');
        y += 2;

        const catLabel = `${categoryLabelsEn[triage.category] ?? triage.category} (${categoryLabelsCn[triage.category] ?? triage.category})`;
        drawLine(`Category: ${catLabel}`, 10);
        drawLine(`Confidence: ${Math.round(triage.confidence * 100)}%`, 10);
        drawLine(`Summary: ${triage.summary}`, 10);
        y += 4;
        drawSeparator();
      }

      // ===== Disclaimer =====
      y += 4;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('DISCLAIMER', pageWidth / 2, y, { align: 'center' });
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const disclaimer = 'This assessment result is for reference only and does not constitute a medical diagnosis. (Ben Ping Gu Jie Guo Jin Gong Can Kao, Bu Gou Cheng Yi Liao Zhen Duan.)';
      const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
      doc.text(disclaimerLines, margin, y);
      y += disclaimerLines.length * 4 + 6;

      // ===== Footer =====
      drawSeparator();
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(`Generated: ${formatTimestamp(new Date())}`, margin, y);
      doc.text('CDSA - Smart Pediatric CDS', pageWidth - margin, y, { align: 'right' });

      // Download
      const filename = `cdsa-report-${abbreviateId(assessment.id)}-${assessDate.replace(/\//g, '')}.pdf`;
      doc.save(filename);

      onGenerated?.();
    } catch (err) {
      error = err instanceof Error ? err.message : 'PDF generation failed';
    } finally {
      generating = false;
    }
  }
</script>

<button class="btn-pdf" onclick={generatePdf} disabled={generating}>
  {#if generating}
    PDF 產生中...
  {:else}
    下載 PDF 報告
  {/if}
</button>

{#if error}
  <p class="pdf-error">{error}</p>
{/if}

<style>
  .btn-pdf {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-5);
    background: var(--bg-surface);
    color: var(--color-text-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    cursor: pointer;
    min-height: 44px;
    transition: border-color 0.2s, background 0.2s;
  }

  .btn-pdf:hover:not(:disabled) {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: #fff;
  }

  .btn-pdf:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .pdf-error {
    font-size: var(--text-xs);
    color: var(--color-risk-critical);
    margin-top: var(--space-2);
  }
</style>
