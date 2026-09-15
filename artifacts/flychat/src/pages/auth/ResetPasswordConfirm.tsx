import { useState } from "react";
import { Link, useSearch } from "wouter";
import { MessageSquare, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuthResetPasswordConfirm } from "@workspace/api-client-react";
import { PasswordInput } from "@/components/PasswordInput";

export default function ResetPasswordConfirm() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");

  const confirmMutation = useAuthResetPasswordConfirm();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (password.length < 8) { setFormError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setFormError("Passwords don't match."); return; }
    confirmMutation.mutate({ data: { token, password } });
  };

  const apiError = (confirmMutation.error as any)?.message;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-white shadow-lg mb-6">
            <MessageSquare className="w-6 h-6" />
          </Link>
          <h1 className="text-3xl font-display font-bold text-foreground">Set a new password</h1>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {!token ? (
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
              <h3 className="text-xl font-bold">Invalid link</h3>
              <p className="text-muted-foreground">This password reset link is missing its token.</p>
              <Link href="/reset-password" className="block mt-2 w-full py-3 rounded-xl bg-secondary text-foreground font-bold hover:bg-secondary/80">
                Request a new link
              </Link>
            </div>
          ) : confirmMutation.isSuccess ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold">Password updated</h3>
              <p className="text-muted-foreground">You can now log in with your new password.</p>
              <Link href="/login" className="block mt-6 w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90">
                Go to Login
              </Link>
            </div>
          ) : confirmMutation.isError && apiError?.includes("expired") ? (
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
              <h3 className="text-xl font-bold">Link expired</h3>
              <p className="text-muted-foreground">{apiError}</p>
              <Link href="/reset-password" className="block mt-2 w-full py-3 rounded-xl bg-secondary text-foreground font-bold hover:bg-secondary/80">
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-muted-foreground text-sm">Choose a new password for this account.</p>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">New password</label>
                <PasswordInput
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Confirm new password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="••••••••"
                />
              </div>
              {(formError || apiError) && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError || apiError}</p>
              )}
              <button
                type="submit"
                disabled={confirmMutation.isPending}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all flex justify-center"
              >
                {confirmMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update Password"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link href="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
