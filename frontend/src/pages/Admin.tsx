import React from 'react';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

import { api } from '../lib/api';
import FaceCapture from '../components/FaceCapture';
import FingerprintScanner from '../components/FingerprintScanner';
import { useAuth } from '../state/auth';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function barChart(labels: string[], values: number[]) {
  return {
    data: {
      labels,
      datasets: [
        {
          label: 'Votes',
          data: values,
          backgroundColor: 'rgba(99, 102, 241, 0.35)',
          borderColor: 'rgba(99, 102, 241, 0.65)',
          borderWidth: 1,
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: { ticks: { color: 'rgba(113, 113, 122, 0.9)' }, grid: { display: false } },
        y: { ticks: { color: 'rgba(113, 113, 122, 0.9)' }, grid: { color: 'rgba(161, 161, 170, 0.2)' } },
      },
    },
  };
}

export default function Admin() {
  const { adminToken, setAdminSession, clearAdminSession } = useAuth();

  const [username, setUsername] = React.useState('admin');
  const [password, setPassword] = React.useState('admin123');

  const [stats, setStats] = React.useState<Awaited<ReturnType<typeof api.adminStats>> | null>(null);
  const [logs, setLogs] = React.useState<Awaited<ReturnType<typeof api.adminFraudLogs>>['logs']>([]);
  const [voteRecords, setVoteRecords] = React.useState<Awaited<ReturnType<typeof api.adminVotes>>['votes']>([]);
  const [voters, setVoters] = React.useState<Awaited<ReturnType<typeof api.adminVoters>>['voters']>([]);
  const [submissions, setSubmissions] = React.useState<Awaited<ReturnType<typeof api.adminBiometricSubmissions>>['submissions']>([]);

  const [queryAadhaar, setQueryAadhaar] = React.useState('');
  const [foundVoter, setFoundVoter] = React.useState<Awaited<ReturnType<typeof api.adminFindVoter>>['voter'] | null>(
    null
  );
  const [uploadAadhaar, setUploadAadhaar] = React.useState('');
  const [uploadFingerprintSample, setUploadFingerprintSample] = React.useState<{
    provider: 'platform-webauthn';
    credentialId: string;
    verifiedAt: string;
  } | null>(null);
  const [uploadFaceDescriptor, setUploadFaceDescriptor] = React.useState<number[] | null>(null);
  const [uploadStatus, setUploadStatus] = React.useState('');

  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function login() {
    setBusy(true);
    setError('');
    try {
      const res = await api.adminLogin({ username, password });
      setAdminSession(res.token);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  const refresh = React.useCallback(
    async (token: string) => {
      const [s, l, vr, v, sub] = await Promise.all([
        api.adminStats(token),
        api.adminFraudLogs(token, 5000),
        api.adminVotes(token, 5000),
        api.adminVoters(token, 5000),
        api.adminBiometricSubmissions(token, 5000),
      ]);
      setStats(s);
      setLogs(l.logs);
      setVoteRecords(vr.votes);
      setVoters(v.voters);
      setSubmissions(sub.submissions);
    },
    []
  );

  React.useEffect(() => {
    if (!adminToken) return;
    refresh(adminToken).catch(() => undefined);
    const t = window.setInterval(() => refresh(adminToken).catch(() => undefined), 4000);
    return () => window.clearInterval(t);
  }, [adminToken, refresh]);

  async function searchVoter() {
    setBusy(true);
    setError('');
    try {
      const res = await api.adminFindVoter(adminToken, queryAadhaar.trim());
      setFoundVoter(res.voter);
    } catch (err: any) {
      setFoundVoter(null);
      setError(err?.message || 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleLock() {
    if (!foundVoter) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.adminSetLock(adminToken, foundVoter.aadhaarNumber, !foundVoter.locked);
      setFoundVoter({ ...foundVoter, locked: res.locked });
    } catch (err: any) {
      setError(err?.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function uploadVoterBiometric() {
    if (!uploadAadhaar || !uploadFingerprintSample || !uploadFaceDescriptor?.length) {
      setError('Aadhaar, fresh fingerprint scan, and face capture are required');
      return;
    }

    setBusy(true);
    setError('');
    setUploadStatus('');
    try {
      const res = await api.adminUploadBiometric(adminToken, uploadAadhaar, {
        fingerprintSample: uploadFingerprintSample,
        faceDescriptor: uploadFaceDescriptor,
      });

      setUploadStatus(`Uploaded for ${res.voter.aadhaarNumber} | blockHash: ${res.audit.blockHash.slice(0, 12)}...`);
      setUploadFingerprintSample(null);
      setUploadFaceDescriptor(null);
      await refresh(adminToken);
    } catch (err: any) {
      setError(err?.message || 'Biometric upload failed');
    } finally {
      setBusy(false);
    }
  }

  const votesChart = stats
    ? barChart(
        stats.votesByCandidate.map((v) => `${v.name} (${v.party})`),
        stats.votesByCandidate.map((v) => v.votes)
      )
    : null;

  const stateChart = stats
    ? barChart(
        stats.stateWiseBreakdown.map((s) => s.state),
        stats.stateWiseBreakdown.map((s) => s.votes)
      )
    : null;

  const totalVotes = stats?.votesByCandidate.reduce((sum, c) => sum + c.votes, 0) ?? 0;

  return (
    <div className="pt-10">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Admin Dashboard</div>
            <div className="text-sm opacity-75 mt-1">Fraud monitoring + state-wise breakdown (mock national system).</div>
          </div>
          {adminToken ? (
            <button className="btn-ghost" onClick={clearAdminSession}>
              Sign out
            </button>
          ) : null}
        </div>

        {!adminToken ? (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass rounded-2xl p-5">
              <div className="text-sm font-medium">Admin Login</div>
              <div className="mt-4 space-y-3">
                <label>
                  <div className="text-sm font-medium">Username</div>
                  <input className="input mt-2" value={username} onChange={(e) => setUsername(e.target.value)} />
                </label>
                <label>
                  <div className="text-sm font-medium">Password</div>
                  <input
                    className="input mt-2"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {error ? <div className="text-sm text-rose-500">{error}</div> : null}
                <button className="btn-primary w-full" onClick={login} disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
                <div className="text-xs opacity-70">Demo credentials: admin / admin123</div>
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="text-sm font-medium">Capabilities</div>
              <div className="mt-3 text-sm opacity-80 leading-relaxed">
                Unified admin interface with access to confidential voter records, including voter ID, Aadhaar,
                fingerprint hash, and face hash. Monitor fraud attempts and lock suspicious accounts.
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="badge">bcrypt passwords</div>
                <div className="badge">JWT-protected admin APIs</div>
                <div className="badge">Fraud logs + lock accounts</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            {error ? <div className="text-sm text-rose-500">{error}</div> : null}

            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Live Polling Panel</div>
                  <div className="text-xs opacity-70 mt-1">Party-wise standing in election ballot row format</div>
                </div>
                <button className="btn-ghost" onClick={() => refresh(adminToken)} disabled={busy}>
                  Refresh
                </button>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                {(stats?.votesByCandidate || []).map((party) => {
                  const pct = totalVotes ? ((party.votes / totalVotes) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={party.candidateId} className="glass rounded-2xl p-4 min-w-[260px] snap-start border border-white/15">
                      <div className="text-xs opacity-70">Political Party</div>
                      <div className="mt-1 font-semibold">{party.party}</div>
                      <div className="mt-2 text-sm opacity-85">Candidate: {party.name}</div>
                      <div className="mt-3 flex items-center justify-between text-xs opacity-80">
                        <span>Votes: {party.votes}</span>
                        <span>Share: {pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="glass rounded-2xl p-5 md:col-span-1">
                <div className="text-xs opacity-70">Total voters</div>
                <div className="text-3xl font-semibold mt-2">{stats?.totalEligibleVoters ?? '—'}</div>
              </div>
              <div className="glass rounded-2xl p-5 md:col-span-1">
                <div className="text-xs opacity-70">Verified</div>
                <div className="text-3xl font-semibold mt-2">{stats?.totalVerifiedVoters ?? '—'}</div>
              </div>
              <div className="glass rounded-2xl p-5 md:col-span-1">
                <div className="text-xs opacity-70">Votes cast</div>
                <div className="text-3xl font-semibold mt-2">{stats?.totalVoted ?? '—'}</div>
              </div>
              <div className="glass rounded-2xl p-5 md:col-span-1">
                <div className="text-xs opacity-70">Fraud logs</div>
                <div className="text-3xl font-semibold mt-2">{stats?.totalFraudLogs ?? '—'}</div>
              </div>
              <div className="glass rounded-2xl p-5 md:col-span-1">
                <div className="text-xs opacity-70">Fraud flagged</div>
                <div className="text-3xl font-semibold mt-2">{stats?.fraudFlaggedVoters ?? '—'}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Votes per candidate</div>
                    <div className="text-xs opacity-70 mt-1">Auto-refresh every 4 seconds</div>
                  </div>
                  <button className="btn-ghost" onClick={() => refresh(adminToken)} disabled={busy}>
                    Refresh
                  </button>
                </div>
                <div className="mt-4">{votesChart ? <Bar data={votesChart.data} options={votesChart.options} /> : null}</div>
              </div>

              <div className="glass rounded-2xl p-5">
                <div className="text-sm font-medium">State-wise voting breakdown</div>
                <div className="text-xs opacity-70 mt-1">Aggregated from vote records</div>
                <div className="mt-4">{stateChart ? <Bar data={stateChart.data} options={stateChart.options} /> : null}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass rounded-2xl p-5">
                <div className="text-sm font-medium">Search voter by Aadhaar</div>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    className="input"
                    value={queryAadhaar}
                    onChange={(e) => setQueryAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="12-digit Aadhaar"
                    inputMode="numeric"
                  />
                  <button className="btn-primary" onClick={searchVoter} disabled={busy}>
                    Search
                  </button>
                </div>

                {foundVoter ? (
                  <div className="mt-4 glass rounded-2xl p-4">
                    <div className="font-semibold">{foundVoter.name}</div>
                    <div className="text-xs opacity-70 mt-1">Voter ID: {foundVoter.voterId}</div>
                    <div className="text-xs opacity-70 mt-1">
                      {foundVoter.state} • {foundVoter.constituency}
                    </div>
                    <div className="mt-3 text-xs break-all">
                      <span className="opacity-70">Aadhaar:</span> {foundVoter.aadhaarNumber}
                    </div>
                    <div className="mt-2 text-xs break-all">
                      <span className="opacity-70">Fingerprint hash:</span>{' '}
                      {foundVoter.fingerprintTemplateHash || 'Not enrolled'}
                    </div>
                    <div className="mt-2 text-xs break-all">
                      <span className="opacity-70">Face hash:</span> {foundVoter.faceEmbeddingHash || 'Not enrolled'}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="badge">hasVoted: {String(foundVoter.hasVoted)}</div>
                      <div className="badge">locked: {String(foundVoter.locked)}</div>
                      <div className="badge">fraudFlag: {String(foundVoter.fraudFlag)}</div>
                      <div className="badge">fraudAttempts: {foundVoter.fraudAttemptCount}</div>
                    </div>
                    <div className="mt-4">
                      <button className="btn-ghost" onClick={toggleLock} disabled={busy}>
                        {foundVoter.locked ? 'Unlock account' : 'Lock account'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="glass rounded-2xl p-5">
                <div className="text-sm font-medium">Admin Biometric Upload</div>
                <div className="text-xs opacity-70 mt-1">
                  Capture fresh biometrics in real time and upload them before voter login is allowed.
                </div>

                <div className="mt-3 space-y-3">
                  <label>
                    <div className="text-xs opacity-70">Aadhaar Number</div>
                    <input
                      className="input mt-1"
                      value={uploadAadhaar}
                      onChange={(e) => setUploadAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      inputMode="numeric"
                      placeholder="12-digit Aadhaar"
                    />
                  </label>

                  <FaceCapture
                    enabled
                    onDescriptor={(descriptor) => {
                      setUploadFaceDescriptor(descriptor);
                      setUploadStatus('');
                      setError('');
                    }}
                  />

                  <FingerprintScanner
                    enabled
                    onScan={(sample) => {
                      setUploadFingerprintSample(sample);
                      setUploadStatus('');
                      setError('');
                    }}
                  />

                  <div className="text-xs opacity-75">
                    Capture status: face {uploadFaceDescriptor?.length ? 'captured' : 'not captured'} | fingerprint{' '}
                    {uploadFingerprintSample?.credentialId ? 'captured' : 'not captured'}
                  </div>

                  <button className="btn-primary" onClick={uploadVoterBiometric} disabled={busy}>
                    {busy ? 'Uploading...' : 'Upload Biometric To Voter'}
                  </button>
                  {uploadStatus ? <div className="text-xs text-emerald-400">{uploadStatus}</div> : null}
                </div>
              </div>

              <div className="glass rounded-2xl p-5 lg:col-span-2">
                <div className="text-sm font-medium">Recent fraud logs</div>
                <div className="text-xs opacity-70 mt-1">Latest suspicious attempts (IP + reason)</div>
                <div className="mt-4 space-y-2 max-h-[340px] overflow-auto pr-1">
                  {logs.length ? (
                    logs.map((l) => (
                      <div key={l.id} className="glass rounded-2xl p-3">
                        <div className="text-sm font-medium">Aadhaar: {l.aadhaarNumber}</div>
                        <div className="text-xs opacity-70 mt-1">IP: {l.ip}</div>
                        <div className="text-xs opacity-70 mt-1">{new Date(l.createdAt).toLocaleString()}</div>
                        <div className="text-xs mt-2 opacity-80">{l.reason}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm opacity-70">No fraud logs yet.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 glass rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Who Voted To Which Party (Admin Only)</div>
                  <div className="text-xs opacity-70 mt-1">Full vote mapping with voter identity and selected party/candidate.</div>
                </div>
                <button className="btn-ghost" onClick={() => refresh(adminToken)} disabled={busy}>
                  Refresh
                </button>
              </div>

              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead>
                    <tr className="text-left opacity-70 border-b border-white/15">
                      <th className="py-2 pr-4">Voted At</th>
                      <th className="py-2 pr-4">Voter Name</th>
                      <th className="py-2 pr-4">Aadhaar</th>
                      <th className="py-2 pr-4">State</th>
                      <th className="py-2 pr-4">Constituency</th>
                      <th className="py-2 pr-4">Party</th>
                      <th className="py-2 pr-4">Candidate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voteRecords.length ? (
                      voteRecords.map((row) => (
                        <tr key={row.id} className="border-b border-white/10 align-top">
                          <td className="py-3 pr-4 whitespace-nowrap text-xs">{new Date(row.votedAt).toLocaleString()}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{row.voterName}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{row.aadhaarNumber}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{row.state}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{row.constituency}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{row.party}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{row.candidateName}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-sm opacity-70" colSpan={7}>
                          No vote records available yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 glass rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Confidential voter registry</div>
                  <div className="text-xs opacity-70 mt-1">
                    All available records (up to 5000) with voter ID, Aadhaar, fingerprint hash, and face hash.
                  </div>
                </div>
                <button className="btn-ghost" onClick={() => refresh(adminToken)} disabled={busy}>
                  Refresh
                </button>
              </div>

              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="text-left opacity-70 border-b border-white/15">
                      <th className="py-2 pr-4">Voter ID</th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Aadhaar</th>
                      <th className="py-2 pr-4">Fingerprint Hash</th>
                      <th className="py-2 pr-4">Face Hash</th>
                      <th className="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voters.length ? (
                      voters.map((v) => (
                        <tr key={v.id} className="border-b border-white/10 align-top">
                          <td className="py-3 pr-4 whitespace-nowrap">{v.voterId}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{v.name}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{v.aadhaarNumber}</td>
                          <td className="py-3 pr-4 break-all text-xs">{v.fingerprintTemplateHash || 'Not enrolled'}</td>
                          <td className="py-3 pr-4 break-all text-xs">{v.faceEmbeddingHash || 'Not enrolled'}</td>
                          <td className="py-3 pr-4 text-xs">
                            voted: {String(v.hasVoted)} | locked: {String(v.locked)} | fraud: {String(v.fraudFlag)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-sm opacity-70" colSpan={6}>
                          No voter records available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 glass rounded-2xl p-5">
              <div className="text-sm font-medium">Prototype biometric submissions</div>
              <div className="text-xs opacity-70 mt-1">
                Captured by voter interface and submitted to admin for review.
              </div>

              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left opacity-70 border-b border-white/15">
                      <th className="py-2 pr-4">Submission ID</th>
                      <th className="py-2 pr-4">Fingerprint</th>
                      <th className="py-2 pr-4">Face Included</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Submitted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.length ? (
                      submissions.map((s) => (
                        <tr key={s.id} className="border-b border-white/10 align-top">
                          <td className="py-3 pr-4 whitespace-nowrap">{s.id}</td>
                          <td className="py-3 pr-4 break-all text-xs">{s.fingerprintPreview}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{s.hasFace ? 'Yes' : 'No'}</td>
                          <td className="py-3 pr-4 whitespace-nowrap">{s.status}</td>
                          <td className="py-3 pr-4 whitespace-nowrap text-xs">{new Date(s.submittedAt).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-sm opacity-70" colSpan={5}>
                          No prototype submissions yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 text-xs opacity-70">Last updated: {stats?.lastUpdated ?? '—'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
