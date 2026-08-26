import sharp from "sharp";
import { put } from "@vercel/blob";
import { fetchProfileLibraryAssetsForSequence } from "@/utils/db/library/fetch";
import type { GeneratedSequence } from "@/workflows/sequences/steps/generateContent";
import type { PreparedSequenceContext } from "@/workflows/sequences/steps/createPublishedSequence";

export type PreparedSequenceStep = {
  stepNumber: number;
  content: string;
  overlayText: string;
  imageUrl: string;
};

const MAX_TEXT_WIDTH = 960;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function overlapScore(haystack: string, themeWords: Set<string>): number {
  const words = tokenize(haystack);
  if (words.length === 0 || themeWords.size === 0) {
    return 0;
  }

  return words.reduce((score, word) => score + (themeWords.has(word) ? 1 : 0), 0);
}

function pickAssetForStep(
  sortedAssets: ReturnType<typeof rankAssets>,
  usedLibraryIds: Set<string>,
): ReturnType<typeof rankAssets>[number] {
  for (const asset of sortedAssets) {
    if (!usedLibraryIds.has(asset.libraryId)) {
      return asset;
    }
  }

  return sortedAssets[0];
}

function rankAssets(
  assets: Awaited<ReturnType<typeof fetchProfileLibraryAssetsForSequence>>,
  stepText: string,
  theme: string,
) {
  const themeWords = new Set([...tokenize(theme), ...tokenize(stepText)]);

  return [...assets]
    .map((asset) => {
      const searchable = [asset.title, asset.description, asset.aiClassification]
        .filter((value): value is string => Boolean(value))
        .join(" ");

      return {
        ...asset,
        score: overlapScore(searchable, themeWords),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function wrapSvgText(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const proposal = current ? `${current} ${word}` : word;
    if (proposal.length > 20 && current) {
      lines.push(current);
      current = word;
      continue;
    }
    current = proposal;
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 3).join("\n");
}

async function processImageWithOverlay(
  sourceImageUrl: string,
  overlayText: string,
  destinationPathname: string,
): Promise<string> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!blobToken) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN");
  }

  const response = await fetch(sourceImageUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Source image is not accessible: ${sourceImageUrl}`);
  }

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const image = sharp(sourceBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read source image dimensions");
  }

  const width = metadata.width;
  const height = metadata.height;
  const fontSize = Math.max(42, Math.round(width * 0.06));
  const padding = Math.round(width * 0.05);
  const lineHeight = Math.round(fontSize * 1.2);
  const wrapped = wrapSvgText(overlayText);
  const lineCount = wrapped.split("\n").length;
  const blockHeight = lineCount * lineHeight + padding * 2;
  const y = height - blockHeight - padding;

  const overlaySvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${padding}" y="${y}" width="${Math.min(MAX_TEXT_WIDTH, width - padding * 2)}" height="${blockHeight}" rx="24" fill="rgba(0, 0, 0, 0.62)"/>
    <text x="${padding * 1.5}" y="${y + padding + fontSize}" font-size="${fontSize}" font-family="Arial, Helvetica, sans-serif" fill="#ffffff" font-weight="700" style="white-space: pre-line">${wrapped.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
  </svg>`;

  const processedBuffer = await image
    .composite([{ input: Buffer.from(overlaySvg) }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const uploaded = await put(destinationPathname, processedBuffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "image/jpeg",
    cacheControlMaxAge: 60 * 60 * 24 * 30,
    token: blobToken,
  });

  return uploaded.url;
}

export async function processAssetsForSequence(
  context: PreparedSequenceContext,
  generated: GeneratedSequence,
): Promise<PreparedSequenceStep[]> {
  "use step";

  const assets = await fetchProfileLibraryAssetsForSequence(context.profileId);
  if (assets.length === 0) {
    throw new Error(`No library assets available for profile ${context.profileId}`);
  }

  const usedLibraryIds = new Set<string>();
  const prepared: PreparedSequenceStep[] = [];

  for (const step of generated.steps) {
    const ranked = rankAssets(assets, `${step.content} ${step.overlayText}`, generated.theme);
    const chosenAsset = pickAssetForStep(ranked, usedLibraryIds);
    usedLibraryIds.add(chosenAsset.libraryId);

    const imageUrl = await processImageWithOverlay(
      chosenAsset.imageUrl,
      step.overlayText,
      `profiles/${context.profileId}/published/${context.publishedSequenceId}/story-step-${step.stepNumber}.jpg`,
    );

    prepared.push({
      stepNumber: step.stepNumber,
      content: step.content,
      overlayText: step.overlayText,
      imageUrl,
    });
  }

  return prepared.sort((a, b) => a.stepNumber - b.stepNumber);
}
