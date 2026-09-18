import { Globe } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("flychat_token") || ""}` });

export function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();

  const toggle = () => {
    const next = language === "en" ? "fr" : "en";
    setLanguage(next);
    // Best-effort — a logged-out visitor (or a request that fails) still
    // gets the local/localStorage switch above; this just makes it follow
    // the user across devices when they're signed in.
    fetch(`${API_BASE}/api/settings/language`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ language: next }),
    }).catch(() => {});
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
    >
      <Globe className="w-4 h-4" />
      <span>{language === "en" ? "FR" : "EN"}</span>
    </button>
  );
}
