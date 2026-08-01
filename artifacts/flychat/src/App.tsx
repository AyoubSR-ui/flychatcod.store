import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { StoreProvider } from "@/hooks/use-store";
import { I18nProvider } from "@/hooks/use-i18n";

// Public pages
import Home from "@/pages/public/Home";
import Features from "@/pages/public/Features";
import Pricing from "@/pages/public/Pricing";
import Contact from "@/pages/public/Contact";

// Auth pages
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import ResetPassword from "@/pages/auth/ResetPassword";
import Onboarding from "@/pages/auth/Onboarding";
import AcceptInvite from "@/pages/auth/AcceptInvite";

// Docs
import Docs from "@/pages/Docs";

// App pages
import Organization from "@/pages/app/Organization";
import Dashboard from "@/pages/app/Dashboard";
import Inbox from "@/pages/app/Inbox";
import Orders from "@/pages/app/Orders";
import OrderDetail from "@/pages/app/OrderDetail";
import Customers from "@/pages/app/Customers";
import CustomerDetail from "@/pages/app/CustomerDetail";
import Products from "@/pages/app/Products";
import Widget from "@/pages/app/Widget";
import Automation from "@/pages/app/Automation";
import Channels from "@/pages/app/Channels";
import Delivery from "@/pages/app/Delivery";
import Team from "@/pages/app/Team";
import Billing from "@/pages/app/Billing";
import Settings from "@/pages/app/Settings";
import AiSettings from "@/pages/app/AiSettings";
import Admin from "@/pages/app/Admin";
import AdLinks from "@/pages/app/AdLinks";
import LeadIntelligence from "@/pages/app/LeadIntelligence";

// Embed pages (no auth)
import WidgetEmbed from "@/pages/embed/WidgetEmbed";

import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, token } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!token || !user) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={Home} />
      <Route path="/features" component={Features} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/contact" component={Contact} />
      <Route path="/docs" component={Docs} />
      <Route path="/docs/:id" component={Docs} />

      {/* Embed (no auth) */}
      <Route path="/embed/widget" component={WidgetEmbed} />

      {/* Auth */}
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/accept-invite" component={AcceptInvite} />

      {/* App — protected */}
      <Route path="/organization">{() => <ProtectedRoute component={Organization} />}</Route>
      <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>
      <Route path="/lead-intelligence">{() => <ProtectedRoute component={LeadIntelligence} />}</Route>
      <Route path="/inbox">{() => <ProtectedRoute component={Inbox} />}</Route>
      <Route path="/orders">{() => <ProtectedRoute component={Orders} />}</Route>
      <Route path="/orders/:id">{() => <ProtectedRoute component={OrderDetail} />}</Route>
      <Route path="/customers">{() => <ProtectedRoute component={Customers} />}</Route>
      <Route path="/customers/:id">{() => <ProtectedRoute component={CustomerDetail} />}</Route>
      <Route path="/products">{() => <ProtectedRoute component={Products} />}</Route>
      <Route path="/ad-links">{() => <ProtectedRoute component={AdLinks} />}</Route>
      <Route path="/widget">{() => <ProtectedRoute component={Widget} />}</Route>
      <Route path="/automation">{() => <ProtectedRoute component={Automation} />}</Route>
      <Route path="/channels">{() => <ProtectedRoute component={Channels} />}</Route>
      <Route path="/delivery">{() => <ProtectedRoute component={Delivery} />}</Route>
      <Route path="/team">{() => <ProtectedRoute component={Team} />}</Route>
      <Route path="/billing">{() => <ProtectedRoute component={Billing} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={Settings} />}</Route>
      <Route path="/ai-settings">{() => <ProtectedRoute component={AiSettings} />}</Route>
      <Route path="/admin">{() => <ProtectedRoute component={Admin} />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <StoreProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </StoreProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
