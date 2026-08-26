"use client";

import {
  parseJsonEventStream,
  readUIMessageStream,
  type ReasoningUIPart,
  type UIMessage,
  type TextUIPart,
  uiMessageChunkSchema,
} from "ai";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock04Icon,
  DateTimeIcon,
  Link05Icon,
  Message02Icon,
  TextIcon,
} from "@hugeicons/core-free-icons";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import {
  ResourceComposer,
  type UploadedFileItem,
} from "@/components/sequence/resource-composer";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SequenceType } from "@/utils/types";

const POSTING_DAYS_REQUIRED_ERROR_MESSAGE = "Select at least one posting day.";
const RESOURCE_FILES_REQUIRED_ERROR_MESSAGE = "Upload at least one file.";

type SequenceConfigFormProps = {
  profileSlug: string;
  sequenceType: SequenceType;
  mode?: "create" | "edit";
  sequenceConfigId?: string;
  initialValues?: {
    sequenceTitle: string;
    ctaKeyword: string;
    postingDaysOfWeek: string[];
    postingTime: string;
    productUrl: string;
  };
  onSuccess?: () => void;
};

type CreateSequenceConfigState = {
  error: string | null;
};

type SequenceConfigGenerationMessage = UIMessage<
  never,
  {
    "sequence-config-result": {
      redirectTo: string;
    };
  }
>;

const GENERIC_ERROR_MESSAGE = "An error occurred. Try again";
const initialCreateSequenceConfigState: CreateSequenceConfigState = {
  error: null,
};

const frequencyOptions = [
  { label: "Mon", value: "mon" },
  { label: "Tue", value: "tue" },
  { label: "Wed", value: "wed" },
  { label: "Thu", value: "thu" },
  { label: "Fri", value: "fri" },
  { label: "Sat", value: "sat" },
  { label: "Sun", value: "sun" },
] as const;

export function SequenceConfigForm({
  profileSlug,
  sequenceType,
  mode = "create",
  sequenceConfigId,
  initialValues,
  onSuccess,
}: SequenceConfigFormProps) {
  const router = useRouter();
  const isEditMode = mode === "edit";
  const formId = `sequence-config-${sequenceType.toLowerCase().replace(/\s+/g, "-")}`;
  const sequenceTitleId = `${formId}-sequence-title`;
  const productUrlId = `${formId}-product-url`;
  const ctaKeywordId = `${formId}-cta-keyword`;
  const postingTimeId = `${formId}-posting-time`;
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [postingDaysOfWeek, setPostingDaysOfWeek] = useState<string[]>(
    initialValues?.postingDaysOfWeek ?? [],
  );
  const [postingDaysError, setPostingDaysError] = useState<string | null>(null);
  const [resourceFiles, setResourceFiles] = useState<UploadedFileItem[]>([]);
  const [resourceFilesError, setResourceFilesError] = useState<string | null>(
    null,
  );
  const [resourceLinks, setResourceLinks] = useState("");
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [reasoningDialogOpen, setReasoningDialogOpen] = useState(false);
  const [streamedMessage, setStreamedMessage] =
    useState<SequenceConfigGenerationMessage>();
  const [state, setState] = useState(initialCreateSequenceConfigState);
  const reasoningScrollRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    if (!postingDaysOfWeek.length) {
      setPostingDaysError(POSTING_DAYS_REQUIRED_ERROR_MESSAGE);
      return;
    }

    if (!isEditMode && !resourceFiles.some((file) => file.file instanceof File)) {
      setResourceFilesError(RESOURCE_FILES_REQUIRED_ERROR_MESSAGE);
      return;
    }

    setPending(true);
    setState(initialCreateSequenceConfigState);
    setStreamedMessage(undefined);
    if (!isEditMode) {
      setResourceDialogOpen(false);
      setReasoningDialogOpen(true);
    } else if (!sequenceConfigId) {
      setPending(false);
      setState({ error: GENERIC_ERROR_MESSAGE });
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("resourceLinks", resourceLinks);

    if (!isEditMode) {
      for (const resourceFile of resourceFiles) {
        if (resourceFile.file instanceof File) {
          formData.append(
            "resourceFiles",
            resourceFile.file,
            resourceFile.file.name,
          );
        }
      }
    }

    try {
      const response = isEditMode
        ? await fetch("/api/v1/sequence/config/update", {
            body: JSON.stringify({
              sequenceTitle: formData.get("sequenceTitle"),
              ctaKeyword: formData.get("ctaKeyword"),
              postingDaysOfWeek: formData.getAll("postingDaysOfWeek"),
              postingTime: formData.get("postingTime"),
              productUrl: formData.get("productUrl"),
              profileSlug,
              sequenceConfigId,
              sequenceType,
              timezoneOffsetMinutes: Number(formData.get("timezoneOffsetMinutes")),
            }),
            headers: {
              "Content-Type": "application/json",
            },
            method: "POST",
          })
        : await fetch("/api/v1/sequence/config/create", {
            body: formData,
            method: "POST",
          });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: GENERIC_ERROR_MESSAGE }));

        setReasoningDialogOpen(false);
        if (!isEditMode) {
          setResourceDialogOpen(true);
        }
        setState({
          error:
            typeof payload.error === "string"
              ? payload.error
              : GENERIC_ERROR_MESSAGE,
        });
        return;
      }

      if (isEditMode) {
        onSuccess?.();
        router.refresh();
        return;
      }

      if (!response.body) {
        setReasoningDialogOpen(false);
        setResourceDialogOpen(true);
        setState({ error: GENERIC_ERROR_MESSAGE });
        return;
      }

      let redirectTo: string | null = null;
      let streamError: string | null = null;

      const stream = parseJsonEventStream({
        stream: response.body,
        schema: uiMessageChunkSchema,
      }).pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (!chunk.success) {
              throw chunk.error;
            }

            controller.enqueue(chunk.value);
          },
        }),
      );

      for await (const message of readUIMessageStream<SequenceConfigGenerationMessage>(
        {
          stream,
          onError: (error) => {
            streamError =
              error instanceof Error ? error.message : GENERIC_ERROR_MESSAGE;
          },
        },
      )) {
        setStreamedMessage(message);

        for (const part of message.parts) {
          if (
            part.type === "data-sequence-config-result" &&
            "data" in part &&
            typeof part.data === "object" &&
            part.data !== null &&
            "redirectTo" in part.data &&
            typeof part.data.redirectTo === "string"
          ) {
            redirectTo = part.data.redirectTo;
            break;
          }
        }
      }

      if (!redirectTo) {
        setReasoningDialogOpen(false);
        setResourceDialogOpen(true);
        setState({
          error: streamError ?? GENERIC_ERROR_MESSAGE,
        });
        return;
      }

      window.location.assign(redirectTo);
    } catch {
      setReasoningDialogOpen(false);
      setResourceDialogOpen(true);
      setState({ error: GENERIC_ERROR_MESSAGE });
    } finally {
      setPending(false);
    }
  }

  const streamedContent =
    getStreamedReasoning(streamedMessage) || getStreamedText(streamedMessage);

  useEffect(() => {
    if (!pending || !reasoningScrollRef.current) {
      return;
    }

    reasoningScrollRef.current.scrollTop =
      reasoningScrollRef.current.scrollHeight;
  }, [pending, streamedContent]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="p-4 text-3xl">Configure automation</DialogTitle>
      </DialogHeader>

      <form
        className="contents"
        id={formId}
        onSubmit={handleSubmit}
        ref={formRef}
      >
        <input name="profileSlug" type="hidden" defaultValue={profileSlug} />
        <input name="sequenceType" type="hidden" defaultValue={sequenceType} />
        <TimezoneOffsetField name="timezoneOffsetMinutes" />

        <DialogPanel scrollFade={false}>
          <div className="grid gap-7">
            <InputGroup>
              <InputGroupInput
                id={sequenceTitleId}
                name="sequenceTitle"
                placeholder="Sequence title"
                size="lg"
                className="text-lg"
                type="text"
                defaultValue={initialValues?.sequenceTitle ?? sequenceType}
                required
              />
              <InputGroupAddon
                align="block-start"
                className="h-15 items-start"
              >
                <Label htmlFor={sequenceTitleId}>
                  <HugeiconsIcon
                    className="text-muted-foreground size-5"
                    icon={TextIcon}
                    size={28}
                    strokeWidth={1.75}
                  />
                  <span className="text-foreground text-lg">
                    Sequence Title
                  </span>
                </Label>
              </InputGroupAddon>
            </InputGroup>
            <div className="grid gap-7 md:grid-cols-2">
              <InputGroup>
                <InputGroupInput
                  id={productUrlId}
                  name="productUrl"
                  placeholder="URL"
                  size="lg"
                  className="text-lg"
                  type="url"
                  defaultValue={initialValues?.productUrl}
                  required
                />
                <InputGroupAddon
                  align="block-start"
                  className="h-15 items-start"
                >
                  <Label htmlFor={productUrlId}>
                    <HugeiconsIcon
                      className="text-muted-foreground size-5"
                      icon={Link05Icon}
                      size={28}
                      strokeWidth={1.75}
                    />
                    <span className="text-foreground text-lg">
                      Product Link
                    </span>
                  </Label>
                </InputGroupAddon>
              </InputGroup>
              <InputGroup>
                <InputGroupInput
                  id={ctaKeywordId}
                  name="ctaKeyword"
                  placeholder="eg. TEST NOW"
                  size="lg"
                  className="text-lg"
                  type="text"
                  defaultValue={initialValues?.ctaKeyword}
                  required
                />
                <InputGroupAddon
                  align="block-start"
                  className="h-15 items-start"
                >
                  <Label htmlFor={ctaKeywordId}>
                    <HugeiconsIcon
                      className="text-muted-foreground size-5"
                      icon={Message02Icon}
                      size={28}
                      strokeWidth={1.75}
                    />
                    <span className="text-foreground text-lg">CTA Keyword</span>
                  </Label>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-border p-3">
              <div className="shrink-0">
                <p className="mb-3 text-lg font-medium text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <HugeiconsIcon
                      className="text-muted-foreground size-5"
                      icon={DateTimeIcon}
                      size={28}
                      strokeWidth={1.75}
                    />
                    Post Frequency
                  </span>
                </p>
                <SequenceFrequencyField
                  name="postingDaysOfWeek"
                  error={postingDaysError}
                  value={postingDaysOfWeek}
                  onValueChange={(value) => {
                    setPostingDaysOfWeek(value);
                    if (value.length) {
                      setPostingDaysError(null);
                    }
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <InputGroup>
                  <InputGroupInput
                    id={postingTimeId}
                    name="postingTime"
                    size="lg"
                    className="w-full text-lg"
                    type="time"
                    defaultValue={initialValues?.postingTime}
                    required
                  />
                  <InputGroupAddon align="block-start" className="w-full">
                    <Label
                      htmlFor={postingTimeId}
                      className="flex items-center gap-2 text-left"
                    >
                      <HugeiconsIcon
                        className="size-5 text-muted-foreground"
                        icon={Clock04Icon}
                        size={28}
                        strokeWidth={1.75}
                      />
                      <span className="text-lg font-medium text-foreground">
                        Time (local)
                      </span>
                    </Label>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            </div>
          </div>
        </DialogPanel>

        <DialogFooter>
          {isEditMode ? (
            <p aria-live="polite" className="mr-auto text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogClose render={<Button variant="ghost" />}>Back</DialogClose>
          {isEditMode ? (
            <Button form={formId} loading={pending} type="submit">
              Save changes
            </Button>
          ) : (
            <Dialog
              onOpenChange={setResourceDialogOpen}
              open={resourceDialogOpen}
            >
              <Button
                onClick={() => {
                  if (!formRef.current?.reportValidity()) {
                    return;
                  }

                  if (!postingDaysOfWeek.length) {
                    setPostingDaysError(POSTING_DAYS_REQUIRED_ERROR_MESSAGE);
                    return;
                  }

                  setPostingDaysError(null);
                  setResourceDialogOpen(true);
                }}
                type="button"
              >
                Next
              </Button>
              <DialogPopup className="max-w-4xl" showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle className="p-4 text-3xl">
                    Add resources
                  </DialogTitle>
                </DialogHeader>

                <DialogPanel scrollFade={false}>
                  <ResourceComposer
                    disabled={pending}
                    onFilesChange={(files) => {
                      setResourceFiles(files);
                      if (files.some((file) => file.file instanceof File)) {
                        setResourceFilesError(null);
                      }
                    }}
                    onResourceLinksChange={setResourceLinks}
                    resourceLinks={resourceLinks}
                  />
                  {resourceFilesError ? (
                    <p className="mt-3 text-sm text-destructive" role="alert">
                      {resourceFilesError}
                    </p>
                  ) : null}
                </DialogPanel>

                <DialogFooter className="items-center justify-between gap-3">
                  <p
                    aria-live="polite"
                    className="min-h-5 text-sm text-destructive"
                  >
                    {state.error}
                  </p>
                  <div className="flex items-center gap-2">
                    <DialogClose
                      render={<Button disabled={pending} variant="ghost" />}
                    >
                      Back
                    </DialogClose>
                    <Button form={formId} loading={pending} type="submit">
                      Create sequence config
                    </Button>
                  </div>
                </DialogFooter>
              </DialogPopup>
            </Dialog>
          )}

          {!isEditMode ? (
            <Dialog
              onOpenChange={setReasoningDialogOpen}
              open={reasoningDialogOpen}
            >
              <DialogPopup
                className="max-w-4xl"
                showCloseButton={false}
              >
                <DialogPanel scrollFade={false}>
                  <div className="flex min-h-64 flex-col gap-4">
                    <div
                      ref={reasoningScrollRef}
                      className="hide-scrollbar max-h-[40vh] overflow-y-auto"
                    >
                      {streamedContent ? (
                        <div className="max-w-[90%] text-sm leading-7 text-foreground/90 md:text-base">
                          <Streamdown
                            caret="circle"
                            className="min-w-0"
                            isAnimating={pending}
                            mode="streaming"
                          >
                            {streamedContent}
                          </Streamdown>
                        </div>
                      ) : null}
                    </div>
                    {pending ? <ThinkingMessage /> : null}
                    {!streamedContent && !pending ? (
                      <div className="max-w-[90%] text-sm text-foreground/70">
                        No reasoning was streamed.
                      </div>
                    ) : null}
                  </div>
                </DialogPanel>
              </DialogPopup>
            </Dialog>
          ) : null}
        </DialogFooter>
      </form>
    </>
  );
}

function TimezoneOffsetField({ name }: { name: string }) {
  const value = String(new Date().getTimezoneOffset());

  return (
    <input
      name={name}
      readOnly
      suppressHydrationWarning
      type="hidden"
      value={value}
    />
  );
}

function getStreamedText(message?: SequenceConfigGenerationMessage) {
  return (message?.parts ?? [])
    .filter((part): part is TextUIPart => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function getStreamedReasoning(message?: SequenceConfigGenerationMessage) {
  return (message?.parts ?? [])
    .filter((part): part is ReasoningUIPart => part.type === "reasoning")
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

function SequenceFrequencyField({
  error,
  name,
  onValueChange,
  value,
}: {
  error: string | null;
  name: string;
  onValueChange: (value: string[]) => void;
  value: string[];
}) {
  return (
    <>
      <ToggleGroup
        aria-invalid={error ? true : undefined}
        multiple
        size="lg"
        className="flex flex-nowrap gap-2"
        value={value}
        onValueChange={onValueChange}
      >
        {frequencyOptions.map((option) => (
          <ToggleGroupItem
            aria-label={`Toggle ${option.label}`}
            value={option.value}
            key={option.value}
            className="h-12 min-w-[72px] px-4"
          >
            <span className="text-lg">{option.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {value.map((item) => (
        <input key={item} name={name} type="hidden" value={item} />
      ))}
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function ThinkingMessage() {
  return (
    <div className="shrink-0 text-lg leading-7 text-foreground/75 md:text-base">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="shimmer shimmer-invert shrink-0">Thinking</div>
      </div>
    </div>
  );
}
