
import React from 'react';

interface LoaderProps {
  progress?: { processed: number; total: number } | null;
  onCancel?: () => void;
}

const Loader: React.FC<LoaderProps> = ({ progress, onCancel }) => (
  <div className="flex flex-col items-center justify-center space-y-4 my-8 w-full max-w-xl mx-auto">
    {/* Updated spinner border color to #62B6F3 */}
    <div className="w-16 h-16 border-4 border-[#62B6F3] border-dashed rounded-full animate-spin"></div>
    {progress && progress.total > 0 ? (
      <>
        <p className="text-lg text-gray-600">
          Analyzing item {progress.processed} of {progress.total}...
        </p>
        <div className="w-full bg-gray-200 rounded-full h-4">
          {/* Updated progress bar background color to #62B6F3 */}
          <div 
            className="bg-[#62B6F3] h-4 rounded-full transition-all duration-300 ease-linear" 
            style={{ width: `${(progress.processed / progress.total) * 100}%` }}>
          </div>
        </div>
      </>
    ) : (
      <p className="text-lg text-gray-600">Analyzing data... This may take a few moments for large files.</p>
    )}
    
    {onCancel && (
      <button 
        onClick={onCancel}
        className="mt-6 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md border border-transparent hover:border-red-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
      >
        Cancel Analysis
      </button>
    )}
  </div>
);

export default Loader;
