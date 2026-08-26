export const STARTER_PLAN_KEY = "starter" as const;

export const STARTER_PLAN = {
  key: STARTER_PLAN_KEY,
  name: "Starter",
  monthlyStoryLimit: 100,
  maxConnectedAccounts: 1,
  features: [
    "story_sequences_100",
    "connected_accounts",
    "ai_generation",
    "story_scheduling",
  ] as const,
};