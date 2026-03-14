import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, MessageSquare, ShoppingBag, Users, Package, 
  Settings, Zap, Plug, CreditCard, Users2, LogOut, ShieldAlert
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isLoading } = useAuth();
  const { t } = useI18n();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  const navItems = [
    { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
    { href: "/inbox", label: "nav.inbox", icon: MessageSquare },
    { href: "/orders", label: "nav.orders", icon: ShoppingBag },
    { href: "/customers", label: "nav.customers", icon: Users },
    { href: "/products", label: "nav.products", icon: Package },
    { href: "/widget", label: "nav.widget", icon: MessageSquare },
    { href: "/automation", label: "nav.automation", icon: Zap },
    { href: "/channels", label: "nav.channels", icon: Plug },
    { href: "/team", label: "nav.team", icon: Users2 },
    { href: "/billing", label: "nav.billing", icon: CreditCard },
    { href: "/settings", label: "nav.settings", icon: Settings },
  ];

  if (user?.role === "superadmin") {
    navItems.push({ href: "/admin", label: "nav.admin", icon: ShieldAlert });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col shadow-sm z-10">
        <div className="h-20 flex items-center px-6 border-b border-border/50">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white shadow-md shadow-primary/20">
              <MessageSquare className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-lg text-foreground">FlyChat COD</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link 
                key={item.href} 
                href={item.href}
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
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {children}
      </main>
    </div>
  );
}
