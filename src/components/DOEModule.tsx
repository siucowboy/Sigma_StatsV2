import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ReferenceLine, ResponsiveContainer, Cell, LineChart, Line, Legend
} from 'recharts';
import { 
  Plus, Trash2, RefreshCw, Layers, Grid, BarChart2, 
  Layout, Settings2, Info, ArrowRightLeft, Percent, Eye, EyeOff
} from 'lucide-react';

import ExportWrapper from './ExportWrapper';
import { generateFactorialDesign, analyzeDOE, getMean } from '../lib/stats';

export default function DOEModule({ datasets }: { datasets: any[] }) {
  // --- State ---
  const [factors, setFactors] = useState([
    { id: 1, name: 'A', low: -1, high: 1 },
    { id: 2, name: 'B', low: -1, high: 1 }
  ]);
  const [replicates, setReplicates] = useState(1);
  const [blocks, setBlocks] = useState(1);
  const [responseId, setResponseId] = useState('');
  const [alpha, setAlpha] = useState(0.05);
  const [isRandomOrder, setIsRandomOrder] = useState(false);
  const [displayCoded, setDisplayCoded] = useState(false);
  const [activeTab, setActiveTab] = useState<'design' | 'analysis' | 'plots'>('design');

  // Model Terms State
  const [selectedTerms, setSelectedTerms] = useState<string[]>(['A', 'B']);

  // --- Design Generation ---
  const designMatrix = useMemo(() => {
    const baseDesign = generateFactorialDesign(factors, replicates, blocks);
    if (isRandomOrder) {
      return [...baseDesign].sort(() => Math.random() - 0.5);
    }
    return baseDesign;
  }, [factors, replicates, blocks, isRandomOrder]);

  // --- Derived Data ---
  const responseDataset = datasets.find(d => d.id === responseId);
  const canAnalyze = responseDataset && responseDataset.values.length >= designMatrix.length;

  const analysisResults = useMemo(() => {
    if (!canAnalyze) return null;
    
    // Simple alignment: use first N values
    const dataWithResponse = designMatrix.map((run, i) => ({
      ...run,
      Response: responseDataset.values[i]
    }));

    const factorNames = factors.map(f => f.name);
    try {
      return analyzeDOE(dataWithResponse, 'Response', factorNames, selectedTerms);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [canAnalyze, designMatrix, responseDataset, selectedTerms, factors]);

  // --- Plots Data ---
  const mainEffectsData = useMemo(() => {
    if (!canAnalyze) return [];
    const dataWithResponse = designMatrix.map((run, i) => ({
      ...run,
      Response: responseDataset.values[i]
    }));

    return factors.map(f => {
      const lowMean = getMean(dataWithResponse.filter(d => d[`${f.name}_coded`] === -1).map(d => d.Response));
      const highMean = getMean(dataWithResponse.filter(d => d[`${f.name}_coded`] === 1).map(d => d.Response));
      return {
        factor: f.name,
        low: lowMean,
        high: highMean,
        effect: highMean - lowMean
      };
    });
  }, [canAnalyze, designMatrix, responseDataset, factors]);

  const interactionData = useMemo(() => {
    if (!canAnalyze || factors.length < 2) return [];
    const dataWithResponse = designMatrix.map((run, i) => ({
      ...run,
      Response: responseDataset.values[i]
    }));

    // For first pair of factors
    const f1 = factors[0].name;
    const f2 = factors[1].name;

    const pairs = [
      { f2Value: 'Low (-1)', f1Low: getMean(dataWithResponse.filter(d => d[`${f1}_coded`] === -1 && d[`${f2}_coded`] === -1).map(d => d.Response)), f1High: getMean(dataWithResponse.filter(d => d[`${f1}_coded`] === 1 && d[`${f2}_coded`] === -1).map(d => d.Response)) },
      { f2Value: 'High (+1)', f1Low: getMean(dataWithResponse.filter(d => d[`${f1}_coded`] === -1 && d[`${f2}_coded`] === 1).map(d => d.Response)), f1High: getMean(dataWithResponse.filter(d => d[`${f1}_coded`] === 1 && d[`${f2}_coded`] === 1).map(d => d.Response)) }
    ];

    return pairs.map(p => ({
        f2Value: p.f2Value,
        data: [
            { x: -1, y: p.f1Low },
            { x: 1, y: p.f1High }
        ]
    }));
  }, [canAnalyze, designMatrix, responseDataset, factors]);

  // --- Handlers ---
  const addFactor = () => {
    if (factors.length >= 7) return; 
    setFactors([...factors, { id: Date.now(), name: String.fromCharCode(65 + factors.length), low: -1, high: 1 }]);
  };

  const removeFactor = (id: number) => {
    if (factors.length <= 2) return;
    setFactors(factors.filter(f => f.id !== id));
  };

  const toggleTerm = (term: string) => {
    setSelectedTerms(prev => 
      prev.includes(term) ? prev.filter(t => t !== term) : [...prev, term]
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <Layers className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">2^k Factorial Design</h2>
            <p className="text-xs text-slate-500">Analyze interactions and optimize process response</p>
          </div>
        </div>
        <div className="flex bg-slate-800 rounded-lg p-1">
          <button 
            onClick={() => setActiveTab('design')}
            className={`px-4 py-1.5 rounded-md text-sm transition-all flex items-center gap-2 ${activeTab === 'design' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Grid className="w-4 h-4" /> Design
          </button>
          <button 
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-1.5 rounded-md text-sm transition-all flex items-center gap-2 ${activeTab === 'analysis' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <BarChart2 className="w-4 h-4" /> Analysis
          </button>
          <button 
            onClick={() => setActiveTab('plots')}
            className={`px-4 py-1.5 rounded-md text-sm transition-all flex items-center gap-2 ${activeTab === 'plots' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Layout className="w-4 h-4" /> Plots
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Configuration */}
        <div className="w-80 bg-slate-900/50 border-r border-slate-800 p-4 gap-6 flex flex-col overflow-y-auto">
          
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Settings2 className="w-3 h-3" /> Factor Settings
            </h3>
            <div className="space-y-2">
              {factors.map((f, i) => (
                <div key={f.id} className="bg-slate-800/50 rounded-lg border border-slate-700 p-3 group">
                   <div className="flex items-center justify-between mb-2">
                      <input 
                        className="bg-transparent text-sm font-bold w-full focus:outline-none text-indigo-300"
                        value={f.name}
                        onChange={e => {
                          const newFactors = [...factors];
                          newFactors[i].name = e.target.value.toUpperCase().slice(0, 5);
                          setFactors(newFactors);
                        }}
                      />
                      <button 
                        onClick={() => removeFactor(f.id)}
                        className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                   </div>
                   <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-500 block">Low (-1)</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-900 text-xs p-1.5 rounded border border-slate-700" 
                          value={f.low}
                          onChange={e => {
                            const newFactors = [...factors];
                            newFactors[i].low = Number(e.target.value);
                            setFactors(newFactors);
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-500 block">High (+1)</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-900 text-xs p-1.5 rounded border border-slate-700" 
                          value={f.high}
                          onChange={e => {
                            const newFactors = [...factors];
                            newFactors[i].high = Number(e.target.value);
                            setFactors(newFactors);
                          }}
                        />
                      </div>
                   </div>
                </div>
              ))}
              <button 
                onClick={addFactor}
                disabled={factors.length >= 7}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 text-xs rounded-lg border border-slate-700 border-dashed flex justify-center items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> Add Factor
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <RefreshCw className="w-3 h-3" /> Replicates & Blocks
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Replicates</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white"
                  value={replicates}
                  onChange={e => setReplicates(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Blocks</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white"
                  value={blocks}
                  onChange={e => setBlocks(Number(e.target.value))}
                >
                  {[1, 2, 4].filter(v => Math.pow(2, factors.length) % v === 0).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section>
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <ArrowRightLeft className="w-3 h-3" /> Response Data
            </h3>
            <div className="space-y-3">
              <select 
                className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded p-2 text-sm text-indigo-200"
                value={responseId}
                onChange={e => setResponseId(e.target.value)}
              >
                <option value="">Select Response (Y)...</option>
                {datasets.filter(d => d.isNumeric).map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.values.length} rows)</option>
                ))}
              </select>
              <div className="bg-slate-800/50 p-2 rounded text-[10px] text-slate-400 border border-slate-700 flex items-start gap-2 italic">
                <Info className="w-3 h-3 shrink-0" />
                Response values must match the design row count ({designMatrix.length} runs).
              </div>
            </div>
          </section>

          <section>
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Percent className="w-3 h-3" /> Model Refinement
            </h3>
            <div className="space-y-1">
              {factors.map(f => (
                <label key={f.name} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded transition-colors cursor-pointer group">
                  <input 
                    type="checkbox"
                    className="accent-indigo-500"
                    checked={selectedTerms.includes(f.name)}
                    onChange={() => toggleTerm(f.name)}
                  />
                  <span className="text-xs text-slate-300 group-hover:text-white">Factor {f.name}</span>
                </label>
              ))}
              <div className="h-px bg-slate-800 my-2" />
              {factors.length >= 2 && factors.slice(0, -1).map((f, i) => (
                factors.slice(i + 1).map(f2 => (
                  <label key={`${f.name}*${f2.name}`} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded transition-colors cursor-pointer group">
                    <input 
                      type="checkbox"
                      className="accent-cyan-500"
                      checked={selectedTerms.includes(`${f.name}*${f2.name}`)}
                      onChange={() => toggleTerm(`${f.name}*${f2.name}`)}
                    />
                    <span className="text-xs text-slate-300 group-hover:text-white">{f.name} × {f2.name}</span>
                  </label>
                ))
              ))}
            </div>
          </section>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
          
          {activeTab === 'design' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Generated Design Matrix</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">2^{factors.length} Factorial • {replicates} Reps • {designMatrix.length} Total Runs</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsRandomOrder(!isRandomOrder)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${isRandomOrder ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                  >
                    {isRandomOrder ? 'Random Order' : 'Standard Order'}
                  </button>
                  <button 
                     onClick={() => setDisplayCoded(!displayCoded)}
                     className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${displayCoded ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                   >
                    {displayCoded ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {displayCoded ? 'Coded (-1/1)' : 'Uncoded (Actual)'}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 shadow-2xl bg-slate-900/50">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-800">
                      <th className="p-3 font-bold">Std Ord</th>
                      <th className="p-3 font-bold">Run Ord</th>
                      <th className="p-3 font-bold">Block</th>
                      {factors.map(f => (
                        <th key={f.name} className="p-3 font-bold text-indigo-400">{f.name}</th>
                      ))}
                      <th className="p-3 font-bold text-emerald-400">Response (Y)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {designMatrix.map((run, i) => (
                      <tr key={run.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 text-xs font-mono text-slate-600">{i + 1}</td>
                        <td className="p-3 text-xs font-mono text-slate-400">{run.id}</td>
                        <td className="p-3 text-xs font-mono text-slate-400">{run.block}</td>
                        {factors.map(f => (
                          <td key={f.name} className={`p-3 text-xs font-mono font-medium ${displayCoded ? (run[`${f.name}_coded`] === 1 ? 'text-indigo-400' : 'text-slate-500') : 'text-white'}`}>
                            {displayCoded ? run[`${f.name}_coded`] : run[f.name]}
                          </td>
                        ))}
                        <td className="p-3 text-xs font-mono text-emerald-400">
                          {responseDataset && responseDataset.values[i] !== undefined 
                            ? Number(responseDataset.values[i]).toFixed(3)
                            : <span className="text-slate-700">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="space-y-6">
               {!canAnalyze ? (
                 <div className="bg-slate-900/50 border border-slate-800 rounded-2xl h-80 flex flex-col items-center justify-center p-10 text-center">
                    <div className="p-4 bg-slate-800 rounded-full mb-4">
                      <BarChart2 className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="text-slate-300 font-bold mb-2">Insufficient Data for Analysis</h3>
                    <p className="text-slate-500 text-sm max-w-xs">Select a response dataset with at least {designMatrix.length} measurements to generate the Pareto chart and ANOVA.</p>
                 </div>
               ) : (
                 <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">R-Squared</div>
                      <div className="text-2xl font-mono text-white">{(analysisResults?.rSq * 100 || 0).toFixed(1)}%</div>
                    </div>
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Std Error (S)</div>
                      <div className="text-2xl font-mono text-indigo-400">{(analysisResults?.s || 0).toFixed(4)}</div>
                    </div>
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Model P-Value</div>
                      <div className={`text-2xl font-mono ${analysisResults?.anova?.model?.p < alpha ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {(analysisResults?.anova?.model?.p || 0).toFixed(4)}
                      </div>
                    </div>
                  </div>

                  <ExportWrapper fileName="doe-pareto">
                    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-[450px]">
                       <h3 className="text-sm font-bold text-slate-400 mb-6 uppercase tracking-widest text-center">Pareto Chart of Standardized Effects</h3>
                       <ResponsiveContainer width="100%" height="100%">
                         <BarChart 
                          data={analysisResults?.coeffs.slice(1).sort((a: any, b: any) => Math.abs(b.tStat) - Math.abs(a.tStat)) || []} 
                          layout="vertical"
                          margin={{ top: 0, right: 30, left: 40, bottom: 20 }}
                         >
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                            <XAxis type="number" stroke="#94a3b8" fontSize={10} name="t-Ratio" />
                            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} />
                            <Tooltip cursor={{ fill: '#1e293b' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                            <ReferenceLine x={2.1} stroke="#ef4444" strokeDasharray="5 5" label={{ position: 'top', value: 'Significance', fill: '#ef4444', fontSize: 10 }} />
                            <Bar dataKey="tStat" name="t-Value" radius={[0, 4, 4, 0]}>
                              {analysisResults?.coeffs.slice(1).map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={Math.abs(entry.tStat) > 2.1 ? '#818cf8' : '#475569'} />
                              ))}
                            </Bar>
                         </BarChart>
                       </ResponsiveContainer>
                    </div>
                  </ExportWrapper>

                  <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800 text-slate-500 uppercase tracking-widest text-[10px]">
                        <tr>
                          <th className="p-3">Term</th>
                          <th className="p-3">Coef</th>
                          <th className="p-3">T-Value</th>
                          <th className="p-3">P-Value</th>
                          <th className="p-3">Effect (Coded)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResults?.coeffs.map((c: any) => (
                          <tr key={c.name} className="border-b border-slate-800 hover:bg-slate-800/40">
                            <td className="p-3 font-bold text-slate-200">{c.name}</td>
                            <td className="p-3 font-mono text-indigo-400">{c.coeff.toFixed(4)}</td>
                            <td className="p-3 font-mono text-slate-400">{c.tStat.toFixed(2)}</td>
                            <td className={`p-3 font-mono ${c.pValue < alpha ? 'text-emerald-400 font-bold' : 'text-slate-600'}`}>{c.pValue.toFixed(4)}</td>
                            <td className="p-3 font-mono text-slate-400">{(c.coeff * 2).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                 </>
               )}
            </div>
          )}

          {activeTab === 'plots' && (
            <div className="space-y-6">
              {!canAnalyze ? (
                 <div className="bg-slate-900/50 border border-slate-800 rounded-2xl h-80 flex flex-col items-center justify-center p-10 text-center">
                    <div className="p-4 bg-slate-800 rounded-full mb-4">
                      <Layout className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="text-slate-300 font-bold mb-2">Configure Responses to View Plots</h3>
                    <p className="text-slate-500 text-sm max-w-xs">Main Effects and Interaction plots will generated automatically from the response variable.</p>
                 </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-[400px]">
                      <h3 className="text-sm font-bold text-slate-400 mb-6 uppercase tracking-widest text-center">Main Effects Plot for Response</h3>
                      <ResponsiveContainer width="100%" height="85%">
                        <LineChart data={mainEffectsData} margin={{ top: 20, right: 40, left: 20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="factor" tick={false} stroke="#94a3b8" label={{ value: 'Factors', position: 'insideBottom', offset: -10, fill: '#94a3b8' }} />
                          <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                          <Tooltip 
                            content={({ payload }) => {
                              if (!payload || !payload[0]) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl text-[10px]">
                                  <div className="font-bold text-indigo-400 mb-1">Factor {d.factor}</div>
                                  <div className="text-slate-400">Low Mean: <span className="text-white">{d.low.toFixed(2)}</span></div>
                                  <div className="text-slate-400">High Mean: <span className="text-white">{d.high.toFixed(2)}</span></div>
                                  <div className="text-slate-200 mt-1 pt-1 border-t border-slate-700">Total Effect: <span className={d.effect > 0 ? 'text-emerald-400' : 'text-rose-400'}>{d.effect.toFixed(2)}</span></div>
                                </div>
                              );
                            }}
                          />
                          {mainEffectsData.map((d, i) => (
                             <Line 
                              key={d.factor} 
                              type="monotone" 
                              data={[
                                { factor: d.factor, x: -1, y: d.low },
                                { factor: d.factor, x: 1, y: d.high }
                              ]} 
                              dataKey="y"
                              stroke={i % 2 === 0 ? '#6366f1' : '#14b8a6'} 
                              strokeWidth={3}
                              dot={{ r: 4, strokeWidth: 2, fill: '#1e293b' }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-[400px]">
                      <h3 className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-widest text-center">Interaction Plot</h3>
                      <p className="text-[10px] text-center text-slate-600 mb-4 italic">Comparison of {factors[0]?.name} vs {factors[1]?.name}</p>
                      <ResponsiveContainer width="100%" height="80%">
                        <LineChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis 
                            type="number" 
                            domain={[-1.5, 1.5]} 
                            ticks={[-1, 1]} 
                            stroke="#94a3b8" 
                            fontSize={10}
                            tickFormatter={(v) => v === -1 ? 'Low' : 'High'}
                            label={{ value: factors[0]?.name, position: 'insideBottom', offset: -10, fill: '#94a3b8' }}
                          />
                          <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px' }} />
                          {interactionData.map((trace, i) => (
                             <Line 
                                key={trace.f2Value}
                                data={trace.data} 
                                type="monotone" 
                                dataKey="y" 
                                name={`${factors[1]?.name}: ${trace.f2Value}`}
                                stroke={i % 2 === 0 ? '#6366f1' : '#f59e0b'}
                                strokeWidth={2}
                                dot={{ r: 4 }}
                             />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
