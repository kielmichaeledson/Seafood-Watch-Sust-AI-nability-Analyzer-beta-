
import React, { useState } from 'react';
import { SeafoodResultItem, Rating } from '../../types';
import { getSeafoodById, findCandidates } from '../../services/referenceDatabase';
import { Check, X, AlertCircle, ChevronRight, ChevronLeft, Search } from 'lucide-react';

interface ReviewQueueProps {
  items: SeafoodResultItem[];
  onApprove: (rowId: string, uniqueId: string) => void;
  onCorrect: (rowId: string, newUniqueId: string) => void;
}

const ReviewQueue: React.FC<ReviewQueueProps> = ({ items, onApprove, onCorrect }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-800">Review Queue Empty</h3>
        <p className="text-gray-500 mt-2 text-center max-w-md">
          All low-confidence matches have been reviewed. Great job!
        </p>
      </div>
    );
  }

  const currentItem = items[currentIndex];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    // Simple search in reference database
    const candidates = await findCandidates({
      species: searchQuery,
      country: '',
      subnational: '',
      method: '',
      farmedWild: ''
    }, 10);
    setSearchResults(candidates);
  };

  const handleSelectCorrection = (uniqueId: string) => {
    onCorrect(currentItem.rowId, uniqueId);
    setIsCorrecting(false);
    setSearchQuery('');
    setSearchResults([]);
    if (currentIndex < items.length - 1) {
      // Don't increment index because the current item will be removed from the list anyway
      // since its needsReview flag will be set to false in the parent.
      // Actually, the parent will re-render and 'items' will be shorter.
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center text-white">
          <div>
            <h2 className="text-lg font-bold">Review Queue</h2>
            <p className="text-blue-100 text-sm">Item {currentIndex + 1} of {items.length}</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="p-2 hover:bg-blue-700 rounded-full disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setCurrentIndex(prev => Math.min(items.length - 1, prev + 1))}
              disabled={currentIndex === items.length - 1}
              className="p-2 hover:bg-blue-700 rounded-full disabled:opacity-50 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Original Data */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Input Data</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-100">
                {Object.entries(currentItem)
                  .filter(([key]) => !['rowId', 'rating', 'uniqueId', 'matchedKDEs', 'reliabilityScore', 'notes', 'isUpdating', 'isManual', 'isVerified', 'needsReview', 'auditTrail', '_originalIndex'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-gray-500">{key}:</span>
                      <span className="font-medium text-gray-800">{String(value || 'N/A')}</span>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* AI Suggestion */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">AI Suggestion</h3>
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      currentItem.rating === Rating.BestChoice ? 'bg-green-500' :
                      currentItem.rating === Rating.GoodAlternative ? 'bg-yellow-500' :
                      currentItem.rating === Rating.Avoid ? 'bg-red-500' : 'bg-gray-400'
                    }`} />
                    <span className="font-bold text-gray-800">{currentItem.rating}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">
                    <AlertCircle className="w-3 h-3" />
                    {currentItem.reliabilityScore}% Confidence
                  </div>
                </div>

                <div>
                  <span className="text-xs text-gray-500 block mb-1">Matched ID:</span>
                  <span className="font-mono text-sm bg-white px-2 py-1 rounded border border-blue-200">{currentItem.uniqueId}</span>
                </div>

                <div>
                  <span className="text-xs text-gray-500 block mb-1">Reasoning:</span>
                  <p className="text-sm text-gray-700 leading-relaxed italic">
                    "{currentItem.notes}"
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-10 pt-8 border-t border-gray-100 flex flex-col sm:flex-row gap-4 justify-center">
            {!isCorrecting ? (
              <>
                <button 
                  onClick={() => onApprove(currentItem.rowId, currentItem.uniqueId)}
                  className="flex items-center justify-center gap-2 px-8 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-all shadow-md hover:shadow-lg"
                >
                  <Check className="w-5 h-5" />
                  Approve AI Match
                </button>
                <button 
                  onClick={() => setIsCorrecting(true)}
                  className="flex items-center justify-center gap-2 px-8 py-3 bg-white text-blue-600 border-2 border-blue-600 font-bold rounded-lg hover:bg-blue-50 transition-all"
                >
                  <Search className="w-5 h-5" />
                  Find Correct Match
                </button>
              </>
            ) : (
              <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex gap-2">
                  <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search species, country, or method..."
                      className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none"
                      autoFocus
                    />
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">
                      Search
                    </button>
                  </form>
                  <button 
                    onClick={() => setIsCorrecting(false)}
                    className="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium"
                  >
                    Cancel
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {searchResults.map((cand, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectCorrection(cand.record.UniqueID)}
                        className="w-full text-left p-4 hover:bg-blue-50 flex justify-between items-center group transition-colors"
                      >
                        <div>
                          <div className="font-bold text-gray-800 group-hover:text-blue-700">{cand.record.CommonName}</div>
                          <div className="text-xs text-gray-500">
                            {cand.record.EconomicZone || cand.record.SubnationalArea} • {cand.record.Methods}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            getSeafoodById(cand.record.UniqueID)?.rating === Rating.BestChoice ? 'bg-green-100 text-green-700' :
                            getSeafoodById(cand.record.UniqueID)?.rating === Rating.GoodAlternative ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {getSeafoodById(cand.record.UniqueID)?.rating}
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewQueue;
