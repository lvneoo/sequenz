import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/utils/db/db";
import { profileSequenceConfig, profiles } from "@/utils/db/schema";
import {
  buildSequenceSchedule,
  type SequenceWeekday,
} from "@/utils/sequences/schedule";
import { sequenceTypes } from "@/utils/types";

export const uiWeekdaySchema = z.enum([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

export const createSequenceConfigSchema = z.object({
  profileSlug: z.string().min(1),
  sequenceType: z.enum(sequenceTypes),
  sequenceTitle: z.string().trim().min(1),
  productUrl: z.string().trim().min(1),
  ctaKeyword: z.string().trim().min(1),
  postingDaysOfWeek: z.array(uiWeekdaySchema).min(1),
  postingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
});

export const UI_TO_SEQUENCE_WEEKDAY: Record<
  z.infer<typeof uiWeekdaySchema>,
  SequenceWeekday
> = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

export const GENERIC_ERROR_MESSAGE = "An error occurred. Try again";
export const REQUIRED_FIELDS_ERROR_MESSAGE =
  "Sequence title, product link, CTA keyword, post frequency, and time are required.";
export const POSTING_DAYS_REQUIRED_ERROR_MESSAGE =
  "Select at least one posting day.";
export const RESOURCE_FILES_REQUIRED_ERROR_MESSAGE =
  "Upload at least one file.";
export const CTA_NOT_UNIQUE_ERROR_MESSAGE =
  "CTA keyword must be unique per profile.";
export const CTA_UNIQUE_CONSTRAINT =
  "profile_sequence_config_profile_id_cta_unique";

export class CreateSequenceConfigError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CreateSequenceConfigError";
  }
}

export function normalizeCtaKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function isUniqueViolation(error: unknown, key: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const { code, constraint, message } = error as {
    code?: string;
    constraint?: string;
    message?: string;
  };

  return (
    code === "23505" &&
    (constraint?.includes(key) === true ||
      message?.includes(key) === true ||
      message?.includes("duplicate key value violates unique constraint") ===
        true)
  );
}

export function getValidationErrorMessage(formData: FormData) {
  const sequenceTitle = formData.get("sequenceTitle");
  const productUrl = formData.get("productUrl");
  const ctaKeyword = formData.get("ctaKeyword");
  const postingTime = formData.get("postingTime");
  const postingDaysOfWeek = formData
    .getAll("postingDaysOfWeek")
    .filter((value): value is string => typeof value === "string");
  const resourceFiles = formData
    .getAll("resourceFiles")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (
    typeof sequenceTitle !== "string" ||
    typeof productUrl !== "string" ||
    typeof ctaKeyword !== "string" ||
    typeof postingTime !== "string" ||
    !sequenceTitle.trim() ||
    !productUrl.trim() ||
    !ctaKeyword.trim() ||
    !postingTime
  ) {
    return REQUIRED_FIELDS_ERROR_MESSAGE;
  }

  if (!postingDaysOfWeek.length) {
    return POSTING_DAYS_REQUIRED_ERROR_MESSAGE;
  }

  if (!resourceFiles.length) {
    return RESOURCE_FILES_REQUIRED_ERROR_MESSAGE;
  }

  return GENERIC_ERROR_MESSAGE;
}

export async function createBaseSequenceConfig({
  input,
  userId,
}: {
  input: z.infer<typeof createSequenceConfigSchema>;
  userId: string;
}) {
  const [profile] = await db
    .select({
      profileId: profiles.profileId,
    })
    .from(profiles)
    .where(
      and(
        eq(profiles.userId, userId),
        eq(profiles.profileSlug, input.profileSlug),
      ),
    )
    .limit(1);

  if (!profile) {
    throw new CreateSequenceConfigError(GENERIC_ERROR_MESSAGE, 404);
  }

  const cta = normalizeCtaKeyword(input.ctaKeyword);
  const existingProfileCtas = await db
    .select({
      cta: profileSequenceConfig.cta,
    })
    .from(profileSequenceConfig)
    .where(eq(profileSequenceConfig.profileId, profile.profileId));

  if (existingProfileCtas.some((entry) => entry.cta === cta)) {
    throw new CreateSequenceConfigError(CTA_NOT_UNIQUE_ERROR_MESSAGE, 409);
  }

  const schedule = buildSequenceSchedule(
    input.postingDaysOfWeek.map((day) => UI_TO_SEQUENCE_WEEKDAY[day]),
    input.postingTime,
    input.timezoneOffsetMinutes,
  );

  try {
    const [insertedConfig] = await db
      .insert(profileSequenceConfig)
      .values({
        profileId: profile.profileId,
        sequenceType: input.sequenceType,
        name: input.sequenceTitle.trim(),
        cta,
        productUrl: input.productUrl.trim(),
        cronExpression: schedule.cronExpression,
        nextWorkflowRunAt: schedule.nextWorkflowRunAt,
      })
      .returning({
        sequenceConfigId: profileSequenceConfig.sequenceConfigId,
      });

    if (!insertedConfig) {
      throw new Error("Failed to create sequence config");
    }

    return {
      cta,
      sequenceConfigId: insertedConfig.sequenceConfigId,
    };
  } catch (error) {
    if (isUniqueViolation(error, CTA_UNIQUE_CONSTRAINT)) {
      throw new CreateSequenceConfigError(CTA_NOT_UNIQUE_ERROR_MESSAGE, 409);
    }

    throw error;
  }
}
