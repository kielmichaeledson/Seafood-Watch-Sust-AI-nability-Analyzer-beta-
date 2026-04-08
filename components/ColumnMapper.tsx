
import React, { useState, useEffect } from 'react';
import { getColumnMapping } from '../services/geminiService';
import { Info, Eye } from 'lucide-react';

import { motion, AnimatePresence } from 'motion/react';

interface ColumnMapperProps {
  fileHeaders: string[];
  mappableFields: string[];
  originalData: any[];
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}

const ColumnMapper: React.FC<ColumnMapperProps> = ({ fileHeaders, mappableFields, originalData, onConfirm, onCancel }) => {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isAutoMapping, setIsAutoMapping] = useState<boolean>(true);
  const [autoMapError, setAutoMapError] = useState<boolean>(false);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);

  const getColumnPreview = (header: string, count: number = 3) => {
    if (!originalData || originalData.length === 0) return '';
    const values = originalData
      .map(row => row[header])
      .filter(val => val !== undefined && val !== null && val !== '')
      .slice(0, count)
      .map(val => String(val));
    
    if (values.length === 0) return '(Empty)';
    return `${values.join(', ')}${originalData.length > count ? '...' : ''}`;
  };

  const getFullPreview = (header: string) => {
    if (!originalData || originalData.length === 0) return [];
    return originalData
      .map(row => row[header])
      .filter(val => val !== undefined && val !== null && val !== '')
      .slice(0, 10)
      .map(val => String(val));
  };

  useEffect(() => {
    const generateMapping = async () => {
      setIsAutoMapping(true);
      setAutoMapError(false);
      try {
        const { mapping: newMapping, isFallback } = await getColumnMapping(mappableFields, fileHeaders);
        if (isFallback) {
          setAutoMapError(true);
        }
        setMapping(newMapping);
      } catch (err: any) {
        console.error("Failed to get column mapping:", err);
        setAutoMapError(true);
        const initialMapping: Record<string, string> = {};
        mappableFields.forEach(field => {
            initialMapping[field] = 'N/A';
        });
        setMapping(initialMapping);
      } finally {
        setIsAutoMapping(false);
      }
    };

    generateMapping();
  }, [fileHeaders, mappableFields]);

  const handleMappingChange = (field: string, header: string) => {
    setMapping(prev => ({ ...prev, [field]: header }));
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-lg border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Map Your Data Columns</h2>
      
      {autoMapError && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
          <p className="font-bold">AI Mapping Unsuccessful</p>
          <p>We couldn't use AI to map your columns, so we've fallen back to basic keyword matching. Please review manually.</p>
        </div>
      )}

      {isAutoMapping ? (
        <div className="flex flex-col items-center justify-center space-y-4 my-12">
            <div className="w-12 h-12 border-4 border-[#62B6F3] border-dashed rounded-full animate-spin"></div>
            <p className="text-gray-600 text-lg">AI is analyzing your columns...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {mappableFields.map(field => (
            <div key={field} className="flex flex-col relative">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  {field} <span className="text-red-500">*</span>
                </label>
                {mapping[field] && mapping[field] !== 'N/A' && (
                  <div 
                    className="relative group cursor-help"
                    onMouseEnter={() => setHoveredHeader(mapping[field])}
                    onMouseLeave={() => setHoveredHeader(null)}
                  >
                    <Eye className="w-4 h-4 text-blue-500 hover:text-blue-700 transition-colors" />
                    
                    <AnimatePresence>
                      {hoveredHeader === mapping[field] && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="absolute right-0 bottom-full mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-50 pointer-events-none"
                        >
                          <p className="font-bold border-b border-gray-700 pb-1 mb-2">Column: {mapping[field]}</p>
                          <ul className="space-y-1">
                            {getFullPreview(mapping[field]).map((val, i) => (
                              <li key={i} className="truncate">• {val}</li>
                            ))}
                          </ul>
                          <div className="absolute right-2 top-full w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-gray-900"></div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
              <select
                value={mapping[field] || 'N/A'}
                onChange={(e) => handleMappingChange(field, e.target.value)}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${mapping[field] && mapping[field] !== 'N/A' ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
              >
                <option value="N/A">-- Select Column --</option>
                {fileHeaders.map(header => (
                  <option key={header} value={header}>
                    {header} ({getColumnPreview(header, 2)})
                  </option>
                ))}
              </select>
              {mapping[field] && mapping[field] !== 'N/A' && (
                <p className="mt-1 text-xs text-gray-500 italic truncate">
                  Preview: {getColumnPreview(mapping[field], 3)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex justify-end gap-4">
        <button
          onClick={onCancel}
          className="px-6 py-2 font-semibold text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none transition-colors duration-200"
        >
          Back
        </button>
        <button
          onClick={() => onConfirm(mapping)}
          disabled={isAutoMapping}
          className="px-6 py-2 font-semibold text-white bg-[#00629B] rounded-md hover:bg-[#00497b] focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
        >
          Confirm & Analyze Data
        </button>
      </div>
    </div>
  );
};

export default ColumnMapper;
