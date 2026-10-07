import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function Landing() {
  return (
    <div className="pt-10 sm:pt-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
        <div className="card relative overflow-hidden">
          <div className="absolute -top-28 -right-28 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute -bottom-28 -left-28 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl" />

          <div className="relative">
            <div className="badge">National-scale mock • Academic demo • Secure UX</div>
            <h1 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-tight">
              Secure National Biometric Voting System
            </h1>
            <p className="mt-4 text-zinc-700 dark:text-zinc-300 leading-relaxed">
              Two clear interfaces: one Admin Interface for full confidential voter records and one Voter Interface for
              Aadhaar + face + fingerprint verification before voting.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link className="btn-primary" to="/voter">
                Open Voter Interface
              </Link>
              <Link className="btn-ghost" to="/admin">
                Open Admin Interface
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="glass rounded-2xl p-4">
                <div className="text-sm font-medium">Fraud Detection</div>
                <div className="text-xs opacity-70 mt-1">Flags biometric mismatch attempts</div>
              </div>
              <div className="glass rounded-2xl p-4">
                <div className="text-sm font-medium">Confidential Records</div>
                <div className="text-xs opacity-70 mt-1">Voter ID + Aadhaar + biometric hashes</div>
              </div>
              <div className="glass rounded-2xl p-4">
                <div className="text-sm font-medium">JWT + RBAC</div>
                <div className="text-xs opacity-70 mt-1">Voter/Admin separated access</div>
              </div>
            </div>
          </div>
        </div>

        <motion.div
          className="card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="text-sm font-medium">Demo biometric pipeline</div>
          <div className="mt-4 space-y-3">
            {[
              { k: '1', v: 'Admin uploads fresh face + system fingerprint for a voter Aadhaar.' },
              { k: '2', v: 'Voter verifies identity with both face scan and system fingerprint.' },
              { k: '3', v: 'Only exact admin-mapped fingerprint + face pair is eligible for login.' },
              { k: '4', v: 'Eligibility check confirms voter status before voting.' },
              { k: '5', v: 'If matched → JWT issued and voting unlocked once.' },
            ].map((row) => (
              <div key={row.k} className="glass rounded-2xl p-4">
                <div className="text-xs opacity-70">Step {row.k}</div>
                <div className="mt-1">{row.v}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 text-xs opacity-70">
            Important: This demo does NOT connect to any real Aadhaar or government APIs.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
