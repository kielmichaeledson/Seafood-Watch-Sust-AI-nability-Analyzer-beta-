
import React, { useState, useMemo } from 'react';
import { Rating } from '../types';

interface DonutChartProps {
  data: { [key in Rating]?: number };
  total: number;
  detailedData?: Record<Rating, { 
    count: number; 
    volume: number;
    topSpecies: Record<string, number>;
    topCountries: Record<string, number>;
    topSuppliers: Record<string, number>;
  }>;
}

const ratingOrder: Rating[] = [Rating.BestChoice, Rating.GoodAlternative, Rating.Avoid, Rating.Certified, Rating.NA, Rating.Unknown];

const ratingColors: { [key in Rating]: string } = {
  [Rating.BestChoice]: '#23872B',
  [Rating.GoodAlternative]: '#BA8C17',
  [Rating.Avoid]: '#AA323C',
  [Rating.Certified]: '#00629B',
  [Rating.NA]: '#9ca3af',
  [Rating.Unknown]: '#d1d5db',
};

const ratingLabels: { [key in Rating]: string } = {
  [Rating.BestChoice]: 'Green',
  [Rating.GoodAlternative]: 'Yellow',
  [Rating.Avoid]: 'Red',
  [Rating.Certified]: 'Certified',
  [Rating.NA]: 'N/A',
  [Rating.Unknown]: 'Unknown',
};


const DonutChart: React.FC<DonutChartProps> = ({ data, total, detailedData }) => {
  const [hoveredSegment, setHoveredSegment] = useState<Rating | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const radius = 40;
  const strokeWidth = 15;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  let accumulatedAngle = 0;

  const chartData = ratingOrder
    .map(rating => {
        const count = data[rating] || 0;
        if (count === 0) return null;
        
        const percentage = (count / total) * 100;
        const strokeDashoffset = circumference - (percentage / 100) * circumference;
        const rotation = accumulatedAngle;
        accumulatedAngle += (percentage / 100) * 360;

        return {
            rating,
            label: ratingLabels[rating],
            count,
            percentage,
            color: ratingColors[rating],
            strokeDashoffset,
            rotation
        };
    })
    .filter((segment): segment is NonNullable<typeof segment> => segment !== null);

  const renderMiniBarChart = (title: string, data: Record<string, number>, barColor: string, segmentTotal: number, overallTotal: number) => {
    const top5 = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    
    if (top5.length === 0) return null;
    
    const maxVal = top5[0][1];

    return (
      <div className="mb-5 last:mb-0">
        <h4 className="text-[12px] font-bold text-gray-400 uppercase mb-2 tracking-wider">{title}</h4>
        <div className="space-y-2.5">
          {top5.map(([label, value]) => (
            <div key={label} className="space-y-1.5">
              <div className="flex justify-between text-[12px] text-gray-600">
                <span className="truncate max-w-[160px] font-semibold text-gray-700">{label}</span>
                <span className="font-mono font-bold text-[#00629B]">
                  {segmentTotal > 0 ? ((value / segmentTotal) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-700 ease-out" 
                  style={{ width: `${(value / maxVal) * 100}%`, backgroundColor: barColor }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const overallTotalVolume = useMemo(() => {
    if (!detailedData) return 0;
    return Object.values(detailedData).reduce((acc, curr) => acc + (curr as any).volume, 0);
  }, [detailedData]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.closest('.donut-container')?.getBoundingClientRect();
    if (rect) {
        // Position tooltip to the top-left of the cursor as requested
        // Offset it further left to avoid blocking the chart segments
        setTooltipPos({ 
            x: e.clientX - rect.left - 340, 
            y: e.clientY - rect.top - 350 
        });
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-center gap-6 relative donut-container">
      <div className="relative w-64 h-64 flex-shrink-0">
        <svg
          height="100%"
          width="100%"
          viewBox="0 0 100 100"
          className="-rotate-90" // Global rotation to start at 12 o'clock
        >
            <circle
                stroke="#e5e7eb" // gray-200
                cx="50"
                cy="50"
                r={normalizedRadius}
                fill="transparent"
                strokeWidth={strokeWidth}
            />
          {chartData.map(segment => (
            <circle
              key={segment.rating}
              stroke={segment.color}
              cx="50"
              cy="50"
              r={normalizedRadius}
              fill="transparent"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              style={{ 
                strokeDashoffset: segment.strokeDashoffset, 
                transform: `rotate(${segment.rotation}deg)`, 
                transformOrigin: '50% 50%',
                cursor: 'pointer'
              }}
              className={`transition-all duration-300 ${hoveredSegment === segment.rating ? 'opacity-80 stroke-[18px]' : ''}`}
              onMouseEnter={(e) => {
                setHoveredSegment(segment.rating);
                handleMouseMove(e);
              }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-3xl font-bold text-gray-800">{total.toLocaleString()}</span>
            <span className="text-[11px] text-gray-500 uppercase font-semibold">Total Items</span>
        </div>
      </div>

      {/* Popout Tooltip - Now using absolute positioning relative to container */}
      {hoveredSegment && detailedData && detailedData[hoveredSegment] && (
        <div 
          className="absolute z-50 bg-white text-gray-800 p-6 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25)] border border-gray-100 w-80 pointer-events-none transition-all duration-75 ease-out"
          style={{ 
            left: `${tooltipPos.x}px`, 
            top: `${tooltipPos.y}px` 
          }}
        >
          <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
            <span className="w-5 h-5 rounded-full shadow-sm" style={{ backgroundColor: ratingColors[hoveredSegment] }}></span>
            <h3 className="font-bold text-lg text-gray-900">{ratingLabels[hoveredSegment]}</h3>
            <span className="ml-auto text-sm font-bold text-[#00629B] bg-blue-50 px-2 py-1 rounded">
                {((data[hoveredSegment] || 0) / total * 100).toFixed(1)}%
            </span>
          </div>
          
          <div className="space-y-6">
            {renderMiniBarChart("Top 5 Species", detailedData[hoveredSegment].topSpecies, ratingColors[hoveredSegment], detailedData[hoveredSegment].volume, overallTotalVolume)}
            {renderMiniBarChart("Top 5 Countries", detailedData[hoveredSegment].topCountries, ratingColors[hoveredSegment], detailedData[hoveredSegment].volume, overallTotalVolume)}
            {renderMiniBarChart("Top 5 Suppliers", detailedData[hoveredSegment].topSuppliers, ratingColors[hoveredSegment], detailedData[hoveredSegment].volume, overallTotalVolume)}
          </div>
        </div>
      )}

      <div className="w-full space-y-2">
        {chartData.map(segment => (
          <div 
            key={segment.rating} 
            className={`flex items-center justify-between text-[11px] p-1 rounded transition-colors ${hoveredSegment === segment.rating ? 'bg-gray-50' : ''}`}
            onMouseEnter={() => setHoveredSegment(segment.rating)}
            onMouseLeave={() => setHoveredSegment(null)}
          >
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }}></span>
                <span className="font-medium text-gray-700">{segment.label}</span>
            </div>
            <div className="font-semibold text-gray-800">
                {segment.count.toLocaleString()}
                <span className="ml-2 font-normal text-gray-500">({segment.percentage.toFixed(1)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DonutChart;
