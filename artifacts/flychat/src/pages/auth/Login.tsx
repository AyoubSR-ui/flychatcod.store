import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { MessageSquare, Loader2 } from "lucide-react";
import { useAuthLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { claimPendingShopifyInstall, hasPendingShopifyClaim } from "@/lib/shopify-claim";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // A visitor who's already logged in (e.g. clicked "Install" from Shopify
  // in a browser where they still have a FlyChat session) shouldn't have to
  // re-enter their password just to trigger the claim in onSuccess below —
  // claim immediately and skip the form.
  useEffect(() => {
    if (!token || !hasPendingShopifyClaim()) return;
    claimPendingShopifyInstall(token).then((result) => {
      if (result.status === "claimed") setLocation("/channels");
      else if (result.status === "conflict") {
        toast({ variant: "destructive", title: "Shopify connection failed", description: result.message });
      }
    });
  }, [token]);

  const loginMutation = useAuthLogin({
    mutation: {
      onSuccess: async (data) => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email, password } });
  };

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
                <input 
                  type="password" 
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
