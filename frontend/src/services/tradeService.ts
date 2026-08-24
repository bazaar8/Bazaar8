import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";

const functions = getFunctions(app);

export const executeTrade = async (ticker: string, action: 'BUY' | 'SELL' | 'SHORT' | 'COVER', quantity: number) => {
  try {
    const tradeFunction = httpsCallable(functions, 'executeTrade');
    const response = await tradeFunction({ ticker, action, quantity });
    return response.data;
  } catch (error) {
    throw error;
  }
};