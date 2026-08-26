import Image from "next/image";
import Link from "next/link";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { PortalPage } from "@kinde/js-utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Settings05Icon,
  Wallet02Icon,
  Logout01Icon,
} from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { Separator } from "@/components/ui/separator";
import {
  NO_ENTITLEMENT_PLAN_KEY,
  getBillingAccessForUser,
} from "@/utils/billing/entitlements";
import { deleteProfileAction } from "@/utils/db/profiles/actions";
import { ProfileCard } from "@/components/dashboard/profile-card";
import { fetchProfiles } from "@/utils/db/profiles/fetch";

const cardClassName =
  "flex h-[72px] w-full items-center justify-between gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted";
const kindeAuthApiPath =
  process.env.NEXT_PUBLIC_KINDE_AUTH_API_PATH || "/api/auth";
const dashboardReturnUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL;

function getPortalHref(subNav: PortalPage) {
  const params = new URLSearchParams({ subNav });

  if (dashboardReturnUrl) {
    params.set("returnUrl", dashboardReturnUrl);
  }

  return `${kindeAuthApiPath}/portal?${params.toString()}`;
}

function getLogoutHref() {
  if (!dashboardReturnUrl) {
    return `${kindeAuthApiPath}/logout`;
  }

  return `${kindeAuthApiPath}/logout?post_logout_redirect_url=${encodeURIComponent(dashboardReturnUrl)}`;
}

export default async function Dashboard() {
  const { getUser, isAuthenticated } = getKindeServerSession();
  const user = (await isAuthenticated()) ? await getUser() : null;

  if (user && !user.id) {
    throw new Error("Missing authenticated user");
  }

  const displayName =
    user?.given_name || user?.username || user?.email || "there";
  const fallbackLabel =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";
  const [billing, profiles] = user?.id
    ? await Promise.all([
        getBillingAccessForUser(user.id),
        fetchProfiles(user.id),
      ])
    : [null, []];

  return (
    <div className="flex flex-1 justify-center">
      <main className="w-full px-4">
        <div className="flex flex-col gap-10">
          <section className="flex w-full items-start justify-between gap-4 pt-4">
            <Image
              className="dark:invert"
              src="/sequenz.png"
              alt="Sequenz logo"
              width={50}
              height={50}
              priority
            />
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    aria-label={`Open account menu for ${displayName}`}
                    className="rounded-full p-0"
                    size="icon-lg"
                    variant="ghost"
                  />
                }
              >
                <Avatar className="size-10">
                  {user?.picture ? (
                    <AvatarImage alt={displayName} src={user.picture} />
                  ) : null}
                  <AvatarFallback>{fallbackLabel}</AvatarFallback>
                </Avatar>
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem
                  closeOnClick
                  render={<a href={getPortalHref(PortalPage.profile)} />}
                >
                  <HugeiconsIcon icon={Settings05Icon} />
                  Manage Account
                </MenuItem>
                <MenuItem
                  closeOnClick
                  render={<a href={getPortalHref(PortalPage.planDetails)} />}
                >
                  <HugeiconsIcon icon={Wallet02Icon} />
                  Billing
                </MenuItem>
                <MenuItem closeOnClick render={<a href={getLogoutHref()} />}>
                  <HugeiconsIcon icon={Logout01Icon} />
                  Log out
                </MenuItem>
              </MenuPopup>
            </Menu>
          </section>

          <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 pt-20 text-center">
            <div className="flex flex-col items-center gap-3 pt-20">
              <h1 className="text-3xl font-semibold pt-20 sm:text-4xl">
                Welcome, {displayName}
              </h1>
              <div className="flex min-h-5 items-center justify-center">
                {billing ? (
                  <p className="text-center text-sm leading-5 text-muted-foreground">
                    <strong>{billing.plan.name}</strong> Plan /
                    {billing.plan.key !== NO_ENTITLEMENT_PLAN_KEY ? (
                      <>
                        {" "}
                        Connected accounts:{" "}
                        <strong>
                          {billing.currentConnectedAccounts}/
                          {billing.plan.maxConnectedAccounts}
                        </strong>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <div className="h-5" aria-hidden="true" />
                )}
              </div>
            </div>
            <Separator className="w-full" />
          </section>

          <section className="mx-auto w-full max-w-4xl">
            <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Link
                href={`/api/${process.env.NEXT_PUBLIC_API_VERSION}/oauth/initialize`}
                className={cardClassName}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <HugeiconsIcon icon={Add01Icon} className="shrink-0" />
                  <span className="truncate text-lg font-medium underline-offset-4">
                    Add Account
                  </span>
                  <Image
                    src="/Instagram_icon.png"
                    alt="Instagram logo"
                    width={24}
                    height={24}
                  />
                </span>
                <span className="shrink-0" />
              </Link>

              {profiles.length > 0 ? (
                profiles.map((profile) => (
                  <ProfileCard
                    key={profile.profileId}
                    deleteAction={deleteProfileAction}
                    href={`/profiles/${profile.profileSlug}`}
                    slug={profile.profileSlug}
                  />
                ))
              ) : (
                <p className="col-span-full text-sm text-muted-foreground">
                  No connected Instagram profiles yet.
                  <Link
                    href={`/api/${process.env.NEXT_PUBLIC_API_VERSION}/oauth/initialize`}
                  >
                    <span className="text-primary underline">
                      {" "}
                      Connect one now.
                    </span>
                  </Link>
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
