import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SequenceDescriptionEditor } from "@/components/sequence/sequence-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import { fetchProfileSequenceConfigById } from "@/utils/db/sequences/config/fetch";

type PageProps = {
  params: Promise<{ slug: string; id: string }>;
};

export default function Page({ params }: PageProps) {
  return (
    <Suspense fallback={<SequencePageSkeleton />}>
      <SequencePageContent params={params} />
    </Suspense>
  );
}

async function SequencePageContent({ params }: PageProps) {
  const [{ slug, id }, userId] = await Promise.all([
    params,
    requireAuthenticatedUserId(),
  ]);

  const config = await fetchProfileSequenceConfigById(userId, slug, id);

  if (!config) {
    notFound();
  }

  return (
    <SequenceDescriptionEditor
      profileSlug={slug}
      sequenceConfigId={config.sequenceConfigId}
      title={config.name}
      sequenceType={config.sequenceType}
      cta={config.cta}
      isActive={config.isActive}
      cronExpression={config.cronExpression}
      nextWorkflowRunAt={config.nextWorkflowRunAt.toISOString()}
      productUrl={config.productUrl}
      initialDescription={config.description ?? ""}
    />
  );
}

function SequencePageSkeleton() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="w-full px-6 py-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-6 rounded-md" />
          <Skeleton className="h-12 w-56 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-full rounded-md" />
          </div>

          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-9 w-16 rounded-md" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-4 px-6 py-6">
          <Skeleton className="h-8 w-1/3 rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-5/6 rounded-md" />
          <Skeleton className="h-4 w-11/12 rounded-md" />
          <Skeleton className="h-4 w-2/3 rounded-md" />
        </div>
      </div>
    </div>
  );
}
