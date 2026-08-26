import "server-only";

import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/utils/db/db";
import { profileSequenceConfig, profiles } from "@/utils/db/schema";
import { getProfileSequencesCacheTag } from "@/utils/db/sequences/library/fetch";

type DeleteProfileSequenceInput = {
  userId: string;
  profileSlug: string;
  sequenceConfigId: string;
};

export async function deleteProfileSequence({
  userId,
  profileSlug,
  sequenceConfigId,
}: DeleteProfileSequenceInput) {
  const [profile] = await db
    .select({ profileId: profiles.profileId })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.profileSlug, profileSlug)))
    .limit(1);

  if (!profile) {
    return false;
  }

  const [deleted] = await db
    .delete(profileSequenceConfig)
    .where(
      and(
        eq(profileSequenceConfig.profileId, profile.profileId),
        eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId),
      ),
    )
    .returning({ sequenceConfigId: profileSequenceConfig.sequenceConfigId });

  if (!deleted) {
    return false;
  }

  revalidateTag(getProfileSequencesCacheTag(userId, profileSlug), {
    expire: 0,
  });
  return true;
}
