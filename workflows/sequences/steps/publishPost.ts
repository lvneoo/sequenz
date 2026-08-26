import { and, asc, eq } from "drizzle-orm";
import { db } from "@/utils/db/db";
import {
  profileSecrets,
  profileSequenceConfig,
  publishedSequence,
  sequenceStep,
} from "@/utils/db/schema";
import type { InsertedSequenceResult } from "@/workflows/sequences/steps/insertSteps";

type ProfilePublishSecrets = {
  profileId: string;
  externalUserId: string;
  accessToken: string;
};

type PublishResultStep = {
  stepNumber: number;
  mediaContainerId: string;
  mediaId: string;
};

type PublishResult = {
  status: "published";
  publishedSequenceId: string;
  sequenceConfigId: string;
  publishedAt: string;
  stepCount: number;
  steps: PublishResultStep[];
};

const INSTAGRAM_API_VERSION = "v25.0";
const GRAPH_API_HOST = "https://graph.instagram.com";
const EXPIRED_TOKEN_STATUS = 400;
const EXPIRED_TOKEN_CODE = 24;
const EXPIRED_TOKEN_SUBCODE = 2207006;

class GraphApiError extends Error {
  status: number;
  code: number | null;
  subcode: number | null;

  constructor(
    message: string,
    {
      status,
      code,
      subcode,
    }: {
      status: number;
      code?: number;
      subcode?: number;
    },
  ) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
    this.code = code ?? null;
    this.subcode = subcode ?? null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPublishSecrets(
  sequenceConfigId: string,
): Promise<ProfilePublishSecrets> {
  const [row] = await db
    .select({
      profileId: profileSequenceConfig.profileId,
      externalUserId: profileSecrets.externalUserId,
      accessToken: profileSecrets.accessToken,
    })
    .from(profileSequenceConfig)
    .innerJoin(
      profileSecrets,
      eq(profileSequenceConfig.profileId, profileSecrets.profileId),
    )
    .where(eq(profileSequenceConfig.sequenceConfigId, sequenceConfigId))
    .limit(1);

  if (!row?.externalUserId || !row.accessToken) {
    throw new Error(`Missing profile secrets for sequenceConfigId ${sequenceConfigId}`);
  }

  return {
    profileId: row.profileId,
    externalUserId: row.externalUserId,
    accessToken: row.accessToken,
  };
}

async function refreshAccessToken(
  profileId: string,
  accessToken: string,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: accessToken,
  });

  const response = await fetch(
    `${GRAPH_API_HOST}/refresh_access_token?${params.toString()}`,
    {
      cache: "no-store",
    },
  );

  const body = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        expires_in?: number;
        token_type?: string;
        error?: GraphApiErrorBody;
      }
    | null;

  if (!response.ok || !body?.access_token || !body.expires_in) {
    throw getGraphApiError(
      response.status,
      body?.error,
      "Failed to refresh Instagram access token",
    );
  }

  await db
    .update(profileSecrets)
    .set({
      accessToken: body.access_token,
      accessTokenType: body.token_type,
      accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
    })
    .where(eq(profileSecrets.profileId, profileId));

  return body.access_token;
}

async function assertImageIsReachable(imageUrl: string): Promise<void> {
  const response = await fetch(imageUrl, {
    method: "HEAD",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Story image is not reachable: ${imageUrl}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("image/jpeg")) {
    throw new Error(`Story image must be JPEG: ${imageUrl}`);
  }
}

type GraphApiErrorBody = {
  code?: number;
  message?: string;
  error_subcode?: number;
  error_user_msg?: string;
};

function getGraphApiError(
  status: number,
  error: GraphApiErrorBody | undefined,
  fallback: string,
): GraphApiError {
  const parts = [error?.message, error?.error_user_msg].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );

  const message = parts.join(" ").trim() || fallback;
  const suffix = error?.error_subcode
    ? `${message} (subcode ${error.error_subcode})`
    : message;

  return new GraphApiError(suffix, {
    status,
    code: error?.code,
    subcode: error?.error_subcode,
  });
}

function shouldRefreshAccessToken(error: unknown): boolean {
  return (
    error instanceof GraphApiError &&
    error.status === EXPIRED_TOKEN_STATUS &&
    error.code === EXPIRED_TOKEN_CODE &&
    error.subcode === EXPIRED_TOKEN_SUBCODE
  );
}

async function createStoryContainer(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
): Promise<string> {
  const response = await fetch(
    `${GRAPH_API_HOST}/${INSTAGRAM_API_VERSION}/${igUserId}/media`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        media_type: "STORIES",
        image_url: imageUrl,
      }),
      cache: "no-store",
    },
  );

  const body = (await response.json().catch(() => null)) as
    | { id?: string; error?: GraphApiErrorBody }
    | null;

  if (!response.ok || !body?.id) {
    throw getGraphApiError(
      response.status,
      body?.error,
      "Failed to create story media container",
    );
  }

  return body.id;
}

async function waitForContainerReady(
  containerId: string,
  accessToken: string,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const params = new URLSearchParams({
      fields: "status_code",
      access_token: accessToken,
    });

    const response = await fetch(
      `${GRAPH_API_HOST}/${INSTAGRAM_API_VERSION}/${containerId}?${params.toString()}`,
      { cache: "no-store" },
    );

    const body = (await response.json().catch(() => null)) as
      | { status_code?: string; error?: GraphApiErrorBody }
      | null;

    if (!response.ok) {
      throw getGraphApiError(
        response.status,
        body?.error,
        `Failed to load container status for ${containerId}`,
      );
    }

    const statusCode = body?.status_code;

    if (statusCode === "FINISHED" || statusCode === "PUBLISHED") {
      return;
    }

    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`Container ${containerId} is not publishable (${statusCode})`);
    }

    await sleep(5000);
  }

  throw new Error(`Container ${containerId} was not ready in time`);
}

async function publishContainer(
  igUserId: string,
  accessToken: string,
  containerId: string,
): Promise<string> {
  const response = await fetch(
    `${GRAPH_API_HOST}/${INSTAGRAM_API_VERSION}/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        creation_id: containerId,
      }),
      cache: "no-store",
    },
  );

  const body = (await response.json().catch(() => null)) as
    | { id?: string; error?: GraphApiErrorBody }
    | null;

  if (!response.ok || !body?.id) {
    throw getGraphApiError(
      response.status,
      body?.error,
      "Failed to publish story container",
    );
  }

  return body.id;
}

async function publishStepWithRetry(
  igUserId: string,
  accessToken: string,
  step: { stepNumber: number; imageUrl: string },
): Promise<PublishResultStep> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await assertImageIsReachable(step.imageUrl);
      const containerId = await createStoryContainer(
        igUserId,
        accessToken,
        step.imageUrl,
      );
      await waitForContainerReady(containerId, accessToken);
      const mediaId = await publishContainer(igUserId, accessToken, containerId);

      return {
        stepNumber: step.stepNumber,
        mediaContainerId: containerId,
        mediaId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown publish failure";
      if (shouldRefreshAccessToken(error)) {
        throw error;
      }

      if (attempt === 3) {
        throw new Error(`Failed publishing step ${step.stepNumber}: ${message}`);
      }

      await sleep(2000 * attempt);
    }
  }

  throw new Error(`Failed publishing step ${step.stepNumber}`);
}

async function fetchSequenceSteps(publishedSequenceId: string) {
  return db
    .select({
      stepNumber: sequenceStep.stepNumber,
      imageUrl: sequenceStep.image_url,
    })
    .from(sequenceStep)
    .where(eq(sequenceStep.publishedSequenceId, publishedSequenceId))
    .orderBy(asc(sequenceStep.stepNumber));
}

export async function publishPost(
  inserted: InsertedSequenceResult,
): Promise<PublishResult> {
  "use step";

  const secrets = await getPublishSecrets(inserted.sequenceConfigId);
  const sequenceSteps = await fetchSequenceSteps(inserted.publishedSequenceId);

  if (sequenceSteps.length === 0) {
    throw new Error(
      `Cannot publish sequence ${inserted.publishedSequenceId} without steps`,
    );
  }

  let accessToken = secrets.accessToken;

  const publishedSteps: PublishResultStep[] = [];
  for (const step of sequenceSteps) {
    try {
      const publishedStep = await publishStepWithRetry(
        secrets.externalUserId,
        accessToken,
        step,
      );
      publishedSteps.push(publishedStep);
    } catch (error) {
      if (!shouldRefreshAccessToken(error)) {
        throw error;
      }

      accessToken = await refreshAccessToken(secrets.profileId, accessToken);
      const publishedStep = await publishStepWithRetry(
        secrets.externalUserId,
        accessToken,
        step,
      );
      publishedSteps.push(publishedStep);
    }
  }

  const publishedAt = new Date();

  await db
    .update(publishedSequence)
    .set({
      isPublished: true,
      publishedAt,
    })
    .where(
      and(
        eq(publishedSequence.publishedSequenceId, inserted.publishedSequenceId),
        eq(publishedSequence.isPublished, false),
      ),
    );

  return {
    status: "published",
    publishedSequenceId: inserted.publishedSequenceId,
    sequenceConfigId: inserted.sequenceConfigId,
    publishedAt: publishedAt.toISOString(),
    stepCount: sequenceSteps.length,
    steps: publishedSteps,
  };
}
