import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

export interface LeaderboardEntry {
  uid: string;
  rank: number;
  displayName: string;
  portfolioValue: number;
  returnPct: number;
}

export function useLeaderboard() {
  const [rankings, setRankings] = useState<LeaderboardEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'leaderboard', 'main'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setRankings(data.rankings || []);
        if (data.lastUpdated) {
          setLastUpdated(data.lastUpdated.toDate());
        }
      }
      setLoading(false);
    }, (error) => {
      console.warn("Leaderboard restricted:", error);
      setLoading(false); // <-- Safely stops the crash loop
    });

    return () => unsub();
  }, []);

  return { rankings, lastUpdated, loading };
}