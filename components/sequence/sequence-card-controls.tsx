"use client";

import {
  Delete02Icon,
  Edit02Icon,
  MoreVerticalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SequenceConfigForm } from "@/components/sequence/sequence-config-form";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogPopup,
} from "@/components/ui/dialog";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from "@/components/ui/preview-card";
import type { SequenceType } from "@/utils/types";

const TRIGGER_ARIA_LABEL = "Open sequence actions";
const GENERIC_ERROR_MESSAGE = "An error occurred. Try again";

type SequenceCardActionsProps = {
  cta: string;
  cronExpression: string;
  isActive: boolean;
  name: string;
  productUrl: string;
  profileSlug: string;
  sequenceConfigId: string;
  sequenceType: SequenceType;
};

type EditInitialValues = {
  sequenceTitle: string;
  ctaKeyword: string;
  postingDaysOfWeek: string[];
  postingTime: string;
  productUrl: string;
};

export function SequenceCardMoreDetails({
  productUrl,
  schedule,
}: {
  productUrl: string;
  schedule: string;
}) {
  return (
    <PreviewCard>
      <PreviewCardTrigger
        render={
          <Button size="sm" variant="ghost" />
        }
      >
        More
      </PreviewCardTrigger>
      <PreviewCardPopup align="start" className="w-80">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Product URL
            </p>
            <p className="break-all text-sm text-foreground">{productUrl}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Schedule
            </p>
            <p className="text-sm text-foreground">{schedule}</p>
          </div>
        </div>
      </PreviewCardPopup>
    </PreviewCard>
  );
}

export function SequenceCardActions({
  cta,
  cronExpression,
  isActive,
  name,
  productUrl,
  profileSlug,
  sequenceConfigId,
  sequenceType,
}: SequenceCardActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [active, setActive] = useState(isActive);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActive(isActive);
  }, [isActive]);

  const initialValues = getEditInitialValues({
    cta,
    cronExpression,
    sequenceTitle: name,
    productUrl,
  });
  const editFormKey = [
    sequenceConfigId,
    name,
    cta,
    productUrl,
    cronExpression,
  ].join(":");

  async function handleDelete() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/sequence/config/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileSlug,
          sequenceConfigId,
        }),
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: GENERIC_ERROR_MESSAGE }));
        setError(
          typeof payload.error === "string" ? payload.error : GENERIC_ERROR_MESSAGE,
        );
        return;
      }

      setDeleteOpen(false);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function handleSetActive(nextIsActive: boolean) {
    if (pending) {
      return;
    }

    const previousIsActive = active;
    setActive(nextIsActive);
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/sequence/config/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileSlug,
          sequenceConfigId,
          isActive: nextIsActive,
        }),
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: GENERIC_ERROR_MESSAGE }));
        setError(
          typeof payload.error === "string" ? payload.error : GENERIC_ERROR_MESSAGE,
        );
        setActive(previousIsActive);
        return;
      }

      router.refresh();
    } catch {
      setActive(previousIsActive);
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  const editDialog = (
    <Dialog onOpenChange={setEditOpen} open={editOpen}>
      <DialogPopup className="max-w-4xl" showCloseButton={false}>
        <SequenceConfigForm
          key={editFormKey}
          initialValues={initialValues}
          mode="edit"
          onSuccess={() => setEditOpen(false)}
          profileSlug={profileSlug}
          sequenceConfigId={sequenceConfigId}
          sequenceType={sequenceType}
        />
      </DialogPopup>
    </Dialog>
  );

  return (
    <>
      {editDialog}
      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sequence config?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This permanently deletes this sequence
              and all related data.
            </AlertDialogDescription>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              Cancel
            </AlertDialogClose>
            <Button
              loading={pending}
              variant="destructive"
              onClick={() => {
                void handleDelete();
              }}
            >
              Delete sequence
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <Menu>
        <MenuTrigger
          render={
            <Button
              aria-label={TRIGGER_ARIA_LABEL}
              size="icon-sm"
              variant="outline"
            />
          }
        >
          <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={2} />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuGroup>
            <MenuGroupLabel>Actions</MenuGroupLabel>
            <MenuCheckboxItem
              checked={active}
              disabled={pending}
              variant="switch"
              onCheckedChange={(nextValue) => {
                if (typeof nextValue === "boolean") {
                  void handleSetActive(nextValue);
                }
              }}
            >
              Active
            </MenuCheckboxItem>
            <MenuItem
              closeOnClick
              onClick={() => {
                setEditOpen(true);
              }}
            >
              <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={2} />
              Edit
            </MenuItem>
          </MenuGroup>
          <MenuSeparator />
          <MenuItem
            closeOnClick
            variant="destructive"
            onClick={() => {
              setDeleteOpen(true);
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
            Delete
          </MenuItem>
        </MenuPopup>
      </Menu>
      {error ? <p className="sr-only">{error}</p> : null}
    </>
  );
}

function getEditInitialValues({
  cta,
  cronExpression,
  sequenceTitle,
  productUrl,
}: {
  cta: string;
  cronExpression: string;
  sequenceTitle: string;
  productUrl: string;
}): EditInitialValues {
  const timezoneOffsetMinutes = new Date().getTimezoneOffset();
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
    return {
      sequenceTitle,
      ctaKeyword: cta,
      postingDaysOfWeek: [],
      postingTime: "",
      productUrl,
    };
  }

  const utcHour = Number(hour);
  const utcMinute = Number(minute);
  const utcMinutesTotal = utcHour * 60 + utcMinute;
  const localMinutesTotal = utcMinutesTotal - timezoneOffsetMinutes;
  const localDayShift = Math.floor(localMinutesTotal / (24 * 60));
  const normalizedMinutes =
    ((localMinutesTotal % (24 * 60)) + 24 * 60) % (24 * 60);
  const localHour = Math.floor(normalizedMinutes / 60);
  const localMinute = normalizedMinutes % 60;
  const utcDayValues = dayOfWeek
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

  const postingDaysOfWeek = utcDayValues.map((value) => {
    const localValue = (value - localDayShift + 7) % 7;
    return CRON_DAY_TO_UI_DAY[localValue];
  });

  return {
    sequenceTitle,
    ctaKeyword: cta,
    postingDaysOfWeek,
    postingTime: `${String(localHour).padStart(2, "0")}:${String(localMinute).padStart(2, "0")}`,
    productUrl,
  };
}

const CRON_DAY_TO_UI_DAY: Record<number, string> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};
