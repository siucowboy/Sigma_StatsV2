import React, { useState, useEffect } from 'react';
import { Database, BarChart2, Activity, TrendingUp, Grid, GitCommit } from 'lucide-react';
import { get, set } from 'idb-keyval';
import DataManager from './components/DataManager';
import CapabilityModule from './components/CapabilityModule';
import HypothesisModule from './components/HypothesisModule';
import RegressionModule from './components/RegressionModule';
import DOEModule from './components/DOEModule';
import SPCModule from './components/SPCModule';

export interface Dataset {
  id: string;
  name: string;
  values: (number | string)[];
  isNumeric: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('data');
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Persistence with IndexedDB (via idb-keyval)
  const [datasets, setDatasets] = useState<Dataset[]>([]);

  // Load datasets on mount
  useEffect(() => {
    async function loadData() {
      try {
        // Try IndexedDB first
        const saved = await get<Dataset[]>('sigmaStats_datasets');
        if (saved) {
          setDatasets(saved);
        } else {
          // Fallback to legacy localStorage if indexedDB is empty
          const legacy = localStorage.getItem('sigmaStats_datasets');
          if (legacy) {
            const parsed = JSON.parse(legacy);
            setDatasets(parsed);
          }
        }
      } catch (e) {
        console.error('Failed to load datasets:', e);
      } finally {
        setIsInitialized(true);
      }
    }
    loadData();
  }, []);

  // Save datasets on change (debounced)
  useEffect(() => {
    if (!isInitialized) return;

    const handler = setTimeout(async () => {
      try {
        await set('sigmaStats_datasets', datasets);
      } catch (e) {
        console.error('Failed to save datasets to IndexedDB:', e);
      }
    }, 1000);

    return () => clearTimeout(handler);
  }, [datasets, isInitialized]);

  const navItems = [
    { id: 'data', label: 'Data Manager', icon: Database },
    { id: 'capability', label: 'Process Capability', icon: BarChart2 },
    { id: 'hypothesis', label: 'Hypothesis Tests', icon: Activity },
    { id: 'regression', label: 'Regression Analysis', icon: TrendingUp },
    { id: 'doe', label: 'Factorial DOE', icon: Grid },
    { id: 'spc', label: 'Control Charts', icon: GitCommit },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold tracking-wider text-white">
            SigmaStats <span className="text-neon-accent text-sky-400">Pro</span>
          </h1>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center px-6 py-3 text-sm transition-colors ${
                  isActive 
                    ? 'bg-slate-800 text-sky-400 border-r-2 border-sky-400' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        <div className={activeTab === 'data' ? 'block h-full' : 'hidden'}><DataManager datasets={datasets} setDatasets={setDatasets} /></div>
        <div className={activeTab === 'capability' ? 'block h-full' : 'hidden'}><CapabilityModule datasets={datasets} /></div>
        <div className={activeTab === 'hypothesis' ? 'block h-full' : 'hidden'}><HypothesisModule datasets={datasets} /></div>
        <div className={activeTab === 'regression' ? 'block h-full' : 'hidden'}><RegressionModule datasets={datasets} /></div>
        <div className={activeTab === 'doe' ? 'block h-full' : 'hidden'}><DOEModule datasets={datasets} /></div>
        <div className={activeTab === 'spc' ? 'block h-full' : 'hidden'}><SPCModule datasets={datasets} /></div>
      </div>
    </div>
  );
}