import { DataRow, MODEL_FEATURES, TARGET } from '../types';

const RIDGE_LAMBDA = 1;
const Z_SCORE_80 = 1.2816;

/**
 * Calculates Mean Absolute Error
 */
export const calculateMAE = (yTrue: number[], yPred: number[]): number => {
  if (yTrue.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < yTrue.length; i++) {
    sum += Math.abs(yTrue[i] - yPred[i]);
  }
  return sum / yTrue.length;
};

/**
 * Calculates R-squared
 */
export const calculateR2 = (yTrue: number[], yPred: number[]): number => {
  if (yTrue.length === 0) return 0;
  const meanY = yTrue.reduce((a, b) => a + b, 0) / yTrue.length;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < yTrue.length; i++) {
    ssTot += Math.pow(yTrue[i] - meanY, 2);
    ssRes += Math.pow(yTrue[i] - yPred[i], 2);
  }
  if (ssTot === 0) return 0;
  return 1 - (ssRes / ssTot);
};

const buildFeatureRow = (row: DataRow): number[] => {
  return MODEL_FEATURES.map(feature => Number(row[feature] ?? 0));
};

const transpose = (matrix: number[][]) => matrix[0].map((_, i) => matrix.map(row => row[i]));

const multiply = (a: number[][], b: number[][]) => {
  const result = Array.from({ length: a.length }, () => Array(b[0].length).fill(0));
  for (let i = 0; i < a.length; i++) {
    for (let k = 0; k < b.length; k++) {
      for (let j = 0; j < b[0].length; j++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
};

const multiplyVec = (a: number[][], v: number[]) => {
  return a.map(row => row.reduce((sum, value, idx) => sum + value * v[idx], 0));
};

const identity = (size: number) => {
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  for (let i = 0; i < size; i++) matrix[i][i] = 1;
  return matrix;
};

const invert = (matrix: number[][]) => {
  const size = matrix.length;
  const aug = matrix.map((row, i) => [...row, ...identity(size)[i]]);

  for (let i = 0; i < size; i++) {
    let pivot = aug[i][i];
    if (pivot === 0) {
      for (let j = i + 1; j < size; j++) {
        if (aug[j][i] !== 0) {
          [aug[i], aug[j]] = [aug[j], aug[i]];
          pivot = aug[i][i];
          break;
        }
      }
    }

    const scale = pivot === 0 ? 1 : pivot;
    for (let j = 0; j < 2 * size; j++) {
      aug[i][j] /= scale;
    }

    for (let k = 0; k < size; k++) {
      if (k === i) continue;
      const factor = aug[k][i];
      for (let j = 0; j < 2 * size; j++) {
        aug[k][j] -= factor * aug[i][j];
      }
    }
  }

  return aug.map(row => row.slice(size));
};

export const trainLinearModel = async (data: DataRow[]) => {
  const x = data.map(buildFeatureRow);
  const y = data.map(row => Number(row[TARGET] ?? 0));

  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  const centeredY = y.map(value => value - meanY);

  const xt = transpose(x);
  const xtx = multiply(xt, x);
  for (let i = 0; i < xtx.length; i++) {
    xtx[i][i] += RIDGE_LAMBDA;
  }
  const xtxInv = invert(xtx);
  const weights = multiplyVec(xtxInv, multiplyVec(xt, centeredY));

  const predictions = x.map(row => row.reduce((sum, value, idx) => sum + value * weights[idx], 0) + meanY);
  const residuals = predictions.map((pred, idx) => y[idx] - pred);
  const residualStd = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / Math.max(1, residuals.length - 1));

  return {
    weights,
    bias: meanY,
    residualStd
  };
};

export const predictLinearModel = (weights: number[], bias: number, residualStd: number, row: DataRow) => {
  const features = buildFeatureRow(row);
  const mean = features.reduce((sum, value, idx) => sum + value * weights[idx], 0) + bias;
  const range = residualStd * Z_SCORE_80;
  return {
    mean,
    lowerBound: mean - range,
    upperBound: mean + range
  };
};
