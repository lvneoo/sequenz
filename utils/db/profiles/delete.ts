import "server-only";

import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/utils/db/db";
import { profiles } from "@/utils/db/schema";
import { getProfilesCacheTag } from "@/utils/db/profiles/fetch";

type DeleteProfileInput = {
  userId: string;
  profileSlug: string;
};

export async function deleteProfile({
  userId,
  profileSlug,
}: DeleteProfileInput) {
  const [deleted] = await db
    .delete(profiles)
    .where(
      and(eq(profiles.userId, userId), eq(profiles.profileSlug, profileSlug)),
    )
    .returning({ profileId: profiles.profileId });

  if (!deleted) {
    return false;
  }

  revalidateTag(getProfilesCacheTag(userId), "max");
  return true;
}
