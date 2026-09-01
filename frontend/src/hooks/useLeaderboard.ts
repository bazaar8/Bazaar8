import { useState, useEffect } from "react";
import { socket } from "../config/socket";
import { API_URL } from "../config/api";

export function useLeaderboard() {
  const [rankings, setRankings] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/state`)
      .then(res => res.json())
      .then(json => {
        if (json.data?.leaderboard) setRankings(json.data.leaderboard);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const handleLeaderboard = (data: any[]) => {
      setRankings(data || []);
      setLoading(false);
      setCountdown(3);
    };

    socket.on("leaderboard", handleLeaderboard);

    const timer = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 3 : prev - 1));
    }, 1000);

    return () => {
      socket.off("leaderboard", handleLeaderboard);
      clearInterval(timer);
    };
  }, []);

  return { rankings, countdown, loading };
}