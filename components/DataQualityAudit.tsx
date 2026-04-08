
import React from 'react';
import { AuditReport, AuditIssue } from '../services/dataAuditService';

interface DataQualityAuditProps {
  report: AuditReport;
  onBack: () => void;
  onConfirm: () => void;
}

const IssueIcon: React.FC<{ type: AuditIssue['type'] }> = ({ type }) => {
  if (type === 'critical') {
    return (
      <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  if (type === 'warning') {
    return (
      <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return (
    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
};

const DataQualityAudit: React.FC<DataQualityAuditProps> = ({ report, onBack, onConfirm }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-100 border-green-200';
    if (score >= 60) return 'bg-yellow-100 border-yellow-200';
    return 'bg-red-100 border-red-200';
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-lg border border-gray-200">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Data Quality Audit</h2>
        <p className="text-gray-600">
            We've analyzed your column mapping and dataset structure. 
            Review the findings below before proceeding to analysis.
        </p>
      </div>

      <div className={`flex flex-col md:flex-row items-center justify-between p-6 rounded-lg border mb-8 ${getScoreBg(report.overallScore)}`}>
        <div className="flex-1 mb-4 md:mb-0">
            <h3 className="text-lg font-bold text-gray-800">Predicted Match Reliability</h3>
            <p className="text-gray-700 text-sm mt-1">
                Based on the completeness of your data and mapping.
            </p>
        </div>
        <div className="flex items-center">
             <div className="relative h-20 w-20 flex items-center justify-center rounded-full bg-white shadow-sm border-4 border-current" style={{ color: report.overallScore >= 80 ? '#16a34a' : report.overallScore >= 60 ? '#ca8a04' : '#dc2626' }}>
                <span className={`text-2xl font-bold ${getScoreColor(report.overallScore)}`}>{report.overallScore}</span>
             </div>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-xl font-bold text-gray-800 border-b pb-2">Identified Issues</h3>
        
        {report.issues.length === 0 ? (
            <div className="flex items-center justify-center p-8 bg-green-50 rounded-lg border border-green-100">
                <svg className="w-8 h-8 text-green-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-green-800 font-medium">No data quality issues found! Your dataset looks great.</p>
            </div>
        ) : (
            <ul className="space-y-4">
                {report.issues.map((issue, idx) => (
                    <li key={idx} className="flex items-start bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="flex-shrink-0 mt-1 mr-4">
                            <IssueIcon type={issue.type} />
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800 text-base">{issue.title}</h4>
                            <p className="text-gray-600 text-sm mt-1">{issue.description}</p>
                            {issue.affectedRows !== undefined && (
                                <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-200 rounded">
                                    {issue.affectedRows} rows affected
                                </span>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        )}
      </div>

      <div className="mt-10 flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6">
        <p className="text-sm text-gray-500 italic order-2 sm:order-1">
            {report.totalRows} total rows found in dataset.
        </p>
        <div className="flex gap-4 order-1 sm:order-2 w-full sm:w-auto">
            <button
            onClick={onBack}
            className="flex-1 sm:flex-none px-6 py-2 font-semibold text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none transition-colors duration-200"
            >
            Adjust Mapping
            </button>
            <button
            onClick={onConfirm}
            className="flex-1 sm:flex-none px-6 py-2 font-semibold text-white bg-[#00629B] rounded-md hover:bg-[#00497b] focus:outline-none transition-colors duration-200"
            >
            Proceed to Match Ratings
            </button>
        </div>
      </div>
    </div>
  );
};

export default DataQualityAudit;
