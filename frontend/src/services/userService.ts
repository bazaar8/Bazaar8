import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import type { UserProfile } from "../types/auth";

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userDocRef = doc(db, "users", uid);
  const snapshot = await getDoc(userDocRef);
  if (snapshot.exists()) {
    return snapshot.data() as UserProfile;
  }
  return null;
};