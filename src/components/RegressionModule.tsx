import React, { useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Line, ComposedChart, ReferenceLine } from 'recharts';
import ExportWrapper from './ExportWrapper';

export default function RegressionModule({ datasets }: { datasets: any[] }) {
  const [responseId, setResponseId] = useState('');
  const [predictorIds, setPredictorIds] = useState<string[]>([]);
  
  // Mock data for the 4-in-1 Residuals
  const residualData = [
    { order: 1, fit: 10.2, res: 0.5, z: 0.8 },
    { order: 2, fit: 12.4, res: -1.2, z: -1.5 },
    { order: 3, fit: 14.1, res: 0.8, z: 1.1 }
  ];

  return (
    <div className="p-6 bg-slate-900 text-slate-100 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Regression Analysis</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Predictor Selection */}
        <div className="col-span-1 space-y-4">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h3 className="font-semibold mb-4 text-neon-accent">Model Variables</h3>
            
            <label className="block text-xs text-slate-400 mb-1">Response Variable (Y)</label>
            <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm mb-4" value={responseId} onChange={e => setResponseId(e.target.value)}>
              <option value="">Select Response...</option>
              {datasets.filter(d => d.isNumeric).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            <label className="block text-xs text-slate-400 mb-1">Predictor Variables (X)</label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
              {datasets.map(d => (
                <label key={d.id} className="flex items-center space-x-2 text-sm text-slate-300 bg-slate-900 p-2 rounded border border-slate-700">
                  <input 
                    type="checkbox" 
                    checked={predictorIds.includes(d.id)}
                    onChange={(e) => {
                      if (e.target.checked) setPredictorIds([...predictorIds, d.id]);
                      else setPredictorIds(predictorIds.filter(id => id !== d.id));
                    }}
                  />
                  <span className="truncate">{d.name}</span>
                  {!d.isNumeric && <span className="text-[10px] bg-amber-900/50 text-amber-400 px-1 rounded ml-auto">Cat</span>}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Output & Diagnostics */}
        <div className="col-span-1 lg:col-span-3 space-y-6">
          <ExportWrapper fileName="regression-metrics">
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
              <h3 className="text-lg font-bold mb-4">Regression Equation</h3>
              <div className="bg-slate-900 p-4 rounded border border-slate-700 text-center font-mono text-lg text-sky-400">
                Y = 12.4501 + 2.3041(X₁) - 0.8420(X₂)
              </div>
              
              <div className="grid grid-cols-4 gap-4 mt-6">
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">R-Sq (Adj)</div>
                  <div className="text-xl font-mono text-white">84.21%</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">R-Sq</div>
                  <div className="text-xl font-mono text-white">85.04%</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">S (RMSE)</div>
                  <div className="text-xl font-mono text-white">1.0425</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">P-Value</div>
                  <div className="text-xl font-mono text-white">&lt; 0.0001</div>
                </div>
              </div>
            </div>
          </ExportWrapper>

          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h3 className="text-md font-bold mb-4">4-in-1 Residual Diagnostics</h3>
            <div className="grid grid-cols-2 gap-4 h-[400px]">
              
              {/* Normal Probability Plot */}
              <ExportWrapper fileName="residuals-normal-plot">
                <div className="border border-slate-700 rounded p-2 h-full">
                  <div className="text-xs text-center text-slate-400 mb-1">Normal Probability Plot</div>
                  <ResponsiveContainer width="100%" height="90%">
                    <ComposedChart data={residualData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="res" type="number" hide />
                      <YAxis dataKey="z" type="number" hide />
                      <Scatter dataKey="z" fill="#38bdf8" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </ExportWrapper>

              {/* Versus Fits */}
              <ExportWrapper fileName="residuals-vs-fits">
                <div className="border border-slate-700 rounded p-2 h-full">
                  <div className="text-xs text-center text-slate-400 mb-1">Versus Fits</div>
                  <ResponsiveContainer width="100%" height="90%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="fit" type="number" tick={{fontSize: 10}} />
                      <YAxis dataKey="res" type="number" tick={{fontSize: 10}} />
                      <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
                      <Scatter data={residualData} fill="#38bdf8" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </ExportWrapper>
              
              {/* Histogram */}
              <ExportWrapper fileName="residuals-histogram">
                <div className="border border-slate-700 rounded p-2 flex items-center justify-center h-full">
                   <div className="text-slate-500 text-sm">Residual Histogram</div>
                </div>
              </ExportWrapper>

              {/* Versus Order */}
              <ExportWrapper fileName="residuals-vs-order">
                <div className="border border-slate-700 rounded p-2 h-full">
                  <div className="text-xs text-center text-slate-400 mb-1">Versus Order</div>
                  <ResponsiveContainer width="100%" height="90%">
                    <ComposedChart data={residualData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="order" type="number" tick={{fontSize: 10}} />
                      <YAxis dataKey="res" type="number" tick={{fontSize: 10}} />
                      <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
                      <Line type="step" dataKey="res" stroke="#94a3b8" strokeWidth={1} dot={<circle r={3} fill="#38bdf8" />} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </ExportWrapper>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}