import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";

const functions = getFunctions(app);

export const setMarketStatus = async (status: 'OPEN' | 'PAUSED' | 'CLOSED') => {
  const setStatusFn = httpsCallable(functions, 'adminSetMarketStatus');
  await setStatusFn({ status });
};

export const toggleUserFreeze = async (uid: string, isFrozen: boolean) => {
  const freezeFn = httpsCallable(functions, 'adminToggleUserFreeze');
  await freezeFn({ uid, isFrozen });
};

export const forceStockPrice = async (ticker: string, price: number) => {
  const forcePriceFn = httpsCallable(functions, 'adminForceStockPrice');
  await forcePriceFn({ ticker, price });
};