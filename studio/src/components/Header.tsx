import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Chevron, Logo, MenuIcon, Moon, Sun } from './icons';

interface NavItem {
  label: string;
  items: { to: string; title: string; desc: string }[];
}

export const NAV: NavItem[] = [
  {
    label: 'Product',
    items: [
      { to: '/#how', title: 'How it works', desc: 'Rules in, a real browser in the middle, a fix brief out' },
      { to: '/#paths', title: 'Write rules or ship pages', desc: 'The two sides of one workflow' },
      { to: '/#credits', title: 'Credit-aware runs', desc: 'Replays and reuse keep a check cheap' },
    ],
  },
  {
    label: 'Studio',
    items: [
      { to: '/studio', title: 'Overview', desc: 'Latest verdict and every rule at a glance' },
      { to: '/studio/runs', title: 'Runs', desc: 'Every check, with steps and screenshots' },
      { to: '/studio/loops', title: 'Loops', desc: 'Watch an agent fix the site, step by step' },
    ],
  },
  {
    label: 'Rules',
    items: [
      { to: '/rules', title: 'House rules', desc: 'The twelve rules that ship with Plumb' },
      { to: '/docs/write-a-rule', title: 'Write a rule', desc: 'Plain English in, Kane test out' },
      { to: '/docs/rule-format', title: 'Rule format', desc: 'Every field of a rule file' },
    ],
  },
  {
    label: 'Developers',
    items: [
      { to: '/docs/quick-start', title: 'Quick start', desc: 'From install to first verdict' },
      { to: '/docs/cli', title: 'CLI', desc: 'check, loop, gate, status and friends' },
      { to: '/docs/agents', title: 'Agents, hooks and MCP', desc: 'Kiro, Claude Code, Codex and any MCP client' },
      { to: '/docs/ci', title: 'CI', desc: 'Gate a pull request on the rules' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { to: '/reports/evidence', title: 'Evidence', desc: 'Real runs this project was built and checked with' },
      { to: '/reports/costs', title: 'Measured costs', desc: 'Credits per authoring run, replay and reuse' },
      { to: '/reports/limits', title: 'Limits', desc: 'What Plumb does not prove' },
    ],
  },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'));
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage can be blocked; the choice then lasts for this visit only */
    }
    setTheme(next);
  };
  return (
    <button type="button" className="icon-btn" onClick={flip} aria-pressed={theme === 'dark'} aria-label="Switch between light and dark theme" title="Switch between light and dark theme">
      {theme === 'dark' ? <Sun width={18} height={18} /> : <Moon width={18} height={18} />}
    </button>
  );
}

export function Header() {
  const [open, setOpen] = useState<number | null>(null);
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  const timer = useRef<number | undefined>(undefined);
  const nav = useRef<HTMLElement>(null);

  const close = useCallback(() => {
    setOpen(null);
    setMobile(false);
  }, []);

  useEffect(close, [loc.pathname, loc.hash, close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        setMobile(false);
      }
    };
    const onDoc = (e: MouseEvent) => {
      if (!nav.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, []);

  const enter = (i: number) => (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(timer.current);
    setOpen(i);
  };
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(null), 140);
  };

  const onMenuKey = (e: React.KeyboardEvent, i: number) => {
    const links = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.menu a'));
    const active = document.activeElement as HTMLElement;
    const at = links.indexOf(active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(i);
      (links[at + 1] ?? links[0])?.focus();
    } else if (e.key === 'ArrowUp' && at >= 0) {
      e.preventDefault();
      (links[at - 1] ?? links[links.length - 1])?.focus();
    }
  };

  return (
    <header className="header">
      <div className="wrap">
        <Link to="/" className="brand" aria-label="Plumb home">
          <Logo /> Plumb
        </Link>
        <nav ref={nav} className={`nav${mobile ? ' open' : ''}`} aria-label="Main">
          {NAV.map((cat, i) => (
            <div key={cat.label} className={`nav-item${open === i ? ' open' : ''}`} onPointerEnter={enter(i)} onPointerLeave={leave} onFocus={(e) => (e.target as HTMLElement).matches(':focus-visible') && setOpen(i)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen((o) => (o === i ? null : o))} onKeyDown={(e) => onMenuKey(e, i)}>
              <button type="button" className="nav-btn" aria-haspopup="menu" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {cat.label} <Chevron />
              </button>
              <div className="menu" role="menu" aria-label={cat.label}>
                {cat.items.map((it) => (
                  <Link key={it.to} to={it.to} role="menuitem">
                    <strong>{it.title}</strong>
                    <span>{it.desc}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="header-end">
          <Link to="/docs/quick-start" className="btn primary small cta">
            Install Plumb
          </Link>
          <ThemeToggle />
          <button type="button" className="icon-btn menu-toggle" aria-label="Open the menu" aria-expanded={mobile} onClick={() => setMobile((m) => !m)}>
            <MenuIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
