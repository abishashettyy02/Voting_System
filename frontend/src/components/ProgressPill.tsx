import { motion } from 'framer-motion';

export type ProgressStatus = 'idle' | 'active' | 'done';

export default function ProgressPill({ label, status }: { label: string; status: ProgressStatus }) {
  const styles =
    status === 'done'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
      : status === 'active'
        ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/20'
        : 'bg-white/40 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 border-white/20';

  return (
    <div className={`badge border ${styles} relative overflow-hidden`}>
      {status === 'active' ? (
        <motion.div
          className="absolute inset-0 bg-indigo-500/10"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        />
      ) : null}
      <span className="relative">{label}</span>
    </div>
  );
}
