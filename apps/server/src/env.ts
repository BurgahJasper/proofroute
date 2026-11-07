import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './paths.js';

const PLACEHOLDERS = new Set([
  '',
  'REPLACE_PRIVATELY',
  'REPLACE_WITH_TESTED_MODEL_ID',
  'REPLACE_WITH_RANDOM_SECRET',
]);

export interface AppConfig {
  inferenceProvider: 'nvidia_hosted' | 'brev_nim';
  nvidiaBaseUrl: string;
  nvidiaApiKey: string;
  nimBaseUrl: string;
  nimApiKey: string;
  model: string;
  providerConfigured: boolean;
  providerBlocker?: string;
  sessionSecret: string;
  databasePath: string;
  appOrigin: string;
  port: number;
  host: string;
  demoMode: boolean;
  runDeadlineMs: number;
  maxExternalCalls: number;
  maxModelCalls: number;
  production: boolean;
  externalTimeoutMs: number;
  modelTimeoutMs: number;
}

export function loadEnvFile(file = path.join(repoRoot, '.env')): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function missing(value: string | undefined): boolean {
  return value === undefined || PLACEHOLDERS.has(value.trim());
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  loadEnvFile();
  const env = process.env;
  const inferenceProvider = env.INFERENCE_PROVIDER === 'brev_nim' ? 'brev_nim' : 'nvidia_hosted';
  const model = env.NEMOTRON_MODEL?.trim() || '';
  const nvidiaApiKey = env.NVIDIA_API_KEY?.trim() || '';
  const nimBaseUrl = env.NIM_BASE_URL?.trim() || '';
  const nimApiKey = env.NIM_API_KEY?.trim() || '';
  let providerConfigured = false;
  let providerBlocker: string | undefined;
  if (inferenceProvider === 'nvidia_hosted') {
    if (missing(nvidiaApiKey)) {
      providerBlocker = 'NVIDIA_API_KEY is missing or still a placeholder in .env';
    } else if (missing(model)) {
      providerBlocker = 'NEMOTRON_MODEL is missing or still a placeholder in .env';
    } else {
      providerConfigured = true;
    }
  } else if (missing(nimBaseUrl) || missing(model)) {
    providerBlocker = 'NIM_BASE_URL or NEMOTRON_MODEL is missing for brev_nim';
  } else {
    providerConfigured = true;
  }

  const config: AppConfig = {
    inferenceProvider,
    nvidiaBaseUrl: (env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, ''),
    nvidiaApiKey,
    nimBaseUrl: nimBaseUrl.replace(/\/$/, ''),
    nimApiKey,
    model,
    providerConfigured,
    providerBlocker,
    sessionSecret: env.SESSION_SECRET?.trim() || '',
    databasePath: env.DATABASE_PATH || './data/proofroute.sqlite',
    appOrigin: env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
    port: Number(env.PORT || 3000),
    host: '0.0.0.0',
    demoMode: env.DEMO_MODE !== 'false',
    runDeadlineMs: Number(env.RUN_DEADLINE_MS || 45_000),
    maxExternalCalls: Number(env.MAX_EXTERNAL_CALLS || 6),
    maxModelCalls: Number(env.MAX_MODEL_CALLS || 4),
    production: env.NODE_ENV === 'production',
    externalTimeoutMs: 6_000,
    modelTimeoutMs: 15_000,
  };

  return { ...config, ...overrides, providerConfigured: overrides.providerConfigured ?? config.providerConfigured };
}

export function isPlaceholder(value: string | undefined): boolean {
  return missing(value);
}

export function assertSessionSecret(config: AppConfig): void {
  if (missing(config.sessionSecret) || config.sessionSecret.length < 32) {
    throw new Error('Set SESSION_SECRET in .env to a random string of at least 32 characters. Do not paste it into chat.');
  }
}
