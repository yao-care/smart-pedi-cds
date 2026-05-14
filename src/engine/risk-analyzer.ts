import type { RiskLevel } from '../lib/utils/risk-levels';
import { maxRisk } from '../lib/utils/risk-levels';

// Import worker types (type-only since workers are loaded via URL)
import type { RuleEngineRequest, RuleEngineResponse, IndicatorResult } from './workers/rule-engine.worker';
import type { BaselineRequest, BaselineResponse, BaselineResult } from './workers/baseline.worker';
import type { MLInferenceRequest, MLInferenceResponse, MLErrorResponse } from './workers/ml-inference.worker';

export interface RiskAnalysisInput {
  patientId: string;
  ageGroup: string;
  observations: Array<{ indicator: string; value: number; timestamp: number }>;
  observationHistory: Record<string, number[]>;  // for baseline calc
  rules: object;  // parsed YAML rules
  populationBaseline?: Record<string, { mean: number; std: number }>;
  recentAlerts?: Array<{ indicator: string; timestamp: number }>;
  trendHistory?: Record<string, number[]>;
  modelUrl?: string;
}

export interface RiskAnalysisResult {
  patientId: string;
  overallRisk: RiskLevel;
  ruleResult: {
    level: RiskLevel;
    rationale: string;
    indicators: IndicatorResult[];
    escalated: boolean;
  };
  mlResult: {
    level: RiskLevel;
    probabilities: Record<RiskLevel, number>;
    hasImputedInputs: boolean;
  } | null;  // null if ML unavailable
  baselines: Record<string, BaselineResult>;
  timestamp: Date;
  ruleVersion: string;
  modelVersion?: string;
}

export class RiskAnalyzer {
  private ruleWorker: Worker | null = null;
  private baselineWorker: Worker | null = null;
  private mlWorker: Worker | null = null;
  private _modelUrl: string;

  constructor(modelUrl = '/models/risk-model.onnx') {
    this._modelUrl = modelUrl;
  }

  /** Initialize workers (call once, in browser only) */
  init(): void {
    this.ruleWorker = new Worker(
      new URL('./workers/rule-engine.worker.ts', import.meta.url),
      { type: 'module' }
    );
    this.baselineWorker = new Worker(
      new URL('./workers/baseline.worker.ts', import.meta.url),
      { type: 'module' }
    );
    this.mlWorker = new Worker(
      new URL('./workers/ml-inference.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  /** Update model URL (e.g., after uploading a new model) */
  setModelUrl(url: string): void {
    this._modelUrl = url;
  }

  /** Run full risk analysis pipeline */
  async analyze(input: RiskAnalysisInput): Promise<RiskAnalysisResult> {
    if (!this.ruleWorker || !this.baselineWorker) {
      throw new Error('Workers not initialized. Call init() first.');
    }

    // Step 1: Calculate baselines + z-scores
    const baselineResult = await this.runBaselineWorker({
      type: 'calculate',
      patientId: input.patientId,
      history: input.observationHistory,
      currentValues: Object.fromEntries(
        input.observations.map(o => [o.indicator, o.value])
      ),
      populationBaseline: input.populationBaseline,
    });

    // Step 2: Run rule engine and ML in parallel
    const [ruleResult, mlResult] = await Promise.all([
      this.runRuleWorker({
        type: 'evaluate',
        patientId: input.patientId,
        ageGroup: input.ageGroup,
        observations: input.observations,
        rules: input.rules as RuleEngineRequest['rules'],
        recentAlerts: input.recentAlerts,
        trendHistory: input.trendHistory,
      }),
      this.runMLWorker({
        type: 'predict',
        patientId: input.patientId,
        zScores: baselineResult.zScoreVector,
        modelUrl: input.modelUrl ?? this._modelUrl,
      }).catch(() => null),  // ML failure doesn't block analysis
    ]);

    // Step 3: Merge — take higher severity
    const overallRisk = mlResult
      ? maxRisk(ruleResult.overallLevel, mlResult.predictedLevel)
      : ruleResult.overallLevel;

    // Build baseline map
    const baselines: Record<string, BaselineResult> = {};
    for (const b of baselineResult.baselines) {
      baselines[b.indicator] = b;
    }

    return {
      patientId: input.patientId,
      overallRisk,
      ruleResult: {
        level: ruleResult.overallLevel,
        rationale: ruleResult.rationale,
        indicators: ruleResult.indicators,
        escalated: ruleResult.escalated,
      },
      mlResult: mlResult ? {
        level: mlResult.predictedLevel,
        probabilities: mlResult.probabilities,
        hasImputedInputs: mlResult.hasImputedInputs,
      } : null,
      baselines,
      timestamp: new Date(),
      ruleVersion: ruleResult.ruleVersion,
    };
  }

  private runRuleWorker(request: RuleEngineRequest): Promise<RuleEngineResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ruleWorker) return reject(new Error('Rule worker not initialized'));

      const handler = (event: MessageEvent<RuleEngineResponse>) => {
        this.ruleWorker!.removeEventListener('message', handler);
        resolve(event.data);
      };
      this.ruleWorker.addEventListener('message', handler);
      this.ruleWorker.postMessage(request);
    });
  }

  private runBaselineWorker(request: BaselineRequest): Promise<BaselineResponse> {
    return new Promise((resolve, reject) => {
      if (!this.baselineWorker) return reject(new Error('Baseline worker not initialized'));

      const handler = (event: MessageEvent<BaselineResponse>) => {
        this.baselineWorker!.removeEventListener('message', handler);
        resolve(event.data);
      };
      this.baselineWorker.addEventListener('message', handler);
      this.baselineWorker.postMessage(request);
    });
  }

  private runMLWorker(request: MLInferenceRequest): Promise<MLInferenceResponse> {
    return new Promise((resolve, reject) => {
      if (!this.mlWorker) return reject(new Error('ML worker not initialized'));

      const handler = (event: MessageEvent<MLInferenceResponse | MLErrorResponse>) => {
        this.mlWorker!.removeEventListener('message', handler);
        if (event.data.type === 'error') {
          reject(new Error((event.data as MLErrorResponse).error));
        } else {
          resolve(event.data as MLInferenceResponse);
        }
      };
      this.mlWorker.addEventListener('message', handler);
      this.mlWorker.postMessage(request);
    });
  }

  /** Terminate all workers */
  destroy(): void {
    this.ruleWorker?.terminate();
    this.baselineWorker?.terminate();
    this.mlWorker?.terminate();
    this.ruleWorker = null;
    this.baselineWorker = null;
    this.mlWorker = null;
  }
}
