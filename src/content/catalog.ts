/**
 * Session catalog: a lightweight index of all available sessions with
 * display metadata. The full session JSON is loaded lazily only when
 * the user starts that session.
 *
 * Add a new entry here for every day_X.json you author.
 */

export interface SessionCatalogEntry {
  sessionId: string;
  level: number;
  label: string;
  literacy: { concept: string; word: string; english: string };
  numeracy: { concept: string; english: string };
  estimatedMinutes: number;
  parentPrepSummary: string;
}

export const SESSION_CATALOG: SessionCatalogEntry[] = [
  {
    sessionId: "day_1",
    level: 1,
    label: "दिन 1",
    literacy: { concept: "क", word: "कबूतर", english: "Ka" },
    numeracy: { concept: "1", english: "One" },
    estimatedMinutes: 15,
    parentPrepSummary:
      "आज हम 'क' और संख्या 1 सीखेंगे। बच्चे को धीरे से दोहराइए।",
  },
  // Future sessions go here:
  // {
  //   sessionId: "day_2",
  //   level: 2,
  //   label: "दिन 2",
  //   literacy: { concept: "ख", word: "खरगोश", english: "Kha" },
  //   numeracy: { concept: "2", english: "Two" },
  //   estimatedMinutes: 15,
  //   parentPrepSummary:
  //     "आज हम 'ख' और संख्या 2 सीखेंगे। बच्चे को धीरे से दोहराइए।",
  // },
];

export const getSessionEntry = (
  sessionId: string,
): SessionCatalogEntry | undefined =>
  SESSION_CATALOG.find((e) => e.sessionId === sessionId);

export const getNextSession = (
  highestLevelUnlocked: number,
): SessionCatalogEntry | undefined =>
  SESSION_CATALOG.find((e) => e.level === highestLevelUnlocked);

/**
 * Load the full session JSON. Right now we only have day_1; extend the
 * map when more content files are added.
 */
export const loadSessionJson = async (
  sessionId: string,
): Promise<Record<string, unknown>> => {
  switch (sessionId) {
    case "day_1":
      return (await import("./sessions/day_1.json")).default;
    default:
      throw new Error(`Unknown session: ${sessionId}`);
  }
};
