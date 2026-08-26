import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { start } from "workflow/api";
import { getCurrentUserId } from "@/utils/auth/user";
import {
  BillingFeatureError,
  assertFeatureEnabled,
  getBillingAccessForUser,
  getRemainingStoryQuota,
} from "@/utils/billing/entitlements";
import { db } from "@/utils/db/db";
import { profiles } from "@/utils/db/schema";
import { sequenceWorkflow } from "@/workflows/sequences/workflow";

const requestSchema = z.object({
  profileSlug: z.string().min(1),
  sequenceConfigId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    let userId: string | null = null;
    try {
      userId = await getCurrentUserId();
    } catch (_error) {
      void _error;
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedBody = requestSchema.safeParse(await request.json());

    if (!parsedBody.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const billing = await getBillingAccessForUser(userId);
    assertFeatureEnabled(
      billing,
      "story_scheduling",
      "Recurring Story Automation is not included in your active billing plan",
    );

    if (getRemainingStoryQuota(billing) <= 0) {
      return Response.json(
        {
          error: `Monthly story limit reached: ${billing.currentMonthStoryCount}/${billing.plan.monthlyStoryLimit} used`,
        },
        { status: 402 },
      );
    }

    const [profile, userProfiles] = await Promise.all([
      db
        .select({
          profileId: profiles.profileId,
        })
        .from(profiles)
        .where(
          and(
            eq(profiles.userId, userId),
            eq(profiles.profileSlug, parsedBody.data.profileSlug),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select({
          profileId: profiles.profileId,
        })
        .from(profiles)
        .where(eq(profiles.userId, userId)),
    ]);

    if (!profile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    const run = await start(sequenceWorkflow, [
      {
        billing: {
          plan: billing.plan,
          featureCodes: [...billing.featureCodes],
        },
        profileId: profile.profileId,
        profileIds: userProfiles.map((profile) => profile.profileId),
        sequenceConfigId: parsedBody.data.sequenceConfigId,
      },
    ]);

    return Response.json(
      {
        ok: true,
        runId: run.runId,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof BillingFeatureError) {
      return Response.json({ error: error.message }, { status: 402 });
    }

    console.error("Failed to start sequence workflow", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
