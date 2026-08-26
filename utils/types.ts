import { HugeiconsIcon } from "@hugeicons/react";

export type InstagramOAuthState = {
  userId: string;
  nonce: string;
};
export type InstagramOAuthStatePayload = InstagramOAuthState & {
  exp: number;
};

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
] as const;


export type InstagramShortLivedToken = {
  access_token: string;
  user_id: string;
  permissions?: string | string[];
};

export type InstagramLongLivedToken = {
  access_token: string;
  token_type?: string;
  expires_in: number;
};

export type InstagramMe = {
  user_id: string;
  username: string;
  profile_picture_url?: string;
};

export type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
};

export type NavItem = {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  href: (slug: string) => string;
};

export const sequenceTypes = ["Client wins", "Selling Story"] as const;

export type SequenceType = (typeof sequenceTypes)[number];
