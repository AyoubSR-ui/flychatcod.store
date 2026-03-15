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
    "status.cancelled": "Cancelled",
    "order.create": "Create Order",
    "order.close_draft": "Cancel Draft",
    "order.draft": "Order Draft",
    "order.hint_click_message": "Click a customer message to fill order fields",
    "order.map_to_field": "Add to draft",
    "order.use_as_name": "Use as Name",
    "order.use_as_phone": "Use as Phone",
    "order.use_as_email": "Use as Email",
    "order.use_as_address": "Use as Address",
    "order.use_as_note": "Use as Note",
    "order.used": "Used",
    "order.field_conflict": "Field already has content",
    "order.field_conflict_desc": "What would you like to do with the existing value?",
    "order.replace": "Replace",
    "order.append": "Append",
    "order.customer_info": "Customer Info",
    "order.products": "Products",
    "order.search_product": "Search product...",
    "order.add_custom_item": "+ Custom Item",
    "order.required": "Required",
    "order.items_required": "Add at least one item",
    "order.price_required": "Price must be > 0",
    "order.total": "Total (DZD)",
    "order.confirm": "Confirm Order",
    "order.success": "Order Created!",
    "order.success_desc": "Linked to this conversation.",
    "order.name": "Full Name",
    "order.phone": "Phone",
    "order.email": "Email (optional)",
    "order.wilaya": "Wilaya",
    "order.address": "Address",
    "order.note": "Seller Note",
    "order.qty": "Qty",
    "order.price": "Price",
    "order.error_creating": "Failed to create order. Please try again.",
    "order.hide_draft": "Hide Draft",
    "order.show_draft": "Order Draft"
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
    "status.cancelled": "Annulé",
    "order.create": "Créer une commande",
    "order.close_draft": "Annuler le brouillon",
    "order.draft": "Brouillon de commande",
    "order.hint_click_message": "Cliquez un message client pour remplir les champs",
    "order.map_to_field": "Ajouter au brouillon",
    "order.use_as_name": "Utiliser comme Nom",
    "order.use_as_phone": "Utiliser comme Téléphone",
    "order.use_as_email": "Utiliser comme Email",
    "order.use_as_address": "Utiliser comme Adresse",
    "order.use_as_note": "Utiliser comme Note",
    "order.used": "Utilisé",
    "order.field_conflict": "Le champ contient déjà du texte",
    "order.field_conflict_desc": "Que voulez-vous faire avec la valeur existante ?",
    "order.replace": "Remplacer",
    "order.append": "Ajouter",
    "order.customer_info": "Infos client",
    "order.products": "Produits",
    "order.search_product": "Rechercher un produit...",
    "order.add_custom_item": "+ Article personnalisé",
    "order.required": "Requis",
    "order.items_required": "Ajoutez au moins un article",
    "order.price_required": "Prix > 0 requis",
    "order.total": "Total (DZD)",
    "order.confirm": "Confirmer la commande",
    "order.success": "Commande créée !",
    "order.success_desc": "Liée à cette conversation.",
    "order.name": "Nom complet",
    "order.phone": "Téléphone",
    "order.email": "Email (optionnel)",
    "order.wilaya": "Wilaya",
    "order.address": "Adresse",
    "order.note": "Note vendeur",
    "order.qty": "Qté",
    "order.price": "Prix",
    "order.error_creating": "Échec de la création de la commande. Veuillez réessayer.",
    "order.hide_draft": "Masquer",
    "order.show_draft": "Brouillon"
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
