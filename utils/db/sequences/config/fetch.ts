import "server-only";

import { and, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/utils/db/db";
import { profileSequenceConfig, profiles } from "@/utils/db/schema";

export function getProfileSequenceConfigCacheTag(
  userId: string,
  profileSlug: string,
  sequenceConfigId: string,
): string {
  return `profile-sequence-config:${userId}:${profileSlug}:${sequenceConfigId}`;
}

export type ProfileSequenceConfigDetails = {
  sequenceConfigId: string;
  cronExpression: string;
  isActive: boolean;
  name: string;
  nextWorkflowRunAt: Date;
  sequenceType: typeof profileSequenceConfig.$inferSelect.sequenceType;
  cta: string;
  productUrl: string;
  description: string | null;
};

export async function fetchProfileSequenceConfigById(
  userId: string,
  profileSlug: string,
  sequenceConfigId: string,
): Promise<ProfileSequenceConfigDetails | undefined> {
  "use cache";
  cacheLife("minutes");
  cacheTag(getProfileSequenceConfigCacheTag(userId, profileSlug, sequenceConfigId));

  const [config] = await db
    .select({
      cronExpression: profileSequenceConfig.cronExpression,
      isActive: profileSequenceConfig.isActive,
      sequenceConfigId: profileSequenceConfig.sequenceConfigId,
      name: profileSequenceConfig.name,
      nextWorkflowRunAt: profileSequenceConfig.nextWorkflowRunAt,
      sequenceType: profileSequenceConfig.sequenceType,
      cta: profileSequenceConfig.cta,
      productUrl: profileSequenceConfig.productUrl,
      description: profileSequenceConfig.description,
    })
    .from(profileSequenceConfig)
    .innerJoin(profiles, eq(profileSequenceConfig.profileId, profiles.profileId))
    .where(
      and(
        eq(profiles.userId, userId),
        eq(profiles.profileSlug, profileSlug),
        eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId),
      ),
    )
    .limit(1);

  return config;
}
