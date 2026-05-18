import { describe, it, expect } from 'vitest';
import { analyzeDrawing } from '../../src/engine/cdsa/drawing-analysis';

type StrokePoint = { x: number; y: number; t: number };

function drawingEvent(shapeId: string, strokes: StrokePoint[][]) {
  return { data: { shapeId, strokes } };
}

/** A closed square drawn as one stroke, 4 corners + return to origin. */
function square(): StrokePoint[][] {
  return [[
    { x: 0,   y: 0,   t: 0   },
    { x: 100, y: 0,   t: 200 },
    { x: 100, y: 100, t: 400 },
    { x: 0,   y: 100, t: 600 },
    { x: 0,   y: 0,   t: 800 }, // close
  ]];
}

/** A horizontal line — definitely not a closed shape, no symmetry, no aspect. */
function horizontalLine(): StrokePoint[][] {
  return [[
    { x: 0,   y: 50, t: 0   },
    { x: 50,  y: 50, t: 100 },
    { x: 100, y: 50, t: 200 },
    { x: 150, y: 50, t: 300 },
  ]];
}

describe('analyzeDrawing', () => {
  it('returns an empty result when no drawing_complete events have shapeId', () => {
    const result = analyzeDrawing([{ data: { strokes: [] } }]);
    expect(result.shapes).toEqual([]);
    expect(result.overallScore).toBe(0);
    expect(result.maturityLevel).toBe('below_expected');
  });

  it('flags a shape with too few points as zeroed feature scores', () => {
    const result = analyzeDrawing([
      drawingEvent('circle', [[{ x: 10, y: 10, t: 0 }]]),
    ]);
    expect(result.shapes).toHaveLength(1);
    expect(result.shapes[0]).toMatchObject({
      shapeId: 'circle',
      closedness: 0,
      smoothness: 0,
      symmetry: 0,
      sizeConsistency: 0,
      strokeCount: 1,
      totalPoints: 1,
      drawingTime: 0,
    });
  });

  it('scores a clean closed square with high closedness and balanced symmetry', () => {
    const result = analyzeDrawing([drawingEvent('square', square())]);

    expect(result.shapes).toHaveLength(1);
    const s = result.shapes[0];
    expect(s.shapeId).toBe('square');
    // First point = last point, so closeDist=0 → closedness=1
    expect(s.closedness).toBeCloseTo(1, 5);
    // Equal left / right halves around center
    expect(s.symmetry).toBeGreaterThanOrEqual(0.5);
    // 100×100 bounding box → aspect 1
    expect(s.sizeConsistency).toBeCloseTo(1, 5);
    expect(s.strokeCount).toBe(1);
    expect(s.totalPoints).toBe(5);
    expect(s.drawingTime).toBe(800);
  });

  it('gives a horizontal line low closedness and zero size consistency', () => {
    const result = analyzeDrawing([drawingEvent('line', horizontalLine())]);
    const s = result.shapes[0];
    // First and last x differ by full line length; not closed
    expect(s.closedness).toBeLessThan(0.1);
    // Height = 0 → aspect divided by zero handled → 0
    expect(s.sizeConsistency).toBe(0);
  });

  it('boosts overallScore when ONNX classifies a recognized shape with high confidence', () => {
    const baseline = analyzeDrawing([drawingEvent('square', square())]);
    const boosted = analyzeDrawing(
      [drawingEvent('square', square())],
      { predicted: 'square', confidence: 0.9, probabilities: { square: 0.9 } },
    );

    // ONNX classification is attached
    expect(boosted.onnxClassification).toEqual({
      predicted: 'square', confidence: 0.9, probabilities: { square: 0.9 },
    });
    // Score boosted by round(0.9 * 10) = 9, clamped at 100
    expect(boosted.overallScore).toBe(Math.min(100, baseline.overallScore + 9));
  });

  it('does not boost when ONNX confidence is below 0.6', () => {
    const baseline = analyzeDrawing([drawingEvent('square', square())]);
    const lowConf = analyzeDrawing(
      [drawingEvent('square', square())],
      { predicted: 'square', confidence: 0.4, probabilities: { square: 0.4 } },
    );
    expect(lowConf.overallScore).toBe(baseline.overallScore);
    expect(lowConf.onnxClassification?.confidence).toBe(0.4);
  });

  it('does not boost when ONNX predicts "unknown"', () => {
    const baseline = analyzeDrawing([drawingEvent('square', square())]);
    const unknown = analyzeDrawing(
      [drawingEvent('square', square())],
      { predicted: 'unknown', confidence: 0.95, probabilities: { unknown: 0.95 } },
    );
    expect(unknown.overallScore).toBe(baseline.overallScore);
  });

  it('classifies maturity level by score thresholds', () => {
    // High-quality square should hit above_expected (≥ 70)
    const high = analyzeDrawing([drawingEvent('square', square())]);
    expect(high.overallScore).toBeGreaterThanOrEqual(70);
    expect(high.maturityLevel).toBe('above_expected');

    // A horizontal line scores ~50 (smoothness & symmetry compensate for
    // zero closedness/size-consistency) → falls in age_appropriate band
    const mid = analyzeDrawing([drawingEvent('line', horizontalLine())]);
    expect(mid.overallScore).toBeGreaterThanOrEqual(40);
    expect(mid.overallScore).toBeLessThan(70);
    expect(mid.maturityLevel).toBe('age_appropriate');

    // Zero-point shape → score 0 → below_expected (< 40)
    const low = analyzeDrawing([drawingEvent('empty', [[]])]);
    expect(low.overallScore).toBeLessThan(40);
    expect(low.maturityLevel).toBe('below_expected');
  });

  it('aggregates multiple shapes into one overall score', () => {
    const result = analyzeDrawing([
      drawingEvent('square', square()),
      drawingEvent('square2', square()),
    ]);
    expect(result.shapes).toHaveLength(2);
    expect(result.overallScore).toBeGreaterThan(0);
  });
});
