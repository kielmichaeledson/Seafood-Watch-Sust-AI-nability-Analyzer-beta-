
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { SeafoodResultItem } from '../types';
import RatingBadge from './RatingBadge';
import ColumnToggler from './ColumnToggler';
import { History, User, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface ResultsTableProps {
  results: any[];
  originalHeaders: string[];
  columnMapping?: Record<string, string>;
  onExport: () => void;
  filterTitle?: string;
  onClearFilter?: () => void;
  visibleColumns: Set<string>;
  onVisibleColumnsChange: (newVisible: Set<string>) => void;
  onUpdateResult?: (rowId: string, newUniqueId: string) => Promise<void>;
  onSaveAssignment?: (rowId: string, newUniqueId: string) => Promise<void>;
}

type SortDirection = 'ascending' | 'descending';

const SortIcon: React.FC<{ direction: SortDirection | null }> = ({ direction }) => {
    if (!direction) return null;
    return (
      <svg
        className="w-4 h-4 ml-1 inline-block text-gray-500 flex-shrink-0"
        aria-hidden="true"
        fill="currentColor"
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
      >
        {direction === 'descending' ? (
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        )}
      </svg>
    );
};


const ResultsTable: React.FC<ResultsTableProps> = ({ 
  results, 
  originalHeaders,
  columnMapping = {},
  onExport, 
  filterTitle, 
  onClearFilter,
  visibleColumns, 
  onVisibleColumnsChange,
  onUpdateResult,
  onSaveAssignment
}) => {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const isResizing = useRef<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Expanded Row State (Accordion)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  // Temporary state for the input field inside the expanded view
  const [editValue, setEditValue] = useState<string>('');


  // Refs for synced scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);

  const sortedResults = useMemo(() => {
    // Add original index to items to track them after sorting
    const itemsWithIndex = results.map((item, index) => ({ ...item, _originalIndex: index }));

    if (!sortConfig) {
      return itemsWithIndex;
    }
    const sortableItems = [...itemsWithIndex];
    sortableItems.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
  
        if (aVal == null) return 1;
        if (bVal == null) return -1;
  
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortConfig.direction === 'ascending' ? aVal - bVal : bVal - aVal;
        }
        
        const aStr = String(aVal);
        const bStr = String(bVal);
        const comparison = aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
        
        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });

    return sortableItems;
  }, [results, sortConfig]);

  const filteredAndSortedResults = useMemo(() => {
    if (!searchTerm) {
      return sortedResults;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return sortedResults.filter(item => {
       const { _originalIndex, isUpdating, ...searchableItem } = item;
      return Object.values(searchableItem).some(value =>
        String(value).toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [sortedResults, searchTerm]);

  // Reset to page 1 when search term or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortConfig]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredAndSortedResults.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredAndSortedResults, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedResults.length / rowsPerPage);

  // Sync scrollbars
  useEffect(() => {
    const syncScroll = (source: 'top' | 'bottom') => {
      const top = topScrollRef.current;
      const bottom = tableContainerRef.current;
      if (!top || !bottom) return;

      if (source === 'top') {
        bottom.scrollLeft = top.scrollLeft;
      } else {
        top.scrollLeft = bottom.scrollLeft;
      }
    };

    const top = topScrollRef.current;
    const bottom = tableContainerRef.current;

    if (top && bottom) {
      const handleTopScroll = () => syncScroll('top');
      const handleBottomScroll = () => syncScroll('bottom');

      top.addEventListener('scroll', handleTopScroll);
      bottom.addEventListener('scroll', handleBottomScroll);

      return () => {
        top.removeEventListener('scroll', handleTopScroll);
        bottom.removeEventListener('scroll', handleBottomScroll);
      };
    }
  }, []);

  // Update scroll width when data or columns change
  useEffect(() => {
    if (tableContainerRef.current) {
      setScrollWidth(tableContainerRef.current.scrollWidth);
    }
  }, [visibleColumns, filteredAndSortedResults, columnWidths]);


  const requestSort = (key: string) => {
    let direction: SortDirection = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const toggleRow = (e: React.MouseEvent, rowId: string, currentId: string) => {
      e.stopPropagation();
      if (expandedRowId === rowId) {
          setExpandedRowId(null);
          setEditValue('');
      } else {
          setExpandedRowId(rowId);
          // Don't pre-fill with "N/A" to save user from deleting it
          setEditValue(currentId === 'N/A' ? '' : currentId);
      }
  };

  const handleSubmitEdit = async (rowId: string) => {
      if (onUpdateResult && editValue) {
          await onUpdateResult(rowId, editValue);
          // Don't close row automatically, user might want to see update.
      }
  };

  const handleSaveAssignment = async (rowId: string) => {
      if (onSaveAssignment && editValue) {
          await onSaveAssignment(rowId, editValue);
          setExpandedRowId(null); // Close the row after saving
      }
  };


  if (!results.length) {
    return <p className="text-center text-gray-500 my-8">
        {filterTitle ? `No data matches the filter "${filterTitle}".` : 'No data to display.'}
    </p>;
  }
  
  const addedHeaders = [
    { key: 'rating', title: 'Rating' },
    { key: 'uniqueId', title: 'Unique ID' },
    { key: 'reliabilityScore', title: 'Reliability' },
  ];
  
  // Define which columns are sticky and strictly enforce widths for them
  // Order: Rating -> Unique ID -> Reliability
  const STICKY_COLUMNS = ['rating', 'uniqueId', 'reliabilityScore'];
  
  // Default widths map
  const DEFAULT_WIDTHS: Record<string, number> = {
      'uniqueId': 120,
      'rating': 90,
      'reliabilityScore': 90,
  };

  const allColumns = [
    ...originalHeaders.map(h => ({ key: h, title: h })),
    ...addedHeaders.map(h => ({ key: h.key, title: h.title }))
  ];

  const visibleOriginalHeaders = originalHeaders.filter(h => visibleColumns.has(h));
  const visibleAddedHeaders = addedHeaders.filter(h => visibleColumns.has(h.key));
  const totalColSpan = visibleOriginalHeaders.length + visibleAddedHeaders.length;

  const getColumnWidth = (key: string) => columnWidths[key] || DEFAULT_WIDTHS[key] || 100;

  // Calculate sticky offsets for the added headers (they will be stuck to the right)
  const stickyOffsets = useMemo(() => {
      const offsets: Record<string, number> = {};
      let currentRight = 0;
      
      // Iterate strictly through the known sticky columns in reverse order (Right to Left visual order)
      // STICKY_COLUMNS is ['rating', 'uniqueId', 'reliabilityScore']
      // Reversed: ['reliabilityScore', 'uniqueId', 'rating']
      const reversedSticky = [...STICKY_COLUMNS].reverse();
      
      reversedSticky.forEach(key => {
          // Only calculate if the column is actually visible
          if (visibleColumns.has(key)) {
              offsets[key] = currentRight;
              const width = getColumnWidth(key);
              currentRight += width;
          }
      });
      
      return offsets;
  }, [visibleColumns, columnWidths]);


  useEffect(() => {
    setColumnWidths(prevWidths => {
        const newWidths = { ...prevWidths };
        visibleOriginalHeaders.forEach(h => {
            if (!newWidths[h]) newWidths[h] = 150;
        });
        visibleAddedHeaders.forEach(h => {
            if (!newWidths[h.key]) {
                newWidths[h.key] = DEFAULT_WIDTHS[h.key] || 100;
            }
        });
        return newWidths;
    });
  }, [visibleOriginalHeaders, visibleAddedHeaders]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, headerKey: string) => {
    isResizing.current = headerKey;
    const startX = e.clientX;
    const startWidth = columnWidths[headerKey] || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isResizing.current !== headerKey) return;
      const width = startWidth + (moveEvent.clientX - startX);
      if (width > 50) { // Min width
        setColumnWidths(prev => ({ ...prev, [headerKey]: width }));
      }
    };

    const handleMouseUp = () => {
      isResizing.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnWidths]);

  const renderUniqueId = (item: any, originalIndex: number) => {
    if (item.isUpdating) {
        return (
           <div className="flex items-center space-x-2">
               <div className="w-3 h-3 border-2 border-[#62B6F3] border-dashed rounded-full animate-spin"></div>
               <span className="text-xs text-gray-500">Updating...</span>
           </div>
        );
    }
    
    const isExpanded = expandedRowId === item.rowId;

    return (
      <div className="flex items-center space-x-1">
        <button 
            onClick={(e) => toggleRow(e, item.rowId, item.uniqueId)}
            className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors flex-grow text-left font-mono text-xs border ${isExpanded ? 'bg-blue-600 text-white border-blue-600' : 'text-blue-700 hover:bg-blue-100 border-transparent hover:border-blue-200'}`}
            title="Click to view details & edit"
            aria-expanded={isExpanded}
        >
            <span>{item.uniqueId}</span>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </button>
        {item.isManual && (
            <div 
                className="flex-shrink-0 text-amber-600" 
                title="Manually remapped by user"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
            </div>
        )}
      </div>
    );
  };

  const addedColumnRenderers: Record<string, (item: any, originalIndex: number) => React.ReactNode> = {
    uniqueId: (item, originalIndex) => renderUniqueId(item, originalIndex),
    rating: (item) => <RatingBadge rating={item.rating} />,
    reliabilityScore: (item) => (
        <div className="flex items-center" aria-label={`Reliability: ${item.reliabilityScore}%`}>
            <div role="progressbar" aria-valuenow={item.reliabilityScore} aria-valuemin={0} aria-valuemax={100} className="w-16 bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${item.reliabilityScore}%` }}></div>
            </div>
            <span className="ml-2 font-medium text-xs">{item.reliabilityScore}%</span>
        </div>
    ),
  };

  const getInputDetail = (item: any, fieldKey: string) => {
      const header = columnMapping[fieldKey];
      if (!header || header === 'N/A') return <span className="text-gray-400 italic">Not mapped</span>;
      const val = item[header];
      return val ? <span className="font-medium text-gray-900">{String(val)}</span> : <span className="text-gray-400 italic">Empty</span>;
  };

  const hasInputData = (item: any, fieldKey: string) => {
      const header = columnMapping[fieldKey];
      if (!header || header === 'N/A') return false;
      const val = item[header];
      return val !== undefined && val !== null && String(val).trim() !== '';
  };
  
  const isSticky = (key: string) => STICKY_COLUMNS.includes(key);

  const getStickyStyle = (key: string, isHeader: boolean, isExpandedRow: boolean = false) => {
      if (!isSticky(key)) return {};
      
      const isFirstSticky = key === 'rating'; 
      const width = getColumnWidth(key);
      const right = stickyOffsets[key] ?? 0;

      const style: React.CSSProperties = {
          position: 'sticky',
          right: `${right}px`,
          width: `${width}px`,
          minWidth: `${width}px`,
          maxWidth: `${width}px`,
          zIndex: isHeader ? 35 : 25,
          boxShadow: isFirstSticky ? '-6px 0 12px -4px rgba(0,0,0,0.15)' : 'none',
          borderLeft: isFirstSticky ? '1px solid #e5e7eb' : undefined,
          paddingRight: key === 'reliabilityScore' ? undefined : '0.5rem', 
      };
      
      if (isHeader) {
          style.backgroundColor = '#dbeafe'; // bg-blue-100
      } else {
          style.backgroundColor = isExpandedRow ? '#eff6ff' : '#f9fafb'; // blue-50 : gray-50
      }
      
      return style;
  };

  return (
    <div className="w-full bg-white p-6 md:p-8 rounded-lg shadow-lg border border-gray-200 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex-grow">
          <h2 id="results-heading" className="text-2xl font-bold text-gray-800">Analysis Results</h2>
          <p className="text-sm text-gray-500 mt-1">Tip: Click a Unique ID to expand the row and compare details.</p>
          {filterTitle && (
            <div className="flex items-center gap-3 mt-2">
                <p className="text-sm text-gray-600">
                    Showing data for: <span className="font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded-md">{filterTitle}</span>
                </p>
                <button 
                    onClick={onClearFilter}
                    className="text-sm text-blue-600 hover:underline"
                >
                    Clear Filter
                </button>
            </div>
          )}
          <div className="mt-4 flex items-center gap-4">
            <div className="relative flex-grow max-w-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input
                    type="search"
                    id="table-search"
                    aria-label="Search results"
                    placeholder={`Search in ${results.length} results...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
            </div>
            {searchTerm && (
                <button
                    onClick={() => setSearchTerm('')}
                    className="text-sm text-blue-600 hover:underline"
                >
                    Clear Search
                </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <ColumnToggler 
            allColumns={allColumns}
            visibleColumns={visibleColumns}
            onVisibilityChange={onVisibleColumnsChange}
          />
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 transition-colors duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Full Dataset (CSV)
          </button>
        </div>
      </div>

      <div 
        ref={topScrollRef}
        className="overflow-x-auto w-full mb-1"
        style={{ height: '12px' }}
      >
        <div style={{ width: scrollWidth, height: '1px' }}></div>
      </div>

      <div 
        ref={tableContainerRef}
        className="overflow-x-auto max-h-[70vh] border border-gray-200 rounded-md shadow-sm"
      >
        {paginatedResults.length > 0 ? (
            <table 
                className="min-w-full divide-y divide-gray-200 table-fixed" 
                style={{ borderCollapse: 'separate', borderSpacing: 0 }}
                aria-labelledby="results-heading"
            >
            <thead className="bg-gray-100 sticky top-0 z-40">
                <tr>
                {visibleOriginalHeaders.map((header) => (
                    <th 
                        key={header} 
                        scope="col" 
                        className="px-2 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider relative group bg-gray-100 align-bottom border-b border-gray-200"
                        style={{ width: `${getColumnWidth(header)}px` }}
                        aria-sort={sortConfig?.key === header ? sortConfig.direction : 'none'}
                    >
                    <button onClick={() => requestSort(header)} className="flex items-end w-full h-full">
                        <span className="whitespace-normal break-words leading-tight">{header}</span>
                        <SortIcon direction={sortConfig?.key === header ? sortConfig.direction : null} />
                    </button>
                    <div
                        onMouseDown={(e) => handleMouseDown(e, header)}
                        aria-hidden="true"
                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-200"
                    />
                    </th>
                ))}
                {visibleAddedHeaders.map((header) => {
                    const sticky = isSticky(header.key);
                    return (
                        <th 
                            key={header.key} 
                            scope="col" 
                            className={`px-2 py-2 text-left text-xs font-bold uppercase tracking-wider relative group align-bottom border-b ${sticky ? 'text-blue-800' : 'text-gray-600 bg-gray-100 border-gray-200'}`}
                            style={getStickyStyle(header.key, true)}
                            aria-sort={sortConfig?.key === header.key ? sortConfig.direction : 'none'}
                        >
                        <button onClick={() => requestSort(header.key)} className="flex items-end w-full h-full">
                            <span className="whitespace-normal break-words leading-tight">{header.title}</span>
                            <SortIcon direction={sortConfig?.key === header.key ? sortConfig.direction : null} />
                        </button>
                        <div
                            onMouseDown={(e) => handleMouseDown(e, header.key)}
                            aria-hidden="true"
                            className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-300"
                        />
                        </th>
                    );
                })}
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {paginatedResults.map((item, index) => {
                    const isExpanded = expandedRowId === item.rowId;
                    const matchDetails = parseMatchedKDEs(item.matchedKDEs);
                    
                    return (
                        <React.Fragment key={index}>
                            <tr className={`${isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                {visibleOriginalHeaders.map((header) => (
                                <td key={`${header}-${index}`} className="px-2 py-2 text-xs text-gray-700 break-words align-top leading-tight bg-inherit">
                                    {item[header]}
                                </td>
                                ))}
                                {visibleAddedHeaders.map((header) => {
                                    const sticky = isSticky(header.key);
                                    return (
                                        <td 
                                            key={`${header.key}-${index}`} 
                                            className={`px-2 py-2 text-xs text-gray-700 align-top leading-tight`}
                                            style={getStickyStyle(header.key, false, isExpanded)}
                                        >
                                            {addedColumnRenderers[header.key](item, item._originalIndex)}
                                        </td>
                                    );
                                })}
                            </tr>
                            {isExpanded && (
                                <tr className="bg-slate-100 shadow-inner">
                                    <td 
                                        colSpan={totalColSpan} 
                                        className="px-4 py-6"
                                        style={{
                                            position: 'sticky',
                                            left: 0,
                                            zIndex: 10
                                        }}
                                    >
                                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden max-w-5xl mx-auto">
                                            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex justify-between items-center">
                                                <h4 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Match Analysis & Comparison</h4>
                                                <div className="text-xs text-gray-500">
                                                    Comparing row {index + 1}
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-12 text-xs">
                                                <div className="hidden md:contents">
                                                    <div className="col-span-12 grid grid-cols-12 border-b border-gray-100 bg-gray-50/50 py-2 px-6 font-semibold text-gray-500 text-[10px] uppercase">
                                                        <div className="col-span-2">Attribute</div>
                                                        <div className="col-span-5 border-l border-gray-200 pl-4">Your Input (Product Details)</div>
                                                        <div className="col-span-5 border-l border-gray-200 pl-4 text-blue-700">Seafood Watch Match</div>
                                                    </div>
                                                </div>

                                                 {hasInputData(item, 'Wild or Farmed') && (
                                                    <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 border-b border-gray-100 py-3 px-6 hover:bg-gray-50 items-center">
                                                        <div className="md:col-span-2 font-medium text-gray-600 text-[10px] uppercase md:text-xs md:normal-case mb-1 md:mb-0">Wild or Farmed</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 mb-2 md:mb-0">{getInputDetail(item, 'Wild or Farmed')}</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 text-gray-800">{matchDetails.type}</div>
                                                    </div>
                                                 )}

                                                {hasInputData(item, 'Common name') && (
                                                    <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 border-b border-gray-100 py-3 px-6 hover:bg-gray-50 items-center">
                                                        <div className="md:col-span-2 font-medium text-gray-600 text-[10px] uppercase md:text-xs md:normal-case mb-1 md:mb-0">Species</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 mb-2 md:mb-0">{getInputDetail(item, 'Common name')}</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 font-medium text-gray-800">{matchDetails.species}</div>
                                                    </div>
                                                )}
                                                
                                                 {hasInputData(item, 'Source country') && (
                                                    <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 border-b border-gray-100 py-3 px-6 hover:bg-gray-50 items-center">
                                                        <div className="md:col-span-2 font-medium text-gray-600 text-[10px] uppercase md:text-xs md:normal-case mb-1 md:mb-0">Country</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 mb-2 md:mb-0">{getInputDetail(item, 'Source country')}</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 text-gray-800">{matchDetails.country}</div>
                                                    </div>
                                                )}

                                                {hasInputData(item, 'Subnational area') && (
                                                    <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 border-b border-gray-100 py-3 px-6 hover:bg-gray-50 items-center">
                                                        <div className="md:col-span-2 font-medium text-gray-600 text-[10px] uppercase md:text-xs md:normal-case mb-1 md:mb-0">Subnational area</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 mb-2 md:mb-0">{getInputDetail(item, 'Subnational area')}</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 text-gray-800">{matchDetails.subnational}</div>
                                                    </div>
                                                )}

                                                 {hasInputData(item, 'Body of water') && (
                                                    <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 border-b border-gray-100 py-3 px-6 hover:bg-gray-50 items-center">
                                                        <div className="md:col-span-2 font-medium text-gray-600 text-[10px] uppercase md:text-xs md:normal-case mb-1 md:mb-0">Body of water</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 mb-2 md:mb-0">{getInputDetail(item, 'Body of water')}</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 text-gray-400 italic text-xs">-</div>
                                                    </div>
                                                 )}

                                                {hasInputData(item, 'Production Method') && (
                                                    <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 border-b border-gray-100 py-3 px-6 hover:bg-gray-50 items-center">
                                                        <div className="md:col-span-2 font-medium text-gray-600 text-[10px] uppercase md:text-xs md:normal-case mb-1 md:mb-0">Method</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 mb-2 md:mb-0">{getInputDetail(item, 'Production Method')}</div>
                                                        <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 text-gray-800">{matchDetails.method}</div>
                                                    </div>
                                                )}

                                                <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 py-4 px-6 bg-blue-50/40 items-start border-t border-blue-100">
                                                    <div className="md:col-span-2 font-bold italic text-[#00629B] text-sm uppercase md:text-base md:normal-case mb-2 md:mb-0">Match Rationale</div>
                                                    <div className="md:col-span-10 md:border-l border-blue-200 md:pl-6 text-[#00629B] italic text-sm md:text-base font-medium leading-relaxed">
                                                        {item.notes || 'No match rationale available.'}
                                                    </div>
                                                </div>

                                                {/* Audit Trail Section */}
                                                <div className="col-span-12 border-t border-gray-100 bg-gray-50/20 py-4 px-6">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <History className="w-4 h-4 text-gray-400" />
                                                        <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Data Lineage & Audit Trail</h5>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {item.auditTrail && item.auditTrail.length > 0 ? (
                                                            item.auditTrail.map((entry: any, i: number) => (
                                                                <div key={i} className="flex gap-3 items-start relative">
                                                                    {i !== item.auditTrail.length - 1 && (
                                                                        <div className="absolute left-[7px] top-4 bottom-0 w-px bg-gray-200"></div>
                                                                    )}
                                                                    <div className={`mt-1 w-3.5 h-3.5 rounded-full flex items-center justify-center z-10 ${
                                                                        entry.action === 'Initial Analysis' ? 'bg-blue-100 text-blue-600' :
                                                                        entry.action === 'Approval' ? 'bg-green-100 text-green-600' :
                                                                        'bg-orange-100 text-orange-600'
                                                                    }`}>
                                                                        {entry.action === 'Approval' ? <CheckCircle2 className="w-2 h-2" /> : 
                                                                         entry.action === 'Manual Correction' ? <AlertCircle className="w-2 h-2" /> :
                                                                         <Clock className="w-2 h-2" />}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 mb-0.5">
                                                                            <span className="text-[11px] font-bold text-gray-700">{entry.action}</span>
                                                                            <span className="text-[10px] text-gray-400">•</span>
                                                                            <span className="text-[10px] text-gray-400">{new Date(entry.timestamp).toLocaleString()}</span>
                                                                        </div>
                                                                        <p className="text-[11px] text-gray-600 leading-relaxed">{entry.details}</p>
                                                                        <div className="flex items-center gap-1.5 mt-1">
                                                                            <User className="w-2.5 h-2.5 text-gray-400" />
                                                                            <span className="text-[10px] font-medium text-gray-500">{entry.user}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="text-[11px] text-gray-400 italic">No audit history available for this record.</div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 py-4 px-6 bg-blue-50/30 items-center">
                                                    <div className="md:col-span-2 font-medium text-gray-600 text-xs uppercase md:text-sm md:normal-case mb-1 md:mb-0">Result</div>
                                                    <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4 flex items-center gap-2 mb-2 md:mb-0">
                                                    </div>
                                                    <div className="md:col-span-5 md:border-l border-gray-200 md:pl-4">
                                                        <div className="flex flex-wrap items-center gap-4">
                                                            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-gray-200">
                                                                    <span className="text-gray-500 text-xs uppercase font-bold">Rating:</span>
                                                                    <RatingBadge rating={item.rating} />
                                                            </div>
                                                            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-gray-200">
                                                                    <span className="text-gray-500 text-xs uppercase font-bold">Reliability:</span>
                                                                    <span className={`font-bold ${item.reliabilityScore > 80 ? 'text-green-600' : 'text-yellow-600'}`}>{item.reliabilityScore}%</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col md:flex-row items-start md:items-center gap-4">
                                                <div className="flex-grow">
                                                    <label htmlFor={`edit-id-${index}`} className="block text-xs font-bold text-gray-700 mb-1">
                                                        Is this match incorrect? Manually update the Unique ID:
                                                    </label>
                                                    <div className="flex gap-2 max-w-md">
                                                        <input 
                                                            id={`edit-id-${index}`}
                                                            type="text" 
                                                            value={editValue} 
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            className="flex-grow text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                                                            placeholder="Enter official ID or 'Cert'..."
                                                        />
                                                        <button 
                                                            onClick={() => handleSubmitEdit(item.rowId)}
                                                            className="bg-blue-600 text-white text-xs px-4 py-1.5 rounded font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                                            disabled={!editValue || (editValue === item.uniqueId && !item.isManual) || item.isUpdating}
                                                        >
                                                            Update ID
                                                        </button>
                                                        <button 
                                                            onClick={() => handleSaveAssignment(item.rowId)}
                                                            className="bg-green-600 text-white text-xs px-4 py-1.5 rounded font-semibold hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-1.5"
                                                            disabled={item.isUpdating || item.isVerified}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                            {item.isVerified ? 'Assignment Saved' : 'Save Assignment'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-500 italic max-w-xs">
                                                    Tip: Updating the ID will force the system to use the official details associated with that ID.
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    );
                })}
            </tbody>
            </table>
        ) : (
            <p className="text-center text-gray-500 my-8 py-4">
                No results found for your search: "{searchTerm}".
            </p>
        )}
      </div>

      {/* Pagination Controls */}
      {filteredAndSortedResults.length > rowsPerPage && (
        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold">{(currentPage - 1) * rowsPerPage + 1}</span> to <span className="font-semibold">{Math.min(currentPage * rowsPerPage, filteredAndSortedResults.length)}</span> of <span className="font-semibold">{filteredAndSortedResults.length}</span> entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                // Show first, last, and pages around current
                if (
                  pageNum === 1 || 
                  pageNum === totalPages || 
                  (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1 border rounded-md text-sm font-medium transition-colors ${
                        currentPage === pageNum 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                } else if (
                  pageNum === currentPage - 2 || 
                  pageNum === currentPage + 2
                ) {
                  return <span key={pageNum} className="px-1 text-gray-400">...</span>;
                }
                return null;
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="rows-per-page" className="text-sm text-gray-600">Rows per page:</label>
            <select
              id="rows-per-page"
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="text-sm border border-gray-300 rounded-md bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

// Renamed helper to avoid conflicts and improve clarity
function parseMatchedKDEs(kdeString: string) {
    if (!kdeString || kdeString === 'N/A') return { species: 'N/A', type: 'N/A', subnational: 'N/A', country: 'N/A', method: 'N/A' };
    
    // Example format: "Greater amberjack (Wild) | Alaska | United States | Diving"
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
    // Fallback for old format (3 parts)
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

export default ResultsTable;
