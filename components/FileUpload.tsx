import React, { useState, useCallback } from 'react';

interface FileUploadProps {
  onProcessFile: (file: File) => void;
  isLoading: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onProcessFile, isLoading }) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      const allowedTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      if (allowedTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
        setError(null);
      } else {
        setFile(null);
        setError('Invalid file type. Please upload a CSV or XLSX file.');
      }
    }
    event.target.value = ''; // Reset file input
  };

  const handleProcessClick = useCallback(() => {
    if (file && !isLoading) {
      onProcessFile(file);
    }
  }, [file, isLoading, onProcessFile]);
  
  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  };
  
  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
       const fakeEvent = { target: { files: [droppedFile] } } as unknown as React.ChangeEvent<HTMLInputElement>;
       handleFileChange(fakeEvent);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">Upload Your Sourcing Data</h2>
      <p className="text-gray-600 mb-6 text-center">Upload a CSV or XLSX file to get started.</p>

      <label
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        htmlFor="file-upload" 
        className="flex flex-col items-center justify-center w-full h-48 px-4 transition bg-white border-2 border-gray-300 border-dashed rounded-md appearance-none cursor-pointer hover:border-gray-400 focus:outline-none">
        <span className="flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="font-medium text-gray-600">
                Drop files to Attach, or
                <span className="text-blue-600 underline ml-1">browse</span>
            </span>
        </span>
        <input id="file-upload" type="file" accept=".csv, .xlsx" className="hidden" onChange={handleFileChange} />
      </label>

      {file && (
        <div className="mt-4 text-center text-gray-700">
          Selected file: <span className="font-semibold">{file.name}</span>
        </div>
      )}
      {error && <div className="mt-4 text-center text-red-600">{error}</div>}

      <div className="mt-6 flex justify-center">
        <button
          onClick={handleProcessClick}
          disabled={!file || isLoading}
          className="w-full sm:w-auto px-8 py-3 text-lg font-semibold text-white bg-[#00629B] rounded-md hover:bg-[#00497b] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00629B] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isLoading ? 'Processing...' : 'Upload Seafood Product Dataset'}
        </button>
      </div>
    </div>
  );
};

export default FileUpload;