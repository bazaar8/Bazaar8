export const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080/api";
export const WS_URL = API_URL.replace(/\/api\/?$/, "");

export const httpsCallable = (endpointName: string) => {
  return async (data: any = {}) => {
    const token = localStorage.getItem("bazaar_jwt_token") || "";
    const res = await fetch(`${API_URL}/${endpointName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ data })
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || "API Execution Error");
    return { data: json.data };
  };
};