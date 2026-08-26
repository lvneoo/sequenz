import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import {
  Add01Icon,
  Image01Icon,
  CarouselHorizontalIcon
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { CreateSequenceConfigDialog } from "@/components/sequence/sequence-config";
import {
  SequenceCardMoreDetails,
  SequenceCardActions,
} from "@/components/sequence/sequence-card-controls";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import {
  fetchProfileSequences,
  type ProfileSequenceListItem,
} from "@/utils/db/sequences/library/fetch";
import { type PageProps } from "@/utils/types";

const cardClassName =
  "flex h-full w-full flex-col gap-5 rounded-2xl border p-5 transition-colors hover:bg-muted";

const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export default function SequencesPage({ params }: PageProps) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-6 p-6">
      <Suspense fallback={<SequencesGridSkeleton />}>
        <SequencesGridContent params={params} />
      </Suspense>
    </div>
  );
}

async function SequencesGridContent({
  params,
}: {
  params: PageProps["params"];
}) {
  const [{ slug }, userId] = await Promise.all([
    params,
    requireAuthenticatedUserId(),
  ]);

  return <SequencesGrid profileSlug={slug} userId={userId} />;
}

async function SequencesGrid({
  profileSlug,
  userId,
}: {
  profileSlug: string;
  userId: string;
}) {
  const sequences = await fetchProfileSequences(userId, profileSlug);

  if (sequences.length === 0) {
    return (
      <Empty className="min-h-[calc(100dvh-16rem)] justify-center py-16 md:py-24">
        <EmptyHeader className="max-w-xl">
          <EmptyMedia className="[&_svg]:size-6" variant="icon">
            <HugeiconsIcon
              icon={CarouselHorizontalIcon}
              size={24}
              strokeWidth={2}
            />
          </EmptyMedia>
          <EmptyTitle className="text-3xl tracking-tight">
            No sequences yet
          </EmptyTitle>
          <EmptyDescription className="text-base">
            Create your first sequence to turn library assets into a repeatable
            posting workflow for this profile.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-xl">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <CreateSequenceConfigDialog
              icon={Add01Icon}
              label="Create sequence"
              profileSlug={profileSlug}
              trigger={<Button size="lg" variant="ghost">Create sequence</Button>}
            />
            <Button
              render={<Link href={`/profiles/${profileSlug}/library`} />}
              size="lg"
              variant="outline"
            >
              <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={2} />
              Open library
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sequences.map((sequence) => (
        <SequenceCard
          key={sequence.sequenceConfigId}
          profileSlug={profileSlug}
          sequence={sequence}
        />
      ))}
    </div>
  );
}

function SequenceCard({
  profileSlug,
  sequence,
}: {
  profileSlug: string;
  sequence: ProfileSequenceListItem;
}) {
  const sequenceHref = `/profiles/${profileSlug}/sequences/${sequence.sequenceConfigId}`;

  return (
    <div className={`${cardClassName} relative`}>
      <Link
        aria-label={`Open ${sequence.name}`}
        className="absolute inset-0 rounded-2xl"
        href={sequenceHref}
      />
      <div className="relative z-10 flex h-full flex-col gap-5 pointer-events-none">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-2xl font-semibold leading-tight tracking-tight">
            {sequence.name}
          </h2>
          <Badge
            className="shrink-0"
            variant={sequence.isActive ? "success" : "warning"}
          >
            {sequence.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>

        <div className="grid flex-1 gap-3 text-sm md:grid-cols-2">
          <SequenceCardField
            label="CTA"
            value={sequence.cta}
            valueClassName="text-xl font-semibold tracking-tight"
          />
          <SequenceCardField
            label="Type"
            value={sequence.sequenceType ?? "Client wins"}
            valueClassName="text-xl font-semibold tracking-tight"
          />
        </div>

        <Separator />
        <div className="flex items-center justify-between gap-3">
          <SequenceCardField
            label="Next Post"
            value={formatNextWorkflowRun(sequence.nextWorkflowRunAt)}
            valueClassName="text-sm tracking-tight"
          />
          <div className="pointer-events-auto flex items-center gap-2">
            <SequenceCardMoreDetails
              productUrl={sequence.productUrl}
              schedule={formatReadableSchedule(sequence.cronExpression)}
            />
            <SequenceCardActions
              cta={sequence.cta}
              cronExpression={sequence.cronExpression}
              isActive={sequence.isActive}
              name={sequence.name}
              productUrl={sequence.productUrl}
              profileSlug={profileSlug}
              sequenceConfigId={sequence.sequenceConfigId}
              sequenceType={sequence.sequenceType ?? "Client wins"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SequenceCardField({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={["min-w-0 rounded-xl p-3", className]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div
        className={["mt-1 text-sm text-foreground", valueClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {typeof value === "string" ? (
          <p className="break-all">{value}</p>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function formatReadableSchedule(cronExpression: string) {
  const [second, minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression
    .trim()
    .split(/\s+/);

  if (
    second !== "0" ||
    dayOfMonth !== "*" ||
    month !== "*" ||
    !minute ||
    !hour ||
    !dayOfWeek
  ) {
    return cronExpression;
  }

  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const weekdayNumbers = dayOfWeek
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

  if (
    !Number.isInteger(hourNumber) ||
    !Number.isInteger(minuteNumber) ||
    weekdayNumbers.length === 0
  ) {
    return cronExpression;
  }

  const weekdays = weekdayNumbers
    .map((value) => weekdayNames[value])
    .filter(Boolean);

  const weekdayLabel =
    weekdays.length === weekdayNames.length ? "Every day" : weekdays.join(", ");
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 2, hourNumber, minuteNumber)));

  return `${weekdayLabel} at ${timeLabel} UTC`;
}

function formatNextWorkflowRun(nextWorkflowRunAt: Date) {
  if (Number.isNaN(nextWorkflowRunAt.getTime())) {
    return nextWorkflowRunAt.toISOString();
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(nextWorkflowRunAt);
}

function SequencesGridSkeleton() {
  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} aria-hidden="true" className={cardClassName}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 flex-1 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>

          <div className="grid flex-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 3 }).map((_, fieldIndex) => (
              <div
                key={fieldIndex}
                className="rounded-xl border bg-muted/30 p-3"
              >
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton
                  className={`mt-2 rounded-md ${
                    fieldIndex < 2 ? "h-8 w-32" : "h-6 w-full"
                  }`}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
