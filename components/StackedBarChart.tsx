
import React, { useState } from 'react';
import { Rating, SeafoodResultItem } from '../types';

// Updated rating colors as requested
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

export interface BarChartDataItem {
  label: string;
  totalValue: number;
  breakdown: { [key in Rating]?: number };
  sourceItems: SeafoodResultItem[];
}

interface StackedBarChartProps {
  title: string;
  data: BarChartDataItem[];
  metric: 'volume' | 'count';
  chartType: 'species' | 'country' | 'supplier';
  columnMapping: Record<string, string>;
  onSegmentClick: (title: string, data: SeafoodResultItem[]) => void;
}

const StackedBarChart: React.FC<StackedBarChartProps> = ({ title, data, metric, chartType, columnMapping, onSegmentClick }) => {
  const [tooltip, setTooltip] = useState<{ content: React.ReactNode; x: number; y: number } | null>(null);

  const rowHeight = 25;
  const chartHeight = data.length * rowHeight;
  const chartWidth = 600;
  const yAxisWidth = 150;
  const plotWidth = chartWidth - yAxisWidth;
  const maxValue = Math.max(...data.map(d => d.totalValue));
  
  const handleMouseOver = (e: React.MouseEvent, content: React.ReactNode) => {
    const chartRect = (e.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
    if (chartRect) {
      setTooltip({ content, x: e.clientX - chartRect.left, y: e.clientY - chartRect.top });
    }
  };

  const getKDEInfo = (item: SeafoodResultItem) => {
    if (item.uniqueId !== 'N/A') {
      // Use matched KDEs from DB
      const kdeParts = item.matchedKDEs.split(' | ');
      const speciesPart = kdeParts[0] || 'N/A';
      // Strip rating like (Wild) from species name if present for cleaner tooltip
      const species = speciesPart.replace(/\s*\([^)]+\)/, '');
      const country = kdeParts[1] || 'N/A';
      const method = kdeParts[2] || 'N/A';
      
      if (chartType === 'species') return { country, method };
      if (chartType === 'country') return { species, method };
      return { species, country, method };
    } else {
      // Use original product dataset for non-matches
      const speciesHeader = columnMapping['Common name'];
      const countryHeader = columnMapping['Source country'];
      const methodHeader = columnMapping['Production Method'];
      
      const species = (speciesHeader && speciesHeader !== 'N/A') ? String(item[speciesHeader] || 'N/A') : 'N/A';
      const country = (countryHeader && countryHeader !== 'N/A') ? String(item[countryHeader] || 'N/A') : 'N/A';
      const method = (methodHeader && methodHeader !== 'N/A') ? String(item[methodHeader] || 'N/A') : 'N/A';

      if (chartType === 'species') return { country, method };
      if (chartType === 'country') return { species, method };
      return { species, country, method };
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, title: string, items: SeafoodResultItem[]) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSegmentClick(title, items);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 w-full">
      <h2 className="text-xl font-bold text-gray-800 mb-4">{title}</h2>
      {data.length === 0 ? (
        <p className="text-gray-500 text-center py-8">Not enough data to display this chart.</p>
      ) : (
        <div className="relative">
          <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight + 30}`} role="img" aria-label={title}>
            {data.map((item, index) => {
              let currentX = yAxisWidth;
              const y = index * rowHeight;
              return (
                <g key={item.label} className="group">
                  <text x={yAxisWidth - 10} y={y + (rowHeight / 2) + 4} textAnchor="end" alignmentBaseline="middle" className="text-[9px] fill-current text-gray-600 truncate">
                     {item.label.length > 25 ? `${item.label.substring(0, 23)}...` : item.label}
                  </text>
                  {ratingOrder.map(rating => {
                    const value = item.breakdown[rating] || 0;
                    if (value === 0) return null;
                    const width = (value / maxValue) * plotWidth;
                    const percentage = (value / item.totalValue) * 100;
                    
                    const segmentItems = item.sourceItems.filter(source => source.rating === rating);
                    const label = ratingLabels[rating];
                    const segmentTitle = `${item.label} (${label})`;
                    
                    const uniqueKDEs = Array.from(new Set<string>(segmentItems.map(si => {
                        const info = getKDEInfo(si);
                        return JSON.stringify(info);
                    }))).map((s: string) => JSON.parse(s)).slice(0, 3);

                    const tooltipContent = (
                      <div className="flex flex-col gap-2 min-w-[180px]">
                        <div className="border-b border-gray-100 pb-2 mb-1">
                          <div 
                            className="text-[10px] font-bold uppercase tracking-wider leading-none mb-1"
                            style={{ color: ratingColors[rating] }}
                          >
                            {label}
                          </div>
                          <div className="text-xs font-bold text-gray-800">
                            {value.toLocaleString()} {metric === 'volume' ? 'Units' : 'Products'} ({percentage.toFixed(1)}%)
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          {uniqueKDEs.map((kde, idx) => (
                            <div key={idx} className="text-[10px] leading-snug">
                              {chartType === 'species' && (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-gray-700">{kde.country}</span>
                                  <span className="text-gray-500">{kde.method}</span>
                                </div>
                              )}
                              {chartType === 'country' && (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-gray-700">{kde.species}</span>
                                  <span className="text-gray-500">{kde.method}</span>
                                </div>
                              )}
                              {chartType === 'supplier' && (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-gray-700">{kde.species}</span>
                                  <span className="text-gray-500">{kde.country} • {kde.method}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        
                        {segmentItems.length > 3 && (
                          <div className="text-[9px] text-gray-400 italic pt-1 border-t border-gray-50">
                            + {segmentItems.length - 3} additional sourcing variants
                          </div>
                        )}
                      </div>
                    );

                    const rectEl = (
                        <rect
                            key={`${rating}-rect`}
                            x={currentX}
                            y={y + 5}
                            width={width}
                            height={15}
                            fill={ratingColors[rating]}
                            className="cursor-pointer transition-opacity duration-200 group-hover:opacity-100 opacity-90 hover:!opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            onClick={() => onSegmentClick(segmentTitle, segmentItems)}
                            onMouseMove={(e) => handleMouseOver(e, tooltipContent)}
                            onMouseOut={() => setTooltip(null)}
                            onKeyDown={(e) => handleKeyDown(e, segmentTitle, segmentItems)}
                            role="button"
                            tabIndex={0}
                            aria-label={`${segmentTitle}: ${value.toLocaleString()} (${percentage.toFixed(1)}%)`}
                        />
                    );
                    
                    const textEl = width > 25 ? (
                        <text
                            key={`${rating}-text`}
                            x={currentX + width / 2}
                            y={y + 5 + 15 / 2}
                            textAnchor="middle"
                            alignmentBaseline="middle"
                            fill="white"
                            className="text-[9px] font-bold pointer-events-none"
                            style={{ textShadow: '0px 0px 2px rgba(0,0,0,0.5)' }}
                        >
                            {Math.round(percentage)}%
                        </text>
                    ) : null;

                    const group = (
                        <g key={rating}>
                            {rectEl}
                            {textEl}
                        </g>
                    );

                    currentX += width;
                    return group;
                  })}
                </g>
              );
            })}
            <line x1={yAxisWidth} x2={chartWidth} y1={chartHeight} y2={chartHeight} stroke="#d1d5db" />
            <text x={yAxisWidth} y={chartHeight + 20} textAnchor="start" className="text-[11px] fill-current text-gray-500">0</text>
            <text x={chartWidth} y={chartHeight + 20} textAnchor="end" className="text-[11px] fill-current text-gray-500">{maxValue.toLocaleString()}</text>
             <text x={yAxisWidth + plotWidth / 2} y={chartHeight + 20} textAnchor="middle" className="text-[11px] font-semibold fill-current text-gray-600">
               Total {metric === 'volume' ? 'Volume' : 'Products'}
             </text>
          </svg>
          {tooltip && (
            <div
              className="absolute bg-white text-gray-800 p-3 rounded-lg shadow-xl z-50 pointer-events-none border border-gray-100 max-w-xs transition-transform duration-75"
              style={{ 
                left: tooltip.x + 15, 
                top: tooltip.y + 15, 
                transform: 'translateZ(0)',
                filter: 'drop-shadow(0 4px 6px -1px rgb(0 0 0 / 0.1))'
              }}
            >
              {tooltip.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StackedBarChart;
