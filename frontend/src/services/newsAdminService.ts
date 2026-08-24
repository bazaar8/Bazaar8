import { collection, doc, setDoc, updateDoc } from "firebase/firestore";
import { ref, set, update, remove } from "firebase/database";
import { db, rtdb } from "../config/firebase";
import type { NewsEventAdmin, NewsEventPublic, MarketInfluence } from "../types/news";

export const createAndScheduleEvent = async (event: Omit<NewsEventAdmin, "id" | "createdAt" | "status">) => {
  const eventRef = doc(collection(db, "newsEvents"));
  const eventId = eventRef.id;
  const now = Date.now();

  const adminData: NewsEventAdmin = {
    ...event,
    id: eventId,
    status: 'scheduled',
    createdAt: now
  };

  await setDoc(eventRef, adminData);
  return eventId;
};

export const releaseEventNow = async (eventId: string, adminData: NewsEventAdmin) => {
  const now = Date.now();
  
  const publicData: NewsEventPublic = {
    id: eventId,
    headline: adminData.headline,
    description: adminData.description,
    targetTickers: adminData.targetTickers,
    affectedSectors: adminData.affectedSectors,
    startTime: now
  };

  const influenceData: MarketInfluence = {
    id: eventId,
    targetTickers: adminData.targetTickers,
    impactDirection: adminData.impactDirection,
    impactStrength: adminData.impactStrength,
    durationMinutes: adminData.durationMinutes,
    startTime: now,
    status: 'active'
  };

  const eventRef = doc(db, "newsEvents", eventId);
  await updateDoc(eventRef, { status: 'active', startTime: now });

  const publicFeedRef = ref(rtdb, `newsFeed/${eventId}`);
  await set(publicFeedRef, publicData);

  const influenceRef = ref(rtdb, `marketInfluence/${eventId}`);
  await set(influenceRef, influenceData);
};

export const pauseEvent = async (eventId: string) => {
  const eventRef = doc(db, "newsEvents", eventId);
  await updateDoc(eventRef, { status: 'paused' });

  const influenceRef = ref(rtdb, `marketInfluence/${eventId}`);
  await update(influenceRef, { status: 'paused' });
};

export const cancelEvent = async (eventId: string) => {
  const eventRef = doc(db, "newsEvents", eventId);
  await updateDoc(eventRef, { status: 'cancelled' });

  const publicFeedRef = ref(rtdb, `newsFeed/${eventId}`);
  await remove(publicFeedRef);

  const influenceRef = ref(rtdb, `marketInfluence/${eventId}`);
  await remove(influenceRef);
};