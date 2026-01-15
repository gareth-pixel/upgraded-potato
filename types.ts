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

export interface RandomForestModel {
  type: ModelType;
  trees: DecisionTreeNode[];
  metrics: TrainingMetrics;
  calibrationFactor?: number;
}

// Minimal structure for a decision tree node
export interface DecisionTreeNode {
  isLeaf: boolean;
  value?: number; // For leaf
  feature?: string;
  threshold?: number;
  left?: DecisionTreeNode;
  right?: DecisionTreeNode;
}

export const FEATURES = [
  '采集天数',
  '笔记数',
  '点赞数',
  '收藏数',
  '评论数'
];

export const TARGET = '采集量';

export const DAY_FEATURES = [
  '采集天数^2',
  '采集天数_log',
  '采集天数_缩放'
];

export const DERIVED_FEATURES = [
  '笔记数/天',
  '点赞数/天',
  '收藏数/天',
  '评论数/天'
];

export const MODEL_FEATURES = [
  ...FEATURES,
  ...DAY_FEATURES,
  ...DERIVED_FEATURES
];
