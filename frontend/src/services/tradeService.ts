import { httpsCallable } from "../config/api";

export const executeTrade = async (ticker: string, action: 'BUY' | 'SELL' | 'SHORT' | 'COVER', quantity: number) => {
  const t0 = performance.now();
  const tradeFunction = httpsCallable('executeTrade');
  const response = await tradeFunction({ ticker, action, quantity });
  const roundtripMs = Math.max(1, Math.round(performance.now() - t0));
  return {
    ...response.data,
    roundtripMs,
    latencyMs: response.data?.latencyMs || roundtripMs
  };
};