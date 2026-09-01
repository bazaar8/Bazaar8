import { useState, useEffect } from 'react';
import { socket } from '../config/socket';
import { API_URL } from '../config/api';

export function useLivePrices() {
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [marketStatus, setMarketStatus] = useState<string>("CLOSED");

  useEffect(() => {
    // Initial fetch
    fetch(`${API_URL}/state`)
      .then(res => res.json())
      .then(json => {
        if (json.data) {
          if (json.data.livePrices) setPrices(json.data.livePrices);
          if (json.data.marketStatus) setMarketStatus(json.data.marketStatus);
        }
      })
      .catch(() => {});

    // Live socket stream (0ms delay)
    const handleLivePrices = (data: { prices: Record<string, any>, marketStatus: string }) => {
      if (data.prices) setPrices(data.prices);
      if (data.marketStatus) setMarketStatus(data.marketStatus);
    };

    socket.on("livePrices", handleLivePrices);

    return () => {
      socket.off("livePrices", handleLivePrices);
    };
  }, []);

  return { prices, marketStatus };
}