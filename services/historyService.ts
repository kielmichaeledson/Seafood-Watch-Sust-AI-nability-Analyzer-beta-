
import { UploadSummary } from '../types';
import { getHistory, saveHistory, deleteHistory } from './dbService';

const MAX_HISTORY_ITEMS = 10;

export async function getUploadHistory(): Promise<UploadSummary[]> {
  try {
    const history = await getHistory();
    // Sort by date descending
    return history
      .map(h => ({
        ...h.summary,
        id: h.id,
        uploadDate: new Date(h.timestamp).toISOString(),
        fullResults: h.results
      }))
      .sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
      .slice(0, MAX_HISTORY_ITEMS);
  } catch (error) {
    console.error('Failed to get history from IndexedDB', error);
    return [];
  }
}

export async function saveUploadToHistory(newSummary: Omit<UploadSummary, 'id' | 'uploadDate'>): Promise<UploadSummary[]> {
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  const timestamp = Date.now();
  
  const { fullResults, ...summaryOnly } = newSummary;

  const historyItem = {
    id,
    timestamp,
    fileName: newSummary.fileName,
    rowCount: newSummary.rowCount,
    results: fullResults || [],
    summary: summaryOnly
  };

  try {
    await saveHistory(historyItem);
  } catch (error) {
    console.error('Failed to save history to IndexedDB', error);
  }

  return getUploadHistory();
}

export async function updateHistoryItemResults(id: string, updatedResults: any[]): Promise<UploadSummary[]> {
  try {
    const allHistory = await getHistory();
    const item = allHistory.find(h => h.id === id);
    
    if (!item) return getUploadHistory();

    // Recalculate metrics based on updated results
    const matchedCount = updatedResults.filter(r => r.rating !== 'N/A').length;
    const matchPercentage = updatedResults.length > 0 ? (matchedCount / updatedResults.length) * 100 : 0;
    const totalReliability = updatedResults.reduce((acc, r) => acc + (r.reliabilityScore || 0), 0);
    const averageReliability = updatedResults.length > 0 ? totalReliability / updatedResults.length : 0;
    const ratingDistribution = updatedResults.reduce<any>((acc, item) => {
        acc[item.rating] = (acc[item.rating] || 0) + 1;
        return acc;
    }, {});

    const updatedSummary = {
      ...item.summary,
      matchPercentage,
      averageReliability,
      ratingDistribution
    };

    const updatedItem = {
      ...item,
      results: updatedResults,
      summary: updatedSummary
    };

    await saveHistory(updatedItem);
  } catch (error) {
    console.error('Failed to update history in IndexedDB', error);
  }

  return getUploadHistory();
}
