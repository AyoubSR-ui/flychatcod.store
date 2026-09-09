import { PublicLayout } from "@/components/PublicLayout";
import { Mail, MessageSquare, Clock } from "lucide-react";

export default function Support() {
  return (
    <PublicLayout>
      <div className="bg-background py-24">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-display font-bold text-foreground mb-4">Support</h1>
          <p className="text-lg text-muted-foreground mb-12">
            Need help with FlyChat COD, your Shopify integration, or a specific order? We're here to help.
          </p>

          <div className="grid sm:grid-cols-2 gap-6 text-left">
            <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-foreground">Email Support</h3>
              <p className="text-sm text-muted-foreground">
                For account, billing, or technical issues, email us and we'll get back to you as soon as possible.
              </p>
              <a href="mailto:support@flychat.dz" className="inline-block text-sm font-semibold text-primary hover:underline">
                support@flychat.dz
              </a>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-foreground">Response Time</h3>
              <p className="text-sm text-muted-foreground">
                We typically respond within 1 business day. Existing customers can also reach us through the Inbox
                inside their FlyChat dashboard.
              </p>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="w-4 h-4" />
            <span>Have a general question first? Check our </span>
            <a href="/docs" className="text-primary font-medium hover:underline">documentation</a>.
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
