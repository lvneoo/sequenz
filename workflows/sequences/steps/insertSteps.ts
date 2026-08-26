import { sql } from "drizzle-orm";
import { db } from "@/utils/db/db";
import { sequenceStep } from "@/utils/db/schema";
import type { PreparedSequenceContext } from "@/workflows/sequences/steps/createPublishedSequence";
import type { PreparedSequenceStep } from "@/workflows/sequences/steps/processAssets";

export type InsertedSequenceResult = {
  publishedSequenceId: string;
  sequenceConfigId: string;
  stepCount: number;
};

export async function insertSteps(
  context: PreparedSequenceContext,
  preparedSteps: PreparedSequenceStep[],
): Promise<InsertedSequenceResult> {
  "use step";

  const insertedSteps = await db
    .insert(sequenceStep)
    .values(
      preparedSteps.map((step) => ({
        publishedSequenceId: context.publishedSequenceId,
        sequenceConfigId: context.sequenceConfigId,
        stepNumber: step.stepNumber,
        content: step.content,
        overlayText: step.overlayText,
        image_url: step.imageUrl,
      })),
    )
    .onConflictDoUpdate({
      target: [sequenceStep.publishedSequenceId, sequenceStep.stepNumber],
      set: {
        content: sql`excluded.content`,
        overlayText: sql`excluded.overlay_text`,
        image_url: sql`excluded.image_url`,
      },
    })
    .returning({
      sequenceStepId: sequenceStep.sequenceStepId,
    });

  return {
    publishedSequenceId: context.publishedSequenceId,
    sequenceConfigId: context.sequenceConfigId,
    stepCount: insertedSteps.length,
  };
}
