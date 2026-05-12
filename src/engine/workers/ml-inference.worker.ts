// Web Worker — ML inference using ONNX Runtime Web

// We need to import onnxruntime-web inside the worker
// Vite will handle bundling this for us
import * as ort from 'onnxruntime-web';

export interface MLInferenceRequest {
  type: 'predict';
  patientId: string;
  /** 7-element z-score vector (null for missing indicators) */
  zScores: (number | null)[];
  modelUrl: string;  // URL to ONNX model file
}

export type RiskLevel = 'normal' | 'advisory' | 'warning' | 'critical';

export interface MLInferenceResponse {
  type: 'result';
  patientId: string;
  predictedLevel: RiskLevel;
  probabilities: Record<RiskLevel, number>;
  /** Whether any input was imputed (missing z-score replaced with 0) */
  hasImputedInputs: boolean;
}

export interface MLErrorResponse {
  type: 'error';
  patientId: string;
  error: string;
}

const RISK_LEVELS: RiskLevel[] = ['normal', 'advisory', 'warning', 'critical'];

let session: ort.InferenceSession | null = null;
let loadedModelUrl: string | null = null;

async function getSession(modelUrl: string): Promise<ort.InferenceSession> {
  // Cache session — only reload if URL changes
  if (session && loadedModelUrl === modelUrl) return session;

  try {
    // Set WASM paths for onnxruntime-web
    ort.env.wasm.wasmPaths = '/smart-pedi-cds/';

    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    loadedModelUrl = modelUrl;
    return session;
  } catch (error) {
    throw new Error(`Failed to load ONNX model: ${error}`);
  }
}

self.onmessage = async (event: MessageEvent<MLInferenceRequest>) => {
  const req = event.data;
  if (req.type !== 'predict') return;

  try {
    const modelSession = await getSession(req.modelUrl);

    // Prepare input: replace null z-scores with 0 (imputation)
    const hasImputedInputs = req.zScores.some(z => z === null);
    const inputValues = new Float32Array(
      req.zScores.map(z => z ?? 0)
    );

    // Create ONNX tensor — shape [1, 7] (batch of 1, 7 features)
    const inputTensor = new ort.Tensor('float32', inputValues, [1, 7]);

    // Get the first input name from the model
    const inputName = modelSession.inputNames[0] ?? 'input';

    // Run inference
    const results = await modelSession.run({ [inputName]: inputTensor });

    // Get output — expect probabilities for 4 classes
    const outputName = modelSession.outputNames[0] ?? 'output';
    const output = results[outputName];
    const outputData = output.data as Float32Array;

    // Map output to risk levels
    const probabilities: Record<RiskLevel, number> = {
      normal: 0, advisory: 0, warning: 0, critical: 0,
    };

    // Handle different output shapes
    if (outputData.length >= 4) {
      // Direct 4-class output
      for (let i = 0; i < 4; i++) {
        probabilities[RISK_LEVELS[i]] = outputData[i];
      }
    } else if (outputData.length === 1) {
      // Single regression output — map to nearest level
      const val = outputData[0];
      if (val < 0.5) probabilities.normal = 1;
      else if (val < 1.5) probabilities.advisory = 1;
      else if (val < 2.5) probabilities.warning = 1;
      else probabilities.critical = 1;
    }

    // Find predicted level (highest probability)
    let predictedLevel: RiskLevel = 'normal';
    let maxProb = -1;
    for (const level of RISK_LEVELS) {
      if (probabilities[level] > maxProb) {
        maxProb = probabilities[level];
        predictedLevel = level;
      }
    }

    self.postMessage({
      type: 'result',
      patientId: req.patientId,
      predictedLevel,
      probabilities,
      hasImputedInputs,
    } satisfies MLInferenceResponse);

  } catch (error) {
    self.postMessage({
      type: 'error',
      patientId: req.patientId,
      error: error instanceof Error ? error.message : String(error),
    } satisfies MLErrorResponse);
  }
};
