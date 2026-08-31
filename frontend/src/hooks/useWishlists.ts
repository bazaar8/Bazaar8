import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../config/firebase";

export interface Wishlist {
  id: number;
  name: string;
  tickers: string[];
}

const DEFAULT_WISHLISTS: Wishlist[] = [
  { id: 1, name: "Wishlist 1", tickers: [] },
  { id: 2, name: "Wishlist 2", tickers: [] },
  { id: 3, name: "Wishlist 3", tickers: [] },
];

export function useWishlists() {
  const { user } = useAuth();
  const storageKey = `bazaar_wishlists_v2_${user?.uid || "guest"}`;

  const [wishlists, setWishlists] = useState<Wishlist[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) return parsed;
      }
    } catch (e) {}
    return DEFAULT_WISHLISTS;
  });

  const [activeWishlistId, setActiveWishlistId] = useState<number>(1);

  // Sync to Firestore & localStorage
  const persistWishlists = useCallback((updated: Wishlist[]) => {
    setWishlists(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {}

    // Dispatch a local storage custom event so other components update in real-time
    window.dispatchEvent(new Event("wishlists_updated"));

    if (user?.uid) {
      setDoc(doc(db, "users", user.uid, "settings", "watchlists_v2"), {
        wishlists: updated,
        updatedAt: Date.now()
      }, { merge: true }).catch(() => {});
    }
  }, [storageKey, user?.uid]);

  // Listen to cross-component sync events
  useEffect(() => {
    const handleSync = () => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === 3) setWishlists(parsed);
        }
      } catch (e) {}
    };

    window.addEventListener("wishlists_updated", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("wishlists_updated", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [storageKey]);

  // Load from Firestore on initial mount if available
  useEffect(() => {
    if (!user?.uid) return;
    const loadFromFirestore = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid, "settings", "watchlists_v2"));
        if (snap.exists() && Array.isArray(snap.data()?.wishlists) && snap.data().wishlists.length === 3) {
          setWishlists(snap.data().wishlists);
          try {
            localStorage.setItem(storageKey, JSON.stringify(snap.data().wishlists));
          } catch (e) {}
        }
      } catch (e) {}
    };
    loadFromFirestore();
  }, [user?.uid, storageKey]);

  const addStock = (ticker: string, wishlistId: number = activeWishlistId) => {
    const uppercaseTicker = ticker.toUpperCase();
    const updated = wishlists.map(w => {
      if (w.id === wishlistId && !w.tickers.includes(uppercaseTicker)) {
        return { ...w, tickers: [...w.tickers, uppercaseTicker] };
      }
      return w;
    });
    persistWishlists(updated);
  };

  const removeStock = (ticker: string, wishlistId: number = activeWishlistId) => {
    const uppercaseTicker = ticker.toUpperCase();
    const updated = wishlists.map(w => {
      if (w.id === wishlistId) {
        return { ...w, tickers: w.tickers.filter(t => t !== uppercaseTicker) };
      }
      return w;
    });
    persistWishlists(updated);
  };

  const toggleStock = (ticker: string, wishlistId: number) => {
    const uppercaseTicker = ticker.toUpperCase();
    const target = wishlists.find(w => w.id === wishlistId);
    if (target?.tickers.includes(uppercaseTicker)) {
      removeStock(uppercaseTicker, wishlistId);
    } else {
      addStock(uppercaseTicker, wishlistId);
    }
  };

  const renameWishlist = (id: number, newName: string) => {
    if (!newName.trim()) return;
    const updated = wishlists.map(w => w.id === id ? { ...w, name: newName.trim() } : w);
    persistWishlists(updated);
  };

  const shiftStock = (ticker: string, fromId: number, toId: number) => {
    const uppercaseTicker = ticker.toUpperCase();
    const updated = wishlists.map(w => {
      if (w.id === fromId) {
        return { ...w, tickers: w.tickers.filter(t => t !== uppercaseTicker) };
      }
      if (w.id === toId) {
        return { ...w, tickers: w.tickers.includes(uppercaseTicker) ? w.tickers : [...w.tickers, uppercaseTicker] };
      }
      return w;
    });
    persistWishlists(updated);
  };

  const isStockInWishlist = (ticker: string, wishlistId: number = activeWishlistId) => {
    const target = wishlists.find(w => w.id === wishlistId);
    return !!target?.tickers.includes(ticker.toUpperCase());
  };

  const getStockWishlistStatus = (ticker: string) => {
    const uppercaseTicker = ticker.toUpperCase();
    const containingWishlists = wishlists.filter(w => w.tickers.includes(uppercaseTicker));
    return {
      inWishlist: containingWishlists.length > 0,
      wishlistNames: containingWishlists.map(w => w.name),
      wishlistIds: containingWishlists.map(w => w.id)
    };
  };

  return {
    wishlists,
    activeWishlistId,
    setActiveWishlistId,
    activeWishlist: wishlists.find(w => w.id === activeWishlistId) || wishlists[0],
    addStock,
    removeStock,
    toggleStock,
    renameWishlist,
    shiftStock,
    isStockInWishlist,
    getStockWishlistStatus
  };
}
