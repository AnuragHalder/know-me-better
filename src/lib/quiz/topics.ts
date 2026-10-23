/**
 * Question topics, in the order the chips show. `id` matches questions.topic in
 * the database (a test checks every topic has enough questions).
 */
export const TOPICS = [
  { id: "hot_takes", label: "Hot takes", emoji: "🌶️" },
  { id: "movies", label: "Movies & shows", emoji: "🎬" },
  { id: "music", label: "Music", emoji: "🎧" },
  { id: "food", label: "Food", emoji: "🍜" },
  { id: "travel", label: "Travel", emoji: "✈️" },
  { id: "love", label: "Love & dating", emoji: "💌" },
  { id: "work", label: "Work life", emoji: "💼" },
  { id: "money", label: "Money", emoji: "💸" },
  { id: "tech", label: "Tech & internet", emoji: "📱" },
  { id: "sport", label: "Sport", emoji: "🏏" },
  { id: "nostalgia", label: "Nostalgia", emoji: "📼" },
  { id: "science", label: "Science & curiosity", emoji: "🔭" },
  { id: "life", label: "Everyday life", emoji: "☕" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];

export function topicLabels(ids: readonly string[]): string[] {
  return TOPICS.filter((t) => ids.includes(t.id)).map((t) => t.label);
}
