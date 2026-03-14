import { PublicLayout } from "@/components/PublicLayout";
import { Mail, MapPin, Phone } from "lucide-react";

export default function Contact() {
  return (
    <PublicLayout>
      <div className="bg-background py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row gap-16">
          <div className="flex-1 space-y-8">
            <div>
              <h1 className="text-4xl font-display font-bold text-foreground mb-4">Get in touch</h1>
              <p className="text-lg text-muted-foreground">Have questions about FlyChat? Our team is here to help you scale your COD business.</p>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground">Email us</h4>
                  <p className="text-muted-foreground">support@flychat.dz</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground">Call us</h4>
                  <p className="text-muted-foreground">+213 555 00 00 00</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-card border border-border rounded-3xl p-8 shadow-xl">
            <form className="space-y-6" onSubmit={e => e.preventDefault()}>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Name</label>
                <input type="text" className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" placeholder="Your name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                <input type="email" className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" placeholder="your@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Message</label>
                <textarea rows={4} className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" placeholder="How can we help?"></textarea>
              </div>
              <button className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">Send Message</button>
            </form>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
