import React from 'react';
import confetti from 'canvas-confetti';
import { useLocation } from 'react-router-dom';

import { api, Candidate } from '../lib/api';
import { useAuth } from '../state/auth';

import candidate1 from '../assets/candidate-1.svg';
import candidate2 from '../assets/candidate-2.svg';
import candidate3 from '../assets/candidate-3.svg';

const photos: Record<string, string> = {
  'candidate-1.svg': candidate1,
  'candidate-2.svg': candidate2,
  'candidate-3.svg': candidate3,
};

function Card3D({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const rx = (py - 0.5) * -8;
      const ry = (px - 0.5) * 10;
      el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
    };

    const onLeave = () => {
      el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0)';
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} className="transition-transform duration-200 will-change-transform">
      {children}
    </div>
  );
}

export default function Vote() {
  const location = useLocation();
  const locationState = (location.state || {}) as { authMessage?: string };
  const { voterToken, voterMeta, setVoterSession } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [message, setMessage] = React.useState(locationState.authMessage || '');
  const [busyId, setBusyId] = React.useState('');

  const hasVoted = Boolean(voterMeta?.hasVoted);

  const loadCandidates = React.useCallback(async () => {
    const data = await api.candidates(voterToken);
    setCandidates(data.candidates || []);
  }, [voterToken]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        await loadCandidates();
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const t = window.setInterval(() => {
      if (!mounted) return;
      loadCandidates().catch(() => undefined);
    }, 3000);

    return () => {
      mounted = false;
      window.clearInterval(t);
    };
  }, [loadCandidates]);

  async function cast(candidateId: string) {
    setBusyId(candidateId);
    setMessage('');
    try {
      const res = await api.vote(voterToken, candidateId);
      setMessage(res.message || 'Vote Successfully Recorded');
      setVoterSession(voterToken, { ...(voterMeta || {}), hasVoted: true });

      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.65 },
      });

      await loadCandidates();
    } catch (err: any) {
      setMessage(err?.message || 'Voting failed');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="pt-10">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Voter Interface: Cast Vote</div>
            <div className="text-sm opacity-75 mt-1">
              {voterMeta?.state ? `${voterMeta.state} • ${voterMeta.constituency}` : 'National demo'} — vote only once.
            </div>
          </div>
          <div className="badge">Status: {hasVoted ? 'Voted' : 'Not voted'}</div>
        </div>

        {message ? <div className="mt-4 glass rounded-2xl p-4 font-medium">{message}</div> : null}

        <div className="mt-6">
          {loading ? (
            <div className="glass rounded-2xl p-6">Loading candidates…</div>
          ) : (
            <div>
              <div className="text-sm opacity-75 mb-3">Polling panel - political parties in ballot row</div>
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
              {candidates.map((c) => (
                <Card3D key={c.id}>
                  <div className="glass rounded-2xl p-5 min-w-[280px] md:min-w-[320px] snap-start flex flex-col border border-white/20 hover:border-white/30">
                    <div className="flex items-center gap-3">
                      <img src={photos[c.photoKey] || candidate1} alt={`${c.name} avatar`} className="w-14 h-14 rounded-2xl" />
                      <div>
                        <div className="font-semibold leading-tight">{c.name}</div>
                        <div className="text-xs opacity-70">{c.party}</div>
                      </div>
                    </div>

                    <div className="mt-3 text-sm opacity-85 leading-relaxed">{c.description}</div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-xs opacity-70">Votes: {c.votes ?? 0}</div>
                      <button
                        className="btn-primary"
                        disabled={hasVoted || busyId === c.id}
                        onClick={() => cast(c.id)}
                      >
                        {hasVoted ? 'Voting Locked' : busyId === c.id ? 'Recording…' : 'Vote'}
                      </button>
                    </div>
                  </div>
                </Card3D>
              ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-xs opacity-70">Counts refresh every 3 seconds (demo real-time).</div>
      </div>
    </div>
  );
}
