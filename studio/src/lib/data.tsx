import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Health, LoopRecord, Report, StudioIndex } from './types';

/**
 * Where the Studio gets its data. If `plumb studio` or `plumb serve` is running the live API
 * answers and the Studio can start checks. Otherwise it reads the recorded runs exported
 * next to the app, which needs no Kane, no sign-in and no credits.
 */

const API = (() => {
  const q = new URLSearchParams(window.location.search).get('api');
  if (q && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(q)) return q;
  return '';
})();

const BASE = import.meta.env.BASE_URL;
/** Static hosting has no API, so do not probe for one (the 404 would show up as a console error). */
const STATIC_ONLY = import.meta.env.VITE_STATIC === '1';
const ID_RE = /^[0-9A-Za-z_-]{6,64}$/;
const FILE_RE = /^[\w.-]+\.jpg$/;
const TIMEOUT_MS = 6000;
const MAX_BYTES = 6 * 1024 * 1024;

export async function fetchJson<T>(url: string, check: (v: unknown) => v is T, timeoutMs = TIMEOUT_MS): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText || 'error'}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) throw new Error('not JSON');
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_BYTES) throw new Error('response too large');
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('response too large');
    const value: unknown = JSON.parse(text);
    if (!check(value)) throw new Error('unexpected shape');
    return value;
  } finally {
    clearTimeout(t);
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isIndex = (v: unknown): v is StudioIndex => isObj(v) && v.v === 1 && Array.isArray(v.runs) && Array.isArray(v.rules) && Array.isArray(v.loops) && isObj(v.project);
const isReport = (v: unknown): v is Report => isObj(v) && v.v === 1 && typeof v.id === 'string' && Array.isArray(v.rules) && isObj(v.gate) && isObj(v.totals);
const isLoop = (v: unknown): v is LoopRecord => isObj(v) && v.v === 1 && typeof v.id === 'string' && Array.isArray(v.iterations);
const isHealth = (v: unknown): v is Health => isObj(v) && v.ok === true && v.mode === 'live';

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: StudioIndex; live: boolean; health: Health | null };

interface Ctx {
  state: DataState;
  reload: () => void;
  getRun: (id: string) => Promise<Report>;
  getLoop: (id: string) => Promise<LoopRecord>;
  getBrief: (id: string) => Promise<string>;
  shotUrl: (runId: string, file: string | null | undefined) => string | null;
  startJob: (kind: 'check' | 'loop', body: Record<string, unknown>) => Promise<string>;
  jobEvents: (jobId: string, onEvent: (e: Record<string, unknown>) => void) => () => void;
}

const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const live = useRef(false);
  const cache = useRef(new Map<string, Promise<unknown>>());

  useEffect(() => {
    let dead = false;
    (async () => {
      let health: Health | null = null;
      try {
        health = STATIC_ONLY ? null : await fetchJson(`${API}${BASE}api/health`, isHealth, 1500);
      } catch {
        health = null;
      }
      try {
        const index = health ? await fetchJson(`${API}${BASE}api/index`, isIndex) : await fetchJson(`${BASE}data/index.json`, isIndex);
        live.current = !!health;
        cache.current.clear();
        if (!dead) setState({ status: 'ready', index, live: !!health, health });
      } catch (e) {
        if (!dead) setState({ status: 'error', message: e instanceof Error ? e.message : 'Could not load data' });
      }
    })();
    return () => {
      dead = true;
    };
  }, [tick]);

  const memo = useCallback(<T,>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.current.get(key);
    if (hit) return hit as Promise<T>;
    const p = load();
    cache.current.set(key, p);
    p.catch(() => cache.current.delete(key));
    return p;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      state,
      reload: () => setTick((n) => n + 1),
      getRun: (id) => {
        if (!ID_RE.test(id)) return Promise.reject(new Error('Not a valid run id'));
        return memo(`run:${id}`, () => fetchJson(live.current ? `${API}${BASE}api/runs/${id}` : `${BASE}data/runs/${id}.json`, isReport));
      },
      getLoop: (id) => {
        if (!ID_RE.test(id)) return Promise.reject(new Error('Not a valid loop id'));
        return memo(`loop:${id}`, () => fetchJson(live.current ? `${API}${BASE}api/loops/${id}` : `${BASE}data/loops/${id}.json`, isLoop));
      },
      getBrief: (id) => {
        if (!ID_RE.test(id)) return Promise.reject(new Error('Not a valid run id'));
        return memo(`brief:${id}`, async () => {
          const res = await fetch(live.current ? `${API}${BASE}api/runs/${id}/brief` : `${BASE}data/runs/${id}/brief.md`);
          if (!res.ok) throw new Error('No brief for this run');
          const t = await res.text();
          if (t.length > 200_000) throw new Error('Brief too large');
          return t;
        });
      },
      shotUrl: (runId, file) => {
        if (!file || !ID_RE.test(runId) || !FILE_RE.test(file)) return null;
        return live.current ? `${API}${BASE}api/runs/${runId}/shots/${file}` : `${BASE}data/runs/${runId}/shots/${file}`;
      },
      startJob: async (kind, body) => {
        const res = await fetch(`${API}${BASE}api/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-plumb': '1' }, body: JSON.stringify(body) });
        const j = (await res.json()) as { jobId?: string; error?: string };
        if (!res.ok || !j.jobId) throw new Error(j.error ?? `Could not start (${res.status})`);
        return j.jobId;
      },
      jobEvents: (jobId, onEvent) => {
        if (!/^[0-9a-f-]{6,40}$/.test(jobId)) return () => {};
        const es = new EventSource(`${API}${BASE}api/jobs/${jobId}/events`);
        es.onmessage = (m) => {
          try {
            const v: unknown = JSON.parse(m.data);
            if (isObj(v)) onEvent(v);
          } catch {
            /* ignore a malformed event */
          }
        };
        es.onerror = () => es.close();
        return () => es.close();
      },
    }),
    [state, memo]
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const v = useContext(DataCtx);
  if (!v) throw new Error('DataProvider missing');
  return v;
}

/** Load one async value with loading and error state, reset when `key` changes. */
export function useAsync<T>(key: string, load: () => Promise<T>) {
  const [s, setS] = useState<{ status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; message: string }>({ status: 'loading' });
  useEffect(() => {
    let dead = false;
    setS({ status: 'loading' });
    load().then(
      (value) => !dead && setS({ status: 'ready', value }),
      (e: unknown) => !dead && setS({ status: 'error', message: e instanceof Error ? e.message : 'Failed to load' })
    );
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return s;
}

/** The run to headline: the end of the newest loop if there is one, else the newest run. */
export function useHeadlineRun() {
  const { state, getLoop, getRun } = useData();
  const idx = state.status === 'ready' ? state.index : null;
  const loopId = idx?.loops[0]?.id;
  const runId = idx?.runs[0]?.id;
  return useAsync<Report | null>(`headline:${loopId ?? runId ?? 'none'}`, async () => {
    if (loopId) return getRun((await getLoop(loopId)).finalRunId);
    return runId ? getRun(runId) : null;
  });
}
