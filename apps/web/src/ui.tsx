import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface UiValue {
  reduceMotion: boolean;
  toggleMotion: () => void;
}

const UiContext = createContext<UiValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<boolean | null>(null);
  const [system, setSystem] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(override ?? system);
  }, [override, system]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setSystem(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  const value = useMemo<UiValue>(
    () => ({
      reduceMotion: override ?? system,
      toggleMotion: () => setOverride((current) => !(current ?? system)),
    }),
    [override, system],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiValue {
  const value = useContext(UiContext);
  if (!value) throw new Error('UI provider missing');
  return value;
}

const STATUS_CLASS = {
  supported: 'bg-supported-soft text-supported',
  contradicted: 'bg-danger-soft text-danger',
  unresolved: 'bg-caution-soft text-caution',
  conflicting: 'bg-caution-soft text-caution',
} as const;

const STATUS_LABEL = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  unresolved: 'Unresolved',
  conflicting: 'Conflicting',
} as const;

export function StatusPill({ status }: { status: keyof typeof STATUS_CLASS }) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-sm font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ModeBadge({ mode, cache }: { mode: string; cache?: string }) {
  const label = mode === 'fixture' ? 'Fixture' : mode === 'replay' ? 'Replay' : mode === 'mixed' ? 'Mixed sources' : 'Live';
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-ink px-2.5 text-sm">
      {label}
      {cache === 'hit' ? ' · cached' : ''}
    </span>
  );
}

export function AnalysisBadge({ mode }: { mode?: string | null }) {
  if (mode === 'nemotron') {
    return (
      <span className="inline-flex min-h-7 items-center rounded-full bg-ink px-2.5 text-sm text-surface" data-testid="analysis-mode">
        Model-assisted
      </span>
    );
  }
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-dashed border-ink px-2.5 text-sm" data-testid="analysis-mode">
      Policy only
    </span>
  );
}

export function analysisNote(input: {
  analysisMode?: string | null;
  modelId?: string | null;
  sourceMode?: string | null;
  errorCode?: string | null;
  providerConfigured: boolean;
}): string {
  if (input.analysisMode === 'nemotron') {
    return `Model-assisted. ${input.modelId || 'Nemotron'} proposed checks. The evidence policy decided the recommendation.`;
  }
  if (input.sourceMode === 'fixture') {
    return 'Policy only. Fixture replay does not call the model.';
  }
  if (input.errorCode === 'MODEL_OUTPUT_INVALID') {
    return 'Policy-only fallback. The model call did not complete, so the evidence policy produced this result.';
  }
  if (!input.providerConfigured) {
    return 'Policy only. Hosted Nemotron did not write this result. Set NVIDIA_API_KEY in the server .env to run the model.';
  }
  return 'Policy only. Hosted Nemotron did not write this result.';
}

export function Wordmark() {
  return (
    <span className="wordmark inline-flex items-center gap-2 font-semibold tracking-tight">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <path d="M3 16.5h6.2l2.3-5.2 2.4 3.2H19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="3" cy="16.5" r="1.4" fill="currentColor" />
        <circle cx="11.5" cy="11.2" r="1.4" fill="currentColor" />
        <circle cx="19" cy="14.5" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" />
      </svg>
      ProofRoute
    </span>
  );
}
