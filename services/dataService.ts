import * as XLSX from 'xlsx';
import { DataRow, ModelType, TrainingMetrics, RandomForestModel, FEATURES, TARGET } from '../types';
import { STORAGE_KEYS, MODEL_CONFIGS } from '../constants';
import { trainRandomForest, predictForest, calculateR2, calculateMAE } from './mlEngine';

// --- Validation ---

export const validateColumns = (row: any, isTraining: boolean): string | null => {
  const missing = [];
  for (const f of FEATURES) {
    if (row[f] === undefined || row[f] === null || row[f] === '') missing.push(f);
  }
  if (isTraining && (row[TARGET] === undefined || row[TARGET] === null)) {
    missing.push(TARGET);
  }
  
  if (missing.length > 0) return `Missing columns: ${missing.join(', ')}`;
  return null;
};

// --- Storage Helper ---
const loadFromStorage = (key: string) => {
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : null;
};

const saveToStorage = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify(data));
};

// --- Operations ---

export const getStoredMetrics = (modelType: ModelType): TrainingMetrics | null => {
  const modelData = loadFromStorage(STORAGE_KEYS.MODEL(modelType));
  return modelData ? modelData.metrics : null;
};

export const clearModelData = (modelType: ModelType) => {
  localStorage.removeItem(STORAGE_KEYS.DATA(modelType));
  localStorage.removeItem(STORAGE_KEYS.MODEL(modelType));
};

export const downloadTrainingData = (modelType: ModelType) => {
  const data: DataRow[] = loadFromStorage(STORAGE_KEYS.DATA(modelType));
  if (!data || data.length === 0) {
    throw new Error("当前模型暂无累积训练数据");
  }
  
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TrainingData");
  
  XLSX.writeFile(wb, MODEL_CONFIGS[modelType].trainFile);
};

export const generateTrainTemplate = () => {
  const headers = [...FEATURES, TARGET];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Training_Template");
  XLSX.writeFile(wb, "train_template.xlsx");
};

export const generatePredictionTemplate = () => {
  const headers = [...FEATURES];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Prediction_Template");
  XLSX.writeFile(wb, "predict_template.xlsx");
};

export const downloadSummary = (modelType: ModelType) => {
  const metrics = getStoredMetrics(modelType);
  if (!metrics) {
    alert("该模型暂无训练数据");
    return;
  }
  
  const content = {
    "模型类型": MODEL_CONFIGS[modelType].name,
    "样本量": metrics.sampleSize,
    "R²": metrics.r2.toFixed(4),
    "MAE": metrics.mae.toFixed(4),
    "更新时间": metrics.lastUpdated
  };
  
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = MODEL_CONFIGS[modelType].summaryFile.replace('.json', '.txt');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const handleTrain = async (
  file: File, 
  modelType: ModelType,
  onProgress: (msg: string) => void
): Promise<TrainingMetrics> => {
  
  // 1. Read File
  onProgress("正在读取文件...");
  const data = await readFile(file);
  
  // 2. Validate
  if (data.length === 0) throw new Error("文件为空");
  const error = validateColumns(data[0], true);
  if (error) throw new Error(error);

  // 3. Accumulate Data
  onProgress("正在合并历史数据...");
  const oldData: DataRow[] = loadFromStorage(STORAGE_KEYS.DATA(modelType)) || [];
  
  // Simple merge
  const mergedData = [...oldData, ...data];
  
  // 4. Train
  onProgress(`正在训练 (样本量: ${mergedData.length}, 树: 200)...`);
  const { trees } = await trainRandomForest(mergedData);
  
  // 5. Evaluate
  onProgress("正在评估模型...");
  const yTrue = mergedData.map(r => Number(r[TARGET]));
  const predictions = mergedData.map(r => predictForest(trees, r).mean);
  
  const r2 = calculateR2(yTrue, predictions);
  const mae = calculateMAE(yTrue, predictions);
  
  const metrics: TrainingMetrics = {
    r2,
    mae,
    sampleSize: mergedData.length,
    lastUpdated: new Date().toLocaleString()
  };

  const modelPayload: RandomForestModel = {
    type: modelType,
    trees,
    metrics
  };

  // 6. Save
  onProgress("保存模型中...");
  saveToStorage(STORAGE_KEYS.DATA(modelType), mergedData);
  saveToStorage(STORAGE_KEYS.MODEL(modelType), modelPayload);

  return metrics;
};

export const handlePredict = async (
  file: File,
  modelType: ModelType,
  onProgress: (msg: string) => void
): Promise<DataRow[]> => {
  // 1. Load Model
  const modelData = loadFromStorage(STORAGE_KEYS.MODEL(modelType)) as RandomForestModel;
  if (!modelData) throw new Error("该模型尚未训练，请先训练模型。");

  // 2. Read File
  onProgress("读取预测文件...");
  const data = await readFile(file);
  if (data.length === 0) throw new Error("文件为空");
  const error = validateColumns(data[0], false); // False = target not required
  if (error) throw new Error(error);

  // 3. Predict
  onProgress("正在进行预测...");
  // Simulate a slight delay so the UI shows progress for small files
  await new Promise(resolve => setTimeout(resolve, 500));

  const results = data.map(row => {
    const preds = predictForest(modelData.trees, row);
    return {
      ...row,
      '预测采集量': Math.round(preds.mean),
      '预测下限': Math.round(preds.lowerBound),
      '预测上限': Math.round(preds.upperBound)
    };
  });

  return results;
};

export const exportPredictionResults = (
  results: DataRow[], 
  originalFileName: string, 
  modelType: ModelType
) => {
  const ws = XLSX.utils.json_to_sheet(results);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Predictions");
  
  const originalName = originalFileName.lastIndexOf('.') !== -1 
    ? originalFileName.substring(0, originalFileName.lastIndexOf('.')) 
    : originalFileName;
    
  const modelSuffix = modelType.replace('rf_model_', '');
  const fileName = `${originalName}_${modelSuffix}_predicted.xlsx`;
  
  XLSX.writeFile(wb, fileName);
};

const readFile = (file: File): Promise<DataRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bstr = e.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as DataRow[];
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};