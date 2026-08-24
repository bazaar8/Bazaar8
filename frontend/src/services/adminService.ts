import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase"; // Only import the one we configured

export const setMarketStatus = async (status: 'OPEN' | 'PAUSED' | 'CLOSED') => {
  const setStatusFn = httpsCallable(functions, 'adminSetMarketStatus');
  return await setStatusFn({ status });
};

export const toggleUserFreeze = async (uid: string, isFrozen: boolean) => {
  const freezeFn = httpsCallable(functions, 'adminToggleUserFreeze');
  await freezeFn({ uid, isFrozen });
};

export const forceStockPrice = async (ticker: string, price: number) => {
  const forcePriceFn = httpsCallable(functions, 'adminForceStockPrice');
  await forcePriceFn({ ticker, price });
};