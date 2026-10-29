import { BRAND_NAME } from "@/lib/brand";

export type PartyGame = "fake_it" | "same_brain" | "killer";

export const GAMES: Record<PartyGame, { title: string; blurb: string; min: number }> = {
  fake_it: {
    title: "Fake It",
    blurb: "Write a fake answer about a friend. Fool the room, spot the truth.",
    min: 3,
  },
  same_brain: {
    title: "Same Brain",
    blurb: "Everyone types one word. Score when your minds match.",
    min: 2,
  },
  killer: {
    title: "Killer",
    blurb:
      "Secret roles: a killer, a police, the rest villagers. Catch the killer before it's too late.",
    min: 4,
  },
};

export type KillerRole = "killer" | "police" | "villager";

/** Killer-only part of the room view. Roles of others appear only in `result`. */
export interface KillerState {
  role: KillerRole | null;
  alive: boolean;
  kills: number;
  kills_needed: number;
  /** Killer only: seconds until the next kill is allowed. */
  kill_ready_in: number | null;
  deaths: { name: string; after_seconds: number }[];
  my_suspect: string | null;
  /** Police only: how many living villagers suspect each player. */
  suspects: { name: string; count: number }[] | null;
  result: {
    winner: "killer" | "village";
    reason: "kills" | "caught_police" | "accused_right" | "accused_wrong" | "time";
    accused: string | null;
    roles: {
      name: string;
      role: KillerRole;
      alive: boolean;
      suspect: string | null;
      points: number;
      is_me: boolean;
    }[];
  } | null;
}

export const ROLE_INFO: Record<KillerRole, { title: string; goal: string }> = {
  killer: {
    title: "You're the killer",
    goal: "Pick off villagers one by one, but never pick the police: they'll catch you.",
  },
  police: {
    title: "You're the police",
    goal: "You get one accusation. Name the killer and the village wins. Get it wrong and the killer wins.",
  },
  villager: {
    title: "You're a villager",
    goal: "Stay alive and mark who you suspect. Only the police sees the count.",
  },
};

/** One line on how a Killer round ended. */
export function killerOutcome(result: NonNullable<KillerState["result"]>): string {
  const killer = result.roles.find((r) => r.role === "killer")?.name ?? "The killer";
  const police = result.roles.find((r) => r.role === "police")?.name ?? "the police";
  switch (result.reason) {
    case "kills":
      return `${killer} got away with it.`;
    case "caught_police":
      return `${killer} went for ${police}, who was the police. Caught!`;
    case "accused_right":
      return `${police} named ${killer}. Caught!`;
    case "accused_wrong":
      return `${police} accused ${result.accused}, but the killer was ${killer}.`;
    case "time":
      return `Time ran out. ${killer} didn't get enough kills.`;
  }
}

/** 185 → "3:05". */
export function formatClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface RoomPlayer {
  name: string;
  /** Killer: still in this round. */
  alive?: boolean;
  score: number;
  is_host: boolean;
  is_me: boolean;
  /** Answered (or voted) in the current phase. */
  done: boolean;
}

export interface FakeItReveal {
  skipped: boolean;
  truth: string | null;
  subject_points: number;
  finders: string[];
  fakes: { text: string; authors: string[]; fooled: string[]; points: number; mine: boolean }[];
}

export interface SameBrainReveal {
  groups: { text: string; n: number; points: number; names: string[] }[];
}

export interface Award {
  title: string;
  name: string;
  detail: string;
}

/** What room_state returns: the room as the caller may see it. */
export interface RoomView {
  code: string;
  game: PartyGame;
  status: "lobby" | "playing" | "done";
  game_no: number;
  round: number;
  total_rounds: number;
  phase: "write" | "vote" | "answer" | "night" | "reveal" | null;
  seconds_left: number | null;
  max_players: number;
  min_players: number;
  is_host: boolean;
  prompt: string | null;
  subject: string | null;
  is_subject: boolean;
  my_answer: string | null;
  my_vote_done: boolean;
  wrote_truth: boolean;
  players: RoomPlayer[];
  options: { index: number; text: string; mine: boolean }[] | null;
  reveal: (FakeItReveal & SameBrainReveal) | null;
  awards: Award[] | null;
  killer?: KillerState | null;
}

/** What room_preview returns to anyone with the code. */
export interface RoomPreview {
  code: string;
  game: PartyGame;
  status: RoomView["status"];
  host_name: string;
  players: number;
  max_players: number;
  joined: boolean;
}

export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
export const ANSWER_MAX = 40;

export function roomPath(code: string): string {
  return `/party/${code}`;
}

/** The invite a host sends to the group. */
export function roomInviteText(game: PartyGame, url: string, code: string): string {
  return [
    `Join my ${GAMES[game].title} room on ${BRAND_NAME}. We're playing now!`,
    url,
    `Code: ${code}`,
  ].join("\n");
}

/** The end-of-game card as text for WhatsApp. */
export function awardsText(
  view: Pick<RoomView, "game" | "players" | "awards">,
  url: string,
): string {
  const winner = [...view.players].sort((a, b) => b.score - a.score)[0];
  return [
    `🏆 ${GAMES[view.game].title} awards`,
    ...(winner ? [`Winner: ${winner.name} (${winner.score.toLocaleString("en-IN")} pts)`] : []),
    ...(view.awards ?? []).map((a) => `${a.title}: ${a.name}, ${a.detail}`),
    `Play with your group: ${url}`,
  ].join("\n");
}

/** Points with Indian digit grouping: 2,500 / 1,00,000. */
export function formatPoints(n: number): string {
  return n.toLocaleString("en-IN");
}
