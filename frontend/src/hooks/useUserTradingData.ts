import { useState, useEffect } from "react";
import { collection, doc, onSnapshot, query, where, limit } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import type { Holding, Order } from "../types/database";

export function useUserTradingData() {
  const { user } = useAuth();
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [startingBalance, setStartingBalance] = useState<number>(1000000);
  const [longHoldings, setLongHoldings] = useState<Holding[]>([]);
  const [shortHoldings, setShortHoldings] = useState<Holding[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const userDocRef = doc(db, "users", user.uid);
    const unsubUser = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCashBalance(data.cashBalance ?? data.cash ?? 0);
        setStartingBalance(data.startingBalance ?? data.startingCapital ?? 1000000);
      }
    }, (err) => { 
      console.warn("User Data Error:", err); 
      setLoading(false); 
    });

    const holdingsColRef = collection(db, "users", user.uid, "holdings");
    const unsubHoldings = onSnapshot(holdingsColRef, (snap) => {
      const longs: Holding[] = [];
      const shorts: Holding[] = [];
      snap.forEach((d) => {
        const h = d.data() as Holding;
        if (h.positionType === "long" && h.quantity > 0) longs.push(h);
        if (h.positionType === "short" && h.quantity > 0) shorts.push(h);
      });
      setLongHoldings(longs);
      setShortHoldings(shorts);
    }, (err) => console.warn("Holdings Error:", err));

    const ordersColRef = collection(db, "orders");
    const ordersQ = query(ordersColRef, where("uid", "==", user.uid), limit(200));
    
    const unsubOrders = onSnapshot(ordersQ, (snap) => {

      const ords = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any)
      })) as Order[];
      
      ords.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
        return timeB - timeA;
      });

      setRecentOrders(ords);
    }, (err) => {
      console.warn("Orders Error:", err);
      setRecentOrders([]);
    });

    setLoading(false);
    return () => {
      unsubUser();
      unsubHoldings();
      unsubOrders();
    };
  }, [user]);

  return { 
    cashBalance, 
    startingBalance, 
    longHoldings, 
    shortHoldings, 
    recentOrders: recentOrders || [], 
    loading 
  };
}