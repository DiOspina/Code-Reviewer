// API Types matching backend models

export interface Repository {
  id: string;
  github_id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  default_branch: string;
  language: string | null;
  stars: number;
  forks: number;
  is_private: boolean;
  is_archived: boolean;
  owner_login: string;
  owner_type: string;
  installation_id: number | null;
  created_at: string;
  updated_at: string;
  last_analyzed_at: string | null;
  analyses_count?: number;
}

export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingCategory = 'security' | 'performance' | 'maintainability' | 'style' | 'bug' | 'duplication' | 'antipattern';

export interface Analysis {
  id: string;
  repository_id: string;
  github_pr_number: number | null;
  github_commit_sha: string | null;
  status: AnalysisStatus;
  trigger_type: string;
  total_files: number;
  analyzed_files: number;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  info_findings: number;
  technical_debt_score: number | null;
  maintainability_index: number | null;
  duplication_percentage: number | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  repository?: Repository;
  findings_summary?: Record<string, Record<string, number>>;
  refactor_proposals_count?: number;
}

export interface Finding {
  id: string;
  analysis_id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  start_column: number | null;
  end_column: number | null;
  severity: FindingSeverity;
  category: FindingCategory;
  rule_id: string;
  rule_name: string;
  message: string;
  description: string | null;
  recommendation: string | null;
  cwe_id: string | null;
  owasp_category: string | null;
  confidence: number;
  code_snippet: string | null;
  context_before: string | null;
  context_after: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface RefactorProposal {
  id: string;
  analysis_id: string;
  finding_id: string | null;
  file_path: string;
  original_code: string;
  refactored_code: string;
  diff: string;
  explanation: string;
  test_code: string | null;
  test_explanation: string | null;
  estimated_impact: 'low' | 'medium' | 'high';
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  github_pr_url: string | null;
  github_pr_number: number | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface RepositoryListResponse extends PaginatedResponse<Repository> {}
export interface AnalysisListResponse extends PaginatedResponse<Analysis> {}

export interface AnalysisDetailResponse extends Analysis {
  findings_summary: Record<string, Record<string, number>>;
  refactor_proposals_count: number;
}

export interface FindingsStats {
  total: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  top_rules: Array<{ rule_id: string; rule_name: string; count: number }>;
  affected_files: number;
}

export interface FindingsTrends {
  trends: Array<{
    date: string;
    analysis_id: string;
    by_severity: Record<string, number>;
  }>;
  period_days: number;
  total_analyses: number;
}

// WebSocket types
export interface WSMessage {
  type: 'analysis_progress' | 'analysis_complete' | 'analysis_error' | 'finding_created' | 'proposal_created';
  payload: any;
}

export interface AnalysisProgressPayload {
  analysis_id: string;
  status: AnalysisStatus;
  progress: number;
  current_file: string | null;
  files_processed: number;
  total_files: number;
  findings_so_far: number;
}

// UI Types
export interface SidebarItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export type Theme = 'light' | 'dark' | 'system';

// Chart data types
export interface SeverityChartData {
  name: string;
  value: number;
  color: string;
}

export interface TrendChartData {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

// Form types
export interface SyncRepositoriesRequest {
  installation_id: number;
}

export interface TriggerAnalysisRequest {
  repository_id: string;
  pr_number?: number;
  commit_sha?: string;
}

export interface CreatePRRequest {
  proposal_id: string;
  base_branch?: string;
  draft?: boolean;
}