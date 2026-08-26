import { and, asc, desc, eq } from "drizzle-orm";
import type { WorkflowBillingInput } from "@/workflows/sequences/steps/workflow-access";
import { db } from "@/utils/db/db";
import { profileSequenceConfig } from "@/utils/db/schema";

export type SequenceGenerationContext = {
  profileId: string;
  sequenceConfigId: string;
  name: string;
  cta: string;
  productUrl: string;
  description: string | null;
  aiBrandGuidelines: string | null;
  nextWorkflowRunAt: Date;
};

export type PollContextInput = {
  profileId: string;
  profileIds: string[];
  sequenceConfigId?: string;
  billing: WorkflowBillingInput;
};

export async function pollContext({
  profileId,
  sequenceConfigId,
}: PollContextInput): Promise<SequenceGenerationContext> {

  const conditions = sequenceConfigId
    ? and(
        eq(profileSequenceConfig.profileId, profileId),
        eq(profileSequenceConfig.isActive, true),
        eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId),
      )
    : and(
        eq(profileSequenceConfig.profileId, profileId),
        eq(profileSequenceConfig.isActive, true),
      );

  const [config] = await db
    .select({
      profileId: profileSequenceConfig.profileId,
      sequenceConfigId: profileSequenceConfig.sequenceConfigId,
      name: profileSequenceConfig.name,
      cta: profileSequenceConfig.cta,
      productUrl: profileSequenceConfig.productUrl,
      description: profileSequenceConfig.description,
      aiBrandGuidelines: profileSequenceConfig.aiBrandGuidelines,
      nextWorkflowRunAt: profileSequenceConfig.nextWorkflowRunAt,
    })
    .from(profileSequenceConfig)
    .where(conditions)
    .orderBy(
      asc(profileSequenceConfig.sortOrder),
      desc(profileSequenceConfig.createdAt),
    )
    .limit(1);

  if (!config) {
    throw new Error(
      sequenceConfigId
        ? `No active sequence config found for profile ${profileId} and sequenceConfigId ${sequenceConfigId}`
        : `No active sequence config found for profile ${profileId}`,
    );
  }

  return config;
}
