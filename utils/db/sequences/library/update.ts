import "server-only";

import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/utils/db/db";
import { profileSequenceConfig, profiles } from "@/utils/db/schema";
import { getProfileSequenceConfigCacheTag } from "@/utils/db/sequences/config/fetch";
import { getProfileSequencesCacheTag } from "@/utils/db/sequences/library/fetch";

type UpdateProfileSequenceInput = {
  userId: string;
  profileSlug: string;
  sequenceConfigId: string;
  updates: Partial<typeof profileSequenceConfig.$inferInsert>;
};

export async function updateProfileSequence({
  userId,
  profileSlug,
  sequenceConfigId,
  updates,
}: UpdateProfileSequenceInput) {
  const [profile] = await db
    .select({ profileId: profiles.profileId })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.profileSlug, profileSlug)))
    .limit(1);

  if (!profile) {
    return false;
  }

  const [updated] = await db
    .update(profileSequenceConfig)
    .set(updates)
    .where(
      and(
        eq(profileSequenceConfig.profileId, profile.profileId),
        eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId),
      ),
    )
    .returning({ sequenceConfigId: profileSequenceConfig.sequenceConfigId });

  if (!updated) {
    return false;
  }

  revalidateTag(getProfileSequencesCacheTag(userId, profileSlug), {
    expire: 0,
  });
  revalidateTag(
    getProfileSequenceConfigCacheTag(userId, profileSlug, sequenceConfigId),
    { expire: 0 },
  );

  return true;
}
