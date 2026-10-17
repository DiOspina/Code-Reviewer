import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Database,
  Search,
  RefreshCw,
  Plus,
  Loader2,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Clock,
  GitBranch,
  Download,
  Settings,
} from 'lucide-react';
import { useRepositories, useSyncRepositories, useTriggerAnalysis } from '../hooks/useApi';
import { useUIStore } from '../hooks/useStore';
import { cn, formatRelativeTime, formatNumber, getSeverityBadgeClass } from '../utils/helpers';
import { Repository } from '../types';

export default function Repositories() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedInstallation, setSelectedInstallation] = useState<number | null>(null);

  const { repositories, isLoading, refetch } = useRepositories({
    page,
    page_size: 20,
    installation_id: selectedInstallation || undefined,
    search: search || undefined,
  });

  const syncMutation = useSyncRepositories();
  const triggerAnalysisMutation = useTriggerAnalysis();
  const { addNotification, globalLoading, setGlobalLoading } = useUIStore();

  const handleSync = async () => {
    if (!selectedInstallation) {
      addNotification({ type: 'warning', message: 'Please select a GitHub App installation first' });
      return;
    }

    setGlobalLoading(true);
    try {
      await syncMutation.mutateAsync({ installation_id: selectedInstallation });
      addNotification({ type: 'success', message: 'Repositories synced successfully' });
      refetch();
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to sync repositories' });
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleTriggerAnalysis = async (repo: Repository) => {
    setGlobalLoading(true);
    try {
      await triggerAnalysisMutation.mutateAsync(repo.id);
      addNotification({ type: 'success', message: `Analysis queued for ${repo.name}` });
      refetch();
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to queue analysis' });
    } finally {
      setGlobalLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Repositories</h1>
          <p className="text-dark-500 dark:text-dark-400 mt-1">
            Manage and analyze your connected GitHub repositories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending || !selectedInstallation}
            className="btn-secondary"
          >
            <RefreshCw className={cn('w-4 h-4', syncMutation.isPending && 'animate-spin')} />
            Sync
          </button>
        </div>
      </div>

      {/* Installation Selector & Search */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="label">GitHub App Installation</label>
            <select
              value={selectedInstallation || ''}
              onChange={(e) => setSelectedInstallation(e.target.value ? parseInt(e.target.value) : null)}
              className="input"
            >
              <option value="">Select installation...</option>
              <option value={1}>Primary Installation (ID: 1)</option>
              <option value={2}>Secondary Installation (ID: 2)</option>
            </select>
          </div>
          <div className="flex-1 sm:flex-2">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
              <input
                type="search"
                placeholder="Search repositories..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="input pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Repositories Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
            <p className="text-dark-500 dark:text-dark-400">Loading repositories...</p>
          </div>
        ) : repositories?.repositories.length === 0 ? (
          <div className="p-12 text-center">
            <Database className="w-16 h-16 mx-auto text-dark-300 dark:text-dark-600 mb-4" />
            <h3 className="text-lg font-medium text-dark-900 dark:text-white mb-2">No repositories found</h3>
            <p className="text-dark-500 dark:text-dark-400 mb-6">
              {selectedInstallation ? 'No repositories in this installation' : 'Select a GitHub App installation to view repositories'}
            </p>
            <button
              onClick={handleSync}
              disabled={!selectedInstallation || syncMutation.isPending}
              className="btn-primary"
            >
              <RefreshCw className="w-4 h-4" /> Sync Repositories
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="bg-dark-50 dark:bg-dark-800/50 border-b border-dark-200 dark:border-dark-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Repository</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Language</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Stars</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Last Analyzed</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Analyses</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-dark-500 dark:text-dark-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
                  {repositories?.repositories.map((repo) => (
                    <tr key={repo.id} className="hover:bg-dark-50 dark:hover:bg-dark-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/repositories/${repo.id}`} className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                            <Database className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                          </div>
                          <div>
                            <p className="font-medium text-dark-900 dark:text-white truncate max-w-xs">{repo.full_name}</p>
                            <p className="text-sm text-dark-500 dark:text-dark-400">{repo.description || 'No description'}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {repo.language ? (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-dark-100 dark:bg-dark-800 text-dark-700 dark:text-dark-300">
                            {repo.language}
                          </span>
                        ) : (
                          <span className="text-dark-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-dark-700 dark:text-dark-300">
                        {formatNumber(repo.stars)}
                      </td>
                      <td className="px-4 py-3 text-sm text-dark-500 dark:text-dark-400">
                        {repo.last_analyzed_at ? formatRelativeTime(repo.last_analyzed_at) : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-dark-700 dark:text-dark-300">
                        {repo.analyses_count || 0}
                      </td>
                      <td className="px-4 py-3">
                        {repo.is_archived ? (
                          <span className="badge badge-info">Archived</span>
                        ) : repo.is_private ? (
                          <span className="badge badge-low">Private</span>
                        ) : (
                          <span className="badge badge-medium">Public</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/repositories/${repo.id}`}
                            className="p-1.5 rounded-lg text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-800"
                            title="View details"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleTriggerAnalysis(repo)}
                            disabled={triggerAnalysisMutation.isPending}
                            className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50"
                            title="Run analysis"
                          >
                            <GitBranch className="w-4 h-4" />
                          </button>
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-800"
                            title="Open in GitHub"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {repositories && repositories.total > repositories.page_size && (
              <div className="p-4 border-t border-dark-200 dark:border-dark-700 flex items-center justify-between">
                <p className="text-sm text-dark-500 dark:text-dark-400">
                  Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, repositories.total)} of {repositories.total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-secondary btn-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * 20 >= repositories.total}
                    className="btn-secondary btn-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}