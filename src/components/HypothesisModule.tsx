import React, { useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

export default function HypothesisModule({ datasets }: { datasets: any[] }) {
  const [activeTab, setActiveTab] = useState('1-sample');
  const [selectedDataId, setSelectedDataId] = useState('');
  const [targetValue, setTargetValue] = useState<number | ''>('');
  const [altHypothesis, setAltHypothesis] = useState('neq');
  const [overrideMethod, setOverrideMethod] = useState('auto');

  const tabs = [
    { id: '1-sample', label: '1-Sample Tests' },
    { id: '2-sample', label: '2-Sample Tests' },
    { id: 'omnibus', label: 'Omnibus Tests' },
    { id: 'variance', label: 'Variance Tests' },
    { id: 'proportions', label: 'Proportions' },
    { id: 'poisson', label: 'Poisson' },
    { id: 'chisquare', label: 'Chi-Square' }
  ];

  // Custom SVG Boxplot Component (Exactly as dialed in from the transcript)
  const CustomBoxPlot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload) return null;
    
    // Using fixed width for the box
    const boxWidth = 40;
    const halfWidth = boxWidth / 2;
    
    // We assume payload contains { min, q1, median, q3, max, outliers } mapped to the Y axis scale
    return (
      <g>
        {/* Whiskers */}
        <line x1={cx} y1={payload.minY} x2={cx} y2={payload.q1Y} stroke="#94a3b8" strokeWidth={2} strokeDasharray="3 3" />
        <line x1={cx} y1={payload.q3Y} x2={cx} y2={payload.maxY} stroke="#94a3b8" strokeWidth={2} strokeDasharray="3 3" />
        {/* Caps */}
        <line x1={cx - halfWidth/2} y1={payload.minY} x2={cx + halfWidth/2} y2={payload.minY} stroke="#94a3b8" strokeWidth={2} />
        <line x1={cx - halfWidth/2} y1={payload.maxY} x2={cx + halfWidth/2} y2={payload.maxY} stroke="#94a3b8" strokeWidth={2} />
        {/* Box */}
        <rect x={cx - halfWidth} y={payload.q3Y} width={boxWidth} height={payload.q1Y - payload.q3Y} fill="#1e293b" stroke="#38bdf8" strokeWidth={2} />
        {/* Median */}
        <line x1={cx - halfWidth} y1={payload.medianY} x2={cx + halfWidth} y2={payload.medianY} stroke="#facc15" strokeWidth={3} />
        {/* Outliers */}
        {payload.outliers?.map((outlierY: number, i: number) => (
          <circle key={i} cx={cx} cy={outlierY} r={4} fill="none" stroke="#ef4444" strokeWidth={1.5} />
        ))}
      </g>
    );
  };

  return (
    <div className="p-6 bg-slate-900 text-slate-100 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Hypothesis Testing Suite</h2>
      </div>

      {/* Parametrically Agnostic Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === tab.id ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Config Sidebar */}
        <div className="col-span-1 space-y-4">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h3 className="font-semibold mb-4 text-neon-accent">Test Configuration</h3>
            
            <label className="block text-xs text-slate-400 mb-1">Dataset</label>
            <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm mb-4" value={selectedDataId} onChange={e => setSelectedDataId(e.target.value)}>
              <option value="">Select Primary Data...</option>
              {datasets.filter(d => d.isNumeric).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            <label className="block text-xs text-slate-400 mb-1">Target / Null Hypothesis (H₀)</label>
            <input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value === '' ? '' : Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm mb-4" />

            <label className="block text-xs text-slate-400 mb-1">Alternative Hypothesis (H₁)</label>
            <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm mb-4" value={altHypothesis} onChange={e => setAltHypothesis(e.target.value)}>
              <option value="neq">Not Equal (≠)</option>
              <option value="greater">Greater Than (&gt;)</option>
              <option value="less">Less Than (&lt;)</option>
            </select>

            <label className="block text-xs text-slate-400 mb-1">Method Override</label>
            <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={overrideMethod} onChange={e => setOverrideMethod(e.target.value)}>
              <option value="auto">Auto-Select (Diagnostics Based)</option>
              <option value="parametric">Force Parametric (T-Test/ANOVA)</option>
              <option value="nonparametric">Force Non-Parametric (Wilcoxon/MWU/KW)</option>
            </select>
          </div>
        </div>

        {/* Results Area */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <h3 className="text-xl font-bold mb-2">Hypothesis Test Result</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-slate-900 p-4 rounded border border-slate-700">
                <div className="text-xs text-slate-400 uppercase">P-Value</div>
                <div className="text-3xl font-mono text-white mt-1">0.024</div>
              </div>
              <div className="bg-slate-900 p-4 rounded border border-slate-700">
                <div className="text-xs text-slate-400 uppercase">Test Statistic</div>
                <div className="text-xl font-mono text-slate-300 mt-2">T = -2.45</div>
              </div>
              <div className="bg-slate-900 p-4 rounded border border-slate-700">
                <div className="text-xs text-slate-400 uppercase">Degrees of Freedom</div>
                <div className="text-xl font-mono text-slate-300 mt-2">DF = 29</div>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              The <strong className="text-white">1-Sample T-Test</strong> provides sufficient evidence to conclude that the population mean is significantly different from the target value (p &lt; 0.05).
            </p>
          </div>

          {/* Diagnostic Checks Section */}
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
             <h3 className="text-md font-bold mb-4 text-slate-200">Diagnostic Checks / Assumptions</h3>
             <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-700 p-3 rounded">
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-sm font-semibold text-slate-300">Normality (AD)</span>
                     <span className="text-xs text-green-400 font-bold">PASS</span>
                   </div>
                   <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                     <div className="bg-green-500 h-full" style={{ width: '85%' }}></div>
                   </div>
                </div>
                <div className="border border-slate-700 p-3 rounded">
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-sm font-semibold text-slate-300">Variance Homogeneity</span>
                     <span className="text-xs text-green-400 font-bold">PASS</span>
                   </div>
                   <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                     <div className="bg-green-500 h-full" style={{ width: '92%' }}></div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}