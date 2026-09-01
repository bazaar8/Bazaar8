import { httpsCallable } from "../config/api";

export const importNewsEvents = async (events: any[]) => {
  const fn = httpsCallable("adminImportNews");
  return await fn({ events });
};

export const createSingleNewsEvent = async (data: any) => {
  const fn = httpsCallable("adminCreateNewsEvent");
  return await fn(data);
};

export const releaseEventNow = async (eventId: string, event: any, durationMinutes: number) => {
  const fn = httpsCallable("adminReleaseNewsEvent");
  return await fn({ eventId, event, durationMinutes });
};

export const cancelEvent = async (eventId: string) => {
  const fn = httpsCallable("adminCancelNewsEvent");
  return await fn({ eventId });
};

export const deleteAllNewsEvents = async () => {
  const fn = httpsCallable("adminDeleteAllNews");
  return await fn();
};

export const deleteSingleNewsEvent = async (eventId: string) => {
  const fn = httpsCallable("adminDeleteSingleNews");
  return await fn({ eventId });
};

export const triggerNextNewsEvent = async () => {
  const fn = httpsCallable("adminTriggerNextNews");
  return await fn();
};

export const triggerAllNewsEvents = async () => {
  const fn = httpsCallable("adminTriggerAllNews");
  return await fn();
};