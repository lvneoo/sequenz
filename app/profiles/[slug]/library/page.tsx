import { Suspense } from "react";
import { Image01Icon, CarouselHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import { UploadButton } from "@/components/upload-button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { type PageProps } from "@/utils/types";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fetchProfileLibrary } from "@/utils/db/library/fetch";

export default function LibraryPage({ params }: PageProps) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-6 p-6">
      <Suspense fallback={<LibraryGridSkeleton />}>
        <LibraryGridContent params={params} />
      </Suspense>
    </div>
  );
}

async function LibraryGridContent({
  params,
}: {
  params: PageProps["params"];
}) {
  const [{ slug }, userId] = await Promise.all([
    params,
    requireAuthenticatedUserId(),
  ]);

  return <LibraryGrid profileSlug={slug} userId={userId} />;
}

async function LibraryGrid({
  profileSlug,
  userId,
}: {
  profileSlug: string;
  userId: string;
}) {
  const items = await fetchProfileLibrary(userId, profileSlug);

  if (items.length === 0) {
    return (
      <Empty className="min-h-[calc(100dvh-16rem)] justify-center py-16 md:py-24">
        <EmptyHeader className="max-w-xl">
          <EmptyMedia className="[&_svg]:size-6" variant="icon">
            <HugeiconsIcon icon={Image01Icon} size={24} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle className="text-3xl tracking-tight">
            No library assets yet
          </EmptyTitle>
          <EmptyDescription className="text-base">
            Upload client wins and other assets for your story sequences.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-xl">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <UploadButton slug={profileSlug} />
            <Button
              render={<Link href={`/profiles/${profileSlug}/sequences`} />}
              size="lg"
              variant="outline"
            >
              <HugeiconsIcon
                icon={CarouselHorizontalIcon}
                size={18}
                strokeWidth={2}
              />
              View sequences
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {items.map((item) => (
        <article
          key={item.libraryId}
          className="overflow-hidden rounded-md border bg-background"
        >
          <div className="relative aspect-[9/16] bg-muted">
            <Image
              alt={item.title}
              fill
              loading="eager"
              className="object-cover"
              src={item.imageUrl}
            />
          </div>

          <div className="p-1.5">
            <h2 className="truncate text-[11px] font-medium">{item.title}</h2>
          </div>
        </article>
      ))}
    </div>
  );
}

function LibraryGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {Array.from({ length: 14 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-md border">
          <Skeleton className="aspect-[9/16] w-full" />
          <div className="p-1.5">
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
