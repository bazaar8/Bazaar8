import { useState } from "react";
import { Link } from "react-router-dom";
import { useWatchlists } from "../hooks/useWatchlists";
import { useLivePrices } from "../hooks/useLivePrices";
import Sparkline from "../components/Sparkline";
import { Plus, Trash2, Edit2, X, PlusCircle, LayoutList } from "lucide-react";

export default function Watchlists() {
  const { watchlists, loading, createWatchlist, renameWatchlist, deleteWatchlist, addStock, removeStock } = useWatchlists();
  const { prices, marketStatus } = useLivePrices();
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [showAddStock, setShowAddStock] = useState(false);

  const activeList = watchlists.find((w) => w.id === (activeListId || watchlists[0]?.id));

  const handleCreate = () => {
    if (watchlists.length >= 3) {
      alert("Maximum 3 watchlists allowed. Please delete or rename an existing list.");
      return;
    }
    const name = window.prompt("Enter new watchlist name (max 3 lists):");
    if (name) createWatchlist(name);
  };

  const handleRename = () => {
    if (!activeList) return;
    const name = window.prompt("Enter new name for watchlist:", activeList.name);
    if (name) renameWatchlist(activeList.id, name);
  };

  const handleDelete = () => {
    if (!activeList) return;
    if (window.confirm(`Delete watchlist '${activeList.name}'?`)) {
      deleteWatchlist(activeList.id);
      setActiveListId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <LayoutList className="w-5 h-5 text-[var(--up-color)]" />
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight">Watchlists</h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
            {watchlists.length}/3 LISTS
          </span>
        </div>
        <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase bg-[var(--bg-card)] px-2 py-1 border border-[var(--border-subtle)] rounded">MARKET: {marketStatus}</div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">

        <div className="w-full lg:w-[260px] flex flex-col gap-4">
          <div className="terminal-card p-4">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border-subtle)]">
              <span className="text-xs font-bold text-[var(--text-main)]">Your Lists ({watchlists.length}/3)</span>
              {watchlists.length < 3 ? (
                <button 
                  onClick={handleCreate} 
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded text-[var(--up-color)] hover:bg-[var(--border-subtle)] transition-colors"
                >
                  <Plus className="w-3 h-3" /> New
                </button>
              ) : (
                <span className="text-[9px] font-mono text-[var(--text-muted)] px-1.5 py-0.5 bg-[var(--bg-root)] rounded border border-[var(--border-subtle)]">
                  Max 3
                </span>
              )}
            </div>

            {watchlists.length === 0 ? (
              <div className="text-[10px] font-mono text-[var(--text-muted)] text-center py-4">No lists created</div>
            ) : (
              <div className="space-y-1">
                {watchlists.map((w) => {
                  const isActive = activeList?.id === w.id;
                  return (
                    <button
                      key={w.id}
                      onClick={() => setActiveListId(w.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded transition-colors ${
                        isActive
                          ? "bg-[var(--bg-root)] text-[var(--text-main)] border-l-2 border-[var(--up-color)] font-bold"
                          : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-root)] border-l-2 border-transparent"
                      }`}
                    >
                      <span>{w.name}</span>
                      <span className="text-[10px] font-mono">{w.tickers.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {activeList ? (
            <div className="terminal-card p-0 overflow-hidden flex flex-col">

              <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-root)]">
                <h2 className="text-sm font-bold text-[var(--text-main)]">{activeList.name}</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddStock(!showAddStock)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] text-xs font-medium rounded transition-colors"
                  >
                    {showAddStock ? "Done" : <><Plus className="w-3.5 h-3.5" /> Add Ticker</>}
                  </button>
                  <button onClick={handleRename} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded transition-colors" title="Rename List">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={handleDelete} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--down-color)] rounded transition-colors" title="Delete List">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showAddStock && (
                <div className="p-4 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] max-h-[300px] overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.keys(prices).length === 0 ? (
                      <div className="col-span-full text-xs text-[var(--text-muted)] p-2">No stocks available in the market.</div>
                    ) : (
                      Object.keys(prices).map((ticker) => {
                        const isAdded = activeList.tickers.includes(ticker);
                        return (
                          <div
                            key={ticker}
                            className="flex items-center justify-between p-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded"
                          >
                            <span className="text-xs font-bold text-[var(--text-main)] font-mono">{ticker}</span>
                            {isAdded ? (
                              <button onClick={() => removeStock(activeList.id, ticker)} className="text-[var(--down-color)] p-1 hover:bg-[var(--bg-card)] rounded">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button onClick={() => addStock(activeList.id, ticker)} className="text-[var(--up-color)] p-1 hover:bg-[var(--bg-card)] rounded">
                                <PlusCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <div>
                {activeList.tickers.length === 0 ? (
                  <div className="text-xs font-medium text-[var(--text-muted)] text-center py-12">
                    No active tickers in this watchlist. Click "Add Ticker" to begin monitoring.
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {activeList.tickers.map((ticker) => {
                      const data = prices[ticker] as any;
                      if (!data) return null; 

                      const livePrice = data.price ?? 0;
                      const basePrice = data.basePrice ?? livePrice;
                      const name = data.name || ticker;
                      const change = livePrice - basePrice;
                      const changePct = basePrice > 0 ? (change / basePrice) * 100 : 0;
                      const isUp = change >= 0;
                      const spark = [basePrice, basePrice * 0.997, basePrice * 1.004, livePrice * 0.999, livePrice];

                      return (
                        <div key={ticker} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-[var(--bg-root)] transition-colors group">
                          
                          <div className="flex items-center justify-between sm:w-[35%] mb-2 sm:mb-0">
                            <div>
                              <Link to={`/stocks/${ticker}`} className="text-sm font-bold text-[var(--text-main)] hover:text-[var(--up-color)] transition-colors block">
                                {ticker}
                              </Link>
                              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{name}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end sm:w-[65%] gap-4 lg:gap-8">
                            <div className="flex flex-col sm:items-end w-24">
                              <span className="text-sm font-bold font-mono text-[var(--text-main)]">₹{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                              <span className={`text-[11px] font-mono font-medium ${isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                                {isUp ? "+" : ""}{changePct.toFixed(2)}%
                              </span>
                            </div>
                            
                            <div className="hidden md:block w-24">
                              <Sparkline data={spark} isPositive={isUp} width="100%" height={24} showArea={false} />
                            </div>

                            <div className="flex items-center gap-3">
                              <Link 
                                to={`/stocks/${ticker}`} 
                                className="px-3 py-1.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] hover:bg-[var(--border-subtle)] text-[10px] font-bold uppercase rounded transition-colors"
                              >
                                Trade
                              </Link>
                              <button
                                onClick={() => removeStock(activeList.id, ticker)}
                                className="text-[var(--text-muted)] hover:text-[var(--down-color)] p-1 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove from list"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="terminal-card p-12 text-center text-sm font-medium text-[var(--text-muted)]">
              Select or create a watchlist to monitor tickers.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}