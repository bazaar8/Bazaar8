import { httpsCallable } from "../config/api";

export const executeTrade = async (ticker: string, action: 'BUY' | 'SELL' | 'SHORT' | 'COVER', quantity: number) => {
  const tradeFunction = httpsCallable('executeTrade');
  const response = await tradeFunction({ ticker, action, quantity });
  return response.data;
};