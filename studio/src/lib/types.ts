export type Severity = 'blocking' | 'advisory';
export type RuleStatus = 'pass' | 'fail' | 'broken' | 'skipped';

export interface StepResult {
  index: number;
  heading: string | null;
  text: string;
  status: 'pass' | 'fail' | 'skipped' | 'running';
  durationS: number | null;
  screenshot: string | null;
}

export interface Failure {
  step: number | null;
  stepText: string | null;
  message: string;
  happened: string | null;
  suggestedFix: string | null;
  severity: string | null;
  confidence: number | null;
  confirmedBug: boolean | null;
  pageUrl: string | null;
  screenshot: string | null;
}

export interface RuleResult {
  id: string;
  title: string;
  severity: Severity;
  sha: string;
  status: RuleStatus;
  source: 'kane' | 'cache' | 'skipped';
  kind: 'author' | 'replay' | 'healed' | 'none' | 'unknown';
  durationS: number | null;
  credits: number;
  steps: StepResult[];
  failure: Failure | null;
  console: { count: number; sample: { text: string; url?: string | null }[] };
  sessionId: string | null;
  shareUrl: string | null;
  fix: string | null;
  statement: string;
  cachedFrom?: string;
  note?: string;
}

export interface Totals {
  rules: number;
  pass: number;
  fail: number;
  broken: number;
  skipped: number;
  cached: number;
  blockingFail: number;
  advisoryFail: number;
  replay: number;
  author: number;
  healed: number;
}

export interface Report {
  v: 1;
  id: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  mode: string;
  iteration: number | null;
  dryRun: boolean;
  site: { url: string; kind: string; fingerprint: string | null; files: number };
  kane: { version: string | null; user: string | null; executions: { id: string | null; exit: number | null; status: string; durationS: number | null; verdict: { result: string; failedGates: string[] } | null }[] };
  credits: { before: number | null; after: number | null; used: number | null; floor: number };
  rules: RuleResult[];
  totals: Totals;
  gate: { passed: boolean; blocking: string[] };
}

export interface RunSummary {
  id: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  mode: string;
  iteration: number | null;
  site: string;
  totals: Totals;
  gate: { passed: boolean; blocking: string[] };
  credits: { before: number | null; after: number | null; used: number | null; floor: number };
}

export interface LoopIteration {
  iteration: number;
  runId: string;
  runDir: string;
  gate: { passed: boolean; blocking: string[] };
  totals: Totals;
  credits: number | null;
  moved: { fixed: string[]; regressed: string[]; stillFailing: string[]; stillPassing: string[] } | null;
  agent: { name: string; exit: number; durationS: number; timedOut: boolean; filesChanged: string[]; tampered: string[]; summary: string } | null;
}

export interface LoopRecord {
  v: 1;
  id: string;
  startedAt: string;
  endedAt: string;
  agent: string;
  site: string;
  outcome: 'green' | 'exhausted' | 'stalled';
  iterations: LoopIteration[];
  creditsUsed: number;
  finalRunId: string;
}

export interface LoopSummary {
  id: string;
  startedAt: string;
  outcome: string;
  agent: string;
  iterations: number;
  creditsUsed: number;
}

export interface RuleInfo {
  id: string;
  title: string;
  severity: Severity;
  applies: string[];
  statement: string;
  why: string;
  fix: string;
  steps: string[];
  file: string;
  sha: string;
  evidence: string[];
  testMd: string;
  stats: { runs: number; pass: number; fail: number; credits: number; authored: number; replayed: number; lastStatus: string | null } | null;
}

export interface StudioIndex {
  v: 1;
  generatedAt: string;
  sample: boolean;
  live?: boolean;
  project: { site: string | null; rules: number; protect: string[]; agent: string };
  runs: RunSummary[];
  loops: LoopSummary[];
  rules: RuleInfo[];
}

export interface Health {
  ok: boolean;
  mode: 'live';
  busy: boolean;
  kane: { installed: boolean; version: string | null; authenticated: boolean; user: string | null; credits: number | null } | null;
}
