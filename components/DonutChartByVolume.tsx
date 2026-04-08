
import React, { useState } from 'react';
import { Rating, SeafoodResultItem } from '../types';

interface DonutChartByVolumeProps {
  data: { [key in Rating]?: { value: number; items: SeafoodResultItem[] } };
  metric: 'volume' | 'count';
  onSegmentClick: (rating: Rating, items: SeafoodResultItem[]) => void;
  activeRating?: Rating | null;
}

const ratingOrder: Rating[] = [Rating.BestChoice, Rating.GoodAlternative, Rating.Avoid, Rating.Certified, Rating.NA];

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

const DonutChartByVolume: React.FC<DonutChartByVolumeProps> = ({ data, metric, onSegmentClick, activeRating }) => {
  const [hoveredSegment, setHoveredSegment] = useState<Rating | null>(null);

  const totalValue = (Object.values(data) as { value: number; items: SeafoodResultItem[] }[]).reduce((acc, curr) => acc + (curr?.value || 0), 0);

  if (totalValue === 0) {
      return (
         <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
             <h2 className="text-xl font-bold text-gray-800 mb-4">Ratings by {metric === 'volume' ? 'Volume' : 'Count'}</h2>
            <p className="text-gray-500 text-center py-8">
                {metric === 'volume' 
                    ? "Not enough data to display this chart. Make sure you have mapped the 'Volume' column." 
                    : "No data available."}
            </p>
        </div>
      );
  }

  const radius = 40;
  const strokeWidth = 15;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  let accumulatedAngle = 0;

  const chartData = ratingOrder
    .map(rating => {
        const segmentData = data[rating];
        if (!segmentData || segmentData.value === 0) return null;
        
        const percentage = (segmentData.value / totalValue) * 100;
        const strokeDashoffset = circumference - (percentage / 100) * circumference;
        const rotation = accumulatedAngle;
        accumulatedAngle += (percentage / 100) * 360;

        return {
            rating,
            label: ratingLabels[rating],
            value: segmentData.value,
            items: segmentData.items,
            percentage,
            color: ratingColors[rating],
            strokeDashoffset,
            rotation
        };
    })
    .filter((segment): segment is NonNullable<typeof segment> => segment !== null);

    const handleKeyDown = (e: React.KeyboardEvent, rating: Rating, items: SeafoodResultItem[]) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSegmentClick(rating, items);
        }
    };


  return (
    <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Ratings by {metric === 'volume' ? 'Volume' : 'Product Count'}</h2>
        <div className="flex flex-col md:flex-row items-center justify-center gap-8">
            <div className="relative w-64 h-64 flex-shrink-0">
                <svg
                    height="100%"
                    width="100%"
                    viewBox="0 0 100 100"
                    className="-rotate-90"
                    role="img"
                    aria-label={`Donut chart showing ratings by ${metric}. Total is ${totalValue.toLocaleString()}.`}
                >
                    <circle
                        stroke="#e5e7eb"
                        cx="50"
                        cy="50"
                        r={normalizedRadius}
                        fill="transparent"
                        strokeWidth={strokeWidth}
                    />
                {chartData.map(segment => {
                    const isActive = activeRating === segment.rating;
                    const isHovered = hoveredSegment === segment.rating;
                    return (
                        <g 
                            key={segment.rating} 
                            className="cursor-pointer focus:outline-none" 
                            onClick={() => onSegmentClick(segment.rating, segment.items)}
                            onMouseEnter={() => setHoveredSegment(segment.rating)}
                            onMouseLeave={() => setHoveredSegment(null)}
                            onKeyDown={(e) => handleKeyDown(e, segment.rating, segment.items)}
                            role="button"
                            tabIndex={0}
                            aria-label={`${segment.label}: ${segment.value.toLocaleString()} ${metric}, ${segment.percentage.toFixed(1)}%`}
                        >
                            <circle
                                stroke={segment.color}
                                cx="50"
                                cy="50"
                                r={normalizedRadius}
                                fill="transparent"
                                strokeWidth={strokeWidth + (isHovered || isActive ? 3 : 0)}
                                strokeDasharray={`${circumference} ${circumference}`}
                                style={{ 
                                    strokeDashoffset: segment.strokeDashoffset, 
                                    transform: `rotate(${segment.rotation}deg)`, 
                                    transformOrigin: '50% 50%',
                                    opacity: (activeRating && !isActive) ? 0.3 : 1
                                }}
                                className="transition-all duration-300"
                            />
                        </g>
                    );
                })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-3xl font-bold text-gray-800">{totalValue.toLocaleString()}</span>
                    <span className="text-[11px] text-gray-500 uppercase font-semibold">Total {metric === 'volume' ? 'Volume' : 'Products'}</span>
                </div>
            </div>
            
            <div className="space-y-2">
                {chartData.map(segment => (
                <div 
                    key={segment.rating} 
                    className={`grid grid-cols-[auto_auto] gap-x-6 gap-y-1 items-center text-[11px] cursor-pointer p-2 rounded-md transition-colors border-2 ${activeRating === segment.rating ? 'border-blue-400 bg-blue-50' : 'border-transparent'}`}
                    onClick={() => onSegmentClick(segment.rating, segment.items)}
                    onMouseEnter={() => setHoveredSegment(segment.rating)}
                    onMouseLeave={() => setHoveredSegment(null)}
                    style={{ 
                        opacity: (activeRating && activeRating !== segment.rating) ? 0.5 : 1,
                        backgroundColor: (hoveredSegment === segment.rating && activeRating !== segment.rating) ? '#f3f4f6' : undefined 
                    }}
                >
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }}></span>
                        <span className={`font-medium ${activeRating === segment.rating ? 'text-blue-800' : 'text-gray-700'}`}>{segment.label}</span>
                    </div>
                    <div className="font-semibold text-gray-800 text-right">
                        {segment.value.toLocaleString()}
                        <span className="ml-2 font-normal text-gray-500">({segment.percentage.toFixed(1)}%)</span>
                    </div>
                </div>
                ))}
            </div>
        </div>
    </div>
  );
};

export default DonutChartByVolume;
