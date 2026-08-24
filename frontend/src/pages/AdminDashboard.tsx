import { useState } from "react";
import { useAdminData } from "../hooks/useAdminData";
import { setMarketStatus, toggleUserFreeze, forceStockPrice } from "../services/adminService";
import { 
  LayoutDashboard, Activity, Users, Newspaper, ListOrdered, 
  Trophy, Sparkles, Server, Settings, Power, Pause, Play, ShieldAlert, Upload, Mail
} from "lucide-react";

type Tab = 'dashboard' | 'market' | 'participants' | 'news' | 'orders' | 'stocks' | 'leaderboard' | 'ipo' | 'system' | 'settings';

export default function AdminDashboard() {
  const { users, orders, newsEvents, marketState } = useAdminData();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [forceTicker, setForceTicker] = useState("");
  const [forcePrice, setForcePrice] = useState("");

  const handleForcePrice = async () => {
    if (forceTicker && forcePrice) {
      await forceStockPrice(forceTicker.toUpperCase(), parseFloat(forcePrice));
      setForceTicker("");
      setForcePrice("");
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'SYSTEM', icon: LayoutDashboard },
    { id: 'market', label: 'MARKET', icon: Activity },
    { id: 'participants', label: 'TRADERS', icon: Users },
    { id: 'news', label: 'NEWS WIRE', icon: Newspaper },
    { id: 'orders', label: 'LEDGER', icon: ListOrdered },
    { id: 'stocks', label: 'DIRECTORY', icon: Activity },
    { id: 'leaderboard', label: 'RANKINGS', icon: Trophy },
    { id: 'ipo', label: 'PRIMARY MKT', icon: Sparkles },
    { id: 'system', label: 'HEALTH', icon: Server },
    { id: 'settings', label: 'CONFIG', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-root)] transition-colors duration-200 flex flex-col md:flex-row font-sans">
      
      <div className="w-full md:w-[220px] bg-[var(--bg-card)] border-b md:border-b-0 md:border-r border-[var(--border-subtle)] flex flex-row md:flex-col sticky top-0 md:h-screen z-50">
        <div className="p-4 border-b border-[var(--border-subtle)] hidden md:block">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#f59e0b]" />
            <span className="text-[#f59e0b] font-bold tracking-tight text-lg">Admin_Sys</span>
          </div>
          <span className="text-[9px] text-[var(--text-muted)] font-mono tracking-widest block mt-1 uppercase">
            MarketSim v2.1
          </span>
        </div>
        
        <nav className="flex-1 overflow-x-auto md:overflow-y-auto flex md:flex-col py-1 md:py-3 hide-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={`flex-shrink-0 md:w-full flex items-center gap-2.5 px-4 md:px-5 py-3 md:py-2.5 text-[10px] font-bold tracking-widest uppercase transition-colors text-left ${
                  isActive 
                    ? 'bg-[var(--bg-root)] text-[var(--text-main)] border-b-2 md:border-b-0 md:border-l-2 border-[#3b82f6]' 
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-root)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-x-hidden min-w-0">
        <div className="max-w-6xl mx-auto space-y-4 lg:space-y-6">
          
          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h1 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">System Overview</h1>
                <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">Realtime Metric Telemetry</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
                <div className="terminal-card p-4">
                  <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">Engine Status</div>
                  <div className={`text-xl font-bold font-mono ${marketState === 'OPEN' ? 'text-[var(--up-color)]' : 'text-[var(--down-color)]'}`}>
                    {marketState}
                  </div>
                </div>
                <div className="terminal-card p-4">
                  <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">Active Terminals</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-main)]">
                    {users.filter(u => u.role === 'student').length}
                  </div>
                </div>
                <div className="terminal-card p-4">
                  <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">Total Executions</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-main)]">{orders.length}</div>
                </div>
                <div className="terminal-card p-4">
                  <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">News Events</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-main)]">{newsEvents.length}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'market' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h1 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">Market Operations Center</h1>
                <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">Engine State & Manual Overrides</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="terminal-card p-4 space-y-4">
                  <h2 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-widest border-b border-[var(--border-subtle)] pb-2">
                    Master Trading Switch
                  </h2>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button 
                      onClick={() => setMarketStatus('OPEN')} 
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-[var(--bg-root)] border border-[#08998150] text-[var(--up-color)] hover:bg-[#08998115] transition-colors text-[11px] font-bold uppercase rounded"
                    >
                      <Play className="w-3.5 h-3.5" /> OPEN MKT
                    </button>
                    <button 
                      onClick={() => setMarketStatus('PAUSED')} 
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-[var(--bg-root)] border border-[#f59e0b50] text-[#f59e0b] hover:bg-[#f59e0b15] transition-colors text-[11px] font-bold uppercase rounded"
                    >
                      <Pause className="w-3.5 h-3.5" /> PAUSE MKT
                    </button>
                    <button 
                      onClick={() => setMarketStatus('CLOSED')} 
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-[var(--bg-root)] border border-[#f2364550] text-[var(--down-color)] hover:bg-[#f2364515] transition-colors text-[11px] font-bold uppercase rounded"
                    >
                      <Power className="w-3.5 h-3.5" /> CLOSE MKT
                    </button>
                  </div>
                </div>

                <div className="terminal-card p-4 space-y-4">
                  <h2 className="text-xs font-bold text-[var(--down-color)] uppercase tracking-widest border-b border-[var(--border-subtle)] pb-2 flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Emergency Override: Force Price
                  </h2>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="TICKER" 
                      value={forceTicker} 
                      onChange={e => setForceTicker(e.target.value)} 
                      className="w-1/3 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs focus:outline-none focus:border-[var(--down-color)] uppercase rounded" 
                    />
                    <input 
                      type="number" 
                      placeholder="Price" 
                      value={forcePrice} 
                      onChange={e => setForcePrice(e.target.value)} 
                      className="w-1/3 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-xs focus:outline-none focus:border-[var(--down-color)] rounded" 
                    />
                    <button 
                      onClick={handleForcePrice} 
                      className="flex-1 bg-[var(--down-color)] text-white text-[11px] font-bold uppercase hover:opacity-90 transition-opacity rounded"
                    >
                      Execute
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'participants' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <h1 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">Trader Management</h1>
                  <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">Clearance & Liability Tracking</p>
                </div>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:bg-[var(--bg-root)] text-[var(--text-main)] text-[10px] font-bold uppercase transition-colors rounded">
                    <Upload className="w-3.5 h-3.5" />
                    CSV Import
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-[10px] font-bold uppercase transition-colors rounded">
                    <Mail className="w-3.5 h-3.5" />
                    Send Links
                  </button>
                </div>
              </div>

              <div className="terminal-card overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-[var(--bg-root)] text-[var(--text-muted)] border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-wider">
                      <th className="p-3">Trader Email</th>
                      <th className="p-3">Clearance</th>
                      <th className="p-3 text-right">Cash Margin</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {users.map(u => (
                      <tr key={u.uid} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="p-3 text-[var(--text-main)] font-bold">{u.email}</td>
                        <td className="p-3 text-[var(--text-muted)] uppercase">{u.role}</td>
                        <td className="p-3 text-right text-[var(--text-main)] font-bold">
                          ₹{u.cashBalance?.toLocaleString('en-IN') || 0}
                        </td>
                        <td className="p-3 text-right">
                          <button 
                            onClick={() => toggleUserFreeze(u.uid, !u.isFrozen)}
                            className={`px-2.5 py-1 text-[9px] font-bold uppercase transition-colors rounded ${
                              u.isFrozen 
                                ? 'bg-[#f59e0b15] text-[#f59e0b] hover:bg-[#f59e0b] hover:text-white border border-[#f59e0b30]' 
                                : 'bg-[#f2364515] text-[var(--down-color)] hover:bg-[var(--down-color)] hover:text-white border border-[#f2364530]'
                            }`}
                          >
                            {u.isFrozen ? 'UNFREEZE' : 'FREEZE'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'news' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h1 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">News Operations</h1>
                <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">Market Influence Injection Node</p>
              </div>
              <div className="terminal-card p-6 flex flex-col items-start gap-4">
                <p className="text-xs font-mono text-[var(--text-muted)] leading-relaxed">
                  News Engine enables gradual algorithmic influences on the exchange.<br/>
                  Parameters like hidden impact percentage and volatility multipliers are securely calculated server-side.
                </p>
                <button className="px-4 py-2 bg-[var(--up-color)] hover:opacity-90 text-white font-bold uppercase text-[10px] transition-opacity rounded">
                  Draft New Release
                </button>
              </div>
            </div>
          )}

          {['orders', 'stocks', 'leaderboard', 'ipo', 'system', 'settings'].includes(activeTab) && (
            <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)]">
              <Server className="w-10 h-10 mb-4 opacity-30" />
              <h2 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-widest">Module Initializing</h2>
              <p className="mt-1 text-[10px] font-mono">{activeTab.toUpperCase()} SUBSYSTEM SYNCING...</p>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}