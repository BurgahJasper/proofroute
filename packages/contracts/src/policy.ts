import { contentHash } from './hash.js';
import { spanForQuote } from './risks.js';
import type {
  Action,
  ApprovedRoute,
  AssessmentDraft,
  ClaimKey,
  DomainObservation,
  EvidenceDraft,
  FindingDraft,
  PolicyInput,
  RiskHit,
  TextSpan,
} from './types.js';
import { POLICY_VERSION } from './types.js';

const QUESTIONS: Record<ClaimKey, string> = {
  employer_route: 'Is there an employer-linked route for this company?',
  listing: 'Is the referenced role published on that route?',
  sender: 'Does this sender represent the employer?',
  request: 'What is the message asking the recipient to do?',
};

const FORBIDDEN_REASON =
  /\b(sender (is )?(authenticated|authorized|verified|legitimate)|verified sender|offer verified|guaranteed safe|safe offer|this (offer|recruiter) is safe)\b/i;

function emptySpan(text: string): TextSpan {
  // A carried-over source can support a listing without a matching phrase
  // in this message. Never fabricate a quote from an unrelated prefix.
  void text;
  return { start: 0, end: 0, quote: '' };
}

function spanFrom(text: string, quote: string | undefined): TextSpan {
  if (!quote) return emptySpan(text);
  return spanForQuote(text, quote) ?? emptySpan(text);
}

function evidence(partial: Omit<EvidenceDraft, 'contentHash'> & { contentHash?: string }): EvidenceDraft {
  const contentHash =
    partial.contentHash ??
    contentHashOf(`${partial.scope}|${partial.sourceUrl ?? ''}|${partial.excerpt}|${partial.retrievedAt}`);
  return { ...partial, contentHash };
}

function contentHashOf(value: string): string {
  return contentHash(value);
}

function headlineFor(action: Action, risks: RiskHit[]): string {
  if (action === 'pause_sensitive_action') {
    const categories = new Set(risks.map((risk) => risk.category));
    if (categories.has('payment')) return 'Pause this payment request';
    if (categories.has('check_forwarding')) return 'Pause this check-forwarding request';
    if (categories.has('password')) return 'Pause this password request';
    if (categories.has('otp')) return 'Pause this login-code request';
    if (categories.has('sensitive_identifier')) return 'Pause this sensitive-information request';
    return 'Pause this sensitive request';
  }
  if (action === 'use_official_route') return 'Use the official application route';
  return 'Verify the sender through the employer';
}

function acceptableReason(reason: string): boolean {
  const trimmed = reason.trim();
  if (trimmed.length < 8 || trimmed.length > 280) return false;
  return !FORBIDDEN_REASON.test(trimmed);
}

export function reduceAssessment(input: PolicyInput): AssessmentDraft {
  const now = input.now;
  const evidenceRows: EvidenceDraft[] = [];
  const limitations: string[] = [];
  const text = input.reviewedText;

  if (input.employer.found && input.employer.employerId && input.employer.careersUrl) {
    evidenceRows.push(
      evidence({
        key: 'employer',
        sourceType: 'catalog',
        sourceMode: input.employer.mode,
        scope: 'employer_route',
        sourceUrl: input.employer.careersUrl,
        excerpt: input.employer.excerpt || `${input.employer.name} is in the reviewed employer catalog.`,
        retrievedAt: input.employer.checkedAt || now,
        catalogVersion: input.employer.catalogVersion,
        limitations: [
          'Shows an employer-linked route as of the catalog review. It does not authenticate anyone using the employer name.',
        ],
        freshness: 'current',
        cacheStatus: 'snapshot',
      }),
    );
  }

  if (input.listing?.checked && input.listing.found && input.listing.url && input.listing.excerpt) {
    evidenceRows.push(
      evidence({
        key: 'listing',
        sourceType: 'ats',
        sourceMode: input.listing.mode,
        scope: 'listing',
        sourceUrl: input.listing.url,
        excerpt: input.listing.excerpt,
        retrievedAt: input.listing.retrievedAt || now,
        freshUntil: input.listing.freshUntil,
        limitations: [
          'The listing was published on the employer-linked board at retrieval time. It does not prove an offer, availability, or that the sender is authorized.',
        ],
        freshness: input.listing.freshness || 'current',
        cacheStatus: input.listing.cacheStatus,
      }),
    );
  }

  if (input.domain?.submittedDomain) {
    evidenceRows.push(
      evidence({
        key: 'domain',
        sourceType: 'user_input',
        sourceMode: input.domain.mode,
        scope: 'sender_affiliation',
        excerpt: input.domain.note,
        retrievedAt: now,
        limitations: [
          'This compares address strings only. It is not authenticated email and cannot prove who controls the address.',
        ],
        freshness: 'current',
      }),
    );
  }

  if (input.risks.length) {
    const quote = input.risks.map((risk) => risk.quote).join(' ');
    evidenceRows.push(
      evidence({
        key: 'request',
        sourceType: 'user_input',
        sourceMode: input.sourceMode === 'mixed' ? 'live' : input.sourceMode,
        scope: 'user_report',
        excerpt: `The reviewed message contains: ${quote}`.slice(0, 600),
        retrievedAt: now,
        limitations: ['This records what the pasted message asks for. It is not an independent finding about the sender.'],
        freshness: 'current',
      }),
    );
  }

  if (input.proposal?.senderStatus === 'supported') {
    limitations.push('A model statement treating the sender as authenticated was rejected. Listing or domain evidence cannot authenticate the sender.');
  }
  if (input.proposal?.citedEvidenceKeys?.some((key) => !evidenceRows.some((row) => row.key === key))) {
    limitations.push('A model citation pointed at evidence that was not retrieved. That citation was dropped.');
  }
  const droppedReasons = (input.proposal?.reasons ?? []).filter((reason) => !acceptableReason(reason));
  if (droppedReasons.length) {
    limitations.push('One or more model sentences were dropped because they overclaimed identity or safety.');
  }

  const listingStatus = input.authoritativeConflict
    ? 'conflicting'
    : input.listing?.checked && input.listing.found
      ? 'supported'
      : 'unresolved';

  if (input.authoritativeConflict) {
    limitations.push('Authoritative sources disagree. The conflict stays visible and the next step is independent verification.');
  }
  if (input.listing?.lookupError) {
    limitations.push(`The job lookup did not finish: ${input.listing.lookupError}`);
  }

  const findings: FindingDraft[] = [
    {
      claimKey: 'employer_route',
      question: QUESTIONS.employer_route,
      inputSpan: spanFrom(text, input.employer.name),
      status: input.employer.found ? 'supported' : 'unresolved',
      evidenceKeys: input.employer.found ? ['employer'] : [],
      explanation: input.employer.found
        ? `${input.employer.name} has a reviewed careers page linked to a specific job board. That establishes an employer-linked route, not that this sender works there.`
        : 'This employer is not in the reviewed catalog, so ProofRoute did not treat any board as its official route.',
    },
    {
      claimKey: 'listing',
      question: QUESTIONS.listing,
      inputSpan: spanFrom(text, input.listing?.jobId || input.listing?.title),
      status: listingStatus,
      evidenceKeys: listingStatus === 'supported' ? ['listing'] : [],
      explanation: listingExplanation(input, listingStatus),
    },
    {
      claimKey: 'sender',
      question: QUESTIONS.sender,
      inputSpan: spanFrom(text, input.domain?.submittedDomain),
      status: 'unresolved',
      evidenceKeys: input.domain?.submittedDomain ? ['domain'] : [],
      explanation: senderExplanation(input.domain),
    },
    {
      claimKey: 'request',
      question: QUESTIONS.request,
      inputSpan: input.risks[0] ? { start: input.risks[0].start, end: input.risks[0].end, quote: input.risks[0].quote } : emptySpan(text),
      status: input.risks.length ? 'supported' : 'unresolved',
      evidenceKeys: input.risks.length ? ['request'] : [],
      explanation: input.risks.length
        ? `The reviewed message asks for ${input.risks.map((risk) => risk.label).join(' and ')}. That request is paused even if a real listing exists.`
        : input.ambiguousRequest
          ? 'The message mentions onboarding or documents without a specific password, payment, or identifier request. That is unresolved, not proof the request is harmless.'
          : 'No password, payment, check-forwarding, or sensitive-identifier request was detected in the reviewed text. That is not a safety certification.',
    },
  ];

  // Hard invariant: this policy version cannot authenticate a sender.
  const sender = findings.find((finding) => finding.claimKey === 'sender');
  if (sender) sender.status = 'unresolved';

  let recommendedAction: Action;
  if (input.risks.length) recommendedAction = 'pause_sensitive_action';
  else if (input.ambiguousRequest || input.authoritativeConflict) recommendedAction = 'verify_independently';
  else if (input.listing?.checked && input.listing.found) recommendedAction = 'use_official_route';
  else recommendedAction = 'verify_independently';

  const reasons: string[] = [];
  if (recommendedAction === 'pause_sensitive_action') {
    const requestLabels = { password: 'passwords', otp: 'login codes', payment: 'payment', check_forwarding: 'check forwarding', sensitive_identifier: 'sensitive personal details' };
    const distinctRequests = [...new Set(input.risks.map((risk) => requestLabels[risk.category]))];
    reasons.push(`Pause requests for ${new Intl.ListFormat('en', { style: 'long', type: 'disjunction' }).format(distinctRequests)}.`);
  }
  if (input.listing?.found) {
    reasons.push('Listing found on the employer-linked job board. This does not verify the sender.');
  } else if (input.listing?.checked) {
    reasons.push("We couldn't find this role in the sources checked. That is not evidence the sender is fraudulent.");
  }
  if (input.steersOffOfficialRoute) {
    reasons.push('The message asks you to stay off the public application route. Use the employer-linked route instead.');
  }
  reasons.push('We have not confirmed that this sender represents the employer.');
  for (const reason of input.proposal?.reasons ?? []) {
    if (reasons.length >= 3) break;
    if (acceptableReason(reason) && !reasons.includes(reason.trim())) reasons.push(reason.trim());
  }
  const trimmedReasons = reasons.slice(0, 3);

  const unresolvedQuestions = [
    'Whether the sender is authorized to represent the employer.',
  ];
  if (!input.listing?.found) unresolvedQuestions.push('Whether this role is published somewhere outside the sources checked.');
  if (input.domain && !input.domain.registrableMatch && input.domain.submittedDomain) {
    unresolvedQuestions.push('The address domain does not match the employer domain, and a match would still not authenticate the sender.');
  }
  if (input.partial) unresolvedQuestions.push('Which checks could not finish before the deadline or provider limit.');

  const approvedRoute = routeFor(input);
  const careersRoute = careersFor(input);
  const employerName = input.employer.name || 'the employer';
  const roleBit = input.listing?.title
    ? `${input.listing.title}${input.listing.jobId ? ` (requisition ${input.listing.jobId})` : ''}`
    : input.listing?.jobId
      ? `requisition ${input.listing.jobId}`
      : 'a role';
  const verificationDraft = [
    `I received a message claiming to concern ${roleBit} at ${employerName}.`,
    'Could your recruiting team confirm the appropriate application route and whether this contact is authorized?',
    'I have not included the sender address.',
  ].join(' ');

  const answered = findings.filter((finding) => finding.status === 'supported' || finding.status === 'contradicted').length;
  const riskLabels = [...new Set(input.risks.map((risk) => risk.label))];
  const changeSummary = input.previous
    ? {
        actionChanged: input.previous.recommendedAction !== recommendedAction,
        previousAction: input.previous.recommendedAction,
        changedClaimKeys: findings
          .filter((finding) => {
            const prior = input.previous?.findings.find((item) => item.claimKey === finding.claimKey);
            return !prior || prior.status !== finding.status;
          })
          .map((finding) => finding.claimKey),
        newRiskLabels: riskLabels.filter((label) => !input.previous?.riskLabels.includes(label)),
        headline:
          input.previous.recommendedAction !== recommendedAction
            ? 'New information changed the recommended action.'
            : 'New information was checked. The recommended action is unchanged.',
      }
    : undefined;

  return {
    status: input.partial ? 'partial' : 'complete',
    inputMode: input.inputMode,
    sourceMode: input.sourceMode,
    analysisMode: input.analysisMode,
    findings,
    evidence: evidenceRows,
    recommendedAction,
    headline: headlineFor(recommendedAction, input.risks),
    reasons: trimmedReasons,
    unresolvedQuestions,
    approvedRoute: approvedRoute ?? undefined,
    careersRoute: careersRoute ?? undefined,
    verificationDraft,
    verificationContactAvailable: false,
    modelId: input.modelId,
    policyVersion: POLICY_VERSION,
    coverageAnswered: answered,
    coverageTotal: findings.length,
    limitations,
    errorCode: input.errorCode,
    changeSummary,
  };
}

function listingExplanation(input: PolicyInput, status: FindingDraft['status']): string {
  if (status === 'conflicting') {
    return 'The sources checked do not agree about this role. Conflict is not a fraud finding, and it does not verify the sender.';
  }
  if (status === 'supported' && input.listing?.title) {
    const where = input.listing.mode === 'fixture' ? 'the labeled fixture for the employer-linked board' : 'the employer-linked job board';
    return `Listing found on ${where}: ${input.listing.title}. This does not verify the sender.`;
  }
  if (input.listing?.checked && input.listing.candidates?.length) {
    return 'Title-only candidates were found and need a specific job ID before a listing can be treated as the referenced role. This does not verify the sender.';
  }
  if (input.listing?.checked && input.listing.lookupError) {
    return "The job-board lookup didn't finish. Missing evidence stays unresolved. This does not verify the sender.";
  }
  if (input.listing?.checked) {
    return "We couldn't find this role in the sources checked. A missing listing is not automatic evidence of fraud, and it does not verify the sender.";
  }
  return 'No published-job lookup was run for this version. The listing stays unresolved. This does not verify the sender.';
}

function senderExplanation(domain: DomainObservation | null): string {
  const base = 'We have not confirmed that this sender represents the employer.';
  if (!domain?.submittedDomain) {
    return `${base} No sender address was available to compare, and this product has no path that marks a sender authenticated.`;
  }
  if (domain.registrableMatch) {
    return `${base} The address domain string matches a known employer domain. A string match is not authenticated email and does not prove the sender is authorized.`;
  }
  return `${base} The address domain does not match the employer's known domain. A mismatch is not proof of fraud.`;
}

function routeFor(input: PolicyInput): ApprovedRoute | null {
  if (input.listing?.found && input.listing.url && input.listing.jobId && input.employer.employerId) {
    return {
      id: `${input.employer.employerId}-job-${input.listing.jobId}`,
      url: input.listing.url,
      label: input.listing.title
        ? `Official application: ${input.listing.title}`
        : 'Official application on the employer-linked board',
      kind: 'application',
    };
  }
  return careersFor(input);
}

function careersFor(input: PolicyInput): ApprovedRoute | null {
  if (!input.employer.found || !input.employer.careersUrl || !input.employer.employerId) return null;
  return {
    id: `${input.employer.employerId}-careers`,
    url: input.employer.careersUrl,
    label: `${input.employer.name} careers page`,
    kind: 'careers',
  };
}

export function eventIsCurrent(eventVersion: number, currentVersion: number): boolean {
  return eventVersion === currentVersion;
}
