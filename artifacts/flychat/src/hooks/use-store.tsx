import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./use-auth";

interface OrgStore {
  id: string;
  name: string;
  description: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

interface StoreContextType {
  stores: OrgStore[];
  activeStore: OrgStore | null;
  switchStore: (storeId: string) => Promise<void>;
  switching: boolean;
  loading: boolean;
}

const StoreContext = createContext<StoreContextType>({
  stores: [],
  activeStore: null,
  switchStore: async () => {},
  switching: false,
  loading: true,
});

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [stores, setStores] = useState<OrgStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!token || !user?.organizationId) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API_BASE}/api/organization`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : { stores: [] })
      .then(data => setStores(data.stores || []))
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  }, [token, user?.organizationId]);

  // req.user.storeId is re-read from the database on every backend request
  // (see lib/auth.ts) — the active store is just whichever one matches it,
  // no separate client-side "selected store" state to keep in sync.
  const activeStore = stores.find(s => s.id === user?.storeId) || stores[0] || null;

  const switchStore = async (storeId: string) => {
    if (!token || storeId === user?.storeId) return;
    setSwitching(true);
    try {
      const res = await fetch(`${API_BASE}/api/organization/switch-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to switch store");
      }
      // Every page's data is scoped to req.user.storeId server-side — a full
      // reload is the simplest way to guarantee every query on every page
      // (not just the ones we remembered to invalidate) reflects the switch.
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <StoreContext.Provider value={{ stores, activeStore, switchStore, switching, loading }}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => useContext(StoreContext);
