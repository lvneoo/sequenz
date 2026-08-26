"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { UploadButton } from "@/components/upload-button";

export function ProfilePageHeader({ slug }: { slug: string }) {
  const segments = useSelectedLayoutSegments();
  const [segment] = segments;

  if (segments.length > 1) {
    return null;
  }

  const title =
    segment === "analytics"
      ? "Analytics"
      : segment === "sequences"
        ? "Sequences"
        : segment === "library"
          ? "Content Library"
          : null;

  return (
    <div className="flex items-center justify-between gap-4 p-6">
      <h1 className="text-3xl font-semibold leading-10 tracking-tight">
        {title}
      </h1>
      {segment === "library" ? <UploadButton slug={slug} /> : null}
    </div>
  );
}
