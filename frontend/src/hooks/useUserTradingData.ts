import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../config/api";
import { socket } from "../config/socket";
import type { Holding, Order } from "../types/database";

export function useUserTradingData() {
  const { user } = useAuth();
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [startingBalance, setStartingBalance] = useState<number>(1000000);
  const [longHoldings, setLongHoldings] = useState<Holding[]>([]);
  const [shortHoldings, setShortHoldings] = useState<Holding[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUserData = async () => {
    const token = localStorage.getItem("bazaar_jwt_token");
    if (!token) return;
    try {
      const [userRes, ordersRes] = await Promise.all([
        fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/orders`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const userData = await userRes.json();
      const ordersData = await ordersRes.json();

      if (userData.data) {
        setCashBalance(userData.data.cashBalance || 0);
        setStartingBalance(userData.data.startingBalance || 1000000);
        const holdings: Holding[] = userData.data.holdings || [];
        setLongHoldings(holdings.filter(h => h.positionType === "long" && h.quantity > 0));
        setShortHoldings(holdings.filter(h => h.positionType === "short" && h.quantity > 0));
      }

      if (ordersData.data) {
        setRecentOrders(ordersData.data);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    refreshUserData();

    const channel = `userUpdate:${user.uid}`;
    const handleUpdate = () => refreshUserData();
    socket.on(channel, handleUpdate);

    return () => {
      socket.off(channel, handleUpdate);
    };
  }, [user?.uid]);

  return {
    cashBalance,
    startingBalance,
    longHoldings,
    shortHoldings,
    recentOrders,
    loading,
    refreshUserData
  };
}