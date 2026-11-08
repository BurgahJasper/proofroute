export const POLICY_VERSION = '2026-11-08.1';

export type ClaimStatus = 'supported' | 'contradicted' | 'unresolved' | 'conflicting';
export type Action = 'pause_sensitive_action' | 'verify_independently' | 'use_official_route';
export type SourceMode = 'live' | 'fixture' | 'replay';
export type InputMode = 'synthetic' | 'user_supplied';
export type AnalysisMode = 'nemotron' | 'policy_only';
export type EvidenceScope =
  | 'employer_route'
  | 'listing'
  | 'published_policy'
  | 'sender_affiliation'
  | 'user_report';
export type SourceType = 'catalog' | 'ats' | 'official_page' | 'user_input';
export type Freshness = 'current' | 'stale' | 'unavailable';
export type RiskCategory =
  | 'password'
  | 'otp'
  | 'payment'
  | 'check_forwarding'
  | 'sensitive_identifier';

export type ClaimKey = 'employer_route' | 'listing' | 'sender' | 'request';

export interface TextSpan {
  start: number;
  end: number;
  quote: string;
}

export interface EvidenceDraft {
  key: string;
  sourceType: SourceType;
  sourceMode: SourceMode;
  scope: EvidenceScope;
  sourceUrl?: string;
  excerpt: string;
  retrievedAt: string;
  freshUntil?: string;
  contentHash: string;
  catalogVersion?: string;
  limitations: string[];
  freshness: Freshness;
  cacheStatus?: 'miss' | 'hit' | 'bypass' | 'snapshot';
}

export interface FindingDraft {
  claimKey: ClaimKey;
  question: string;
  inputSpan: TextSpan;
  status: ClaimStatus;
  evidenceKeys: string[];
  explanation: string;
}

export interface ApprovedRoute {
  id: string;
  url: string;
  label: string;
  kind: 'application' | 'careers';
}

export interface RiskHit {
  category: RiskCategory;
  label: string;
  quote: string;
  start: number;
  end: number;
}

export interface ChangeSummary {
  actionChanged: boolean;
  previousAction: Action | null;
  changedClaimKeys: ClaimKey[];
  newRiskLabels: string[];
  headline: string;
}

export interface AssessmentDraft {
  conversation?: {
    messageCount: number;
    firstSensitiveVersion: number | null;
    requests: Array<RiskHit & { messageVersion: number; origin: 'pattern' | 'model'; actor: string; action: string; asset: string; destination: string }>;
  };
  candidateChoices?: ListingCandidate[];
  matchedBy?: 'reference' | 'model';
  matchedJobId?: string;
  status: 'complete' | 'partial';
  inputMode: InputMode;
  sourceMode: SourceMode | 'mixed';
  analysisMode: AnalysisMode;
  findings: FindingDraft[];
  evidence: EvidenceDraft[];
  recommendedAction: Action;
  headline: string;
  reasons: string[];
  unresolvedQuestions: string[];
  approvedRoute?: ApprovedRoute;
  careersRoute?: ApprovedRoute;
  verificationDraft: string;
  verificationContactAvailable: false;
  modelId: string;
  policyVersion: string;
  coverageAnswered: number;
  coverageTotal: number;
  limitations: string[];
  errorCode?: string;
  changeSummary?: ChangeSummary;
}

export interface EmployerObservation {
  mode: SourceMode;
  found: boolean;
  employerId?: string;
  name?: string;
  careersUrl?: string;
  excerpt?: string;
  catalogVersion?: string;
  checkedAt?: string;
  knownDomains?: string[];
}

export interface ListingCandidate {
  jobId: string;
  title: string;
  location?: string;
  url: string;
}

export interface ListingObservation {
  mode: SourceMode;
  checked: boolean;
  found: boolean;
  lookupError?: string;
  jobId?: string;
  title?: string;
  location?: string;
  url?: string;
  excerpt?: string;
  retrievedAt?: string;
  freshUntil?: string;
  freshness?: Freshness;
  cacheStatus?: 'miss' | 'hit' | 'bypass';
  candidates?: ListingCandidate[];
}

export interface DomainObservation {
  mode: SourceMode;
  submittedDomain?: string;
  knownDomains: string[];
  registrableMatch: boolean;
  note: string;
}

export interface ModelProposal {
  senderStatus?: ClaimStatus;
  listingStatus?: ClaimStatus;
  recommendedAction?: Action;
  reasons?: string[];
  headline?: string;
  citedEvidenceKeys?: string[];
}

export interface PolicyInput {
  reviewedText: string;
  risks: RiskHit[];
  ambiguousRequest: boolean;
  steersOffOfficialRoute: boolean;
  employer: EmployerObservation;
  listing: ListingObservation | null;
  domain: DomainObservation | null;
  proposal?: ModelProposal | null;
  authoritativeConflict?: boolean;
  now: string;
  inputMode: InputMode;
  modelId: string;
  analysisMode: AnalysisMode;
  sourceMode: SourceMode | 'mixed';
  partial: boolean;
  errorCode?: string;
  previous?: {
    recommendedAction: Action;
    findings: Array<{ claimKey: ClaimKey; status: ClaimStatus }>;
    riskLabels: string[];
  } | null;
}
