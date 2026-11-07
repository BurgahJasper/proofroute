interface EvidenceRow {
  id: string;
  sourceType: string;
  sourceMode: string;
  scope: string;
  sourceUrl?: string;
  excerpt: string;
  retrievedAt: string;
  freshUntil?: string;
  limitations: string[];
  freshness?: string;
  cacheStatus?: string;
}

interface AssessmentRow {
  caseId: string;
  version: number;
  runId: string;
  scenarioId?: string | null;
  status: string;
  inputMode: string;
  sourceMode: string;
  analysisMode: string;
  findings: Array<{
    claimId: string;
    claimKey: string;
    question: string;
    status: string;
    explanation: string;
    inputSpan?: { quote?: string };
  }>;
  recommendedAction: string;
  headline: string;
  reasons: string[];
  unresolvedQuestions: string[];
  approvedRoute?: { url: string; label: string } | null;
  careersRoute?: { url: string; label: string } | null;
  verificationDraft: string;
  verificationContactAvailable: boolean;
  modelId: string;
  policyVersion: string;
  createdAt: string;
  coverageAnswered: number;
  coverageTotal: number;
  limitations?: string[];
  label?: string;
}

export function renderBriefMarkdown(input: {
  title: string;
  reviewedText: string;
  assessment: AssessmentRow;
  evidence: EvidenceRow[];
}): string {
  const { assessment, evidence } = input;
  const lines = [
    `# ${assessment.headline}`,
    '',
    `Case: ${assessment.caseId}`,
    `Version: ${assessment.version}`,
    `Assessment date: ${assessment.createdAt}`,
    `Status: ${assessment.status}`,
    `Input mode: ${input.assessment.inputMode}`,
    `Source mode: ${assessment.sourceMode}`,
    `Analysis: ${assessment.analysisMode}`,
    `Model: ${assessment.modelId}`,
    `Policy: ${assessment.policyVersion}`,
    assessment.scenarioId ? `Scenario: ${assessment.scenarioId}` : 'Scenario: none',
    '',
    assessment.label ?? 'Coverage is not a safety score.',
    `Questions answered: ${assessment.coverageAnswered} of ${assessment.coverageTotal}.`,
    '',
    '## Recommendation',
    '',
    assessment.headline,
    '',
    ...assessment.reasons.map((reason) => `- ${reason}`),
    '',
    '## Findings',
    '',
  ];
  for (const finding of assessment.findings) {
    lines.push(`### ${finding.question}`, '', `Status: ${finding.status}`, '', finding.explanation, '');
    if (finding.inputSpan?.quote) lines.push(`Quoted span: "${finding.inputSpan.quote}"`, '');
  }
  lines.push('## Unresolved', '');
  for (const question of assessment.unresolvedQuestions) lines.push(`- ${question}`);
  lines.push('', '## Evidence', '');
  if (!evidence.length) lines.push('No evidence records were stored for this version.', '');
  for (const item of evidence) {
    lines.push(
      `- Scope: ${item.scope}; source: ${item.sourceType}; mode: ${item.sourceMode}; freshness: ${item.freshness ?? 'unspecified'}`,
      `  Retrieved: ${item.retrievedAt}`,
      item.sourceUrl ? `  URL: ${item.sourceUrl}` : '  URL: none',
      `  Excerpt: ${item.excerpt}`,
      ...item.limitations.map((limit) => `  Limitation: ${limit}`),
      '',
    );
  }
  lines.push('## Official route', '');
  if (assessment.approvedRoute) {
    lines.push(`${assessment.approvedRoute.label}: ${assessment.approvedRoute.url}`, '');
  } else {
    lines.push('No approved route was available.', '');
  }
  if (assessment.careersRoute) lines.push(`Careers page: ${assessment.careersRoute.label} — ${assessment.careersRoute.url}`, '');
  lines.push(
    '## Verification draft',
    '',
    assessment.verificationContactAvailable
      ? assessment.verificationDraft
      : `We couldn't identify a recruiting verification contact. Nothing was sent.\n\n${assessment.verificationDraft}`,
    '',
    '## Reviewed text (redacted)',
    '',
    input.reviewedText,
    '',
    'Synthetic or user-attested demo text only. ProofRoute did not authenticate the sender.',
    '',
  );
  return lines.join('\n');
}
