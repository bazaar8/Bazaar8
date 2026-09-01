import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../config/api";

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

  const fetchWatchlists = async () => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    try {
      const token = localStorage.getItem("bazaar_jwt_token");
      const res = await fetch(`${API_URL}/watchlists`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.data) {
        setWatchlists(json.data.sort((a: Watchlist, b: Watchlist) => a.createdAt - b.createdAt));
      }
    } catch (error) {
      console.warn("Watchlists restricted or failed to load:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlists();
  }, [user?.uid]);

  const apiCall = async (endpoint: string, payload: any) => {
    const token = localStorage.getItem("bazaar_jwt_token");
    await fetch(`${API_URL}/watchlists/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ data: payload })
    });
    await fetchWatchlists(); // Refresh state to reflect the update
  };

  const createWatchlist = async (name: string) => {
    if (!user || !name.trim()) return;
    if (watchlists.length >= 3) {
      alert("Maximum 3 watchlists allowed. Please delete or rename an existing list.");
      return;
    }
    await apiCall("create", { name: name.trim() });
  };

  const renameWatchlist = async (id: string, name: string) => {
    if (!user || !name.trim()) return;
    await apiCall("rename", { id, name: name.trim() });
  };

  const deleteWatchlist = async (id: string) => {
    if (!user) return;
    await apiCall("delete", { id });
  };

  const addStock = async (id: string, ticker: string) => {
    if (!user) return;
    await apiCall("addStock", { id, ticker });
  };

  const removeStock = async (id: string, ticker: string) => {
    if (!user) return;
    await apiCall("removeStock", { id, ticker });
  };

  return { watchlists, loading, createWatchlist, renameWatchlist, deleteWatchlist, addStock, removeStock };
}