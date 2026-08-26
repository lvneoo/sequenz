# Launch Report

## TL;DR
Authentication-related launch security check findings: Instagram OAuth init/redirect flow largely enforces an authenticated user, validates OAuth state signature + cookie nonce, and deletes the nonce cookie after use. However, the OAuth redirect handler can still be abused for denial-of-service and token/cookie confusion due to error handling gaps and missing input hardening (unvalidated `state`/`code` presence) plus several locally-fixable bug risks.

## Verdict
Launch ready: No
Security level: medium

## Detailed Report
Scope (Authentication):
- app/api/auth/[kindeAuth]/route.ts uses Kinde handleAuth.
- app/api/v1/oauth/initialize/route.ts starts Instagram OAuth for authenticated users.
- app/api/v1/oauth/redirect/route.ts verifies OAuth state and exchanges code for tokens, then upserts stored profile secrets.
- proxy.ts applies withAuth middleware for most paths.

What looks good:
- OAuth init requires an authenticated userId (requireAuthenticatedUserId).
- OAuth state is signed (HMAC) and stored as an httpOnly, secure (non-dev) cookie.
- OAuth redirect verifies the two-part state signature using timingSafeEqual and re-validates payload fields + expiry.
- OAuth redirect binds state to the session cookie nonce and deletes the cookie after successful verification.

Primary authentication/security gaps that affect launch readiness:
1) OAuth redirect state error handling is inconsistent: when `verifyInstagramOAuthState(state)` throws and there is no `error` query param, the code does not immediately reject, leaving oauthState null and later returning generic JSON errors. While this is not a direct auth bypass, it increases attack surface (DoS/edge cases) and complicates safe response behavior.
2) OAuth redirect does not validate presence/format of `code` and `state` prior to deeper operations in all paths, and some error branches can leak inconsistent status codes.
3) Logout/auth session hardening (rate limiting, CSRF defenses around OAuth callback) is not visible in supplied files; given OAuth callback endpoints, lack of explicit CSRF/rate limiting is a broader launch item (not added as a finding per your instructions) but it lowers overall launch readiness.

Conclusion: Authentication flow is directionally correct, but the redirect handler needs local hardening to ensure safe rejection,

## AI Coding Agent Notes
Agent assessment of Authentication controls by endpoint:

1) Kinde authentication entrypoint
- app/api/auth/[kindeAuth]/route.ts: GET exports handleAuth(); (standard provider pattern)

2) Instagram OAuth initiation (protected)
- app/api/v1/oauth/initialize/route.ts:
  - Requires requireAuthenticatedUserId() before creating OAuth authorize URL.
  - createInstagramOAuthState() signs payload and writes nonce cookie with httpOnly + secure (non-dev), sameSite=lax, maxAge=TTL.

3) Instagram OAuth redirect callback (protected by state binding, not by app auth)
- app/api/v1/oauth/redirect/route.ts:
  - Does NOT require authenticated app session; instead expects `state` query param to prove linkage.
  - verifyInstagramOAuthState(): HMAC signature check + payload validation + expiry check + cookie nonce match + deletes cookie.
  - ExchangeInstagramCodeForLongLivedToken(): posts to Instagram token endpoint using required env vars.
  - Writes long-lived access tokens into profileSecrets (upsert on conflict).

4) Middleware coverage
- proxy.ts: withAuth applied to route matcher excluding static assets and workflow well-known.
  - OAuth redirect routes are likely protected by this middleware too (depending on matcher), but the callback currently relies on `state` for authorization anyway.

Net: The app-wide auth middleware + Kinde integration is present, and OAuth state/cookie binding exists. The redirect handler still needs specific local fixes to prevent inconsistent rejection behavior and harden request parsing.

## Fixable Findings
- ERROR: OAuth redirect handler can return inconsistent behavior on invalid `state` (error query present) leading to DoS/unsafe edge cases
  - Location: app/api/v1/oauth/redirect/route.ts:260-360
  - In app/api/v1/oauth/redirect/route.ts, when `state` verification throws and the request includes an `error` query param, the catch block suppresses the rejection and continues. This can lead to inconsistent response behavior (sometimes redirecting based on a partially verified oauthState, sometimes returning generic errors) and increases attack surface for callback endpoint flooding. Fix by immediately rejecting invalid state regardless of the presence of `error` (or by separately validating the callback mode).
- WARNING: `error_description` is read but never used; `code` is not validated for expected format before token exchange
  - Location: app/api/v1/oauth/redirect/route.ts:260-360
  - The redirect handler reads `errorDescription` but never uses it. Also, although there is a `normalizeInstagramOAuthCode()` helper that validates code format, it is only used inside exchangeInstagramCodeForLongLivedToken; the overall flow does not explicitly require `code` to match expected pattern before continuing to deep operations. Add early validation for `code` and remove unused variables to reduce confusion and lower risk of malformed inputs reaching network calls.
- WARNING: OAuth state expiry check uses a large clock-skew window without clear justification
  - Location: app/api/v1/oauth/redirect/route.ts:140-220
  - verifyInstagramOAuthState allows states where `parsed.exp < now - 86400` (1 day leeway). If OAUTH_STATE_TTL_SECONDS is 10 minutes, this effectively allows replay within up to ~1 day past expiry, bounded by cookie nonce match. Still, nonce match might be reused if cookie not cleared on mismatch paths; harden by reducing skew window to something closer to typical clock skew (e.g., 5-10 minutes) or document rationale.