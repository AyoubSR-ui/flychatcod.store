import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, MessageSquare, ShoppingBag, Users, Package,
  Settings, Zap, Plug, CreditCard, Users2, LogOut, ShieldAlert, Link2,
  Menu, X, Bot, TrendingUp, BookOpen, Truck
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { StoreSelector } from "./StoreSelector";
import { Building2 } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isLoading } = useAuth();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  // Mirrors the backend's requireOwner/requireOwnerOrAdmin gates (see
  // artifacts/api-server/src/middlewares/auth.ts) — this list is defense in
  // depth for the UI, not the actual enforcement. A role's absence here
  // just hides the link; the API is what actually blocks the request.
  // superadmin (FlyChat's own platform staff) always sees everything, same
  // as it already did for the /admin link below.
  const OWNER_ONLY: readonly string[] = ["owner"];
  const OWNER_OR_ADMIN: readonly string[] = ["owner", "admin"];

  const navItems: { href: string; label: string; icon: typeof LayoutDashboard; roles?: readonly string[] }[] = [
    { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
    { href: "/lead-intelligence", label: "nav.lead_intelligence", icon: TrendingUp },
    { href: "/inbox", label: "nav.inbox", icon: MessageSquare },
    { href: "/orders", label: "nav.orders", icon: ShoppingBag },
    { href: "/customers", label: "nav.customers", icon: Users },
    { href: "/products", label: "nav.products", icon: Package },
    { href: "/ad-links", label: "nav.ad_links", icon: Link2, roles: OWNER_OR_ADMIN },
    { href: "/widget", label: "nav.widget", icon: MessageSquare, roles: OWNER_OR_ADMIN },
    { href: "/automation", label: "nav.automation", icon: Zap, roles: OWNER_OR_ADMIN },
    { href: "/channels", label: "nav.channels", icon: Plug, roles: OWNER_OR_ADMIN },
    { href: "/delivery", label: "nav.delivery", icon: Truck, roles: OWNER_OR_ADMIN },
    { href: "/team", label: "nav.team", icon: Users2, roles: OWNER_ONLY },
    { href: "/billing", label: "nav.billing", icon: CreditCard, roles: OWNER_ONLY },
    { href: "/organization", label: "nav.organization", icon: Building2, roles: OWNER_OR_ADMIN },
    { href: "/ai-settings", label: "nav.ai_settings", icon: Bot, roles: OWNER_OR_ADMIN },
    { href: "/settings", label: "nav.settings", icon: Settings, roles: OWNER_OR_ADMIN },
    { href: "/docs", label: "nav.documentation", icon: BookOpen },
  ].filter((item) => !item.roles || user?.role === "superadmin" || item.roles.includes(user?.role ?? ""));

  if (user?.role === "superadmin") {
    navItems.push({ href: "/admin", label: "nav.admin", icon: ShieldAlert });
  }

  const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
    <>
      <div className="h-20 flex items-center px-6 border-b border-border/50">
        <Link href="/dashboard" className="flex items-center gap-3" onClick={onNavClick}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white shadow-md shadow-primary/20">
            <MessageSquare className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-lg text-foreground">FlyChat COD</span>
        </Link>
      </div>

      <div className="pt-3">
        <StoreSelector />
      </div>

      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-primary" : "opacity-70"}`} />
              {t(item.label)}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/50 space-y-4">
        <div className="px-2">
          <LanguageSwitcher />
        </div>
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-secondary/50 border border-border/50">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button onClick={logout} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Desktop Sidebar — hidden on mobile ─────────────────────────────── */}
      <aside className="hidden lg:flex w-56 bg-card border-r border-border flex-col shadow-sm z-10">
        <SidebarContent />
      </aside>

      {/* ── Mobile Overlay — shown when sidebar is open ─────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile Sidebar Drawer ───────────────────────────────────────────── */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-card border-r border-border flex flex-col shadow-xl z-30
        transition-transform duration-300 ease-in-out lg:hidden
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Close button inside drawer */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-secondary transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
        <SidebarContent onNavClick={() => setSidebarOpen(false)} />
      </aside>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* Mobile top bar with hamburger — hidden on desktop */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white shadow-sm">
              <MessageSquare className="w-3.5 h-3.5" />
            </div>
            <span className="font-display font-bold text-base text-foreground">FlyChat COD</span>
          </Link>
        </div>

        {children}
      </main>
    </div>
  );
}