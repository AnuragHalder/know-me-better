/** The two looks. "notebook" is shown to people as "Slambook". */
export type Look = "notebook" | "clean";

export const DEFAULT_LOOK: Look = "clean";

/** Cookie holding a visitor's own choice from the header switch. */
export const LOOK_COOKIE = "look";

export const LOOK_LABEL: Record<Look, string> = { clean: "Clean", notebook: "Slambook" };

export function parseLook(value: string | undefined | null): Look | null {
  return value === "clean" || value === "notebook" ? value : null;
}

/**
 * What a page shows: the visitor's own choice wins; otherwise a quiz shows the
 * look its creator picked; everything else is the default.
 */
export function effectiveLook(visitor: Look | null, quiz?: Look | null): Look {
  return visitor ?? quiz ?? DEFAULT_LOOK;
}
