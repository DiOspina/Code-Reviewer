import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Database,
  GitBranch,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  FileCode,
  Shield,
  Zap,
  Wrench,
  BarChart2,
} from 'lucide-react';
import { useRepository, useRepositoryStats, useTriggerAnalysis, useAnalyses } from '../hooks/useApi';
import { useUIStore } from '../hooks/useStore';
import { cn, formatRelativeTime, formatNumber, getSeverityBadgeClass, getStatusColor, getStatusIcon } from '../utils/helpers';
import { Repository, Analysis, AnalysisStatus } from '../types';

export default function RepositoryDetail() {
  const { id } = useParams<{ id: string }>();
  const { repository, isLoading, refetch } = useRepository(id!);
  const { data: stats, isLoading: statsLoading } = useRepositoryStats(id!);
  const { analyses, isLoading: analysesLoading } = useAnalyses({ repository_id: id, page_size: 10 });
  const triggerAnalysisMutation = useTriggerAnalysis();
  const { addNotification, globalLoading, setGlobalLoading } = useUIStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'analyses' | 'stats'>('overview');

  const handleTriggerAnalysis = async () => {
    if (!repository) return;
    setGlobalLoading(true);
    try {
      await triggerAnalysisMutation.mutateAsync(repository.id);
      addNotification({ type: 'success', message: 'Analysis queued successfully' });
      refetch();
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to queue analysis' });
    } finally {
      setGlobalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!repository) {
    return (
      <div className="text-center p-12">
        <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-dark-900 dark:text-white">Repository not found</h2>
        <Link to="/repositories" className="btn-primary mt-4 inline-block">Back to Repositories</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary-100 dark:bg-primary-900/30">
            <Database className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-dark-900 dark:text-white">{repository.name}</h1>
              {repository.is_private && <span className="badge badge-low">Private</span>}
              {repository.is_archived && <span className="badge badge-info">Archived</span>}
            </div>
            <p className="text-dark-500 dark:text-dark-400 mt-1">{repository.full_name}</p>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-dark-500 dark:text-dark-400">
              {repository.language && (
                <span className="flex items-center gap-1">
                  <FileCode className="w-4 h-4" /> {repository.language}
                </span>
              )}
              <span className="flex items-center gap-1">
                <GitBranch className="w-4 h-4" /> {repository.default_branch}
              </span>
              <span className="flex items-center gap-1">
                ⭐ {formatNumber(repository.stars)}
              </span>
              <span className="flex items-center gap-1">
                🍴 {formatNumber(repository.forks)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <a
            href={repository.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            <ExternalLink className="w-4 h-4" /> View on GitHub
          </a>
          <button
            onClick={handleTriggerAnalysis}
            disabled={triggerAnalysisMutation.isPending || globalLoading}
            className="btn-primary"
          >
            <GitBranch className="w-4 h-4" />
            {triggerAnalysisMutation.isPending ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-dark-200 dark:border-dark-700">
        <nav className="flex gap-4" aria-label="Repository tabs">
          {[
            { id: 'overview', label: 'Overview', icon: <BarChart2 className="w-4 h-4" /> },
            { id: 'analyses', label: 'Analyses', icon: <GitBranch className="w-4 h-4" /> },
            { id: 'stats', label: 'Statistics', icon: <Shield className="w-4 h-4" /> },
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
      {activeTab === 'overview' && <OverviewTab repository={repository} stats={stats} statsLoading={statsLoading} />}
      {activeTab === 'analyses' && <AnalysesTab analyses={analyses} analysesLoading={analysesLoading} repositoryId={id!} />}
      {activeTab === 'stats' && <StatsTab stats={stats} statsLoading={statsLoading} />}
    </div>
  );
}

function OverviewTab({ repository, stats, statsLoading }: {
  repository: Repository;
  stats: any;
  statsLoading: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Analyses" value={stats?.analyses?.total || 0} icon={<GitBranch className="w-6 h-6" />} color="blue" />
        <StatCard title="Completed" value={stats?.analyses?.completed || 0} icon={<CheckCircle className="w-6 h-6" />} color="green" />
        <StatCard title="Avg Technical Debt" value={`${(stats?.analyses?.avg_technical_debt || 0).toFixed(1)}`} icon={<AlertTriangle className="w-6 h-6" />} color="orange" />
        <StatCard title="Vector Coverage" value={`${(stats?.vector_index?.embedding_coverage || 0).toFixed(1)}%`} icon={<Zap className="w-6 h-6" />} color="purple" />
      </div>

      {/* Repository Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-primary-600" /> Repository Details
          </h3>
          <dl className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-dark-500 dark:text-dark-400">Owner</dt>
                <dd className="font-medium text-dark-900 dark:text-white">{repository.owner_login} ({repository.owner_type})</dd>
              </div>
              <div>
                <dt className="text-sm text-dark-500 dark:text-dark-400">Visibility</dt>
                <dd className="font-medium text-dark-900 dark:text-white">{repository.is_private ? 'Private' : 'Public'}</dd>
              </div>
              <div>
                <dt className="text-sm text-dark-500 dark:text-dark-400">Default Branch</dt>
                <dd className="font-medium text-dark-900 dark:text-white">{repository.default_branch}</dd>
              </div>
              <div>
                <dt className="text-sm text-dark-500 dark:text-dark-400">Clone URL</dt>
                <dd className="font-medium text-dark-900 dark:text-white truncate">{repository.clone_url}</dd>
              </div>
              <div>
                <dt className="text-sm text-dark-500 dark:text-dark-400">Created</dt>
                <dd className="font-medium text-dark-900 dark:text-white">{formatRelativeTime(repository.created_at)}</dd>
              </div>
              <div>
                <dt className="text-sm text-dark-500 dark:text-dark-400">Last Updated</dt>
                <dd className="font-medium text-dark-900 dark:text-white">{formatRelativeTime(repository.updated_at)}</dd>
              </div>
              <div>
                <dt className="text-sm text-dark-500 dark:text-dark-400">Last Analyzed</dt>
                <dd className="font-medium text-dark-900 dark:text-white">{repository.last_analyzed_at ? formatRelativeTime(repository.last_analyzed_at) : 'Never'}</dd>
              </div>
              <div>
                <dt className="text-sm text-dark-500 dark:text-dark-400">GitHub ID</dt>
                <dd className="font-medium text-dark-900 dark:text-white font-mono text-sm">{repository.github_id}</dd>
              </div>
            </div>
          </dl>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary-600" /> Vector Index Status
          </h3>
          {statsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : stats ? (
            <dl className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-dark-500 dark:text-dark-400">Total Chunks</dt>
                  <dd className="font-medium text-dark-900 dark:text-white">{formatNumber(stats.vector_index?.total_chunks || 0)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-dark-500 dark:text-dark-400">Embedded Chunks</dt>
                  <dd className="font-medium text-dark-900 dark:text-white">{formatNumber(stats.vector_index?.embedded_chunks || 0)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-dark-500 dark:text-dark-400">Coverage</dt>
                  <dd className="font-medium text-dark-900 dark:text-white">{(stats.vector_index?.embedding_coverage || 0).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-sm text-dark-500 dark:text-dark-400">Avg Complexity</dt>
                  <dd className="font-medium text-dark-900 dark:text-white">{(stats.vector_index?.avg_complexity || 0).toFixed(1)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-dark-500 dark:text-dark-400">Max Complexity</dt>
                  <dd className="font-medium text-dark-900 dark:text-white">{stats.vector_index?.max_complexity || 0}</dd>
                </div>
              </div>
            </dl>
          ) : (
            <p className="text-dark-500 dark:text-dark-400">No vector index data available</p>
          )}
        </div>
      </div>

      {/* Description */}
      {repository.description && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-2">Description</h3>
          <p className="text-dark-600 dark:text-dark-300">{repository.description}</p>
        </div>
      )}
    </div>
  );
}

function AnalysesTab({ analyses, analysesLoading, repositoryId }: {
  analyses: any;
  analysesLoading: boolean;
  repositoryId: string;
}) {
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

  if (analysesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {analyses?.analyses.length === 0 ? (
        <div className="p-12 text-center">
          <GitBranch className="w-16 h-16 mx-auto text-dark-300 dark:text-dark-600 mb-4" />
          <h3 className="text-lg font-medium text-dark-900 dark:text-white mb-2">No analyses yet</h3>
          <p className="text-dark-500 dark:text-dark-400 mb-6">Run your first analysis to see results here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-dark-50 dark:bg-dark-800/50 border-b border-dark-200 dark:border-dark-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Findings</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Debt Score</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
              {analyses?.analyses.map((analysis: Analysis) => (
                <tr key={analysis.id} className="hover:bg-dark-50 dark:hover:bg-dark-800/50">
                  <td className="px-4 py-3">
                    <Link to={`/analyses/${analysis.id}`} className="font-medium text-primary-600 hover:underline dark:text-primary-400">
                      {analysis.trigger_type === 'webhook' ? `PR #${analysis.github_pr_number}` : 'Full Scan'}
                    </Link>
                    <p className="text-sm text-dark-500 dark:text-dark-400">{analysis.trigger_type}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('badge', getStatusColor(analysis.status))}>
                      {getStatusIcon(analysis.status)} {analysis.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {analysis.critical_findings > 0 && <span className="badge-critical">{analysis.critical_findings}</span>}
                      {analysis.high_findings > 0 && <span className="badge-high">{analysis.high_findings}</span>}
                      {analysis.medium_findings > 0 && <span className="badge-medium">{analysis.medium_findings}</span>}
                      {analysis.low_findings > 0 && <span className="badge-low">{analysis.low_findings}</span>}
                    </div>
                    <p className="text-sm text-dark-500 dark:text-dark-400">Total: {analysis.total_findings}</p>
                  </td>
                  <td className="px-4 py-3">
                    {analysis.technical_debt_score !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500 rounded-full"
                            style={{ width: `${Math.min(analysis.technical_debt_score, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-dark-900 dark:text-white">{analysis.technical_debt_score.toFixed(1)}</span>
                      </div>
                    ) : (
                      <span className="text-dark-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-500 dark:text-dark-400">
                    {formatRelativeTime(analysis.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/analyses/${analysis.id}`} className="btn-secondary btn-sm">View Details</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatsTab({ stats, statsLoading }: { stats: any; statsLoading: boolean }) {
  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Chunks Indexed" value={formatNumber(stats?.vector_index?.total_chunks || 0)} icon={<FileCode className="w-6 h-6" />} color="blue" />
        <StatCard title="Embedded Chunks" value={formatNumber(stats?.vector_index?.embedded_chunks || 0)} icon={<Zap className="w-6 h-6" />} color="green" />
        <StatCard title="Embedding Coverage" value={`${(stats?.vector_index?.embedding_coverage || 0).toFixed(1)}%`} icon={<Shield className="w-6 h-6" />} color="purple" />
        <StatCard title="Avg Complexity" value={stats?.vector_index?.avg_complexity?.toFixed(1) || '0'} icon={<Wrench className="w-6 h-6" />} color="orange" />
        <StatCard title="Max Complexity" value={stats?.vector_index?.max_complexity || 0} icon={<AlertTriangle className="w-6 h-6" />} color="red" />
        <StatCard title="Completed Analyses" value={stats?.analyses?.completed || 0} icon={<CheckCircle className="w-6 h-6" />} color="green" />
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">Analysis Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          <div>
            <p className="text-3xl font-bold text-dark-900 dark:text-white">{stats?.analyses?.total || 0}</p>
            <p className="text-sm text-dark-500 dark:text-dark-400">Total Analyses</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats?.analyses?.completed || 0}</p>
            <p className="text-sm text-dark-500 dark:text-dark-400">Completed</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{(stats?.analyses?.avg_technical_debt || 0).toFixed(1)}</p>
            <p className="text-sm text-dark-500 dark:text-dark-400">Avg Debt Score</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{(stats?.vector_index?.embedding_coverage || 0).toFixed(1)}%</p>
            <p className="text-sm text-dark-500 dark:text-dark-400">Vector Coverage</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string; value: string | number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
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