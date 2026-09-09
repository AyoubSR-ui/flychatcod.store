import { PublicLayout } from "@/components/PublicLayout";

export default function Terms() {
  return (
    <PublicLayout>
      <div className="bg-background py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-12">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

          <div className="prose prose-slate max-w-none space-y-8 text-foreground">
            <section>
              <p className="text-muted-foreground leading-relaxed">
                These Terms of Service ("Terms") govern your access to and use of FlyChat COD ("FlyChat", "we", "us",
                "our"), including our website, dashboard, AI chat widget, and Shopify integration. By creating an
                account or installing FlyChat, you agree to these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">1. The Service</h2>
              <p className="text-muted-foreground leading-relaxed">
                FlyChat provides an AI-assisted chat widget, order and delivery management tools, and integrations
                with sales channels (Shopify, WhatsApp, Instagram, Messenger) and delivery carriers, aimed at
                merchants running cash-on-delivery (COD) businesses.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">2. Accounts</h2>
              <p className="text-muted-foreground leading-relaxed">
                You must provide accurate information when creating an account and are responsible for keeping your
                login credentials secure. You're responsible for all activity that happens under your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">3. Subscriptions &amp; Billing</h2>
              <p className="text-muted-foreground leading-relaxed">
                Paid plans are billed on a recurring basis as described at checkout. AI usage is metered against the
                credits included in your plan; additional credits may be purchased as top-ups. Fees are
                non-refundable except where required by law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">4. Merchant Responsibilities</h2>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li>You're responsible for the accuracy of the products, prices, and policies FlyChat's AI represents on your behalf.</li>
                <li>You must have the right to connect any third-party account (Shopify, WhatsApp Business, delivery carrier accounts, etc.) you link to FlyChat.</li>
                <li>You're responsible for complying with applicable consumer protection, data protection, and e-commerce laws in the jurisdictions where you sell.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">5. Acceptable Use</h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree not to use FlyChat to send unlawful, fraudulent, or abusive content, to misrepresent your
                business, or to attempt to disrupt or reverse-engineer the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">6. Third-Party Services</h2>
              <p className="text-muted-foreground leading-relaxed">
                FlyChat integrates with third-party platforms (including Shopify) and delivery carriers. Your use of
                those platforms is governed by their own terms; FlyChat isn't responsible for their availability or
                actions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">7. Termination</h2>
              <p className="text-muted-foreground leading-relaxed">
                You may stop using FlyChat and cancel your subscription at any time. We may suspend or terminate
                access for accounts that violate these Terms or applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">8. Disclaimer &amp; Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                FlyChat is provided "as is." AI-generated replies and automatically created orders may occasionally
                be inaccurate — merchants should review order confirmations and AI conversations. To the maximum
                extent permitted by law, FlyChat isn't liable for indirect, incidental, or consequential damages
                arising from use of the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">9. Changes to These Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update these Terms from time to time. Continued use of FlyChat after changes take effect means
                you accept the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">10. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                Questions about these Terms? Email us at{" "}
                <a href="mailto:support@flychat.dz" className="text-primary hover:underline">support@flychat.dz</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
