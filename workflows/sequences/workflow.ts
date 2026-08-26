import { sleep } from "workflow";
import {
  assertWorkflowFeatureEnabled,
  getRemainingWorkflowStoryQuota,
  getWorkflowBillingAccess,
} from "@/workflows/sequences/steps/workflow-access";
import { createPublishedSequence } from "./steps/createPublishedSequence";
import { generateContent } from "./steps/generateContent";
import { insertSteps } from "./steps/insertSteps";
import { pollContext, type PollContextInput } from "./steps/pollContext";
import { processAssetsForSequence } from "./steps/processAssets";
import { publishPost } from "./steps/publishPost";
import { scheduleNextWorkflow } from "./steps/scheduleNextWorkflow";

export async function sequenceWorkflow(
  input: PollContextInput,
): Promise<never> {
  "use workflow";

  let runImmediately = true;

  while (true) {
    const context = await pollContext(input);
    const billing = await getWorkflowBillingAccess(input.profileIds, input.billing);

    assertWorkflowFeatureEnabled(
      input.billing,
      "story_scheduling",
      "Recurring Story Automation is not included in your active billing plan",
    );

    if (getRemainingWorkflowStoryQuota(billing) <= 0) {
      throw new Error(
        `Monthly story limit reached: ${billing.currentMonthStoryCount}/${billing.plan.monthlyStoryLimit} used`,
      );
    }

    const publishAt = runImmediately ? new Date() : context.nextWorkflowRunAt;
    const preparedContext = await createPublishedSequence(context, publishAt);
    const generatedSequence = await generateContent(preparedContext);
    const preparedSteps = await processAssetsForSequence(
      preparedContext,
      generatedSequence,
    );
    const inserted = await insertSteps(
      preparedContext,
      preparedSteps,
    );
    await publishPost(inserted);

    const nextRun = await scheduleNextWorkflow(context.sequenceConfigId);

    await sleep(nextRun.nextWorkflowRunAt);
    runImmediately = false;
  }
}
