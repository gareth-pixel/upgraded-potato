export enum ModelType {
  ONLINE = 'rf_model_online',
  RECALL = 'rf_model_recall',
  MIX = 'rf_model_mix',
}

export interface DataRow {
  [key: string]: any;
}

export interface TrainingMetrics {
  r2: number;
  mae: number;
  sampleSize: number;
  lastUpdated: string;
}

export interface PredictionResult {
  mean: number;
  lowerBound: number; // 10%
  upperBound: number; // 90%
}

export interface LinearModel {
  type: ModelType;
  weights: number[];
  bias: number;
  metrics: TrainingMetrics;
  residualStd: number;
  calibrationFactor?: number;
}

export const FEATURES = [
  '采集天数',
  '笔记数',
  '点赞数',
  '收藏数',
  '评论数'
];

export const TARGET = '采集量';

export const MODEL_FEATURES = [
  '笔记数',
  '点赞数',
  '收藏数',
  '评论数'
];
