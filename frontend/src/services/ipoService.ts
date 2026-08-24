import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";

const functions = getFunctions(app);

export const subscribeToIPO = async (ipoId: string, requestedShares: number) => {
  const subscribeFn = httpsCallable(functions, 'subscribeIPO');
  return await subscribeFn({ ipoId, requestedShares });
};

export const processIPOAllotment = async (ipoId: string) => {
  const processFn = httpsCallable(functions, 'processAllotment');
  return await processFn({ ipoId });
};

export const listIPO = async (ipoId: string) => {
  const listFn = httpsCallable(functions, 'listIPO');
  return await listFn({ ipoId });
};