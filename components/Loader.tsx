
import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';

interface LoaderProps {
  progress?: { processed: number; total: number; status?: string } | null;
  onCancel?: () => void;
}

const Loader: React.FC<LoaderProps> = ({ progress, onCancel }) => {
  const phases = useMemo(() => [
    { id: 'prep', label: 'Data Preparation', keywords: ['Standardizing', 'Preparation'] },
    { id: 'match', label: 'Database Correlation', keywords: ['Matching', 'Correlation'] },
    { id: 'ai', label: 'Intelligent Inference', keywords: ['Inference', 'AI', 'Analyzing'] },
    { id: 'final', label: 'Finalizing Results', keywords: ['Processing final', 'Finalizing', 'complete'] },
  ], []);

  const currentPhaseIndex = useMemo(() => {
    if (!progress?.status) return 0;
    const status = progress.status;
    const index = phases.findIndex(p => p.keywords.some(k => status.includes(k)));
    return index === -1 ? 0 : index;
  }, [progress?.status, phases]);

  const percentage = progress?.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl mx-auto my-12 overflow-hidden">
      <div className="w-full space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-2">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center justify-center p-3 bg-blue-50 rounded-full"
          >
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-900">Matching Product Data to Seafood Watch Ratings</h2>
          <p className="text-gray-500 font-medium">{progress?.status || 'Initialising engine...'}</p>
        </div>

        {/* Phase Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {phases.map((phase, idx) => {
            const isComplete = idx < currentPhaseIndex;
            const isActive = idx === currentPhaseIndex;
            return (
              <div
                key={phase.id}
                className={`flex items-center space-x-3 p-4 rounded-xl border transition-all duration-300 ${
                  isActive ? 'bg-blue-50 border-blue-200 shadow-sm' : isComplete ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300" />
                )}
                <span className={`text-sm font-semibold ${isActive ? 'text-blue-700' : isComplete ? 'text-green-700' : 'text-gray-400'}`}>
                  {phase.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress Bar Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-end px-1">
            <div className="space-y-1">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Overall Progress</span>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-black text-gray-900 leading-none">{percentage}%</span>
                <span className="text-sm font-medium text-gray-400">Complete</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Items Processed</span>
              <span className="text-lg font-mono font-bold text-gray-700">
                {progress?.processed || 0} <span className="text-gray-300">/</span> {progress?.total || 0}
              </span>
            </div>
          </div>
          
          <div className="relative h-4 w-full bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-400"
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
            />
          </div>
        </div>

        {/* Warning/Info Box */}
        <AnimatePresence>
          {currentPhaseIndex === 2 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-start space-x-3 p-4 bg-amber-50 border border-amber-200 rounded-xl"
            >
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 space-y-1">
                <p className="font-bold">Deep Analysis in Progress</p>
                <p className="leading-relaxed opacity-80">AI is cross-referencing complex rows that didn&apos;t have exact database matches. This part requires semantic reasoning and may take slightly longer.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        {onCancel && (
          <div className="flex justify-center pt-2">
            <button
              onClick={onCancel}
              className="px-6 py-2.5 text-sm font-bold text-red-500 hover:text-white hover:bg-red-500 border border-red-100 hover:border-red-500 rounded-full transition-all duration-200 active:scale-95 shadow-sm"
            >
              Cancel Analysis
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Loader;
