import sharp from "sharp";
import { put } from "@vercel/blob";
import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import { getProfileLibraryCacheTag } from "@/utils/db/library/fetch";
import { db } from "@/utils/db/db";
import { fetchProfileBySlug } from "@/utils/db/profiles/fetch";
import { profileLibrary } from "@/utils/db/schema";

function getLibraryRedirectUrl(
  request: NextRequest,
  slug: string,
  status: string,
) {
  return new URL(
    `/profiles/${encodeURIComponent(slug)}/library?status=${encodeURIComponent(status)}`,
    request.url,
  );
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

async function validateImageFile(image: File): Promise<boolean> {
  const lowerName = image.name.toLowerCase();
  const hasAllowedExtension =
    lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg");

  if (image.type !== "image/jpeg" || !hasAllowedExtension) {
    return false;
  }

  if (image.size > MAX_IMAGE_SIZE) {
    return false;
  }

  const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();

  if (!metadata.width || !metadata.height || metadata.format !== "jpeg") {
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  const userId = await requireAuthenticatedUserId();
  const formData = await request.formData();
  const profileSlug = formData.get("slug");
  const image = formData.get("image");

  if (typeof profileSlug !== "string" || !profileSlug) {
    return NextResponse.json(
      { error: "Missing profile slug" },
      { status: 400 },
    );
  }

  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.redirect(
      getLibraryRedirectUrl(request, profileSlug, "invalid_file"),
      303,
    );
  }

  if (!(await validateImageFile(image))) {
    return NextResponse.redirect(
      getLibraryRedirectUrl(request, profileSlug, "invalid_file"),
      303,
    );
  }

  const extension = image.name.toLowerCase().endsWith(".jpeg") ? "jpeg" : "jpg";

  const profile = await fetchProfileBySlug(userId, profileSlug);

  if (!profile) {
    return new NextResponse("Not found", { status: 404 });
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!blobToken) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN");
  }

  const fileStem =
    image.name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "library-image";

  const blob = await put(
    `profiles/${profile.profileId}/library/${fileStem}.${extension}`,
    image,
    {
      access: "private",
      addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
      contentType: "image/jpeg",
      token: blobToken,
    },
  );

  await db.insert(profileLibrary).values({
    profileId: profile.profileId,
    image_url: blob.url,
    title: fileStem,
  });

  revalidateTag(getProfileLibraryCacheTag(userId, profileSlug), { expire: 0 });

  return NextResponse.redirect(
    getLibraryRedirectUrl(request, profileSlug, "uploaded"),
    303,
  );
}
