
import * as XLSX from 'xlsx';

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'PARSE_FILE') {
    try {
      const { data, options } = payload;
      const workbook = XLSX.read(data, options);
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
      const { data, options, sheetName, headerRowIndex, limit } = payload;
      const workbook = XLSX.read(data, options);
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found.`);
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
          sheetName
        } 
      });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  }

  if (type === 'TRANSFORM_DATA') {
    try {
      const { dataAsArray, headerRowIndex } = payload;
      
      if (dataAsArray.length < headerRowIndex) {
          throw new Error(`Header row ${headerRowIndex} not found.`);
      }

      const rawHeaders: string[] = dataAsArray[headerRowIndex - 1].map((header: any) => String(header).trim());
      const headers: string[] = [];
      const counts: Record<string, number> = {};

      for (const header of rawHeaders) {
          if (!header) { headers.push(''); continue; }
          counts[header] = (counts[header] || 0) + 1;
          headers.push(counts[header] > 1 ? `${header} (${counts[header]})` : header);
      }

      const jsonData = dataAsArray.slice(headerRowIndex).map((row: any[]) => {
          const rowObject: any = {};
          headers.forEach((header, index) => {
              if(header) rowObject[header] = row[index];
          });
          return rowObject;
      }).filter((obj: any) => Object.keys(obj).length > 0);

      self.postMessage({ 
        type: 'TRANSFORM_DATA_SUCCESS', 
        payload: { jsonData, headers: headers.filter(h => h) } 
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
