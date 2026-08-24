import { useState, useEffect } from "react";
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";

export interface Watchlist {
  id: string;
  name: string;
  tickers: string[];
  createdAt: number;
}

export function useWatchlists() {
  const { user } = useAuth();
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const colRef = collection(db, "users", user.uid, "watchlists");
    const unsub = onSnapshot(colRef, (snap) => {
      const lists: Watchlist[] = [];
      snap.forEach(d => {
        lists.push({ id: d.id, ...d.data() } as Watchlist);
      });
      setWatchlists(lists.sort((a, b) => a.createdAt - b.createdAt));
      setLoading(false);
    }, (error) => {
      console.warn("Watchlists restricted:", error);
      setLoading(false); // <-- This safely stops the crash loop
    });
    return () => unsub();
  }, [user]);

  const createWatchlist = async (name: string) => {
    if (!user || !name.trim()) return;
    await addDoc(collection(db, "users", user.uid, "watchlists"), {
      name: name.trim(),
      tickers: [],
      createdAt: Date.now()
    });
  };

  const renameWatchlist = async (id: string, name: string) => {
    if (!user || !name.trim()) return;
    await updateDoc(doc(db, "users", user.uid, "watchlists", id), { name: name.trim() });
  };

  const deleteWatchlist = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "watchlists", id));
  };

  const addStock = async (id: string, ticker: string) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid, "watchlists", id), { tickers: arrayUnion(ticker) });
  };

  const removeStock = async (id: string, ticker: string) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid, "watchlists", id), { tickers: arrayRemove(ticker) });
  };

  return { watchlists, loading, createWatchlist, renameWatchlist, deleteWatchlist, addStock, removeStock };
}