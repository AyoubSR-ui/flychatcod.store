import {
  db,
  usersTable,
  organizationsTable,
  storesTable,
  customersTable,
  productsTable,
  conversationsTable,
  messagesTable,
  ordersTable,
  orderItemsTable,
  widgetConfigsTable,
  automationRulesTable,
  channelConnectionsTable,
  teamMembersTable,
  subscriptionsTable,
  auditLogsTable,
} from "@workspace/db";
import { randomBytes, createHash } from "crypto";

function generateId(prefix?: string): string {
  const id = randomBytes(12).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(password + salt).digest("hex");
  return `${salt}:${hash}`;
}

function generateOrderNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `FLY-${year}${month}${day}-${rand}`;
}

async function seed() {
  console.log("🌱 Seeding FlyChat COD demo data...");

  // ─── Users ────────────────────────────────────────────────────────────────
  const adminId = generateId("usr");
  const ownerId = generateId("usr");
  const agentId = generateId("usr");

  await db.insert(usersTable).values([
    {
      id: adminId,
      email: "admin@flychat.dz",
      passwordHash: hashPassword("admin123456"),
      name: "FlyChat Admin",
      role: "superadmin",
      language: "en",
      onboardingCompleted: true,
    },
    {
      id: ownerId,
      email: "demo@flychat.dz",
      passwordHash: hashPassword("demo123456"),
      name: "Karim Benali",
      role: "owner",
      language: "fr",
      onboardingCompleted: true,
    },
    {
      id: agentId,
      email: "agent@flychat.dz",
      passwordHash: hashPassword("agent123456"),
      name: "Sara Meghani",
      role: "agent",
      language: "fr",
      onboardingCompleted: true,
    },
  ]).onConflictDoNothing();

  // ─── Organization ─────────────────────────────────────────────────────────
  const orgId = generateId("org");
  await db.insert(organizationsTable).values({
    id: orgId,
    name: "Benali Commerce",
    ownerId,
  }).onConflictDoNothing();

  // ─── Store ────────────────────────────────────────────────────────────────
  const storeId = "str_demo_000000000000000000000001";
  await db.insert(storesTable).values({
    id: storeId,
    organizationId: orgId,
    name: "AlgerShop Pro",
    description: "Votre boutique en ligne pour les meilleurs produits en Algérie",
    phone: "+213 555 123 456",
    logoUrl: null,
    websiteUrl: "https://algershop.dz",
    defaultLanguage: "fr",
    widgetLanguage: "fr",
    shippingWilayas: ["Alger", "Oran", "Constantine", "Annaba", "Blida", "Tizi Ouzou", "Béjaïa", "Sétif", "Batna", "Sidi Bel Abbès"],
    hasWebsite: true,
    needsHostedPage: false,
  }).onConflictDoNothing();

  // Update users with org/store
  await db.update(usersTable).set({ organizationId: orgId, storeId }).execute();

  // ─── Widget Config ────────────────────────────────────────────────────────
  await db.insert(widgetConfigsTable).values({
    id: generateId("wgt"),
    storeId,
    welcomeMessageEn: "Hello! Welcome to AlgerShop Pro. How can we help you today?",
    welcomeMessageFr: "Bonjour! Bienvenue chez AlgerShop Pro. Comment pouvons-nous vous aider?",
    defaultLanguage: "fr",
    primaryColor: "#2563eb",
    position: "bottom-right",
    isActive: true,
  }).onConflictDoNothing();

  // ─── Channel Connections ──────────────────────────────────────────────────
  await db.insert(channelConnectionsTable).values([
    { id: generateId("ch"), storeId, channel: "widget", status: "connected" },
    { id: generateId("ch"), storeId, channel: "whatsapp", status: "disconnected" },
    { id: generateId("ch"), storeId, channel: "instagram", status: "disconnected" },
    { id: generateId("ch"), storeId, channel: "messenger", status: "disconnected" },
  ]).onConflictDoNothing();

  // ─── Subscription ─────────────────────────────────────────────────────────
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await db.insert(subscriptionsTable).values({
    id: generateId("sub"),
    organizationId: orgId,
    plan: "pro",
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: trialEnd,
    cancelAtPeriodEnd: false,
  }).onConflictDoNothing();

  // ─── Team Members ─────────────────────────────────────────────────────────
  await db.insert(teamMembersTable).values([
    { id: generateId("tm"), userId: ownerId, storeId, email: "demo@flychat.dz", name: "Karim Benali", role: "owner", status: "active" },
    { id: generateId("tm"), userId: agentId, storeId, email: "agent@flychat.dz", name: "Sara Meghani", role: "agent", status: "active" },
    { id: generateId("tm"), userId: null, storeId, email: "youssef@algershop.dz", name: "Youssef Amara", role: "admin", status: "invited" },
  ]).onConflictDoNothing();

  // ─── Products ─────────────────────────────────────────────────────────────
  const prod1 = generateId("prod");
  const prod2 = generateId("prod");
  const prod3 = generateId("prod");
  const prod4 = generateId("prod");

  await db.insert(productsTable).values([
    {
      id: prod1, storeId, name: "Chaussures Nike Air Max 2024", price: "8500",
      description: "Chaussures de sport confortables, idéales pour le quotidien",
      stock: 45, isActive: true,
      variants: ["Blanc/Noir - 40", "Blanc/Noir - 41", "Blanc/Noir - 42", "Blanc/Noir - 43", "Blanc/Noir - 44"],
    },
    {
      id: prod2, storeId, name: "Sac à Main Cuir Premium", price: "4200",
      description: "Sac à main en cuir véritable, style élégant, plusieurs couleurs disponibles",
      stock: 20, isActive: true,
      variants: ["Noir", "Marron", "Beige", "Rouge"],
    },
    {
      id: prod3, storeId, name: "Montre Hommes Classique", price: "12000",
      description: "Montre analogique avec cadran en acier inoxydable, étanche jusqu'à 30m",
      stock: 15, isActive: true,
      variants: ["Argent/Noir", "Or/Blanc", "Noir/Noir"],
    },
    {
      id: prod4, storeId, name: "Parfum Pour Elle - 100ml", price: "3500",
      description: "Eau de parfum floral-fruité, tenue longue durée 12h",
      stock: 60, isActive: true,
      variants: ["Rose", "Vanille", "Jasmin"],
    },
  ]).onConflictDoNothing();

  // ─── Customers ────────────────────────────────────────────────────────────
  const cust1 = generateId("cust");
  const cust2 = generateId("cust");
  const cust3 = generateId("cust");
  const cust4 = generateId("cust");
  const cust5 = generateId("cust");

  await db.insert(customersTable).values([
    { id: cust1, storeId, name: "Amina Cherif", phone: "+213 661 234 567", email: "amina@gmail.com", wilaya: "Alger", isRepeat: true, totalOrders: 3, notes: "Cliente régulière, préfère les livraisons le matin" },
    { id: cust2, storeId, name: "Mehdi Bouzid", phone: "+213 770 987 654", email: null, wilaya: "Oran", isRepeat: false, totalOrders: 1, notes: null },
    { id: cust3, storeId, name: "Fatima Zahra Kaci", phone: "+213 551 456 789", email: "fzkaci@hotmail.com", wilaya: "Constantine", isRepeat: true, totalOrders: 2, notes: "Demande souvent des remises groupées" },
    { id: cust4, storeId, name: "Yacine Belhadj", phone: "+213 699 321 654", email: null, wilaya: "Tizi Ouzou", isRepeat: false, totalOrders: 1, notes: null },
    { id: cust5, storeId, name: "Nadia Hammami", phone: "+213 554 789 012", email: "nadia.h@gmail.com", wilaya: "Annaba", isRepeat: true, totalOrders: 4, notes: "Meilleure cliente, toujours satisfaite" },
  ]).onConflictDoNothing();

  // ─── Conversations ────────────────────────────────────────────────────────
  const conv1 = generateId("conv");
  const conv2 = generateId("conv");
  const conv3 = generateId("conv");
  const conv4 = generateId("conv");
  const conv5 = generateId("conv");

  const pastDate = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  await db.insert(conversationsTable).values([
    {
      id: conv1, storeId, customerId: cust1, customerName: "Amina Cherif", customerPhone: "+213 661 234 567",
      status: "open", channel: "widget", lastMessage: "Je voudrais commander les chaussures taille 42",
      unreadCount: 2, createdAt: pastDate(0), updatedAt: pastDate(0),
    },
    {
      id: conv2, storeId, customerId: cust2, customerName: "Mehdi Bouzid", customerPhone: "+213 770 987 654",
      status: "pending", channel: "widget", lastMessage: "C'est quoi le délai de livraison à Oran?",
      unreadCount: 1, createdAt: pastDate(0), updatedAt: pastDate(0),
    },
    {
      id: conv3, storeId, customerId: cust3, customerName: "Fatima Zahra Kaci", customerPhone: "+213 551 456 789",
      status: "open", channel: "widget", lastMessage: "Est-ce que vous avez le sac en couleur beige?",
      unreadCount: 0, assignedToId: agentId, createdAt: pastDate(1), updatedAt: pastDate(1),
    },
    {
      id: conv4, storeId, customerId: cust5, customerName: "Nadia Hammami", customerPhone: "+213 554 789 012",
      status: "closed", channel: "widget", lastMessage: "Merci pour la livraison rapide!",
      unreadCount: 0, createdAt: pastDate(3), updatedAt: pastDate(2),
    },
    {
      id: conv5, storeId, customerId: cust4, customerName: "Yacine Belhadj", customerPhone: "+213 699 321 654",
      status: "open", channel: "widget", lastMessage: "La montre argent/noir, elle est disponible?",
      unreadCount: 3, createdAt: pastDate(0), updatedAt: pastDate(0),
    },
  ]).onConflictDoNothing();

  // ─── Messages ─────────────────────────────────────────────────────────────
  await db.insert(messagesTable).values([
    // Conv 1
    { id: generateId("msg"), conversationId: conv1, content: "Bonjour! Je suis intéressée par les chaussures Nike", sender: "customer", isInternal: 0, createdAt: pastDate(0) },
    { id: generateId("msg"), conversationId: conv1, content: "Bonjour Amina! Bien sûr, quelle taille souhaitez-vous?", sender: "agent", senderName: "Sara Meghani", isInternal: 0, createdAt: pastDate(0) },
    { id: generateId("msg"), conversationId: conv1, content: "Je voudrais commander les chaussures taille 42", sender: "customer", isInternal: 0, createdAt: pastDate(0) },
    // Conv 2
    { id: generateId("msg"), conversationId: conv2, content: "Bonjour, j'aimerais commander", sender: "customer", isInternal: 0, createdAt: pastDate(0) },
    { id: generateId("msg"), conversationId: conv2, content: "C'est quoi le délai de livraison à Oran?", sender: "customer", isInternal: 0, createdAt: pastDate(0) },
    // Conv 3
    { id: generateId("msg"), conversationId: conv3, content: "Bonjour, vous avez des sacs en stock?", sender: "customer", isInternal: 0, createdAt: pastDate(1) },
    { id: generateId("msg"), conversationId: conv3, content: "Oui! Nous avons plusieurs couleurs disponibles: Noir, Marron, Beige et Rouge", sender: "agent", senderName: "Sara Meghani", isInternal: 0, createdAt: pastDate(1) },
    { id: generateId("msg"), conversationId: conv3, content: "Est-ce que vous avez le sac en couleur beige?", sender: "customer", isInternal: 0, createdAt: pastDate(1) },
    // Conv 4
    { id: generateId("msg"), conversationId: conv4, content: "Ma commande est arrivée hier!", sender: "customer", isInternal: 0, createdAt: pastDate(2) },
    { id: generateId("msg"), conversationId: conv4, content: "Merci pour la livraison rapide!", sender: "customer", isInternal: 0, createdAt: pastDate(2) },
    { id: generateId("msg"), conversationId: conv4, content: "Merci à vous Nadia! Bonne utilisation 😊", sender: "agent", senderName: "Karim Benali", isInternal: 0, createdAt: pastDate(2) },
    // Conv 5
    { id: generateId("msg"), conversationId: conv5, content: "Salam, bonjour", sender: "customer", isInternal: 0, createdAt: pastDate(0) },
    { id: generateId("msg"), conversationId: conv5, content: "La montre argent/noir, elle est disponible?", sender: "customer", isInternal: 0, createdAt: pastDate(0) },
    { id: generateId("msg"), conversationId: conv5, content: "Note interne: Client potentiel VIP, prioriser", sender: "agent", senderName: "Sara Meghani", isInternal: 1, createdAt: pastDate(0) },
  ]).onConflictDoNothing();

  // ─── Orders ───────────────────────────────────────────────────────────────
  const ord1 = generateId("ord");
  const ord2 = generateId("ord");
  const ord3 = generateId("ord");
  const ord4 = generateId("ord");
  const ord5 = generateId("ord");

  await db.insert(ordersTable).values([
    {
      id: ord1, orderNumber: "FLY-260314-0001", storeId, customerId: cust1, conversationId: conv1,
      customerName: "Amina Cherif", customerPhone: "+213 661 234 567", wilaya: "Alger",
      address: "15 Rue Didouche Mourad, Alger Centre", status: "confirmed", isCod: true,
      total: "8500", sellerNote: "Taille 42, couleur Blanc/Noir. Appelée et confirmée.",
      createdAt: pastDate(0), updatedAt: pastDate(0),
    },
    {
      id: ord2, orderNumber: "FLY-260313-0023", storeId, customerId: cust5, conversationId: conv4,
      customerName: "Nadia Hammami", customerPhone: "+213 554 789 012", wilaya: "Annaba",
      address: "8 Rue Ibn Khaldoun, Annaba", status: "delivered", isCod: true,
      total: "4200", sellerNote: null,
      createdAt: pastDate(3), updatedAt: pastDate(1),
    },
    {
      id: ord3, orderNumber: "FLY-260314-0012", storeId, customerId: cust2, conversationId: conv2,
      customerName: "Mehdi Bouzid", customerPhone: "+213 770 987 654", wilaya: "Oran",
      address: null, status: "awaiting_confirmation", isCod: true,
      total: "12000", sellerNote: "Attente confirmation téléphonique",
      createdAt: pastDate(0), updatedAt: pastDate(0),
    },
    {
      id: ord4, orderNumber: "FLY-260312-0008", storeId, customerId: cust3, conversationId: null,
      customerName: "Fatima Zahra Kaci", customerPhone: "+213 551 456 789", wilaya: "Constantine",
      address: "Villa 42, Cité Benbadis", status: "shipped", isCod: true,
      total: "7700", sellerNote: null,
      createdAt: pastDate(4), updatedAt: pastDate(2),
    },
    {
      id: ord5, orderNumber: "FLY-260314-0007", storeId, customerId: null, conversationId: null,
      customerName: "Ahmed Tahir", customerPhone: "+213 560 111 222", wilaya: "Blida",
      address: null, status: "new", isCod: true,
      total: "3500", sellerNote: null,
      createdAt: pastDate(0), updatedAt: pastDate(0),
    },
  ]).onConflictDoNothing();

  // ─── Order Items ──────────────────────────────────────────────────────────
  await db.insert(orderItemsTable).values([
    { id: generateId("oi"), orderId: ord1, productId: prod1, productName: "Chaussures Nike Air Max 2024", variant: "Blanc/Noir - 42", quantity: 1, price: "8500" },
    { id: generateId("oi"), orderId: ord2, productId: prod2, productName: "Sac à Main Cuir Premium", variant: "Beige", quantity: 1, price: "4200" },
    { id: generateId("oi"), orderId: ord3, productId: prod3, productName: "Montre Hommes Classique", variant: "Argent/Noir", quantity: 1, price: "12000" },
    { id: generateId("oi"), orderId: ord4, productId: prod2, productName: "Sac à Main Cuir Premium", variant: "Noir", quantity: 1, price: "4200" },
    { id: generateId("oi"), orderId: ord4, productId: prod4, productName: "Parfum Pour Elle - 100ml", variant: "Rose", quantity: 1, price: "3500" },
    { id: generateId("oi"), orderId: ord5, productId: prod4, productName: "Parfum Pour Elle - 100ml", variant: "Jasmin", quantity: 1, price: "3500" },
  ]).onConflictDoNothing();

  // ─── Automation Rules ─────────────────────────────────────────────────────
  await db.insert(automationRulesTable).values([
    {
      id: generateId("rule"), storeId, name: "Message de bienvenue",
      trigger: "new_conversation", action: "send_message", isActive: true,
      config: { message_fr: "Bonjour! Bienvenue chez AlgerShop Pro. Comment pouvons-nous vous aider aujourd'hui?", message_en: "Hello! Welcome to AlgerShop Pro. How can we help you today?" },
    },
    {
      id: generateId("rule"), storeId, name: "Déclencheur de commande",
      trigger: "keyword", action: "create_order_flow", isActive: true,
      config: { keywords: ["commander", "commande", "acheter", "prix", "disponible"] },
    },
    {
      id: generateId("rule"), storeId, name: "Escalade après 5 minutes",
      trigger: "inactivity", action: "escalate", isActive: false,
      config: { inactivity_minutes: 5, escalate_to: "human" },
    },
  ]).onConflictDoNothing();

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  await db.insert(auditLogsTable).values([
    { id: generateId("log"), storeId, userId: ownerId, event: "store.created", description: "Store AlgerShop Pro created", createdAt: pastDate(5) },
    { id: generateId("log"), storeId, userId: ownerId, event: "order.confirmed", description: "Order FLY-260314-0001 confirmed by Karim Benali", createdAt: pastDate(0) },
    { id: generateId("log"), storeId, userId: agentId, event: "conversation.closed", description: "Conversation with Nadia Hammami closed", createdAt: pastDate(2) },
  ]).onConflictDoNothing();

  console.log("✅ Seed complete!");
  console.log("\n📋 Demo accounts:");
  console.log("  Seller:     demo@flychat.dz    / demo123456");
  console.log("  Agent:      agent@flychat.dz   / agent123456");
  console.log("  SuperAdmin: admin@flychat.dz   / admin123456");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
