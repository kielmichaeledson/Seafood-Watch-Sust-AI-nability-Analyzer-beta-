
import React, { useState, useEffect, useRef } from 'react';

interface ColumnTogglerProps {
  allColumns: { key: string; title: string }[];
  visibleColumns: Set<string>;
  onVisibilityChange: (newVisible: Set<string>) => void;
}

const ColumnToggler: React.FC<ColumnTogglerProps> = ({ allColumns, visibleColumns, onVisibilityChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);


  const handleToggle = (columnKey: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(columnKey)) {
      newVisible.delete(columnKey);
    } else {
      newVisible.add(columnKey);
    }
    onVisibilityChange(newVisible);
  };

  const handleToggleAll = () => {
    if (visibleColumns.size === allColumns.length) {
        // Hide all (except maybe essential ones, but spec says show/hide all)
        onVisibilityChange(new Set());
    } else {
        // Show all
        const newVisible = new Set(allColumns.map(c => c.key));
        onVisibilityChange(newVisible);
    }
  };
  
  const handleDropdownClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };
  
  const isAllSelected = visibleColumns.size === allColumns.length;


  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        Show/Hide Columns
      </button>
      {isOpen && (
        <div 
            className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-80 overflow-y-auto"
            onClick={handleDropdownClick}
            role="listbox"
            aria-label="Column visibility toggler"
        >
          <div className="p-2 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
            <p className="text-xs text-gray-500">Select columns to display.</p>
             <button 
                onClick={handleToggleAll}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
                {isAllSelected ? 'Hide All' : 'Show All'}
            </button>
          </div>
          <div className="py-1">
            {allColumns.map(column => (
              <div 
                key={column.key} 
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                role="option"
                aria-selected={visibleColumns.has(column.key)}
              >
                <label className="flex items-center cursor-pointer w-full">
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(column.key)}
                    onChange={() => handleToggle(column.key)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-3 truncate" title={column.title}>{column.title}</span>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnToggler;
