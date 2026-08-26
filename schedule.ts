import { CronTime } from "cron";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/utils/db/db";
import { profileSequenceConfig, publishedSequence } from "@/utils/db/schema";

export type ScheduledNextWorkflow = {
  nextWorkflowRunAt: Date;
  sequenceConfigId: string;
};

export async function scheduleNextWorkflow(
  sequenceConfigId: string,
): Promise<ScheduledNextWorkflow> {
  "use step";

  const [schedule] = await db
    .select({
      cronExpression: profileSequenceConfig.cronExpression,
      publishAt: publishedSequence.publishAt,
    })
    .from(profileSequenceConfig)
    .innerJoin(
      publishedSequence,
      eq(publishedSequence.sequenceConfigId, profileSequenceConfig.sequenceConfigId),
    )
    .where(
      and(
        eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId),
        eq(profileSequenceConfig.isActive, true),
        isNotNull(publishedSequence.publishAt),
      ),
    )
    .orderBy(desc(publishedSequence.publishAt), desc(publishedSequence.publishedAt))
    .limit(1);

  if (!schedule?.publishAt) {
    throw new Error(
      `No published sequence schedule found for sequenceConfigId ${sequenceConfigId}`,
    );
  }

  const nextWorkflowRunAt = new CronTime(
    schedule.cronExpression,
    "UTC",
  ).getNextDateFrom(schedule.publishAt, "UTC").toJSDate();

  await db
    .update(profileSequenceConfig)
    .set({ nextWorkflowRunAt })
    .where(eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId));

  return {
    nextWorkflowRunAt,
    sequenceConfigId,
  };
}
