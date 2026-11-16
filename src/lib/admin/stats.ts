/** What admin_stats() returns. */
export interface KindStats {
  created: number;
  created_week: number;
  creators: number;
  plays: number;
  plays_week: number;
  started: number;
  players: number;
  played_at_least_once: number;
}

export interface AdminStats {
  generated_at: string;
  people: { accounts: number; accounts_week: number; guests: number; guests_week: number };
  quiz: KindStats;
  road: KindStats;
  party: {
    rooms: number;
    rooms_week: number;
    games: Partial<
      Record<
        "fake_it" | "same_brain" | "killer",
        { games: number; games_week: number; avg_players: number }
      >
    >;
  };
  payments: {
    paid: number;
    paid_paise: number;
    failed: number;
    abandoned: number;
    refunded: number;
    by_product: Record<string, number>;
  };
  daily: {
    day: string;
    quizzes: number;
    quiz_plays: number;
    roads: number;
    road_plays: number;
    party_games: number;
  }[];
}

export interface GameRank {
  name: string;
  total: number;
  week: number;
  /** What a "play" means for this game. */
  unit: string;
}

/** Every way to play, most played first (all time, then this week). */
export function rankGames(s: AdminStats): GameRank[] {
  const party = (key: "fake_it" | "same_brain" | "killer", name: string): GameRank => ({
    name,
    total: s.party.games[key]?.games ?? 0,
    week: s.party.games[key]?.games_week ?? 0,
    unit: "games",
  });
  return [
    { name: "Quiz", total: s.quiz.plays, week: s.quiz.plays_week, unit: "plays" },
    { name: "Story mode", total: s.road.plays, week: s.road.plays_week, unit: "walks" },
    party("fake_it", "Fake It"),
    party("same_brain", "Same Brain"),
    party("killer", "Killer"),
  ].sort((a, b) => b.total - a.total || b.week - a.week || a.name.localeCompare(b.name));
}

/** a / b as a whole percentage, or null when there's nothing to divide by. */
export function percent(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 100) : null;
}

/** Health checks for one kind of shared page (quiz or road). */
export function shareHealth(k: KindStats) {
  return {
    /** Of the pages made, how many got at least one friend to finish. */
    sharedAndPlayed: percent(k.played_at_least_once, k.created),
    /** Average finished plays per page made. */
    playsPerPage: k.created > 0 ? Math.round((k.plays / k.created) * 10) / 10 : null,
    /** Of the friends who started, how many finished. */
    finishRate: percent(k.plays, k.started),
  };
}
