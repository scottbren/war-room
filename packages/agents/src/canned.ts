import type { AdvisorId } from "./advisors";

/**
 * Canned lines: what an advisor says when the LLM is slow, down or refused, and the instant acknowledgment shown while
 * a real answer is on its way. They claim no facts about the raid, so they are always safe to play.
 *  - `ack`: shown instantly after the President asks something.
 *  - `react`: a reaction to an event, when no LLM answer arrived in time.
 *  - `question`: an answer to a question, when no LLM answer arrived in time.
 */
export type Situation = "ack" | "react" | "question";

const LINES: Record<AdvisorId, Record<Situation, readonly [string, string]>> = {
  hale: {
    ack: ["Understood, Mr. President. Give me a moment.", "Hearing you. Let me check with the force."],
    react: ["The force is handling it. Let them work.", "I'm watching it. My people know their business."],
    question: ["I don't have a clean answer for that right now. Ask me again in a moment.", "Not enough in front of me to say. I'll tell you when I do."],
  },
  kessler: {
    ack: ["One moment, Mr. President.", "Let me pull that together."],
    react: ["That fits what we expected, more or less. I'll confirm.", "Noted. I want to see more before I say what it means."],
    question: ["I can't give you a firm answer on that just now.", "Our picture is incomplete. I'd rather not guess."],
  },
  navarro: {
    ack: ["Let me think about the consequences, Mr. President.", "One moment while I weigh that."],
    react: ["Every minute this stays visible costs us. I'm watching the exposure.", "I'd keep this quiet if we can. I'm looking at the options."],
    question: ["I don't have a considered view on that yet.", "I need a moment before I can advise you responsibly."],
  },
  reyes: {
    ack: ["Copy, Mr. President. Stand by.", "Roger. Checking with my teams."],
    react: ["Teams are responding. Stand by for a report.", "Copy. I'll update you when I know more."],
    question: ["Negative, I can't confirm that from here. Stand by.", "Say again later, sir. I don't have eyes on that."],
  },
  cho: {
    ack: ["Looking at it now, Mr. President.", "Give me a second with the data."],
    react: ["That could mean something. I'm checking it against the reporting.", "Interesting. I don't want to over-read it yet."],
    question: ["I can't say with any confidence right now.", "There isn't enough here to call it. I'll keep looking."],
  },
  adler: {
    ack: ["Understood, Mr. President. I'll get you the bottom line.", "One moment while I check the rules."],
    react: ["That may have legal implications. I'm reviewing them.", "Please hold off on anything irreversible until I've checked."],
    question: ["I can't give you a defensible answer on that this moment.", "Let me confirm before I advise you on that."],
  },
};

/** A fixed canned line: the same advisor, situation and seed (use the tick) always give the same line. */
export function cannedLine(id: AdvisorId, situation: Situation, seed: number): string {
  const lines = LINES[id][situation];
  return lines[Math.abs(Math.trunc(seed)) % lines.length] as string;
}
