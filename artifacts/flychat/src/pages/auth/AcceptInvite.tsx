import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { MessageSquare, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function AcceptInvite() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { login } = useAuth();
  const token = new URLSearchParams(search).get("token") || "";

  const [state, setState] = useState<"loading" | "form" | "error" | "expired">("loading");
  const [invite, setInvite] = useState<{ email: string; role: string; storeName: string; isExistingUser: boolean } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!token) { setState("error"); setErrorMessage("No invitation token provided."); return; }

    fetch(`/api/auth/validate-invite?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) {
          setInvite(data);
          setState("form");
        } else if (r.status === 410) {
          setState("expired");
          setErrorMessage(data.message || "This invitation has expired.");
        } else {
          setState("error");
          setErrorMessage(data.message || "Invalid invitation link.");
        }
      })
      .catch(() => { setState("error"); setErrorMessage("Failed to validate invitation. Please try again."); });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setSubmitError("Password must be at least 8 characters."); return; }
    setSubmitting(true);
    setSubmitError("");

    try {
      const resp = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, ...(invite?.isExistingUser ? {} : { password }) }),
      });
      const data = await resp.json();

      if (resp.ok && data.token) {
        login(data.token, false);
        navigate("/inbox");
      } else {
        setSubmitError(data.message || "Failed to accept invitation.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-display font-bold text-foreground">FlyChat COD</span>
          </div>
        </div>

        {state === "loading" && (
          <div className="bg-card border border-border rounded-2xl shadow-lg p-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Validating your invitation...</p>
          </div>
        )}

        {state === "error" && (
          <div className="bg-card border border-border rounded-2xl shadow-lg p-10 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground mb-6">{errorMessage}</p>
            <a href="/login" className="inline-block px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90">
              Go to Login
            </a>
          </div>
        )}

        {state === "expired" && (
          <div className="bg-card border border-border rounded-2xl shadow-lg p-10 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Invitation Expired</h2>
            <p className="text-muted-foreground mb-2">{errorMessage}</p>
            <p className="text-sm text-muted-foreground mb-6">
              Please ask the store owner to resend your invitation from the Team page.
            </p>
            <a href="/login" className="inline-block px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90">
              Go to Login
            </a>
          </div>
        )}

        {state === "form" && invite && (
          <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-blue-700 px-6 py-6 text-center">
              <CheckCircle className="w-10 h-10 text-white/90 mx-auto mb-2" />
              <h2 className="text-xl font-bold text-white">You're Invited!</h2>
              <p className="text-white/80 text-sm mt-1">
                Join <strong>{invite.storeName}</strong> as <strong className="capitalize">{invite.role}</strong>
              </p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Email</label>
                <input type="email" value={invite.email} disabled
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-muted text-muted-foreground cursor-not-allowed" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Full Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your full name"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              {invite.isExistingUser ? (
                <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  You already have a FlyChat account — your existing password will work to log in.
                </p>
              ) : (
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Password *</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Min. 8 characters"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
              )}

              {submitError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
              )}

              <button type="submit" disabled={submitting || !name || (!invite.isExistingUser && !password)}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? "Setting up your account..." : "Accept & Join"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
