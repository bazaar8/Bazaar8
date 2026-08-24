import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "../config/firebase";
import type { UserProfile, Order, NewsEventAdmin } from "../types/database";

export function useAdminData() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [newsEvents, setNewsEvents] = useState<NewsEventAdmin[]>([]);
  const [marketState, setMarketState] = useState<string>("CLOSED");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const usersUnsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => d.data() as UserProfile));
    });

    const ordersUnsub = onSnapshot(query(collection(db, "orders"), orderBy("timestamp", "desc")), (snap) => {
      setOrders(snap.docs.map(d => d.data() as Order));
    });

    const newsUnsub = onSnapshot(query(collection(db, "newsEvents"), orderBy("createdAt", "desc")), (snap) => {
      setNewsEvents(snap.docs.map(d => d.data() as NewsEventAdmin));
    });

    const marketRef = ref(rtdb, 'marketStatus/state');
    const marketUnsub = onValue(marketRef, (snap) => {
      if (snap.exists()) setMarketState(snap.val());
    });

    setLoading(false);

    return () => {
      usersUnsub();
      ordersUnsub();
      newsUnsub();
      marketUnsub();
    };
  }, []);

  return { users, orders, newsEvents, marketState, loading };
}