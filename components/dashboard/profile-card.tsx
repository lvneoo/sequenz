import Link from "next/link";
import {
  Delete02Icon,
  MoreVerticalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@/components/ui/menu";

const cardClassName =
  "flex h-[72px] w-full items-center justify-between gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted";

type ProfileCardProps = {
  href: string;
  slug: string;
  deleteAction: (formData: FormData) => void;
};

export function ProfileCard({
  href,
  slug??,
  deleteAction,
}: ProfileCardProps) {
  return (
    <AlertDialog>
      <div className={cardClassName}>
        <Link
          href={href}
          className="min-w-0 flex-1 truncate text-lg font-medium underline-offset-4 hover:underline"
        >
          {slug}
        </Link>

        <span className="flex shrink-0 items-center gap-2">
          <Badge variant="success" className="shrink-0 gap-1.5">
            <HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={1.5} />
            Active
          </Badge>
          <Menu>
            <MenuTrigger
              render={
                <Button
                  aria-label={`Open actions for ${slug}`}
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={2} />
            </MenuTrigger>
            <MenuPopup align="start">
              <AlertDialogTrigger
                nativeButton={false}
                render={<MenuItem closeOnClick variant="destructive" />}
              >
                <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
                Delete profile
              </AlertDialogTrigger>
            </MenuPopup>
          </Menu>
        </span>
      </div>

      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete connected profile?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This permanently deletes this
            connected Instagram profile and removes its related data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={deleteAction}>
          <input name="profileSlug" type="hidden" value={slug} />
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              Cancel
            </AlertDialogClose>
            <Button type="submit" variant="destructive">
              Delete profile
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
