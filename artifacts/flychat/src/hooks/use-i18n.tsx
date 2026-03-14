import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Language = "en" | "fr";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    "nav.home": "Home",
    "nav.features": "Features",
    "nav.pricing": "Pricing",
    "nav.contact": "Contact",
    "nav.login": "Log in",
    "nav.signup": "Get Started",
    "nav.dashboard": "Dashboard",
    "nav.inbox": "Inbox",
    "nav.orders": "Orders",
    "nav.customers": "Customers",
    "nav.products": "Products",
    "nav.widget": "Widget",
    "nav.automation": "Automation",
    "nav.channels": "Channels",
    "nav.team": "Team",
    "nav.billing": "Billing",
    "nav.settings": "Settings",
    "nav.admin": "Admin",
    "nav.logout": "Log out",
    "common.save": "Save Changes",
    "common.cancel": "Cancel",
    "common.loading": "Loading...",
    "common.search": "Search...",
    "common.create": "Create New",
    "status.new": "New",
    "status.open": "Open",
    "status.closed": "Closed",
    "status.pending": "Pending",
    "status.confirmed": "Confirmed",
    "status.shipped": "Shipped",
    "status.delivered": "Delivered",
    "status.cancelled": "Cancelled"
  },
  fr: {
    "nav.home": "Accueil",
    "nav.features": "Fonctionnalités",
    "nav.pricing": "Tarifs",
    "nav.contact": "Contact",
    "nav.login": "Connexion",
    "nav.signup": "Démarrer",
    "nav.dashboard": "Tableau de bord",
    "nav.inbox": "Boîte de réception",
    "nav.orders": "Commandes",
    "nav.customers": "Clients",
    "nav.products": "Produits",
    "nav.widget": "Widget",
    "nav.automation": "Automatisation",
    "nav.channels": "Canaux",
    "nav.team": "Équipe",
    "nav.billing": "Facturation",
    "nav.settings": "Paramètres",
    "nav.admin": "Admin",
    "nav.logout": "Déconnexion",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.loading": "Chargement...",
    "common.search": "Rechercher...",
    "common.create": "Créer",
    "status.new": "Nouveau",
    "status.open": "Ouvert",
    "status.closed": "Fermé",
    "status.pending": "En attente",
    "status.confirmed": "Confirmé",
    "status.shipped": "Expédié",
    "status.delivered": "Livré",
    "status.cancelled": "Annulé"
  }
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem("flychat_lang") as Language) || "en";
  });

  const setLanguage = (lang: Language) => {
    localStorage.setItem("flychat_lang", lang);
    setLanguageState(lang);
  };

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within an I18nProvider");
  return context;
}
