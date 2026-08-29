import { auth } from "./firebase";

export const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080/api";

export const httpsCallable = (endpointName: string) => {
  return async (data: any = {}) => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";

    const res = await fetch(`${API_URL}/${endpointName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ data })
    });

    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || "API Error");

    return { data: json.data };
  };
};