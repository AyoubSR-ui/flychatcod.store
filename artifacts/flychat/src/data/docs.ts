export interface DocSection {
  title: string
  content?: string
  tip?: string
  warning?: string
  steps?: string[]
}

export interface DocPage {
  id: string
  feature: string
  icon: string
  title: string
  description: string
  sections: DocSection[]
  relatedFeatures: string[]
}

export const DOCS: DocPage[] = [
  {
    id: "inbox",
    feature: "Inbox",
    icon: "📥",
    title: "Unified Inbox",
    description: "Manage all your customer conversations from WhatsApp, Messenger, and Instagram in one place.",
    sections: [
      {
        title: "What is the Inbox?",
        content:
          "The Inbox is your central hub for all incoming customer messages. Every conversation from WhatsApp, Facebook Messenger, and Instagram appears here in real time — no more switching between apps.",
      },
      {
        title: "How to use it",
        steps: [
          "Click 'Inbox' in the left navigation",
          "Select a conversation to open it",
          "Read customer messages in the right panel",
          "Type your reply in the message box and press Send",
          "Or enable AI Autopilot to let the agent reply automatically",
        ],
      },
      {
        title: "AI Badge",
        content:
          "Conversations with the AI badge (🤖) are being handled automatically by your AI agent. You can switch any conversation to manual mode by clicking the AI toggle inside the conversation.",
        tip: "Switch to Human mode when a conversation needs personal attention — the AI will pause and wait.",
      },
      {
        title: "Lead Stage Badge",
        content:
          "Each conversation shows a colored badge: Interested → Engaged → Qualified → Confirmed. This tells you how serious each buyer is based on their messages.",
      },
      {
        title: "Archiving",
        content:
          "Archive conversations you no longer need to track. They move to the Archived tab and don't clutter your active view.",
      },
    ],
    relatedFeatures: ["ai-agent", "lead-intelligence", "orders"],
  },
  {
    id: "ai-agent",
    feature: "AI Agent",
    icon: "🤖",
    title: "AI Sales Agent",
    description: "Your 24/7 sales agent that replies to customers automatically in Algerian darija.",
    sections: [
      {
        title: "How the AI Agent works",
        content:
          "The AI agent reads your product catalog, shipping prices, and store rules — then replies to customers in their own language (Arabic script, Latin darija, or French). It qualifies leads, collects order details, and confirms orders automatically.",
      },
      {
        title: "Enabling AI per channel",
        steps: [
          "Go to Settings → AI Mode tab",
          "Toggle AI ON for WhatsApp, Messenger, or Instagram",
          "Click 'Apply to All Conversations' to enable for existing chats",
          "New conversations will automatically use AI from that point on",
        ],
        tip: "Enable AI on all channels for maximum response speed — customers get a reply within seconds.",
      },
      {
        title: "AI Modes",
        content:
          "Each conversation is either in AI Autopilot (AI replies automatically) or Human mode (you reply manually). You can switch modes inside any conversation at any time.",
      },
      {
        title: "What the AI knows",
        content:
          "The AI reads: your product catalog, all prices, all colors and sizes, shipping prices per wilaya, your store name, and any custom AI rules you've set. It knows nothing outside of your store data.",
        warning: "Keep your product catalog updated — the AI can only sell what you've added and priced correctly.",
      },
      {
        title: "Languages supported",
        content:
          "The AI auto-detects and replies in: Arabic script (دارجة), Latin Darija (wach, 3andi...), French, and mixed darija. It will never switch languages mid-conversation.",
      },
    ],
    relatedFeatures: ["ai-settings", "inbox", "products"],
  },
  {
    id: "lead-intelligence",
    feature: "Lead Intelligence",
    icon: "📊",
    title: "Lead Intelligence",
    description: "Real-time funnel that identifies which conversations are serious buyers.",
    sections: [
      {
        title: "What is Lead Intelligence?",
        content:
          "Lead Intelligence analyzes every conversation in real time and classifies customers into 4 stages based on their behavior and the signals they send. It shows you exactly where buyers are in your funnel.",
      },
      {
        title: "The 4 Lead Stages",
        steps: [
          "Interested — Customer asked about price or product (just browsing)",
          "Engaged — Customer asked about delivery, sizes, or colors (warming up)",
          "Qualified — Customer gave wilaya + size + phone (serious buyer)",
          "Confirmed — Order was placed and confirmed",
        ],
      },
      {
        title: "How stages are detected",
        content:
          "Signal detection is automatic: phone number detected → qualified, wilaya mentioned → engaged, delivery asked → medium intent. No manual tagging needed — it updates in real time.",
      },
      {
        title: "Drop-off Analysis",
        content:
          "The Drop-off Analysis shows where customers stop in your funnel. If 77% stop at 'Interested' after only 4 messages, your AI needs to qualify leads faster.",
        tip: "If avg messages to qualify > 20, add AI rules to collect wilaya and size earlier in the conversation.",
      },
      {
        title: "Top Performing Ads",
        content:
          "When customers arrive from an Ad Link, their conversion rate is tracked per ad. This shows which Facebook ads produce real buyers — not just messages.",
      },
    ],
    relatedFeatures: ["ad-links", "inbox", "ai-settings"],
  },
  {
    id: "orders",
    feature: "Orders",
    icon: "📦",
    title: "Order Management",
    description: "Create, track, and manage COD orders directly from conversations.",
    sections: [
      {
        title: "Creating an order from chat",
        steps: [
          "Open a conversation in the Inbox",
          "Click 'Create Order' in the right panel",
          "Fill in: product, size, color, wilaya, phone, address",
          "Set delivery type: home delivery or bureau",
          "Click Confirm Order — the customer is notified automatically",
        ],
      },
      {
        title: "Order statuses",
        content:
          "Orders flow through: New → Awaiting Confirmation → Confirmed → Shipped → Delivered. You can also mark orders as Cancelled or Suspicious if needed.",
      },
      {
        title: "Managing orders",
        steps: [
          "Go to the Orders page",
          "Filter by status, wilaya, or date range",
          "Click any order to view full details",
          "Update order status as you process shipments",
          "Search by phone number or order number",
        ],
      },
      {
        title: "Shopify sync",
        content:
          "If Shopify is connected, COD orders confirmed in FlyChat can be pushed to your Shopify store automatically.",
        tip: "Sync orders daily to keep your Shopify inventory and fulfilment updated.",
      },
    ],
    relatedFeatures: ["inbox", "shipping", "shopify"],
  },
  {
    id: "ai-settings",
    feature: "AI Settings",
    icon: "⚙️",
    title: "AI Settings",
    description: "Configure how your AI agent behaves, speaks, and sells.",
    sections: [
      {
        title: "AI Persona",
        content:
          "Set a custom persona for your AI. Example: 'You are a friendly female sales agent for [store name]. Always be warm and helpful in every reply.'",
      },
      {
        title: "AI Rules",
        content:
          "Add custom rules your AI must always follow. One rule per line. Rules are stored per store and injected into every AI reply.",
        steps: [
          "Go to AI Settings → AI Rules",
          "Type your rules (one per line)",
          "Example: 'Never offer discounts unless the customer explicitly asks'",
          "Example: 'Always confirm wilaya before quoting shipping price'",
          "Click Save Rules",
        ],
        tip: "Good rules = better AI. Add rules based on common situations your customers ask about.",
      },
      {
        title: "Language Preference",
        content:
          "Set whether the AI should auto-detect language or always reply in a specific language (Arabic, French, or Darija). Auto-detect works well for most stores.",
      },
      {
        title: "Training Data Export",
        content:
          "Export your best conversations as JSONL format — ready for fine-tuning a custom AI model on your store's real sales data. Only conversations with 6+ messages and AI replies are included.",
      },
      {
        title: "Communication Optimizer",
        content:
          "Run AI analysis on past conversations to detect quality patterns (repetition, missed signals, slow qualification). The optimizer generates behavior improvements that you review and approve before they take effect.",
        warning: "Always review improvements before approving — you control exactly what gets applied to your AI.",
      },
    ],
    relatedFeatures: ["ai-agent", "inbox", "lead-intelligence"],
  },
  {
    id: "ad-links",
    feature: "Ad Links",
    icon: "🎯",
    title: "Ad Links",
    description: "Track which Facebook ad each conversation came from.",
    sections: [
      {
        title: "What are Ad Links?",
        content:
          "Ad Links are special tracking parameters you add to your Facebook Message ads. When a customer clicks your ad and messages you, FlyChat tags the conversation with that ad's reference automatically.",
      },
      {
        title: "Creating an Ad Link",
        steps: [
          "Go to the Ad Links page",
          "Click 'New Ad Link'",
          "Give it a name (e.g. 'Jalaba_April_Reel')",
          "Link it to a product from your catalog",
          "Copy the generated ref parameter",
          "Add it to your Facebook ad's message URL or button link",
        ],
      },
      {
        title: "Viewing ad performance",
        content:
          "Go to Lead Intelligence → Top Performing Ads to see which ads generate the most qualified leads and confirmed orders — not just the most messages.",
        tip: "Scale ads with high qualified lead rates. Pause ads with many messages but zero qualifications.",
      },
    ],
    relatedFeatures: ["lead-intelligence", "products"],
  },
  {
    id: "shipping",
    feature: "Shipping",
    icon: "🚚",
    title: "Shipping Prices",
    description: "Manage delivery prices for all 58 Algerian wilayas.",
    sections: [
      {
        title: "Setting up shipping prices",
        steps: [
          "Go to Settings → Manage Pricings",
          "Set Home delivery price per wilaya",
          "Set Bureau (pickup point) delivery price per wilaya",
          "Set Retour (return) price per wilaya",
          "Use 'Apply to All' to set the same price for all wilayas at once",
          "Toggle N/A for wilayas where you don't deliver",
        ],
      },
      {
        title: "How the AI uses shipping prices",
        content:
          "When a customer asks 'شحال التوصيل لوهران', the AI reads your shipping table and gives the exact price for Oran — home delivery or bureau, whichever the customer asked about.",
        tip: "Keep your prices updated. The AI reads directly from your shipping table on every reply.",
      },
      {
        title: "Unavailable wilayas",
        content:
          "Mark wilayas as N/A if you don't deliver there. The AI will politely tell customers in those wilayas that delivery is not available.",
      },
    ],
    relatedFeatures: ["ai-agent", "orders"],
  },
  {
    id: "products",
    feature: "Products",
    icon: "🛍️",
    title: "Product Catalog",
    description: "Manage your products, variants, and AI-suggested images.",
    sections: [
      {
        title: "Adding a product",
        steps: [
          "Go to Products page",
          "Click 'Add Product'",
          "Enter: name, description, price, stock",
          "Add color and size variants",
          "Upload images with AI descriptions",
          "Mark one image as Main",
          "Check 'Active — AI will suggest this product' to make it available",
        ],
      },
      {
        title: "AI Suggested Images",
        content:
          "Upload images with a description so the AI knows what each shows. Example: 'Shows all 6 colors assembled'. When a customer asks to see the product, the AI sends the right image automatically.",
        tip: "Add a clear description for every image — it helps the AI pick exactly the right one to send.",
      },
      {
        title: "Variants",
        content:
          "Add color and size variants for each product. The AI reads these directly when customers ask about what's available. Use the exact names customers will use (e.g. 'أحمر' not 'Red').",
      },
      {
        title: "Active vs Inactive",
        content:
          "Only active products are suggested by the AI and available for orders. Inactive products are hidden from the AI — use this to temporarily remove out-of-stock items.",
        warning: "If a product is out of stock, mark it inactive. Otherwise the AI may take orders for items you can't ship.",
      },
    ],
    relatedFeatures: ["ai-agent", "orders", "ad-links"],
  },
  {
    id: "widget",
    feature: "Widget",
    icon: "📱",
    title: "Website Chat Widget",
    description: "Add a chat widget to your website so customers can message you directly.",
    sections: [
      {
        title: "What is the Widget?",
        content:
          "The Website Widget is a floating chat button that appears on your website. When a visitor clicks it, they can send you a message that appears in your FlyChat Inbox.",
      },
      {
        title: "Setting up the Widget",
        steps: [
          "Go to Widget in the left navigation",
          "Customize: position, color, greeting message, language",
          "Copy the embed script from the Install tab",
          "Paste it before the </body> tag in your website's HTML",
          "The widget will appear immediately on your site",
        ],
      },
      {
        title: "AI on Widget conversations",
        content:
          "Widget conversations go through the same AI agent as WhatsApp and Messenger. Enable AI mode in Settings to have the agent reply to website visitors automatically.",
        tip: "Set a custom greeting message for the widget so visitors know what to ask about.",
      },
    ],
    relatedFeatures: ["inbox", "channels", "ai-agent"],
  },
  {
    id: "automation",
    feature: "Automation",
    icon: "🔔",
    title: "Automation Rules",
    description: "Auto-assign, auto-escalate, and auto-archive conversations based on rules.",
    sections: [
      {
        title: "What is Automation?",
        content:
          "Automation rules trigger actions automatically when certain conditions are met — for example: archive conversations older than 7 days, or escalate to human if a customer says a keyword.",
      },
      {
        title: "Creating a rule",
        steps: [
          "Go to Automation page",
          "Click 'New Rule'",
          "Choose a trigger: new conversation, keyword matched, inactivity, order created",
          "Choose an action: assign to agent, escalate to human, archive",
          "Toggle the rule ON to activate it",
        ],
      },
      {
        title: "Rule types",
        content:
          "Available triggers: New Conversation (fires when a new message arrives), Keyword Match (fires when customer message contains a word), Inactivity (fires after X hours with no reply), Order Created (fires when an order is confirmed).",
        tip: "Use inactivity rules to auto-archive conversations where the customer went silent after 48 hours.",
      },
    ],
    relatedFeatures: ["inbox", "team"],
  },
  {
    id: "team",
    feature: "Team",
    icon: "👤",
    title: "Team Management",
    description: "Invite team members, assign roles, and manage agent access.",
    sections: [
      {
        title: "Inviting a team member",
        steps: [
          "Go to Team page",
          "Click 'Invite Member'",
          "Enter their email address",
          "Choose a role: Admin or Agent",
          "Click Send Invite — they receive an email with a link",
        ],
      },
      {
        title: "Roles explained",
        content:
          "Owner: full access to all settings and billing. Admin: can manage products, settings, and team. Agent: can only see and reply to conversations assigned to them.",
      },
      {
        title: "Assigning conversations",
        content:
          "Use Automation rules to auto-assign conversations to specific agents. Or manually assign from inside the Inbox conversation panel.",
        tip: "Create separate agent accounts for each customer service rep so you can track performance by agent.",
      },
    ],
    relatedFeatures: ["inbox", "automation"],
  },
  {
    id: "channels",
    feature: "Channels",
    icon: "🔌",
    title: "Channel Connections",
    description: "Connect WhatsApp, Messenger, Instagram, and your website widget.",
    sections: [
      {
        title: "Connecting a channel",
        steps: [
          "Go to Channels page",
          "Click on the channel you want to connect (WhatsApp, Messenger, Instagram)",
          "Follow the setup guide — each channel has step-by-step instructions",
          "Once connected, new messages from that channel appear in your Inbox",
        ],
      },
      {
        title: "Shopify integration",
        content:
          "Connect your Shopify store to sync orders, products, and customer data. Go to Channels → Shopify → Connect Store.",
        tip: "Shopify sync runs automatically every few hours. You can also trigger a manual sync anytime.",
      },
      {
        title: "Channel status",
        content:
          "Connected channels show a green status. If a channel shows as disconnected, the access token may have expired — reconnect it from the Channels page.",
        warning: "If Instagram or Messenger disconnects, the AI will stop replying on that channel. Reconnect immediately.",
      },
    ],
    relatedFeatures: ["inbox", "widget", "orders"],
  },
  {
    id: "billing",
    feature: "Billing",
    icon: "💳",
    title: "Plans & Billing",
    description: "Manage your subscription, view usage, and upgrade your plan.",
    sections: [
      {
        title: "Available plans",
        steps: [
          "Free — 20 AI messages/month. Perfect for testing.",
          "Starter — 1,500 AI messages/month. 9,900 DZD/month.",
          "Pro — 7,000 AI messages/month. 24,900 DZD/month.",
          "Agency — 15,000 AI messages/month. 49,900 DZD/month.",
        ],
        tip: "Annual plans save 19% — toggle the annual switch on the Billing page.",
      },
      {
        title: "What counts as a message?",
        content:
          "Each AI reply to a customer uses one AI message credit. Human replies (from you or your team) are free and do not count against your plan.",
      },
      {
        title: "Top-up credits",
        content:
          "If you run out of AI messages before your renewal date, you can buy extra credit packs from the Billing page. Credits don't expire.",
      },
      {
        title: "Changing your plan",
        content:
          "Upgrade or downgrade anytime from the Billing page. Upgrades take effect immediately. Downgrades take effect at the end of the current billing period.",
      },
    ],
    relatedFeatures: ["ai-agent"],
  },
  {
    id: "customers",
    feature: "Customers",
    icon: "👥",
    title: "Customer Profiles",
    description: "Auto-built customer profiles from conversations, with full order history.",
    sections: [
      {
        title: "How customer profiles are created",
        content:
          "A customer profile is automatically created when a new conversation starts. The AI fills in name and phone as they're collected during the conversation.",
      },
      {
        title: "What's in a profile",
        steps: [
          "Full name and phone number",
          "Channel they use (WhatsApp, Instagram, etc.)",
          "All past conversations and messages",
          "All orders placed, with status",
          "Total spend and order count",
        ],
      },
      {
        title: "Searching customers",
        content:
          "Search by name, phone number, or wilaya. Click any customer to view their full profile and history.",
        tip: "Use customer history to personalize follow-up messages — you can see exactly what they ordered before.",
      },
    ],
    relatedFeatures: ["inbox", "orders", "lead-intelligence"],
  },
  {
    id: "communication-optimizer",
    feature: "Communication Optimizer",
    icon: "🧠",
    title: "Communication Optimizer",
    description: "AI learns from your past conversations and generates improvements automatically.",
    sections: [
      {
        title: "What is the Communication Optimizer?",
        content:
          "The optimizer analyzes your past conversations using Claude AI, detects quality patterns (good closers, missed signals, repetitive replies), and generates behavior improvement rules for your AI agent.",
      },
      {
        title: "Running an analysis",
        steps: [
          "Go to AI Settings",
          "Scroll to 'Communication Optimizer' section",
          "Click 'Run Analysis' — analyzes your last 30 days of conversations",
          "Wait for analysis to complete (30–90 seconds)",
          "Review the summary: avg score, findings, suggested improvements",
          "Click 'Approve Improvements' to apply them to your AI",
        ],
        tip: "Run analysis monthly or after making major changes to your product catalog.",
      },
      {
        title: "Safety and approval",
        content:
          "Improvements are never applied automatically. You always review and approve before they take effect. The optimizer only improves communication behavior — it never changes your prices, products, or shipping data.",
        warning: "Always read the improvement summary before approving. Improvements are store-specific and may reference conversation patterns from your store.",
      },
    ],
    relatedFeatures: ["ai-agent", "ai-settings", "lead-intelligence"],
  },
]
