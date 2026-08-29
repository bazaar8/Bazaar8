import { httpsCallable } from "../config/api";

export const setMarketStatus = async (status: 'OPEN' | 'PAUSED' | 'CLOSED') => {
  const setStatusFn = httpsCallable('adminSetMarketStatus');
  return await setStatusFn({ status });
};

export const toggleUserFreeze = async (uid: string, isFrozen: boolean) => {
  const freezeFn = httpsCallable('adminToggleUserFreeze');
  await freezeFn({ uid, isFrozen });
};

export const forceStockPrice = async (ticker: string, price: number) => {
  const forcePriceFn = httpsCallable('adminForceStockPrice');
  await forcePriceFn({ ticker, price });
};