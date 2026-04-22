
import React, { useState, useEffect } from 'react';

interface DataPreviewProps {
  sheetNames: string[];
  selectedSheet: string;
  onSheetChange: (sheetName: string) => void;
  headerRowIndex: number;
  onHeaderRowChange: (newRow: number) => void;
  previewData: (string | number)[][];
  onConfirm: () => void;
  onCancel: () => void;
  isAnalyzing: boolean;
  warning?: string | null;
}

const DataPreview: React.FC<DataPreviewProps> = ({
  sheetNames,
  selectedSheet,
  onSheetChange,
  headerRowIndex,
  onHeaderRowChange,
  previewData,
  onConfirm,
  onCancel,
  isAnalyzing,
  warning,
}) => {
  const [inputValue, setInputValue] = useState(String(headerRowIndex));

  useEffect(() => {
    setInputValue(String(headerRowIndex));
  }, [headerRowIndex]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const commitValue = () => {
    const newRow = parseInt(inputValue, 10);
    if (!isNaN(newRow) && newRow > 0) {
      onHeaderRowChange(newRow);
    } else {
      setInputValue(String(headerRowIndex));
    }
  };

  const handleBlur = () => {
    commitValue();
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitValue();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setInputValue(String(headerRowIndex));
      e.currentTarget.blur();
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto bg-white p-8 rounded-lg shadow-lg border border-gray-200">
      <div className="flex justify-between items-start mb-2">
        <h2 className="text-2xl font-bold text-gray-800">Preview and Configure Your Data</h2>
        {isAnalyzing && (
          <div className="flex items-center text-blue-600 text-sm font-medium animate-pulse">
            <div className="w-4 h-4 border-2 border-blue-600 border-dashed rounded-full animate-spin mr-2"></div>
            AI is optimizing layout...
          </div>
        )}
      </div>
      <p className="text-gray-600 mb-6">
        Confirm the sheet and header row are correct. Click a row in the preview to set it as the header. The highlighted row will be used as the column headers.
      </p>

      {warning && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
          <p className="font-bold">Please Note</p>
          <p>{warning}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 p-4 bg-gray-50 rounded-md border">
        {sheetNames.length > 1 && (
          <div>
            <label htmlFor="sheet-select" className="block text-sm font-medium text-gray-700 mb-1">
              Select Sheet
            </label>
            <select
              id="sheet-select"
              value={selectedSheet}
              onChange={(e) => onSheetChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {sheetNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="header-row-input" className="block text-sm font-medium text-gray-700 mb-1">
            Header Row Number
          </label>
          <input
            id="header-row-input"
            type="number"
            min="1"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-700 mb-4">Data Preview</h3>
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-gray-200">
            {previewData.map((row, rowIndex) => (
              <tr 
                key={rowIndex}
                onClick={() => onHeaderRowChange(rowIndex + 1)}
                className={`cursor-pointer transition-colors duration-150 ${rowIndex === headerRowIndex - 1 ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
              >
                {row.map((cell, cellIndex) => (
                  <td 
                    key={cellIndex} 
                    className={`px-4 py-2 whitespace-nowrap text-gray-700 ${rowIndex === headerRowIndex - 1 ? 'font-bold text-blue-800' : ''}`}
                  >
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
       {previewData.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No data to display for this sheet. It might be empty.
          </div>
        )}

      <div className="mt-8 flex flex-col sm:flex-row justify-end gap-4">
        <button
          onClick={onCancel}
          className="px-6 py-2 font-semibold text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none transition-colors duration-200"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={previewData.length === 0}
          className="px-6 py-2 font-semibold text-white bg-[#00629B] rounded-md hover:bg-[#00497b] focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
        >
          Confirm & Continue to Mapping
        </button>
      </div>
    </div>
  );
};

export default DataPreview;
