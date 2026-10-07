import React from 'react';

type VoterMeta = {
  name?: string;
  aadhaarNumber?: string;
  hasVoted?: boolean;
  state?: string;
  constituency?: string;
  fraudFlag?: boolean;
};

type AuthContextValue = {
  voterToken: string;
  adminToken: string;
  voterMeta: VoterMeta | null;
  setVoterSession: (token: string, meta?: VoterMeta) => void;
  clearVoterSession: () => void;
  setAdminSession: (token: string) => void;
  clearAdminSession: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

const LS_VOTER = 'voterToken';
const LS_ADMIN = 'adminToken';
const LS_VOTER_META = 'voterMeta';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [voterToken, setVoterToken] = React.useState(() => localStorage.getItem(LS_VOTER) || '');
  const [adminToken, setAdminToken] = React.useState(() => localStorage.getItem(LS_ADMIN) || '');
  const [voterMeta, setVoterMeta] = React.useState<VoterMeta | null>(() => {
    const raw = localStorage.getItem(LS_VOTER_META);
    return raw ? (JSON.parse(raw) as VoterMeta) : null;
  });

  const setVoterSession = React.useCallback((token: string, meta?: VoterMeta) => {
    setVoterToken(token);
    localStorage.setItem(LS_VOTER, token);
    if (meta) {
      setVoterMeta(meta);
      localStorage.setItem(LS_VOTER_META, JSON.stringify(meta));
    }
  }, []);

  const clearVoterSession = React.useCallback(() => {
    setVoterToken('');
    setVoterMeta(null);
    localStorage.removeItem(LS_VOTER);
    localStorage.removeItem(LS_VOTER_META);
  }, []);

  const setAdminSession = React.useCallback((token: string) => {
    setAdminToken(token);
    localStorage.setItem(LS_ADMIN, token);
  }, []);

  const clearAdminSession = React.useCallback(() => {
    setAdminToken('');
    localStorage.removeItem(LS_ADMIN);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      voterToken,
      adminToken,
      voterMeta,
      setVoterSession,
      clearVoterSession,
      setAdminSession,
      clearAdminSession,
    }),
    [adminToken, clearAdminSession, clearVoterSession, setAdminSession, setVoterSession, voterMeta, voterToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
