import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Search,
  Filter,
  AlertCircle,
  Zap,
  Wrench,
  Bug,
  Copy,
  ChevronRight,
  Download,
} from 'lucide-react';
import { useAnalyses, useFindingsStats, useFindingsTrends } from '../hooks/useApi';
import { useUIStore } from '../hooks/useStore';
import { cn, formatRelativeTime, getSeverityBadgeClass, calculateTechnicalDebtScore } from '../utils/helpers';
import { Finding, FindingSeverity, FindingCategory, Analysis } from '../types';

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const severityColors: Record<FindingSeverity, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  info: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',
};

export default function Findings() {
  const [selectedAnalysis, setSelectedAnalysis] = useState<string | null>(null);
  const [filters, setFilters] = useState({ severity: '', category: '', search: '' });

  const { analyses, isLoading: analysesLoading } = useAnalyses({ page_size: 100, status: 'completed' });
  const { data: stats, isLoading: statsLoading } = useFindingsStats(selectedAnalysis!);
  const { data: trends, isLoading: trendsLoading } = useFindingsTrends(
    analyses?.analyses[0]?.repository_id || '',
    30
  );
  const { addNotification } = useUIStore();

  const handleAnalysisChange = (analysisId: string) => {
    setSelectedAnalysis(analysisId);
  };

  if (analysesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const allFindings = stats ? [] : []; // Would need a separate hook for all findings across analyses

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">All Findings</h1>
          <p className="text-dark-500 dark:text-dark-400 mt-1">
            Browse and filter findings across all analyses
          </p>
        </div>
      </div>

      {/* Analysis Selector */}
      <div className="card p-4">
        <label className="label">Select Analysis</label>
        <select
          value={selectedAnalysis || ''}
          onChange={(e) => handleAnalysisChange(e.target.value)}
          className="input w-full sm:w-80"
        >
          <option value="">Select an analysis...</option>
          {analyses?.analyses.map((analysis: Analysis) => (
            <option key={analysis.id} value={analysis.id}>
              {analysis.trigger_type === 'webhook' ? `PR #${analysis.github_pr_number}` : 'Full Scan'} - {analysis.repository?.name} - {formatRelativeTime(analysis.created_at)}
            </option>
          ))}
        </select>
      </div>

      {selectedAnalysis && stats && !statsLoading && (
        <>
          {/* Stats Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard title="Total Findings" value={stats.total} icon={<AlertTriangle className="w-6 h-6" />} color="orange" />
            <StatCard title="Critical" value={stats.by_severity.critical || 0} icon={<AlertCircle className="w-6 h-6" />} color="red" />
            <StatCard title="High" value={stats.by_severity.high || 0} icon={<Zap className="w-6 h-6" />} color="orange" />
            <StatCard title="Medium" value={stats.by_severity.medium || 0} icon={<Wrench className="w-6 h-6" />} color="yellow" />
            <StatCard title="Low/Info" value={(stats.by_severity.low || 0) + (stats.by_severity.info || 0)} icon={<Bug className="w-6 h-6" />} color="blue" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">Findings by Severity</h3>
              <SeverityChart data={stats.by_severity} />
            </div>
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">Findings by Category</h3>
              <CategoryChart data={stats.by_category} />
            </div>
          </div>

          {/* Top Rules */}
          <div className="card p-6 mb-6">
            <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">Top Rules Triggered</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-200 dark:border-dark-700">
                    <th className="px-4 py-2 text-left text-sm font-semibold text-dark-500 dark:text-dark-400">Rule</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-dark-500 dark:text-dark-400">Count</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-dark-500 dark:text-dark-400">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
                  {stats.top_rules.slice(0, 10).map((rule, idx) => (
                    <tr key={idx} className="hover:bg-dark-50 dark:hover:bg-dark-800/50">
                      <td className="px-4 py-2 text-sm font-mono text-dark-700 dark:text-dark-300">{rule.rule_id}</td>
                      <td className="px-4 py-2 text-sm text-dark-700 dark:text-dark-300">{rule.count}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className="badge badge-info">{rule.rule_id.split('_')[0]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trends */}
          {trends && trends.trends.length > 0 && (
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">Findings Trend (Last 30 Days)</h3>
              <TrendsChart trends={trends.trends} />
            </div>
          )}
        </>
      )}

      {!selectedAnalysis && (
        <div className="card p-12 text-center">
          <AlertTriangle className="w-16 h-16 mx-auto text-dark-300 dark:text-dark-600 mb-4" />
          <h3 className="text-lg font-medium text-dark-900 dark:text-white mb-2">Select an analysis to view findings</h3>
          <p className="text-dark-500 dark:text-dark-400">Choose an analysis from the dropdown above to see detailed findings and statistics</p>
        </div>
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

function SeverityChart({ data }: { data: Record<string, number> }) {
  const severities: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  const colors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6', info: '#6b7280' };
  const total = Object.values(data).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      {severities.map(sev => {
        const count = data[sev] || 0;
        const percentage = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={sev} className="flex items-center gap-3">
            <div className="w-24 text-sm text-dark-500 dark:text-dark-400 capitalize">{sev}</div>
            <div className="flex-1 h-3 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${percentage}%`, backgroundColor: colors[sev] }}
              />
            </div>
            <div className="w-16 text-sm text-right text-dark-700 dark:text-dark-300 font-medium">{count}</div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, b) => a + b[1], 0);

  return (
    <div className="space-y-3">
      {entries.slice(0, 8).map(([cat, count]) => {
        const percentage = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={cat} className="flex items-center gap-3">
            <div className="w-28 text-sm text-dark-500 dark:text-dark-400 truncate">{cat}</div>
            <div className="flex-1 h-3 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
            </div>
            <div className="w-16 text-sm text-right text-dark-700 dark:text-dark-300 font-medium">{count}</div>
          </div>
        );
      })}
    </div>
  );
}

function TrendsChart({ trends }: { trends: Array<{ date: string; by_severity: Record<string, number> }> }) {
  // Simple text-based trend for now
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-dark-200 dark:border-dark-700">
            <th className="px-4 py-2 text-left text-dark-500 dark:text-dark-400">Date</th>
            <th className="px-4 py-2 text-right text-dark-500 dark:text-dark-400">Critical</th>
            <th className="px-4 py-2 text-right text-dark-500 dark:text-dark-400">High</th>
            <th className="px-4 py-2 text-right text-dark-500 dark:text-dark-400">Medium</th>
            <th className="px-4 py-2 text-right text-dark-500 dark:text-dark-400">Low</th>
            <th className="px-4 py-2 text-right text-dark-500 dark:text-dark-400">Info</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
          {trends.slice(-10).reverse().map((t, idx) => (
            <tr key={idx} className="hover:bg-dark-50 dark:hover:bg-dark-800/50">
              <td className="px-4 py-2 text-dark-700 dark:text-dark-300">{new Date(t.date).toLocaleDateString()}</td>
              <td className="px-4 py-2 text-right text-red-600">{t.by_severity.critical || 0}</td>
              <td className="px-4 py-2 text-right text-orange-600">{t.by_severity.high || 0}</td>
              <td className="px-4 py-2 text-right text-yellow-600">{t.by_severity.medium || 0}</td>
              <td className="px-4 py-2 text-right text-blue-600">{t.by_severity.low || 0}</td>
              <td className="px-4 py-2 text-right text-gray-600">{t.by_severity.info || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}