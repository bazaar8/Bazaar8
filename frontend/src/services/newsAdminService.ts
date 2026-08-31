import { collection, doc, setDoc } from "firebase/firestore";
import { httpsCallable } from "../config/api";
import { db } from "../config/firebase";
import type { NewsEventAdmin } from "../types/news";

export const importNewsEvents = async (events: Omit<NewsEventAdmin, "id" | "createdAt" | "status" | "startTime">[]) => {
  const promises = events.map(async (event) => {
    const eventRef = doc(collection(db, "newsEvents"));
    const adminData: NewsEventAdmin = {
      ...event,
      id: eventRef.id,
      status: 'draft',
      startTime: 0,
      createdAt: Date.now()
    };
    await setDoc(eventRef, adminData);
  });
  await Promise.all(promises);
};

export const createSingleNewsEvent = async (event: { headline: string; stockImpacts: Record<string, number>; durationMinutes: number }) => {
  const createFn = httpsCallable('adminCreateSingleNews');
  return await createFn(event);
};

export const releaseEventNow = async (eventId: string, adminData: NewsEventAdmin, durationMinutes: number) => {
  const releaseFn = httpsCallable('adminReleaseNews');
  await releaseFn({ eventId, adminData, durationMinutes });
};

export const triggerNextNewsEvent = async () => {
  const triggerFn = httpsCallable('adminTriggerNextNews');
  return await triggerFn({});
};

export const triggerAllNewsEvents = async () => {
  const triggerFn = httpsCallable('adminTriggerAllNews');
  return await triggerFn({});
};

export const deleteSingleNewsEvent = async (eventId: string) => {
  const deleteFn = httpsCallable('adminDeleteSingleNews');
  await deleteFn({ eventId });
};

export const pauseEvent = async (eventId: string) => {
  const pauseFn = httpsCallable('adminPauseNews');
  await pauseFn({ eventId });
};

export const cancelEvent = async (eventId: string) => {
  const cancelFn = httpsCallable('adminCancelNews');
  await cancelFn({ eventId });
};

export const deleteAllNewsEvents = async () => {
  const deleteFn = httpsCallable('adminDeleteAllNews');
  await deleteFn({});
};