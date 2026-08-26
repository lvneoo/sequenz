import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import { fetchProfileSequenceConfigById } from "@/utils/db/sequences/config/fetch";
import { updateProfileSequence } from "@/utils/db/sequences/library/update";
import {
  CTA_NOT_UNIQUE_ERROR_MESSAGE,
  CTA_UNIQUE_CONSTRAINT,
  GENERIC_ERROR_MESSAGE,
  isUniqueViolation,
  normalizeCtaKeyword,
  uiWeekdaySchema,
  UI_TO_SEQUENCE_WEEKDAY,
} from "@/utils/sequences/create-config";
import { buildSequenceSchedule } from "@/utils/sequences/schedule";
import { sequenceTypes } from "@/utils/types";

const baseSchema = z.object({
  profileSlug: z.string().min(1),
  sequenceConfigId: z.string().min(1),
});

const descriptionUpdateSchema = baseSchema.extend({
  description: z.string().max(200_000),
}).strict();

const activeUpdateSchema = baseSchema.extend({
  isActive: z.boolean(),
}).strict();

const configUpdateSchema = baseSchema.extend({
  sequenceType: z.enum(sequenceTypes),
  sequenceTitle: z.string().trim().min(1),
  productUrl: z.string().trim().min(1),
  ctaKeyword: z.string().trim().min(1),
  postingDaysOfWeek: z.array(uiWeekdaySchema).min(1),
  postingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = await requireAuthenticatedUserId();
  const rawBody = (await request.json().catch(() => null)) as unknown;

  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const existing = baseSchema.safeParse(rawBody);

  if (!existing.success) {
    return NextResponse.json(
      { error: "Missing sequence config update fields" },
      { status: 400 },
    );
  }

  const config = await fetchProfileSequenceConfigById(
    userId,
    existing.data.profileSlug,
    existing.data.sequenceConfigId,
  );

  if (!config) {
    return NextResponse.json({ error: "Sequence config not found" }, { status: 404 });
  }

  const descriptionInput = descriptionUpdateSchema.safeParse(rawBody);

  if (descriptionInput.success) {
    await updateProfileSequence({
      userId,
      profileSlug: descriptionInput.data.profileSlug,
      sequenceConfigId: descriptionInput.data.sequenceConfigId,
      updates: {
        description: descriptionInput.data.description,
      },
    });

    return NextResponse.json({ ok: true });
  }

  const activeInput = activeUpdateSchema.safeParse(rawBody);

  if (activeInput.success) {
    await updateProfileSequence({
      userId,
      profileSlug: activeInput.data.profileSlug,
      sequenceConfigId: activeInput.data.sequenceConfigId,
      updates: {
        isActive: activeInput.data.isActive,
      },
    });

    return NextResponse.json({ ok: true });
  }

  const configInput = configUpdateSchema.safeParse(rawBody);

  if (!configInput.success) {
    return NextResponse.json(
      { error: "Missing sequence config update fields" },
      { status: 400 },
    );
  }

  const cta = normalizeCtaKeyword(configInput.data.ctaKeyword);
  const schedule = buildSequenceSchedule(
    configInput.data.postingDaysOfWeek.map((day) => UI_TO_SEQUENCE_WEEKDAY[day]),
    configInput.data.postingTime,
    configInput.data.timezoneOffsetMinutes,
  );

  try {
    await updateProfileSequence({
      userId,
      profileSlug: configInput.data.profileSlug,
      sequenceConfigId: configInput.data.sequenceConfigId,
      updates: {
        cta,
        cronExpression: schedule.cronExpression,
        name: configInput.data.sequenceTitle.trim(),
        nextWorkflowRunAt: schedule.nextWorkflowRunAt,
        productUrl: configInput.data.productUrl.trim(),
        sequenceType: configInput.data.sequenceType,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error, CTA_UNIQUE_CONSTRAINT)) {
      return NextResponse.json(
        { error: CTA_NOT_UNIQUE_ERROR_MESSAGE },
        { status: 409 },
      );
    }

    console.error("Failed to update sequence config.", error);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
