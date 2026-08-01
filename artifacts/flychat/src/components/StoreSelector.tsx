import { useState, useRef, useEffect } from "react";
import { ChevronDown, Store, Check, Loader2 } from "lucide-react";
import { useStore } from "@/hooks/use-store";

export function StoreSelector() {
  const { stores, activeStore, switchStore, switching } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Only one store exists anywhere in this app today — hide rather than
  // show a switcher with nothing to switch to. Shows itself automatically
  // once an organization has a second store.
  if (stores.length <= 1) return null;

  return (
    <div ref={ref} className="relative px-3 pb-3">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-50"
      >
        <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">{activeStore?.name?.charAt(0).toUpperCase() || "S"}</span>
        </div>
        <span className="flex-1 text-left text-sm font-medium text-foreground truncate">{activeStore?.name || "Select store"}</span>
        {switching ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/50">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Store className="w-3 h-3" /> Switch Store
            </p>
          </div>
          {stores.map(store => (
            <button
              key={store.id}
              onClick={() => { setOpen(false); switchStore(store.id); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-secondary text-left transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary text-xs font-bold">{store.name.charAt(0).toUpperCase()}</span>
              </div>
              <span className="flex-1 text-sm text-foreground truncate">{store.name}</span>
              {activeStore?.id === store.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
