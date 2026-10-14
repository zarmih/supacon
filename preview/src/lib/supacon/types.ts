export type Seeking =
  | "boredom"
  | "validation"
  | "information"
  | "habit"
  | "relief"
  | "connection"
  | "stimulation"
  | "status"
  | "loss"
  | "other";

export type PostSeeking = "seen" | "truth" | "habit" | "anxiety" | "unsure";

export type Choice = "open" | "postpone" | "close" | "post" | "draft" | "dont";

export type Trigger = {
  id: string;
  name: string;
  preset: boolean;
  enabled: boolean;
};

export type Pause = {
  id: string;
  at: number;
  triggerId: string;
  kind: "browse" | "post";
  score: number;
  seeking: string;
  seekingNote?: string;
  choice: Choice;
  secondScore?: number;
  enough?: string;
  breathMs: number;
  overLimit: boolean;
  missed?: boolean;
  example?: boolean;
};

export type Session = {
  id: string;
  pauseId: string;
  triggerId: string;
  startedAt: number;
  endsAt: number;
  endedAt?: number;
  delivered?: "yes" | "partly" | "no";
  overLimit: boolean;
  enough?: string;
  extraMinutes: number;
};

export type Morning = { date: string; score: number; desire: string };

export type Evening = {
  date: string;
  lowest: string;
  note: string;
  misses: number;
  conversation?: boolean;
  diagnosis?: string;
};

export type FocusBlock = {
  id: string;
  date: string;
  startedAt: number;
  minutes: number;
  endedAt?: number;
};

export type Mode = "maintenance" | "deepening" | "open";

export type LocaleSetting = "en" | "ru" | "system";
export type ThemeSetting = "ink" | "paper" | "system";
export type Locale = "en" | "ru";
export type ThemeName = "ink" | "paper";

export type Doc = {
  version: 1;
  createdAt: number;
  protocolStart: string | null;
  mode: Mode | null;
  triggers: Trigger[];
  breathSeconds: 5 | 10 | 15;
  sessionMinutes: number;
  sessionCap: number;
  locale: LocaleSetting;
  theme: ThemeSetting;
  pauses: Pause[];
  sessions: Session[];
  mornings: Morning[];
  evenings: Evening[];
  focuses: FocusBlock[];
  windows: string[];
  nightHour: number | null;
  replacements: Partial<Record<Seeking, string>>;
  postponeUntil: Record<string, number>;
};

export const SEEKING: Seeking[] = [
  "boredom",
  "validation",
  "information",
  "habit",
  "relief",
  "connection",
  "stimulation",
  "status",
  "loss",
  "other",
];

export const POST_SEEKING: PostSeeking[] = [
  "seen",
  "truth",
  "habit",
  "anxiety",
  "unsure",
];

export const PRESET_IDS = [
  "instagram",
  "youtube",
  "telegram",
  "browser",
  "other",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];
