export type IntentLevel = 'low' | 'medium' | 'high';
export type LeadStage = 'interested' | 'engaged' | 'qualified_lead' | 'order_confirmed';

export interface ConversationState {
  hasWilaya: boolean;
  hasPhone: boolean;
  hasSize: boolean;
  hasColor: boolean;
  hasDeliveryType: boolean;
  hasProduct: boolean;
  askedAboutDelivery: boolean;
  askedAboutTotal: boolean;
  confirmedOrder: boolean;
  messageCount: number;
}

export function detectLeadIntent(state: ConversationState): IntentLevel {
  // HIGH INTENT — serious buyer signals
  const highSignals = [
    state.hasWilaya,
    state.hasPhone,
    state.hasSize && state.hasColor,
    state.askedAboutTotal,
    state.confirmedOrder,
  ].filter(Boolean).length;

  if (highSignals >= 2 || state.confirmedOrder) return 'high';

  // MEDIUM INTENT — engaged, asking specific questions
  const mediumSignals = [
    state.askedAboutDelivery,
    state.hasWilaya,
    state.hasSize,
    state.hasColor,
    state.hasDeliveryType,
  ].filter(Boolean).length;

  if (mediumSignals >= 1) return 'medium';

  // LOW INTENT — browsing
  return 'low';
}

export function intentToLeadStage(intent: IntentLevel, allFieldsPresent: boolean): LeadStage {
  if (allFieldsPresent) return 'qualified_lead';
  if (intent === 'high') return 'qualified_lead';
  if (intent === 'medium') return 'engaged';
  return 'interested';
}

export function extractConversationState(messages: any[]): ConversationState {
  const allText = messages.map(m => m.content || '').join(' ').toLowerCase();
  const customerText = messages
    .filter(m => m.sender === 'customer')
    .map(m => m.content || '')
    .join(' ')
    .toLowerCase();

  // Wilaya detection
  const algeriaCities = [
    'alger', 'oran', 'constantine', 'tlemcen', 'annaba', 'blida', 'sétif', 'batna',
    'skikda', 'biskra', 'تلمسان', 'الجزائر', 'وهران', 'قسنطينة', 'ولاية', 'wilaya',
  ];
  const hasWilaya = algeriaCities.some(c => customerText.includes(c));

  // Phone detection
  const phoneRegex = /0[567]\d{8}|0[234]\d{7}|\+213\d{9}/;
  const hasPhone = phoneRegex.test(customerText);

  // Size detection
  const sizeRegex = /\b(xs|s\b|m\b|l\b|xl|xxl|2xl|3xl|taille|لطاي|طاي|مقاس|\d{2})\b/i;
  const hasSize = sizeRegex.test(customerText);

  // Color detection
  const colorWords = [
    'rouge', 'bleu', 'vert', 'noir', 'blanc', 'beige', 'marron', 'rose',
    'أحمر', 'أزرق', 'أخضر', 'أبيض', 'بيج', 'مارو', 'عسلي', 'color', 'couleur', 'لون', 'كولار',
  ];
  const hasColor = colorWords.some(c => customerText.includes(c));

  // Delivery type
  const hasDeliveryType = /\b(dar|دار|لدار|للدار|bureau|بيرو|مكتب|domicile|livraison|توصيل)\b/i.test(customerText);

  // Delivery intent
  const askedAboutDelivery = /\b(twsil|tawsil|توصيل|livraison|bureau|dar|شحال توصيل|كم التوصيل)\b/i.test(customerText);

  // Total price with delivery
  const askedAboutTotal = /\b(total|كامل|كل شيء|مجموع|tout|prix.*livraison|مع التوصيل)\b/i.test(customerText);

  // Order confirmation — check last 2 customer messages
  const confirmedOrder = /\b(oui|wah|ih|واه|نعم|okayy|صح|كلشي صح|confirme|نأكد|تأكيد)\b/i.test(
    messages
      .filter(m => m.sender === 'customer')
      .slice(-2)
      .map(m => m.content || '')
      .join(' ')
  );

  const hasProduct =
    allText.includes('jalaba') ||
    allText.includes('جلابة') ||
    allText.includes('3500') ||
    allText.includes('prix');

  return {
    hasWilaya,
    hasPhone,
    hasSize,
    hasColor,
    hasDeliveryType,
    hasProduct,
    askedAboutDelivery,
    askedAboutTotal,
    confirmedOrder,
    messageCount: messages.length,
  };
}
