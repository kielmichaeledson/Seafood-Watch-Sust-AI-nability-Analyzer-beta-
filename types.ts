
export enum Rating {
  BestChoice = "Best Choice",
  GoodAlternative = "Good Alternative",
  Avoid = "Avoid",
  Certified = "Certified",
  NA = "N/A",
}

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  email: string;
  company: string;
  password?: string; // Storing in plain text for prototype purposes
}

export interface SeafoodInputItem {
  [key: string]: string | number | boolean | null | undefined | MatchCandidate[];
}

export interface MatchCandidate {
  uniqueId: string;
  rating: Rating;
  matchedKDEs: string;
  reliabilityScore: number;
  notes: string;
}

export interface SeafoodResultItem extends SeafoodInputItem {
  rowId: string; // Unique identifier for the row in the analysis
  rating: Rating;
  uniqueId: string;
  matchedKDEs: string;
  reliabilityScore: number;
  notes: string;
  isUpdating?: boolean; // Used for UI loading state during manual edits
  isManual?: boolean; // Flag to indicate if the result was manually remapped
  isVerified?: boolean; // Flag to indicate if the user has locked in/confirmed the assignment
  needsReview?: boolean; // Flag for the confidence-based review queue
  candidates?: MatchCandidate[]; // Potential matches for the user to choose from
}

export interface UploadSummary {
  id: string;
  fileName: string;
  uploadDate: string; // ISO string
  rowCount: number;
  matchPercentage: number;
  averageReliability: number;
  ratingDistribution: { [key in Rating]?: number };
  commonIssues: { issue: string; count: number }[];
  // Extended for persistence
  fullResults?: SeafoodResultItem[];
  columnMapping?: Record<string, string>;
  originalHeaders?: string[];
}
