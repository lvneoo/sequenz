import { Suspense } from "react";
import Link from "next/link";
import { unauthorized } from "next/navigation";
import { type NavItem } from "@/utils/types";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity01Icon,
  CarouselHorizontalIcon,
  AddCircleHalfDotIcon,
  FolderLibraryIcon,
  DashboardSquare01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Onboarding } from "@/components/onboarding";
import { CreateSequenceConfigDialog } from "@/components/sequence/sequence-config";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchProfileBySlug } from "@/utils/db/profiles/fetch";
import { fetchProfiles } from "@/utils/db/profiles/fetch";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfilePageHeader } from "../../../components/page-header";

const items: NavItem[] = [
  {
    label: "Studio",
    value: "studio",
    icon: Activity01Icon,
    href: (slug) => `/profiles/${slug}`,
  },
  {
    label: "Create",
    value: "create",
    icon: AddCircleHalfDotIcon,
    href: () => "#",
  },
  {
    label: "Sequences",
    value: "sequences",
    icon: CarouselHorizontalIcon,
    href: (slug) => `/profiles/${slug}/sequences`,
  },
  {
    label: "Library",
    value: "library",
    icon: FolderLibraryIcon,
    href: (slug) => `/profiles/${slug}/library`,
  },
  {
    label: "Dashboard",
    value: "dashboard",
    icon: DashboardSquare01Icon,
    href: () => `/dashboard`,
  },
];

export default function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}>) {
  return (
    <>
      <aside className="flex w-16 min-h-0 flex-col items-center overflow-hidden border-r border-zinc-800 bg-background py-4">
        <Suspense fallback={<SidebarNavFallback />}>
          <SidebarNav params={params} />
        </Suspense>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={
            <div className="p-6">
              <Skeleton className="h-10 w-56 rounded-md" />
            </div>
          }
        >
          <PageHeader params={params} />
        </Suspense>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <Suspense fallback={null}>
          <ProfileOnboarding params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function PageHeader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return <ProfilePageHeader slug={slug} />;
}

async function SidebarNav({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, userId] = await Promise.all([
    params,
    requireAuthenticatedUserId(),
  ]);

  const profiles = await fetchProfiles(userId);
  const activeProfile = profiles.find(
    (profile) => profile.profileSlug === slug,
  );

  if (!activeProfile) {
    unauthorized();
  }
  return (
    <div className="flex h-full w-full flex-col items-center">
      <Avatar className="size-10 rounded-lg">
        {activeProfile?.profilePictureUrl ? (
          <AvatarImage
            src={activeProfile.profilePictureUrl}
            alt={activeProfile.profileSlug}
          />
        ) : null}
      </Avatar>

      <TooltipProvider>
        <div className="flex flex-1 flex-col items-center justify-center -translate-y-20 gap-7">
          {items.map((item) => (
            item.value === "create" ? (
              <CreateSequenceConfigDialog
                key={item.value}
                icon={item.icon}
                label={item.label}
                profileSlug={slug}
              />
            ) : (
              <Tooltip key={item.value}>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={item.label}
                      className="rounded-lg"
                      value={item.value}
                      variant="ghost"
                      size="icon"
                      render={<Link href={item.href(slug)} />}
                    />
                  }
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={32}
                    strokeWidth={2}
                    className="size-7"
                  />
                </TooltipTrigger>
                <TooltipPopup side="right">{item.label}</TooltipPopup>
              </Tooltip>
            )
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

async function ProfileOnboarding({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, userId] = await Promise.all([
    params,
    requireAuthenticatedUserId(),
  ]);
  const profile = await fetchProfileBySlug(userId, slug);

  if (
    !profile ||
    (profile.onboardingAssetsComplete && profile.onboardingSequenceComplete)
  ) {
    return null;
  }

  return (
    <Onboarding
      onboardingAssetsComplete={profile.onboardingAssetsComplete}
      onboardingSequenceComplete={profile.onboardingSequenceComplete}
      profileSlug={slug}
    />
  );
}

function SidebarNavFallback() {
  return (
    <div className="flex h-full w-full flex-col items-center">
      <Skeleton className="size-10 rounded-lg" />
      <div className="flex flex-1 flex-col items-center justify-center -translate-y-20 gap-7">
        {items.map((item) => (
          <Button
            key={item.value}
            aria-label={`Loading ${item.label}`}
            className="rounded-lg"
            variant="ghost"
            size="icon"
          >
            <HugeiconsIcon
              icon={item.icon}
              size={32}
              strokeWidth={2}
              className="size-7"
            />
          </Button>
        ))}
      </div>
    </div>
  );
}
