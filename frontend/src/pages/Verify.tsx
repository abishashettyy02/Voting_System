import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

import { api } from '../lib/api';
import { useAuth } from '../state/auth';
import Modal from '../components/Modal';
import ProgressPill, { type ProgressStatus } from '../components/ProgressPill';
import FaceCapture from '../components/FaceCapture';
import FingerprintScanner from '../components/FingerprintScanner';

type FingerprintSample = {
  provider: 'platform-webauthn';
  credentialId: string;
  verifiedAt: string;
};
type MatchedSession = Awaited<ReturnType<typeof api.verifyByBiometrics>>;

function FraudScreen({ onReset }: { onReset: () => void }) {
  return (
    <motion.div
      className="card mt-10 relative overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="absolute inset-0 bg-rose-500/10" />
      <div className="relative">
        <div className="text-2xl font-semibold">Fraud Detection Triggered</div>
        <div className="mt-2 text-sm opacity-85 leading-relaxed">
          Aadhaar exists but biometric mismatch was detected. This attempt has been logged with IP address and a
          fraud counter incremented (demo behavior).
        </div>
        <motion.div
          className="mt-6 h-2 rounded-full bg-rose-500/25 overflow-hidden"
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 0.8 }}
        />
        <div className="mt-6 flex gap-3">
          <button className="btn-primary" onClick={onReset}>
            Return to Verification
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function Verify() {
  const nav = useNavigate();
  const { setVoterSession } = useAuth();

  const [fingerprintSample, setFingerprintSample] = React.useState<FingerprintSample | null>(null);
  const [faceDescriptor, setFaceDescriptor] = React.useState<number[] | null>(null);
  const [matchedSession, setMatchedSession] = React.useState<MatchedSession | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [errorOpen, setErrorOpen] = React.useState(false);
  const [errorText, setErrorText] = React.useState('');
  const [fraud, setFraud] = React.useState(false);
  const hasRequiredBiometrics = Boolean(fingerprintSample);

  const progress: Array<{ label: string; status: ProgressStatus }> = [
    { label: 'Face (Optional)', status: faceDescriptor ? 'done' : 'idle' },
    { label: 'Fingerprint', status: fingerprintSample ? 'done' : 'active' },
    { label: 'Match Voter', status: busy ? 'active' : matchedSession ? 'done' : hasRequiredBiometrics ? 'active' : 'idle' },
  ];

  async function submit() {
    if (!fingerprintSample) return;
    setBusy(true);

    try {
      const data = await api.verifyByBiometrics({
        fingerprintSample,
        ...(faceDescriptor?.length ? { faceDescriptor } : {}),
      });
      setMatchedSession(data);
      if (data.voter.canVote) {
        setVoterSession(data.token, data.voter);
        nav('/voter', { state: { authMessage: 'Both authentication is successful' } });
      }
    } catch (err: any) {
      if (err?.code === 'FRAUD_DETECTED') {
        setFraud(true);
      } else {
        setErrorText(err?.message || 'Verification failed');
        setErrorOpen(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function resetBiometrics() {
    setFingerprintSample(null);
    setFaceDescriptor(null);
    setMatchedSession(null);
  }

  if (fraud) {
    return (
      <FraudScreen
        onReset={() => {
          setFraud(false);
          resetBiometrics();
        }}
      />
    );
  }

  return (
    <div className="pt-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="text-xl font-semibold">National Voter Verification</div>
          <div className="mt-2 text-sm opacity-80">For now, fingerprint verification is required to proceed. Face capture is optional.</div>

          <div className="mt-6 grid grid-cols-1 gap-4">
            <div className="flex flex-wrap gap-2">
              {progress.map((p) => (
                <ProgressPill key={p.label} label={p.label} status={p.status} />
              ))}
            </div>

            <div className="pt-2 space-y-3">
              <FaceCapture
                enabled
                onDescriptor={(d) => {
                  setFaceDescriptor(d);
                  setMatchedSession(null);
                }}
              />
              <FingerprintScanner
                enabled
                onScan={(s) => {
                  setFingerprintSample(s);
                  setMatchedSession(null);
                }}
              />
            </div>

            <div className="pt-3 flex flex-col sm:flex-row gap-3">
              <button className="btn-primary" disabled={!hasRequiredBiometrics || busy} onClick={submit}>
                {busy ? 'Matching...' : 'Verify Fingerprint & Open Voting Panel'}
              </button>

              <button className="btn-ghost" onClick={resetBiometrics} disabled={busy}>
                Reset Biometrics
              </button>
            </div>

            {matchedSession ? (
              <div className="glass rounded-2xl p-4 border border-emerald-500/35">
                <div className="text-sm font-medium">Voter details fetched from biometrics</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="opacity-70 text-xs">Name</div>
                    <div>{matchedSession.voter.name}</div>
                  </div>
                  <div>
                    <div className="opacity-70 text-xs">Aadhaar</div>
                    <div>{matchedSession.voter.aadhaarNumber}</div>
                  </div>
                  <div>
                    <div className="opacity-70 text-xs">State</div>
                    <div>{matchedSession.voter.state || 'Unknown'}</div>
                  </div>
                  <div>
                    <div className="opacity-70 text-xs">Vote Eligibility</div>
                    <div className={matchedSession.voter.canVote ? 'text-emerald-300' : 'text-rose-300'}>
                      {matchedSession.voter.canVote ? 'Eligible to vote now' : 'Not eligible - vote already recorded'}
                    </div>
                  </div>
                  <div>
                    <div className="opacity-70 text-xs">Constituency</div>
                    <div>{matchedSession.voter.constituency || 'Unknown'}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="text-xs opacity-70">
              Biometrics are simulated: templates and descriptors are securely hashed for demo matching.
            </div>
          </div>
        </div>

        <div className="card relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-emerald-500/20 blur-3xl" />

          <div className="relative">
            <div className="text-xl font-semibold">Security Monitor (Demo)</div>
            <div className="mt-3 text-sm opacity-80 leading-relaxed">
              If a biometric mismatch is detected against enrolled records, the backend flags suspicious activity and
              records an audit trail for admins.
            </div>

            <div className="mt-5 space-y-3">
              {[
                { k: 'Auto Fetch', v: 'Name, Aadhaar, state and constituency come from biometric match' },
                { k: 'Fraud Logs', v: 'Mismatch attempts are recorded for admin review' },
                { k: 'Vote Once', v: 'Atomic enforcement + unique vote record' },
              ].map((row) => (
                <div key={row.k} className="glass rounded-2xl p-4">
                  <div className="text-xs opacity-70">{row.k}</div>
                  <div className="mt-1">{row.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Modal open={errorOpen} title="Verification failed" onClose={() => setErrorOpen(false)}>
        <div className="text-sm opacity-90">{errorText}</div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={() => setErrorOpen(false)}>
            Try again
          </button>
        </div>
      </Modal>
    </div>
  );
}
