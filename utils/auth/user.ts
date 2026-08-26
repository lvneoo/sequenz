import { cache } from "react";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";

export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const { getUser, isAuthenticated } = getKindeServerSession();

  const user = await getUser();

  if (!user?.id) {
    throw new Error("Missing authenticated user");
  }

  return user.id;
});

export async function requireAuthenticatedUserId(): Promise<string> {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  return userId;
}
