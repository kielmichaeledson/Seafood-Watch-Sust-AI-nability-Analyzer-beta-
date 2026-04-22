
import React, { useState, useEffect } from 'react';
import { SeafoodResultItem, Rating } from '../types';
import { getSeafoodById, findCandidates } from '../services/referenceDatabase';
import { Check, X, AlertCircle, ChevronRight, ChevronLeft, Search, Database, Info, ArrowRight } from 'lucide-react';

interface ReviewQueueProps {
  items: SeafoodResultItem[];
  onApprove: (rowId: string, uniqueId: string) => void;
  onCorrect: (rowId: string, newUniqueId: string) => void;
  columnMapping?: Record<string, string>;
}

function parseMatchedKDEs(kdeString: string) {
  if (!kdeString || kdeString === 'N/A') return { species: 'N/A', type: 'N/A', subnational: 'N/A', country: 'N/A', method: 'N/A' };
  
  const typeMatch = kdeString.match(/\(([^)]+)\)/);
  const type = typeMatch ? typeMatch[1] : 'N/A';
  const cleanKde = kdeString.replace(/\s*\([^)]+\)/, '');
  
  const parts = cleanKde.split(' | ');
  if (parts.length >= 4) {
      return {
          species: parts[0],
          type: type,
          subnational: parts[1],
          country: parts[2],
          method: parts[3]
      };
  }
  if (parts.length === 3) {
      return {
          species: parts[0],
          type: type,
          subnational: 'N/A',
          country: parts[1],
          method: parts[2]
      };
  }
  return { species: cleanKde, type: type, subnational: 'N/A', country: 'N/A', method: 'N/A' };
}

const ReviewQueue: React.FC<ReviewQueueProps> = ({ items, onApprove, onCorrect, columnMapping = {} }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');

  const currentItem = items[currentIndex];

  useEffect(() => {
    if (currentItem) {
      setSelectedCandidateId(currentItem.uniqueId);
    }
  }, [currentItem, currentIndex]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-800">Review Queue Empty</h3>
        <p className="text-gray-500 mt-2 text-center max-w-md">
          All items requiring review have been cleared.
        </p>
      </div>
    );
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    const candidates = await findCandidates({
      species: searchQuery,
    }, 10);
    setSearchResults(candidates);
  };

  const handleSelectCorrection = (uniqueId: string) => {
    setSelectedCandidateId(uniqueId);
    setIsCorrecting(false);
  };

  const handleApprove = () => {
    onApprove(currentItem.rowId, selectedCandidateId);
    // Note: Items list shifts, index logic handled by parent re-render mostly
  };

  const getInputDetail = (fieldKey: string) => {
    const header = columnMapping[fieldKey];
    if (!header || header === 'N/A') return 'N/A';
    return String(currentItem[header] || 'N/A');
  };

  const activeRecord = getSeafoodById(selectedCandidateId);
  const matchDetails = activeRecord 
    ? parseMatchedKDEs(activeRecord.matchedKDEs)
    : parseMatchedKDEs(currentItem.matchedKDEs);

  const attributes = [
    { label: 'Species', key: 'Common name', matchVal: matchDetails.species },
    { label: 'Farmed/Wild', key: 'Wild or Farmed', matchVal: matchDetails.type },
    { label: 'Country', key: 'Source country', matchVal: matchDetails.country },
    { label: 'Subnational', key: 'Subnational area', matchVal: matchDetails.subnational },
    { label: 'Body of Water', key: 'Body of water', matchVal: 'N/A' }, // Usually not explicit in match string yet
    { label: 'Method', key: 'Production Method', matchVal: matchDetails.method },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-black text-gray-900 leading-tight">Review Queue</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wider">
              {items.length} Items Remaining
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button 
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="p-2 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 transition-all"
              title="Previous Item"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="px-4 text-sm font-bold text-gray-500">
              {currentIndex + 1} <span className="mx-1 text-gray-300">/</span> {items.length}
            </div>
            <button 
              onClick={() => setCurrentIndex(prev => Math.min(items.length - 1, prev + 1))}
              disabled={currentIndex === items.length - 1}
              className="p-2 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 transition-all"
              title="Next Item"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Bar: AI Candidates & Search */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Candidate Matches</h3>
            </div>
            <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto">
              {currentItem.candidates?.map((cand) => (
                <button
                  key={cand.uniqueId}
                  onClick={() => setSelectedCandidateId(cand.uniqueId)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all group ${
                    selectedCandidateId === cand.uniqueId 
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' 
                    : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <div className={`text-xs font-bold ${selectedCandidateId === cand.uniqueId ? 'text-blue-800' : 'text-gray-900 group-hover:text-blue-700'}`}>
                        {cand.matchedKDEs.split(' | ')[0]}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 line-clamp-1">
                        {cand.matchedKDEs.split(' | ').slice(1, 3).join(' • ')}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400 mt-0.5">#{cand.uniqueId}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase ${
                        cand.rating === Rating.BestChoice ? 'bg-green-100 text-green-700' :
                        cand.rating === Rating.GoodAlternative ? 'bg-yellow-100 text-yellow-700' :
                        cand.rating === Rating.Avoid ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {cand.rating.split(' ').map(s => s[0]).join('')}
                      </span>
                      {cand.reliabilityScore > 0 && (
                        <div className="text-[8px] font-bold text-blue-600">{cand.reliabilityScore}%</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}

              <div className="pt-4 px-2 pb-2">
                {!isCorrecting ? (
                  <button 
                    onClick={() => setIsCorrecting(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Search other IDs...
                  </button>
                ) : (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                     <form onSubmit={handleSearch} className="flex gap-1">
                        <input 
                          type="text" 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search..."
                          className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded focus:border-blue-500 outline-none"
                          autoFocus
                        />
                        <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded">
                          Go
                        </button>
                     </form>
                     {searchResults.length > 0 && (
                        <div className="max-h-40 overflow-y-auto border border-gray-100 rounded bg-white text-[10px]">
                          {searchResults.map((cand) => (
                             <button
                                key={cand.record.UniqueID}
                                onClick={() => handleSelectCorrection(cand.record.UniqueID)}
                                className="w-full text-left p-2 hover:bg-blue-50 border-b border-gray-50 flex justify-between items-center"
                             >
                               <span className="font-medium">{cand.record.CommonName} <span className="text-gray-400 font-mono">#{cand.record.UniqueID}</span></span>
                               <ArrowRight className="w-3 h-3 text-gray-300" />
                             </button>
                          ))}
                        </div>
                     )}
                     <button onClick={() => setIsCorrecting(false)} className="w-full py-1 text-[10px] text-gray-400 hover:text-gray-600">Cancel Search</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Detailed Comparison Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Match Analysis & Verification</h3>
              <div className="flex items-center gap-3">
                 {currentItem.reliabilityScore < 100 && (
                   <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[10px] font-bold border border-amber-100">
                     <AlertCircle className="w-3 h-3" />
                     {currentItem.reliabilityScore}% Confidence
                   </div>
                 )}
                 <RatingBadge rating={activeRecord?.rating || currentItem.rating} />
              </div>
            </div>

            <div className="p-0">
               {/* Comparison Table Header */}
               <div className="grid grid-cols-12 bg-gray-50/50 border-b border-gray-100 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  <div className="col-span-3 py-3 px-6">Attribute</div>
                  <div className="col-span-4 py-3 px-4 border-l border-gray-100">Your Data</div>
                  <div className="col-span-5 py-3 px-4 border-l border-gray-100 text-blue-600">Matched Record ({selectedCandidateId})</div>
               </div>

               {/* Comparison Rows */}
               <div className="divide-y divide-gray-50">
                  {attributes.map((attr) => {
                    const inputVal = getInputDetail(attr.key);
                    const isMismatch = attr.matchVal !== 'N/A' && inputVal !== 'N/A' && 
                                      !attr.matchVal.toLowerCase().includes(inputVal.toLowerCase()) &&
                                      !inputVal.toLowerCase().includes(attr.matchVal.toLowerCase());
                    
                    return (
                      <div key={attr.label} className={`grid grid-cols-12 text-sm items-center hover:bg-gray-50 transition-colors ${isMismatch ? 'bg-amber-50/20' : ''}`}>
                         <div className="col-span-3 py-4 px-6 text-xs font-bold text-gray-500">
                           {attr.label}
                         </div>
                         <div className="col-span-4 py-4 px-4 border-l border-gray-100 truncate text-gray-900 font-medium">
                           {inputVal}
                         </div>
                         <div className={`col-span-5 py-4 px-4 border-l border-gray-100 text-gray-800 ${isMismatch ? 'text-amber-900 bg-amber-50/40' : ''}`}>
                           <div className="flex items-center gap-2">
                             {attr.matchVal}
                             {isMismatch && (
                               <span className="flex-shrink-0 text-amber-500" title="Possible record mismatch">
                                 <AlertCircle className="w-3.5 h-3.5" />
                               </span>
                             )}
                           </div>
                         </div>
                      </div>
                    );
                  })}
               </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 space-y-4">
               <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">AI Reasoning</h4>
                  <p className="text-sm text-gray-600 italic leading-relaxed">
                    "{currentItem.notes}"
                  </p>
               </div>

               <div className="flex gap-4 pt-2">
                  <button 
                    onClick={handleApprove}
                    className="flex-1 flex items-center justify-center gap-3 px-8 py-4 bg-green-600 text-white font-black rounded-xl hover:bg-green-700 transition-all shadow-md hover:shadow-lg active:scale-95"
                  >
                    <Check className="w-5 h-5" />
                    Approve & Verify Match
                  </button>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Internal Tiny Components for UI parity
const RatingBadge: React.FC<{ rating: Rating }> = ({ rating }) => {
    const styles = {
        [Rating.BestChoice]: 'bg-green-100 text-green-700 border-green-200',
        [Rating.GoodAlternative]: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        [Rating.Avoid]: 'bg-red-100 text-red-700 border-red-200',
        [Rating.Certified]: 'bg-blue-100 text-blue-700 border-blue-200',
        [Rating.NA]: 'bg-gray-100 text-gray-500 border-gray-200',
        [Rating.Unknown]: 'bg-gray-100 text-gray-500 border-gray-200',
    };

    return (
        <span className={`px-3 py-1 text-xs font-black uppercase tracking-widest rounded-full border ${styles[rating] || styles[Rating.NA]}`}>
            {rating}
        </span>
    );
};

export default ReviewQueue;
