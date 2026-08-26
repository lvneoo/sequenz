import { createHmac } from "node:crypto";
import { requiredEnv } from "@/lib/utils";

export const OAUTH_STATE_COOKIE = "instagram_oauth_state";
export const OAUTH_STATE_TTL_SECONDS = 60 * 10;

export function signInstagramOAuthState(payload: string) {
  return createHmac("sha256", requiredEnv("OAUTH_STATE_SECRET"))
    .update(payload)
    .digest("base64url");
}
