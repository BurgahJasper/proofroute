import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const employerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  careersUrl: z.string().min(1),
  careersSnapshot: z.string().min(1),
  board: z.object({
    provider: z.literal('greenhouse'),
    token: z.string().regex(/^[a-z0-9-]+$/i),
    apiHost: z.literal('boards-api.greenhouse.io'),
    publicHost: z.string().min(1),
  }),
  knownDomains: z.array(z.string().min(1)),
  verificationContact: z.null(),
});

const catalogSchema = z.object({
  catalogVersion: z.string().min(1),
  reviewedAt: z.string().min(1),
  employers: z.array(employerSchema).min(1),
});

const scenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  banner: z.string().min(1),
  employerId: z.string().min(1).nullable(),
  jobId: z.string(),
  whatItShows: z.string(),
  text: z.string().min(1),
  followUpText: z.string(),
});

export type EmployerRecord = z.infer<typeof employerSchema>;
export type CatalogFile = z.infer<typeof catalogSchema>;
export type ScenarioRecord = z.infer<typeof scenarioSchema>;

export function loadCatalog(root: string): CatalogFile {
  const raw = JSON.parse(readFileSync(path.join(root, 'data', 'employers.json'), 'utf8')) as unknown;
  return catalogSchema.parse(raw);
}

export function loadScenarios(root: string): ScenarioRecord[] {
  const dir = path.join(root, 'data', 'scenarios');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => scenarioSchema.parse(JSON.parse(readFileSync(path.join(dir, name), 'utf8'))));
}

export function employerById(catalog: CatalogFile, id: string | null | undefined): EmployerRecord | undefined {
  if (!id) return undefined;
  return catalog.employers.find((employer) => employer.id === id);
}
