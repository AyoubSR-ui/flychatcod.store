import { useState } from "react";
import { Link } from "wouter";
import { MessageSquare, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { useAuthResetPassword } from "@workspace/api-client-react";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const resetMutation = useAuthResetPassword({
    mutation: {
      onSuccess: () => setSubmitted(true)
    }
  });

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-white shadow-lg mb-6">
            <MessageSquare className="w-6 h-6" />
          </Link>
          <h1 className="text-3xl font-display font-bold text-foreground">Reset Password</h1>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold">Check your email</h3>
              <p className="text-muted-foreground">If an account exists with {email}, we've sent instructions to reset your password.</p>
              <Link href="/login" className="block mt-6 w-full py-3 rounded-xl bg-secondary text-foreground font-bold hover:bg-secondary/80">
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); resetMutation.mutate({ data: { email }}); }} className="space-y-5">
              <p className="text-muted-foreground text-sm">Enter your email address and we'll send you a link to reset your password.</p>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" 
                  placeholder="you@example.com" 
                />
              </div>
              <button 
                type="submit" 
                disabled={resetMutation.isPending}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all flex justify-center"
              >
                {resetMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Reset Link"}
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
