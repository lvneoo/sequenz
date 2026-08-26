import {
  check,
  integer,
  pgTable,
  pgEnum,
  unique,
  text,
  timestamp,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { sequenceTypes } from "@/utils/types";

export const profileSequenceTypeEnum = pgEnum(
  "profile_sequence_type",
  sequenceTypes,
);

export const profiles = pgTable("profiles", {
  profileId: varchar("profile_id", { length: 128 })
    .primaryKey()
    .$defaultFn(() => createId()),

  // creator of the profile
  userId: text("user_id").notNull(),
  profileSlug: text("profile_slug").notNull().unique(),
  profilePictureUrl: text("profile_picture_url"),
  onboardingAssetsComplete: boolean("onboarding_assets_complete")
    .default(false)
    .notNull(),
  onboardingSequenceComplete: boolean("onboarding_sequence_complete")
    .default(false)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const profileSecrets = pgTable("profile_secrets", {
  secretId: varchar("secret_id", { length: 128 })
    .primaryKey()
    .$defaultFn(() => createId()),

  profileId: varchar("profile_id", { length: 128 })
    .notNull()
    .unique()
    .references(() => profiles.profileId, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),

  apiKey: text("api_key"),
  accessToken: text("access_token"),
  accessTokenType: text("access_token_type"),
  accessTokenPermissions: text("access_token_permissions"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshToken: text("refresh_token"),
  externalUserId: text("external_user_id").unique(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const profileSequenceConfig = pgTable(
  "profile_sequence_config",
  {
    sequenceConfigId: varchar("sequence_config_id", { length: 128 })
      .primaryKey()
      .$defaultFn(() => createId()),

    profileId: varchar("profile_id", { length: 128 })
      .notNull()
      .references(() => profiles.profileId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    name: text("name").notNull(),
    sequenceType: profileSequenceTypeEnum("sequence_type"),
    cta: text("cta").notNull(),
    isActive: boolean("is_active").default(true).notNull(),

    productUrl: text("product_url").notNull(),
    description: text("description"),
    aiBrandGuidelines: text("ai_brand_guidelines"),

    cronExpression: text("cron_expression").notNull(),
    nextWorkflowRunAt: timestamp("next_workflow_run_at", {
      withTimezone: true,
    }).notNull(),

    sortOrder: integer("sort_order").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("profile_sequence_config_profile_id_cta_unique").on(
      table.profileId,
      table.cta,
    ),
  ],
);

export const publishedSequence = pgTable(
  "published_sequence",
  {
    publishedSequenceId: varchar("published_sequence_id", { length: 128 })
      .primaryKey()
      .$defaultFn(() => createId()),
    sequenceConfigId: varchar("sequence_config_id", { length: 128 })
      .notNull()
      .references(() => profileSequenceConfig.sequenceConfigId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    isPublished: boolean("is_published").default(false).notNull(),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "published_sequence_state_consistency_check",
      sql`(${table.isPublished} and ${table.publishedAt} is not null) or (not ${table.isPublished} and ${table.publishedAt} is null)`,
    ),
  ],
);

export const sequenceStep = pgTable(
  "sequence_step",
  {
    sequenceStepId: varchar("sequence_step_id", { length: 128 })
      .primaryKey()
      .$defaultFn(() => createId()),
    publishedSequenceId: varchar("published_sequence_id", { length: 128 })
      .notNull()
      .references(() => publishedSequence.publishedSequenceId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sequenceConfigId: varchar("sequence_config_id", { length: 128 })
      .notNull()
      .references(() => profileSequenceConfig.sequenceConfigId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    stepNumber: integer("step_number").notNull(),
    content: text("content").notNull(),
    overlayText: text("overlay_text").notNull(),
    image_url: text("image_url").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("sequence_step_published_sequence_id_step_number_unique").on(
      table.publishedSequenceId,
      table.stepNumber,
    ),
  ],
);

export const profileLibrary = pgTable("profile_library", {
  libraryId: varchar("library_id", { length: 128 })
    .primaryKey()
    .$defaultFn(() => createId()),
  profileId: varchar("profile_id", { length: 128 })
    .notNull()
    .references(() => profiles.profileId, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  image_url: text("image_url").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  ai_classification: text("ai_classification"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type InsertProfile = typeof profiles.$inferInsert;
export type SelectProfile = typeof profiles.$inferSelect;

export type InsertProfileSecret = typeof profileSecrets.$inferInsert;
export type SelectProfileSecret = typeof profileSecrets.$inferSelect;

export type InsertProfileSequenceConfig = typeof profileSequenceConfig.$inferInsert;
export type SelectProfileSequenceConfig = typeof profileSequenceConfig.$inferSelect;

export type InsertPublishedSequence = typeof publishedSequence.$inferInsert;
export type SelectPublishedSequence = typeof publishedSequence.$inferSelect;

export type InsertSequenceStep = typeof sequenceStep.$inferInsert;
export type SelectSequenceStep = typeof sequenceStep.$inferSelect;

export type InsertProfileLibrary = typeof profileLibrary.$inferInsert;
export type SelectProfileLibrary = typeof profileLibrary.$inferSelect;
