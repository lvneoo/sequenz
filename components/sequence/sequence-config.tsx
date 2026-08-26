import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  DollarCircleIcon,
  UserDollarIcon,
} from "@hugeicons/core-free-icons";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SequenceConfigForm } from "@/components/sequence/sequence-config-form";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";

type CreateSequenceConfigDialogProps = {
  hideTrigger?: boolean;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  label: string;
  onOpenChange?: (open: boolean) => void;
  onTriggerClick?: () => void;
  open?: boolean;
  profileSlug: string;
  trigger?: React.ReactElement;
};

export function CreateSequenceConfigDialog({
  hideTrigger = false,
  icon,
  label,
  onOpenChange,
  onTriggerClick,
  open,
  profileSlug,
  trigger,
}: CreateSequenceConfigDialogProps) {
  const dialogTrigger = (
    <DialogTrigger onClick={onTriggerClick} render={trigger}>
      {trigger ? null : (
        <HugeiconsIcon
          className="size-7"
          icon={icon}
          size={32}
          strokeWidth={2}
        />
      )}
    </DialogTrigger>
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {hideTrigger ? null : trigger ? (
        dialogTrigger
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <DialogTrigger
                onClick={onTriggerClick}
                render={
                  <Button
                    aria-label={label}
                    className="rounded-lg"
                    size="icon"
                    variant="ghost"
                  />
                }
              />
            }
          >
            <HugeiconsIcon
              className="size-7"
              icon={icon}
              size={32}
              strokeWidth={2}
            />
          </TooltipTrigger>
          <TooltipPopup side="right">{label}</TooltipPopup>
        </Tooltip>
      )}

      <DialogPopup className="max-w-4xl" showCloseButton={false}>
        <StepOneDialog profileSlug={profileSlug} />
      </DialogPopup>
    </Dialog>
  );
}

const cardClassName =
  "relative flex h-60 w-full flex-col items-center justify-center rounded-3xl border p-8 text-center transition-colors hover:bg-muted";

function StepOneDialog({
  profileSlug,
}: {
  profileSlug: string;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-3xl p-4">
          Choose a sequence type
        </DialogTitle>
      </DialogHeader>

      <DialogPanel className="grid gap-6 sm:grid-cols-2" scrollFade={false}>
        <Dialog>
          <DialogTrigger
            render={<StepOneCard icon={UserDollarIcon} title="Client Wins" />}
          />
          <DialogPopup className="max-w-4xl" showCloseButton={false}>
            <SequenceConfigForm
              profileSlug={profileSlug}
              sequenceType="Client wins"
            />
          </DialogPopup>
        </Dialog>

        <Dialog>
          <DialogTrigger
            render={
              <StepOneCard icon={DollarCircleIcon} title="Selling Story" />
            }
          />
          <DialogPopup className="max-w-4xl" showCloseButton={false}>
            <SequenceConfigForm
              profileSlug={profileSlug}
              sequenceType="Selling Story"
            />
          </DialogPopup>
        </Dialog>
      </DialogPanel>

      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
      </DialogFooter>
    </>
  );
}

function StepOneCard({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  title: string;
}) {
  return (
    <button className={cardClassName} type="button">
      <Badge
        className="absolute right-6 top-6 shrink-0 gap-2 text-base"
        size="lg"
        variant="secondary"
      >
        <HugeiconsIcon icon={Add01Icon} />
        Create
      </Badge>

      <span className="flex flex-col items-center justify-center gap-5">
        <HugeiconsIcon
          className="shrink-0"
          icon={icon}
          size={42}
          strokeWidth={1.75}
        />
        <span className="text-3xl font-semibold">{title}</span>
      </span>
    </button>
  );
}
