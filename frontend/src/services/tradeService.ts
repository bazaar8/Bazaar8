import { httpsCallable } from "../config/api";
import { app } from "../config/firebase";

const functions = getFunctions(app);

export const executeTrade = async (ticker: string, action: 'BUY' | 'SELL' | 'SHORT' | 'COVER', quantity: number) => {
  const tradeFunction = httpsCallable(functions, 'executeTrade');
  const response = await tradeFunction({ ticker, action, quantity });
  return response.data;
};