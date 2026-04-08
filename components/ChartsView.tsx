
import React, { useMemo, useState } from 'react';
import { SeafoodResultItem, Rating } from '../types';
import { normalizeSpecies, normalizeCountry } from '../utils/normalization';
import DonutChartByVolume from './DonutChartByVolume';
import StackedBarChart, { BarChartDataItem } from './StackedBarChart';

interface ChartsViewProps {
  results: SeafoodResultItem[];
  columnMapping: Record<string, string>;
  onSegmentClick: (title: string, data: SeafoodResultItem[]) => void;
}

type GroupedData = Record<string, {
  totalValue: number;
  breakdown: { [key in Rating]?: number };
  sourceItems: SeafoodResultItem[];
}>;

type ChartType = 'species' | 'country';
type MetricType = 'count';

const ratingLabels: { [key in Rating]: string } = {
  [Rating.BestChoice]: 'Green',
  [Rating.GoodAlternative]: 'Yellow',
  [Rating.Avoid]: 'Red',
  [Rating.Certified]: 'Certified',
  [Rating.NA]: 'N/A',
};

const ChartsView: React.FC<ChartsViewProps> = ({ results, columnMapping, onSegmentClick }) => {
  const [activeChart, setActiveChart] = useState<ChartType>('species');
  const [activeRating, setActiveRating] = useState<Rating | null>(null);
  
  const metric: MetricType = 'count';

  const getMappedKey = (field: string) => Object.keys(columnMapping).find(key => key === field) ? columnMapping[field] : null;

  const speciesKey = getMappedKey('Common name');
  const countryKey = getMappedKey('Source country');

  const { donutData, speciesData, countryData } = useMemo(() => {
    const getValue = (item: SeafoodResultItem) => 1;

    // 1. Always compute donut chart data from FULL result set
    const donutData: { [key in Rating]?: { value: number; items: SeafoodResultItem[] } } = {};
    results.forEach(item => {
        const rating = item.rating;
        if (!donutData[rating]) {
            donutData[rating] = { value: 0, items: [] };
        }
        donutData[rating]!.value += getValue(item);
        donutData[rating]!.items.push(item);
    });

    // 2. Compute bar chart data based on potentially filtered results
    const filteredResults = activeRating 
        ? results.filter(r => r.rating === activeRating)
        : results;

    const processGroupData = (key: string | null, type: 'species' | 'country'): BarChartDataItem[] => {
      if (!key) return [];
      
      const grouped: GroupedData = {};

      filteredResults.forEach(item => {
        const rawLabel = item[key] ? String(item[key]).trim() : 'Unknown';
        const groupLabel = type === 'species' ? normalizeSpecies(rawLabel) : normalizeCountry(rawLabel);

        if (!grouped[groupLabel]) {
          grouped[groupLabel] = { totalValue: 0, breakdown: {}, sourceItems: [] };
        }
        
        const value = getValue(item);
        grouped[groupLabel].totalValue += value;
        grouped[groupLabel].breakdown[item.rating] = (grouped[groupLabel].breakdown[item.rating] || 0) + value;
        grouped[groupLabel].sourceItems.push(item);
      });

      return Object.entries(grouped)
        .map(([label, data]) => ({ label, ...data }))
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, 20);
    };

    const speciesData = processGroupData(speciesKey, 'species');
    const countryData = processGroupData(countryKey, 'country');
    
    return { donutData, speciesData, countryData };
  }, [results, speciesKey, countryKey, activeRating]);

  const handleRatingFilter = (rating: Rating) => {
    if (activeRating === rating) {
        setActiveRating(null); // Toggle off
    } else {
        setActiveRating(rating);
    }
  };

  const renderActiveChart = () => {
    const filterSuffix = activeRating ? ` (Filtered by ${ratingLabels[activeRating]})` : '';
    switch (activeChart) {
      case 'country':
        return <StackedBarChart title={`Ratings by Source Country (Top 20 by Product Count)${filterSuffix}`} data={countryData} metric={metric} chartType="country" columnMapping={columnMapping} onSegmentClick={onSegmentClick} />;
      case 'species':
      default:
        return <StackedBarChart title={`Ratings by Species Common Name (Top 20 by Product Count)${filterSuffix}`} data={speciesData} metric={metric} chartType="species" columnMapping={columnMapping} onSegmentClick={onSegmentClick} />;
    }
  };

  return (
    <div className="space-y-8 relative">
       <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
            <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-lg border border-gray-200">
                <span className="text-xs font-semibold text-gray-500 px-2 uppercase tracking-wide">Metric:</span>
                <span className="px-3 py-1.5 text-sm font-bold text-[#00629B] bg-white rounded-md shadow-sm">
                    Product Count
                </span>
            </div>
            
            {activeRating && (
                <div className="flex items-center gap-3 animate-fade-in-up">
                    <span className="text-sm text-gray-600">
                        Filtering charts by: <span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">{ratingLabels[activeRating]}</span>
                    </span>
                    <button 
                        onClick={() => setActiveRating(null)}
                        className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline"
                    >
                        Clear Filter
                    </button>
                </div>
            )}
       </div>

      <DonutChartByVolume 
        data={donutData} 
        metric={metric} 
        onSegmentClick={handleRatingFilter} 
        activeRating={activeRating}
      />
      
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500 italic">
            {activeRating ? `Showing top 20 ${ratingLabels[activeRating]} items only.` : 'Showing top 20 items across all ratings.'}
          </p>
          <div className="inline-flex bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button 
                  onClick={() => setActiveChart('species')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all focus:outline-none ${activeChart === 'species' ? 'bg-white text-[#00629B] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  By Species
              </button>
              <button 
                  onClick={() => setActiveChart('country')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all focus:outline-none ${activeChart === 'country' ? 'bg-white text-[#00629B] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  By Country
              </button>
          </div>
        </div>
        
        {renderActiveChart()}
      </div>
    </div>
  );
};

export default ChartsView;
