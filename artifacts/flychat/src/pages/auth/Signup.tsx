import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { MessageSquare, Loader2 } from "lucide-react";
import { useAuthSignup } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PasswordInput } from "@/components/PasswordInput";
import { claimPendingShopifyInstall, hasPendingShopifyClaim } from "@/lib/shopify-claim";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Already logged in (e.g. opened the install link in a browser with an
  // existing FlyChat session) — claim with the existing account instead of
  // making them create a new one. See Login.tsx.
  useEffect(() => {
    if (!token || !hasPendingShopifyClaim()) return;
    claimPendingShopifyInstall(token).then((result) => {
      if (result.status === "claimed") setLocation("/channels");
      else if (result.status === "conflict") {
        toast({ variant: "destructive", title: "Shopify connection failed", description: result.message });
      }
    });
  }, [token]);

  const signupMutation = useAuthSignup({
    mutation: {
      onSuccess: async (data) => {
        // See Login.tsx: a pending Shopify install (GET /install ->
        // /callback with no FlyChat account yet) is claimed right after
        // this brand-new account gets its session token, then routed
        // straight to Channels instead of onboarding. A brand-new account
        // has no store yet, so this normally comes back "no_store_yet" —
        // Onboarding.tsx retries the claim once the store exists.
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
        const isConflict = err?.status === 409;
        toast({
          variant: "destructive",
          title: isConflict ? "Email already registered" : "Signup failed",
          description: isConflict
            ? "An account with this email already exists. Log in instead, or use a different email."
            : (err.message || "An error occurred. Please try again."),
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signupMutation.mutate({ data: { name, email, password } });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <Link href="/" className="inline-flex items-center gap-2 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/30">
                <MessageSquare className="w-6 h-6" />
              </div>
            </Link>
            <h1 className="text-3xl font-display font-bold text-foreground">Create your account</h1>
            <p className="mt-2 text-muted-foreground">Start your 14-day free trial. No credit card required.</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Full Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                  placeholder="John Doe" 
                />
              </div>
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
                <label className="block text-sm font-medium text-foreground mb-2">Password</label>
                <PasswordInput
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  placeholder="••••••••"
                />
                <p className="mt-2 text-xs text-muted-foreground">Must be at least 8 characters.</p>
              </div>
              <button 
                type="submit" 
                disabled={signupMutation.isPending}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {signupMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Account"}
              </button>
            </form>
            
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account? <Link href="/login" className="text-primary font-bold hover:underline">Log in</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
