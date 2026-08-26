export const PRO_PLAN_KEY = "pro" as const;

export const PRO_PLAN = {
  key: PRO_PLAN_KEY,
  name: "Pro",
  monthlyStoryLimit: 1000,
  maxConnectedAccounts: 5,
  features: [
    "story_sequences_1000",
    "connected_accounts_5",
    "ai_generation",
    "story_scheduling",
  ] as const,
};
