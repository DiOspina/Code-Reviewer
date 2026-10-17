import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  Repository,
  RepositoryListResponse,
  Analysis,
  AnalysisListResponse,
  AnalysisDetailResponse,
  Finding,
  FindingsStats,
  FindingsTrends,
  RefactorProposal,
  SyncRepositoriesRequest,
  CreatePRRequest,
} from '../types';

// Repository hooks
export function useRepositories(params?: {
  page?: number;
  page_size?: number;
  installation_id?: number;
  search?: string;
}) {
  return useQuery({
    queryKey: ['repositories', params],
    queryFn: () => api.getRepositories(params),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

export function useRepository(id: string) {
  return useQuery({
    queryKey: ['repository', id],
    queryFn: () => api.getRepository(id),
    enabled: !!id,
  });
}

export function useSyncRepositories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SyncRepositoriesRequest) => api.syncRepositories(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
    },
  });
}

export function useTriggerAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repositoryId: string) => api.triggerAnalysis(repositoryId),
    onSuccess: (data, repositoryId) => {
      queryClient.invalidateQueries({ queryKey: ['repository', repositoryId] });
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
    },
  });
}

export function useRepositoryStats(repositoryId: string) {
  return useQuery({
    queryKey: ['repository-stats', repositoryId],
    queryFn: () => api.getRepositoryStats(repositoryId),
    enabled: !!repositoryId,
    staleTime: 1000 * 60 * 5,
  });
}

// Analysis hooks
export function useAnalyses(params?: {
  page?: number;
  page_size?: number;
  repository_id?: string;
  status?: string;
  trigger_type?: string;
}) {
  return useQuery({
    queryKey: ['analyses', params],
    queryFn: () => api.getAnalyses(params),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useAnalysis(id: string) {
  return useQuery({
    queryKey: ['analysis', id],
    queryFn: () => api.getAnalysis(id),
    enabled: !!id,
    staleTime: 1000 * 30,
  });
}

export function useAnalysisFindings(analysisId: string, params?: {
  severity?: string;
  category?: string;
  file_path?: string;
  page?: number;
  page_size?: number;
}) {
  return useQuery({
    queryKey: ['analysis-findings', analysisId, params],
    queryFn: () => api.getAnalysisFindings(analysisId, params),
    enabled: !!analysisId,
  });
}

export function useAnalysisRefactorProposals(analysisId: string, status?: string) {
  return useQuery({
    queryKey: ['analysis-refactor-proposals', analysisId, status],
    queryFn: () => api.getAnalysisRefactorProposals(analysisId, status),
    enabled: !!analysisId,
  });
}

export function useRetryAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (analysisId: string) => api.retryAnalysis(analysisId),
    onSuccess: (data, analysisId) => {
      queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
    },
  });
}

export function useDeleteAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (analysisId: string) => api.deleteAnalysis(analysisId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
    },
  });
}

// Findings hooks
export function useFinding(id: string) {
  return useQuery({
    queryKey: ['finding', id],
    queryFn: () => api.getFinding(id),
    enabled: !!id,
  });
}

export function useFindingsStats(analysisId: string) {
  return useQuery({
    queryKey: ['findings-stats', analysisId],
    queryFn: () => api.getFindingsStats(analysisId),
    enabled: !!analysisId,
  });
}

export function useFindingsTrends(repositoryId: string, days: number = 30) {
  return useQuery({
    queryKey: ['findings-trends', repositoryId, days],
    queryFn: () => api.getFindingsTrends(repositoryId, days),
    enabled: !!repositoryId,
  });
}

// Refactor hooks
export function useRefactorProposal(id: string) {
  return useQuery({
    queryKey: ['refactor-proposal', id],
    queryFn: () => api.getRefactorProposal(id),
    enabled: !!id,
  });
}

export function useRefactorProposalsByAnalysis(analysisId: string, status?: string) {
  return useQuery({
    queryKey: ['refactor-proposals', analysisId, status],
    queryFn: () => api.getRefactorProposalsByAnalysis(analysisId, status),
    enabled: !!analysisId,
  });
}

export function useApproveRefactorProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) => api.approveRefactorProposal(proposalId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['refactor-proposal', data.id] });
      queryClient.invalidateQueries({ queryKey: ['refactor-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['analysis-refactor-proposals'] });
    },
  });
}

export function useRejectRefactorProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, reason }: { proposalId: string; reason: string }) =>
      api.rejectRefactorProposal(proposalId, reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['refactor-proposal', data.id] });
      queryClient.invalidateQueries({ queryKey: ['refactor-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['analysis-refactor-proposals'] });
    },
  });
}

export function useCreatePullRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePRRequest) => api.createPullRequest(data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['refactor-proposal', variables.proposal_id] });
      queryClient.invalidateQueries({ queryKey: ['refactor-proposals'] });
    },
  });
}

export function useProposalDiff(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-diff', proposalId],
    queryFn: () => api.getProposalDiff(proposalId),
    enabled: !!proposalId,
  });
}

// Health hooks
export function useHealthCheck() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.healthCheck(),
    refetchInterval: 30000, // Every 30 seconds
  });
}

export function useDetailedHealthCheck() {
  return useQuery({
    queryKey: ['health', 'detailed'],
    queryFn: () => api.detailedHealthCheck(),
    refetchInterval: 60000,
  });
}