import { Suspense } from "react";

async function StudioPageContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex h-full w-full flex-col p-6">
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Let's start selling, @{slug}
      </h1>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-xl shimmer tracking-tight text-muted-foreground">
          Analytics coming soon
        </div>
      </div>
    </div>
  );
}

export default function StudioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense>
      <StudioPageContent params={params} />
    </Suspense>
  );
}