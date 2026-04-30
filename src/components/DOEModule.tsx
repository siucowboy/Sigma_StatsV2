import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';

export default function DOEModule({ datasets }: { datasets: any[] }) {
  const [factors, setFactors] = useState([{ id: 1, name: 'Factor A', low: -1, high: 1 }]);
  const [responseId, setResponseId] = useState('');
  const [alpha, setAlpha] = useState(0.05);
  const [interactions, setInteractions] = useState(false);

  // Mocking the Pareto calculation for the UI scaffold
  const paretoData = [
    { term: 'A', effect: 4.2, pValue: 0.012, significant: true },
    { term: 'B', effect: 2.1, pValue: 0.08, significant: false },
    { term: 'A*B', effect: 1.5, pValue: 0.15, significant: false }
  ];

  const tCritical = 2.776; // Example critical value based on alpha and DF

  const addFactor = () => setFactors([...factors, { id: Date.now(), name: `Factor ${String.fromCharCode(65 + factors.length)}`, low: -1, high: 1 }]);

  return (
    <div className="p-6 bg-slate-900 text-slate-100 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Factorial DOE Analysis</h2>
        <button className="text-red-400 hover:text-red-300 text-sm font-semibold" onClick={() => { if(window.confirm('Reset all DOE settings?')) setFactors([{ id: 1, name: 'Factor A', low: -1, high: 1 }]); }}>
          Reset All
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Parameters */}
        <div className="col-span-1 space-y-4">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h3 className="font-semibold mb-3 text-neon-accent">Response Variable</h3>
            <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm" value={responseId} onChange={e => setResponseId(e.target.value)}>
              <option value="">Select Response (Y)...</option>
              {datasets.filter(d => d.isNumeric).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h3 className="font-semibold mb-3 text-neon-accent">Design Factors</h3>
            {factors.map((f, i) => (
              <div key={f.id} className="mb-4 bg-slate-900 p-2 rounded border border-slate-700">
                <input type="text" value={f.name} onChange={(e) => { const newF = [...factors]; newF[i].name = e.target.value; setFactors(newF); }} className="w-full bg-transparent text-sm mb-2 focus:outline-none" />
                <div className="flex gap-2">
                  <input type="number" value={f.low} onChange={(e) => { const newF = [...factors]; newF[i].low = Number(e.target.value); setFactors(newF); }} className="w-1/2 bg-slate-800 text-xs p-1 rounded" placeholder="Low (-1)" />
                  <input type="number" value={f.high} onChange={(e) => { const newF = [...factors]; newF[i].high = Number(e.target.value); setFactors(newF); }} className="w-1/2 bg-slate-800 text-xs p-1 rounded" placeholder="High (+1)" />
                </div>
              </div>
            ))}
            <button onClick={addFactor} className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition">+ Add Factor</button>
          </div>

          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h3 className="font-semibold mb-3 text-neon-accent">Model Terms</h3>
            <label className="flex items-center text-sm text-slate-300">
              <input type="checkbox" checked={interactions} onChange={e => setInteractions(e.target.checked)} className="mr-2" />
              Include 2-Way Interactions
            </label>
            <div className="mt-4">
              <label className="block text-xs text-slate-400 mb-1">Alpha (Significance Level)</label>
              <input type="range" min="0.01" max="0.20" step="0.01" value={alpha} onChange={e => setAlpha(Number(e.target.value))} className="w-full" />
              <div className="text-right text-xs text-sky-400">α = {alpha}</div>
            </div>
          </div>
        </div>

        {/* Output */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 h-[400px]">
            <h3 className="text-lg font-bold mb-4 text-center">Pareto Chart of Standardized Effects</h3>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={paretoData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis dataKey="term" type="category" stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <ReferenceLine x={tCritical} stroke="#ef4444" strokeDasharray="5 5" label={{ position: 'top', value: 'Alpha Limit', fill: '#ef4444' }} />
                <Bar dataKey="effect" barSize={30}>
                  {paretoData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.significant ? '#38bdf8' : '#475569'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <h3 className="text-lg font-bold mb-4 text-sky-400">Response Optimizer</h3>
            <p className="text-sm text-slate-400 mb-4">Select a goal to calculate optimal uncoded factor settings.</p>
            <div className="flex gap-4">
              <button className="px-4 py-2 bg-slate-700 hover:bg-sky-600 rounded text-sm transition">Maximize Response</button>
              <button className="px-4 py-2 bg-slate-700 hover:bg-sky-600 rounded text-sm transition">Minimize Response</button>
              <button className="px-4 py-2 bg-slate-700 hover:bg-sky-600 rounded text-sm transition">Target Value</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}