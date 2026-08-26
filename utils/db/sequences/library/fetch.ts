import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/utils/db/db";
import { profileSequenceConfig, profiles } from "@/utils/db/schema";

export function getProfileSequencesCacheTag(
  userId: string,
  profileSlug: string,
): string {
  return `profile-sequences:${userId}:${profileSlug}`;
}

export type ProfileSequenceListItem = {
  sequenceConfigId: string;
  name: string;
  sequenceType: typeof profileSequenceConfig.$inferSelect.sequenceType;
  cta: string;
  productUrl: string;
  isActive: boolean;
  cronExpression: string;
  nextWorkflowRunAt: Date;
};

export async function fetchProfileSequences(
  userId: string,
  profileSlug: string,
): Promise<ProfileSequenceListItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(getProfileSequencesCacheTag(userId, profileSlug));

  return db
    .select({
      sequenceConfigId: profileSequenceConfig.sequenceConfigId,
      name: profileSequenceConfig.name,
      sequenceType: profileSequenceConfig.sequenceType,
      cta: profileSequenceConfig.cta,
      productUrl: profileSequenceConfig.productUrl,
      isActive: profileSequenceConfig.isActive,
      cronExpression: profileSequenceConfig.cronExpression,
      nextWorkflowRunAt: profileSequenceConfig.nextWorkflowRunAt,
    })
    .from(profileSequenceConfig)
    .innerJoin(profiles, eq(profileSequenceConfig.profileId, profiles.profileId))
    .where(
      and(eq(profiles.userId, userId), eq(profiles.profileSlug, profileSlug)),
    )
    .orderBy(
      asc(profileSequenceConfig.sortOrder),
      asc(profileSequenceConfig.createdAt),
    );
}
