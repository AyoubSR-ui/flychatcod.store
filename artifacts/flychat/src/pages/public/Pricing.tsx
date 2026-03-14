import { PublicLayout } from "@/components/PublicLayout";
import { Link } from "wouter";
import { Check } from "lucide-react";

export default function Pricing() {
  return (
    <PublicLayout>
      <div className="bg-background py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">Simple, transparent pricing</h1>
            <p className="text-xl text-muted-foreground">Start for free. Upgrade when you need more power.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free */}
            <div className="bg-card rounded-3xl border border-border p-8 shadow-sm flex flex-col">
              <h3 className="text-xl font-bold text-foreground">Starter</h3>
              <div className="mt-4 flex items-baseline text-5xl font-extrabold text-foreground">
                DZD 0
                <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
              </div>
              <p className="mt-4 text-muted-foreground">Perfect for new stores testing the waters.</p>
              <ul className="mt-8 space-y-4 flex-1">
                {['1 Agent', 'Website Chat Widget', 'Up to 100 Orders/mo', 'Basic CRM'].map(f => (
                  <li key={f} className="flex items-center gap-3"><Check className="w-5 h-5 text-green-500" /> {f}</li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 w-full block text-center py-3 rounded-xl border-2 border-primary text-primary font-bold hover:bg-primary/5 transition-colors">Start Free</Link>
            </div>

            {/* Pro */}
            <div className="bg-primary rounded-3xl border border-primary p-8 shadow-xl shadow-primary/20 flex flex-col relative transform md:-translate-y-4">
              <div className="absolute top-0 right-8 transform -translate-y-1/2">
                <span className="bg-accent text-accent-foreground px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wide">Most Popular</span>
              </div>
              <h3 className="text-xl font-bold text-primary-foreground">Pro Seller</h3>
              <div className="mt-4 flex items-baseline text-5xl font-extrabold text-primary-foreground">
                DZD 2900
                <span className="ml-1 text-xl font-medium text-primary-foreground/70">/mo</span>
              </div>
              <p className="mt-4 text-primary-foreground/80">Everything you need to scale your COD operations.</p>
              <ul className="mt-8 space-y-4 flex-1 text-primary-foreground">
                {['Unlimited Agents', 'All Channels (WhatsApp, IG)', 'Unlimited Orders', 'Advanced Automations', 'Priority Support'].map(f => (
                  <li key={f} className="flex items-center gap-3"><Check className="w-5 h-5 text-accent" /> {f}</li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 w-full block text-center py-3 rounded-xl bg-white text-primary font-bold hover:bg-gray-50 transition-colors shadow-lg">Start 14-Day Trial</Link>
            </div>

            {/* Scale */}
            <div className="bg-card rounded-3xl border border-border p-8 shadow-sm flex flex-col">
              <h3 className="text-xl font-bold text-foreground">AI Add-on</h3>
              <div className="mt-4 flex items-baseline text-5xl font-extrabold text-foreground">
                +DZD 4900
                <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
              </div>
              <p className="mt-4 text-muted-foreground">Let AI confirm your orders while you sleep.</p>
              <ul className="mt-8 space-y-4 flex-1">
                {['Requires Pro Plan', 'AI Chatbot auto-replies', 'Auto-confirm COD orders', 'Sentiment Analysis'].map(f => (
                  <li key={f} className="flex items-center gap-3"><Check className="w-5 h-5 text-green-500" /> {f}</li>
                ))}
              </ul>
              <button disabled className="mt-8 w-full py-3 rounded-xl bg-secondary text-muted-foreground font-bold cursor-not-allowed">Coming Soon</button>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
