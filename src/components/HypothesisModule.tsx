import React, { useState, useMemo } from 'react';
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer, 
  ReferenceLine, 
  Tooltip, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  Cell,
  Legend,
  ComposedChart
} from 'recharts';
import { CheckCircle2, XCircle, AlertCircle, HelpCircle, Activity, TrendingUp } from 'lucide-react';
import jStatModule from 'jstat';
const jStat: any = (jStatModule as any).jStat || jStatModule;

import Plotly from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
const Plot = createPlotlyComponent(Plotly);

import { 
  run1SampleTTest, 
  run2SampleTTest, 
  calculateAndersonDarling, 
  generateQQData, 
  runFTest, 
  runLeveneTest, 
  runMannWhitneyU, 
  getConfidenceInterval, 
  getMedianConfidenceInterval,
  getVarianceConfidenceInterval,
  getMean,
  getStdDev,
  getPercentile
} from '../lib/stats';

// --- Sub-components for cleaner UI ---
const DiagnosticIndicator = ({ label, passed, pValue }: { label: string, passed: boolean, pValue: number }) => (
  <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded border border-slate-700">
    <div>
      <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">{label}</div>
      <div className="text-sm font-mono text-slate-300">p = {pValue.toFixed(4)}</div>
    </div>
    {passed ? (
      <div className="flex flex-col items-center text-green-400">
        <CheckCircle2 size={24} />
        <span className="text-[10px] font-bold mt-1">PASS</span>
      </div>
    ) : (
      <div className="flex flex-col items-center text-red-400">
        <XCircle size={24} />
        <span className="text-[10px] font-bold mt-1">FAIL</span>
      </div>
    )}
  </div>
);

export default function HypothesisModule({ datasets }: { datasets: any[] }) {
  const [activeTab, setActiveTab] = useState('1-sample');
  
  // 1-Sample Props
  const [s1DataId, setS1DataId] = useState('');
  const [s1Target, setS1Target] = useState<number | ''>(0);
  const [s1Alt, setS1Alt] = useState('neq');

  // 2-Sample Props
  const [s2InputType, setS2InputType] = useState<'unstacked' | 'stacked'>('unstacked');
  const [s2Data1Id, setS2Data1Id] = useState('');
  const [s2Data2Id, setS2Data2Id] = useState('');
  const [s2ValueId, setS2ValueId] = useState('');
  const [s2GroupId, setS2GroupId] = useState('');
  const [s2Alt, setS2Alt] = useState('neq');

  const tabs = [
    { id: '1-sample', label: '1-Sample T-Test' },
    { id: '2-sample', label: 'Two-Sample Analysis' },
    { id: 'anova', label: 'One-Way ANOVA (Coming Soon)' }
  ];

  // --- 1-Sample Calculations ---
  const s1Results = useMemo(() => {
    if (activeTab !== '1-sample' || !s1DataId || s1Target === '') return null;
    const data = datasets.find(d => d.id === s1DataId)?.values.filter((v: any) => typeof v === 'number' && !isNaN(v)) || [];
    if (data.length < 2) return null;
    return { ...run1SampleTTest(data, Number(s1Target), s1Alt), data };
  }, [activeTab, s1DataId, s1Target, s1Alt, datasets]);

  // --- 2-Sample Calculations & Diagnostics ---
  const s2Analysis = useMemo(() => {
    if (activeTab !== '2-sample') return null;

    let data1: number[] = [];
    let data2: number[] = [];
    let name1 = 'Sample 1';
    let name2 = 'Sample 2';

    if (s2InputType === 'unstacked') {
      const d1 = datasets.find(d => d.id === s2Data1Id);
      const d2 = datasets.find(d => d.id === s2Data2Id);
      if (!d1 || !d2) return null;
      data1 = d1.values.filter((v: any) => typeof v === 'number' && !isNaN(v));
      data2 = d2.values.filter((v: any) => typeof v === 'number' && !isNaN(v));
      name1 = d1.name;
      name2 = d2.name;
    } else {
      const valCol = datasets.find(d => d.id === s2ValueId);
      const grpCol = datasets.find(d => d.id === s2GroupId);
      if (!valCol || !grpCol) return null;
      
      const groups = [...new Set(grpCol.values)].filter(g => g !== null && g !== undefined);
      if (groups.length < 2) return null;
      
      name1 = String(groups[0]);
      name2 = String(groups[1]);
      
      valCol.values.forEach((v: any, i: number) => {
        if (typeof v === 'number' && !isNaN(v)) {
          if (grpCol.values[i] === groups[0]) data1.push(v);
          else if (grpCol.values[i] === groups[1]) data2.push(v);
        }
      });
    }

  if (data1.length < 2 || data2.length < 3) return null;

  // 1. Normality (Anderson-Darling)
  const norm1 = calculateAndersonDarling(data1);
  const norm2 = calculateAndersonDarling(data2);
  const isNormal = norm1.pValue > 0.05 && norm2.pValue > 0.05;

  // 2. Variance (F-Test if Normal, Levene if not)
  const varTest = isNormal ? runFTest(data1, data2) : runLeveneTest(data1, data2);
  const equalVar = varTest.pValue > 0.05;

  // 3. Select Final Test
  let testType = '';
  let results: any = null;
  let ci: any = null;

  const m1 = getMean(data1);
  const m2 = getMean(data2);
  const s1 = getStdDev(data1);
  const s2 = getStdDev(data2);

  if (!isNormal) {
    testType = 'Mann-Whitney U (Non-Parametric)';
    results = runMannWhitneyU(data1, data2, s2Alt);
    const ci1 = getMedianConfidenceInterval(data1);
    const ci2 = getMedianConfidenceInterval(data2);
    ci = { 
      data: [
        { name: name1, mean: ci1.median, lcl: ci1.lcl, ucl: ci1.ucl, range: [ci1.lcl, ci1.ucl] },
        { name: name2, mean: ci2.median, lcl: ci2.lcl, ucl: ci2.ucl, range: [ci2.lcl, ci2.ucl] }
      ],
      type: 'Medians'
    };
  } else if (equalVar) {
    testType = "Student's T-Test (Equal Variance)";
    results = run2SampleTTest(data1, data2, s2Alt, true);
    const ci1 = getConfidenceInterval(data1);
    const ci2 = getConfidenceInterval(data2);
    ci = {
      data: [
        { name: name1, mean: ci1.mean, lcl: ci1.lcl, ucl: ci1.ucl, range: [ci1.lcl, ci1.ucl] },
        { name: name2, mean: ci2.mean, lcl: ci2.lcl, ucl: ci2.ucl, range: [ci2.lcl, ci2.ucl] }
      ],
      type: 'Means'
    };
  } else {
    testType = "Welch's T-Test (Unequal Variance)";
    results = run2SampleTTest(data1, data2, s2Alt, false);
    const ci1 = getConfidenceInterval(data1);
    const ci2 = getConfidenceInterval(data2);
    ci = {
      data: [
        { name: name1, mean: ci1.mean, lcl: ci1.lcl, ucl: ci1.ucl, range: [ci1.lcl, ci1.ucl] },
        { name: name2, mean: ci2.mean, lcl: ci2.lcl, ucl: ci2.ucl, range: [ci2.lcl, ci2.ucl] }
      ],
      type: 'Means'
    };
  }

    // QQ Plot Data
    const qq1 = generateQQData(data1);
    const qq2 = generateQQData(data2);

    // SD CI Data
    const sdCi1 = getVarianceConfidenceInterval(data1);
    const sdCi2 = getVarianceConfidenceInterval(data2);
    const varCiData = [
      { name: name1, mean: sdCi1.sd, lcl: sdCi1.sdLcl, ucl: sdCi1.sdUcl, range: [sdCi1.sdLcl, sdCi1.sdUcl] },
      { name: name2, mean: sdCi2.sd, lcl: sdCi2.sdLcl, ucl: sdCi2.sdUcl, range: [sdCi2.sdLcl, sdCi2.sdUcl] }
    ];

    return {
      data1, data2, name1, name2,
      norm1, norm2, isNormal,
      varTest, equalVar, varTestType: isNormal ? 'F-Test' : "Levene's Test",
      testType, results, ci,
      stats: {
        n1: data1.length, n2: data2.length,
        m1, m2, s1, s2,
        v1: s1 * s1, v2: s2 * s2,
        med1: getPercentile([...data1].sort((a,b)=>a-b), 0.5),
        med2: getPercentile([...data2].sort((a,b)=>a-b), 0.5),
      },
      varCiData,
      qq1, qq2
    };
  }, [activeTab, s2InputType, s2Data1Id, s2Data2Id, s2ValueId, s2GroupId, s2Alt, datasets]);

  return (
    <div className="p-6 bg-slate-900 text-slate-100 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Advanced Hypothesis Engine</h2>
          <p className="text-slate-400 text-sm">Statistical inference with automated diagnostic routing.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              activeTab === tab.id ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Config */}
        <div className="col-span-1 space-y-4">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-xl">
            <h3 className="font-semibold mb-4 text-sky-400 flex items-center gap-2">
              <HelpCircle size={16} /> Configuration
            </h3>
            
            {activeTab === '1-sample' && (
              <div className="space-y-4">
                <label className="block text-xs uppercase text-slate-500 font-bold">Variable</label>
                <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={s1DataId} onChange={e => setS1DataId(e.target.value)}>
                  <option value="">Select Data...</option>
                  {datasets.filter(d => d.isNumeric).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <label className="block text-xs uppercase text-slate-500 font-bold">Null Hypothesis (H₀: μ = X)</label>
                <input type="number" value={s1Target} onChange={e => setS1Target(e.target.value === '' ? '' : Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" />
                <label className="block text-xs uppercase text-slate-500 font-bold">Alternative (H₁)</label>
                <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={s1Alt} onChange={e => setS1Alt(e.target.value)}>
                  <option value="neq">Mean ≠ Target</option>
                  <option value="greater">Mean &gt; Target</option>
                  <option value="less">Mean &lt; Target</option>
                </select>
              </div>
            )}

            {activeTab === '2-sample' && (
              <div className="space-y-4">
                <label className="block text-xs uppercase text-slate-500 font-bold">Data Layout</label>
                <div className="flex bg-slate-900 p-1 rounded border border-slate-700">
                  <button 
                    onClick={() => setS2InputType('unstacked')}
                    className={`flex-1 py-1 text-xs rounded transition ${s2InputType === 'unstacked' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Unstacked
                  </button>
                  <button 
                    onClick={() => setS2InputType('stacked')}
                    className={`flex-1 py-1 text-xs rounded transition ${s2InputType === 'stacked' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Stacked
                  </button>
                </div>

                {s2InputType === 'unstacked' ? (
                  <>
                    <label className="block text-xs uppercase text-slate-500 font-bold">Sample 1</label>
                    <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={s2Data1Id} onChange={e => setS2Data1Id(e.target.value)}>
                      <option value="">Select Data...</option>
                      {datasets.filter(d => d.isNumeric).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <label className="block text-xs uppercase text-slate-500 font-bold">Sample 2</label>
                    <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={s2Data2Id} onChange={e => setS2Data2Id(e.target.value)}>
                      <option value="">Select Data...</option>
                      {datasets.filter(d => d.isNumeric).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="block text-xs uppercase text-slate-500 font-bold">Value Column</label>
                    <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={s2ValueId} onChange={e => setS2ValueId(e.target.value)}>
                      <option value="">Select Variable...</option>
                      {datasets.filter(d => d.isNumeric).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <label className="block text-xs uppercase text-slate-500 font-bold">Group Column</label>
                    <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={s2GroupId} onChange={e => setS2GroupId(e.target.value)}>
                      <option value="">Select Category...</option>
                      {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </>
                )}

                <label className="block text-xs uppercase text-slate-500 font-bold">Alternative (H₁)</label>
                <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={s2Alt} onChange={e => setS2Alt(e.target.value)}>
                  <option value="neq">Sample 1 ≠ Sample 2</option>
                  <option value="greater">Sample 1 &gt; Sample 2</option>
                  <option value="less">Sample 1 &lt; Sample 2</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-3 space-y-6">
          {activeTab === '1-sample' && (
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-xl space-y-8">
              <h3 className="text-xl font-bold">1-Sample T-Test Analysis</h3>
              {!s1Results ? (
                <div className="h-64 flex items-center justify-center border border-dashed border-slate-700 rounded text-slate-500 italic">
                  Complete settings to run analysis.
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                    <div className="bg-slate-900 p-4 rounded border border-slate-700">
                      <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Mean</div>
                      <div className="text-2xl font-mono text-red-500 font-bold">{s1Results.mean.toFixed(3)}</div>
                    </div>
                    <div className="bg-slate-900 p-4 rounded border border-slate-700">
                      <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">P-Value</div>
                      <div className={`text-2xl font-mono font-bold ${s1Results.pValue < 0.05 ? 'text-red-500' : 'text-green-500'}`}>
                        {s1Results.pValue.toFixed(4)}
                      </div>
                    </div>
                    <div className="bg-slate-900 p-4 rounded border border-slate-700">
                      <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">T-Value</div>
                      <div className="text-2xl font-mono text-slate-200">{s1Results.statistic.toFixed(3)}</div>
                    </div>
                    <div className="bg-slate-900 p-4 rounded border border-slate-700">
                      <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Decision</div>
                      <div className={`text-xs mt-2 font-bold ${s1Results.pValue < 0.05 ? 'text-red-400' : 'text-green-400'}`}>
                        {s1Results.pValue < 0.05 ? 'REJECT NULL' : 'FAIL TO REJECT'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-slate-900 p-4 rounded border border-slate-700">
                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 text-center tracking-widest">Distribution Boxplot</h4>
                      <div className="h-48 overflow-hidden">
                        <Plot
                          data={[
                            {
                              x: s1Results.data.map(v => Number(v)).filter(v => !isNaN(v)),
                              type: 'box',
                              name: 'Sample',
                              marker: { color: '#38bdf8' },
                              boxpoints: 'outliers',
                              orientation: 'h'
                            }
                          ]}
                          layout={{
                            autosize: true,
                            showlegend: false,
                            margin: { l: 40, r: 20, t: 10, b: 30 },
                            paper_bgcolor: 'transparent',
                            plot_bgcolor: 'transparent',
                            font: { color: '#94a3b8' },
                            xaxis: {
                              gridcolor: '#334155',
                              zerolinecolor: '#475569',
                              tickfont: { color: '#94a3b8', size: 10 }
                            },
                            yaxis: {
                              showticklabels: false,
                              gridcolor: 'transparent'
                            }
                          }}
                          style={{ width: '100%', height: '100%' }}
                          config={{ displayModeBar: false, responsive: true }}
                        />
                      </div>
                    </div>

                    <div className="bg-slate-900 p-4 rounded border border-slate-700 flex flex-col justify-center">
                       <p className="text-sm text-slate-200 leading-relaxed italic border-l-4 border-sky-600 pl-4 py-2">
                        "With a P-Value of {s1Results.pValue.toFixed(4)}, we {s1Results.pValue < 0.05 ? 'have' : 'do not have'} sufficient evidence to suggest the population mean is {s1Alt === 'neq' ? 'different from' : s1Alt === 'greater' ? 'greater than' : 'less than'} {s1Target}."
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-mono">
                         <div className="bg-slate-800/50 p-2 rounded">N: {s1Results.n}</div>
                         <div className="bg-slate-800/50 p-2 rounded">StDev: {s1Results.sd.toFixed(3)}</div>
                         <div className="bg-slate-800/50 p-2 rounded">Target: {s1Target}</div>
                         <div className="bg-slate-800/50 p-2 rounded">DF: {s1Results.df}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === '2-sample' && (
            <>
              {/* Diagnostics Row */}
              {s2Analysis && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                    <h4 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2 uppercase tracking-tight">
                      <Activity size={14} className="text-emerald-400" /> Assumptions: Normality (Anderson-Darling)
                    </h4>
                    <div className="space-y-2 mb-4">
                      <DiagnosticIndicator label={s2Analysis.name1} passed={s2Analysis.norm1.pValue > 0.05} pValue={s2Analysis.norm1.pValue} />
                      <DiagnosticIndicator label={s2Analysis.name2} passed={s2Analysis.norm2.pValue > 0.05} pValue={s2Analysis.norm2.pValue} />
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                          <XAxis 
                            type="number" 
                            dataKey="x" 
                            name="Expected" 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            domain={['dataMin - 0.5', 'dataMax + 0.5']} 
                            label={{ value: 'Expected Normal', position: 'bottom', fill: '#64748b', fontSize: 10 }} 
                          />
                          <YAxis 
                            type="number" 
                            dataKey="y" 
                            name="Observed" 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            domain={['dataMin - 0.5', 'dataMax + 0.5']} 
                          />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#0f172a' }} />
                          <ReferenceLine x={0} y={0} segment={[{x: -4, y: -4}, {x: 4, y: 4}]} stroke="#475569" strokeDasharray="3 3" />
                          <Scatter name={s2Analysis.name1} data={s2Analysis.qq1} fill="#38bdf8" shape="circle" />
                          <Scatter name={s2Analysis.name2} data={s2Analysis.qq2} fill="#fbbf24" shape="square" />
                          <Legend verticalAlign="top" height={36} iconType="circle" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                    <h4 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2 uppercase tracking-tight">
                      <TrendingUp size={14} className="text-amber-400" /> Variance Equality ({s2Analysis.varTestType})
                    </h4>
                    <div className="mb-4">
                      <DiagnosticIndicator label="Homogeneity" passed={s2Analysis.equalVar} pValue={s2Analysis.varTest.pValue} />
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart layout="vertical" data={s2Analysis.varCiData} margin={{ top: 20, right: 30, bottom: 20, left: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                          <XAxis type="number" domain={['auto', 'auto']} stroke="#94a3b8" fontSize={10} />
                          <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={10} />
                          <Tooltip />
                          {/* Range Bar */}
                          <Bar dataKey="range" fill="#38bdf8" barSize={4} fillOpacity={0.6}>
                            {s2Analysis.varCiData.map((entry: any, index: number) => (
                              <Cell key={index} fill={index === 0 ? '#38bdf8' : '#fbbf24'} />
                            ))}
                          </Bar>
                          {/* Point Estimate */}
                          <Scatter dataKey="mean" fill="#fff">
                            {s2Analysis.varCiData.map((entry: any, index: number) => (
                              <Cell key={index} fill={index === 0 ? '#38bdf8' : '#fbbf24'} stroke="#fff" strokeWidth={2} />
                            ))}
                          </Scatter>
                        </ComposedChart>
                      </ResponsiveContainer>
                      <p className="text-[10px] text-slate-500 text-center italic mt-2">Standard Deviation 95% Confidence Intervals</p>
                    </div>
                  </div>
                </div>
              )}

                {/* Main Test Results Panel */}
              <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-xl space-y-8">
                {!s2Analysis ? (
                  <div className="h-64 flex items-center justify-center border border-dashed border-slate-700 rounded text-slate-500 italic">
                    Select datasets and alternative hypothesis to analyze.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Left: Stats Tables */}
                      <div className="space-y-8">
                        {/* Check of Equal Variance */}
                        <div>
                          <h4 className="text-xs font-bold text-sky-400 uppercase mb-3 flex items-center gap-2">
                            Check of Equal Variance
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-700">
                                  <th className="py-2 text-slate-500 uppercase font-bold">Sample</th>
                                  <th className="py-2 text-slate-300 font-mono text-center">N</th>
                                  <th className="py-2 text-slate-300 font-mono text-center">StDev</th>
                                  <th className="py-2 text-slate-300 font-mono text-center">Variance</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-slate-800/50">
                                  <td className="py-2 text-slate-300 font-medium">{s2Analysis.name1}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.n1}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.s1.toFixed(3)}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.v1.toFixed(3)}</td>
                                </tr>
                                <tr className="border-b border-slate-800/50">
                                  <td className="py-2 text-slate-300 font-medium">{s2Analysis.name2}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.n2}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.s2.toFixed(3)}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.v2.toFixed(3)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          
                          <div className="mt-4 flex flex-col gap-2">
                             <div className="flex justify-between items-center text-[10px] bg-slate-900/50 p-2 rounded">
                                <span className="text-slate-500 uppercase font-bold">Ratio of Std Dev's</span>
                                <span className="text-red-500 font-mono font-bold text-sm">{(s2Analysis.stats.s1 / s2Analysis.stats.s2).toFixed(3)}</span>
                             </div>
                             <div className="flex justify-between items-center text-[10px] bg-slate-900/50 p-2 rounded">
                                <span className="text-slate-500 uppercase font-bold">Ratio of Variances</span>
                                <span className="text-red-500 font-mono font-bold text-sm">{(s2Analysis.stats.v1 / s2Analysis.stats.v2).toFixed(3)}</span>
                             </div>
                             <div className="flex justify-between items-center text-[10px] bg-slate-900/50 p-2 rounded border border-slate-700/50">
                                <span className="text-slate-500 uppercase font-bold">{s2Analysis.varTestType} P-Value</span>
                                <span className={`font-mono font-bold text-sm ${s2Analysis.varTest.pValue < 0.05 ? 'text-red-500' : 'text-green-500'}`}>
                                  {s2Analysis.varTest.pValue.toFixed(3)}
                                </span>
                             </div>
                          </div>

                          <div className="mt-4 bg-slate-900/80 p-3 rounded border border-slate-700">
                             <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Recommendation</p>
                             <p className={`text-xs font-bold ${s2Analysis.equalVar ? 'text-green-400' : 'text-amber-400'}`}>
                               Recommend {s2Analysis.equalVar ? 'USING' : 'NOT USING'} Assumption of Equal Variance
                             </p>
                          </div>
                        </div>

                        {/* T-Test Results Table */}
                        <div className="pt-6 border-t border-slate-700">
                          <h4 className="text-xs font-bold text-sky-400 uppercase mb-3 flex items-center gap-2">
                            {s2Analysis.testType} Results
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-700">
                                  <th className="py-2 text-slate-500 uppercase font-bold">Sample</th>
                                  <th className="py-2 text-slate-300 font-mono text-center">N</th>
                                  <th className="py-2 text-slate-300 font-mono text-center">Mean/Med</th>
                                  <th className="py-2 text-slate-300 font-mono text-center">StDev</th>
                                  <th className="py-2 text-slate-300 font-mono text-center">SE Mean</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-slate-800/50">
                                  <td className="py-2 text-slate-300 font-medium">{s2Analysis.name1}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.n1}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{(s2Analysis.ci.type === 'Medians' ? s2Analysis.stats.med1 : s2Analysis.stats.m1).toFixed(3)}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.s1.toFixed(3)}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{(s2Analysis.stats.s1 / Math.sqrt(s2Analysis.stats.n1)).toFixed(3)}</td>
                                </tr>
                                <tr className="border-b border-slate-800/50">
                                  <td className="py-2 text-slate-300 font-medium">{s2Analysis.name2}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.n2}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{(s2Analysis.ci.type === 'Medians' ? s2Analysis.stats.med2 : s2Analysis.stats.m2).toFixed(3)}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{s2Analysis.stats.s2.toFixed(3)}</td>
                                  <td className="py-2 text-center text-red-500 font-mono font-bold">{(s2Analysis.stats.s2 / Math.sqrt(s2Analysis.stats.n2)).toFixed(3)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="mt-6 grid grid-cols-2 gap-4">
                             <div className="bg-slate-900/50 p-3 rounded border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Estimate for difference</p>
                                <p className="text-xl font-mono font-bold text-red-500">
                                  {(s2Analysis.stats.m1 - s2Analysis.stats.m2).toFixed(3)}
                                </p>
                             </div>
                             <div className="bg-slate-900/50 p-3 rounded border border-slate-700 text-right">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">P-Value</p>
                                <p className={`text-xl font-mono font-bold ${s2Analysis.results.pValue < 0.05 ? 'text-red-500' : 'text-slate-200'}`}>
                                  {s2Analysis.results.pValue.toFixed(3)}
                                </p>
                             </div>
                             <div className="bg-slate-900/50 p-3 rounded border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">0.95 CI for Difference</p>
                                <p className="text-xs font-mono font-bold text-red-500">
                                  [{s2Analysis.ci.data[0].lcl.toFixed(3)} to {s2Analysis.ci.data[0].ucl.toFixed(3)}]
                                </p>
                                <p className="text-[8px] text-slate-600 italic leading-tight mt-1">*approx derived from individual CIs</p>
                             </div>
                             <div className="bg-slate-900/50 p-3 rounded border border-slate-700 text-right">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">{s2Analysis.ci.type === 'Medians' ? 'U-Statistic' : 'T-Value'}</p>
                                <p className="text-sm font-mono font-bold text-slate-300">
                                  {s2Analysis.results.statistic.toFixed(3)}
                                </p>
                             </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Main Diagnostic Plots */}
                      <div className="space-y-6">
                        <div className="bg-slate-900 p-4 rounded border border-slate-700">
                          <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 text-center tracking-widest">Plot of {s2Analysis.ci.type} Confidence Intervals</h4>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart layout="vertical" data={s2Analysis.ci.data} margin={{ top: 20, right: 30, bottom: 40, left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                                <XAxis type="number" domain={['auto', 'auto']} stroke="#94a3b8" fontSize={10} />
                                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={10} />
                                <Tooltip />
                                <Bar dataKey="range" fill="#38bdf8" barSize={4} fillOpacity={0.6}>
                                  {s2Analysis.ci.data.map((entry: any, index: number) => (
                                    <Cell key={index} fill={index === 0 ? '#38bdf8' : '#fbbf24'} />
                                  ))}
                                </Bar>
                                <Scatter dataKey="mean" fill="#fff">
                                  {s2Analysis.ci.data.map((entry: any, index: number) => (
                                    <Cell key={index} fill={index === 0 ? '#38bdf8' : '#fbbf24'} stroke="#fff" strokeWidth={2} />
                                  ))}
                                </Scatter>
                              </ComposedChart>
                            </ResponsiveContainer>
                            <p className="text-[8px] text-slate-500 text-center uppercase tracking-tighter mt-2">Sample</p>
                          </div>
                        </div>

                        <div className="bg-slate-900 p-4 rounded border border-slate-700">
                          <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 text-center tracking-widest">Distribution Boxplot</h4>
                          <div className="h-48 overflow-hidden">
                            <Plot
                              data={[
                                {
                                  x: s2Analysis.data1.map(v => Number(v)).filter(v => !isNaN(v)),
                                  type: 'box',
                                  name: s2Analysis.name1,
                                  marker: { color: '#38bdf8' },
                                  boxpoints: 'outliers',
                                  orientation: 'h'
                                },
                                {
                                  x: s2Analysis.data2.map(v => Number(v)).filter(v => !isNaN(v)),
                                  type: 'box',
                                  name: s2Analysis.name2,
                                  marker: { color: '#fbbf24' },
                                  boxpoints: 'outliers',
                                  orientation: 'h'
                                }
                              ]}
                              layout={{
                                autosize: true,
                                showlegend: false,
                                margin: { l: 80, r: 20, t: 10, b: 30 },
                                paper_bgcolor: 'transparent',
                                plot_bgcolor: 'transparent',
                                font: { color: '#94a3b8' },
                                xaxis: {
                                  gridcolor: '#334155',
                                  zerolinecolor: '#475569',
                                  tickfont: { color: '#94a3b8', size: 10 }
                                },
                                yaxis: {
                                  tickfont: { color: '#94a3b8', size: 10 },
                                  gridcolor: 'transparent'
                                }
                              }}
                              style={{ width: '100%', height: '100%' }}
                              config={{ displayModeBar: false, responsive: true }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {activeTab === 'anova' && (
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 border-dashed text-slate-500 flex items-center justify-center h-[400px] italic">
              ANOVA module is being integrated with multiple-dataset handling.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
