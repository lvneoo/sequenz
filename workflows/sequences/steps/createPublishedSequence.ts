import { db } from "@/utils/db/db";
import { publishedSequence } from "@/utils/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { SequenceGenerationContext } from "@/workflows/sequences/steps/pollContext";

export type PreparedSequenceContext = SequenceGenerationContext & {
  publishedSequenceId: string;
};

export async function createPublishedSequence(
  context: SequenceGenerationContext,
  publishAt: Date,
): Promise<PreparedSequenceContext> {
  "use step";

  const [existing] = await db
    .select({
      publishedSequenceId: publishedSequence.publishedSequenceId,
    })
    .from(publishedSequence)
    .where(
      and(
        eq(publishedSequence.sequenceConfigId, context.sequenceConfigId),
        eq(publishedSequence.isPublished, false),
        eq(publishedSequence.publishAt, publishAt),
        isNull(publishedSequence.publishedAt),
      ),
    )
    .limit(1);

  if (existing?.publishedSequenceId) {
    return {
      ...context,
      publishedSequenceId: existing.publishedSequenceId,
    };
  }

  const [created] = await db
    .insert(publishedSequence)
    .values({
      sequenceConfigId: context.sequenceConfigId,
      isPublished: false,
      publishAt,
    })
    .returning({
      publishedSequenceId: publishedSequence.publishedSequenceId,
    });

  if (!created?.publishedSequenceId) {
    throw new Error("Failed to create published sequence");
  }

  return {
    ...context,
    publishedSequenceId: created.publishedSequenceId,
  };
}
