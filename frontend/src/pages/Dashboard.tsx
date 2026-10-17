import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  Plus,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useRepositories, useAnalyses, useHealthCheck } from '../hooks/useApi';
import { useUIStore } from '../hooks/useStore';
import { cn, formatRelativeTime, formatNumber, getSeverityBadgeClass, calculateTechnicalDebtScore } from '../utils/helpers';
import { Repository, Analysis, AnalysisStatus } from '../types';

export default function Dashboard() {
  const { repositories, isLoading: reposLoading, refetch: refetchRepos } = useRepositories({ page_size: 5 });
  const { analyses, isLoading: analysesLoading, refetch: refetchAnalyses } = useAnalyses({ page_size: 10 });
  const { data: health } = useHealthCheck();
  const { addNotification, globalLoading, setGlobalLoading } = useUIStore();

  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [triggeringAnalysis, setTriggeringAnalysis] = useState<string | null>(null);

  // Stats calculations
  const totalRepos = repositories?.total || 0;
  const activeAnalyses = analyses?.analyses.filter(a => a.status === 'running').length || 0;
  const completedAnalyses = analyses?.analyses.filter(a => a.status === 'completed').length || 0;
  const failedAnalyses = analyses?.analyses.filter(a => a.status === 'failed').length || 0;
  const totalFindings = analyses?.analyses.reduce((sum, a) => sum + a.total_findings, 0) || 0;
  const criticalFindings = analyses?.analyses.reduce((sum, a) => sum + a.critical_findings, 0) || 0;

  const handleTriggerAnalysis = async (repoId: string) => {
    setTriggeringAnalysis(repoId);
    setGlobalLoading(true);
    try {
      const { triggerAnalysis } = await import('../hooks/useApi');
      const mutation = triggerAnalysis();
      await mutation.mutateAsync(repoId);
      addNotification({ type: 'success', message: 'Analysis queued successfully' });
      refetchAnalyses();
      refetchRepos();
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to queue analysis' });
    } finally {
      setTriggeringAnalysis(null);
      setGlobalLoading(false);
    }
  };

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

  if (reposLoading && analysesLoading) {
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
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Dashboard</h1>
          <p className="text-dark-500 dark:text-dark-400 mt-1">
            Overview of your code quality and security posture
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refetchRepos(); refetchAnalyses(); }}
            className="btn-secondary"
            disabled={globalLoading}
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Health Status */}
      <div className={cn('card p-4', health?.status === 'healthy' ? 'border-green-200 dark:border-green-800' : 'border-yellow-200 dark:border-yellow-800')}>
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', health?.status === 'healthy' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30')}>
            {health?.status === 'healthy' ? (
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            )}
          </div>
          <div>
            <p className="font-medium text-dark-900 dark:text-white">
              System Status: <span className={cn('capitalize', health?.status === 'healthy' ? 'text-green-600' : 'text-yellow-600')}>{health?.status}</span>
            </p>
            <p className="text-sm text-dark-500 dark:text-dark-400">
              {health?.status === 'healthy' ? 'All systems operational' : 'Some services degraded'}
            </p>
          </div>
          <div className="flex-1" />
          {health?.checks && (
            <div className="flex items-center gap-4 text-sm">
              <span className={cn('flex items-center gap-1', health?.checks.database === 'healthy' ? 'text-green-600' : 'text-red-600')}>
                <Database className="w-4 h-4" /> Database
              </span>
              <span className={cn('flex items-center gap-1', health?.checks.api === 'healthy' ? 'text-green-600' : 'text-red-600')}>
                <GitBranch className="w-4 h-4" /> API
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Repositories"
          value={formatNumber(totalRepos)}
          icon={<Database className="w-6 h-6" />}
          color="blue"
          link="/repositories"
        />
        <StatCard
          title="Active Analyses"
          value={activeAnalyses}
          icon={<Loader2 className="w-6 h-6 animate-spin" />}
          color="blue"
        />
        <StatCard
          title="Total Findings"
          value={formatNumber(totalFindings)}
          icon={<AlertTriangle className="w-6 h-6" />}
          color="orange"
        />
        <StatCard
          title="Critical Issues"
          value={formatNumber(criticalFindings)}
          icon={<AlertCircle className="w-6 h-6" />}
          color="red"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Repositories */}
        <div className="card">
          <div className="p-4 border-b border-dark-200 dark:border-dark-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Recent Repositories</h2>
            <Link to="/repositories" className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
              View all
            </Link>
          </div>
          <div className="divide-y divide-dark-200 dark:divide-dark-700">
            {repositories?.repositories.slice(0, 5).map((repo) => (
              <Link
                key={repo.id}
                to={`/repositories/${repo.id}`}
                className="flex items-center justify-between p-4 hover:bg-dark-50 dark:hover:bg-dark-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                    <Database className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-dark-900 dark:text-white truncate">{repo.full_name}</p>
                    <p className="text-sm text-dark-500 dark:text-dark-400">
                      {repo.language} • {formatNumber(repo.stars)} stars • {formatRelativeTime(repo.updated_at)}
                    </p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-dark-400" />
              </Link>
            ))}
            {(!repositories?.repositories.length || repositories.repositories.length === 0) && (
              <div className="p-8 text-center text-dark-500 dark:text-dark-400">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No repositories connected</p>
                <Link to="/repositories" className="text-primary-600 hover:underline mt-2 inline-block">
                  Connect a repository
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Analyses */}
        <div className="card">
          <div className="p-4 border-b border-dark-200 dark:border-dark-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Recent Analyses</h2>
            <Link to="/analyses" className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
              View all
            </Link>
          </div>
          <div className="divide-y divide-dark-200 dark:divide-dark-700">
            {analyses?.analyses.slice(0, 5).map((analysis) => (
              <Link
                key={analysis.id}
                to={`/analyses/${analysis.id}`}
                className="flex items-center justify-between p-4 hover:bg-dark-50 dark:hover:bg-dark-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn('p-2 rounded-lg', getStatusColor(analysis.status))}>
                    {getStatusIcon(analysis.status)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-dark-900 dark:text-white truncate">
                      {analysis.trigger_type === 'webhook' ? `PR #${analysis.github_pr_number}` : 'Full Repository Scan'}
                    </p>
                    <p className="text-sm text-dark-500 dark:text-dark-400">
                      {analysis.total_findings} findings • {formatRelativeTime(analysis.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-dark-500 dark:text-dark-400">
                  {analysis.critical_findings > 0 && (
                    <span className="badge-critical">{analysis.critical_findings} critical</span>
                  )}
                  {analysis.high_findings > 0 && (
                    <span className="badge-high">{analysis.high_findings} high</span>
                  )}
                </div>
              </Link>
            ))}
            {(!analyses?.analyses.length || analyses.analyses.length === 0) && (
              <div className="p-8 text-center text-dark-500 dark:text-dark-400">
                <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No analyses yet</p>
                <button
                  onClick={() => setSelectedRepo(repositories?.repositories[0] || null)}
                  className="btn-primary mt-2"
                  disabled={!repositories?.repositories.length}
                >
                  <Plus className="w-4 h-4" /> Run First Analysis
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trigger Analysis Modal */}
      {selectedRepo && (
        <AnalysisTriggerModal
          repo={selectedRepo}
          onClose={() => setSelectedRepo(null)}
          onTrigger={handleTriggerAnalysis}
          isLoading={triggeringAnalysis === selectedRepo.id}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color, link }: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'blue' | 'orange' | 'red' | 'green';
  link?: string;
}) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-dark-500 dark:text-dark-400">{title}</p>
          <p className="text-3xl font-bold text-dark-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className={cn('p-3 rounded-xl', colors[color])}>
          {icon}
        </div>
      </div>
      {link && (
        <Link to={link} className="mt-4 inline-flex items-center text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
          View details →
        </Link>
      )}
    </div>
  );
}

function AnalysisTriggerModal({ repo, onClose, onTrigger, isLoading }: {
  repo: Repository;
  onClose: () => void;
  onTrigger: (repoId: string) => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-dark-900 rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-dark-200 dark:border-dark-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-900 dark:text-white">Trigger Analysis</h3>
          <button onClick={onClose} className="p-1 text-dark-500 hover:text-dark-700 dark:hover:text-dark-300">✕</button>
        </div>
        <div className="p-4">
          <p className="text-dark-600 dark:text-dark-400 mb-4">
            Run a full repository analysis on <strong>{repo.full_name}</strong>?
          </p>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input type="radio" name="analysis-type" defaultChecked className="text-primary-600" />
              <span className="text-sm text-dark-700 dark:text-dark-300">Full repository scan</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="analysis-type" className="text-primary-600" />
              <span className="text-sm text-dark-700 dark:text-dark-300">Specific branch/commit</span>
            </label>
          </div>
        </div>
        <div className="p-4 border-t border-dark-200 dark:border-dark-700 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary" disabled={isLoading}>Cancel</button>
          <button
            onClick={() => { onTrigger(repo.id); onClose(); }}
            className="btn-primary"
            disabled={isLoading}
          >
            {isLoading ? 'Queuing...' : 'Start Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
}