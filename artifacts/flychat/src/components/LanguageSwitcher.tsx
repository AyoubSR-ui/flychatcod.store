import { Globe } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

export function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();

  return (
    <button
      onClick={() => setLanguage(language === "en" ? "fr" : "en")}
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
    >
      <Globe className="w-4 h-4" />
      <span>{language === "en" ? "FR" : "EN"}</span>
    </button>
  );
}
