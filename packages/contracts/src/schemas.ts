import { z } from 'zod';

export const errorCodes = [
  'INPUT_TOO_LARGE',
  'EMPLOYER_AMBIGUOUS',
  'EMPLOYER_UNSUPPORTED',
  'PROVIDER_UNAVAILABLE',
  'SOURCE_BLOCKED',
  'MODEL_OUTPUT_INVALID',
  'RUN_EXPIRED',
  'VERSION_CONFLICT',
  'NOT_FOUND',
  'VALIDATION',
  'RATE_LIMITED',
  'CSRF',
  'DEMO_ATTESTATION',
  'INTERRUPTED',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const createCaseBody = z.object({
  reviewedText: z.string().min(1).max(20_000),
  employerId: z.string().min(1).max(80).nullable().optional(),
  roleReference: z.string().max(500).optional(),
  inputMode: z.enum(['synthetic', 'user_supplied']),
  scenarioId: z.string().max(80).optional(),
  sourcePreference: z.enum(['live', 'fixture']).optional(),
  syntheticAttestation: z.literal(true),
});

export const createRunBody = z.object({
  refresh: z.boolean().optional(),
  jobId: z.string().regex(/^\d{5,20}$/).optional(),
});

export const appendMessageBody = z.object({
  reviewedText: z.string().min(1).max(20_000),
  expectedVersion: z.number().int().positive(),
  syntheticAttestation: z.literal(true),
});

export type CreateCaseBody = z.infer<typeof createCaseBody>;
export type CreateRunBody = z.infer<typeof createRunBody>;
export type AppendMessageBody = z.infer<typeof appendMessageBody>;
