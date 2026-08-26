import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  signInstagramOAuthState,
} from "@/lib/instagram-oauth";
import { requiredEnv } from "@/lib/utils";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import {
  type InstagramOAuthState,
  type InstagramOAuthStatePayload,
  INSTAGRAM_SCOPES,
} from "@/utils/types";

async function createInstagramOAuthState(
  state: Pick<InstagramOAuthState, "userId">,
) {
  const nonce = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  const payload = Buffer.from(
    JSON.stringify({
      userId: state.userId,
      nonce,
      exp: Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SECONDS,
    } satisfies InstagramOAuthStatePayload),
  ).toString("base64url");

  cookieStore.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return `${payload}.${signInstagramOAuthState(payload)}`;
}

export async function GET() {
  try {
    const userId = await requireAuthenticatedUserId();

    const params = new URLSearchParams({
      client_id: requiredEnv("INSTAGRAM_APP_ID"),
      redirect_uri: requiredEnv("CALLBACK_URL"),
      response_type: "code",
      scope: INSTAGRAM_SCOPES.join(","),
      state: await createInstagramOAuthState({ userId }),
    });

    const url = `https://www.instagram.com/oauth/authorize?${params.toString()}`;
    return NextResponse.redirect(url);
  } catch (error) {
    return Response.json(
      {
        error: "Failed to initialize Instagram OAuth",
      },
      {
        status: 500,
      },
    );
  }
}
