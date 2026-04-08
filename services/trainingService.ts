
import { SeafoodResultItem } from '../types';

const TRAINING_DATA_KEY = 'seafood_training_data';

export interface TrainingExample {
  inputData: Record<string, any>;
  assignedId: string;
  timestamp: string;
}

export const saveTrainingExample = (item: SeafoodResultItem) => {
  try {
    const existingData = localStorage.getItem(TRAINING_DATA_KEY);
    const trainingData: TrainingExample[] = existingData ? JSON.parse(existingData) : [];
    
    // Extract only the input fields (original data) for training
    // We exclude analysis fields like rating, uniqueId, matchedKDEs, etc.
    const inputData: Record<string, any> = {};
    const excludeKeys = ['rowId', 'rating', 'uniqueId', 'matchedKDEs', 'reliabilityScore', 'notes', 'isUpdating', 'isManual', 'isVerified', '_originalIndex'];
    
    Object.keys(item).forEach(key => {
      if (!excludeKeys.includes(key)) {
        inputData[key] = item[key];
      }
    });

    const newExample: TrainingExample = {
      inputData,
      assignedId: item.uniqueId,
      timestamp: new Date().toISOString()
    };

    trainingData.push(newExample);
    localStorage.setItem(TRAINING_DATA_KEY, JSON.stringify(trainingData));
    
    console.log('Training example saved:', newExample);
  } catch (error) {
    console.error('Error saving training example:', error);
  }
};

export const getTrainingDataCount = (): number => {
  try {
    const existingData = localStorage.getItem(TRAINING_DATA_KEY);
    return existingData ? JSON.parse(existingData).length : 0;
  } catch {
    return 0;
  }
};
