import type { AgeGroupCDSA } from '../../lib/utils/age-groups';

export interface JointPosition {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  frameIndex: number;
  timestamp: number;
  joints: Record<string, JointPosition>;
}

export interface GrossMotorFeatures {
  avgSpeedElbow: number;
  avgSpeedWrist: number;
  maxAccelWrist: number;
  jointAngleShoulder: number;
  jointAngleKnee: number;
  motionSymmetry: number;     // left vs right side correlation
  movementRange: number;       // total displacement
  movementSmoothness: number;  // jerk metric (lower = smoother)
  headStability: number;       // head movement variance
  trunkControl: number;        // torso sway
}

export interface GrossMotorResult {
  classification: 'normal' | 'delayed';
  confidence: number;
  features: GrossMotorFeatures;
  frameCount: number;
  poseDetectionRate: number;  // % of frames with detected pose
}

// MediaPipe joint name constants (subset we care about)
const JOINTS = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
} as const;

// MediaPipe cold-start（下載 WASM + 模型 + 編譯）是 gross-motor 分析的主要成本
// （實測本機軟體 GPU 冷啟 ~38–52s、暖啟 ~1.7s）。快取 FilesetResolver（WASM loader）
// 讓跨次分析不重載 WASM；PoseLandmarker 因 VIDEO 模式有單調遞增 timestamp 狀態、
// 跨評估共用會爆，故每次分析仍建新的（暖啟下很快）。warmUpGrossMotor 供影片模組
// 提前觸發下載/編譯，使到結果頁時走暖啟。
async function loadVision() {
  const { FilesetResolver } = await import('@mediapipe/tasks-vision');
  return FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  );
}

let visionPromise: ReturnType<typeof loadVision> | null = null;

function getVision() {
  if (!visionPromise) visionPromise = loadVision();
  return visionPromise;
}

async function createPoseLandmarker() {
  const { PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const vision = await getVision();
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

/**
 * 預熱 MediaPipe：提前下載 WASM + 模型並完成編譯（結果由 browser HTTP-cache
 * 保留），使後續 extractPosesFromVideo 走暖啟。由影片模組 fire-and-forget 呼叫，
 * 讓下載與使用者的錄影 / 繪圖時間重疊。失敗非阻斷（結果頁仍會自己再試）。
 */
export async function warmUpGrossMotor(): Promise<void> {
  try {
    const lm = await createPoseLandmarker();
    lm.close();
  } catch {
    /* 預熱失敗非阻斷 */
  }
}

/**
 * Extract pose landmarks from a video blob using MediaPipe PoseLandmarker.
 * This runs in the main thread — for a production app, consider using a Web Worker.
 */
export async function extractPosesFromVideo(videoBlob: Blob): Promise<PoseFrame[]> {
  const poseLandmarker = await createPoseLandmarker();

  // Create a video element to process frames
  const videoUrl = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
  });

  const frames: PoseFrame[] = [];
  const fps = 5; // Sample at 5 fps to reduce computation
  const duration = video.duration;
  const frameInterval = 1 / fps;

  for (let t = 0; t < duration; t += frameInterval) {
    video.currentTime = t;
    await new Promise<void>(resolve => {
      video.onseeked = () => resolve();
    });

    const result = poseLandmarker.detectForVideo(video, t * 1000);

    if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      const joints: Record<string, JointPosition> = {};

      for (const [name, idx] of Object.entries(JOINTS)) {
        if (landmarks[idx]) {
          joints[name] = {
            x: landmarks[idx].x,
            y: landmarks[idx].y,
            z: landmarks[idx].z,
            visibility: landmarks[idx].visibility ?? 0,
          };
        }
      }

      frames.push({
        frameIndex: frames.length,
        timestamp: t * 1000,
        joints,
      });
    }
  }

  poseLandmarker.close();
  URL.revokeObjectURL(videoUrl);

  return frames;
}

/**
 * Compute gross motor features from pose frame sequence.
 */
export function computeGrossMotorFeatures(frames: PoseFrame[]): GrossMotorFeatures {
  if (frames.length < 2) {
    return {
      avgSpeedElbow: 0, avgSpeedWrist: 0, maxAccelWrist: 0,
      jointAngleShoulder: 0, jointAngleKnee: 0,
      motionSymmetry: 0, movementRange: 0, movementSmoothness: 0,
      headStability: 0, trunkControl: 0,
    };
  }

  // Helper: compute Euclidean distance between two joint positions
  function dist(a: JointPosition, b: JointPosition): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }

  // Helper: compute angle between three joints (in degrees)
  function angle(a: JointPosition, b: JointPosition, c: JointPosition): number {
    const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
    const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
    const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);
    if (magBA === 0 || magBC === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / (magBA * magBC)))) * (180 / Math.PI);
  }

  // Compute per-frame speeds for elbows and wrists
  const elbowSpeeds: number[] = [];
  const wristSpeeds: number[] = [];
  const wristAccels: number[] = [];

  for (let i = 1; i < frames.length; i++) {
    const dt = (frames[i].timestamp - frames[i - 1].timestamp) / 1000;
    if (dt <= 0) continue;

    // Left + right elbow average speed
    const le0 = frames[i - 1].joints['left_elbow'];
    const le1 = frames[i].joints['left_elbow'];
    const re0 = frames[i - 1].joints['right_elbow'];
    const re1 = frames[i].joints['right_elbow'];
    if (le0 && le1 && re0 && re1) {
      elbowSpeeds.push((dist(le0, le1) + dist(re0, re1)) / (2 * dt));
    }

    // Left + right wrist average speed
    const lw0 = frames[i - 1].joints['left_wrist'];
    const lw1 = frames[i].joints['left_wrist'];
    const rw0 = frames[i - 1].joints['right_wrist'];
    const rw1 = frames[i].joints['right_wrist'];
    if (lw0 && lw1 && rw0 && rw1) {
      const speed = (dist(lw0, lw1) + dist(rw0, rw1)) / (2 * dt);
      wristSpeeds.push(speed);
    }
  }

  // Wrist acceleration (change in speed)
  for (let i = 1; i < wristSpeeds.length; i++) {
    wristAccels.push(Math.abs(wristSpeeds[i] - wristSpeeds[i - 1]));
  }

  // Joint angles (average across frames)
  const shoulderAngles: number[] = [];
  const kneeAngles: number[] = [];
  for (const f of frames) {
    const ls = f.joints['left_shoulder'];
    const le = f.joints['left_elbow'];
    const lh = f.joints['left_hip'];
    if (ls && le && lh) shoulderAngles.push(angle(le, ls, lh));

    const lhip = f.joints['left_hip'];
    const lk = f.joints['left_knee'];
    const la = f.joints['left_ankle'];
    if (lhip && lk && la) kneeAngles.push(angle(lhip, lk, la));
  }

  // Motion symmetry: correlation between left and right side movement
  const leftWristDisp: number[] = [];
  const rightWristDisp: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const lw0 = frames[i - 1].joints['left_wrist'];
    const lw1 = frames[i].joints['left_wrist'];
    const rw0 = frames[i - 1].joints['right_wrist'];
    const rw1 = frames[i].joints['right_wrist'];
    if (lw0 && lw1) leftWristDisp.push(dist(lw0, lw1));
    if (rw0 && rw1) rightWristDisp.push(dist(rw0, rw1));
  }
  const minLen = Math.min(leftWristDisp.length, rightWristDisp.length);
  let symmetry = 0;
  if (minLen > 1) {
    const lMean = leftWristDisp.slice(0, minLen).reduce((s, v) => s + v, 0) / minLen;
    const rMean = rightWristDisp.slice(0, minLen).reduce((s, v) => s + v, 0) / minLen;
    let cov = 0, lVar = 0, rVar = 0;
    for (let i = 0; i < minLen; i++) {
      cov += (leftWristDisp[i] - lMean) * (rightWristDisp[i] - rMean);
      lVar += (leftWristDisp[i] - lMean) ** 2;
      rVar += (rightWristDisp[i] - rMean) ** 2;
    }
    const denom = Math.sqrt(lVar * rVar);
    symmetry = denom > 0 ? cov / denom : 0;
  }

  // Head stability: variance of nose position
  const nosePositions = frames.map(f => f.joints['nose']).filter((j): j is JointPosition => !!j);
  let headStability = 0;
  if (nosePositions.length > 1) {
    const meanX = nosePositions.reduce((s, j) => s + j.x, 0) / nosePositions.length;
    const meanY = nosePositions.reduce((s, j) => s + j.y, 0) / nosePositions.length;
    const variance = nosePositions.reduce((s, j) => s + (j.x - meanX) ** 2 + (j.y - meanY) ** 2, 0) / nosePositions.length;
    headStability = Math.max(0, 1 - variance * 10); // normalize: less variance = more stable
  }

  // Trunk control: variance of midpoint between shoulders
  const trunkPositions = frames.map(f => {
    const ls = f.joints['left_shoulder'];
    const rs = f.joints['right_shoulder'];
    if (ls && rs) return { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    return null;
  }).filter((p): p is { x: number; y: number } => !!p);
  let trunkControl = 0;
  if (trunkPositions.length > 1) {
    const meanX = trunkPositions.reduce((s, p) => s + p.x, 0) / trunkPositions.length;
    const meanY = trunkPositions.reduce((s, p) => s + p.y, 0) / trunkPositions.length;
    const variance = trunkPositions.reduce((s, p) => s + (p.x - meanX) ** 2 + (p.y - meanY) ** 2, 0) / trunkPositions.length;
    trunkControl = Math.max(0, 1 - variance * 10);
  }

  const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  // Movement range: total wrist displacement sum
  const movementRange = wristSpeeds.reduce((s, v) => s + v, 0);

  // Movement smoothness: inverse of mean jerk (acceleration change)
  const jerks: number[] = [];
  for (let i = 1; i < wristAccels.length; i++) {
    jerks.push(Math.abs(wristAccels[i] - wristAccels[i - 1]));
  }
  const meanJerk = mean(jerks);
  const movementSmoothness = meanJerk > 0 ? Math.max(0, 1 - meanJerk * 5) : 1;

  return {
    avgSpeedElbow: mean(elbowSpeeds),
    avgSpeedWrist: mean(wristSpeeds),
    maxAccelWrist: wristAccels.length > 0 ? Math.max(...wristAccels) : 0,
    jointAngleShoulder: mean(shoulderAngles),
    jointAngleKnee: mean(kneeAngles),
    motionSymmetry: symmetry,
    movementRange,
    movementSmoothness,
    headStability,
    trunkControl,
  };
}

/**
 * Full gross motor analysis pipeline: extract poses from video, compute features, classify.
 */
export async function analyzeGrossMotor(
  videoBlob: Blob,
  ageGroup: AgeGroupCDSA,
): Promise<GrossMotorResult> {
  const frames = await extractPosesFromVideo(videoBlob);

  if (frames.length < 3) {
    return {
      classification: 'normal',
      confidence: 0.5,
      features: computeGrossMotorFeatures([]),
      frameCount: frames.length,
      poseDetectionRate: 0,
    };
  }

  const features = computeGrossMotorFeatures(frames);

  // Simple classification based on feature thresholds
  // In production, this would use an ONNX model trained on clinical data
  let anomalyScore = 0;

  // Low movement range for age
  if (features.movementRange < 0.5) anomalyScore++;
  // Poor symmetry
  if (features.motionSymmetry < 0.3) anomalyScore++;
  // Poor head stability (except for infants who naturally have lower stability)
  if (features.headStability < 0.3 && ageGroup !== '2-6m') anomalyScore++;
  // Poor trunk control
  if (features.trunkControl < 0.3 && ageGroup !== '2-6m' && ageGroup !== '7-12m') anomalyScore++;
  // Very low smoothness
  if (features.movementSmoothness < 0.2) anomalyScore++;

  const classification = anomalyScore >= 2 ? 'delayed' : 'normal';
  const confidence = classification === 'delayed'
    ? Math.min(0.9, 0.6 + anomalyScore * 0.1)
    : Math.min(0.95, 0.7 + (5 - anomalyScore) * 0.05);

  return {
    classification,
    confidence,
    features,
    frameCount: frames.length,
    poseDetectionRate: frames.length / (videoBlob.size > 0 ? Math.max(1, frames.length) : 1),
  };
}
