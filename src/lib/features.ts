/**
 * Everything people can do in the app, as shown on the About page.
 *
 * Adding a feature? Add it here (or a bullet to the right entry). A test
 * (`features.test.ts`) fails if a new top-level page or party game isn't listed.
 */
export interface Feature {
  id: string;
  title: string;
  /** The page where it starts. */
  href: string;
  summary: string;
  points: string[];
}

export const FEATURES: readonly Feature[] = [
  {
    id: "quiz",
    title: "The friendship quiz",
    href: "/create",
    summary:
      "Answer 10 questions about yourself, share a link, and your friends guess your answers. A live leaderboard shows who knows you best.",
    points: [
      "Pick topics you're into (movies, travel, money, hot takes and more) and get questions to match. Swap or reword any question.",
      "Write your own questions, or let AI suggest some on the topics you choose.",
      'Map questions: friends drop a pin ("Where was I born?") and score by how close they get. Your exact spot stays private.',
      "Friends play without signing up. They see right or wrong after each guess, never your answer.",
      "Choose the Clean or Slambook look for your page.",
    ],
  },
  {
    id: "road",
    title: "Story mode: walk your road",
    href: "/road",
    summary:
      "Play a short story and make 5 choices. Friends walk the same story and guess every turn you took, then see where your roads split.",
    points: [
      'Stories like "The Goa trip that went wrong" and "You just won ₹10 lakh", each with its own endings.',
      "After every guess friends learn only whether they're still with you; your path shows at the end on a route map.",
      "See how many friends ended the story where you did, and exactly where each one split from you.",
    ],
  },
  {
    id: "party",
    title: "Party rooms: play live together",
    href: "/party",
    summary:
      "Open a room, share the 6-character code, and everyone plays on their own phone at the same time. Up to 8 players; friends just type a name.",
    points: [
      "Fake It: write a fake answer about a friend that sounds true, then spot the real one. Points for finding the truth and for every friend you fool.",
      "Same Brain: everyone types one word for a prompt. Score when your answers match, and find out who thinks alike.",
      "Killer: secret roles (a killer, a police and villagers). The killer strikes, villagers mark suspects, and the police gets one accusation.",
      "Group awards at the end of every game, ready to share on WhatsApp.",
    ],
  },
];
