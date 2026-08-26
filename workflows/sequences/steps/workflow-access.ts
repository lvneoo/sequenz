import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/utils/db/db";
import { profileSequenceConfig, publishedSequence } from "@/utils/db/schema";

export type WorkflowBillingInput = {
  plan: {
    key: string;
    name: string;
    monthlyStoryLimit: number;
    features: readonly string[];
  };
  featureCodes: string[];
};

export type WorkflowBillingAccess = WorkflowBillingInput & {
  currentMonthStoryCount: number;
};

function normalizeFeatureCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("_");
}

function getBillingUsageWindowStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function getBillingUsageWindowEndExclusive(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function getWorkflowBillingAccess(
  profileIds: string[],
  billing: WorkflowBillingInput,
): Promise<WorkflowBillingAccess> {
  "use step";

  const usageWindowStart = getBillingUsageWindowStart();
  const usageWindowEndExclusive = getBillingUsageWindowEndExclusive();
  if (profileIds.length === 0) {
    return {
      ...billing,
      currentMonthStoryCount: 0,
    };
  }

  const sequenceConfigs = await db
    .select({
      sequenceConfigId: profileSequenceConfig.sequenceConfigId,
    })
    .from(profileSequenceConfig)
    .where(
      inArray(
        profileSequenceConfig.profileId,
        profileIds,
      ),
    );

  if (sequenceConfigs.length === 0) {
    return {
      ...billing,
      currentMonthStoryCount: 0,
    };
  }

  const [storyUsage] = await db
    .select({ count: count() })
    .from(publishedSequence)
    .where(
      and(
        inArray(
          publishedSequence.sequenceConfigId,
          sequenceConfigs.map((config) => config.sequenceConfigId),
        ),
        eq(publishedSequence.isPublished, true),
        gte(publishedSequence.publishedAt, usageWindowStart),
        lt(publishedSequence.publishedAt, usageWindowEndExclusive),
      ),
    );

  return {
    ...billing,
    currentMonthStoryCount: Number(storyUsage?.count ?? 0),
  };
}

export function assertWorkflowFeatureEnabled(
  billing: WorkflowBillingInput,
  feature: string,
  message?: string,
) {
  const normalized = normalizeFeatureCode(feature);

  if (
    billing.plan.features.includes(feature) ||
    billing.featureCodes.some((code) => normalizeFeatureCode(code) === normalized)
  ) {
    return;
  }

  throw new Error(message ?? `Feature not available on ${billing.plan.name} plan`);
}

export function getRemainingWorkflowStoryQuota(
  billing: WorkflowBillingAccess,
): number {
  return Math.max(0, billing.plan.monthlyStoryLimit - billing.currentMonthStoryCount);
}
