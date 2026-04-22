
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SeafoodInputItem, SeafoodResultItem, Rating, UploadSummary, User } from './types';
import { rateSeafoodData, updateAnalysisForId } from './services/geminiService';
import { loadDatabaseFromUrl } from './services/referenceDatabase';
import { getUploadHistory, saveUploadToHistory, updateHistoryItemResults } from './services/historyService';
import { performDataAudit, AuditReport } from './services/dataAuditService';
import { getCurrentUser, logout } from './services/authService';
import { saveTrainingExample } from './services/trainingService';
import { UserCorrectionService } from './services/userCorrectionService';
import FileUpload from './components/FileUpload';
import ResultsTable from './components/ResultsTable';
import Loader from './components/Loader';
import Dashboard from './components/Dashboard';
import ColumnMapper from './components/ColumnMapper';
import DataPreview from './components/DataPreview';
import ChartsView from './components/ChartsView';
import Modal from './components/Modal';
import DataQualityAudit from './components/DataQualityAudit';
import Login from './components/Login';
import UserManagement from './components/UserManagement';

// This declaration is no longer necessary as XLSX is handled in a Web Worker
// declare var XLSX: any;

type View = 'dashboard' | 'analyzer' | 'users';
type AnalyzerState = 'upload' | 'preview' | 'mapping' | 'audit' | 'loading' | 'results';
type ResultsViewMode = 'table' | 'charts' | 'review';
import ReviewQueue from './components/ReviewQueue';

const MAPPABLE_FIELDS = [
  'Wild or Farmed',
  'Common name',
  'Scientific name',
  'Source country',
  'Subnational area',
  'Body of water',
  'Production Method',
  'Certification',
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [analyzerState, setAnalyzerState] = useState<AnalyzerState>('upload');
  const [results, setResults] = useState<SeafoodResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // State for raw data and headers
  const [originalData, setOriginalData] = useState<SeafoodInputItem[] | null>(null);
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  // State for column mapping and display-optimized results
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [displayResults, setDisplayResults] = useState<any[] | null>(null);
  const [displayHeaders, setDisplayHeaders] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);

  // State for preview step
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(1);
  const [previewData, setPreviewData] = useState<(string|number)[][]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);

  const [uploadHistory, setUploadHistory] = useState<UploadSummary[]>([]);
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number; status?: string } | null>(null);

  // State for results view
  const [resultsViewMode, setResultsViewMode] = useState<ResultsViewMode>('table');
  const [activeFilter, setActiveFilter] = useState<{title: string; data: any[]} | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [modalFilterData, setModalFilterData] = useState<{title: string; data: SeafoodResultItem[]} | null>(null);

  const analysisAbortController = useRef<AbortController | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
      // Admin: default to Dashboard. User: default to Analyzer (Upload view).
      setView(user.role === 'admin' ? 'dashboard' : 'analyzer');
    }
    
    const loadHistory = async () => {
      const history = await getUploadHistory();
      setUploadHistory(history);
    };
    loadHistory();
    loadDatabaseFromUrl('seafood-watch-data.csv');
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // Role based landing page
    setView(user.role === 'admin' ? 'dashboard' : 'analyzer');
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    resetAnalyzerState();
  };

  const resetAnalyzerState = useCallback(() => {
    setResults(null);
    setDisplayResults(null);
    setDisplayHeaders([]);
    setError(null);
    setOriginalData(null);
    setOriginalHeaders([]);
    setCurrentFileName('');
    setProgress(null);
    setSheetNames([]);
    setSelectedSheet('');
    setHeaderRowIndex(1);
    setPreviewData([]);
    setColumnMapping({});
    setAuditReport(null);
    setVisibleColumns(new Set());
    setResultsViewMode('table');
    setActiveFilter(null);
    setIsFilterModalOpen(false);
    setModalFilterData(null);
    setAnalyzerState('upload');
    setCurrentUploadId(null);
    setIsPreviewLoading(false);
    setPreviewWarning(null);
    analysisAbortController.current = null;
  }, []);

  const handleProcessFile = useCallback(async (file: File) => {
    resetAnalyzerState();
    setAnalyzerState('preview');
    setIsPreviewLoading(true);
    setCurrentFile(file);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result;
        if (!data) return;

        // Use Web Worker for parsing
        const worker = new Worker(new URL('./workers/analysis.worker.ts', import.meta.url), { type: 'module' });
        
        worker.onmessage = async (event) => {
          const { type, payload } = event.data;
          
          if (type === 'PARSE_FILE_SUCCESS') {
            const { sheetNames } = payload;
            setSheetNames(sheetNames);
            setCurrentFileName(file.name);

            // Request first sheet data for layout analysis
            worker.postMessage({ 
              type: 'GET_SHEET_DATA', 
              payload: { 
                data, 
                options: { type: 'array', cellNF: false, cellText: false },
                sheetName: sheetNames[0]
              } 
            });
          }

          if (type === 'GET_SHEET_DATA_SUCCESS') {
            const { dataAsArray } = payload;
            
            let bestSheetName = sheetNames[0];
            let bestHeaderRow = 1;

            // Fast static heuristic to show data immediately
            for (let i = 0; i < Math.min(dataAsArray.length, 5); i++) {
              const row = dataAsArray[i].map((c: any) => String(c).toLowerCase());
              if (row.some((c: string) => c.includes('species') || c.includes('common name') || c.includes('product') || c.includes('country'))) {
                bestHeaderRow = i + 1;
                break;
              }
            }

            // Set initial state immediately so user can see data
            setSelectedSheet(bestSheetName);
            setHeaderRowIndex(bestHeaderRow);
            setPreviewData(dataAsArray.slice(0, 15));
            setIsPreviewLoading(false);

            worker.terminate();
          }

          if (type === 'ERROR') {
            setError(`Worker error: ${payload}`);
            setAnalyzerState('upload');
            setIsPreviewLoading(false);
            worker.terminate();
          }
        };

        worker.postMessage({ 
          type: 'PARSE_FILE', 
          payload: { 
            data, 
            options: { type: 'array', cellNF: false, cellText: false } 
          } 
        });
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      setError(`Error starting file process: ${err.message}`);
      setAnalyzerState('upload');
      setIsPreviewLoading(false);
    }
  }, [resetAnalyzerState, sheetNames]);

  const handleSheetChange = useCallback(async (sheetName: string) => {
    if (!currentFile) return;
    setSelectedSheet(sheetName);
    setIsPreviewLoading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result;
        if (!data) return;

        const worker = new Worker(new URL('./workers/analysis.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event) => {
          const { type, payload } = event.data;
          if (type === 'GET_SHEET_DATA_SUCCESS') {
            const { dataAsArray } = payload;
            setPreviewData(dataAsArray.slice(0, 15));
            setIsPreviewLoading(false);
            worker.terminate();
          }
          if (type === 'ERROR') {
            setError(`Worker error: ${payload}`);
            setIsPreviewLoading(false);
            worker.terminate();
          }
        };

        worker.postMessage({ 
          type: 'GET_SHEET_DATA', 
          payload: { 
            data, 
            options: { type: 'array', cellNF: false, cellText: false },
            sheetName,
            limit: 15
          } 
        });
      };
      reader.readAsArrayBuffer(currentFile);
    } catch (err: any) {
      setError(`Error changing sheet: ${err.message}`);
      setIsPreviewLoading(false);
    }
  }, [currentFile]);

  const handleHeaderRowChange = (newRowIndex: number) => {
    setHeaderRowIndex(newRowIndex);
  };

  const handleConfirmPreview = useCallback(() => {
    setError(null);
    if (!currentFile) {
        setError("No file selected.");
        return;
    }
    
    setAnalyzerState('loading');

    const reader = new FileReader();
    reader.onerror = () => {
        setError("Failed to read the file. Please try again.");
        setAnalyzerState('preview');
    };

    reader.onload = async (e) => {
      const data = e.target?.result;
      if (!data) {
          setError("Failed to get file content.");
          setAnalyzerState('preview');
          return;
      }

      const worker = new Worker(new URL('./workers/analysis.worker.ts', import.meta.url), { type: 'module' });
      
      worker.onmessage = (event) => {
        const { type, payload } = event.data;
        
        if (type === 'GET_SHEET_DATA_SUCCESS') {
          const { dataAsArray } = payload;
          
          if (!dataAsArray || dataAsArray.length === 0) {
              setError("The selected sheet appears to be empty.");
              setAnalyzerState('preview');
              worker.terminate();
              return;
          }

          // Offload transformation to worker
          worker.postMessage({
            type: 'TRANSFORM_DATA',
            payload: { dataAsArray, headerRowIndex }
          });
        }

        if (type === 'TRANSFORM_DATA_SUCCESS') {
          const { jsonData, headers } = payload;
          
          if (!headers || headers.length === 0) {
              setError("Could not identify any columns in the selected header row.");
              setAnalyzerState('preview');
              worker.terminate();
              return;
          }

          setOriginalData(jsonData);
          setOriginalHeaders(headers);
          setAnalyzerState('mapping');
          worker.terminate();
        }
        
        if (type === 'ERROR') {
          setError(`File processing error: ${payload}`);
          setAnalyzerState('preview');
          worker.terminate();
        }
      };

      // Fallback for sheet selection: use selectedSheet if exists, otherwise first sheet
      const sheetToLoad = selectedSheet || (sheetNames.length > 0 ? sheetNames[0] : '');
      
      worker.postMessage({ 
        type: 'GET_SHEET_DATA', 
        payload: { 
          data: data as ArrayBuffer, 
          options: { cellNF: false, cellText: false },
          sheetName: sheetToLoad
        } 
      });
    };
    reader.readAsArrayBuffer(currentFile);
  }, [selectedSheet, headerRowIndex, currentFile, sheetNames]);

  const handleConfirmMapping = useCallback((mapping: Record<string, string>) => {
    if (!originalData) return;
    setColumnMapping(mapping);
    const report = performDataAudit(originalData, mapping);
    setAuditReport(report);
    setAnalyzerState('audit');
  }, [originalData]);

  const handleStartAnalysis = useCallback(async () => {
    if (!originalData) return;
    setAnalyzerState('loading');
    setError(null);
    analysisAbortController.current = new AbortController();

    try {
        const commonNameHeader = columnMapping['Common name'];
        let dataToProcess = originalData;
        if (commonNameHeader && commonNameHeader !== 'N/A') {
            dataToProcess = originalData.filter(row => {
                const val = row[commonNameHeader];
                return val !== undefined && val !== null && String(val).trim() !== '';
            });
        }
        
        setProgress({ processed: 0, total: dataToProcess.length });

        const transformedData = dataToProcess.map(row => {
            const newRow: { [key: string]: string | number } = {};
            for (const mappableField of MAPPABLE_FIELDS) {
                const userColumnName = columnMapping[mappableField];
                if (userColumnName && userColumnName !== 'N/A' && row[userColumnName] !== undefined) {
                    newRow[mappableField] = row[userColumnName] as string | number;
                }
            }
            return newRow;
        });
        
        const analysisResults = await rateSeafoodData(transformedData, (p, t, s) => setProgress({ processed: p, total: t, status: s }), analysisAbortController.current.signal);
        
        const finalResults: SeafoodResultItem[] = dataToProcess.map((originalItem, index) => {
            const analysisPart = analysisResults[index];
            const needsReview = analysisPart.reliabilityScore >= 40 && analysisPart.reliabilityScore <= 70;
            return {
                ...originalItem,
                rowId: `row-${Date.now()}-${index}`,
                uniqueId: analysisPart.uniqueId,
                matchedKDEs: analysisPart.matchedKDEs, 
                rating: analysisPart.rating,
                reliabilityScore: analysisPart.reliabilityScore,
                notes: analysisPart.notes,
                evidence: analysisPart.evidence,
                needsReview,
                candidates: analysisPart.candidates,
            };
        });
        
        const filteredHeaders = originalHeaders.filter(h => {
            const low = h.toLowerCase();
            return !low.includes('supplier') && !low.includes('product name') && !low.includes('volume');
        });

        setResults(finalResults);
        setDisplayResults(finalResults);
        setDisplayHeaders(filteredHeaders);

        const mappedHeaders = Object.values(columnMapping).filter(h => h && h !== 'N/A' && filteredHeaders.includes(h)) as string[];
        setVisibleColumns(new Set([...mappedHeaders, 'uniqueId', 'rating', 'reliabilityScore']));

        // Persistence logic
        try {
          const matchedCount = finalResults.filter(r => r.rating !== Rating.NA).length;
          const matchPercentage = finalResults.length > 0 ? (matchedCount / finalResults.length) * 100 : 0;
          const totalReliability = finalResults.reduce((acc, r) => acc + r.reliabilityScore, 0);
          const averageReliability = finalResults.length > 0 ? totalReliability / finalResults.length : 0;
          const ratingDistribution = finalResults.reduce<{[key in Rating]?: number}>((acc, item) => {
              acc[item.rating] = (acc[item.rating] || 0) + 1;
              return acc;
          }, {});
          
          const uploadSummaryData: Omit<UploadSummary, 'id' | 'uploadDate'> = {
              fileName: currentFileName, 
              rowCount: finalResults.length, 
              matchPercentage,
              averageReliability, 
              ratingDistribution, 
              commonIssues: [],
              fullResults: finalResults,
              columnMapping: columnMapping,
              originalHeaders: originalHeaders
          };
  
          const newHistory = await saveUploadToHistory(uploadSummaryData);
          setUploadHistory(newHistory);
          if (newHistory.length > 0) {
            setCurrentUploadId(newHistory[0].id);
          }
        } catch (persistErr) {
          console.warn("Could not save to history, but showing results anyway.", persistErr);
        }
        
        setAnalyzerState('results');
    } catch (err: any) {
        if (err.name === 'AbortError') return;
        setError(`Analysis error: ${err.message}`);
        setAnalyzerState('audit'); 
    }
  }, [originalData, currentFileName, originalHeaders, columnMapping]);

  const handleCancelAnalysis = useCallback(() => {
    if (analysisAbortController.current) analysisAbortController.current.abort();
    setAnalyzerState('audit');
    setError(null);
  }, []);

  const handleViewHistoricalResults = (summary: UploadSummary) => {
    if (summary.fullResults && summary.columnMapping && summary.originalHeaders) {
      const filteredHeaders = summary.originalHeaders.filter(h => {
        const low = h.toLowerCase();
        return !low.includes('supplier') && !low.includes('product name') && !low.includes('volume');
      });

      const resultsWithIds = summary.fullResults?.map((r, i) => ({
        ...r,
        rowId: r.rowId || `row-hist-${summary.id}-${i}`
      })) || [];

      setResults(resultsWithIds);
      setDisplayResults(resultsWithIds);
      setDisplayHeaders(filteredHeaders);
      setColumnMapping(summary.columnMapping);
      setCurrentFileName(summary.fileName);
      setCurrentUploadId(summary.id);
      
      const mappedHeaders = Object.values(summary.columnMapping).filter(h => h && h !== 'N/A' && filteredHeaders.includes(h)) as string[];
      setVisibleColumns(new Set([...mappedHeaders, 'uniqueId', 'rating', 'reliabilityScore']));
      
      setView('analyzer');
      setAnalyzerState('results');
      setResultsViewMode('table');
    } else {
      setError("Historical data not found.");
    }
  };

  const handleUpdateResult = useCallback(async (rowId: string, newUniqueId: string) => {
     if (!results) return;
     const index = results.findIndex(r => r.rowId === rowId);
     if (index === -1) return;

     const updatedResults = [...results];
     updatedResults[index] = { ...updatedResults[index], isUpdating: true, uniqueId: newUniqueId };
     setResults(updatedResults);
     setDisplayResults(updatedResults);

     try {
         const originalItem = updatedResults[index];
         const originalAIResult = {
             uniqueId: results[index].uniqueId,
             rating: results[index].rating,
             reliabilityScore: results[index].reliabilityScore,
             notes: results[index].notes,
             evidence: results[index].evidence
         };

         const updatedAnalysis = await updateAnalysisForId(originalItem, newUniqueId);
         
         const updatedItem: SeafoodResultItem = { 
           ...originalItem, 
           ...updatedAnalysis, 
           isUpdating: false, 
           isManual: true,
           needsReview: false,
         };

         // Log correction
         UserCorrectionService.logCorrection(
           originalItem,
           originalAIResult,
           { uniqueId: updatedItem.uniqueId, rating: updatedItem.rating, notes: updatedItem.notes }
         );

         setResults(prevResults => {
           if (!prevResults) return null;
           const finalResults = [...prevResults];
           const finalIndex = finalResults.findIndex(r => r.rowId === rowId);
           if (finalIndex === -1) return finalResults;

           finalResults[finalIndex] = updatedItem;
           
           // Persist to history
           if (currentUploadId) {
             updateHistoryItemResults(currentUploadId, finalResults).then(newHistory => {
               setUploadHistory(newHistory);
             });
           }
           
           return finalResults;
         });

         setDisplayResults(prevDisplay => {
           if (!prevDisplay) return null;
           const finalDisplay = [...prevDisplay];
           const finalIndex = finalDisplay.findIndex(r => r.rowId === rowId);
           if (finalIndex === -1) return finalDisplay;

           finalDisplay[finalIndex] = updatedItem;
           return finalDisplay;
         });

         // Update active filter if exists
         if (activeFilter) {
           setActiveFilter(prev => {
             if (!prev) return null;
             const newData = [...prev.data];
             const filterIndex = newData.findIndex(item => item.rowId === rowId);
             if (filterIndex !== -1) {
               newData[filterIndex] = updatedItem;
             }
             return { ...prev, data: newData };
           });
         }
     } catch (err) {
         setError("Failed to update record.");
     }
  }, [results, currentUploadId, activeFilter, currentUser]);

  const handleSaveAssignment = useCallback(async (rowId: string, newUniqueId: string) => {
    if (!results) return;
    
    // First, update the ID if it's different from current
    const index = results.findIndex(r => r.rowId === rowId);
    if (index === -1) return;

    const currentItem = results[index];
    
    // If ID is different, we need to update first
    if (currentItem.uniqueId !== newUniqueId) {
      await handleUpdateResult(rowId, newUniqueId);
    }

    // Now mark as verified
    setResults(prevResults => {
      if (!prevResults) return null;
      const finalResults = [...prevResults];
      const finalIndex = finalResults.findIndex(r => r.rowId === rowId);
      if (finalIndex === -1) return finalResults;

      const currentItem = finalResults[finalIndex];

      const verifiedItem = { 
        ...currentItem, 
        isVerified: true,
        needsReview: false,
      };
      finalResults[finalIndex] = verifiedItem;
      
      // Save to training data
      saveTrainingExample(verifiedItem);

      // Persist to history
      if (currentUploadId) {
        updateHistoryItemResults(currentUploadId, finalResults).then(newHistory => {
          setUploadHistory(newHistory);
        });
      }
      
      return finalResults;
    });

    setDisplayResults(prevDisplay => {
      if (!prevDisplay) return null;
      const finalDisplay = [...prevDisplay];
      const finalIndex = finalDisplay.findIndex(r => r.rowId === rowId);
      if (finalIndex === -1) return finalDisplay;

      finalDisplay[finalIndex] = { ...finalDisplay[finalIndex], isVerified: true };
      return finalDisplay;
    });

    // Update active filter if exists
    if (activeFilter) {
      setActiveFilter(prev => {
        if (!prev) return null;
        const newData = [...prev.data];
        const filterIndex = newData.findIndex(item => item.rowId === rowId);
        if (filterIndex !== -1) {
          newData[filterIndex] = { ...newData[filterIndex], isVerified: true };
        }
        return { ...prev, data: newData };
      });
    }
  }, [results, currentUploadId, activeFilter, handleUpdateResult]);

  const handleExport = useCallback(() => {
    if (!results || displayHeaders.length === 0) return;
    
    const worker = new Worker(new URL('./workers/analysis.worker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (event) => {
      const { type, payload } = event.data;
      
      if (type === 'GENERATE_CSV_SUCCESS') {
        const { csvContent } = payload;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${currentFileName.replace(/\.[^/.]+$/, "")}_analyzed.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        worker.terminate();
      }
      
      if (type === 'ERROR') {
        setError(`Export error: ${payload}`);
        worker.terminate();
      }
    };

    worker.postMessage({
      type: 'GENERATE_CSV',
      payload: { results, displayHeaders }
    });
  }, [results, displayHeaders, currentFileName]);

  if (!currentUser) return <Login onLogin={handleLogin} />;
  
  const renderContent = () => {
    if (view === 'users' && currentUser.role === 'admin') return <UserManagement />;

    if (view === 'dashboard' || (view === 'analyzer' && analyzerState === 'results')) {
      // If we're in analyzer-results, the ResultsTable handles the back button to dash
      if (view === 'dashboard') {
        return (
            <div className="animate-fade-in-up">
                <Dashboard 
                  history={uploadHistory} 
                  onAnalyzeNew={() => { resetAnalyzerState(); setView('analyzer'); }} 
                  onViewResults={handleViewHistoricalResults}
                  userRole={currentUser.role}
                />
            </div>
        );
      }
    }
    
    return (
      <div className="animate-fade-in-up">
        {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative my-6 max-w-4xl mx-auto">
              <strong>Error:</strong><span className="ml-2">{error}</span>
            </div>
        )}
        {analyzerState === 'upload' && <FileUpload onProcessFile={handleProcessFile} isLoading={false} />}
        {analyzerState === 'preview' && <DataPreview isAnalyzing={isPreviewLoading} sheetNames={sheetNames} selectedSheet={selectedSheet} onSheetChange={handleSheetChange} headerRowIndex={headerRowIndex} onHeaderRowChange={handleHeaderRowChange} previewData={previewData} onConfirm={handleConfirmPreview} onCancel={resetAnalyzerState} warning={previewWarning}/>}
        {analyzerState === 'mapping' && originalHeaders.length > 0 && <ColumnMapper fileHeaders={originalHeaders} mappableFields={MAPPABLE_FIELDS} originalData={originalData || []} onConfirm={handleConfirmMapping} onCancel={() => setAnalyzerState('preview')}/>}
        {analyzerState === 'audit' && auditReport && <DataQualityAudit report={auditReport} onConfirm={handleStartAnalysis} onBack={() => setAnalyzerState('mapping')} />}
        {analyzerState === 'loading' && <Loader progress={progress} onCancel={handleCancelAnalysis} />}
        {analyzerState === 'results' && results && displayResults && (
          <div className="flex flex-col items-center space-y-6">
            <div className="flex justify-center p-1 bg-gray-200 rounded-lg">
              <button onClick={() => setResultsViewMode('table')} className={`px-4 py-2 text-sm font-semibold rounded-md ${resultsViewMode === 'table' ? 'bg-white shadow text-gray-800' : 'text-gray-600'}`}>Table</button>
              <button onClick={() => setResultsViewMode('review')} className={`px-4 py-2 text-sm font-semibold rounded-md ${resultsViewMode === 'review' ? 'bg-white shadow text-gray-800' : 'text-gray-600'}`}>
                Review Queue
                {results.filter(r => r.needsReview).length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                    {results.filter(r => r.needsReview).length}
                  </span>
                )}
              </button>
              <button onClick={() => setResultsViewMode('charts')} className={`px-4 py-2 text-sm font-semibold rounded-md ${resultsViewMode === 'charts' ? 'bg-white shadow text-gray-800' : 'text-gray-600'}`}>Charts</button>
            </div>
            <div className="w-full max-w-7xl">
              {resultsViewMode === 'table' ? (
                <ResultsTable 
                    results={activeFilter ? activeFilter.data : displayResults} 
                    originalHeaders={displayHeaders} 
                    columnMapping={columnMapping}
                    onExport={handleExport}
                    filterTitle={activeFilter?.title}
                    onClearFilter={() => setActiveFilter(null)}
                    visibleColumns={visibleColumns}
                    onVisibleColumnsChange={setVisibleColumns}
                    onUpdateResult={handleUpdateResult}
                    onSaveAssignment={handleSaveAssignment}
                />
              ) : resultsViewMode === 'review' ? (
                <ReviewQueue 
                  items={results.filter(r => r.needsReview)} 
                  onApprove={handleSaveAssignment}
                  onCorrect={handleUpdateResult}
                  columnMapping={columnMapping}
                />
              ) : (
                <ChartsView results={results} columnMapping={columnMapping} onSegmentClick={(t, d) => { setModalFilterData({title: t, data: d}); setIsFilterModalOpen(true); }} />
              )}
            </div>
            <button onClick={() => setView('dashboard')} className="px-6 py-2 font-semibold text-white bg-[#00629B] rounded-md hover:bg-[#00497b]">Back to Dashboard</button>
          </div>
        )}
         <Modal isOpen={isFilterModalOpen} onClose={() => setIsFilterModalOpen(false)} onConfirm={() => { if(modalFilterData) setActiveFilter(modalFilterData); setResultsViewMode('table'); setIsFilterModalOpen(false); }} title="View Filtered Data">
            <p>Would you like to see the {modalFilterData?.data.length} items for "{modalFilterData?.title}" in the data table?</p>
         </Modal>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans flex flex-col">
      {/* Top Branding Bar with Integrated Title/Description - COMPACT VERSION */}
      <nav className="bg-[#00629B] text-white shadow-md z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex flex-col">
                <h1 className="text-2xl font-extrabold text-white tracking-tight leading-tight">
                  Seafood Watch Sust-AI-nability Analyzer
                </h1>
                <p className="text-blue-100 text-xs mt-1 opacity-90 hidden sm:block">
                  Evaluate the eco-friendliness of seafood products with this AI-powered Seafood Watch tool.
                </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:flex flex-col items-end">
                <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest leading-none">{currentUser.role}</span>
                <span className="text-sm font-medium">{currentUser.username}</span>
              </div>
              <div className="h-6 w-px bg-white/20 hidden sm:block"></div>
              {currentUser.role === 'admin' && (
                <button 
                  onClick={() => UserCorrectionService.downloadCorrections()}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all text-white border border-white/20"
                  title="Download User Corrections Catalog"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              )}
              <button 
                onClick={handleLogout} 
                className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1 rounded transition-all flex items-center gap-2 border border-white/20"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Tab Navigation Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-6">
          <div className="flex items-center space-x-8">
            <button 
              onClick={() => { setView('dashboard'); resetAnalyzerState(); }}
              className={`py-4 text-sm font-bold border-b-2 transition-all duration-200 flex items-center gap-2 ${view === 'dashboard' || (view === 'analyzer' && analyzerState === 'results') ? 'border-[#00629B] text-[#00629B]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Results Dashboard
            </button>
            
            <button 
              onClick={() => { setView('analyzer'); resetAnalyzerState(); }}
              className={`py-4 text-sm font-bold border-b-2 transition-all duration-200 flex items-center gap-2 ${view === 'analyzer' && analyzerState !== 'results' ? 'border-[#00629B] text-[#00629B]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              New Analysis
            </button>

            {currentUser.role === 'admin' && (
              <button 
                onClick={() => setView('users')}
                className={`py-4 text-sm font-bold border-b-2 transition-all duration-200 flex items-center gap-2 ${view === 'users' ? 'border-[#00629B] text-[#00629B]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Manage Users
              </button>
            )}
          </div>
        </div>
      </div>
      
      <main className="container mx-auto p-4 sm:p-6 md:p-8 flex-grow bg-gray-50/30">
        {renderContent()}
      </main>

      <footer className="text-center py-6 text-gray-400 text-xs border-t bg-white">
        <p>&copy; {new Date().getFullYear()} Monterey Bay Aquarium Seafood Watch Program • Partner Portal</p>
        <p className="mt-1 opacity-60 italic">AI-Powered Sourcing Intelligence</p>
      </footer>
    </div>
  );
};

export default App;
