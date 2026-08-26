import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserId } from "@/utils/auth/user";
import { deleteProfileSequence } from "@/utils/db/sequences/library/delete";

const deleteSchema = z.object({
  profileSlug: z.string().min(1),
  sequenceConfigId: z.string().min(1),
});

export async function POST(request: Request) {
  const userId = await requireAuthenticatedUserId();
  const payload = deleteSchema.safeParse(await request.json().catch(() => null));

  if (!payload.success) {
    return NextResponse.json(
      { error: "Missing sequence config delete fields" },
      { status: 400 },
    );
  }

  const deleted = await deleteProfileSequence({
    userId,
    profileSlug: payload.data.profileSlug,
    sequenceConfigId: payload.data.sequenceConfigId,
  });

  if (!deleted) {
    return NextResponse.json({ error: "Sequence config not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
