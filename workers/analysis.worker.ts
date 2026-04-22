
import * as XLSX from 'xlsx';

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'PARSE_FILE') {
    try {
      const { data, options } = payload;
      const workbook = XLSX.read(new Uint8Array(data as ArrayBuffer), options);
      const sheetNames = workbook.SheetNames;
      
      self.postMessage({ 
        type: 'PARSE_FILE_SUCCESS', 
        payload: { 
          sheetNames,
        } 
      });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  }

  if (type === 'GET_SHEET_DATA') {
    try {
      const { data, options, sheetName, limit } = payload;
      // SheetJS can auto-detect the format from a Uint8Array
      const workbook = XLSX.read(new Uint8Array(data as ArrayBuffer), options);
      
      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("Could not parse workbook or no sheets found.");
      }

      // For CSV/single-sheet files, if the requested sheet isn't found, try the first one
      let worksheet = workbook.Sheets[sheetName];
      if (!worksheet && workbook.SheetNames.length > 0) {
        worksheet = workbook.Sheets[workbook.SheetNames[0]];
      }
      
      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found in workbook.`);
      }

      const dataAsArray: any[][] = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, 
        defval: '', 
        blankrows: false 
      });
      
      const resultData = limit ? dataAsArray.slice(0, limit) : dataAsArray;

      self.postMessage({ 
        type: 'GET_SHEET_DATA_SUCCESS', 
        payload: { 
          dataAsArray: resultData,
          sheetName: workbook.Sheets[sheetName] ? sheetName : workbook.SheetNames[0]
        } 
      });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  }

  if (type === 'TRANSFORM_DATA') {
    try {
      const { dataAsArray, headerRowIndex } = payload;
      
      if (!dataAsArray || dataAsArray.length === 0) {
        throw new Error("Internal error: No data received for transformation.");
      }

      if (dataAsArray.length < headerRowIndex) {
          throw new Error(`The spreadsheet has only ${dataAsArray.length} rows, but header row ${headerRowIndex} was selected.`);
      }

      const headerRow = dataAsArray[headerRowIndex - 1];
      if (!headerRow || !Array.isArray(headerRow)) {
        throw new Error("Invalid header row structure.");
      }

      const rawHeaders: string[] = headerRow.map((header: any) => String(header || '').trim());
      const headers: string[] = [];
      const counts: Record<string, number> = {};

      for (const header of rawHeaders) {
          // Fallback for empty headers to ensure we can still access the data by index if needed
          const entry = header || `Column ${headers.length + 1}`;
          counts[entry] = (counts[entry] || 0) + 1;
          headers.push(counts[entry] > 1 ? `${entry} (${counts[entry]})` : entry);
      }

      const jsonData = dataAsArray.slice(headerRowIndex).map((row: any[]) => {
          const rowObject: any = {};
          headers.forEach((header, index) => {
              if (header) {
                const val = row[index];
                rowObject[header] = val !== undefined && val !== null ? val : '';
              }
          });
          return rowObject;
      }).filter((obj: any) => {
        // Only keep rows that have at least one non-empty value
        return Object.values(obj).some(v => String(v).trim() !== '');
      });

      if (headers.length === 0) {
        throw new Error("No headers identified in the selected row.");
      }

      self.postMessage({ 
        type: 'TRANSFORM_DATA_SUCCESS', 
        payload: { jsonData, headers } 
      });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  }

  if (type === 'GENERATE_CSV') {
    try {
      const { results, displayHeaders } = payload;
      
      const headers = [...displayHeaders, 'Unique ID', 'Matched KDEs', 'Rating', 'Reliability Score', 'Notes']
          .map(h => `"${String(h).replace(/"/g, '""')}"`);

      const csvRows = [headers.join(',')];
      
      for (const row of results) {
          const originalValues = displayHeaders.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`);
          const analysisValues = [row.uniqueId, row.matchedKDEs, row.rating, row.reliabilityScore, row.notes]
            .map(v => `"${String(v || '').replace(/"/g, '""')}"`);
          csvRows.push([...originalValues, ...analysisValues].join(','));
      }

      const csvContent = csvRows.join('\n');
      
      self.postMessage({ 
        type: 'GENERATE_CSV_SUCCESS', 
        payload: { csvContent } 
      });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  }
};
