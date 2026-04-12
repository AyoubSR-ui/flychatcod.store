const PLAN_LIMITS: Record<string, { aiMessagesPerMonth: number }> = {
  free:    { aiMessagesPerMonth: 20 },
  starter: { aiMessagesPerMonth: 1500 },
  pro:     { aiMessagesPerMonth: 7000 },
  agency:  { aiMessagesPerMonth: 15000 },
};

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function planLimitError(type: string, plan: string, limit: string) {
  return {
    error: "plan_limit_reached",
    type,
    plan,
    limit,
    message: `You have reached the ${type} limit (${limit}) for the ${plan} plan. Please upgrade to continue.`,
  };
}
