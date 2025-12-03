import React, { useState, useEffect, useRef } from 'react';
import { Download, Upload, BarChart2, FileSpreadsheet, Activity, AlertCircle, CheckCircle, X, Save, Trash2, Database } from 'lucide-react';
import { ModelType, TrainingMetrics, DataRow, FEATURES } from './types';
import { MODEL_CONFIGS } from './constants';
import { getStoredMetrics, generateTrainTemplate, generatePredictionTemplate, downloadSummary, handleTrain, handlePredict, exportPredictionResults, clearModelData, downloadTrainingData } from './services/dataService';
import { Button } from './components/Button';
import { Card } from './components/Card';

const App: React.FC = () => {
  const [currentModel, setCurrentModel] = useState<ModelType>(ModelType.ONLINE);
  const [metrics, setMetrics] = useState<TrainingMetrics | null>(null);
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', msg: string }>({ type: 'idle', msg: '' });
  
  // Prediction Preview State
  const [previewData, setPreviewData] = useState<DataRow[] | null>(null);
  const [predictFileName, setPredictFileName] = useState<string>("");

  // File inputs refs
  const trainInputRef = useRef<HTMLInputElement>(null);
  const predictInputRef = useRef<HTMLInputElement>(null);

  // Load metrics on model switch and clear preview
  useEffect(() => {
    const m = getStoredMetrics(currentModel);
    setMetrics(m);
    setStatus({ type: 'idle', msg: '' });
    setPreviewData(null);
    setPredictFileName("");
  }, [currentModel]);

  const onTrainFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    try {
      setStatus({ type: 'loading', msg: '初始化训练...' });
      const newMetrics = await handleTrain(file, currentModel, (msg) => setStatus({ type: 'loading', msg }));
      setMetrics(newMetrics);
      setStatus({ type: 'success', msg: '训练完成！模型已更新。' });
      setPreviewData(null); // Clear any prediction preview
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', msg: err.message || '训练失败' });
    } finally {
      if (trainInputRef.current) trainInputRef.current.value = '';
    }
  };

  const handleClearData = () => {
    if (!window.confirm(`⚠️ 警告：确定要清空【${MODEL_CONFIGS[currentModel].name}】的所有训练数据和模型吗？此操作不可恢复。`)) {
      return;
    }
    try {
      clearModelData(currentModel);
      setMetrics(null);
      setStatus({ type: 'success', msg: '模型及训练数据已清空。' });
    } catch (err: any) {
      setStatus({ type: 'error', msg: '清空失败: ' + err.message });
    }
  };

  const handleDownloadTrainData = () => {
     try {
       downloadTrainingData(currentModel);
       setStatus({ type: 'success', msg: '累积训练数据下载成功。' });
     } catch (err: any) {
       setStatus({ type: 'error', msg: err.message });
     }
  };

  const onPredictFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setPredictFileName(file.name);

    try {
      setStatus({ type: 'loading', msg: '初始化预测...' });
      const results = await handlePredict(file, currentModel, (msg) => setStatus({ type: 'loading', msg }));
      setPreviewData(results);
      setStatus({ type: 'success', msg: '预测完成！请预览下方结果并导出。' });
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', msg: err.message || '预测失败' });
      setPreviewData(null);
    } finally {
      if (predictInputRef.current) predictInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    if (!previewData || !predictFileName) return;
    try {
      exportPredictionResults(previewData, predictFileName, currentModel);
      setStatus({ type: 'success', msg: '文件导出成功！' });
    } catch (err: any) {
      setStatus({ type: 'error', msg: '导出失败: ' + err.message });
    }
  };

  const clearPreview = () => {
    setPreviewData(null);
    setPredictFileName("");
    setStatus({ type: 'idle', msg: '' });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-600 p-2 rounded-lg">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">采集量预测系统</h1>
              <p className="text-xs text-gray-500">Collection Volume Prediction System</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Model Selector Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {Object.values(ModelType).map((type) => (
              <button
                key={type}
                onClick={() => setCurrentModel(type)}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors
                  ${currentModel === type
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              >
                {MODEL_CONFIGS[type].name}
              </button>
            ))}
          </nav>
        </div>

        {/* Status Banner */}
        {status.type !== 'idle' && (
          <div className={`rounded-md p-4 transition-all ${
            status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 
            status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            <div className="flex">
              <div className="flex-shrink-0">
                {status.type === 'error' && <AlertCircle className="h-5 w-5 text-red-400" />}
                {status.type === 'success' && <CheckCircle className="h-5 w-5 text-green-400" />}
                {status.type === 'loading' && <Activity className="h-5 w-5 text-blue-400 animate-pulse" />}
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">{status.msg}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Metrics */}
          <div className="lg:col-span-1 space-y-6">
            <Card title="模型状态">
              {metrics ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">R²</p>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">{metrics.r2.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">MAE</p>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">{metrics.mae.toFixed(2)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">累积样本量</p>
                    <p className="mt-1 text-3xl font-semibold text-gray-900">{metrics.sampleSize.toLocaleString()}</p>
                  </div>
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400">上次更新: {metrics.lastUpdated}</p>
                  </div>
                  <Button 
                    variant="secondary" 
                    className="w-full" 
                    onClick={() => downloadSummary(currentModel)}
                    icon={<Download size={16} />}
                  >
                    下载训练摘要
                  </Button>
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="bg-gray-100 rounded-full h-12 w-12 flex items-center justify-center mx-auto mb-3">
                    <BarChart2 className="text-gray-400" />
                  </div>
                  <p className="text-gray-500">该模型尚未训练</p>
                  <p className="text-xs text-gray-400 mt-1">请上传数据进行首次训练</p>
                </div>
              )}
            </Card>

            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 text-sm text-blue-800">
              <h4 className="font-bold mb-2 flex items-center gap-2">
                <AlertCircle size={16}/> 字段说明
              </h4>
              <ul className="list-disc pl-5 space-y-1 text-blue-700 text-xs sm:text-sm">
                <li><span className="font-semibold">FEATURES:</span> 采集天数, 笔记数, 点赞数, 收藏数, 评论数</li>
                <li><span className="font-semibold">TARGET:</span> 采集量 (仅训练需)</li>
              </ul>
            </div>
          </div>

          {/* Right Column: Actions */}
          <div className="lg:col-span-2 space-y-6">
            
            <Card title="模型训练 (累积学习)">
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  上传包含 <code>Target</code> 的 Excel/CSV 文件。系统将自动合并历史数据，重新训练随机森林模型(200棵树)，并更新评估指标。
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    ref={trainInputRef}
                    onChange={onTrainFileChange}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                  <Button 
                    onClick={() => trainInputRef.current?.click()} 
                    isLoading={status.type === 'loading'}
                    icon={<Upload size={18} />}
                  >
                    上传训练数据
                  </Button>
                  <Button 
                    variant="outline" 
                    size="md" 
                    onClick={generateTrainTemplate} 
                    icon={<FileSpreadsheet size={16}/>}
                  >
                    下载训练模板
                  </Button>
                </div>
                
                {/* Data Management Section */}
                <div className="pt-4 border-t border-gray-100 mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                     <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">当前数据:</span>
                     <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleDownloadTrainData}
                      disabled={!metrics}
                      icon={<Database size={14}/>}
                      title="下载当前模型累积的所有训练数据"
                    >
                      下载累积数据
                    </Button>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleClearData}
                    disabled={!metrics}
                    icon={<Trash2 size={14}/>}
                    className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                  >
                    清空数据
                  </Button>
                </div>
              </div>
            </Card>

            <Card title="采集量预测">
               <div className="space-y-4">
                <p className="text-sm text-gray-600">
                   上传需要预测的文件（无需 Target）。系统将生成 80% 区间预测范围，并提供预览和下载。
                </p>
                <div className="flex flex-wrap items-center gap-3">
                   <input
                    type="file"
                    ref={predictInputRef}
                    onChange={onPredictFileChange}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                  <Button 
                    variant="primary"
                    className="bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
                    onClick={() => predictInputRef.current?.click()}
                    isLoading={status.type === 'loading'}
                    disabled={!metrics}
                    icon={<Activity size={18} />}
                  >
                    上传预测数据
                  </Button>
                   <Button 
                    variant="outline" 
                    size="md" 
                    onClick={generatePredictionTemplate} 
                    icon={<FileSpreadsheet size={16}/>}
                  >
                    下载预测模板
                  </Button>
                </div>
              </div>
            </Card>

            {/* Preview Section */}
            {previewData && (
              <Card title="预测结果预览" className="border-brand-200 ring-4 ring-brand-50">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-500">
                        共 <span className="font-bold text-gray-900">{previewData.length}</span> 条数据
                      </p>
                    </div>
                    <div className="flex gap-2">
                       <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={clearPreview}
                        icon={<X size={16} />}
                      >
                        关闭
                      </Button>
                      <Button 
                        variant="primary" 
                        size="sm" 
                        onClick={handleExport}
                        icon={<Save size={16} />}
                      >
                        导出结果 Excel
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto border rounded-lg max-h-96">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {FEATURES.map(f => (
                            <th key={f} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">{f}</th>
                          ))}
                          <th className="px-3 py-2 text-left font-bold text-brand-600 bg-brand-50 uppercase tracking-wider">预测采集量</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">预测下限</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">预测上限</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {previewData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            {FEATURES.map(f => (
                              <td key={f} className="px-3 py-2 whitespace-nowrap text-gray-700">{row[f]}</td>
                            ))}
                            <td className="px-3 py-2 whitespace-nowrap font-bold text-brand-600 bg-brand-50/30">{row['预测采集量']}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-500">{row['预测下限']}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-500">{row['预测上限']}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            )}

          </div>
        </div>
      </main>
    </div>
  );
};

export default App;