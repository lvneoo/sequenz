import { and, count, eq, gte, lt } from "drizzle-orm";
import { cache } from "react";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";

import { getCurrentUserId } from "@/utils/auth/user";
import { db } from "@/utils/db/db";
import { profiles, profileSequenceConfig, publishedSequence } from "@/utils/db/schema";
import { GROWTH_PLAN, GROWTH_PLAN_KEY } from "@/utils/billing/plans/growth";
import { PRO_PLAN, PRO_PLAN_KEY } from "@/utils/billing/plans/pro";
import { STARTER_PLAN, STARTER_PLAN_KEY } from "@/utils/billing/plans/starter";

export type BillingFeatureKey =
  | "story_sequences_100"
  | "story_sequences_300"
  | "story_sequences_1000"
  | "connected_accounts"
  | "connected_accounts_3"
  | "connected_accounts_5"
  | "ai_generation"
  | "story_scheduling";

export type BillingPlanKey =
  | typeof STARTER_PLAN_KEY
  | typeof GROWTH_PLAN_KEY
  | typeof PRO_PLAN_KEY;

export const NO_ENTITLEMENT_PLAN_KEY = "none" as const;
export const NO_ACTIVE_BILLING_ENTITLEMENT_MESSAGE = "No active billing entitlement";

export class BillingFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingFeatureError";
  }
}

export type BillingPlanDefinition = {
  key: BillingPlanKey;
  name: string;
  monthlyStoryLimit: number;
  maxConnectedAccounts: number;
  features: readonly BillingFeatureKey[];
};

export type ResolvedBillingPlanDefinition = BillingPlanDefinition | {
  key: typeof NO_ENTITLEMENT_PLAN_KEY;
  name: string;
  monthlyStoryLimit: number;
  maxConnectedAccounts: number;
  features: readonly BillingFeatureKey[];
};

export type BillingAccessSnapshot = {
  customerId: string;
  plan: ResolvedBillingPlanDefinition;
  featureCodes: Set<string>;
  activePlanCodes: BillingPlanKey[];
  currentMonthStoryCount: number;
  currentConnectedAccounts: number;
  usageWindowStart: Date;
  usageWindowEndExclusive: Date;
};

type BillingApiEntitlement = {
  feature_code: string;
  feature_name: string;
  entitlement_limit_max?: number;
};

const BILLING_PLANS = {
  starter: STARTER_PLAN,
  growth: GROWTH_PLAN,
  pro: PRO_PLAN,
} satisfies Record<BillingPlanKey, BillingPlanDefinition>;

const NO_ENTITLEMENT_PLAN: ResolvedBillingPlanDefinition = {
  key: NO_ENTITLEMENT_PLAN_KEY,
  name: "No entitlement",
  monthlyStoryLimit: 0,
  maxConnectedAccounts: 0,
  features: [],
};

const PLAN_ORDER: BillingPlanKey[] = ["pro", "growth", "starter"];

const normalize = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const normalizeFeatureCode = (code: string) => normalize(code).join("_");

const normalizePlanCode = (code?: string | null): BillingPlanKey | null => {
  const tokens = normalize(code);
  return PLAN_ORDER.find((key) => tokens.includes(key)) ?? null;
};

const getUsageWindow = (now = new Date()) => ({
  start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
});

function resolvePlan(
  featureCodes: Set<string>,
  entitlements: BillingApiEntitlement[],
  activePlanCodes: BillingPlanKey[],
): ResolvedBillingPlanDefinition {
  for (const key of PLAN_ORDER) {
    if (activePlanCodes.includes(key)) return BILLING_PLANS[key];
  }

  if (
    featureCodes.has("story_sequences_1000") ||
    featureCodes.has("connected_accounts_5")
  ) {
    return PRO_PLAN;
  }

  if (
    featureCodes.has("story_sequences_300") ||
    featureCodes.has("connected_accounts_3")
  ) {
    return GROWTH_PLAN;
  }

  if (
    featureCodes.has("story_sequences_100") ||
    featureCodes.has("connected_accounts")
  ) {
    return STARTER_PLAN;
  }

  let maxConnectedAccounts = 0;
  let maxStoryLimit = 0;

  for (const entitlement of entitlements) {
    const text = `${entitlement.feature_code} ${entitlement.feature_name}`.toLowerCase();
    const limit = entitlement.entitlement_limit_max ?? 0;
    if (!limit) continue;

    if (/connected[\s_-]*accounts?/.test(text)) {
      maxConnectedAccounts = Math.max(maxConnectedAccounts, limit);
    }

    if (
      /story[\s_-]*(sequences?|stories)/.test(text) ||
      /selling[\s_-]*stories/.test(text)
    ) {
      maxStoryLimit = Math.max(maxStoryLimit, limit);
    }
  }

  if (maxConnectedAccounts >= 5 || maxStoryLimit >= 1000) return PRO_PLAN;
  if (maxConnectedAccounts >= 3 || maxStoryLimit >= 300) return GROWTH_PLAN;
  if (maxConnectedAccounts >= 1 || maxStoryLimit >= 100) return STARTER_PLAN;

  return NO_ENTITLEMENT_PLAN;
}

async function getSessionBilling(customerId: string): Promise<{
  entitlements: BillingApiEntitlement[];
  activePlanCodes: BillingPlanKey[];
}> {
  try {
    if ((await getCurrentUserId()) !== customerId) {
      return { entitlements: [], activePlanCodes: [] };
    }

    const { getEntitlements } = getKindeServerSession();
    const result = await getEntitlements();
    const entitlements =
      result?.entitlements?.map((e) => ({
        feature_code: e.featureKey,
        feature_name: e.featureName,
        entitlement_limit_max: e.entitlementLimitMax,
      })) ?? [];

    const activePlanCodes =
      result?.plans
        ?.map((plan) => normalizePlanCode(plan.key))
        .filter((key): key is BillingPlanKey => key !== null) ?? [];

    return { entitlements, activePlanCodes };
  } catch {
    return { entitlements: [], activePlanCodes: [] };
  }
}
export const getBillingAccessForUser = cache(async (
  customerId: string,
): Promise<BillingAccessSnapshot> => {
  const { start, end } = getUsageWindow();
  const [{ entitlements, activePlanCodes }, storyUsage, accountUsage] = await Promise.all([
    getSessionBilling(customerId),
    db
      .select({ count: count() })
      .from(publishedSequence)
      .innerJoin(
        profileSequenceConfig,
        eq(profileSequenceConfig.sequenceConfigId, publishedSequence.sequenceConfigId),
      )
      .innerJoin(profiles, eq(profiles.profileId, profileSequenceConfig.profileId))
      .where(
        and(
          eq(profiles.userId, customerId),
          eq(publishedSequence.isPublished, true),
          gte(publishedSequence.publishedAt, start),
          lt(publishedSequence.publishedAt, end),
        ),
      ),
    db
      .select({ count: count() })
      .from(profiles)
      .where(eq(profiles.userId, customerId)),
  ]);

  const featureCodes = new Set(
    entitlements.map((e) => normalizeFeatureCode(e.feature_code)).filter(Boolean),
  );

  return {
    customerId,
    plan: resolvePlan(featureCodes, entitlements, activePlanCodes),
    featureCodes,
    activePlanCodes,
    currentMonthStoryCount: Number(storyUsage[0]?.count ?? 0),
    currentConnectedAccounts: Number(accountUsage[0]?.count ?? 0),
    usageWindowStart: start,
    usageWindowEndExclusive: end,
  };
});

export function isFeatureEnabled(
  snapshot: BillingAccessSnapshot,
  feature: BillingFeatureKey,
) {
  return (
    snapshot.plan.features.includes(feature) ||
    snapshot.featureCodes.has(normalizeFeatureCode(feature))
  );
}

export function getRemainingStoryQuota(snapshot: BillingAccessSnapshot) {
  return Math.max(0, snapshot.plan.monthlyStoryLimit - snapshot.currentMonthStoryCount);
}

export function canConnectAnotherAccount(snapshot: BillingAccessSnapshot) {
  return snapshot.currentConnectedAccounts <= snapshot.plan.maxConnectedAccounts;
}

export function assertFeatureEnabled(
  snapshot: BillingAccessSnapshot,
  feature: BillingFeatureKey,
  message?: string,
) {
  if (!isFeatureEnabled(snapshot, feature)) {
    throw new BillingFeatureError(
      message ?? `Feature not available on ${snapshot.plan.name} plan`,
    );
  }
}

export function assertHasStoryQuota(
  snapshot: BillingAccessSnapshot,
  requiredSteps: number,
) {
  if (snapshot.plan.key === NO_ENTITLEMENT_PLAN_KEY) {
    throw new Error(NO_ACTIVE_BILLING_ENTITLEMENT_MESSAGE);
  }

  if (getRemainingStoryQuota(snapshot) < requiredSteps) {
    throw new Error(
      `Monthly story limit reached: ${snapshot.currentMonthStoryCount}/${snapshot.plan.monthlyStoryLimit} used`,
    );
  }
}

export function assertConnectedAccountCapacity(snapshot: BillingAccessSnapshot) {
  if (snapshot.plan.key === NO_ENTITLEMENT_PLAN_KEY) {
    throw new Error(NO_ACTIVE_BILLING_ENTITLEMENT_MESSAGE);
  }

  if (!canConnectAnotherAccount(snapshot)) {
    throw new Error(
      `Connected account limit reached: ${snapshot.currentConnectedAccounts}/${snapshot.plan.maxConnectedAccounts}`,
    );
  }
}
