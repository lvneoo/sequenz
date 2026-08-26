"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Add01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  DashedLineCircleIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CreateSequenceConfigDialog } from "@/components/sequence/sequence-config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { completeProfileOnboardingStepAction } from "@/utils/db/profiles/actions";

type OnboardingProps = {
  onboardingAssetsComplete: boolean;
  onboardingSequenceComplete: boolean;
  profileSlug: string;
};

type StepId = "assets" | "sequence";

function getFirstIncompleteStepId(
  assetsComplete: boolean,
  sequenceComplete: boolean,
): StepId | null {
  if (!assetsComplete) {
    return "assets";
  }

  if (!sequenceComplete) {
    return "sequence";
  }

  return null;
}

function CircularProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <svg
      aria-hidden="true"
      className="-rotate-90"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <circle
        className="stroke-muted"
        cx="8"
        cy="8"
        fill="none"
        pathLength="100"
        r="6"
        strokeWidth="2"
      />
      <circle
        className="stroke-primary"
        cx="8"
        cy="8"
        fill="none"
        pathLength="100"
        r="6"
        strokeDasharray="100"
        strokeDashoffset={100 - progress}
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function StepIndicator({ completed }: { completed: boolean }) {
  if (completed) {
    return (
      <HugeiconsIcon
        aria-hidden="true"
        className="mt-0.5 text-primary"
        icon={Tick02Icon}
        size={16}
        strokeWidth={2}
      />
    );
  }

  return (
    <HugeiconsIcon
      aria-hidden="true"
      className="mt-0.5 text-muted-foreground/50"
      icon={DashedLineCircleIcon}
      size={16}
      strokeWidth={1.75}
    />
  );
}

export function Onboarding({
  onboardingAssetsComplete,
  onboardingSequenceComplete,
  profileSlug,
}: OnboardingProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [sequenceDialogOpen, setSequenceDialogOpen] = useState(false);
  const [pendingStepId, setPendingStepId] = useState<StepId | null>(null);
  const [assetsComplete, setAssetsComplete] = useState(
    onboardingAssetsComplete,
  );
  const [sequenceComplete, setSequenceComplete] = useState(
    onboardingSequenceComplete,
  );
  const [openStepId, setOpenStepId] = useState<StepId | null>(() =>
    getFirstIncompleteStepId(
      onboardingAssetsComplete,
      onboardingSequenceComplete,
    ),
  );

  const steps = [
    {
      actionLabel: "Open library",
      completed: assetsComplete,
      description:
        "Add photos or videos to your library so they are ready to use in sequences.",
      id: "assets" as const,
      title: "Upload assets",
    },
    {
      actionLabel: "Create sequence",
      completed: sequenceComplete,
      description:
        "Build your first sequence for this profile so you can start automating work.",
      id: "sequence" as const,
      title: "Create sequence",
    },
  ];

  const completedCount = steps.filter((step) => step.completed).length;

  if (assetsComplete && sequenceComplete && !sequenceDialogOpen) {
    return null;
  }

  function completeStep(step: StepId) {
    setPendingStepId(step);

    startTransition(async () => {
      try {
        await completeProfileOnboardingStepAction(profileSlug, step);
      } catch (error) {
        if (step === "assets") {
          setAssetsComplete(false);
        } else {
          setSequenceComplete(false);
        }

        console.error("Failed to complete onboarding step", error);
      } finally {
        setPendingStepId((current) => (current === step ? null : current));
      }
    });
  }

  function handleStepToggle(stepId: StepId) {
    setOpenStepId((current) => (current === stepId ? null : stepId));
  }

  function handleAssetsClick() {
    setAssetsComplete(true);
    setOpenStepId(getFirstIncompleteStepId(true, sequenceComplete));
    completeStep("assets");
    router.push(`/profiles/${profileSlug}/library?onboarding=assets`);
  }

  function handleSequenceClick() {
    if (!sequenceComplete) {
      setSequenceComplete(true);
      setOpenStepId(getFirstIncompleteStepId(assetsComplete, true));
      completeStep("sequence");
    }

    setSequenceDialogOpen(true);
  }

  if (dismissed) {
    return (
      <div className="fixed right-6 bottom-6 z-40 max-w-[calc(100vw-3rem)]">
        <div className="rounded-2xl border bg-popover/95 px-4 py-3 shadow-lg/5 backdrop-blur">
          <button
            className="mt-1 cursor-pointer font-medium text-primary text-sm underline-offset-4 hover:underline"
            onClick={() => setDismissed(false)}
            type="button"
          >
            Get Started
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed right-6 bottom-6 z-40 w-[min(28rem,calc(100vw-3rem))]">
        <div className="rounded-2xl border bg-popover/95 p-4 text-popover-foreground shadow-lg/5 backdrop-blur">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">
                Finish setting up this profile
              </h3>
              <p className="mt-1 text-muted-foreground text-sm">
                Complete the last few steps to get this workspace ready.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <CircularProgress completed={completedCount} total={steps.length} />
              <div className="min-w-fit text-muted-foreground text-sm">
                <span className="font-medium text-foreground">{completedCount}</span>
                {" / "}
                <span className="font-medium text-foreground">{steps.length}</span>
              </div>
              <Button
                aria-label="Dismiss onboarding"
                onClick={() => setDismissed(true)}
                size="icon-sm"
                variant="ghost"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Cancel01Icon}
                  size={16}
                  strokeWidth={2}
                />
              </Button>
            </div>
          </div>

          <div>
            {steps.map((step, index) => {
              const isOpen = openStepId === step.id;
              const previousStep = steps[index - 1];
              const showBorderTop =
                index > 0 &&
                !isOpen &&
                openStepId !== previousStep?.id;

              return (
                <div
                  className={cn("group", showBorderTop && "border-border border-t")}
                  key={step.id}
                >
                  <div
                    className={cn(
                      "overflow-hidden rounded-xl transition-colors",
                      isOpen && "border border-border bg-muted/60",
                    )}
                  >
                    <button
                      className="flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                      onClick={() => handleStepToggle(step.id)}
                      type="button"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <StepIndicator completed={step.completed} />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "font-medium",
                              step.completed ? "text-primary" : "text-foreground",
                            )}
                          >
                            {step.title}
                          </p>
                        </div>
                      </div>

                      {!isOpen ? (
                        <HugeiconsIcon
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-muted-foreground"
                          icon={ArrowRight01Icon}
                          size={16}
                          strokeWidth={2}
                        />
                      ) : null}
                    </button>

                    <div
                      aria-hidden={!isOpen}
                      className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                        isOpen
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0",
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="px-4 pb-4 pl-11">
                          <p className="max-w-sm text-balance text-muted-foreground text-sm">
                            {step.description}
                          </p>
                          <Button
                            className="mt-3"
                            loading={isPending && pendingStepId === step.id}
                            onClick={(event) => {
                              event.stopPropagation();

                              if (step.id === "assets") {
                                handleAssetsClick();
                                return;
                              }

                              handleSequenceClick();
                            }}
                            size="sm"
                            tabIndex={isOpen ? 0 : -1}
                          >
                            {step.actionLabel}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <CreateSequenceConfigDialog
        hideTrigger
        icon={Add01Icon}
        label="Create sequence"
        onOpenChange={setSequenceDialogOpen}
        open={sequenceDialogOpen}
        profileSlug={profileSlug}
      />
    </>
  );
}
