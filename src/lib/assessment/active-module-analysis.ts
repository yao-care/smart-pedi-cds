import { getEventsByModule, getMediaByType } from '../db/assessment-events';
import { analyzeVoiceFromEvents, type VoiceMetrics } from '../../engine/cdsa/voice-analysis';
import { analyzeGrossMotor, type GrossMotorResult } from '../../engine/cdsa/gross-motor-analysis';
import type { AgeGroupCDSA } from '../utils/age-groups';

/**
 * 主動模組（voice / video）完成後，把採集資料轉成 triage 需要的分析結果。
 *
 * 為什麼獨立一支：VoiceModule / VideoModule 過去只存 events / media，卻從未把
 * 分析結果餵進 `partialAnalysis`，導致 triage 完全收不到語音 / 粗大動作訊號
 * （分析函式早就存在，但只接在 dead code `assessment-analyzer.analyzeAssessment`
 * 上）。這裡集中 wiring，讓元件呼叫一行、且可脫離 media API / MediaPipe 做
 * 確定性單元測試。輕算（voice 事件數學）與重算（gross-motor MediaPipe）分層：
 * voice 由模組完成時 inline 呼叫；gross-motor 由 ResultView 背景 enrich（重 ML
 * 不阻塞錄影後的 drawing 互動流）。
 */

/** analyzeGrossMotor 的 MediaPipe 推論可能很慢（下載模型），逾時視為無結果。 */
const GROSS_MOTOR_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * 從語音模組的 events 算出 VoiceMetrics（僅事件數學，<1ms，不解碼音檔）。
 * triage 只消費 `voiceDurationTotal`，故 event-based 已足夠且安全。
 */
export async function analyzeVoiceForAssessment(assessmentId: string): Promise<VoiceMetrics> {
  const events = await getEventsByModule(assessmentId, 'voice');
  return analyzeVoiceFromEvents(
    events.map(e => ({ eventType: e.eventType, data: e.data })),
  );
}

/**
 * 從影片模組的 media 跑 MediaPipe 粗大動作分析。無影片 / 逾時 / 失敗一律回 null，
 * 讓 triage 的 `if (input.grossMotor)` guard 自然跳過（不製造假訊號）。
 */
export async function analyzeGrossMotorForAssessment(
  assessmentId: string,
  ageGroup: AgeGroupCDSA,
): Promise<GrossMotorResult | null> {
  try {
    const videoFiles = await getMediaByType(assessmentId, 'video');
    if (videoFiles.length === 0) return null;
    return await withTimeout(analyzeGrossMotor(videoFiles[0].blob, ageGroup), GROSS_MOTOR_TIMEOUT_MS);
  } catch {
    // MediaPipe 下載 / 推論失敗屬非阻斷；回 null 讓 triage 跳過粗大動作訊號。
    return null;
  }
}
