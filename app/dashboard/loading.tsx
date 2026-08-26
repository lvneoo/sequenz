import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

const cardClassName =
  "flex h-[72px] w-full items-center justify-between gap-3 rounded-2xl border p-4";

export default function Loading() {
  return (
    <div className="flex flex-1 justify-center">
      <main className="w-full px-4">
        <div className="flex flex-col gap-10">
          <section className="flex w-full items-start justify-between gap-4 pt-4">
            <Skeleton className="size-[50px] rounded-xl" />
            <Skeleton className="size-10 rounded-full" aria-hidden="true" />
          </section>

          <section
            className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 pt-20 text-center"
            aria-hidden="true"
          >
            <div className="flex flex-col items-center gap-3 pt-20">
              <div className="pt-20">
                <Skeleton className="h-9 w-72 rounded-md sm:h-10 sm:w-80" />
              </div>
              <div className="flex min-h-5 items-center justify-center">
                <Skeleton className="h-5 w-72 rounded-md" />
              </div>
            </div>
            <Separator className="w-full" />
          </section>

          <section className="mx-auto w-full max-w-4xl">
            <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div aria-hidden="true" className={cardClassName}>
                <span className="flex min-w-0 items-center gap-2">
                  <Skeleton className="size-5 rounded-md" />
                  <Skeleton className="h-6 w-28 rounded-md" />
                  <Skeleton className="size-6 rounded-md" />
                </span>
                <span className="shrink-0" />
              </div>

              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} aria-hidden="true" className={cardClassName}>
                  <Skeleton className="h-6 flex-1 rounded-md" />
                  <span className="flex shrink-0 items-center gap-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="size-8 rounded-lg" />
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
