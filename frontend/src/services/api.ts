import axios, { AxiosInstance, AxiosError } from 'axios';
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
  TriggerAnalysisRequest,
  CreatePRRequest,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor for auth
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Handle unauthorized
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Repository endpoints
  async getRepositories(params?: {
    page?: number;
    page_size?: number;
    installation_id?: number;
    search?: string;
  }): Promise<RepositoryListResponse> {
    const response = await this.client.get('/repositories/', { params });
    return response.data;
  }

  async getRepository(id: string): Promise<Repository> {
    const response = await this.client.get(`/repositories/${id}`);
    return response.data;
  }

  async syncRepositories(data: SyncRepositoriesRequest): Promise<Repository[]> {
    const response = await this.client.post('/repositories/sync', data);
    return response.data;
  }

  async triggerAnalysis(repositoryId: string): Promise<{ analysis_id: string; status: string }> {
    const response = await this.client.post(`/repositories/${repositoryId}/analyze`);
    return response.data;
  }

  async getRepositoryStats(repositoryId: string): Promise<any> {
    const response = await this.client.get(`/repositories/${repositoryId}/stats`);
    return response.data;
  }

  // Analysis endpoints
  async getAnalyses(params?: {
    page?: number;
    page_size?: number;
    repository_id?: string;
    status?: string;
    trigger_type?: string;
  }): Promise<AnalysisListResponse> {
    const response = await this.client.get('/analyses/', { params });
    return response.data;
  }

  async getAnalysis(id: string): Promise<AnalysisDetailResponse> {
    const response = await this.client.get(`/analyses/${id}`);
    return response.data;
  }

  async getAnalysisFindings(analysisId: string, params?: {
    severity?: string;
    category?: string;
    file_path?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ findings: Finding[]; total: number; page: number; page_size: number }> {
    const response = await this.client.get(`/analyses/${analysisId}/findings`, { params });
    return response.data;
  }

  async getAnalysisRefactorProposals(analysisId: string, status?: string): Promise<{ proposals: RefactorProposal[]; total: number }> {
    const response = await this.client.get(`/analyses/${analysisId}/refactor-proposals`, { params: { status } });
    return response.data;
  }

  async retryAnalysis(analysisId: string): Promise<{ analysis_id: string; status: string }> {
    const response = await this.client.post(`/analyses/${analysisId}/retry`);
    return response.data;
  }

  async deleteAnalysis(analysisId: string): Promise<void> {
    await this.client.delete(`/analyses/${analysisId}`);
  }

  // Findings endpoints
  async getFinding(id: string): Promise<Finding> {
    const response = await this.client.get(`/findings/${id}`);
    return response.data;
  }

  async getFindingsStats(analysisId: string): Promise<FindingsStats> {
    const response = await this.client.get(`/findings/analysis/${analysisId}/stats`);
    return response.data;
  }

  async getFindingsTrends(repositoryId: string, days: number = 30): Promise<FindingsTrends> {
    const response = await this.client.get(`/findings/repository/${repositoryId}/trends`, { params: { days } });
    return response.data;
  }

  // Refactor proposals endpoints
  async getRefactorProposal(id: string): Promise<RefactorProposal> {
    const response = await this.client.get(`/refactors/${id}`);
    return response.data;
  }

  async getRefactorProposalsByAnalysis(analysisId: string, status?: string): Promise<RefactorProposal[]> {
    const response = await this.client.get(`/refactors/analysis/${analysisId}`, { params: { status } });
    return response.data;
  }

  async approveRefactorProposal(proposalId: string): Promise<RefactorProposal> {
    const response = await this.client.post(`/refactors/${proposalId}/approve`);
    return response.data;
  }

  async rejectRefactorProposal(proposalId: string, reason: string = ''): Promise<RefactorProposal> {
    const response = await this.client.post(`/refactors/${proposalId}/reject`, { reason });
    return response.data;
  }

  async createPullRequest(data: CreatePRRequest): Promise<{ proposal: RefactorProposal; pull_request: any }> {
    const response = await this.client.post('/refactors/create-pr', data);
    return response.data;
  }

  async getProposalDiff(proposalId: string): Promise<{ file_path: string; diff: string; original_code: string; refactored_code: string }> {
    const response = await this.client.get(`/refactors/${proposalId}/diff`);
    return response.data;
  }

  // Health
  async healthCheck(): Promise<{ status: string; service: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }

  async detailedHealthCheck(): Promise<{ status: string; checks: Record<string, string> }> {
    const response = await this.client.get('/health/detailed');
    return response.data;
  }
}

export const api = new ApiClient();
export default api;