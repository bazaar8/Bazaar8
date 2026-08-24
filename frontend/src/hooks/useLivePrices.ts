import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../config/firebase';

export function useLivePrices() {
  const [prices, setPrices] = useState<Record<string, { price: number, timestamp: number }>>({});
  const [marketStatus, setMarketStatus] = useState<string>("CLOSED");

  useEffect(() => {
    const pricesRef = ref(rtdb, 'livePrices');
    const statusRef = ref(rtdb, 'marketStatus/state');

    const unsubscribePrices = onValue(pricesRef, (snapshot) => {
      if (snapshot.exists()) {
        setPrices(snapshot.val());
      }
    });

    const unsubscribeStatus = onValue(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        setMarketStatus(snapshot.val());
      }
    });

    return () => {
      unsubscribePrices();
      unsubscribeStatus();
    };
  }, []);

  return { prices, marketStatus };
}