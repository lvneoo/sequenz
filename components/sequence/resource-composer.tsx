"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  FileUpIcon,
  Link05Icon,
  Remove01Icon,
  Image01Icon,
  Pdf01Icon,
  NoteIcon,
  FileArchiveIcon,
  FileSpreadsheetIcon,
  Video01Icon,
  HeadphonesIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes, useFileUpload } from "@/hooks/use-upload";

function getUploadFileIcon(file: UploadedFileItem) {
  const fileType = file.file.type;
  const fileName = file.file.name.toLowerCase();

  if (
    fileType.includes("pdf") ||
    fileName.endsWith(".pdf") ||
    fileType.includes("word") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx") ||
    fileType.includes("text/") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".markdown") ||
    fileName.endsWith(".txt")
  ) {
    return fileName.endsWith(".pdf") ? Pdf01Icon : NoteIcon;
  }

  if (
    fileType.includes("zip") ||
    fileType.includes("archive") ||
    fileName.endsWith(".zip") ||
    fileName.endsWith(".rar")
  ) {
    return FileArchiveIcon;
  }

  if (
    fileType.includes("excel") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx")
  ) {
    return FileSpreadsheetIcon;
  }

  if (fileType.includes("video/")) {
    return Video01Icon;
  }

  if (fileType.includes("audio/")) {
    return HeadphonesIcon;
  }

  if (fileType.startsWith("image/")) {
    return Image01Icon;
  }

  return FileUpIcon;
}

export type UploadedFileItem = {
  file: File | { type: string; name: string; size: number };
  id: string;
};

export type ResourceComposerProps = {
  autoFocus?: boolean;
  disabled?: boolean;
  onFilesChange?: (files: UploadedFileItem[]) => void;
  onResourceLinksChange?: (value: string) => void;
  resourceLinks?: string;
};

export function ResourceComposer({
  autoFocus = false,
  disabled = false,
  onFilesChange,
  onResourceLinksChange,
  resourceLinks,
}: ResourceComposerProps) {
  const [internalResourceLinks, setInternalResourceLinks] = useState("");
  const [internalUploadState, internalUploadActions] = useFileUpload({
    accept: "application/pdf,.pdf,.md,.markdown,.txt,text/plain,text/markdown",
    maxFiles: 10,
    maxSize: 10 * 1024 * 1024,
    multiple: true,
    onFilesChange: (files) => onFilesChange?.(files as UploadedFileItem[]),
  });
  const currentResourceLinks = resourceLinks ?? internalResourceLinks;

  function handleResourceLinksChange(value: string) {
    if (resourceLinks === undefined) {
      setInternalResourceLinks(value);
    }

    onResourceLinksChange?.(value);
  }

  return (
      <div className="rounded-[24px] bg-transparent gap-4 space-y-4 ">
        <div
          className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-white/10 border-dashed bg-black/30 p-4 text-center transition-colors hover:bg-white/[0.03] data-[dragging=true]:bg-white/[0.03]"
          data-dragging={internalUploadState.isDragging || undefined}
          onClick={internalUploadActions.openFileDialog}
          onDragEnter={internalUploadActions.handleDragEnter}
          onDragLeave={internalUploadActions.handleDragLeave}
          onDragOver={internalUploadActions.handleDragOver}
          onDrop={internalUploadActions.handleDrop}
          role="button"
          tabIndex={-1}
        >
          <input
            {...internalUploadActions.getInputProps({
              "aria-label": "Upload files",
              className: "sr-only",
              disabled,
            })}
          />
          <div
            aria-hidden="true"
            className="mb-2 flex size-11 items-center justify-center rounded-full border border-white/10 bg-background"
          >
            <HugeiconsIcon icon={FileUpIcon} size={18} strokeWidth={2} />
          </div>
          <p className="mb-1.5 text-sm font-medium text-white">
            Dump all your assets.
          </p>
          <div className="flex flex-wrap justify-center gap-1 text-xs text-white/35">
            <span>Markdown, text, PDF</span>
            <span>∙</span>
            <span>Max 10 files</span>
            <span>∙</span>
            <span>Up to {formatBytes(10 * 1024 * 1024)}</span>
          </div>
        </div>

        {internalUploadState.errors.length > 0 ? (
          <div className="flex items-center gap-1 text-xs text-red-400" role="alert">
            <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={2} />
            <span>{internalUploadState.errors[0]}</span>
          </div>
        ) : null}

        {internalUploadState.files.length > 0 ? (
          <ScrollArea
            className="h-35 rounded-xl border border-white/10 bg-black/10"
            scrollFade
            scrollbarGutter
          >
            <div className="space-y-2 p-2">
              {(internalUploadState.files as UploadedFileItem[]).map((file) => (
                <div
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-background p-2 pe-3"
                  key={file.id}
                >
                  <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded border border-white/10">
                      <HugeiconsIcon
                        icon={getUploadFileIcon(file)}
                        size={18}
                        strokeWidth={2}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="truncate text-[13px] font-medium text-white">
                        {file.file.name}
                      </p>
                      <p className="text-xs text-white/45">
                        {formatBytes(file.file.size)}
                      </p>
                    </div>
                  </div>

                  <Button
                    aria-label="Remove file"
                    className="-me-2 size-8 text-white/55 hover:bg-transparent hover:text-white"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      internalUploadActions.removeFile(file.id);
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={Remove01Icon} size={16} strokeWidth={2} />
                  </Button>
                </div>
              ))}

              {internalUploadState.files.length > 1 ? (
                <div className="pt-1">
                  <Button
                    onClick={internalUploadActions.clearFiles}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Remove all files
                  </Button>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        ) : null}

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
          <HugeiconsIcon icon={Link05Icon} size={18} strokeWidth={2} />
          <input
            autoFocus={autoFocus}
            className="h-9 w-full border-0 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            disabled={disabled}
            onChange={(event) => handleResourceLinksChange(event.target.value)}
            placeholder="Add public links, separated by commas"
            value={currentResourceLinks}
          />
        </div>
      </div>
  );
}