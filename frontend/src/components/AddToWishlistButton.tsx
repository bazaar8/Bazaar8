import { useState, useRef, useEffect } from "react";
import { Star, Check, Plus, ChevronDown } from "lucide-react";
import { useWishlists } from "../hooks/useWishlists";

interface AddToWishlistButtonProps {
  ticker: string;
  className?: string;
  variant?: "full" | "icon";
}

export default function AddToWishlistButton({ ticker, className = "", variant = "full" }: AddToWishlistButtonProps) {
  const { wishlists, toggleStock, getStockWishlistStatus } = useWishlists();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const status = getStockWishlistStatus(ticker);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  if (variant === "icon") {
    return (
      <div className="relative inline-block" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`p-1.5 rounded-lg border transition-all ${
            status.inWishlist
              ? "bg-amber-400/15 border-amber-400/40 text-amber-400"
              : "bg-[var(--bg-root)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-amber-400"
          } ${className}`}
          title={status.inWishlist ? `In: ${status.wishlistNames.join(", ")}` : "Add to Wishlist"}
        >
          <Star className={`w-4 h-4 ${status.inWishlist ? "fill-amber-400" : ""}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-48 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-2xl p-2 z-50 font-mono text-xs space-y-1 backdrop-blur-md">
            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] px-2 py-1 border-b border-[var(--border-subtle)] font-bold">
              Watchlists ({ticker})
            </div>
            {wishlists.map(w => {
              const has = w.tickers.includes(ticker.toUpperCase());
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleStock(ticker, w.id)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors ${
                    has ? "bg-amber-400/15 text-amber-400 font-bold" : "hover:bg-[var(--bg-root)] text-[var(--text-main)]"
                  }`}
                >
                  <span className="truncate">{w.name}</span>
                  {has ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <Plus className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm ${
          status.inWishlist
            ? "bg-amber-400/15 border-amber-400/50 text-amber-400"
            : "bg-[var(--bg-card)] hover:bg-[var(--bg-root)] border-[var(--border-subtle)] text-[var(--text-main)]"
        } ${className}`}
      >
        <Star className={`w-3.5 h-3.5 ${status.inWishlist ? "fill-amber-400 text-amber-400" : "text-amber-400"}`} />
        <span>{status.inWishlist ? `In Wishlist (${status.wishlistNames[0]})` : "Add to Wishlist"}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-52 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-2xl p-2 z-50 font-mono text-xs space-y-1 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] px-2 py-1 border-b border-[var(--border-subtle)] font-bold">
            Select Watchlist:
          </div>
          {wishlists.map(w => {
            const has = w.tickers.includes(ticker.toUpperCase());
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => toggleStock(ticker, w.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                  has ? "bg-amber-400/15 text-amber-400 font-bold" : "hover:bg-[var(--bg-root)] text-[var(--text-main)]"
                }`}
              >
                <span className="truncate">{w.name}</span>
                {has ? <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /> : <Plus className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
