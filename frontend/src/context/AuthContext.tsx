import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { API_URL } from "../config/api";
import { socket } from "../config/socket";
import type { UserProfile } from "../types/auth";

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  loginUser: (email: string, pass: string) => Promise<void>;
  logoutUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchProfile = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.data) {
        setUser(json.data);
        setProfile(json.data);
      } else {
        localStorage.removeItem("bazaar_jwt_token");
        setUser(null);
        setProfile(null);
      }
    } catch (e) {
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("bazaar_jwt_token");
    if (token) {
      fetchProfile(token);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const channel = `userUpdate:${user.uid}`;
    const handleUpdate = (data: any) => {
      setUser((prev: any) => ({ ...prev, ...data }));
      setProfile((prev: any) => ({ ...prev, ...data }));
    };
    socket.on(channel, handleUpdate);
    return () => {
      socket.off(channel, handleUpdate);
    };
  }, [user?.uid]);

  const loginUser = async (email: string, pass: string) => {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { email, password: pass } })
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || "Invalid credentials");
    localStorage.setItem("bazaar_jwt_token", json.data.token);
    setUser(json.data.user);
    setProfile(json.data.user);
  };

  const logoutUser = () => {
    localStorage.removeItem("bazaar_jwt_token");
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}