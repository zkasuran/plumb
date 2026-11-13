import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Close, Empty } from './icons';
import { ruleState, type Tone } from '../lib/format';
import type { RuleResult } from '../lib/types';

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function RuleChip({ r }: { r: Pick<RuleResult, 'status' | 'severity' | 'source'> }) {
  const s = ruleState(r);
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Empty />
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="callout" role="alert">
      <strong>Could not load this</strong>
      {message}
      {retry && (
        <div>
          <button type="button" className="btn small" onClick={retry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

/** Keyed on the route by the caller, so one broken page never blanks the header or menu. */
export class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="wrap section">
          <EmptyState title="This page hit a problem" action={<Link className="btn" to="/">Back to the start</Link>}>
            The rest of the site still works. Details: {this.state.error.message}
          </EmptyState>
        </div>
      );
    }
    return this.props.children;
  }
}

export function RouteBoundary({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return <Boundary key={loc.pathname}>{children}</Boundary>;
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
      window.setTimeout(() => setDone(false), 1400);
    } catch {
      setDone(false);
    }
  };
  return (
    <div className="code">
      <div className="code-head">
        <span>{label ?? 'terminal'}</span>
        <button type="button" className="copy" onClick={copy} aria-label={`Copy ${label ?? 'command'}`}>
          {done ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Shot({ src, alt, caption }: { src: string | null; alt: string; caption?: string }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!src) return null;
  return (
    <figure className="shot-fig">
      <button type="button" className="shot" onClick={() => setOpen(true)} aria-label={`Enlarge: ${alt}`}>
        <img src={src} alt={alt} loading="lazy" />
      </button>
      {caption && <figcaption className="shot-cap">{caption}</figcaption>}
      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setOpen(false)}>
          <button ref={closeRef} type="button" className="btn" onClick={() => setOpen(false)}>
            <Close width={16} height={16} /> Close
          </button>
          <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </figure>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Plumb`;
  }, [title]);
  return (
    <div className="section-head">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1 className="page-title">
        {title}
      </h1>
      {children && <p>{children}</p>}
    </div>
  );
}
