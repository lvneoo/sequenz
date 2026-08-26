import { gateway, generateObject } from "ai";
import { z } from "zod";
import type { SequenceGenerationContext } from "@/workflows/sequences/steps/pollContext";

const sequenceOutputSchema = z.object({
  theme: z.string().min(1),
  steps: z
    .array(
      z.object({
        stepNumber: z.number().int().min(1),
        content: z.string().min(1),
        overlayText: z.string().min(1).max(120),
      }),
    )
    .min(5)
    .max(6),
});

export type GeneratedSequenceStep = {
  stepNumber: number;
  content: string;
  overlayText: string;
};

export type GeneratedSequence = {
  theme: string;
  steps: GeneratedSequenceStep[];
};

const STYLE_REFERENCES = `
Example style references (for tone and structure only, do not copy verbatim):

Sequence 1 style notes:
- Starts with a bold credibility hook.
- Expands into pain and operational bottlenecks.
- Transitions to proof and transformation.
- Introduces mechanism/solution.
- Ends with authority proof and CTA setup.

Sequence 2 style notes:
- Fast, short, punchy lines.
- Concrete metrics and outcomes.
- Clear pain-vs-solution contrast.
- Scarcity and urgency when relevant.
- Strong direct CTA.
`;

export async function generateContent(
  context: SequenceGenerationContext,
): Promise<GeneratedSequence> {
  "use step";

  const prompt = [
    "Create an Instagram story sequence with 5 to 6 slides.",
    "Return text-only content.",
    "Use short punchy lines optimized for story slides.",
    "For each slide include overlayText that is short (2-8 words) and easy to read on image.",
    "Use pain -> solution -> proof -> CTA flow.",
    "Do not include hashtags.",
    "Do not use markdown headers.",
    "Do not copy reference examples verbatim.",
    "Use brand data below to personalize:",
    `Name: ${context.name}`,
    `CTA keyword: ${context.cta}`,
    `Product URL: ${context.productUrl}`,
    `Description: ${context.description ?? "Not provided"}`,
    `AI brand guidelines: ${context.aiBrandGuidelines ?? "Not provided"}`,
    STYLE_REFERENCES,
  ].join("\n");

  const { object } = await generateObject({
    model: gateway("openai/gpt-5-mini"),
    schema: sequenceOutputSchema,
    system:
      "You are an elite direct-response Instagram story copywriter. Keep each step concise, credible, and conversion-focused.",
    prompt,
  });

  return {
    theme: object.theme.trim(),
    steps: object.steps
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .map((step, index) => ({
        stepNumber: index + 1,
        content: step.content.trim(),
        overlayText: step.overlayText.trim(),
      })),
  };
}
