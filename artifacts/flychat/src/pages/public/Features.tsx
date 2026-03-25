import { PublicLayout } from "@/components/PublicLayout";
import { CheckCircle2 } from "lucide-react";

export default function Features() {
  return (
    <PublicLayout>
      <div className="bg-background pt-20 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl md:text-6xl font-display font-bold text-foreground tracking-tight mb-6">Powerful Features for Modern Sellers</h1>
            <p className="text-xl text-muted-foreground">Everything integrated to make confirming orders faster and easier.</p>
          </div>

          <div className="space-y-24">
            {/* Feature 1 */}
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="flex-1 space-y-6">
                <h2 className="text-3xl font-bold text-foreground">Real-time Omnichannel Inbox</h2>
                <p className="text-lg text-muted-foreground">Stop missing messages. See all your customer queries in one place with instant notifications.</p>
                <ul className="space-y-3">
                  {['Website Chat Widget included', 'WhatsApp Integration', 'Instagram DMs', 'Facebook Messenger'].map((i, k) => (
                    <li key={k} className="flex items-center gap-3 text-foreground font-medium"><CheckCircle2 className="text-primary w-5 h-5"/> {i}</li>
                  ))}
                </ul>
              </div>
              <div className="flex-1 bg-secondary rounded-3xl h-80 border border-border flex items-center justify-center p-8">
                {/* Visual placeholder */}
                <div className="w-full h-full bg-white rounded-xl shadow-sm border border-border/50 p-4">
                  <div className="flex gap-4 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gray-200"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                      <div className="h-8 bg-primary/10 rounded-r-xl rounded-bl-xl w-3/4"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col md:flex-row-reverse items-center gap-12">
              <div className="flex-1 space-y-6">
                <h2 className="text-3xl font-bold text-foreground">In-Chat Order Capture</h2>
                <p className="text-lg text-muted-foreground">Capture COD orders directly while chatting. Fill in their Wilaya, Address, and Product instantly.</p>
                <ul className="space-y-3">
                  {['Pre-filled Wilayas', 'Automatic Total Calculation', 'One-click confirmation'].map((i, k) => (
                    <li key={k} className="flex items-center gap-3 text-foreground font-medium"><CheckCircle2 className="text-primary w-5 h-5"/> {i}</li>
                  ))}
                </ul>
              </div>
              <div className="flex-1 bg-primary/5 rounded-3xl h-80 border border-primary/20 flex items-center justify-center p-8">
                  <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-border p-6 space-y-4">
                    <div className="h-6 bg-gray-100 rounded w-1/2"></div>
                    <div className="h-10 bg-gray-50 border border-gray-200 rounded"></div>
                    <div className="h-10 bg-gray-50 border border-gray-200 rounded"></div>
                    <div className="h-12 bg-primary rounded-lg mt-4"></div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
