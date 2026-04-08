
import { SeafoodInputItem } from '../types';

export interface AuditIssue {
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  affectedRows?: number;
}

export interface AuditReport {
  overallScore: number; // 0-100
  issues: AuditIssue[];
  totalRows: number;
  skippableRows: number;
}

const CRITICAL_FIELDS = ['Common name', 'Wild or Farmed', 'Source country'];
const RECOMMENDED_FIELDS = ['Scientific name', 'Production Method', 'Subnational area'];

export function performDataAudit(
  data: SeafoodInputItem[],
  mapping: Record<string, string>
): AuditReport {
  const issues: AuditIssue[] = [];
  const totalRows = data.length;
  let score = 100;
  let skippableRows = 0;

  // 1. Check for Unmapped Critical Fields
  CRITICAL_FIELDS.forEach(field => {
    if (!mapping[field] || mapping[field] === 'N/A') {
      issues.push({
        type: 'critical',
        title: `Missing Critical Column: ${field}`,
        description: `The '${field}' column is not mapped. This is essential for accurate Seafood Watch ratings. Without it, matching reliability will be significantly lower.`,
      });
      score -= 25;
    }
  });

  // 2. Check for Unmapped Recommended Fields
  RECOMMENDED_FIELDS.forEach(field => {
    if (!mapping[field] || mapping[field] === 'N/A') {
      issues.push({
        type: 'warning',
        title: `Missing Recommended Column: ${field}`,
        description: `Mapping '${field}' helps distinguish between similar species or ratings and improves matching accuracy.`,
      });
      score -= 10;
    }
  });

  // 3. Row-level analysis
  const missingValues: Record<string, number> = {};
  const commonNameHeader = mapping['Common name'];

  data.forEach(row => {
    // Check for empty common name (these are usually skipped or fatal)
    if (commonNameHeader && commonNameHeader !== 'N/A') {
        const val = row[commonNameHeader];
        if (val === undefined || val === null || String(val).trim() === '') {
            skippableRows++;
        }
    }

    // Check missing critical values in other mapped fields
    CRITICAL_FIELDS.forEach(field => {
       if (field === 'Common name') return; // Handled above
       const header = mapping[field];
       if (header && header !== 'N/A') {
           const val = row[header];
           if (val === undefined || val === null || String(val).trim() === '') {
               missingValues[field] = (missingValues[field] || 0) + 1;
           }
       }
    });
  });

  if (skippableRows > 0) {
      issues.push({
          type: 'critical',
          title: 'Missing Common Names',
          description: `${skippableRows} rows are missing a 'Common name' value. These rows cannot be analyzed and will be skipped.`,
          affectedRows: skippableRows
      });
      // Heavy penalty for missing names
      score -= Math.min(30, (skippableRows / totalRows) * 50); 
  }

  // Add issues for missing row values in other critical fields
  Object.entries(missingValues).forEach(([field, count]) => {
      const pct = (count / totalRows) * 100;
      if (pct > 5) { // Only report if > 5% are missing
          const type = pct > 20 ? 'critical' : 'warning';
          issues.push({
              type,
              title: `Incomplete Data: ${field}`,
              description: `${count} rows (${pct.toFixed(0)}%) are missing values for '${field}'. This may lead to 'N/A' ratings for these items.`,
              affectedRows: count
          });
          score -= (pct > 20 ? 15 : 5);
      }
  });

  // Clamp score
  return {
      overallScore: Math.max(0, Math.round(score)),
      issues,
      totalRows,
      skippableRows
  };
}
