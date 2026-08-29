import { httpsCallable } from "../config/api";

export const subscribeToIPO = async (ipoId: string, requestedShares: number) => {
  const subscribeFn = httpsCallable('subscribeIPO');
  return await subscribeFn({ ipoId, requestedShares });
};

export const processIPOAllotment = async (ipoId: string) => {
  const processFn = httpsCallable('processAllotment');
  return await processFn({ ipoId });
};

export const listIPO = async (ipoId: string) => {
  const listFn = httpsCallable('listIPO');
  return await listFn({ ipoId });
};