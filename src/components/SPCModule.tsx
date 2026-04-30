import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Scatter } from 'recharts';

import ExportWrapper from './ExportWrapper';

export default function SPCModule({ datasets }: { datasets: any[] }) {
  const [chartCategory, setChartCategory] = useState<'variable' | 'attribute'>('variable');
  const [chartType, setChartType] = useState('imr');
  const [selectedDataId, setSelectedDataId] = useState('');
  const [subgroupSize, setSubgroupSize] = useState(5);

  const activeDataset = datasets.find(d => d.id === selectedDataId);
  const rawData = activeDataset?.values as number[] || [];

  // Simplified math engine for SPC calculation & Nelson Rules
  const spcData = useMemo(() => {
    if (!rawData.length) return null;
    
    let mean = rawData.reduce((a, b) => a + b, 0) / rawData.length;
    let ucl = mean, lcl = mean;
    let points = [];
    let violations = [];

    // I-MR Logic (Rule 1, 2, 3)
    if (chartType === 'imr') {
      let mrSum = 0;
      for (let i = 1; i < rawData.length; i++) {
        mrSum += Math.abs(rawData[i] - rawData[i - 1]);
      }
      const mrBar = mrSum / (rawData.length - 1);
      const sigma = mrBar / 1.128;
      ucl = mean + 3 * sigma;
      lcl = mean - 3 * sigma;

      let consecutiveAbove = 0, consecutiveBelow = 0;
      let consecutiveUp = 0, consecutiveDown = 0;

      points = rawData.map((val, i) => {
        let isViolation = false;
        let rule = '';

        // Rule 1: Beyond 3 Sigma
        if (val > ucl || val < lcl) { isViolation = true; rule = 'Rule 1 (Outlier)'; }

        // Rule 2: 9 points same side
        if (val > mean) { consecutiveAbove++; consecutiveBelow = 0; }
        else if (val < mean) { consecutiveBelow++; consecutiveAbove = 0; }
        if (consecutiveAbove >= 9 || consecutiveBelow >= 9) { isViolation = true; rule = 'Rule 2 (Shift)'; }

        // Rule 3: 6 points trending
        if (i > 0) {
          if (val > rawData[i-1]) { consecutiveUp++; consecutiveDown = 0; }
          else if (val < rawData[i-1]) { consecutiveDown++; consecutiveUp = 0; }
          if (consecutiveUp >= 6 || consecutiveDown >= 6) { isViolation = true; rule = 'Rule 3 (Trend)'; }
        }

        if (isViolation) violations.push({ index: i + 1, rule, val });

        return { id: i + 1, val, isViolation, rule };
      });
    }

    return { mean, ucl, lcl, points, violations };
  }, [rawData, chartType]);

  return (
    <div className="p-6 bg-slate-900 text-slate-100 min-h-screen">
      <h2 className="text-2xl font-bold mb-6">Control Charts (SPC)</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Data Source</label>
            <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={selectedDataId} onChange={e => setSelectedDataId(e.target.value)}>
              <option value="">Select Data...</option>
              {datasets.filter(d => d.isNumeric).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Chart Category</label>
            <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={chartCategory} onChange={e => { setChartCategory(e.target.value as any); setChartType(e.target.value === 'variable' ? 'imr' : 'p'); }}>
              <option value="variable">Variable (Continuous)</option>
              <option value="attribute">Attribute (Discrete/Defects)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Chart Type</label>
            <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={chartType} onChange={e => setChartType(e.target.value)}>
              {chartCategory === 'variable' ? (
                <>
                  <option value="imr">I-MR (Individuals)</option>
                  <option value="xbar">Xbar-R (Subgroups)</option>
                </>
              ) : (
                <>
                  <option value="p">P Chart (Proportion Defective)</option>
                  <option value="np">NP Chart (Count Defective)</option>
                  <option value="c">C Chart (Defects per Unit)</option>
                  <option value="u">U Chart (Defects per Variable Unit)</option>
                </>
              )}
            </select>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {spcData ? (
            <>
              <ExportWrapper fileName={`control-chart-${chartType}`}>
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={spcData.points} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="id" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                      <ReferenceLine y={spcData.ucl} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'top', value: 'UCL', fill: '#ef4444' }} />
                      <ReferenceLine y={spcData.mean} stroke="#22c55e" label={{ position: 'top', value: 'CL', fill: '#22c55e' }} />
                      <ReferenceLine y={spcData.lcl} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'bottom', value: 'LCL', fill: '#ef4444' }} />
                      <Line type="monotone" dataKey="val" stroke="#38bdf8" strokeWidth={2} dot={(props) => {
                        const { cx, cy, payload } = props;
                        return payload.isViolation ? <circle cx={cx} cy={cy} r={5} fill="#ef4444" /> : <circle cx={cx} cy={cy} r={3} fill="#38bdf8" />;
                      }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ExportWrapper>

              {spcData.violations.length > 0 && (
                <ExportWrapper fileName="control-chart-violations">
                  <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-lg">
                    <h3 className="text-red-400 font-bold mb-2">⚠ Process Out of Control</h3>
                    <ul className="text-sm text-slate-300 space-y-1">
                      {spcData.violations.slice(0, 5).map((v: any, i: number) => (
                        <li key={i}>Point {v.index}: {v.rule} (Value: {v.val.toFixed(2)})</li>
                      ))}
                      {spcData.violations.length > 5 && <li>...and {spcData.violations.length - 5} more violations.</li>}
                    </ul>
                  </div>
                </ExportWrapper>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a numeric dataset to generate a control chart.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}