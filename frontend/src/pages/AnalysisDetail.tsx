import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Editor } from '@monaco-editor/react';
import {
  GitBranch,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  FileCode,
  Shield,
  Zap,
  Wrench,
  Search,
  Filter,
  Download,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react';
import { useAnalysis, useAnalysisFindings, useAnalysisRefactorProposals, useRetryAnalysis, useDeleteAnalysis } from '../hooks/useApi';
import { useUIStore } from '../hooks/useStore';
import { cn, formatRelativeTime, formatNumber, getSeverityBadgeClass, parseDiff } from '../utils/helpers';
import { Analysis, AnalysisStatus, Finding, FindingSeverity, RefactorProposal } from '../types';

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const severityColors: Record<FindingSeverity, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  info: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',
};

export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>();
  const { analysis, isLoading, refetch } = useAnalysis(id!);
  const { findings, isLoading: findingsLoading, refetch: refetchFindings } = useAnalysisFindings(id!);
  const { proposals, isLoading: proposalsLoading } = useAnalysisRefactorProposals(id!);
  const retryMutation = useRetryAnalysis();
  const deleteMutation = useDeleteAnalysis();
  const { addNotification, globalLoading, setGlobalLoading, diffViewMode, setDiffViewMode } = useUIStore();

  const [activeTab, setActiveTab] = useState<'summary' | 'findings' | 'proposals'>('summary');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<RefactorProposal | null>(null);
  const [findingFilters, setFindingFilters] = useState({ severity: '', category: '', search: '' });

  const handleRetry = async () => {
    if (!analysis) return;
    setGlobalLoading(true);
    try {
      await retryMutation.mutateAsync(analysis.id);
      addNotification({ type: 'success', message: 'Analysis queued for retry' });
      refetch();
      refetchFindings();
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to retry analysis' });
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!analysis || !window.confirm('Are you sure you want to delete this analysis? This cannot be undone.')) return;
    try {
      await deleteMutation.mutateAsync(analysis.id);
      addNotification({ type: 'success', message: 'Analysis deleted' });
      window.history.back();
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to delete analysis' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="text-center p-12">
        <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-dark-900 dark:text-white">Analysis not found</h2>
        <Link to="/repositories" className="btn-primary mt-4 inline-block">Back to Repositories</Link>
      </div>
    );
  }

  const getStatusColor = (status: AnalysisStatus) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'running': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse';
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'cancelled': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: AnalysisStatus) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'running': return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'failed': return <AlertCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const filteredFindings = findings?.findings
    ?.filter(f => {
      if (findingFilters.severity && f.severity !== findingFilters.severity) return false;
      if (findingFilters.category && f.category !== findingFilters.category) return false;
      if (findingFilters.search) {
        const search = findingFilters.search.toLowerCase();
        if (!f.message.toLowerCase().includes(search) &&
            !f.file_path.toLowerCase().includes(search) &&
            !f.rule_name.toLowerCase().includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]) || [];

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={cn('p-3 rounded-xl', getStatusColor(analysis.status))}>
            {getStatusIcon(analysis.status)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-dark-900 dark:text-white">
                {analysis.trigger_type === 'webhook' ? `PR #${analysis.github_pr_number}` : 'Full Repository Scan'}
              </h1>
              <span className={cn('badge', getStatusColor(analysis.status))}>
                {getStatusIcon(analysis.status)} {analysis.status}
              </span>
            </div>
            <p className="text-dark-500 dark:text-dark-400 mt-1">
              Repository: {analysis.repository?.full_name || 'Unknown'} • {formatRelativeTime(analysis.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          {analysis.status === 'failed' && (
            <button onClick={handleRetry} disabled={retryMutation.isPending} className="btn-secondary">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          )}
          <button onClick={handleDelete} disabled={deleteMutation.isPending} className="btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            <AlertCircle className="w-4 h-4" /> Delete
          </button>
          <button onClick={() => { refetch(); refetchFindings(); }} className="btn-secondary">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard title="Total Findings" value={analysis.total_findings} icon={<AlertTriangle className="w-6 h-6" />} color="orange" />
        <SummaryCard title="Critical" value={analysis.critical_findings} icon={<AlertCircle className="w-6 h-6" />} color="red" />
        <SummaryCard title="High" value={analysis.high_findings} icon={<AlertTriangle className="w-6 h-6" />} color="orange" />
        <SummaryCard title="Medium" value={analysis.medium_findings} icon={<Zap className="w-6 h-6" />} color="yellow" />
        <SummaryCard title="Low/Info" value={analysis.low_findings + analysis.info_findings} icon={<FileCode className="w-6 h-6" />} color="blue" />
      </div>

      {/* Technical Debt & Maintainability */}
      {(analysis.technical_debt_score !== null || analysis.maintainability_index !== null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {analysis.technical_debt_score !== null && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-dark-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" /> Technical Debt Score
                </h3>
                <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">{analysis.technical_debt_score.toFixed(1)}</span>
              </div>
              <div className="h-4 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(analysis.technical_debt_score, 100)}%` }}
                />
              </div>
              <p className="text-sm text-dark-500 dark:text-dark-400 mt-2">Lower is better (0-100)</p>
            </div>
          )}
          {analysis.maintainability_index !== null && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-dark-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-600" /> Maintainability Index
                </h3>
                <span className="text-2xl font-bold text-green-600 dark:text-green-400">{analysis.maintainability_index.toFixed(1)}</span>
              </div>
              <div className="h-4 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${analysis.maintainability_index}%` }}
                />
              </div>
              <p className="text-sm text-dark-500 dark:text-dark-400 mt-2">Higher is better (0-100)</p>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-dark-200 dark:border-dark-700">
        <nav className="flex gap-4" aria-label="Analysis tabs">
          {[
            { id: 'summary', label: 'Summary', icon: <GitBranch className="w-4 h-4" /> },
            { id: 'findings', label: `Findings (${filteredFindings.length})`, icon: <AlertTriangle className="w-4 h-4" /> },
            { id: 'proposals', label: `Refactor Proposals (${proposals?.length || 0})`, icon: <Wrench className="w-4 h-4" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-dark-500 hover:text-dark-700 dark:text-dark-400 dark:hover:text-dark-200'
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'summary' && <SummaryTab analysis={analysis} />}
      {activeTab === 'findings' && (
        <FindingsTab
          findings={filteredFindings}
          isLoading={findingsLoading}
          filters={findingFilters}
          setFilters={setFindingFilters}
          onSelect={setSelectedFinding}
        />
      )}
      {activeTab === 'proposals' && (
        <ProposalsTab
          proposals={proposals || []}
          isLoading={proposalsLoading}
          onSelect={setSelectedProposal}
        />
      )}

      {/* Finding Detail Modal */}
      {selectedFinding && (
        <FindingDetailModal
          finding={selectedFinding}
          onClose={() => setSelectedFinding(null)}
        />
      )}

      {/* Proposal Detail Modal */}
      {selectedProposal && (
        <ProposalDetailModal
          proposal={selectedProposal}
          onClose={() => setSelectedProposal(null)}
          diffViewMode={diffViewMode}
          setDiffViewMode={setDiffViewMode}
        />
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-dark-500 dark:text-dark-400">{title}</p>
          <p className="text-3xl font-bold text-dark-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className={cn('p-3 rounded-xl', colors[color] || colors.blue)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function SummaryTab({ analysis }: { analysis: Analysis }) {
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">Analysis Details</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-dark-500 dark:text-dark-400">Analysis ID</dt>
            <dd className="font-mono text-sm text-dark-900 dark:text-white">{analysis.id}</dd>
          </div>
          <div>
            <dt className="text-sm text-dark-500 dark:text-dark-400">Trigger Type</dt>
            <dd className="font-medium text-dark-900 dark:text-white capitalize">{analysis.trigger_type.replace('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-sm text-dark-500 dark:text-dark-400">PR Number</dt>
            <dd className="font-medium text-dark-900 dark:text-white">{analysis.github_pr_number || 'N/A'}</dd>
          </div>
          <div>
            <dt className="text-sm text-dark-500 dark:text-dark-400">Commit SHA</dt>
            <dd className="font-mono text-sm text-dark-900 dark:text-white">{analysis.github_commit_sha?.slice(0, 8) || 'N/A'}</dd>
          </div>
          <div>
            <dt className="text-sm text-dark-500 dark:text-dark-400">Files Analyzed</dt>
            <dd className="font-medium text-dark-900 dark:text-white">{analysis.analyzed_files} / {analysis.total_files}</dd>
          </div>
          <div>
            <dt className="text-sm text-dark-500 dark:text-dark-400">Duplication</dt>
            <dd className="font-medium text-dark-900 dark:text-white">{analysis.duplication_percentage?.toFixed(1) || 'N/A'}%</dd>
          </div>
          <div>
            <dt className="text-sm text-dark-500 dark:text-dark-400">Started</dt>
            <dd className="font-medium text-dark-900 dark:text-white">{analysis.started_at ? formatRelativeTime(analysis.started_at) : 'N/A'}</dd>
          </div>
          <div>
            <dt className="text-sm text-dark-500 dark:text-dark-400">Completed</dt>
            <dd className="font-medium text-dark-900 dark:text-white">{analysis.completed_at ? formatRelativeTime(analysis.completed_at) : 'N/A'}</dd>
          </div>
        </dl>
      </div>

      {analysis.metadata && Object.keys(analysis.metadata).length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">Metadata</h3>
          <pre className="bg-dark-100 dark:bg-dark-800 p-4 rounded-lg text-sm overflow-auto">
            {JSON.stringify(analysis.metadata, null, 2)}
          </pre>
        </div>
      )}

      {analysis.error_message && (
        <div className="card p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-400 mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Error
          </h3>
          <p className="text-red-700 dark:text-red-300">{analysis.error_message}</p>
        </div>
      )}
    </div>
  );
}

function FindingsTab({ findings, isLoading, filters, setFilters, onSelect }: {
  findings: Finding[];
  isLoading: boolean;
  filters: { severity: string; category: string; search: string };
  setFilters: React.Dispatch<React.SetStateAction<{ severity: string; category: string; search: string }>>;
  onSelect: (finding: Finding) => void;
}) {
  const categories = [...new Set(findings.map(f => f.category))].sort();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="search"
              placeholder="Search findings..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="input pl-10"
            />
          </div>
          <select
            value={filters.severity}
            onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value }))}
            className="input w-40"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
          <select
            value={filters.category}
            onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
            className="input w-48"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Findings List */}
      {findings.length === 0 ? (
        <div className="card p-12 text-center">
          <AlertTriangle className="w-16 h-16 mx-auto text-dark-300 dark:text-dark-600 mb-4" />
          <h3 className="text-lg font-medium text-dark-900 dark:text-white mb-2">No findings</h3>
          <p className="text-dark-500 dark:text-dark-400">
            {filters.severity || filters.category || filters.search
              ? 'No findings match the current filters'
              : 'This analysis found no issues'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-dark-50 dark:bg-dark-800/50 border-b border-dark-200 dark:border-dark-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Severity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Rule</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">File</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Lines</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Message</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
                {findings.map((finding) => (
                  <tr key={finding.id} className="hover:bg-dark-50 dark:hover:bg-dark-800/50 cursor-pointer" onClick={() => onSelect(finding)}>
                    <td className="px-4 py-3">
                      <span className={cn('badge', severityColors[finding.severity])}>{finding.severity}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-dark-100 dark:bg-dark-800 text-dark-700 dark:text-dark-300">{finding.category}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-dark-700 dark:text-dark-300 font-mono">{finding.rule_id}</td>
                    <td className="px-4 py-3 text-sm text-dark-700 dark:text-dark-300 font-mono truncate max-w-[200px]">{finding.file_path}</td>
                    <td className="px-4 py-3 text-sm text-dark-500 dark:text-dark-400 font-mono">{finding.start_line}-{finding.end_line}</td>
                    <td className="px-4 py-3 text-sm text-dark-700 dark:text-dark-300 max-w-md truncate">{finding.message}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelect(finding); }}
                        className="btn-secondary btn-sm"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ProposalsTab({ proposals, isLoading, onSelect }: {
  proposals: RefactorProposal[];
  isLoading: boolean;
  onSelect: (proposal: RefactorProposal) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {proposals.length === 0 ? (
        <div className="card p-12 text-center">
          <Wrench className="w-16 h-16 mx-auto text-dark-300 dark:text-dark-600 mb-4" />
          <h3 className="text-lg font-medium text-dark-900 dark:text-white mb-2">No refactor proposals</h3>
          <p className="text-dark-500 dark:text-dark-400">No automated refactoring suggestions for this analysis</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-dark-50 dark:bg-dark-800/50 border-b border-dark-200 dark:border-dark-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">File</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Impact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Explanation</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
                {proposals.map((proposal) => (
                  <tr key={proposal.id} className="hover:bg-dark-50 dark:hover:bg-dark-800/50">
                    <td className="px-4 py-3 text-sm font-mono text-dark-700 dark:text-dark-300 truncate max-w-[200px]">{proposal.file_path}</td>
                    <td className="px-4 py-3">
                      <span className={cn('badge',
                        proposal.estimated_impact === 'high' && 'badge-high',
                        proposal.estimated_impact === 'medium' && 'badge-medium',
                        proposal.estimated_impact === 'low' && 'badge-low'
                      )}>{proposal.estimated_impact}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full"
                            style={{ width: `${proposal.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-dark-500 dark:text-dark-400">{(proposal.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('badge',
                        proposal.status === 'approved' && 'badge-medium',
                        proposal.status === 'applied' && 'badge-green',
                        proposal.status === 'rejected' && 'badge-red',
                        proposal.status === 'pending' && 'badge-info'
                      )}>{proposal.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-dark-700 dark:text-dark-300 max-w-md truncate">{proposal.explanation}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onSelect(proposal)}
                        className="btn-secondary btn-sm"
                      >
                        View Diff
                      </button>
                      {proposal.status === 'pending' && (
                        <button className="btn-primary btn-sm ml-2">Approve</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FindingDetailModal({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-dark-900 rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-dark-200 dark:border-dark-700 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('badge', severityColors[finding.severity])}>{finding.severity}</span>
              <span className="badge bg-dark-100 dark:bg-dark-800 text-dark-700 dark:text-dark-300">{finding.category}</span>
            </div>
            <h3 className="text-lg font-semibold text-dark-900 dark:text-white">{finding.rule_name}</h3>
            <p className="text-sm text-dark-500 dark:text-dark-400 mt-1">{finding.file_path}:{finding.start_line}-{finding.end_line}</p>
          </div>
          <button onClick={onClose} className="p-1 text-dark-500 hover:text-dark-700">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <h4 className="font-medium text-dark-900 dark:text-white mb-2">Message</h4>
            <p className="text-dark-600 dark:text-dark-300">{finding.message}</p>
          </div>

          {finding.description && (
            <div>
              <h4 className="font-medium text-dark-900 dark:text-white mb-2">Description</h4>
              <p className="text-dark-600 dark:text-dark-300">{finding.description}</p>
            </div>
          )}

          {finding.recommendation && (
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <h4 className="font-medium text-green-800 dark:text-green-400 mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Recommendation
              </h4>
              <p className="text-green-700 dark:text-green-300">{finding.recommendation}</p>
            </div>
          )}

          {finding.cwe_id && (
            <div className="flex items-center gap-2 text-sm text-dark-500 dark:text-dark-400">
              <Shield className="w-4 h-4" />
              <span>CWE: {finding.cwe_id}</span>
              {finding.owasp_category && <span>• OWASP: {finding.owasp_category}</span>}
            </div>
          )}

          {finding.code_snippet && (
            <div>
              <h4 className="font-medium text-dark-900 dark:text-white mb-2">Code Snippet</h4>
              <pre className="bg-dark-100 dark:bg-dark-800 p-4 rounded-lg overflow-auto text-sm">
                <code>{finding.code_snippet}</code>
              </pre>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-dark-200 dark:border-dark-700 flex justify-end">
          <button onClick={onClose} className="btn-primary">Close</button>
        </div>
      </div>
    </div>
  );
}

function ProposalDetailModal({ proposal, onClose, diffViewMode, setDiffViewMode }: {
  proposal: RefactorProposal;
  onClose: () => void;
  diffViewMode: 'unified' | 'split';
  setDiffViewMode: (mode: 'unified' | 'split') => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);

  const diffLines = parseDiff(proposal.diff);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-dark-900 rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-dark-200 dark:border-dark-700 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('badge',
                proposal.estimated_impact === 'high' && 'badge-high',
                proposal.estimated_impact === 'medium' && 'badge-medium',
                proposal.estimated_impact === 'low' && 'badge-low'
              )}>{proposal.estimated_impact} Impact</span>
              <span className="badge bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                {(proposal.confidence * 100).toFixed(0)}% Confidence
              </span>
              <span className={cn('badge',
                proposal.status === 'approved' && 'badge-medium',
                proposal.status === 'applied' && 'bg-green-100 text-green-800',
                proposal.status === 'rejected' && 'bg-red-100 text-red-800',
                proposal.status === 'pending' && 'badge-info'
              )}>{proposal.status}</span>
            </div>
            <h3 className="text-lg font-semibold text-dark-900 dark:text-white truncate">{proposal.file_path}</h3>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => setDiffViewMode(diffViewMode === 'unified' ? 'split' : 'unified')}
              className={cn('p-2 rounded-lg text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-800', diffViewMode === 'split' && 'bg-primary-100 text-primary-600')}
              title={diffViewMode === 'unified' ? 'Switch to split view' : 'Switch to unified view'}
            >
              {diffViewMode === 'unified' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
              )}
            </button>
            <button onClick={onClose} className="p-1 text-dark-500 hover:text-dark-700">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Explanation Panel */}
          <div className="w-80 border-r border-dark-200 dark:border-dark-700 p-4 overflow-y-auto flex-shrink-0">
            <h4 className="font-medium text-dark-900 dark:text-white mb-3">Explanation</h4>
            <p className="text-dark-600 dark:text-dark-300 text-sm mb-6">{proposal.explanation}</p>

            {proposal.test_code && (
              <div className="border-t border-dark-200 dark:border-dark-700 pt-4">
                <h4 className="font-medium text-dark-900 dark:text-white mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Suggested Tests
                </h4>
                <pre className="bg-dark-100 dark:bg-dark-800 p-3 rounded-lg text-xs overflow-auto max-h-64">
                  <code>{proposal.test_code}</code>
                </pre>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {proposal.status === 'pending' && (
                <button className="btn-primary flex-1 text-sm">Approve & Create PR</button>
              )}
              {proposal.status === 'approved' && (
                <button className="btn-primary flex-1 text-sm">Create PR</button>
              )}
            </div>
          </div>

          {/* Diff View */}
          <div className="flex-1 overflow-auto p-4 font-mono text-sm">
            {diffViewMode === 'unified' ? (
              <UnifiedDiffView lines={diffLines} />
            ) : (
              <SplitDiffView lines={diffLines} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnifiedDiffView({ lines }: { lines: ReturnType<typeof parseDiff> }) {
  return (
    <div className="font-mono text-sm">
      {lines.map((line, idx) => (
        <div
          key={idx}
          className={cn(
            'px-4 py-1 whitespace-pre border-l-4',
            line.type === 'added' && 'bg-green-50 border-green-500 dark:bg-green-900/20',
            line.type === 'removed' && 'bg-red-50 border-red-500 dark:bg-red-900/20',
            line.type === 'unchanged' && 'bg-transparent border-transparent text-dark-500 dark:text-dark-400'
          )}
        >
          <span className="mr-4 text-dark-400 dark:text-dark-500 select-none w-8 text-right inline-block">
            {line.lineNumber !== undefined ? line.lineNumber + 1 : ''}
          </span>
          {line.type === 'added' && '+'}
          {line.type === 'removed' && '-'}
          {line.type === 'unchanged' && ' '}
          <span className="ml-1">{line.content || ' '}</span>
        </div>
      ))}
    </div>
  );
}

function SplitDiffView({ lines }: { lines: ReturnType<typeof parseDiff> }) {
  const removedLines = lines.filter(l => l.type === 'removed' || l.type === 'unchanged');
  const addedLines = lines.filter(l => l.type === 'added' || l.type === 'unchanged');

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-sm font-medium text-dark-500 dark:text-dark-400 mb-2 px-4">Original</div>
        <div className="font-mono text-sm">
          {removedLines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                'px-4 py-1 whitespace-pre border-l-4',
                line.type === 'removed' && 'bg-red-50 border-red-500 dark:bg-red-900/20',
                line.type === 'unchanged' && 'bg-transparent border-transparent text-dark-500 dark:text-dark-400'
              )}
            >
              <span className="mr-4 text-dark-400 dark:text-dark-500 select-none w-8 text-right inline-block">
                {line.lineNumber !== undefined ? line.lineNumber + 1 : ''}
              </span>
              {line.type === 'removed' ? '- ' : '  '}
              <span className="ml-1">{line.content || ' '}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium text-dark-500 dark:text-dark-400 mb-2 px-4">Refactored</div>
        <div className="font-mono text-sm">
          {addedLines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                'px-4 py-1 whitespace-pre border-l-4',
                line.type === 'added' && 'bg-green-50 border-green-500 dark:bg-green-900/20',
                line.type === 'unchanged' && 'bg-transparent border-transparent text-dark-500 dark:text-dark-400'
              )}
            >
              <span className="mr-4 text-dark-400 dark:text-dark-500 select-none w-8 text-right inline-block">
                {line.lineNumber !== undefined ? line.lineNumber + 1 : ''}
              </span>
              {line.type === 'added' ? '+ ' : '  '}
              <span className="ml-1">{line.content || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}