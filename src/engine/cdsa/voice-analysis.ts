export interface VoiceMetrics {
  pitchMean: number | null;
  pitchStd: number | null;
  intensityMean: number | null;
  speechRate: number | null;      // estimated syllables/sec
  fluencyPauseCount: number;
  voiceLatencyMean: number | null;
  voiceDurationTotal: number;
  speechRatio: number;            // speech time / total time
}

/**
 * Analyze voice metrics from recorded audio events.
 * Since we can't run Parselmouth in the browser, we compute basic metrics
 * from the event metadata (duration, latency) and simple audio analysis.
 */
export function analyzeVoiceFromEvents(
  voiceEvents: Array<{ eventType: string; data: Record<string, unknown> }>,
): VoiceMetrics {
  const endEvents = voiceEvents.filter(e => e.eventType === 'voice_end');

  const durations = endEvents
    .map(e => e.data.duration as number)
    .filter((v): v is number => typeof v === 'number');

  const totalDuration = durations.reduce((s, d) => s + d, 0);
  const pauseCount = voiceEvents.filter(e => e.eventType === 'voice_skip').length;

  return {
    pitchMean: null,  // Would need Web Audio FFT analysis
    pitchStd: null,
    intensityMean: null,
    speechRate: null,  // Would need syllable detection
    fluencyPauseCount: pauseCount,
    voiceLatencyMean: null,  // Would need TTS-end to voice-start timing
    voiceDurationTotal: totalDuration,
    speechRatio: totalDuration > 0 ? 0.6 : 0, // Placeholder
  };
}
