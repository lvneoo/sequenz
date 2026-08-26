"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

async function validateImageFile(file: File): Promise<string | null> {
  const maxSize = 5 * 1024 * 1024;
  const allowedTypes = new Set(["image/jpeg"]);
  const allowedExtensions = [".jpg", ".jpeg"];
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = allowedExtensions.some((ext) =>
    lowerName.endsWith(ext),
  );

  if (!allowedTypes.has(file.type) || !hasAllowedExtension) {
    return "Only JPG or JPEG images are allowed.";
  }

  if (file.size > maxSize) {
    return "Image must be 5MB or smaller.";
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read image dimensions."));
      img.src = objectUrl;
    });
    return null;
  } catch {
    return "Image could not be loaded. Please choose a valid JPEG file.";
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function UploadButton({ slug }: { slug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      ref={formRef}
      action={`/api/${process.env.NEXT_PUBLIC_API_VERSION}/library/file/upload`}
      encType="multipart/form-data"
      method="post"
    >
      <input name="slug" type="hidden" value={slug} />
      <input
        ref={inputRef}
        name="image"
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        className="sr-only"
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (!file) return;

          const error = await validateImageFile(file);

          if (error) {
            input.setCustomValidity(error);
            input.reportValidity();
            input.value = "";
            return;
          }

          input.setCustomValidity("");
          formRef.current?.requestSubmit();
        }}
      />
      <Button
        variant="ghost"
        onClick={() => {
          // Media night: keep the file picker flow tied to the visible upload control.
          inputRef.current?.click();
        }}
      >
        Upload Image
      </Button>
    </form>
  );
}
