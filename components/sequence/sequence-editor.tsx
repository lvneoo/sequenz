"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockquoteToolbar } from "@/components/toolbars/blockquote";
import { BoldToolbar } from "@/components/toolbars/bold";
import { BulletListToolbar } from "@/components/toolbars/bullet-list";
import { CodeToolbar } from "@/components/toolbars/code";
import { CodeBlockToolbar } from "@/components/toolbars/code-block";
import { HardBreakToolbar } from "@/components/toolbars/hard-break";
import { HorizontalRuleToolbar } from "@/components/toolbars/horizontal-rule";
import { ItalicToolbar } from "@/components/toolbars/italic";
import { OrderedListToolbar } from "@/components/toolbars/ordered-list";
import { StrikeThroughToolbar } from "@/components/toolbars/strikethrough";
import { ToolbarProvider } from "@/components/toolbars/toolbar-provider";
import { EditorContent, type Extension, useEditor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

const extensions: Extension[] = [
  Markdown.configure({
    markedOptions: {
      gfm: true,
      breaks: false,
      pedantic: false,
    },
  }),
  StarterKit.configure({
    orderedList: {
      HTMLAttributes: {
        class: "list-decimal",
      },
    },
    bulletList: {
      HTMLAttributes: {
        class: "list-disc",
      },
    },
    code: {
      HTMLAttributes: {
        class: "bg-accent rounded-md p-1",
      },
    },
    horizontalRule: {
      HTMLAttributes: {
        class: "my-2",
      },
    },
    codeBlock: {
      HTMLAttributes: {
        class: "bg-primary text-primary-foreground rounded-md p-2 text-sm",
      },
    },
    heading: {
      levels: [1, 2, 3, 4],
      HTMLAttributes: {
        class: "tiptap-heading",
      },
    },
  }),
];

const LARGE_DOCUMENT_THRESHOLD = 12000;
const LARGE_DOCUMENT_CHUNK_SIZE = 4000;

const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function splitMarkdownIntoChunks(markdown: string) {
  const lines = markdown.match(/[^\n]*\n|[^\n]+/g) ?? [markdown];
  const chunks: string[] = [];
  let chunk = "";
  let lastBreak = -1;
  let isInCodeFence = false;

  for (const line of lines) {
    if (
      !isInCodeFence &&
      chunk.length > 0 &&
      chunk.length + line.length > LARGE_DOCUMENT_CHUNK_SIZE
    ) {
      const splitAt = lastBreak === -1 ? chunk.length : lastBreak;
      const nextChunk = chunk.slice(splitAt);

      chunks.push(chunk.slice(0, splitAt));
      chunk = nextChunk.trim() ? nextChunk : "";
      lastBreak = -1;
    }

    chunk += line;

    if (/^\s*(```|~~~)/.test(line)) {
      isInCodeFence = !isInCodeFence;
    }

    if (!isInCodeFence && /^\s*$/.test(line)) {
      lastBreak = chunk.length;
    }
  }

  if (chunk) {
    chunks.push(chunk);
  }

  return chunks;
}

function formatReadableSchedule(cronExpression: string) {
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
    return cronExpression;
  }

  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const weekdayNumbers = dayOfWeek
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

  if (
    !Number.isInteger(hourNumber) ||
    !Number.isInteger(minuteNumber) ||
    weekdayNumbers.length === 0
  ) {
    return cronExpression;
  }

  const weekdays = weekdayNumbers
    .map((value) => weekdayNames[value])
    .filter(Boolean);

  const weekdayLabel =
    weekdays.length === weekdayNames.length ? "Every day" : weekdays.join(", ");
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 2, hourNumber, minuteNumber)));

  return `${weekdayLabel} at ${timeLabel} UTC`;
}

function formatNextWorkflowRun(nextWorkflowRunAt: string) {
  const date = new Date(nextWorkflowRunAt);

  if (Number.isNaN(date.getTime())) {
    return nextWorkflowRunAt;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

type SequenceDescriptionEditorProps = {
  profileSlug: string;
  sequenceConfigId: string;
  title: string;
  sequenceType: string | null;
  cta: string;
  isActive: boolean;
  cronExpression: string;
  nextWorkflowRunAt: string;
  productUrl: string;
  initialDescription: string;
};

export function SequenceDescriptionEditor({
  profileSlug,
  sequenceConfigId,
  title,
  sequenceType,
  cta,
  isActive,
  cronExpression,
  nextWorkflowRunAt,
  productUrl,
  initialDescription,
}: SequenceDescriptionEditorProps) {
  const [lastSavedDescription, setLastSavedDescription] =
    useState(initialDescription);
  const [currentDescription, setCurrentDescription] =
    useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [isPending, startTransition] = useTransition();
  const editor = useEditor({
    extensions,
    content: initialDescription,
    contentType: "markdown",
    immediatelyRender: false,
    onUpdate({ editor: currentEditor }) {
      setCurrentDescription(currentEditor.getMarkdown());
      setError(null);
    },
  });

  useEffect(() => {
    setLastSavedDescription(initialDescription);
    setCurrentDescription(initialDescription);
    setError(null);

    if (!editor) {
      return;
    }

    let isCancelled = false;

    async function loadLargeDocument() {
      if (initialDescription.length <= LARGE_DOCUMENT_THRESHOLD) {
        editor!.commands.setContent(initialDescription, {
          contentType: "markdown",
        });
        setIsLoadingDocument(false);
        return;
      }

      setIsLoadingDocument(true);
      editor!.commands.clearContent();

      const chunks = splitMarkdownIntoChunks(initialDescription);

      for (const chunk of chunks) {
        if (isCancelled) {
          return;
        }

        const json = editor!.markdown!.parse(chunk);
        const position = editor!.state.doc.content.size;

        editor!.commands.insertContentAt(position, json);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      if (!isCancelled) {
        setIsLoadingDocument(false);
      }
    }

    void loadLargeDocument();

    return () => {
      isCancelled = true;
    };
  }, [editor, initialDescription]);

  const hasChanges = currentDescription !== lastSavedDescription;
  const readableSchedule = formatReadableSchedule(cronExpression);
  const nextWorkflowRunLabel = formatNextWorkflowRun(nextWorkflowRunAt);
  const status = error
    ? null
    : isLoadingDocument
      ? "Loading document..."
      : isPending
        ? "Saving..."
        : hasChanges
          ? "Unsaved changes"
          : "Saved";

  function handleSave() {
    if (!editor || !hasChanges || isLoadingDocument) {
      return;
    }

    const nextDescription = editor.getMarkdown();

    startTransition(async () => {
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
            description: nextDescription,
          }),
        });

        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;

        if (!response.ok || !body?.ok) {
          throw new Error(body?.error ?? "Failed to save description");
        }

        setLastSavedDescription(nextDescription);
        setCurrentDescription(nextDescription);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save description",
        );
      }
    });
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="w-full px-6 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/profiles/${profileSlug}/sequences`}>
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              className="size-6"
              strokeWidth={3}
            />
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <Drawer position="bottom">
            <DrawerTrigger render={<Button variant="outline" size="sm" />}>
              Details
            </DrawerTrigger>
            <DrawerPopup variant="inset">
              <DrawerHeader>
                <DrawerTitle>Sequence details</DrawerTitle>
              </DrawerHeader>
              <DrawerPanel>
                <div className="grid gap-4 pb-6 sm:grid-cols-2 xl:grid-cols-3">
                  {sequenceType ? (
                    <div className="min-w-0 rounded-2xl border bg-background p-5">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Type
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                        {sequenceType}
                      </p>
                    </div>
                  ) : null}
                  <div className="min-w-0 rounded-2xl border bg-background p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      CTA
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {cta}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-2xl border bg-background p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Product URL
                    </p>
                    <a
                      href={productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block truncate text-lg font-medium text-foreground underline underline-offset-4"
                    >
                      {productUrl}
                    </a>
                  </div>
                  <div className="min-w-0 rounded-2xl border bg-background p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Active
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {isActive ? "Yes" : "No"}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-2xl border bg-background p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Schedule
                    </p>
                    <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                      {readableSchedule}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-2xl border bg-background p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Next workflow run
                    </p>
                    <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                      {nextWorkflowRunLabel}
                    </p>
                  </div>
                </div>
              </DrawerPanel>
            </DrawerPopup>
          </Drawer>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-10 pb-6">
        {editor ? (
          <ToolbarProvider editor={editor}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <BoldToolbar />
                <ItalicToolbar />
                <StrikeThroughToolbar />
                <BulletListToolbar />
                <OrderedListToolbar />
                <CodeToolbar />
                <CodeBlockToolbar />
                <HorizontalRuleToolbar />
                <BlockquoteToolbar />
                <HardBreakToolbar />
              </div>

              <div className="flex shrink-0 flex-row items-center justify-center gap-2">
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  {error ?? status ?? " "}
                </p>
                <Button
                  loading={isPending}
                  disabled={!hasChanges || isLoadingDocument}
                  onClick={handleSave}
                  variant="ghost"
                >
                  Save
                </Button>
              </div>
            </div>
          </ToolbarProvider>
        ) : null}
        <Separator />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          {isLoadingDocument ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-1/3 rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-5/6 rounded-md" />
              <Skeleton className="h-4 w-11/12 rounded-md" />
              <Skeleton className="h-4 w-2/3 rounded-md" />
            </div>
          ) : null}
          <div
            onClick={() => editor?.chain().focus().run()}
            className={
              isLoadingDocument
                ? "pointer-events-none opacity-0"
                : "min-h-full cursor-text bg-background"
            }
          >
            {editor ? (
              <EditorContent editor={editor} className="outline-none" />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
