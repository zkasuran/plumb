import type { Report, RuleResult } from './types';

export function when(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ago(iso: string | undefined): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function secs(n: number | null | undefined): string {
  if (n == null) return '';
  if (n < 90) return `${Math.round(n)} s`;
  return `${Math.floor(n / 60)} min ${Math.round(n % 60)} s`;
}

export function credits(n: number | null | undefined): string {
  if (n == null) return 'unknown';
  return n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

export type Tone = 'ok' | 'warn' | 'muted' | 'info';

/** Kane could not start the rule (a startup race), so the page was never judged. */
export function isInfra(r: { failure?: { message?: string | null } | null }): boolean {
  return /project\/folder gate failed|no TMS credentials/i.test(r.failure?.message ?? '');
}

/** Words for a rule's state. Failure wording stays plain: "Needs work", not an alarm. */
export function ruleState(r: Pick<RuleResult, 'status' | 'severity' | 'source'> & { failure?: RuleResult['failure'] }): { label: string; tone: Tone } {
  if (r.status !== 'pass' && isInfra(r)) return { label: 'Not judged', tone: 'muted' };
  if (r.status === 'pass') return { label: r.source === 'cache' ? 'Passing · reused' : 'Passing', tone: 'ok' };
  if (r.status === 'skipped') return { label: 'Not run', tone: 'muted' };
  if (r.severity === 'advisory') return { label: 'Suggestion', tone: 'info' };
  return { label: r.status === 'broken' ? 'Could not run' : 'Needs work', tone: 'warn' };
}

export function gateLabel(report: Pick<Report, 'gate' | 'totals'>): { label: string; tone: Tone } {
  if (report.gate.passed) return { label: 'Ready to ship', tone: 'ok' };
  const n = report.gate.blocking.length;
  return { label: n === 1 ? '1 rule needs work' : `${n} rules need work`, tone: 'warn' };
}

export function kindLabel(r: Pick<RuleResult, 'kind' | 'source'>): string {
  if (r.source === 'cache') return 'Reused, no credits';
  if (r.kind === 'replay') return 'Replayed';
  if (r.kind === 'author') return 'Written by Kane';
  if (r.kind === 'healed') return 'Healed';
  return '';
}

export const ID_OK = /^[0-9A-Za-z_-]{6,64}$/;
export const RULE_ID_OK = /^[A-Z][A-Z0-9]{1,7}-[A-Z0-9][A-Z0-9-]{0,30}$/;
