
import { UserCorrection, SeafoodResultItem, Rating } from '../types';

let corrections: UserCorrection[] = [];

export const UserCorrectionService = {
  logCorrection: (
    originalInput: any,
    originalAIResult: { uniqueId: string; rating: Rating; reliabilityScore: number; notes: string; evidence?: string },
    userCorrection: { uniqueId: string; rating: Rating; notes: string }
  ) => {
    const correction: UserCorrection = {
      timestamp: new Date().toISOString(),
      originalInput,
      originalAIResult,
      userCorrection
    };
    
    corrections.push(correction);
    console.log('Correction logged:', correction);
    
    // In a real app, this would persist to a database or local storage
    localStorage.setItem('seafood_corrections_catalog', JSON.stringify(corrections));
  },

  getCorrections: (): UserCorrection[] => {
    if (corrections.length === 0) {
      const saved = localStorage.getItem('seafood_corrections_catalog');
      if (saved) {
        try {
          corrections = JSON.parse(saved);
        } catch (e) {
          console.error('Failed to load corrections from localStorage', e);
        }
      }
    }
    return corrections;
  },

  clearCorrections: () => {
    corrections = [];
    localStorage.removeItem('seafood_corrections_catalog');
  },

  downloadCorrections: () => {
    const data = UserCorrectionService.getCorrections();
    if (data.length === 0) {
      alert('No corrections to download.');
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `seafood_corrections_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
