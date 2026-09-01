import { httpsCallable } from "../config/api";

// Note: Standard login/logout state is already handled by AuthContext.tsx.
// Use this service for user registration and password recovery.

export const registerUser = async (email: string, password: string, name: string) => {
  const fn = httpsCallable("register");
  return await fn({ email, password, name });
};

export const resetPassword = async (email: string) => {
  const fn = httpsCallable("resetPassword");
  return await fn({ email });
};

export const updatePassword = async (newPassword: string) => {
  const fn = httpsCallable("updatePassword");
  return await fn({ newPassword });
};