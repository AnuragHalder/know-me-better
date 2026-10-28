import { BRAND_NAME } from "@/lib/brand";

export type PartyGame = "fake_it" | "same_brain";

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
};

export interface RoomPlayer {
  name: string;
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
  phase: "write" | "vote" | "answer" | "reveal" | null;
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
