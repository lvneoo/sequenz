import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/utils/db/db";
import { profileLibrary, profiles } from "@/utils/db/schema";

export function getProfileLibraryCacheTag(
  userId: string,
  profileSlug: string,
): string {
  return `profile-library:${userId}:${profileSlug}`;
}

export async function fetchProfileLibrary(userId: string, profileSlug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(getProfileLibraryCacheTag(userId, profileSlug));

  const items = await db
    .select({
      libraryId: profileLibrary.libraryId,
      imageUrl: profileLibrary.image_url,
      title: profileLibrary.title,
    })
    .from(profileLibrary)
    .innerJoin(profiles, eq(profileLibrary.profileId, profiles.profileId))
    .where(
      and(eq(profiles.userId, userId), eq(profiles.profileSlug, profileSlug)),
    )
    .orderBy(desc(profileLibrary.createdAt));

  return items.map((item) => ({
    libraryId: item.libraryId,
    imageUrl: item.imageUrl,
    title: item.title,
  }));
}

export type ProfileLibraryAsset = {
  libraryId: string;
  imageUrl: string;
  title: string;
  description: string | null;
  aiClassification: string | null;
};

export async function fetchProfileLibraryAssetsForSequence(
  profileId: string,
): Promise<ProfileLibraryAsset[]> {
  return db
    .select({
      libraryId: profileLibrary.libraryId,
      imageUrl: profileLibrary.image_url,
      title: profileLibrary.title,
      description: profileLibrary.description,
      aiClassification: profileLibrary.ai_classification,
    })
    .from(profileLibrary)
    .where(eq(profileLibrary.profileId, profileId))
    .orderBy(desc(profileLibrary.createdAt));
}
