import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
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
  const [countdown, setCountdown] = useState(5);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = async () => {
    try {
      const snap = await getDoc(doc(db, 'leaderboard', 'main'));
      if (snap.exists()) {
        setRankings(snap.data().rankings || []);
      }
    } catch (error) {
      console.warn("Leaderboard restricted:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchLeaderboard();
          return 5; 
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return { rankings, countdown, loading };
}