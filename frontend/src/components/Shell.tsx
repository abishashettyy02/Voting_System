import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import ThreeBackdrop from './ThreeBackdrop';
import { useTheme } from '../state/theme';
import { useAuth } from '../state/auth';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button className="btn-ghost" onClick={toggleTheme} aria-label="Toggle theme">
      <span className="text-sm">{theme === 'dark' ? 'Dark' : 'Light'}</span>
      <span className="text-xs opacity-70">Toggle</span>
    </button>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { clearVoterSession, voterToken } = useAuth();

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-indigo-500/10 via-zinc-50 to-emerald-500/10 dark:from-indigo-500/15 dark:via-zinc-950 dark:to-emerald-500/15">
      <ThreeBackdrop />

      <header className="sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
            <Link to="/" className="font-semibold tracking-tight">
              SecureVote <span className="opacity-60 text-sm">(Demo)</span>
            </Link>

            <nav className="hidden sm:flex items-center gap-2">
              <NavLink className="btn-ghost" to="/voter">
                Voter Interface
              </NavLink>
              <NavLink className="btn-ghost" to="/admin">
                Admin Interface
              </NavLink>
              <ThemeToggle />
              {voterToken ? (
                <button className="btn-primary" onClick={clearVoterSession}>
                  Sign out
                </button>
              ) : null}
            </nav>

            <div className="sm:hidden flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 relative">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {children}
        </motion.div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 relative">
        <div className="text-xs opacity-70">Demo system only. No real Aadhaar/biometric integration.</div>
      </footer>
    </div>
  );
}
