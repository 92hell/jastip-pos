import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/current-user";
import { validateSession } from "@/lib/auth/sessions";
import { getDb } from "@/lib/db";
import { getProof } from "@/lib/payments";

/** A payment's receipt photo, for the shop's own staff only; never cached, never guessed as HTML. */
export async function GET(_request: Request, ctx: RouteContext<"/api/proofs/[id]">) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await validateSession(getDb(), token))) return new Response("Unauthorized", { status: 401 });
  const id = Number((await ctx.params).id);
  const proof = Number.isSafeInteger(id) && id > 0 ? await getProof(getDb(), id) : null;
  if (!proof) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(proof.bytes), {
    headers: {
      "Content-Type": proof.type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
