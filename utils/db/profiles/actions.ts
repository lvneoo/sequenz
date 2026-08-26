"use server";

import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import { deleteProfile } from "@/utils/db/profiles/delete";
import { getProfilesCacheTag } from "@/utils/db/profiles/fetch";
import { db } from "@/utils/db/db";
import { profiles } from "@/utils/db/schema";

const INSTAGRAM_MANAGE_ACCESS_URL =
  "https://www.instagram.com/accounts/manage_access/";

export async function deleteProfileAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  const profileSlug = formData.get("profileSlug");

  if (typeof profileSlug !== "string" || profileSlug.length === 0) {
    throw new Error("Missing profile slug");
  }

  const deleted = await deleteProfile({ userId, profileSlug });

  if (!deleted) {
    throw new Error("Profile not found");
  }

  redirect(INSTAGRAM_MANAGE_ACCESS_URL);
}

export async function completeProfileOnboardingStepAction(
  profileSlug: string,
  step: "assets" | "sequence",
) {
  const userId = await requireAuthenticatedUserId();

  if (!profileSlug) {
    throw new Error("Missing profile slug");
  }

  const [profile] = await db
    .update(profiles)
    .set(
      step === "assets"
        ? { onboardingAssetsComplete: true }
        : { onboardingSequenceComplete: true },
    )
    .where(
      and(eq(profiles.profileSlug, profileSlug), eq(profiles.userId, userId)),
    )
    .returning({ profileId: profiles.profileId });

  if (!profile) {
    throw new Error("Profile not found");
  }

  revalidateTag(getProfilesCacheTag(userId), "max");
}
