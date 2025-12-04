
import * as XLSX from 'xlsx';
import { DataRow, ModelType, TrainingMetrics, RandomForestModel, FEATURES, TARGET } from '../types';
import { STORAGE_KEYS, MODEL_CONFIGS } from '../constants';
import { trainRandomForest, predictForest, calculateR2, calculateMAE } from './mlEngine';
import { dbService } from './db';

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

// --- Operations ---

export const getStoredMetrics = async (modelType: ModelType): Promise<TrainingMetrics | null> => {
  const modelData = await dbService.getModel(STORAGE_KEYS.MODEL(modelType));
  return modelData ? modelData.metrics : null;
};

export const clearModelData = async (modelType: ModelType) => {
  await dbService.saveModel(STORAGE_KEYS.MODEL(modelType), null);
  await dbService.saveData(STORAGE_KEYS.DATA(modelType), []);
};

export const downloadTrainingData = async (modelType: ModelType) => {
  const data: DataRow[] = await dbService.getData(STORAGE_KEYS.DATA(modelType));
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

export const downloadSummary = async (modelType: ModelType) => {
  const metrics = await getStoredMetrics(modelType);
  if (!metrics) {
    throw new Error("该模型暂无训练数据");
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

/**
 * Core logic to train model from a dataset
 */
export const trainFromData = async (
  data: DataRow[],
  modelType: ModelType,
  onProgress?: (msg: string) => void
): Promise<TrainingMetrics> => {
  if (data.length === 0) throw new Error("训练数据为空");

  onProgress?.(`正在训练 (样本量: ${data.length}, 树: 200)...`);
  // Small delay to allow UI render
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const { trees } = await trainRandomForest(data);
  
  // Evaluate
  onProgress?.("正在评估模型...");
  const yTrue = data.map(r => Number(r[TARGET]));
  const predictions = data.map(r => predictForest(trees, r).mean);
  
  const r2 = calculateR2(yTrue, predictions);
  const mae = calculateMAE(yTrue, predictions);
  
  const metrics: TrainingMetrics = {
    r2,
    mae,
    sampleSize: data.length,
    lastUpdated: new Date().toLocaleString()
  };

  const modelPayload: RandomForestModel = {
    type: modelType,
    trees,
    metrics
  };

  // Save to IndexedDB
  onProgress?.("保存模型到数据库...");
  await dbService.saveData(STORAGE_KEYS.DATA(modelType), data);
  await dbService.saveModel(STORAGE_KEYS.MODEL(modelType), modelPayload);

  return metrics;
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
  onProgress("正在从数据库读取历史数据...");
  const oldData: DataRow[] = (await dbService.getData(STORAGE_KEYS.DATA(modelType))) || [];
  
  // Simple merge
  const mergedData = [...oldData, ...data];
  
  // 4. Train
  return await trainFromData(mergedData, modelType, onProgress);
};

export const handlePredict = async (
  file: File,
  modelType: ModelType,
  onProgress: (msg: string) => void
): Promise<DataRow[]> => {
  // 1. Load Model from IndexedDB
  onProgress("正在加载模型...");
  const modelData = await dbService.getModel(STORAGE_KEYS.MODEL(modelType)) as RandomForestModel;
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

// Helper to get raw model data for export to GitHub
export const getModelExportData = async (modelType: ModelType) => {
  const modelData = await dbService.getModel(STORAGE_KEYS.MODEL(modelType));
  const dataset = await dbService.getData(STORAGE_KEYS.DATA(modelType));

  if (!modelData && (!dataset || dataset.length === 0)) return null;
  
  // We wrap it in a key that matches the model type for the JSON file
  // Structure: { [modelType]: { model, data } }
  return {
    [modelType]: {
      model: modelData,
      data: dataset || []
    }
  };
};

/**
 * Restores model and data from a remote JSON object (fetched from GitHub).
 * If the remote object has data but no model, it will trigger training.
 */
export const restoreModelFromRemote = async (
  modelType: ModelType, 
  remoteData: any,
  onProgress: (msg: string) => void
): Promise<TrainingMetrics | null> => {
  
  const targetData = remoteData[modelType];
  if (!targetData) {
    // If not found, maybe it's the old format where the root object was the model?
    // unlikely given the key structure, but let's be strict.
    return null;
  }

  onProgress("正在解析云端数据...");
  
  let model: RandomForestModel | null = null;
  let data: DataRow[] = [];

  // Check structure
  if (targetData.model || targetData.data) {
    // New format
    model = targetData.model;
    data = targetData.data || [];
  } else if (targetData.trees) {
    // Old format (only model)
    model = targetData;
    // No data in old format
  }

  // 1. Save Data
  if (data.length > 0) {
    onProgress(`恢复训练数据 (${data.length} 条)...`);
    await dbService.saveData(STORAGE_KEYS.DATA(modelType), data);
  }

  // 2. Save Model or Retrain
  if (model) {
    onProgress("恢复模型参数...");
    await dbService.saveModel(STORAGE_KEYS.MODEL(modelType), model);
    return model.metrics;
  } else if (data.length > 0) {
    onProgress("未发现预训练模型，正在使用云端数据进行训练...");
    return await trainFromData(data, modelType, onProgress);
  }

  return null;
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
