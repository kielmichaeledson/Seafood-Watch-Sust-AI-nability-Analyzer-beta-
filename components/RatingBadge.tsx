
import React from 'react';
import { Rating } from '../types';

interface RatingBadgeProps {
  rating: Rating;
}

const ratingStyles: { [key in Rating]: string } = {
  [Rating.BestChoice]: 'text-[#23872B]',
  [Rating.GoodAlternative]: 'text-[#BA8C17]',
  [Rating.Avoid]: 'text-[#AA323C]',
  [Rating.Certified]: 'text-[#00629B]',
  [Rating.NA]: 'text-gray-500',
};

const ratingLabels: { [key in Rating]: string } = {
  [Rating.BestChoice]: 'Green',
  [Rating.GoodAlternative]: 'Yellow',
  [Rating.Avoid]: 'Red',
  [Rating.Certified]: 'Certified',
  [Rating.NA]: 'N/A',
};

const RatingBadge: React.FC<RatingBadgeProps> = ({ rating }) => {
  const style = ratingStyles[rating] || ratingStyles[Rating.NA];
  const label = ratingLabels[rating] || rating;
  
  return (
    <span className={`text-xs font-bold ${style}`}>
      {label}
    </span>
  );
};

export default RatingBadge;
