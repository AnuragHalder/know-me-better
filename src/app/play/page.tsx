import { redirect } from "next/navigation";
import { playPath } from "@/lib/quiz/share";

/** The home page's "Have a code?" form submits here: /play?code=abc123 → /play/ABC123. */
export default async function JoinByCode({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const clean = (code ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 6);
  redirect(clean ? playPath(clean) : "/");
}
