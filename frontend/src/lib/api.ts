const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001/api/v1';

type ApiError = Error & { code?: string; status?: number };

async function request<T>(
  path: string,
  { method = 'GET', token = '', body }: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const message = data?.error?.message || 'Request failed';
    const code = data?.error?.code || 'ERROR';
    const err = new Error(message) as ApiError;
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export type Candidate = {
  id: string;
  name: string;
  party: string;
  description: string;
  photoKey: string;
  votes?: number;
};

export type VerifyResponse = {
  token: string;
  voter: {
    voterId: string;
    name: string;
    aadhaarNumber: string;
    hasVoted: boolean;
    canVote: boolean;
    state?: string;
    constituency?: string;
    fraudFlag?: boolean;
  };
};

export type AnonymousBiometricProfile = {
  anonId: string;
  aadhaarNumber: string;
  voterId: string;
  canVote: boolean;
  hasVoted: boolean;
};

export const api = {
  verify: (payload: {
    name: string;
    aadhaarNumber: string;
    fingerprintSample: unknown;
    faceDescriptor: number[];
  }) => request<VerifyResponse>('/verify', { method: 'POST', body: payload }),

  verifyByBiometrics: (payload: { fingerprintSample: unknown; faceDescriptor?: number[] }) =>
    request<VerifyResponse>('/verify/biometric', { method: 'POST', body: payload }),

  enrollAnonymousBiometric: (payload: {
    fingerprintSample: unknown;
    faceDescriptor?: number[];
    aadhaarNumber: string;
    voterId: string;
    canVote?: boolean;
  }) =>
    request<{ ok: boolean; created: boolean; profile: AnonymousBiometricProfile }>('/biometric/anonymous/enroll', {
      method: 'POST',
      body: payload,
    }),

  checkAnonymousEligibility: (payload: {
    fingerprintSample: unknown;
    faceDescriptor?: number[];
    aadhaarNumber: string;
    voterId: string;
  }) =>
    request<{
      ok: boolean;
      profile: AnonymousBiometricProfile;
      similarity: { fingerprint: number; face: number };
    }>('/biometric/anonymous/check', { method: 'POST', body: payload }),

  submitPrototypeBiometric: (payload: { fingerprintSample: unknown; faceDescriptor?: number[] }) =>
    request<{
      ok: boolean;
      submission: { id: string; status: string; hasFace: boolean; submittedAt: string };
      message: string;
    }>('/biometric/prototype/submit', { method: 'POST', body: payload }),

  candidates: (token: string) => request<{ candidates: Candidate[] }>('/candidates', { token }),

  vote: (token: string, candidateId: string) =>
    request<{ ok: boolean; message: string; candidate: { id: string; name: string; party: string } }>('/vote', {
      method: 'POST',
      token,
      body: { candidateId },
    }),

  adminLogin: (payload: { username: string; password: string }) =>
    request<{ token: string; admin: { username: string } }>('/admin/login', { method: 'POST', body: payload }),

  adminStats: (token: string) =>
    request<{
      totalEligibleVoters: number;
      totalVerifiedVoters: number;
      totalVoted: number;
      totalFraudLogs: number;
      fraudFlaggedVoters: number;
      votesByCandidate: { candidateId: string; name: string; party: string; votes: number }[];
      stateWiseBreakdown: { state: string; votes: number }[];
      lastUpdated: string;
    }>('/admin/stats', { token }),

  adminFraudLogs: (token: string, limit = 50) =>
    request<{ logs: { id: string; aadhaarNumber: string; ip: string; reason: string; createdAt: string }[] }>(
      `/admin/fraud/logs?limit=${encodeURIComponent(String(limit))}`,
      { token }
    ),

  adminVotes: (token: string, limit = 200) =>
    request<{
      votes: {
        id: string;
        votedAt: string;
        voterName: string;
        aadhaarNumber: string;
        state: string;
        constituency: string;
        candidateName: string;
        party: string;
      }[];
    }>(`/admin/votes?limit=${encodeURIComponent(String(limit))}`, { token }),

  adminVoters: (token: string, limit = 100) =>
    request<{
      voters: {
        id: string;
        voterId: string;
        name: string;
        aadhaarNumber: string;
        fingerprintTemplateHash: string;
        faceEmbeddingHash: string;
        state: string;
        constituency: string;
        biometricManagedByAdmin: boolean;
        lastBiometricUploadAt: string | null;
        hasVoted: boolean;
        locked: boolean;
        fraudFlag: boolean;
        fraudAttemptCount: number;
        lastVerifiedAt: string | null;
        createdAt: string;
      }[];
    }>(`/admin/voters?limit=${encodeURIComponent(String(limit))}`, { token }),

  adminFindVoter: (token: string, aadhaarNumber: string) =>
    request<{
      voter: {
        id: string;
        voterId: string;
        name: string;
        aadhaarNumber: string;
        fingerprintTemplateHash: string;
        faceEmbeddingHash: string;
        state: string;
        constituency: string;
        biometricManagedByAdmin: boolean;
        lastBiometricUploadAt: string | null;
        hasVoted: boolean;
        locked: boolean;
        fraudFlag: boolean;
        fraudAttemptCount: number;
        lastVerifiedAt: string | null;
        createdAt: string;
      };
    }>(`/admin/voter/${encodeURIComponent(aadhaarNumber)}`, { token }),

  adminSetLock: (token: string, aadhaarNumber: string, locked: boolean) =>
    request<{ ok: boolean; aadhaarNumber: string; locked: boolean }>(
      `/admin/voter/${encodeURIComponent(aadhaarNumber)}/lock`,
      { method: 'POST', token, body: { locked } }
    ),

  adminUploadBiometric: (
    token: string,
    aadhaarNumber: string,
    payload: { fingerprintSample: unknown; faceDescriptor?: number[] }
  ) =>
    request<{
      ok: boolean;
      voter: {
        id: string;
        aadhaarNumber: string;
        voterId: string;
        biometricManagedByAdmin: boolean;
        lastBiometricUploadAt: string | null;
      };
      audit: { payloadHash: string; prevHash: string; blockHash: string };
    }>(`/admin/voter/${encodeURIComponent(aadhaarNumber)}/biometric`, {
      method: 'POST',
      token,
      body: payload,
    }),

  adminBiometricSubmissions: (token: string, limit = 50) =>
    request<{
      submissions: {
        id: string;
        status: string;
        hasFace: boolean;
        fingerprintPreview: string;
        submittedAt: string;
      }[];
    }>(`/admin/biometric/submissions?limit=${encodeURIComponent(String(limit))}`, { token }),
};
