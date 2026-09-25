import { Globe } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { authFetch } from "@/lib/auth-fetch";

export function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();

  const toggle = () => {
    const next = language === "en" ? "fr" : "en";
    setLanguage(next);
    // Best-effort — a logged-out visitor (or a request that fails) still
    // gets the local/localStorage switch above; this just makes it follow
    // the user across devices when they're signed in. Still goes through
    // authFetch (not a bare fetch) so a 401 here reports session expiry
    // globally like every other request — only the failure itself is
    // swallowed, not the session-expiry signal.
    authFetch("/api/settings/language", { method: "PATCH", body: JSON.stringify({ language: next }) }).catch(() => {});
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
