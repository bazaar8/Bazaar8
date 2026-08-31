import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  Star, 
  Plus, 
  X, 
  TrendingUp, 
  TrendingDown, 
  Edit2, 
  Check, 
  Search, 
  ArrowUpRight,
  Sparkles,
  Layers,
  ArrowRightLeft
} from "lucide-react";
import { STOCKS_CATALOG } from "../data/stocksData";
import { useWishlists } from "../hooks/useWishlists";

interface DashboardWishlistsProps {
  prices: Record<string, any>;
}

export default function DashboardWishlists({ prices }: DashboardWishlistsProps) {
  const {
    wishlists,
    activeWishlistId,
    setActiveWishlistId,
    activeWishlist,
    addStock,
    removeStock,
    renameWishlist,
    shiftStock
  } = useWishlists();

  const [editingWishlistId, setEditingWishlistId] = useState<number | null>(null);
  const [editedName, setEditedName] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleStartRename = (id: number, currentName: string) => {
    setEditingWishlistId(id);
    setEditedName(currentName);
  };

  const handleSaveRename = () => {
    if (editingWishlistId !== null && editedName.trim()) {
      renameWishlist(editingWishlistId, editedName.trim());
    }
    setEditingWishlistId(null);
    setEditedName("");
  };

  // Build the complete universe of stocks (Catalog + any extra tickers currently priced)
  const allAvailableStocks = useMemo(() => {
    const map = new Map<string, { ticker: string; name: string; sector: string; basePrice: number }>();
    
    // First, add all stocks from the catalog
    STOCKS_CATALOG.forEach(s => {
      map.set(s.ticker.toUpperCase(), {
        ticker: s.ticker.toUpperCase(),
        name: s.name,
        sector: s.sector || "General",
        basePrice: s.basePrice
      });
    });

    // Second, add any extra active tickers in prices (like newly listed IPOs)
    Object.entries(prices).forEach(([ticker, data]: [string, any]) => {
      const upper = ticker.toUpperCase();
      if (!map.has(upper)) {
        map.set(upper, {
          ticker: upper,
          name: data?.name || upper,
          sector: data?.sector || "NSE Equity",
          basePrice: Number(data?.basePrice || data?.price || 100)
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [prices]);

  // Filter stocks available to add to active wishlist (NO SLICE CUTOFF - SHOW ALL 50+)
  const availableToAdd = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allAvailableStocks.filter(s => {
      const alreadyInList = activeWishlist?.tickers?.includes(s.ticker);
      if (alreadyInList) return false;
      if (!q) return true;
      return s.ticker.toLowerCase().includes(q) || 
             s.name.toLowerCase().includes(q) || 
             s.sector.toLowerCase().includes(q);
    });
  }, [allAvailableStocks, activeWishlist?.tickers, searchQuery]);

  const otherWishlists = wishlists.filter(w => w.id !== activeWishlistId);

  return (
    <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 sm:p-6 flex flex-col gap-4 shadow-sm">
      
      {/* HEADER WITH DYNAMIC WISHLIST TABS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-main)] tracking-tight">
                {activeWishlist.name}
              </h3>
              <button 
                onClick={() => handleStartRename(activeWishlist.id, activeWishlist.name)} 
                className="text-[var(--text-muted)] hover:text-amber-400 transition-colors p-0.5"
                title="Rename active wishlist"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] font-mono">
              3 Custom Watchlists • {activeWishlist.tickers.length} Stocks Added
            </p>
          </div>
        </div>

        {/* The 3 Wishlist Shift / Switcher Tabs (Names Dynamically Reflected) */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-root)] p-1 border border-[var(--border-subtle)] rounded-xl flex-wrap">
          {wishlists.map((w) => {
            const isActive = w.id === activeWishlistId;
            const isEditingThis = editingWishlistId === w.id;

            if (isEditingThis) {
              return (
                <div key={w.id} className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-card)] border border-amber-400 rounded-lg shadow-sm">
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename();
                      if (e.key === 'Escape') setEditingWishlistId(null);
                    }}
                    className="w-24 px-1 py-0.5 bg-[var(--bg-root)] text-xs font-bold text-[var(--text-main)] font-mono focus:outline-none rounded"
                    autoFocus
                  />
                  <button onClick={handleSaveRename} className="text-[var(--up-color)] p-0.5 hover:opacity-80" title="Save Name">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditingWishlistId(null)} className="text-[var(--text-muted)] p-0.5 hover:text-[var(--text-main)]" title="Cancel">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div key={w.id} className="flex items-center">
                <button
                  onClick={() => { setActiveWishlistId(w.id); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 max-w-[170px] ${
                    isActive 
                      ? "bg-amber-400 text-black shadow-sm" 
                      : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]"
                  }`}
                  title={`Shift to ${w.name}`}
                >
                  <span className="truncate">{w.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full flex-shrink-0 ${
                    isActive ? "bg-black/25 text-black font-black" : "bg-[var(--border-subtle)] text-[var(--text-muted)]"
                  }`}>
                    {w.tickers.length}
                  </span>
                </button>
                {isActive && (
                  <button
                    onClick={() => handleStartRename(w.id, w.name)}
                    className="p-1 text-[var(--text-muted)] hover:text-amber-400 transition-colors ml-0.5"
                    title="Edit Name"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ACTION BAR: SEARCH / ADD STOCK BUTTON */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--text-muted)]">
          Stocks in <strong className="text-[var(--text-main)]">{activeWishlist.name}</strong>
        </span>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-[var(--up-color)] hover:opacity-90 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-opacity flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Stock</span>
        </button>
      </div>

      {/* WISHLIST STOCKS GRID */}
      {activeWishlist.tickers.length === 0 ? (
        <div className="py-12 border border-dashed border-[var(--border-subtle)] rounded-xl flex flex-col items-center justify-center text-center p-6 bg-[var(--bg-root)]/40">
          <Layers className="w-10 h-10 text-[var(--text-muted)] opacity-30 mb-2" />
          <h4 className="text-sm font-bold text-[var(--text-main)]">This Wishlist is Empty</h4>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mt-1 mb-4 font-mono">
            No stocks have been added yet. Click "Add Stock" to select from all {allAvailableStocks.length} instruments on the exchange.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-[var(--up-color)] hover:opacity-90 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-opacity flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Stocks ({allAvailableStocks.length} Available)</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {activeWishlist.tickers.map(ticker => {
            const stockMeta = allAvailableStocks.find(s => s.ticker === ticker);
            const liveData = prices[ticker];
            const basePrice = Number(liveData?.basePrice || stockMeta?.basePrice || 100);
            const currentPrice = Number(liveData?.price ?? basePrice);
            const change = currentPrice - basePrice;
            const changePct = basePrice > 0 ? (change / basePrice) * 100 : 0;
            const isUp = change >= 0;

            return (
              <div 
                key={ticker}
                className="p-3.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] hover:border-[var(--text-muted)]/40 rounded-xl flex flex-col justify-between gap-3 transition-all group relative"
              >
                {/* Remove button */}
                <button
                  onClick={() => removeStock(ticker)}
                  className="absolute top-2.5 right-2.5 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--down-color)] hover:bg-[var(--down-color)]/10 opacity-40 group-hover:opacity-100 transition-opacity"
                  title="Remove from Wishlist"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div>
                  <div className="flex items-center gap-1.5 mb-1 pr-6">
                    <span className="text-xs font-black text-[var(--text-main)] tracking-tight">
                      {ticker}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded text-[var(--text-muted)] uppercase">
                      {stockMeta?.sector || "NSE"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[170px]">
                    {stockMeta?.name || liveData?.name || ticker}
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] flex items-end justify-between font-mono">
                  <div>
                    <div className="text-sm font-bold text-[var(--text-main)]">
                      ₹{currentPrice.toFixed(2)}
                    </div>
                    <div className={`text-[10px] font-bold flex items-center gap-0.5 ${
                      isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"
                    }`}>
                      {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      <span>{isUp ? "+" : ""}{change.toFixed(2)} ({isUp ? "+" : ""}{changePct.toFixed(2)}%)</span>
                    </div>
                  </div>

                  <Link
                    to={`/stocks/${ticker}`}
                    className="p-1.5 bg-[var(--bg-card)] hover:bg-[var(--up-color)] hover:text-white text-[var(--text-main)] border border-[var(--border-subtle)] rounded-lg transition-colors"
                    title="Trade Stock"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {/* Shift to other wishlist buttons */}
                <div className="pt-2 border-t border-dashed border-[var(--border-subtle)] flex items-center justify-between text-[9px] font-mono">
                  <span className="text-[var(--text-muted)] flex items-center gap-1">
                    <ArrowRightLeft className="w-2.5 h-2.5" /> Shift:
                  </span>
                  <div className="flex gap-1">
                    {otherWishlists.map(other => (
                      <button
                        key={other.id}
                        onClick={() => shiftStock(ticker, activeWishlistId, other.id)}
                        className="px-1.5 py-0.5 bg-[var(--bg-card)] hover:border-amber-400 border border-[var(--border-subtle)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors truncate max-w-[75px]"
                        title={`Shift ${ticker} to ${other.name}`}
                      >
                        {other.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* POPUP MODAL TO ADD STOCKS - ALL 50+ STOCKS FULLY VISIBLE & SEARCHABLE */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">
                  Add to {activeWishlist.name}
                </h3>
              </div>
              <button 
                onClick={() => { setShowAddModal(false); setSearchQuery(""); }}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input & Counter */}
            <div className="space-y-1">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Type ticker or company name (e.g. RELIANCE, TCS, INFY)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-amber-400 font-mono"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono px-1">
                <span>{availableToAdd.length} stocks available</span>
                <span>{allAvailableStocks.length} total on exchange</span>
              </div>
            </div>

            {/* Stock Results List - ALL STOCKS INCLUDED */}
            <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1 divide-y divide-[var(--border-subtle)]/40">
              {availableToAdd.length === 0 ? (
                <div className="text-center py-10 text-xs font-mono text-[var(--text-muted)]">
                  {searchQuery ? `No matching stocks found for "${searchQuery}".` : "All exchange stocks are already added to this wishlist."}
                </div>
              ) : (
                availableToAdd.map(s => {
                  const live = prices[s.ticker];
                  const price = Number(live?.price ?? s.basePrice);

                  return (
                    <div 
                      key={s.ticker}
                      className="pt-2 pb-1.5 flex items-center justify-between hover:bg-[var(--bg-root)] px-2 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--text-main)] font-mono">{s.ticker}</span>
                          <span className="text-[9px] px-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded text-[var(--text-muted)]">{s.sector}</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">{s.name}</p>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs font-mono font-bold text-[var(--text-main)]">
                          ₹{price.toFixed(2)}
                        </span>
                        <button
                          onClick={() => {
                            addStock(s.ticker);
                          }}
                          className="px-2.5 py-1 bg-[var(--up-color)] hover:opacity-90 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-opacity"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="text-right pt-2 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => { setShowAddModal(false); setSearchQuery(""); }}
                className="px-4 py-1.5 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] rounded-xl text-xs font-bold border border-[var(--border-subtle)]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
