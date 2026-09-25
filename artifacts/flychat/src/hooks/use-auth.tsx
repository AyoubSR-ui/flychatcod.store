import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { User, useAuthMe, API_UNAUTHORIZED_EVENT } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, needsOnboarding: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Read by Login.tsx on mount to show "Your session expired, please log in
// again." — sessionStorage (not state/a route param) because the event that
// triggers this can fire from anywhere, including a fetch helper with no
// React tree of its own (see custom-fetch.ts / auth-fetch.ts), and needs to
// survive the redirect to /login.
export const SESSION_EXPIRED_KEY = "flychat_session_expired";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("flychat_token"));
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useAuthMe({
    query: {
      enabled: !!token,
      retry: false,
    }
  });

  const login = (newToken: string, needsOnboarding: boolean) => {
    localStorage.setItem("flychat_token", newToken);
    setToken(newToken);
    if (needsOnboarding) {
      setLocation("/onboarding");
    } else {
      setLocation("/dashboard");
    }
  };

  // `expired` also clears every cached query, not just the auth ones — a
  // logged-in layout must never render off stale cache for a session that's
  // no longer valid, and on a shared/kiosk device the next login shouldn't
  // momentarily show the previous agent's data before fresh queries land.
  const logout = (reason?: "expired") => {
    if (reason === "expired") sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
    localStorage.removeItem("flychat_token");
    setToken(null);
    queryClient.clear();
    setLocation("/login");
  };

  // The single place any 401-on-a-token-bearing-request ends up, whether it
  // came from the generated client (custom-fetch.ts) or the app's
  // hand-rolled fetches (lib/auth-fetch.ts) — see API_UNAUTHORIZED_EVENT's
  // doc comment for why this has to be a window event rather than a direct
  // call. Covers /auth/me's own 401 too, so the old isError-only check this
  // replaced is redundant now.
  useEffect(() => {
    const handler = () => logout("expired");
    window.addEventListener(API_UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, handler);
  }, []);

  return (
    <AuthContext.Provider value={{ user: user || null, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
