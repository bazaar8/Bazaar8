import { httpsCallable, API_URL } from "../config/api";

export const getUserProfile = async (uid?: string) => {
  const token = localStorage.getItem("bazaar_jwt_token");
  if (!token) throw new Error("No authentication token found");
  
  // If no UID is provided, fetches the logged-in user's profile
  const endpoint = uid ? `${API_URL}/users/${uid}` : `${API_URL}/me`;
  
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || "Failed to fetch user profile");
  return json.data;
};

export const updateUserProfile = async (updates: any) => {
  const fn = httpsCallable("updateUserProfile");
  return await fn({ updates });
};

export const getPublicLeaderboard = async () => {
  const res = await fetch(`${API_URL}/leaderboard`);
  const json = await res.json();
  if (!res.ok) throw new Error("Failed to fetch leaderboard");
  return json.data;
};