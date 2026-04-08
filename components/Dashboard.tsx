
import React, { useState, useMemo, useEffect } from 'react';
import { UploadSummary, Rating, UserRole, SeafoodResultItem } from '../types';
import { normalizeSpecies, normalizeCountry } from '../utils/normalization';
import RatingBadge from './RatingBadge';
import DonutChart from './DonutChart';
import { getTrainingDataCount } from '../services/trainingService';

interface DashboardProps {
  history: UploadSummary[];
  onAnalyzeNew: () => void;
  onViewResults: (summary: UploadSummary) => void;
  userRole: UserRole;
}

const ratingColors: { [key in Rating]: string } = {
  [Rating.BestChoice]: '#23872B',
  [Rating.GoodAlternative]: '#BA8C17',
  [Rating.Avoid]: '#AA323C',
  [Rating.Certified]: '#00629B',
  [Rating.NA]: '#9ca3af',
};

const ratingLabels: { [key in Rating]: string } = {
  [Rating.BestChoice]: 'Green',
  [Rating.GoodAlternative]: 'Yellow',
  [Rating.Avoid]: 'Red',
  [Rating.Certified]: 'Certified',
  [Rating.NA]: 'N/A',
};

const ratingOrder: Rating[] = [Rating.BestChoice, Rating.GoodAlternative, Rating.Avoid, Rating.Certified, Rating.NA];

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="bg-white p-6 rounded-lg shadow border border-gray-200 flex items-start">
    <div className="bg-blue-100 text-[#00629B] rounded-full p-3 mr-4">
      {icon}
    </div>
    <div>
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ history, onAnalyzeNew, onViewResults, userRole }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [metricType, setMetricType] = useState<'volume' | 'count'>('count');
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>(history.map(h => h.id));
  const [isDatasetMenuOpen, setIsDatasetMenuOpen] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isDatasetMenuOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dataset-menu-container')) {
        setIsDatasetMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDatasetMenuOpen]);

  // Sync selected IDs when history changes (e.g. new upload)
  useEffect(() => {
    setSelectedDatasetIds(prev => {
      const currentIds = history.map(h => h.id);
      const newIds = currentIds.filter(id => !prev.includes(id));
      if (newIds.length > 0) {
        return [...prev, ...newIds];
      }
      return prev;
    });
  }, [history]);

  const selectedHistory = useMemo(() => 
    history.filter(h => selectedDatasetIds.includes(h.id)),
    [history, selectedDatasetIds]
  );

  const totalRows = selectedHistory.reduce((acc, curr) => acc + curr.rowCount, 0);
  
  const totalReliabilitySum = selectedHistory.reduce((acc, curr) => acc + (curr.averageReliability * curr.rowCount), 0);
  const overallAverageReliability = totalRows > 0 ? Math.round(totalReliabilitySum / totalRows) : 0;
  
  const totalMatchedRows = selectedHistory.reduce((acc, curr) => acc + (curr.rowCount * curr.matchPercentage / 100), 0);
  const overallMatchRate = totalRows > 0 ? Math.round((totalMatchedRows / totalRows) * 100) : 0;

  const trainingCount = getTrainingDataCount();

  const overallRatingDistribution = selectedHistory.reduce((acc: { [key in Rating]?: number }, curr) => {
    for (const rating in curr.ratingDistribution) {
      const key = rating as Rating;
      acc[key] = (acc[key] || 0) + (curr.ratingDistribution[key] || 0);
    }
    return acc;
  }, {});

  // Detailed aggregation for the donut chart tooltips
  const aggregateSustainabilityData = useMemo(() => {
    const result: Record<Rating, { 
      count: number; 
      volume: number;
      topSpecies: Record<string, number>;
      topCountries: Record<string, number>;
      topSuppliers: Record<string, number>;
    }> = {
      [Rating.BestChoice]: { count: 0, volume: 0, topSpecies: {}, topCountries: {}, topSuppliers: {} },
      [Rating.GoodAlternative]: { count: 0, volume: 0, topSpecies: {}, topCountries: {}, topSuppliers: {} },
      [Rating.Avoid]: { count: 0, volume: 0, topSpecies: {}, topCountries: {}, topSuppliers: {} },
      [Rating.Certified]: { count: 0, volume: 0, topSpecies: {}, topCountries: {}, topSuppliers: {} },
      [Rating.NA]: { count: 0, volume: 0, topSpecies: {}, topCountries: {}, topSuppliers: {} },
    };

    selectedHistory.forEach(summary => {
      if (!summary.fullResults) return;

      const speciesCol = summary.columnMapping?.['Common name'];
      const countryCol = summary.columnMapping?.['Source country'];
      const supplierCol = summary.columnMapping?.['Supplier'];
      const volumeCol = summary.columnMapping?.['Volume'];

      summary.fullResults.forEach(item => {
        const rating = item.rating;
        const vol = volumeCol ? parseFloat(String(item[volumeCol] || 0)) : 0;
        const volume = isNaN(vol) ? 0 : vol;

        result[rating].count += 1;
        result[rating].volume += volume;

        let species = speciesCol ? String(item[speciesCol] || 'Unknown') : 'Unknown';
        let country = countryCol ? String(item[countryCol] || 'Unknown') : 'Unknown';
        const supplier = supplierCol ? String(item[supplierCol] || 'Unknown') : 'Unknown';

        if (species !== 'Unknown') species = normalizeSpecies(species);
        if (country !== 'Unknown') country = normalizeCountry(country);

        // Use volume for ranking if available, otherwise count
        const increment = volume > 0 ? volume : 1;

        result[rating].topSpecies[species] = (result[rating].topSpecies[species] || 0) + increment;
        result[rating].topCountries[country] = (result[rating].topCountries[country] || 0) + increment;
        result[rating].topSuppliers[supplier] = (result[rating].topSuppliers[supplier] || 0) + increment;
      });
    });

    return result;
  }, [selectedHistory]);

  const allIssues = history.flatMap(h => h.commonIssues);
  const issueCounts = allIssues.reduce((acc, issueItem) => {
    if (issueItem.issue.toLowerCase().includes('analyzing') || issueItem.issue.toLowerCase().includes('error')) {
      return acc;
    }
    acc[issueItem.issue] = (acc[issueItem.issue] || 0) + issueItem.count;
    return acc;
  }, {} as Record<string, number>);
  
  const topIssues = Object.entries(issueCounts)
    .sort(([, countA], [, countB]) => (countB as number) - (countA as number))
    .slice(0, 5);

  const renderDistributionBar = (item: UploadSummary) => {
    const isVolumeRequested = metricType === 'volume';
    const volumeKey = item.columnMapping?.['Volume'];
    const hasVolumeData = !!(volumeKey && volumeKey !== 'N/A' && item.fullResults);
    
    // Fallback to count if volume is requested but not available
    const effectiveMetric = (isVolumeRequested && !hasVolumeData) ? 'count' : metricType;

    const data = useMemo(() => {
        const distribution: Record<Rating, number> = {
            [Rating.BestChoice]: 0,
            [Rating.GoodAlternative]: 0,
            [Rating.Avoid]: 0,
            [Rating.Certified]: 0,
            [Rating.NA]: 0,
        };

        if (effectiveMetric === 'count') {
            ratingOrder.forEach(r => {
                distribution[r] = item.ratingDistribution[r] || 0;
            });
        } else if (hasVolumeData && item.fullResults) {
            item.fullResults.forEach((res: SeafoodResultItem) => {
                const val = parseFloat(String(res[volumeKey!] || 0));
                distribution[res.rating] += isNaN(val) ? 0 : val;
            });
        }

        const total = Object.values(distribution).reduce((a, b) => a + b, 0);
        return { distribution, total };
    }, [item, effectiveMetric, hasVolumeData, volumeKey]);

    if (data.total === 0) return <p className="text-xs text-gray-400 italic">No data to display for this metric.</p>;

    return (
        <div className="space-y-3">
            <div className="flex justify-between items-end mb-1">
                <h4 className="font-semibold text-gray-700 text-xs uppercase tracking-wide">
                    Rating Distribution by {effectiveMetric === 'volume' ? 'Volume' : 'Product Count'}
                </h4>
                {isVolumeRequested && !hasVolumeData && (
                    <span className="text-[10px] text-orange-600 font-medium">Volume data not found, showing counts</span>
                )}
            </div>
            
            <div className="h-8 w-full bg-gray-100 rounded-lg overflow-hidden flex border border-gray-200 shadow-inner">
                {ratingOrder.map(rating => {
                    const value = data.distribution[rating];
                    if (value === 0) return null;
                    const percentage = (value / data.total) * 100;
                    
                    return (
                        <div 
                            key={rating}
                            className="h-full relative flex items-center justify-center transition-all duration-300 group"
                            style={{ 
                                width: `${percentage}%`, 
                                backgroundColor: ratingColors[rating],
                                minWidth: percentage > 0.5 ? '4px' : '0px'
                            }}
                            title={`${ratingLabels[rating]}: ${percentage.toFixed(1)}%`}
                        >
                            {percentage > 6 && (
                                <span className="text-[10px] font-bold text-white drop-shadow-sm pointer-events-none">
                                    {Math.round(percentage)}%
                                </span>
                            )}
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                <div className="bg-gray-800 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                    {ratingLabels[rating]}: {value.toLocaleString()} ({percentage.toFixed(1)}%)
                                </div>
                                <div className="w-2 h-2 bg-gray-800 rotate-45 mx-auto -mt-1"></div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend for the bar */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
                {ratingOrder.map(rating => {
                    const value = data.distribution[rating];
                    if (value === 0) return null;
                    return (
                        <div key={rating} className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ratingColors[rating] }}></span>
                            <span className="text-[10px] text-gray-500 font-medium">{ratingLabels[rating]}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
  };
    
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800">
            {userRole === 'admin' ? 'Administrative Dashboard' : 'Partner Dashboard'}
          </h2>
          <button
            onClick={onAnalyzeNew}
            className="w-full sm:w-auto px-6 py-3 text-lg font-semibold text-white bg-[#00629B] rounded-md hover:bg-[#00497b] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00629B] transition-colors duration-200"
          >
            Upload New Dataset
          </button>
      </div>

      {history.length > 0 ? (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <StatCard title="Overall Match Rate" value={`${overallMatchRate}%`} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
                <StatCard title="Avg. Reliability" value={`${overallAverageReliability}%`} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
                <StatCard title="Total Items" value={totalRows.toLocaleString()} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>} />
                <StatCard title="Datasets" value={history.length.toString()} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>} />
                <StatCard title="AI Training Data" value={trainingCount.toString()} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-lg border border-gray-200">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                        <h2 className="text-xl font-bold text-gray-800">Sourcing History</h2>
                        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200">
                            <button 
                                onClick={() => setMetricType('count')}
                                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all focus:outline-none ${metricType === 'count' ? 'bg-white text-[#00629B] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Product Count
                            </button>
                            <button 
                                onClick={() => setMetricType('volume')}
                                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all focus:outline-none ${metricType === 'volume' ? 'bg-white text-[#00629B] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Volume
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-2 py-3 w-12"><span className="sr-only">Expand</span></th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File Name</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {history.map(item => (
                                    <React.Fragment key={item.id}>
                                    <tr className="hover:bg-gray-50">
                                        <td className="px-2 py-4 whitespace-nowrap">
                                          <button 
                                            onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                                            className="p-1 rounded-full hover:bg-gray-200"
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${expandedRow === item.id ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                            </svg>
                                          </button>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.fileName}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(item.uploadDate).toLocaleDateString()}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-right">
                                          <button 
                                            onClick={() => onViewResults(item)}
                                            className="text-blue-600 hover:text-blue-900 font-bold text-xs uppercase tracking-wider"
                                          >
                                            View Report
                                          </button>
                                        </td>
                                    </tr>
                                    {expandedRow === item.id && (
                                      <tr>
                                        <td colSpan={6} className="p-4 bg-gray-50 border-t">
                                          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                            <div className="md:col-span-4">
                                              <h4 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Metrics Summary</h4>
                                              <div className="grid grid-cols-2 gap-3 text-xs">
                                                <div className="bg-white p-3 rounded border shadow-sm">
                                                  <span className="text-gray-400 block mb-1">Match Rate:</span>
                                                  <span className="block font-bold text-lg">{item.matchPercentage.toFixed(0)}%</span>
                                                </div>
                                                <div className="bg-white p-3 rounded border shadow-sm">
                                                  <span className="text-gray-400 block mb-1">Reliability:</span>
                                                  <span className="block font-bold text-lg">{item.averageReliability.toFixed(0)}%</span>
                                                </div>
                                              </div>
                                            </div>
                                            <div className="md:col-span-8">
                                              {renderDistributionBar(item)}
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-8">
                  <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Collective Sustainability</h2>
                        {userRole === 'admin' && (
                          <div className="relative dataset-menu-container">
                            <button 
                              onClick={() => setIsDatasetMenuOpen(!isDatasetMenuOpen)}
                              className={`p-1 rounded transition-colors ${isDatasetMenuOpen ? 'bg-gray-100 text-gray-800' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                              title="Select datasets to include"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                            {isDatasetMenuOpen && (
                              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-20 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex justify-between items-center mb-3">
                                  <h3 className="text-xs font-bold text-gray-500 uppercase">Include Datasets</h3>
                                  <button 
                                    onClick={() => setIsDatasetMenuOpen(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                                  {history.map(h => (
                                    <label key={h.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded transition-colors">
                                      <input 
                                        type="checkbox" 
                                        checked={selectedDatasetIds.includes(h.id)}
                                        onChange={() => {
                                          setSelectedDatasetIds(prev => 
                                            prev.includes(h.id) ? prev.filter(id => id !== h.id) : [...prev, h.id]
                                          );
                                        }}
                                        className="rounded text-[#00629B] focus:ring-[#00629B] h-3.5 w-3.5"
                                      />
                                      <span className="text-xs text-gray-700 truncate font-medium">{h.fileName}</span>
                                    </label>
                                  ))}
                                </div>
                                {history.length > 1 && (
                                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                                    <button 
                                      onClick={() => setSelectedDatasetIds(history.map(h => h.id))}
                                      className="text-[10px] font-bold text-[#00629B] hover:underline"
                                    >
                                      Select All
                                    </button>
                                    <button 
                                      onClick={() => setSelectedDatasetIds([])}
                                      className="text-[10px] font-bold text-gray-400 hover:text-gray-600 hover:underline"
                                    >
                                      Clear All
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {totalRows > 0 ? (
                        <DonutChart 
                          data={overallRatingDistribution} 
                          total={totalRows} 
                          detailedData={aggregateSustainabilityData}
                        />
                      ) : <p className="text-sm text-gray-500">No data to display.</p> }
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
                      <h2 className="text-xl font-bold text-gray-800 mb-4">Global Data Gaps</h2>
                      {topIssues.length > 0 ? (
                          <ul className="space-y-3">
                              {topIssues.map(([issue, count]) => (
                                  <li key={issue} className="text-sm text-gray-700">
                                      <p className="font-semibold leading-tight">{issue}</p>
                                      <p className="text-gray-500 text-xs mt-1">Found in {count} records</p>
                                  </li>
                              ))}
                          </ul>
                      ) : (
                          <p className="text-sm text-gray-500">No recurring data gaps identified.</p>
                      )}
                  </div>
                </div>
            </div>
        </>
      ) : (
         <div className="text-center bg-white p-12 rounded-lg shadow-lg border border-gray-200 flex flex-col items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 text-lg mb-6">No sourcing history found. Start by uploading a dataset.</p>
            <button
              onClick={onAnalyzeNew}
              className="px-8 py-4 text-lg font-semibold text-white bg-[#00629B] rounded-md hover:bg-[#00497b]"
            >
              Upload First Dataset
            </button>
         </div>
      )}
    </div>
  );
};

export default Dashboard;
