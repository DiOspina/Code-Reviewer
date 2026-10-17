import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wrench,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  GitBranch,
  ExternalLink,
  Copy,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Search,
} from 'lucide-react';
import { useAnalyses, useRefactorProposalsByAnalysis } from '../hooks/useApi';
import { useUIStore } from '../hooks/useStore';
import { cn, formatRelativeTime, getSeverityBadgeClass } from '../utils/helpers';
import { RefactorProposal, Analysis } from '../types';

export default function RefactorProposals() {
  const [selectedAnalysis, setSelectedAnalysis] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedProposal, setSelectedProposal] = useState<RefactorProposal | null>(null);

  const { analyses, isLoading: analysesLoading } = useAnalyses({ page_size: 100 });
  const { proposals, isLoading: proposalsLoading } = useRefactorProposalsByAnalysis(
    selectedAnalysis!,
    statusFilter || undefined
  );
  const { addNotification } = useUIStore();

  const handleApprove = async (proposal: RefactorProposal) => {
    // Would use the approve mutation
    addNotification({ type: 'success', message: 'Proposal approved' });
  };

  const handleReject = async (proposal: RefactorProposal) => {
    // Would use the reject mutation
    addNotification({ type: 'success', message: 'Proposal rejected' });
  };

  if (analysesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Refactor Proposals</h1>
          <p className="text-dark-500 dark:text-dark-400 mt-1">
            Review and manage automated refactoring suggestions
          </p>
        </div>
      </div>

      {/* Analysis Selector & Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Analysis</label>
            <select
              value={selectedAnalysis || ''}
              onChange={(e) => setSelectedAnalysis(e.target.value)}
              className="input"
            >
              <option value="">Select an analysis...</option>
              {analyses?.analyses.map((analysis: Analysis) => (
                <option key={analysis.id} value={analysis.id}>
                  {analysis.trigger_type === 'webhook' ? `PR #${analysis.github_pr_number}` : 'Full Scan'} - {analysis.repository?.name} - {formatRelativeTime(analysis.created_at)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-48">
            <label className="label">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="applied">Applied</option>
            </select>
          </div>
        </div>
      </div>

      {selectedAnalysis && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <StatCard title="Total Proposals" value={proposals?.length || 0} icon={<Wrench className="w-6 h-6" />} color="blue" />
            <StatCard title="Pending" value={proposals?.filter(p => p.status === 'pending').length || 0} icon={<Clock className="w-6 h-6" />} color="yellow" />
            <StatCard title="Approved" value={proposals?.filter(p => p.status === 'approved').length || 0} icon={<CheckCircle className="w-6 h-6" />} color="green" />
            <StatCard title="Applied" value={proposals?.filter(p => p.status === 'applied').length || 0} icon={<GitBranch className="w-6 h-6" />} color="purple" />
          </div>

          {/* Proposals Table */}
          <div className="card overflow-hidden">
            {proposalsLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
                <p className="text-dark-500 dark:text-dark-400">Loading proposals...</p>
              </div>
            ) : proposals?.length === 0 ? (
              <div className="p-12 text-center">
                <Wrench className="w-16 h-16 mx-auto text-dark-300 dark:text-dark-600 mb-4" />
                <h3 className="text-lg font-medium text-dark-900 dark:text-white mb-2">No refactor proposals</h3>
                <p className="text-dark-500 dark:text-dark-400">No automated refactoring suggestions for this analysis</p>
              </div>
            ) : (
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
                    {proposals?.map((proposal) => (
                      <tr key={proposal.id} className="hover:bg-dark-50 dark:hover:bg-dark-800/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/analyses/${proposal.analysis_id}`}
                              className="text-sm font-mono text-primary-600 hover:underline dark:text-primary-400 truncate max-w-[200px]"
                            >
                              {proposal.file_path}
                            </Link>
                          </div>
                        </td>
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
                            proposal.status === 'applied' && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
                            proposal.status === 'rejected' && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
                            proposal.status === 'pending' && 'badge-info'
                          )}>{proposal.status}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-dark-700 dark:text-dark-300 max-w-md truncate">{proposal.explanation}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedProposal(proposal)}
                              className="btn-secondary btn-sm"
                            >
                              <Eye className="w-4 h-4" /> View Diff
                            </button>
                            {proposal.status === 'pending' && (
                              <>
                                <button onClick={() => handleApprove(proposal)} className="btn-primary btn-sm">
                                  <CheckCircle className="w-4 h-4" /> Approve
                                </button>
                                <button onClick={() => handleReject(proposal)} className="btn-secondary btn-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                                  <XCircle className="w-4 h-4" /> Reject
                                </button>
                              </>
                            )}
                            {proposal.status === 'approved' && (
                              <button className="btn-primary btn-sm">
                                <GitBranch className="w-4 h-4" /> Create PR
                              </button>
                            )}
                            {proposal.status === 'applied' && proposal.github_pr_url && (
                              <a
                                href={proposal.github_pr_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary btn-sm"
                              >
                                <ExternalLink className="w-4 h-4" /> View PR
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!selectedAnalysis && (
        <div className="card p-12 text-center">
          <Wrench className="w-16 h-16 mx-auto text-dark-300 dark:text-dark-600 mb-4" />
          <h3 className="text-lg font-medium text-dark-900 dark:text-white mb-2">Select an analysis</h3>
          <p className="text-dark-500 dark:text-dark-400">Choose an analysis from the dropdown above to view its refactor proposals</p>
        </div>
      )}

      {/* Proposal Detail Modal */}
      {selectedProposal && (
        <ProposalDetailModal
          proposal={selectedProposal}
          onClose={() => setSelectedProposal(null)}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
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

function ProposalDetailModal({ proposal, onClose }: { proposal: RefactorProposal; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-dark-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-dark-200 dark:border-dark-700 flex items-start justify-between">
          <div>
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
          <button onClick={onClose} className="p-1 text-dark-500 hover:text-dark-700">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <h4 className="font-medium text-dark-900 dark:text-white mb-2">Explanation</h4>
            <p className="text-dark-600 dark:text-dark-300">{proposal.explanation}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-dark-900 dark:text-white mb-2">Original Code</h4>
              <pre className="bg-dark-100 dark:bg-dark-800 p-3 rounded-lg text-xs overflow-auto max-h-64 font-mono">
                <code>{proposal.original_code}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-medium text-dark-900 dark:text-white mb-2">Refactored Code</h4>
              <pre className="bg-dark-100 dark:bg-dark-800 p-3 rounded-lg text-xs overflow-auto max-h-64 font-mono">
                <code>{proposal.refactored_code}</code>
              </pre>
            </div>
          </div>

          {proposal.test_code && (
            <div className="border-t border-dark-200 dark:border-dark-700 pt-4">
              <h4 className="font-medium text-dark-900 dark:text-white mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Suggested Tests
              </h4>
              <pre className="bg-dark-100 dark:bg-dark-800 p-3 rounded-lg text-xs overflow-auto max-h-64 font-mono">
                <code>{proposal.test_code}</code>
              </pre>
            </div>
          )}

          <div className="border-t border-dark-200 dark:border-dark-700 pt-4">
            <h4 className="font-medium text-dark-900 dark:text-white mb-2">Diff</h4>
            <pre className="bg-dark-100 dark:bg-dark-800 p-3 rounded-lg text-xs overflow-auto max-h-64 font-mono">
              <code>{proposal.diff}</code>
            </pre>
          </div>
        </div>

        <div className="p-4 border-t border-dark-200 dark:border-dark-700 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Close</button>
          {proposal.status === 'pending' && (
            <button className="btn-primary">Approve</button>
          )}
        </div>
      </div>
    </div>
  );
}