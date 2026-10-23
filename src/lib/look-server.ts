import "server-only";

import { cookies } from "next/headers";
import { LOOK_COOKIE, parseLook, type Look } from "./look";

/** The visitor's own look choice from the header switch, or null if they haven't picked. */
export async function visitorLook(): Promise<Look | null> {
  return parseLook((await cookies()).get(LOOK_COOKIE)?.value);
}
