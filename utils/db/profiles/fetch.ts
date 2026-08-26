import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/utils/db/db";
import { profiles, type SelectProfile } from "@/utils/db/schema";

export function getProfilesCacheTag(userId: string): string {
  return `profiles:${userId}`;
}

export async function fetchProfiles(userId: string): Promise<SelectProfile[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(getProfilesCacheTag(userId));

  return db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(asc(profiles.createdAt));
}

export async function fetchProfileBySlug(
  userId: string,
  profileSlug: string,
): Promise<SelectProfile | undefined> {
  "use cache";
  cacheLife("minutes");
  cacheTag(getProfilesCacheTag(userId));

  const [profile] = await db
    .select()
    .from(profiles)
    .where(
      and(eq(profiles.profileSlug, profileSlug), eq(profiles.userId, userId)),
    )
    .limit(1);

  return profile;
}
