import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { MessageSquare, Loader2, Building2, ArrowLeft } from "lucide-react";
import { useAuthLogin, useAuthLoginSelect, LoginAccountOption } from "@workspace/api-client-react";
import { useAuth, SESSION_EXPIRED_KEY } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PasswordInput } from "@/components/PasswordInput";
import { claimPendingShopifyInstall, hasPendingShopifyClaim } from "@/lib/shopify-claim";

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", agent: "Agent", superadmin: "Admin" };

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Set when /auth/login comes back with requiresSelection: this email+password
  // matches more than one account (own store + invited stores). The user
  // picks which one to sign into instead of us silently choosing the first.
  const [selection, setSelection] = useState<{ selectionToken: string; accounts: LoginAccountOption[] } | null>(null);

  // A visitor who's already logged in (e.g. clicked "Install" from Shopify
  // in a browser where they still have a FlyChat session) shouldn't have to
  // re-enter their password just to trigger the claim in onSuccess below —
  // claim immediately and skip the form.
  // Set by use-auth.tsx's logout("expired") right before it redirects here —
  // sessionStorage (not state) because that redirect is a fresh mount of
  // this component, with nothing else to carry the reason across it.
  useEffect(() => {
    if (!sessionStorage.getItem(SESSION_EXPIRED_KEY)) return;
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    toast({
      variant: "destructive",
      title: "Session expired",
      description: "Your session expired, please log in again.",
    });
  }, []);

  useEffect(() => {
    if (!token || !hasPendingShopifyClaim()) return;
    claimPendingShopifyInstall(token).then((result) => {
      if (result.status === "claimed") setLocation("/channels");
      else if (result.status === "conflict") {
        toast({ variant: "destructive", title: "Shopify connection failed", description: result.message });
      }
    });
  }, [token]);

  const completeLogin = async (data: { token: string; needsOnboarding: boolean }) => {
    // A pending Shopify install (from GET /install → /callback with no
    // FlyChat account at the time) is claimed here, after we have a
    // real session token, then routed straight to Channels instead of
    // login()'s normal onboarding/dashboard redirect. An existing
    // account already has a store, so unlike Signup.tsx this isn't
    // expected to come back "no_store_yet" in the normal case.
    const result = await claimPendingShopifyInstall(data.token);
    login(data.token, data.needsOnboarding);
    if (result.status === "claimed") setLocation("/channels");
    else if (result.status === "conflict") {
      toast({ variant: "destructive", title: "Shopify connection failed", description: result.message });
    } else if (result.status === "invalid_or_expired" || result.status === "failed") {
      toast({
        variant: "destructive",
        title: "Shopify connection failed",
        description: "We couldn't attach your Shopify install to this account. Please reconnect it from Channels.",
      });
    }
  };

  const loginMutation = useAuthLogin({
    mutation: {
      onSuccess: async (data) => {
        if (data.requiresSelection && data.selectionToken && data.accounts) {
          setSelection({ selectionToken: data.selectionToken, accounts: data.accounts });
          return;
        }
        if (data.token) await completeLogin({ token: data.token, needsOnboarding: !!data.needsOnboarding });
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: err.message || "Invalid credentials. Please try again.",
        });
      }
    }
  });

  const selectMutation = useAuthLoginSelect({
    mutation: {
      onSuccess: async (data) => {
        await completeLogin({ token: data.token, needsOnboarding: data.needsOnboarding });
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Selection failed",
          description: err.message || "This selection has expired. Please log in again.",
        });
        setSelection(null);
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email, password } });
  };

  if (selection) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="p-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-display font-bold text-foreground">Choose an account</h1>
              <p className="mt-2 text-muted-foreground">This email is used by more than one FlyChat account.</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-3 shadow-xl space-y-2">
              {selection.accounts.map((account) => (
                <button
                  key={account.userId}
                  disabled={selectMutation.isPending}
                  onClick={() => selectMutation.mutate({ data: { selectionToken: selection.selectionToken, userId: account.userId } })}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{account.storeName}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[account.role] || account.role}</p>
                  </div>
                  {selectMutation.isPending && selectMutation.variables?.data.userId === account.userId && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSelection(null)}
              className="mt-6 mx-auto flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" /> Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <Link href="/" className="inline-flex items-center gap-2 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/30">
                <MessageSquare className="w-6 h-6" />
              </div>
            </Link>
            <h1 className="text-3xl font-display font-bold text-foreground">Welcome back</h1>
            <p className="mt-2 text-muted-foreground">Log in to manage your COD orders</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-foreground">Password</label>
                  <Link href="/reset-password" className="text-sm text-primary hover:underline font-medium">Forgot?</Link>
                </div>
                <PasswordInput
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {loginMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign in"}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account? <Link href="/signup" className="text-primary font-bold hover:underline">Start free trial</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
