import { PublicLayout } from "@/components/PublicLayout";

export default function Privacy() {
  return (
    <PublicLayout>
      <div className="bg-background py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-12">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

          <div className="prose prose-slate max-w-none space-y-8 text-foreground">
            <section>
              <p className="text-muted-foreground leading-relaxed">
                FlyChat COD ("FlyChat", "we", "us", "our") provides an AI-assisted customer chat and cash-on-delivery
                order management platform, including an integration with Shopify. This Privacy Policy explains what
                data we collect, how we use it, and the choices merchants and their customers have.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">1. Information We Collect</h2>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li><strong className="text-foreground">Merchant account data</strong> — name, email, store details, and billing information you provide when creating a FlyChat account.</li>
                <li><strong className="text-foreground">Store data via Shopify</strong> — products, orders, and customer shipping details (name, phone, address, wilaya/commune) that Shopify shares with FlyChat once a merchant installs and authorizes the app, so we can sync products, create cash-on-delivery orders, and hand off parcels to delivery carriers.</li>
                <li><strong className="text-foreground">Conversation data</strong> — messages exchanged between a merchant's customers and the FlyChat widget, WhatsApp, Instagram, or Messenger integrations, used to power the AI assistant and the merchant's inbox.</li>
                <li><strong className="text-foreground">Usage data</strong> — basic technical logs (IP address, browser, page visited) used for security and debugging.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">2. How We Use Information</h2>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li>To operate the chat widget, AI replies, and order/parcel management features merchants sign up for.</li>
                <li>To sync products and orders between FlyChat and a merchant's connected Shopify store.</li>
                <li>To create and track cash-on-delivery shipments with the delivery carriers a merchant connects.</li>
                <li>To bill merchants for their subscription and AI usage.</li>
                <li>To improve reliability and troubleshoot issues.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                We do not sell customer or merchant data to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">3. Data Sharing</h2>
              <p className="text-muted-foreground leading-relaxed">
                We share data only as needed to provide the service: with Shopify (for merchants using the Shopify
                integration), with the delivery carriers a merchant explicitly connects (to create and track parcels),
                with our infrastructure and AI providers who process data on our behalf under contract, and with
                payment processors for billing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">4. Data Retention &amp; Deletion</h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain merchant and customer data for as long as the merchant's account is active, or as needed to
                provide the service and meet legal obligations. When a merchant uninstalls the Shopify integration, or
                when Shopify notifies us of a shop redaction request, we delete or anonymize the associated store data
                within our systems. Customers of a merchant's store can request access to or deletion of their data by
                contacting the merchant directly, or by contacting us at the email below — we process these requests
                the same way we process Shopify's mandatory GDPR webhooks (customer data request, customer redact,
                shop redact).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">5. Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use industry-standard measures (encrypted connections, access controls, credential encryption at
                rest) to protect the data we hold. No system is 100% secure, but we work to keep data safe and to
                respond quickly to any issue.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">6. Your Rights</h2>
              <p className="text-muted-foreground leading-relaxed">
                Depending on where you're located, you may have rights to access, correct, or delete your personal
                data, or to object to certain processing. To exercise these rights, contact us using the details
                below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">7. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                Questions about this policy or your data? Email us at{" "}
                <a href="mailto:support@flychat.dz" className="text-primary hover:underline">support@flychat.dz</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
