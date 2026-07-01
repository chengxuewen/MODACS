import { useState, type JSX } from 'react';
import { McapControl } from '@debug/components/McapControl';
import { BridgeStatus } from '@debug/components/BridgeStatus';
import { ProcessMonitor } from '@debug/components/ProcessMonitor';

type TabId = 'mcap' | 'bridge' | 'processes';

interface TabDef {
  id: TabId;
  label: string;
}

const TABS: readonly TabDef[] = [
  { id: 'mcap', label: 'MCAP Recording' },
  { id: 'bridge', label: 'Bridge Status' },
  { id: 'processes', label: 'Processes' },
];

export function McapBridge(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('mcap');

  return (
    <div className="bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold text-zinc-100">MCAP / Bridge / Processes</h1>
      </div>
      <div className="flex gap-1 border-b border-zinc-800 px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-zinc-100 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-6">
        {activeTab === 'mcap' && <McapControl />}
        {activeTab === 'bridge' && <BridgeStatus />}
        {activeTab === 'processes' && <ProcessMonitor />}
      </div>
    </div>
  );
}
