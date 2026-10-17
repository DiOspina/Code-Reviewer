# Agent Reviewer - Autonomous Code Auditing & Refactoring Agent

An AI-powered autonomous agent for code auditing, security analysis, and automated refactoring integrated into CI/CD pipelines.

## 🏗️ Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   GitHub        │     │   n8n           │     │   Backend       │
│   Webhooks      │────▶│   Workflows     │────▶│   (FastAPI)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                          │
                        ┌─────────────────┐               │
                        │   PostgreSQL    │◀──────────────┤
                        │   + pgvector    │               │
                        └─────────────────┘               │
                                                          │
                        ┌─────────────────┐               │
                        │   Ollama        │◀──────────────┤
                        │   (Local LLM)   │               │
                        └─────────────────┘               │
                                                          ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   Frontend      │◀────│   Redis         │
                        │   (React)       │     │   (Queue/Cache) │
                        └─────────────────┘     └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- GitHub App credentials (for production)
- OpenAI API key or Anthropic API key (for AI analysis)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/agent-reviewer.git
   cd agent-reviewer
   ```

2. **Configure environment variables**
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your API keys
   ```

3. **Start all services**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/api/v1/docs
   - n8n: http://localhost:5678 (admin/secure_password_change_me)

### Production Deployment

1. **Configure SSL certificates**
   ```bash
   mkdir -p nginx/ssl
   # Add your fullchain.pem and privkey.pem
   ```

2. **Set production environment variables**
   ```bash
   export POSTGRES_PASSWORD=your_secure_password
   export N8N_PASSWORD=your_secure_password
   export SECRET_KEY=your_secure_secret_key
   ```

3. **Deploy with production profile**
   ```bash
   docker-compose --profile production up -d
   ```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for GPT-4 | Yes* |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | Yes* |
| `OLLAMA_BASE_URL` | Ollama server URL (default: http://ollama:11434) | No |
| `GITHUB_APP_ID` | GitHub App ID | Yes |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key | Yes |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret for verification | Yes |
| `POSTGRES_PASSWORD` | PostgreSQL password | Yes |
| `N8N_WEBHOOK_URL` | n8n webhook URL | Yes |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | No |
| `DISCORD_WEBHOOK_URL` | Discord webhook for notifications | No |

*At least one AI provider (OpenAI, Anthropic, or Ollama) is required.

### GitHub App Setup

1. Create a GitHub App at https://github.com/settings/apps/new
2. Configure permissions:
   - Repository: Contents (R/W), Pull requests (R/W), Metadata (R)
   - Organization: Members (R)
3. Subscribe to events: Pull request, Push, Installation, Installation Repositories
4. Install the app on target repositories
5. Note the App ID, Private Key, and Installation ID

## 📁 Project Structure

```
agent-reviewer/
├── backend/                    # FastAPI backend
│   ├── app/                    # Main application
│   │   ├── api/                # API routes
│   │   ├── database.py         # Database configuration
│   │   ├── models.py           # SQLAlchemy models
│   │   └── main.py             # FastAPI entry point
│   ├── agents/                 # AI agents
│   │   ├── auditor.py          # Code auditor agent
│   │   └── refactor.py         # Refactoring agent
│   ├── ast/                    # AST parsing
│   │   └── parser.py           # Tree-sitter parser
│   ├── rag/                    # RAG system
│   │   ├── vector_store.py     # pgvector operations
│   │   └── embeddings.py       # Embedding providers
│   ├── github/                 # GitHub integration
│   │   ├── client.py           # GitHub API client
│   │   └── webhooks.py         # Webhook handlers
│   ├── config/                 # Configuration
│   │   └── settings.py         # Pydantic settings
│   └── workers/                # Background workers
│       └── main.py             # Analysis worker
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # Custom hooks
│   │   ├── services/           # API services
│   │   ├── types/              # TypeScript types
│   │   └── utils/              # Utilities
│   └── nginx/                  # Nginx config
├── n8n/                        # n8n workflows
│   └── workflows/
│       └── github-pr-analysis.json
├── scripts/                    # Utility scripts
│   └── init-db.sql             # Database initialization
├── nginx/                      # Production nginx config
├── docker-compose.yml          # Docker Compose
└── README.md                   # This file
```

## 🤖 AI Agents

### Code Auditor Agent

The auditor agent uses LangGraph to perform multi-stage analysis:

1. **Static Analysis** - Rule-based pattern matching (SQL injection, XSS, secrets, etc.)
2. **Context Retrieval** - Semantic search for related code chunks
3. **LLM Analysis** - Deep analysis using GPT-4/Claude
4. **Duplicate Detection** - Vector similarity search for code duplication
5. **Finding Aggregation** - Deduplication and severity scoring

Supported detections:
- **Security**: OWASP Top 10, CWE vulnerabilities
- **Performance**: N+1 queries, inefficient loops
- **Maintainability**: High complexity, long functions, too many parameters
- **Code Quality**: Duplication, missing docs, style issues

### Refactoring Agent

The refactoring agent generates optimized code proposals:

1. **Template Selection** - Based on finding type
2. **Code Generation** - LLM-powered refactoring
3. **Test Generation** - Unit tests for refactored code
4. **Diff Generation** - Unified/split diff views
5. **Impact Estimation** - Low/Medium/High impact scoring

## 🔄 CI/CD Integration

### n8n Workflow

The included n8n workflow (`n8n/workflows/github-pr-analysis.json`) handles:

1. **Webhook Reception** - GitHub PR events
2. **Event Filtering** - Only relevant PR actions
3. **Backend Trigger** - Start analysis via API
4. **Notifications** - Slack/Discord for start/completion
5. **Polling** - Wait for analysis completion
6. **Results Summary** - Formatted findings report
7. **PR Comment** - Post summary on PR (for critical/high findings)

### Webhook Configuration

Configure GitHub webhook:
- **URL**: `https://your-domain.com/api/v1/webhooks/github`
- **Content Type**: `application/json`
- **Events**: Pull request, Push, Installation
- **Secret**: Set in `GITHUB_WEBHOOK_SECRET`

## 📊 API Endpoints

### Repositories
- `GET /api/v1/repositories/` - List repositories
- `POST /api/v1/repositories/sync` - Sync from GitHub
- `POST /api/v1/repositories/{id}/analyze` - Trigger analysis

### Analyses
- `GET /api/v1/analyses/` - List analyses
- `GET /api/v1/analyses/{id}` - Get analysis details
- `GET /api/v1/analyses/{id}/findings` - Get findings
- `GET /api/v1/analyses/{id}/refactor-proposals` - Get proposals

### Findings
- `GET /api/v1/findings/{id}` - Get finding details
- `GET /api/v1/findings/analysis/{id}/stats` - Statistics
- `GET /api/v1/findings/repository/{id}/trends` - Trends

### Refactoring
- `GET /api/v1/refactors/{id}` - Get proposal
- `POST /api/v1/refactors/{id}/approve` - Approve proposal
- `POST /api/v1/refactors/{id}/reject` - Reject proposal
- `POST /api/v1/refactors/create-pr` - Create GitHub PR

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest -v --cov=app

# Frontend tests
cd frontend
npm test
```

## 📈 Monitoring

- **Prometheus metrics**: `/metrics` on backend
- **Health checks**: `/api/v1/health` and `/api/v1/health/detailed`
- **Flower (Celery monitoring)**: http://localhost:5555 (if enabled)

## 🛠️ Development

### Adding New Analysis Rules

1. Add rule to `SECURITY_RULES`, `PERFORMANCE_RULES`, etc. in `backend/agents/auditor.py`
2. Implement pattern matching logic
3. Add corresponding refactor template in `backend/agents/refactor.py`

### Supporting New Languages

1. Add language to `LANGUAGE_MAP` in `backend/ast/parser.py`
2. Add parser initialization in `backend/ast/parser.py`
3. Add chunk node types in `CHUNK_NODE_TYPES`
4. Install tree-sitter grammar package

## 🔐 Security

- All API endpoints require authentication (JWT)
- GitHub webhooks verified with HMAC
- SQL injection prevented via SQLAlchemy ORM
- Rate limiting on API endpoints
- Secure headers via nginx
- Secrets managed via environment variables

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## 📞 Support

- Issues: GitHub Issues
- Discussions: GitHub Discussions
- Email: support@agent-reviewer.example.com