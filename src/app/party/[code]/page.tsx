import type { Metadata } from "next";
import { cache } from "react";
import { PartyRoom } from "@/components/party/PartyRoom";
import { PageShell } from "@/components/PageShell";
import { ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { siteOrigin } from "@/lib/origin";
import { GAMES, ROOM_CODE, roomPath, type RoomPreview } from "@/lib/party/room";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

type Params = { params: Promise<{ code: string }> };

const loadPreview = cache(async (raw: string): Promise<RoomPreview | null> => {
  const code = raw.toUpperCase();
  if (!ROOM_CODE.test(code)) return null;
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.rpc("room_preview", { p_code: code });
  return (data as RoomPreview | null) ?? null;
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const preview = await loadPreview((await params).code);
  if (!preview) return { title: "Party room" };
  const title = `Join ${preview.host_name}'s ${GAMES[preview.game].title} room`;
  return { title, description: GAMES[preview.game].blurb, openGraph: { title } };
}

export default async function RoomPage({ params }: Params) {
  const code = (await params).code.toUpperCase();
  const preview = await loadPreview(code);

  if (!preview) {
    return (
      <PageShell>
        <Sheet ruled>
          <h1 className="font-hand text-4xl leading-tight font-bold">No room with code {code}</h1>
          <p className="text-ink-soft">
            Check the code with your friend. Codes have 6 letters and numbers, without O, I, 0 or 1.
          </p>
          <div>
            <ButtonLink href="/party" variant="pink">
              Open your own room
            </ButtonLink>
          </div>
        </Sheet>
      </PageShell>
    );
  }

  const user = await getCurrentUser();
  const url = `${await siteOrigin()}${roomPath(preview.code)}`;
  return (
    <PageShell>
      <PartyRoom
        preview={preview}
        url={url}
        suggestedName={user && !user.isGuest ? (user.name?.split(" ")[0] ?? "") : ""}
      />
    </PageShell>
  );
}
