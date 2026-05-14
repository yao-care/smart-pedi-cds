const SHAPE_CLASSES = ['circle', 'cross', 'square', 'triangle', 'diamond', 'unknown'] as const;

/**
 * Classify a drawing image using the ONNX CNN model.
 * Input: PNG/JPEG Blob from canvas.toBlob()
 * Output: predicted class + confidence
 */
export async function classifyDrawingOnnx(
  imageBlob: Blob,
): Promise<{ predicted: string; confidence: number; probabilities: Record<string, number> } | null> {
  try {
    const ort = await import('onnxruntime-web');

    // Load model (cached after first load)
    const modelUrl = '/models/drawing-classifier.onnx';
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });

    // Convert image blob to 100x100 grayscale tensor
    const imageBitmap = await createImageBitmap(imageBlob);
    const canvas = new OffscreenCanvas(100, 100);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imageBitmap, 0, 0, 100, 100);
    const imageData = ctx.getImageData(0, 0, 100, 100);

    // Convert to grayscale float32 [1, 1, 100, 100]
    const input = new Float32Array(100 * 100);
    for (let i = 0; i < 100 * 100; i++) {
      // Average RGB channels, normalize to 0-1, invert (drawing is dark on light)
      const r = imageData.data[i * 4];
      const g = imageData.data[i * 4 + 1];
      const b = imageData.data[i * 4 + 2];
      input[i] = 1.0 - (r + g + b) / (3 * 255);
    }

    const tensor = new ort.Tensor('float32', input, [1, 1, 100, 100]);
    const inputName = session.inputNames[0] ?? 'input';
    const results = await session.run({ [inputName]: tensor });
    const outputName = session.outputNames[0] ?? 'output';
    const outputData = results[outputName].data as Float32Array;

    // Map to classes
    const probabilities: Record<string, number> = {};
    let maxIdx = 0;
    let maxProb = -1;
    for (let i = 0; i < SHAPE_CLASSES.length && i < outputData.length; i++) {
      probabilities[SHAPE_CLASSES[i]] = outputData[i];
      if (outputData[i] > maxProb) {
        maxProb = outputData[i];
        maxIdx = i;
      }
    }

    return {
      predicted: SHAPE_CLASSES[maxIdx],
      confidence: maxProb,
      probabilities,
    };
  } catch {
    return null; // ONNX not available or failed
  }
}

export interface OnnxClassification {
  predicted: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface DrawingFeatures {
  shapeId: string;
  closedness: number;       // 0-1, how closed the shape is
  smoothness: number;       // 0-1, stroke smoothness
  symmetry: number;         // 0-1, bilateral symmetry
  sizeConsistency: number;  // 0-1, consistent sizing
  strokeCount: number;
  totalPoints: number;
  drawingTime: number;      // ms
}

export interface DrawingAnalysisResult {
  shapes: DrawingFeatures[];
  overallScore: number;     // 0-100
  maturityLevel: 'above_expected' | 'age_appropriate' | 'below_expected';
  onnxClassification?: OnnxClassification;
}

export function analyzeDrawing(
  drawingEvents: Array<{ data: Record<string, unknown> }>,
  onnxResults?: OnnxClassification | null,
): DrawingAnalysisResult {
  const shapes: DrawingFeatures[] = [];

  for (const event of drawingEvents) {
    if (event.data.shapeId === undefined) continue;

    const strokes = (event.data.strokes as Array<Array<{ x: number; y: number; t: number }>>) ?? [];
    const allPoints = strokes.flat();

    if (allPoints.length < 2) {
      shapes.push({
        shapeId: event.data.shapeId as string,
        closedness: 0,
        smoothness: 0,
        symmetry: 0,
        sizeConsistency: 0,
        strokeCount: strokes.length,
        totalPoints: allPoints.length,
        drawingTime: 0,
      });
      continue;
    }

    // Closedness: distance from first to last point / perimeter
    const first = allPoints[0];
    const last = allPoints[allPoints.length - 1];
    const closeDist = Math.hypot(last.x - first.x, last.y - first.y);
    let perimeter = 0;
    for (let i = 1; i < allPoints.length; i++) {
      perimeter += Math.hypot(allPoints[i].x - allPoints[i - 1].x, allPoints[i].y - allPoints[i - 1].y);
    }
    const closedness = perimeter > 0 ? Math.max(0, 1 - closeDist / perimeter) : 0;

    // Smoothness: based on angle changes between segments
    let angleChanges = 0;
    for (let i = 2; i < allPoints.length; i++) {
      const dx1 = allPoints[i - 1].x - allPoints[i - 2].x;
      const dy1 = allPoints[i - 1].y - allPoints[i - 2].y;
      const dx2 = allPoints[i].x - allPoints[i - 1].x;
      const dy2 = allPoints[i].y - allPoints[i - 1].y;
      const angle = Math.abs(Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1));
      angleChanges += Math.min(angle, 2 * Math.PI - angle);
    }
    const avgAngleChange = allPoints.length > 2 ? angleChanges / (allPoints.length - 2) : 0;
    const smoothness = Math.max(0, 1 - avgAngleChange / Math.PI);

    // Symmetry: compare left half vs right half bounding box
    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const leftPoints = allPoints.filter(p => p.x <= centerX).length;
    const rightPoints = allPoints.filter(p => p.x > centerX).length;
    const total = leftPoints + rightPoints;
    const symmetry = total > 0 ? 1 - Math.abs(leftPoints - rightPoints) / total : 0;

    // Size consistency (bounding box aspect ratio closeness to 1)
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const aspect = width > 0 && height > 0 ? Math.min(width, height) / Math.max(width, height) : 0;
    const sizeConsistency = aspect; // 1 = square aspect, 0 = very elongated

    // Drawing time
    const times = allPoints.map(p => p.t);
    const drawingTime = times.length > 0 ? Math.max(...times) - Math.min(...times) : 0;

    shapes.push({
      shapeId: event.data.shapeId as string,
      closedness,
      smoothness,
      symmetry,
      sizeConsistency,
      strokeCount: strokes.length,
      totalPoints: allPoints.length,
      drawingTime,
    });
  }

  // Overall score: weighted average of features across shapes
  const featureScores = shapes.map(s =>
    s.closedness * 0.3 + s.smoothness * 0.3 + s.symmetry * 0.2 + s.sizeConsistency * 0.2
  );
  let overallScore = featureScores.length > 0
    ? Math.round((featureScores.reduce((s, v) => s + v, 0) / featureScores.length) * 100)
    : 0;

  // Boost score if ONNX classification confirms a recognizable shape with high confidence
  if (onnxResults && onnxResults.predicted !== 'unknown' && onnxResults.confidence > 0.6) {
    const onnxBonus = Math.round(onnxResults.confidence * 10);
    overallScore = Math.min(100, overallScore + onnxBonus);
  }

  const maturityLevel = overallScore >= 70
    ? 'above_expected'
    : overallScore >= 40
    ? 'age_appropriate'
    : 'below_expected';

  return {
    shapes,
    overallScore,
    maturityLevel,
    ...(onnxResults ? { onnxClassification: onnxResults } : {}),
  };
}
