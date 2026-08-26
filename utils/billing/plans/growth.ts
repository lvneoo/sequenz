export const GROWTH_PLAN_KEY = "growth" as const;

export const GROWTH_PLAN = {
  key: GROWTH_PLAN_KEY,
  name: "Growth",
  monthlyStoryLimit: 300,
  maxConnectedAccounts: 3,
  features: [
    "story_sequences_300",
    "connected_accounts_3",
    "ai_generation",
    "story_scheduling",
  ] as const,
};
