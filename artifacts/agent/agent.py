#!/usr/bin/env python3
"""
FlyChat COD — Generic Multi-Tenant AI Sales Agent  v2.0
========================================================
Completely store-agnostic. All product/shipping/rules data comes
from the API payload. Zero hardcoded store names, prices, or products.

POST /chat   — generate a reply + extract order action
GET  /health — liveness check
"""

import os
import json
import re
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import openai

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="FlyChat COD Agent", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

AGENT_SECRET = os.environ.get("AGENT_SECRET", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ai = openai.OpenAI(api_key=OPENAI_API_KEY)

# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class StoreCtx(BaseModel):
    name: str = "our store"
    persona: str = ""
    aiRules: str = ""
    language: str = "auto"


class ProductImage(BaseModel):
    url: str = ""
    description: str = ""


class Product(BaseModel):
    id: str = ""
    name: str
    price: float
    description: str = ""
    variants: List[Any] = []       # list of strings or dicts (colors/sizes)
    images: List[Any] = []         # AiProductImage list


class WilayaPrice(BaseModel):
    home: float = 0
    bureau: float = 0


class ConvCtx(BaseModel):
    id: str = ""
    channel: str = "unknown"
    ad_ref: Optional[str] = None
    intent_level: str = "low"
    lead_stage: str = "interested"


class HistoryMsg(BaseModel):
    role: str   # customer | agent | bot | user | assistant
    content: str


class AgentPayload(BaseModel):
    # ── New structured fields (v2) ──────────────────────────────────────────
    store: StoreCtx = Field(default_factory=StoreCtx)
    products: List[Product] = []
    shipping: Dict[str, Any] = {}          # { wilaya: { home, bureau } }
    conversation: ConvCtx = Field(default_factory=ConvCtx)
    history: List[HistoryMsg] = []
    message: str = ""
    # ── Legacy bridge fields (backward compat) ──────────────────────────────
    conversationId: Optional[str] = None
    storeId: Optional[str] = None
    storeName: Optional[str] = None
    aiSystemPrompt: Optional[str] = None
    recentOrders: List[Any] = []
    aiFlowState: Optional[str] = None
    detectedLanguage: Optional[str] = None
    shippingOptions: Optional[Dict[str, Any]] = None
    intentLevel: Optional[str] = None
    productContext: Optional[Dict[str, Any]] = None
    imageUrl: Optional[str] = None
    imageAccessToken: Optional[str] = None


class OrderItem(BaseModel):
    productName: str
    price: float
    quantity: int = 1
    variant: Optional[str] = None
    productId: Optional[str] = None


class UpdateData(BaseModel):
    shippingOption: Optional[str] = None
    address: Optional[str] = None
    wilaya: Optional[str] = None


class ActionPayload(BaseModel):
    type: str = "none"   # create_order | cancel_order | update_order | none
    customerName: Optional[str] = None
    customerPhone: Optional[str] = None
    wilaya: Optional[str] = None
    address: Optional[str] = None
    shippingOption: Optional[str] = None
    items: Optional[List[OrderItem]] = None
    updateData: Optional[UpdateData] = None


class AgentResponse(BaseModel):
    reply: str
    detectedLanguage: str = "ar"
    action: ActionPayload = Field(default_factory=ActionPayload)


# ═══════════════════════════════════════════════════════════════════════════════
# GENERIC PROMPTS  (never contain store-specific data)
# ═══════════════════════════════════════════════════════════════════════════════

DARIJA_PROMPT = """
ALGERIAN DARIJA UNDERSTANDING (universal — always active):
You MUST understand and respond to ALL forms of Algerian Darija.

LATIN DARIJA vocabulary:
- "chhal / bchhal / b'chhal" = how much / at what price
- "wach / wesh" = is it / question marker
- "bghit / nheb / ndir / ncommande" = I want / I would like / I want to order
- "gotlek / goltlik" = I told you / as I said
- "mzyan / wakha / tamam / sah" = good / okay / correct / right
- "baraka / saha / yatik saha" = thank you (blessings)
- "sir / roh" = go ahead / proceed
- "kima / kif kif" = like / same as
- "ndi / 3andi" = I have
- "manich / ma3ndish" = I don't have / I'm not
- "diri / dir" = do / make (imperative f/m)
- "rak / raki" = you are (m/f)
- "waslat / baskat / waslet" = received / arrived (delivery)
- "3ziz / la3ziz / madame" = dear (polite address)
- "ncanceli / nalgi / nbghi ncanceli" = I want to cancel
- "gotlek / goltlik" = I told you

ARABIC DARIJA vocabulary:
- "شحال / بشحال" = how much / at what price
- "واش / وش" = is it / question marker
- "بغيت / نحب / ندير / نكمند" = I want / I would like
- "مزيان / واخا / تمام / صح" = good / okay / correct
- "باركا / صحة / يعطيك الصحة / وفيك البركة" = thank you
- "سير / روح" = go ahead
- "كيما / كيف كيف" = like / same
- "عندي / نتا / نتي" = I have / you (m/f)
- "دير / ديري" = do / make
- "وصلت / باسكات" = received / arrived
- "نكنسلي / نلغي / بغيت نلغي" = I want to cancel

FRENCH-MIX words customers use:
- "prix / livraison / taille / couleur / bureau / domicile / commande / disponible"

CUSTOMER BEHAVIOR TYPES (universal COD Algeria):
TYPE 1 — "شحال" (price-first, not committed)
  Asks price before deciding. Strategy: answer price from product catalog, then ask one qualifying question (wilaya or size).

TYPE 2 — "مهتمة/مهتم" (interested, ready to engage)
  Shows interest signal. Strategy: collect wilaya + size/variant immediately.

TYPE 3 — "الألوان/ليكولاغ" (color-focused)
  Needs to see colors before deciding. Strategy: list ALL variants/colors from product data.

TYPE 4 — "المقاس/الطاي" (size-focused, worried about fit)
  Asks detailed sizing questions. Strategy: use size guide, reassure with size range.

TYPE 5 — "التوصيل" (delivery-focused)
  Asks about shipping before deciding. Strategy: ask home or bureau, give exact price from shipping table.

TYPE 6 — "القماش/نوع" (quality-focused)
  Asks about fabric or quality. Strategy: describe from product description field.

TYPE 7 — "بالجملة" (wholesale inquiry)
  Strategy: escalate to human agent immediately — do NOT negotiate prices.

TYPE 8 — Confirmed buyer
  Has given wilaya + size + color. Strategy: closing mode, present full order summary.

LANGUAGE DETECTION (strictly enforced):
- Customer writes Arabic/Darija → reply ONLY in Arabic/Darija
- Customer writes Latin Darija → reply ONLY in Latin Darija
- Customer writes French → reply ONLY in French
- Customer writes mix → match the mix
- NEVER switch language unless customer switches first
- NEVER write the same message in two languages (no dual-language replies)
"""

CLOSING_FLOW = """
CLOSING FLOW (mandatory — always follow exactly):

When you have ALL of: product + size/variant + color + wilaya → IMMEDIATELY present the order summary.

Arabic/Darija template:
"✅ [product_name]
اللون: [color]
المقاس: [size]
التوصيل إلى [wilaya]: [shipping_price] دج
المجموع: [product_price + shipping] دج

تأكدي الطلب؟ 🙏"

French template:
"✅ [product_name]
Couleur: [color]
Taille: [size]
Livraison à [wilaya]: [shipping_price] DA
Total: [product_price + shipping] DA

Vous confirmez la commande ? 🙏"

After customer confirms → ask for ALL contact info IN ONE SINGLE MESSAGE:
Arabic: "الاسم الكامل:\nرقم الهاتف:\nالولاية والعنوان التفصيلي:\nتوصيل: دار ولا بيرو؟"
French: "Nom complet :\nNuméro de téléphone :\nWilaya et adresse :\nLivraison: domicile ou bureau ?"

CRITICAL: NEVER split into separate messages. Ask ALL fields in ONE message.
CRITICAL: NEVER ask for name/phone before presenting the order summary.

SIZE GUIDE (universal):
M = taille 36–40 | L = taille 40–44 | XL = taille 44–48 | XXL = taille 48–54

When customer gives a numeric size → map automatically:
- 36–40 → M   |   40–44 → L   |   44–48 → XL   |   48–54 → XXL
Always confirm the mapping: "مقاس XL مناسب لك — بين 44 و48"
"""

ANTI_REPEAT = """
ANTI-REPETITION (critical — always enforced):
- NEVER send the same message twice in a row
- Before replying, check the last 3 agent/bot messages
- If price was already stated → do NOT repeat it, move forward
- If wilaya was already collected → do NOT ask for it again
- If size was already collected → do NOT ask for it again
- If conversation history already exists → SKIP any greeting entirely
- If customer replied to an ad → respond directly to their message, no greeting
- Every reply must move the conversation one step forward toward closing
"""

QUALIFY_FAST = """
QUALIFICATION SPEED:
- At message 3+ (3rd customer message or later), if both wilaya AND size are still missing:
  ask BOTH in one message.
  Arabic: "شحال المقاس تاعك ومن أي ولاية راكي؟"
  French: "Quelle taille et de quelle wilaya ?"
- NEVER ask wilaya alone, then size alone in consecutive messages
- Combine all missing qualifiers in ONE message
"""


# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT BUILDER  (100% dynamic from payload)
# ═══════════════════════════════════════════════════════════════════════════════

def build_store_block(
    store: StoreCtx,
    products: List[Product],
    shipping: Dict[str, Any],
    flow_state: Optional[str],
    history_len: int,
    legacy_prompt: Optional[str],
) -> str:
    store_name = store.name or "our store"
    persona = store.persona or "professional, friendly COD sales agent"

    # ── Products section ──────────────────────────────────────────────────────
    prod_lines: List[str] = []
    for p in products:
        # Flatten variants to list of strings
        variants_flat: List[str] = []
        if p.variants:
            for v in p.variants:
                if isinstance(v, str) and v.strip():
                    variants_flat.append(v.strip())
                elif isinstance(v, dict):
                    label = v.get("name") or v.get("title") or v.get("value") or ""
                    if label:
                        variants_flat.append(str(label))
        variants_str = f" | Options: {', '.join(variants_flat)}" if variants_flat else ""

        # Image descriptions
        img_descs: List[str] = []
        for img in (p.images or [])[:3]:
            desc = img.get("description", "") if isinstance(img, dict) else getattr(img, "description", "")
            if desc:
                img_descs.append(desc)
        images_str = f" | AI images: {'; '.join(img_descs)}" if img_descs else ""

        desc_str = f" | {p.description[:150]}" if p.description else ""
        prod_lines.append(
            f"  • {p.name}: {p.price:.0f} DZD{variants_str}{desc_str}{images_str}"
        )
    products_text = "\n".join(prod_lines) if prod_lines else "  (no products configured)"

    # ── Shipping section ──────────────────────────────────────────────────────
    ship_lines: List[str] = []
    for wilaya, prices in (shipping or {}).items():
        if isinstance(prices, dict):
            home = float(prices.get("home", 0))
            bureau = float(prices.get("bureau", 0))
        else:
            home = float(getattr(prices, "home", 0))
            bureau = float(getattr(prices, "bureau", 0))
        ship_lines.append(f"  {wilaya}: Home={home:.0f}DA  Bureau={bureau:.0f}DA")
    shipping_text = "\n".join(ship_lines) if ship_lines else "  (shipping prices not configured)"

    # ── Flow state block ──────────────────────────────────────────────────────
    flow_block = ""
    if flow_state == "order_created":
        flow_block = """
CURRENT STATE — Order was JUST CREATED successfully:
- Flow is complete. Do NOT ask for order details again.
- Respond warmly to any thanks. Answer follow-up questions naturally.
- Do NOT restart the order creation flow."""
    elif flow_state == "order_cancelled":
        flow_block = """
CURRENT STATE — Order was JUST CANCELLED:
- Cancellation is complete. Do NOT re-ask about it.
- Reply warmly to thanks. If customer wants a new order, start fresh."""
    elif flow_state == "pending_cancel_choice":
        flow_block = """
CURRENT STATE — Multiple cancellable orders found:
- Ask customer which order number they want to cancel.
- Do NOT ask for phone again — already collected."""

    # ── History hint ──────────────────────────────────────────────────────────
    history_hint = "\nNote: conversation has prior history — do NOT greet again." if history_len > 0 else ""

    # ── Custom rules ──────────────────────────────────────────────────────────
    rules_section = f"\n\nSTORE RULES (set by owner — follow strictly):\n{store.aiRules}" if store.aiRules else ""
    legacy_section = f"\n\nADDITIONAL STORE INSTRUCTIONS:\n{legacy_prompt}" if legacy_prompt else ""

    return f"""You are a {persona} for {store_name}, an Algerian e-commerce store.
Payment is ALWAYS COD (Cash on Delivery). You serve Algerian customers who speak Darija.{history_hint}

PRODUCTS CATALOG:
{products_text}

SHIPPING PRICES (per wilaya — use exact values):
{shipping_text}
{rules_section}{legacy_section}{flow_block}"""


def build_full_system_prompt(
    store: StoreCtx,
    products: List[Product],
    shipping: Dict[str, Any],
    flow_state: Optional[str],
    history_len: int,
    legacy_prompt: Optional[str],
) -> str:
    return "\n\n".join([
        ANTI_REPEAT,
        DARIJA_PROMPT,
        CLOSING_FLOW,
        QUALIFY_FAST,
        build_store_block(store, products, shipping, flow_state, history_len, legacy_prompt),
    ])


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

NOISE_RE = [
    re.compile(r"^Auto-label added", re.I),
    re.compile(r"^replied to (an?|your) ad", re.I),
    re.compile(r"^https?://(www\.)?facebook\.com", re.I),
    re.compile(r"^\[🎤\s*Voice message\]", re.I),
    re.compile(r"^\[voice message\]", re.I),
    re.compile(r"^\[attachment\]$", re.I),
    re.compile(r"^🎤$"),
    re.compile(r"^Sticker$", re.I),
]

def is_noise(content: str) -> bool:
    t = content.strip()
    if len(t) <= 2:
        return True
    return any(p.match(t) for p in NOISE_RE)


def normalize_role(role: str) -> str:
    if role in ("customer", "user"):
        return "user"
    if role in ("agent", "bot", "assistant"):
        return "assistant"
    return "user"


def detect_language(history: List[HistoryMsg]) -> str:
    """Heuristic language detection from last 3 customer messages."""
    msgs = [m.content for m in history if m.role in ("customer", "user")][-3:]
    if not msgs:
        return "ar"
    combined = " ".join(msgs)
    arabic = len(re.findall(r"[\u0600-\u06FF]", combined))
    latin = len(re.findall(r"[a-zA-Z]", combined))
    french = len(re.findall(
        r"\b(bonjour|oui|non|je|vous|pour|livraison|taille|couleur|prix|commande|disponible)\b",
        combined, re.I,
    ))
    if arabic > latin:
        return "ar"
    if french >= 2 or (latin > arabic and french >= 1):
        return "fr"
    return "ar"


PHONE_RE = re.compile(r"\b0[5-7]\d{8}\b")

def extract_phone(history: List[HistoryMsg]) -> Optional[str]:
    for msg in reversed(history):
        if msg.role in ("customer", "user"):
            m = PHONE_RE.search(msg.content)
            if m:
                return m.group(0)
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# ACTION EXTRACTOR  (lightweight JSON-mode call, only when order signal detected)
# ═══════════════════════════════════════════════════════════════════════════════

ORDER_SIGNALS = [
    "تأكد", "تأكدي", "مبروك", "ثبتنا", "سجلنا", "الطلب تسجل",
    "confirmed", "order placed", "commande", "confirmé",
    "واخا", "مزيان", "تسجل", "تسجل طلبك",
]
CANCEL_SIGNALS = [
    "ألغينا", "كنسلنا", "annulé", "cancelled", "التلغية",
    "ألغيت", "تلغى", "cancellation confirmed",
]


def extract_action(
    reply: str,
    history: List[HistoryMsg],
    products: List[Product],
) -> ActionPayload:
    reply_lower = reply.lower()

    has_order_signal = any(s.lower() in reply_lower for s in ORDER_SIGNALS)
    has_cancel_signal = any(s.lower() in reply_lower for s in CANCEL_SIGNALS)

    if not has_order_signal and not has_cancel_signal:
        return ActionPayload(type="none")

    if has_cancel_signal and not has_order_signal:
        return ActionPayload(type="cancel_order", customerPhone=extract_phone(history))

    # Full extraction via JSON-mode call
    history_text = "\n".join(
        f"[{m.role}]: {m.content}"
        for m in history[-25:]
        if not is_noise(m.content)
    )
    product_list = ", ".join(f"{p.name} ({p.price:.0f} DZD)" for p in products)

    extraction_prompt = f"""Extract order information from this conversation. Return JSON only.

Available products: {product_list}

Conversation:
{history_text}

Last agent reply:
{reply}

Return JSON (ONLY valid JSON, no prose):
{{
  "action_type": "create_order | cancel_order | none",
  "customerName": "string or null",
  "customerPhone": "string or null",
  "wilaya": "string or null",
  "address": "string or null",
  "shippingOption": "home_delivery | pickup | null",
  "items": [
    {{"productName": "string", "price": number, "quantity": number, "variant": "string or null"}}
  ]
}}

Rules:
- action_type = "create_order" ONLY when ALL are true:
  1. Customer has explicitly confirmed (سجل / واخا / confirm / oui / mzyan after summary)
  2. customerName is present
  3. customerPhone is a valid Algerian number (starts with 05/06/07)
  4. wilaya is present
  5. at least one item is present with a product name
- action_type = "cancel_order" ONLY when clear cancellation intent in recent messages
- Use actual product prices from the products list above
- If any required field is missing: action_type = "none"
"""

    try:
        resp = ai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": extraction_prompt},
                {"role": "user", "content": "Extract now."},
            ],
            max_tokens=350,
            temperature=0,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        action_type = data.get("action_type", "none")
        if action_type not in ("create_order", "cancel_order", "update_order"):
            action_type = "none"

        items = None
        raw_items = data.get("items") or []
        if raw_items and action_type == "create_order":
            items = [
                OrderItem(
                    productName=i.get("productName", ""),
                    price=float(i.get("price", 0)),
                    quantity=int(i.get("quantity", 1)),
                    variant=i.get("variant"),
                )
                for i in raw_items
                if i.get("productName")
            ]

        return ActionPayload(
            type=action_type,
            customerName=data.get("customerName"),
            customerPhone=data.get("customerPhone"),
            wilaya=data.get("wilaya"),
            address=data.get("address"),
            shippingOption=data.get("shippingOption") or "home_delivery",
            items=items,
        )

    except Exception as e:
        print(f"[Agent] Action extraction error: {e}")
        return ActionPayload(type="none")


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/chat", response_model=AgentResponse)
async def chat(
    payload: AgentPayload,
    x_agent_secret: Optional[str] = Header(None, alias="x-agent-secret"),
) -> AgentResponse:
    # Auth
    if AGENT_SECRET and x_agent_secret != AGENT_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # ── Resolve store context (handle legacy storeName fallback) ───────────────
    store = payload.store
    if not store.name and payload.storeName:
        store.name = payload.storeName

    products = payload.products or []
    history = payload.history or []

    # ── Resolve shipping (new format first, legacy shippingOptions fallback) ───
    shipping: Dict[str, Any] = dict(payload.shipping or {})
    if not shipping and payload.shippingOptions:
        wilaya_prices = payload.shippingOptions.get("wilayaPrices") or {}
        for w, p in wilaya_prices.items():
            if isinstance(p, dict):
                home = float(p.get("home", 0))
                shipping[w] = {"home": home, "bureau": max(400.0, home - 250)}

    flow_state = payload.aiFlowState
    legacy_prompt = payload.aiSystemPrompt

    # ── Build system prompt ────────────────────────────────────────────────────
    system_prompt = build_full_system_prompt(
        store=store,
        products=products,
        shipping=shipping,
        flow_state=flow_state,
        history_len=len(history),
        legacy_prompt=legacy_prompt,
    )

    # ── Build message list ─────────────────────────────────────────────────────
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    for msg in history:
        content = (msg.content or "").strip()
        if not content or is_noise(content):
            continue
        messages.append({"role": normalize_role(msg.role), "content": content})

    # ── Call OpenAI ────────────────────────────────────────────────────────────
    try:
        completion = ai.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=500,
            temperature=0.7,
        )
        reply = (completion.choices[0].message.content or "").strip()
    except Exception as e:
        print(f"[Agent] OpenAI error: {e}")
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")

    if not reply:
        raise HTTPException(status_code=500, detail="Empty reply from AI")

    # ── Detect language + extract action ──────────────────────────────────────
    detected_lang = payload.detectedLanguage or detect_language(history)
    action = extract_action(reply, history, products)

    return AgentResponse(reply=reply, detectedLanguage=detected_lang, action=action)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0", "model": "gpt-4o-mini"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
