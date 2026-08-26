import { openai } from "@ai-sdk/openai";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  gateway,
  generateText,
  stepCountIs,
  tool,
  ToolLoopAgent,
} from "ai";
import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import {
  assertFeatureEnabled,
  BillingFeatureError,
  getBillingAccessForUser,
} from "@/utils/billing/entitlements";
import { db } from "@/utils/db/db";
import { getProfileSequencesCacheTag } from "@/utils/db/sequences/library/fetch";
import { profileSequenceConfig } from "@/utils/db/schema";
import {
  createBaseSequenceConfig,
  CreateSequenceConfigError,
  createSequenceConfigSchema,
  GENERIC_ERROR_MESSAGE,
  getValidationErrorMessage,
  RESOURCE_FILES_REQUIRED_ERROR_MESSAGE,
} from "@/utils/sequences/create-config";

export const maxDuration = 60;

const PRODUCT_CONTEXT_MODEL_ID = "openai/gpt-5-nano";
const TEXT_FILE_CHAR_LIMIT = 40_000;

type UploadedResourceFile = {
  file: File;
  fileKey: string;
  filename: string;
  mediaType: string;
};

export async function POST(request: Request) {
  let sequenceConfigId: string | null = null;

  try {
    const userId = await requireAuthenticatedUserId();

    const billing = await getBillingAccessForUser(userId);
    assertFeatureEnabled(
      billing,
      "ai_generation",
      "AI Story Generation is not included in your active billing plan",
    );

    const parsedForm = await parseRequestFormData(request);

    if (!parsedForm.success) {
      return jsonError(parsedForm.error, 400);
    }

    const baseConfig = await createBaseSequenceConfig({
      input: parsedForm.data,
      userId,
    });

    sequenceConfigId = baseConfig.sequenceConfigId;

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          try {
            const description = await streamSequenceConfigReasoning({
              cta: baseConfig.cta,
              productUrl: parsedForm.data.productUrl.trim(),
              resourceFiles: parsedForm.resourceFiles,
              resourceLinks: parsedForm.resourceLinks,
              sequenceType: parsedForm.data.sequenceType,
              writer,
            });

            if (!description) {
              throw new Error("Product context agent returned empty markdown");
            }

            if (!sequenceConfigId) {
              throw new Error("Missing sequence config id");
            }

            await db
              .update(profileSequenceConfig)
              .set({ description })
              .where(eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId));

            revalidateTag(
              getProfileSequencesCacheTag(userId, parsedForm.data.profileSlug),
              { expire: 0 },
            );

            writer.write({
              type: "data-sequence-config-result",
              data: {
                redirectTo: `/profiles/${parsedForm.data.profileSlug}/sequences/${sequenceConfigId}`,
              },
            });
          } catch (error) {
            if (sequenceConfigId) {
              await db
                .delete(profileSequenceConfig)
                .where(eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId));
              sequenceConfigId = null;
            }

            throw error;
          }
        },
        onError: (error) => {
          if (error instanceof BillingFeatureError) {
            return error.message;
          }

          if (error instanceof CreateSequenceConfigError) {
            return error.message;
          }

          return GENERIC_ERROR_MESSAGE;
        },
      }),
    });
  } catch (error) {
    if (sequenceConfigId) {
      await db
        .delete(profileSequenceConfig)
        .where(eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId));
    }

    if (error instanceof BillingFeatureError) {
      return jsonError(error.message, 402);
    }

    if (error instanceof CreateSequenceConfigError) {
      return jsonError(error.message, error.status);
    }

    console.error("Failed to create sequence config.", error);
    return jsonError(GENERIC_ERROR_MESSAGE, 500);
  }
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function parseRequestFormData(request: Request) {
  try {
    const formData = await request.formData();
    const parsedInput = createSequenceConfigSchema.safeParse({
      profileSlug: formData.get("profileSlug"),
      sequenceType: formData.get("sequenceType"),
      sequenceTitle: formData.get("sequenceTitle"),
      productUrl: formData.get("productUrl"),
      ctaKeyword: formData.get("ctaKeyword"),
      postingDaysOfWeek: formData.getAll("postingDaysOfWeek"),
      postingTime: formData.get("postingTime"),
      timezoneOffsetMinutes: formData.get("timezoneOffsetMinutes"),
    });

    if (!parsedInput.success) {
      return {
        error: getValidationErrorMessage(formData),
        success: false as const,
      };
    }

    const resourceLinksValue = formData.get("resourceLinks");
    const rawFiles = formData.getAll("resourceFiles");
    if (rawFiles.length > 10) throw new Error("Too many files");
    const resourceFiles = rawFiles
      .filter((value): value is File => value instanceof File && value.size > 0)
      .map((file, index) => {
        if (file.size > 10 * 1024 * 1024) throw new Error(`File too large: ${file.name}`);
        const mediaType = normalizeFileMediaType(file);
        if (!mediaType.startsWith("text/") && mediaType !== "application/pdf") throw new Error(`Unsupported file type: ${mediaType}`);
        return { file, fileKey: `file-${index + 1}`, filename: file.name, mediaType };
      });

    if (!resourceFiles.length) {
      return {
        error: RESOURCE_FILES_REQUIRED_ERROR_MESSAGE,
        success: false as const,
      };
    }

    return {
      data: parsedInput.data,
      resourceFiles,
      resourceLinks: extractResourceLinks(
        typeof resourceLinksValue === "string" ? resourceLinksValue : "",
      ),
      success: true as const,
    };
  } catch {
    return {
      error: GENERIC_ERROR_MESSAGE,
      success: false as const,
    };
  }
}

async function streamSequenceConfigReasoning({
  cta,
  productUrl,
  resourceFiles,
  resourceLinks,
  sequenceType,
  writer,
}: {
  cta: string;
  productUrl: string;
  resourceFiles: UploadedResourceFile[];
  resourceLinks: string[];
  sequenceType: string;
  writer: Parameters<
    Parameters<typeof createUIMessageStream>[0]["execute"]
  >[0]["writer"];
}) {
  const result = await createProductContextAgent(resourceFiles).stream({
    prompt: buildAgentPrompt({
      cta,
      publicLinks: dedupeStrings([productUrl, ...resourceLinks]),
      resourceFiles,
      sequenceType,
    }),
  });

  writer.merge(result.toUIMessageStream({ sendReasoning: true }));

  return (await result.text).trim();
}

function createProductContextAgent(resourceFiles: UploadedResourceFile[]) {
  const filesByKey = new Map(resourceFiles.map((file) => [file.fileKey, file]));

  return new ToolLoopAgent({
    instructions: [
      "You build the canonical product context markdown used for downstream sequence generation.",
      "Your output must be detailed and reliable enough that another model can generate a strong sequence without reopening the original sources.",
      "Collect and structure only these eight blocks: Core offer, Target buyer, Proof and results, Before to after transformation, Unique mechanism, Offer structure, Tone and style, and Unresolved gaps or missing information.",
      "Inspect every uploaded file before you finish.",
      "If public links are provided, inspect each one with web_search before you finish.",
      "Start by calling list_uploaded_files when files are available.",
      "Use read_uploaded_text_file for markdown, text, csv, or other text-based uploads.",
      "Use inspect_uploaded_pdf for PDF uploads.",
      "Do not ask follow-up questions. Work only from the submitted resources, links, CTA, and product URL.",
      "Do not invent claims, metrics, or proof. When evidence is missing or weak, write Unknown and explain the gap.",
      "Return only markdown.",
      "Use these top-level sections exactly in this order:",
      "# Canonical Product Context",
      "## Core Offer",
      "## Target Buyer",
      "## Proof and Results",
      "## Before to After Transformation",
      "## Unique Mechanism",
      "## Offer Structure",
      "## Tone and Style",
      "## Raw Extracted Context From Uploaded Files",
      "## Raw Extracted Context From Linked Sources",
      "## Unresolved Gaps Or Missing Information",
      "Inside each structured section, list fields as markdown bullets using these exact keys when known:",
      "Core Offer: offer_name, offer_type, primary_outcome, CTA_type, CTA_text.",
      "Target Buyer: ICP_label, industry, sophistication_level, desired_outcomes[], pain_points[].",
      "Proof and Results: founder_results[], client_results[], performance_metrics[], proof_assets[].",
      "Each result or metric should capture the metric, timeframe, source, and confidence_or_proof when available.",
      "Before to After Transformation: before_state[], after_state[], emotional_before[], emotional_after[].",
      "Unique Mechanism: mechanism_name, mechanism_summary, channels[], differentiators[].",
      "Offer Structure: delivery_model, spots_available, enrollment_window, offer_components[], price_anchor_optional.",
      "Tone and Style: tone_profile, brand_voice_picks[], banned_phrases[], compliance_level.",
      "For arrays, use markdown bullet lists.",
      "Prefer concise but information-dense bullets over fluffy prose.",
      "Prefer concrete, source-grounded wording over generic summaries.",
      "When multiple sources support the same point, synthesize them into one stronger bullet instead of repeating yourself.",
      "When a detail is inferred rather than explicit, label it as Inferred and explain why.",
    ].join(" "),
    model: gateway(PRODUCT_CONTEXT_MODEL_ID),
    providerOptions: {
      openai: {
        reasoningSummary: "auto",
      },
    },
    stopWhen: stepCountIs(5),
    tools: {
      list_uploaded_files: tool({
        description:
          "List every uploaded file that must be inspected before finishing.",
        inputSchema: z.object({}),
        execute: async () =>
          resourceFiles.map((file) => ({
            fileKey: file.fileKey,
            filename: file.filename,
            mediaType: file.mediaType,
          })),
      }),
      read_uploaded_text_file: tool({
        description:
          "Read the contents of an uploaded text-based file. Use this for every text-based upload.",
        inputSchema: z.object({
          fileKey: z
            .string()
            .describe("The fileKey returned by list_uploaded_files"),
        }),
        execute: async ({ fileKey }) => {
          const file = filesByKey.get(fileKey);

          if (!file) {
            throw new Error(`Unknown file: ${fileKey}`);
          }

          if (!isTextFile(file)) {
            throw new Error(`File is not a text upload: ${file.filename}`);
          }

          const text = await file.file.text();
          const wasTruncated = text.length > TEXT_FILE_CHAR_LIMIT;

          return {
            content: wasTruncated ? text.slice(0, TEXT_FILE_CHAR_LIMIT) : text,
            fileKey: file.fileKey,
            filename: file.filename,
            truncated: wasTruncated,
          };
        },
      }),
      inspect_uploaded_pdf: tool({
        description:
          "Inspect an uploaded PDF file and extract raw offer, proof, buyer, transformation, and mechanism context in markdown.",
        inputSchema: z.object({
          fileKey: z
            .string()
            .describe("The fileKey returned by list_uploaded_files"),
          focus: z
            .string()
            .min(1)
            .describe("What context you want extracted from the PDF"),
        }),
        execute: async ({ fileKey, focus }) => {
          const file = filesByKey.get(fileKey);

          if (!file) {
            throw new Error(`Unknown file: ${fileKey}`);
          }

          if (!isPdfFile(file)) {
            throw new Error(`File is not a PDF upload: ${file.filename}`);
          }

          const pdfResult = await generateText({
            model: gateway(PRODUCT_CONTEXT_MODEL_ID),
            messages: [
              {
                role: "user",
                content: [
                  {
                    text: [
                      "Inspect this uploaded PDF and extract raw, source-grounded product context in markdown.",
                      `Focus: ${focus}`,
                      "",
                      "Prioritize concrete statements about the offer, target buyer, proof, before and after states, emotional changes, mechanism, channels, differentiators, delivery model, spots, timing, inclusions, tone, and compliance constraints.",
                    ].join("\n"),
                    type: "text",
                  },
                  {
                    data: new Uint8Array(await file.file.arrayBuffer()),
                    filename: file.filename,
                    mediaType: "application/pdf",
                    type: "file",
                  },
                ],
              },
            ],
            providerOptions: {
              openai: {
                reasoningSummary: "auto",
              },
            },
          });

          return {
            extractedMarkdown: pdfResult.text,
            fileKey: file.fileKey,
            filename: file.filename,
          };
        },
      }),
      web_search: openai.tools.webSearch({}),
    },
  });
}

function buildAgentPrompt({
  cta,
  publicLinks,
  resourceFiles,
  sequenceType,
}: {
  cta: string;
  publicLinks: string[];
  resourceFiles: UploadedResourceFile[];
  sequenceType: string;
}) {
  return [
    "Create the canonical product context markdown for this sequence configuration.",
    `Sequence type: ${sequenceType}`,
    `CTA keyword: ${cta}`,
    "",
    "This output will be stored and used as the main source of truth for sequence generation.",
    "Be precise, niche-specific, and proof-heavy when the source material supports it.",
    "",
    "Collect and structure these blocks only:",
    "1. Core offer",
    "2. Target buyer",
    "3. Proof and results",
    "4. Before to after transformation",
    "5. Unique mechanism",
    "6. Offer structure",
    "7. Tone and style",
    "8. Unresolved gaps or missing information",
    "",
    "Use these collection questions as extraction targets:",
    "Core offer: What do you help people achieve? What do you sell? What is the main CTA?",
    "Target buyer: Who is the ideal client? What level are they at? What do they want most? What frustrates them most?",
    "Proof and results: Best personal result, best client result, metrics from ads, funnel, revenue, or conversion, screenshots or links as proof.",
    "Before to after transformation: What was life or business like before? What changed after? What does it look like now?",
    "Unique mechanism: What system or method caused the result? Which tools or channels are involved? What makes the approach different?",
    "Offer structure: How do people work with the offer? Is it 1:1, group, DFY, or course? How many spots? When does it open or close? What is included?",
    "Tone and style: tone choice, writing style, allowed intensity, allowed flex, and banned phrases or claims.",
    "",
    "Normalize the structured fields like this:",
    "- offer_type should be one of: service, course, community, software, agency, unknown.",
    "- sophistication_level should be one of: beginner, growing, advanced, unknown.",
    "- tone_profile should be one of: calm, luxury, aggressive, mentor, authority, controversial, unknown.",
    "- brand_voice_picks[] should reflect style choices such as short punchy, story-based, premium, direct-response, plus allowed intensity and allowed flex when supported.",
    "- proof_assets[] should identify the asset and where it came from, such as Stripe screenshot, ad manager screenshot, CRM export, testimonial, case-study page, Loom, or landing page proof.",
    "",
    "For founder_results[], client_results[], and performance_metrics[], format each bullet as a compact record when possible:",
    "- metric: ...; timeframe: ...; source: ...; confidence_or_proof: ...",
    "",
    "For before_state[], after_state[], emotional_before[], and emotional_after[], prefer short concrete bullets instead of long sentences.",
    "",
    "Public links you must inspect with web_search:",
    publicLinks.length
      ? publicLinks.map((link) => `- ${link}`).join("\n")
      : "- None provided",
    "",
    "Uploaded files you must inspect before finishing:",
    resourceFiles.length
      ? resourceFiles
          .map(
            (file) => `- ${file.fileKey}: ${file.filename} (${file.mediaType})`,
          )
          .join("\n")
      : "- None uploaded",
    "",
    "Rules:",
    "- Every claim must be source-grounded.",
    "- When evidence conflicts, note the conflict explicitly.",
    "- When information is missing, write Unknown instead of guessing.",
    "- Do not output sales copy. Output canonical source material for future generation.",
    "- Keep raw extracted context separate from the structured blocks.",
  ].join("\n");
}

function extractResourceLinks(text: string) {
  return [...text.matchAll(/https?:\/\/[^\s<>()]+/g)].map((item) => item[0]);
}

function normalizeFileMediaType(file: File) {
  return file.type?.trim() || "application/octet-stream";
}

function isPdfFile(file: UploadedResourceFile) {
  return file.mediaType === "application/pdf";
}

function isTextFile(file: UploadedResourceFile) {
  return (
    file.mediaType.startsWith("text/") ||
    [
      "application/json",
      "application/ld+json",
      "application/markdown",
      "application/x-markdown",
      "text/markdown",
      "application/xml",
      "text/xml",
      "text/csv",
      "application/csv",
    ].includes(file.mediaType)
  );
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
