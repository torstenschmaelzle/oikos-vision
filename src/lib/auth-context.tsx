import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi, setAccessToken, getAccessToken, type AuthUser, type LoginResponse } from "./api";
import { toast } from "@/hooks/use-toast";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setupAccount: (token: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const handleLoginResponse = useCallback((res: LoginResponse) => {
    setAccessToken(res.access_token);
    setUser(res.user);
  }, []);

  // Try refresh on mount
  useEffect(() => {
    console.info("[Auth] Attempting silent refresh on mount…");
    authApi
      .refresh()
      .then((res) => {
        console.info("[Auth] Silent refresh succeeded, user:", res.user?.email);
        handleLoginResponse(res);
      })
      .catch((err) => {
        console.info("[Auth] Silent refresh failed (expected if no session):", err?.message);
        setAccessToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [handleLoginResponse]);

  // Auto-refresh every 12 minutes
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      authApi
        .refresh()
        .then(handleLoginResponse)
        .catch(() => {
          setAccessToken(null);
          setUser(null);
          toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        });
    }, 12 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, handleLoginResponse]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    handleLoginResponse(res);
  }, [handleLoginResponse]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch {}
    setAccessToken(null);
    setUser(null);
  }, []);

  const setupAccount = useCallback(async (token: string, password: string) => {
    const res = await authApi.setupAccount(token, password);
    handleLoginResponse(res);
  }, [handleLoginResponse]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setupAccount }}>
      {children}
    </AuthContext.Provider>
  );
}
