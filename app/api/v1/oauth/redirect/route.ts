import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  OAUTH_STATE_COOKIE,
  signInstagramOAuthState,
} from "@/lib/instagram-oauth";
import { requiredEnv } from "@/lib/utils";
import { db } from "@/utils/db/db";
import { getProfilesCacheTag } from "@/utils/db/profiles/fetch";
import {
  assertConnectedAccountCapacity,
  getBillingAccessForUser,
} from "@/utils/billing/entitlements";
import { profiles, profileSecrets } from "@/utils/db/schema";
import {
  type InstagramOAuthState,
  type InstagramOAuthStatePayload,
  type InstagramMe,
  type InstagramShortLivedToken,
  type InstagramLongLivedToken,
} from "@/utils/types";

const INSTAGRAM_ALREADY_CONNECTED_MESSAGE =
  "This Instagram account is already connected to another user";

type ExistingProfile = {
  profileId: string;
  profileSlug: string;
  userId: string;
};

function isUniqueViolation(error: unknown, key: string) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const { code, column, constraint } = error as {
    code?: string;
    column?: string;
    constraint?: string;
  };

  return (
    code === "23505" &&
    (column === key || constraint?.includes(key) === true)
  );
}

function getOAuthErrorMessage(error: unknown) {
  if (
    isUniqueViolation(error, "external_user_id") ||
    isUniqueViolation(error, "profile_slug")
  ) {
    return INSTAGRAM_ALREADY_CONNECTED_MESSAGE;
  }

  return error instanceof Error ? error.message : "Invalid OAuth redirect state";
}

function normalizeInstagramOAuthCode(code: string) {
  const sanitized = code.replace(/#_$/, "");
  if (sanitized.length > 255 || !/^[a-zA-Z0-9_]+$/.test(sanitized)) {
    throw new Error("Invalid authorization code format");
  }
  return sanitized;
}

function getInstagramErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") {
    return fallback;
  }
  const errorMessage =
    ("error_message" in body &&
      typeof body.error_message === "string" &&
      body.error_message) ||
    ("error" in body &&
      typeof body.error === "object" &&
      body.error &&
      "message" in body.error &&
      typeof body.error.message === "string" &&
      body.error.message);
  return errorMessage || fallback;
}

function readInstagramTokenPayload<T>(body: unknown): Partial<T> {
  if (
    body &&
    typeof body === "object" &&
    "data" in body &&
    Array.isArray(body.data)
  ) {
    return (body.data[0] ?? {}) as Partial<T>;
  }

  return (body ?? {}) as Partial<T>;
}

async function verifyInstagramOAuthState(
  state: string,
): Promise<InstagramOAuthState> {
  const parts = state.split(".");

  if (parts.length !== 2) {
    throw new Error("Invalid OAuth state");
  }

  const [payload, signature] = parts;
  const expectedSignature = signInstagramOAuthState(payload);
  if (
    expectedSignature.length !== signature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    throw new Error("Invalid OAuth state signature");
  }

  const parsed = JSON.parse(
    Buffer.from(payload, "base64url").toString(),
  ) as Partial<InstagramOAuthStatePayload>;
  if (!parsed.userId || !parsed.nonce || !parsed.exp) {
    throw new Error("Invalid OAuth state payload");
  }

  if (parsed.exp < Math.floor(Date.now() / 1000) - 86400) {
    throw new Error("Expired OAuth state");
  }

  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!cookieNonce) {
    throw new Error("Missing OAuth session");
  }
  if (
    cookieNonce.length !== parsed.nonce.length ||
    !timingSafeEqual(Buffer.from(cookieNonce), Buffer.from(parsed.nonce))
  ) {
    throw new Error("OAuth session mismatch");
  }
  cookieStore.delete(OAUTH_STATE_COOKIE);

  return {
    userId: parsed.userId,
    nonce: parsed.nonce,
  };
}

async function exchangeInstagramCodeForLongLivedToken(code: string) {
  const shortLivedFormData = new FormData();
  shortLivedFormData.set("client_id", requiredEnv("INSTAGRAM_APP_ID"));
  shortLivedFormData.set("client_secret", requiredEnv("INSTAGRAM_APP_SECRET"));
  shortLivedFormData.set("grant_type", "authorization_code");
  shortLivedFormData.set("redirect_uri", requiredEnv("CALLBACK_URL"));
  shortLivedFormData.set("code", normalizeInstagramOAuthCode(code));

  const shortLivedTokenResponse = await fetch(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      body: shortLivedFormData,
      cache: "no-store",
    },
  );
  const shortLivedTokenBody = await shortLivedTokenResponse
    .json()
    .catch(() => null);

  if (!shortLivedTokenResponse.ok) {
    throw new Error(
      getInstagramErrorMessage(
        shortLivedTokenBody,
        "Instagram code exchange failed",
      ),
    );
  }

  const shortLivedToken = readInstagramTokenPayload<InstagramShortLivedToken>(
    shortLivedTokenBody,
  );
  if (!shortLivedToken.access_token || !shortLivedToken.user_id) {
    throw new Error("Instagram code exchange returned an invalid payload");
  }

  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: requiredEnv("INSTAGRAM_APP_SECRET"),
    access_token: shortLivedToken.access_token,
  });

  const longLivedTokenResponse = await fetch(
    `https://graph.instagram.com/access_token?${params.toString()}`,
    {
      cache: "no-store",
    },
  );
  const longLivedTokenBody = await longLivedTokenResponse
    .json()
    .catch(() => null);

  if (!longLivedTokenResponse.ok) {
    throw new Error(
      getInstagramErrorMessage(
        longLivedTokenBody,
        "Instagram long-lived token exchange failed",
      ),
    );
  }

  const longLivedToken = readInstagramTokenPayload<InstagramLongLivedToken>(
    longLivedTokenBody,
  );
  if (!longLivedToken.access_token || !longLivedToken.expires_in) {
    throw new Error(
      "Instagram long-lived token exchange returned an invalid payload",
    );
  }

  return {
    accessToken: longLivedToken.access_token,
    accessTokenType: longLivedToken.token_type ?? "bearer",
    accessTokenPermissions: Array.isArray(shortLivedToken.permissions)
      ? shortLivedToken.permissions.join(",")
      : (shortLivedToken.permissions ?? null),
    accessTokenExpiresAt: new Date(Date.now() + longLivedToken.expires_in),
    externalUserId: shortLivedToken.user_id,
  };
}

async function fetchInstagramAccount(accessToken: string): Promise<InstagramMe> {
  const params = new URLSearchParams({
    fields: "user_id,username,profile_picture_url",
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.instagram.com/v25.0/me?${params.toString()}`,
    {
      cache: "no-store",
    },
  );
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      getInstagramErrorMessage(body, "Instagram profile lookup failed"),
    );
  }

  const account = readInstagramTokenPayload<InstagramMe>(body);
  if (!account.user_id || !account.username) {
    throw new Error("Instagram profile lookup returned an invalid payload");
  }

  return {
    user_id: account.user_id,
    username: account.username,
    profile_picture_url: account.profile_picture_url,
  };
}

async function findOrCreateProfile(
  userId: string,
  username: string,
  profilePictureUrl?: string,
  existingProfile?: ExistingProfile | null,
) {
  if (existingProfile) {
    if (existingProfile.profileSlug !== username || profilePictureUrl) {
      await db
        .update(profiles)
        .set({
          profileSlug: username,
          ...(profilePictureUrl ? { profilePictureUrl } : {}),
        })
        .where(eq(profiles.profileId, existingProfile.profileId));
    }

    return {
      profileId: existingProfile.profileId,
      profileSlug: username,
    };
  }

  const [profile] = await db
    .insert(profiles)
    .values({
      userId,
      profileSlug: username,
      profilePictureUrl: profilePictureUrl ?? null,
    })
    .onConflictDoNothing({
      target: profiles.profileSlug,
    })
    .returning({
      profileId: profiles.profileId,
      profileSlug: profiles.profileSlug,
    });

  if (profile) {
    return profile;
  }

  const [profileAfterConflict] = await db
    .select({
      profileId: profiles.profileId,
      profileSlug: profiles.profileSlug,
      userId: profiles.userId,
    })
    .from(profiles)
    .where(eq(profiles.profileSlug, username))
    .limit(1);

  if (!profileAfterConflict) {
    throw new Error("Failed to create profile");
  }

  if (profileAfterConflict.userId !== userId) {
    throw new Error(INSTAGRAM_ALREADY_CONNECTED_MESSAGE);
  }

  return {
    profileId: profileAfterConflict.profileId,
    profileSlug: profileAfterConflict.profileSlug,
  };
}

async function findExistingProfile(
  userId: string,
  username: string,
  externalUserId: string,
): Promise<ExistingProfile | null> {
  const [existingProfileByExternalUserId] = await db
    .select({
      profileId: profiles.profileId,
      profileSlug: profiles.profileSlug,
      userId: profiles.userId,
    })
    .from(profileSecrets)
    .innerJoin(profiles, eq(profileSecrets.profileId, profiles.profileId))
    .where(eq(profileSecrets.externalUserId, username))
    .limit(1);

  if (existingProfileByExternalUserId) {
    if (existingProfileByExternalUserId.userId !== userId) {
      throw new Error(INSTAGRAM_ALREADY_CONNECTED_MESSAGE);
    }

    return existingProfileByExternalUserId;
  }

  const [existingProfileBySlug] = await db
    .select({
      profileId: profiles.profileId,
      profileSlug: profiles.profileSlug,
      userId: profiles.userId,
    })
    .from(profiles)
    .where(eq(profiles.profileSlug, username))
    .limit(1);

  if (existingProfileBySlug) {
    if (existingProfileBySlug.userId !== userId) {
      throw new Error(INSTAGRAM_ALREADY_CONNECTED_MESSAGE);
    }
  }

  return existingProfileBySlug ?? null;
}

function appUrl(request: Request, status: string, profileSlug?: string) {
  const url = new URL(
    profileSlug ? `/profiles/${profileSlug}` : "/",
    request.url,
  );
  url.searchParams.set("instagram", status);
  return url;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorReason = searchParams.get("error_reason");
  const errorDescription = searchParams.get("error_description");
  let oauthState = null;

  if (state) {
    try {
      oauthState = await verifyInstagramOAuthState(state);
    } catch (stateError) {
      if (!error) {
        return Response.json(
          {
            error:
              stateError instanceof Error
                ? stateError.message
                : "Invalid OAuth redirect state",
          },
          { status: 400 },
        );
      }
    }
  }

  if (error) {
    if (oauthState) {
      return NextResponse.redirect(
        appUrl(request, errorReason === "user_denied" ? "denied" : "error"),
      );
    }

    return Response.json(
      { error: "OAuth failed" },
      { status: 400 },
    );
  }

  if (!state || !code) {
    return Response.json(
      { error: "Missing OAuth state or authorization code" },
      { status: 400 },
    );
  }

  try {
    if (!oauthState) {
      throw new Error("Invalid OAuth redirect state");
    }

    const token = await exchangeInstagramCodeForLongLivedToken(code);
    const account = await fetchInstagramAccount(token.accessToken);
    const existingProfile = await findExistingProfile(
      oauthState.userId,
      account.username,
      account.user_id,
    );


    if (existingProfile) {
      const billing = await getBillingAccessForUser(account.user_id);
      assertConnectedAccountCapacity(billing);
    }

    const profile = await findOrCreateProfile(
      oauthState.userId,
      account.username,
      account.profile_picture_url,
      existingProfile,
    );

    try {
      await db
        .insert(profileSecrets)
        .values({
          profileId: profile.profileId,
          accessToken: token.accessToken,
          accessTokenType: token.accessTokenType,
          accessTokenPermissions: token.accessTokenPermissions,
          accessTokenExpiresAt: token.accessTokenExpiresAt,
          externalUserId: account.user_id,
        })
        .onConflictDoUpdate({
          target: profileSecrets.profileId,
          set: {
            accessToken: token.accessToken,
            accessTokenType: token.accessTokenType,
            accessTokenPermissions: token.accessTokenPermissions,
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            externalUserId: account.user_id,
          },
        });
    } catch (error) {
      if (isUniqueViolation(error, "external_user_id")) {
        throw new Error(INSTAGRAM_ALREADY_CONNECTED_MESSAGE);
      }

      throw error;
    }

    revalidateTag(getProfilesCacheTag(oauthState.userId), "max");

    return NextResponse.redirect(
      appUrl(request, "connected", profile.profileSlug),
    );
  } catch (error) {
    const errorMessage = getOAuthErrorMessage(error);

    if (oauthState) {
      return NextResponse.redirect(appUrl(request, "error"));
    }

    return Response.json(
      { error: errorMessage },
      {
        status:
          errorMessage === INSTAGRAM_ALREADY_CONNECTED_MESSAGE ? 409 : 400,
      },
    );
  }
}
