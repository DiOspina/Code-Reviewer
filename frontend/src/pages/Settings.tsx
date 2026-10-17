import { useState } from 'react';
import {
  User,
  Shield,
  Database,
  GitBranch,
  Bell,
  Palette,
  Key,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Trash2,
  Plus,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useUIStore } from '../hooks/useStore';
import { cn, formatRelativeTime } from '../utils/helpers';

export default function Settings() {
  const { theme, setTheme, sidebarOpen, setSidebarOpen, diffViewMode, setDiffViewMode, notifications, clearNotifications } = useUIStore();
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'integrations' | 'notifications' | 'advanced'>('general');
  const [saving, setSaving] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);

  const tabs = [
    { id: 'general', label: 'General', icon: <User className="w-4 h-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
    { id: 'integrations', label: 'Integrations', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'advanced', label: 'Advanced', icon: <Shield className="w-4 h-4" /> },
  ];

  const handleSave = async () => {
    setSaving(true);
    // Save to localStorage or backend
    localStorage.setItem('settings', JSON.stringify({
      githubToken,
      openaiKey,
      anthropicKey,
      ollamaUrl,
    }));
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
  };

  return (
    <div className="space-y-6 animate-in max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Settings</h1>
        <p className="text-dark-500 dark:text-dark-400 mt-1">Configure your Agent Reviewer preferences</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-dark-200 dark:border-dark-700">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Settings tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
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
      {activeTab === 'general' && (
        <GeneralSettingsTab
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          diffViewMode={diffViewMode}
          setDiffViewMode={setDiffViewMode}
        />
      )}
      {activeTab === 'appearance' && (
        <AppearanceSettingsTab theme={theme} setTheme={setTheme} />
      )}
      {activeTab === 'integrations' && (
        <IntegrationsSettingsTab
          githubToken={githubToken}
          setGithubToken={setGithubToken}
          openaiKey={openaiKey}
          setOpenaiKey={setOpenaiKey}
          anthropicKey={anthropicKey}
          setAnthropicKey={setAnthropicKey}
          ollamaUrl={ollamaUrl}
          setOllamaUrl={setOllamaUrl}
          showGithubToken={showGithubToken}
          setShowGithubToken={setShowGithubToken}
          showOpenaiKey={showOpenaiKey}
          setShowOpenaiKey={setShowOpenaiKey}
          showAnthropicKey={showAnthropicKey}
          setShowAnthropicKey={setShowAnthropicKey}
          saving={saving}
          onSave={handleSave}
        />
      )}
      {activeTab === 'notifications' && (
        <NotificationsSettingsTab notifications={notifications} clearNotifications={clearNotifications} />
      )}
      {activeTab === 'advanced' && <AdvancedSettingsTab />}
    </div>
  );
}

function GeneralSettingsTab({ sidebarOpen, setSidebarOpen, diffViewMode, setDiffViewMode }: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  diffViewMode: 'unified' | 'split';
  setDiffViewMode: (mode: 'unified' | 'split') => void;
}) {
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary-600" /> UI Preferences
        </h3>
        <div className="space-y-6">
          <div>
            <label className="label">Sidebar Default State</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sidebar"
                  checked={sidebarOpen}
                  onChange={() => setSidebarOpen(true)}
                  className="text-primary-600"
                />
                <span className="text-sm text-dark-700 dark:text-dark-300">Expanded</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sidebar"
                  checked={!sidebarOpen}
                  onChange={() => setSidebarOpen(false)}
                  className="text-primary-600"
                />
                <span className="text-sm text-dark-700 dark:text-dark-300">Collapsed</span>
              </label>
            </div>
          </div>

          <div>
            <label className="label">Diff View Mode</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="diff-view"
                  checked={diffViewMode === 'unified'}
                  onChange={() => setDiffViewMode('unified')}
                  className="text-primary-600"
                />
                <span className="text-sm text-dark-700 dark:text-dark-300">Unified</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="diff-view"
                  checked={diffViewMode === 'split'}
                  onChange={() => setDiffViewMode('split')}
                  className="text-primary-600"
                />
                <span className="text-sm text-dark-700 dark:text-dark-300">Split</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary-600" /> Data & Privacy
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-dark-200 dark:border-dark-700 rounded-lg">
            <div>
              <p className="font-medium text-dark-900 dark:text-white">Auto-refresh Dashboard</p>
              <p className="text-sm text-dark-500 dark:text-dark-400">Automatically refresh dashboard data every 30 seconds</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-dark-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-dark-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-dark-600 peer-checked:bg-primary-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 border border-dark-200 dark:border-dark-700 rounded-lg">
            <div>
              <p className="font-medium text-dark-900 dark:text-white">Telemetry</p>
              <p className="text-sm text-dark-500 dark:text-dark-400">Send anonymous usage data to improve the product</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-dark-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-dark-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-dark-600 peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppearanceSettingsTab({ theme, setTheme }: { theme: 'light' | 'dark' | 'system'; setTheme: (theme: 'light' | 'dark' | 'system') => void }) {
  const themes: Array<{ id: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode; description: string }> = [
    { id: 'light', label: 'Light', icon: <Sun className="w-5 h-5" />, description: 'Always use light mode' },
    { id: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5" />, description: 'Always use dark mode' },
    { id: 'system', label: 'System', icon: <Monitor className="w-5 h-5" />, description: 'Match your system preference' },
  ];

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary-600" /> Theme
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                'p-4 rounded-xl border-2 transition-all text-left',
                theme === t.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-dark-200 dark:border-dark-700 hover:border-primary-300 dark:hover:border-primary-700'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn('p-2 rounded-lg', theme === t.id ? 'bg-primary-100 dark:bg-primary-900/30' : 'bg-dark-100 dark:bg-dark-800')}>
                  {t.icon}
                </div>
              </div>
              <p className="font-medium text-dark-900 dark:text-white">{t.label}</p>
              <p className="text-sm text-dark-500 dark:text-dark-400 mt-1">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary-600" /> Accent Color (Coming Soon)
        </h3>
        <p className="text-dark-500 dark:text-dark-400">Custom accent colors will be available in a future release.</p>
      </div>
    </div>
  );
}

function IntegrationsSettingsTab({
  githubToken, setGithubToken,
  openaiKey, setOpenaiKey,
  anthropicKey, setAnthropicKey,
  ollamaUrl, setOllamaUrl,
  showGithubToken, setShowGithubToken,
  showOpenaiKey, setShowOpenaiKey,
  showAnthropicKey, setShowAnthropicKey,
  saving, onSave
}: any) {
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-primary-600" /> GitHub
        </h3>
        <p className="text-dark-500 dark:text-dark-400 mb-4">
          Configure GitHub Personal Access Token for API access. In production, use GitHub App authentication instead.
        </p>
        <div className="relative">
          <input
            type={showGithubToken ? 'text' : 'password'}
            placeholder="ghp_************************"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            className="input pr-12"
          />
          <button
            onClick={() => setShowGithubToken(!showGithubToken)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600"
          >
            {showGithubToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-primary-600" /> AI Providers
        </h3>
        <p className="text-dark-500 dark:text-dark-400 mb-4">
          Configure API keys for AI-powered analysis and refactoring. At least one provider is required.
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">OpenAI API Key</label>
            <div className="relative">
              <input
                type={showOpenaiKey ? 'text' : 'password'}
                placeholder="sk-************************"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="input pr-12"
              />
              <button
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600"
              >
                {showOpenaiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-dark-500 dark:text-dark-400 mt-1">Used for GPT-4 analysis and embeddings</p>
          </div>

          <div>
            <label className="label">Anthropic API Key</label>
            <div className="relative">
              <input
                type={showAnthropicKey ? 'text' : 'password'}
                placeholder="sk-ant-************************"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="input pr-12"
              />
              <button
                onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600"
              >
                {showAnthropicKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-dark-500 dark:text-dark-400 mt-1">Used for Claude analysis</p>
          </div>

          <div>
            <label className="label">Ollama Base URL</label>
            <input
              type="text"
              placeholder="http://localhost:11434"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              className="input"
            />
            <p className="text-xs text-dark-500 dark:text-dark-400 mt-1">For local models (CodeLlama, etc.)</p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary-600" /> n8n Integration
        </h3>
        <p className="text-dark-500 dark:text-dark-400 mb-4">
          Configure n8n webhook URL for CI/CD workflow automation.
        </p>
        <input
          type="text"
          placeholder="http://localhost:5678/webhook/github"
          value="http://localhost:5678/webhook/github"
          className="input"
          readOnly
        />
        <p className="text-xs text-dark-500 dark:text-dark-400 mt-1">Set via N8N_WEBHOOK_URL environment variable</p>
      </div>

      <div className="flex justify-end">
        <button onClick={onSave} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function NotificationsSettingsTab({ notifications, clearNotifications }: { notifications: any[]; clearNotifications: () => void }) {
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-dark-900 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary-600" /> Recent Notifications
          </h3>
          {notifications.length > 0 && (
            <button onClick={clearNotifications} className="btn-secondary btn-sm">
              <Trash2 className="w-4 h-4" /> Clear All
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-dark-500 dark:text-dark-400 text-center py-8">No recent notifications</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {notifications.slice().reverse().map((n) => (
              <div key={n.id} className={cn('p-3 rounded-lg flex items-center gap-3', n.type === 'success' && 'bg-green-50 dark:bg-green-900/20', n.type === 'error' && 'bg-red-50 dark:bg-red-900/20', n.type === 'warning' && 'bg-yellow-50 dark:bg-yellow-900/20', n.type === 'info' && 'bg-blue-50 dark:bg-blue-900/20')}>
                <div className={cn('w-2 h-2 rounded-full', n.type === 'success' && 'bg-green-500', n.type === 'error' && 'bg-red-500', n.type === 'warning' && 'bg-yellow-500', n.type === 'info' && 'bg-blue-500')} />
                <p className="text-sm text-dark-700 dark:text-dark-300 flex-1">{n.message}</p>
                <span className="text-xs text-dark-400">{formatRelativeTime(new Date(n.timestamp).toISOString())}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary-600" /> Notification Preferences (Coming Soon)
        </h3>
        <p className="text-dark-500 dark:text-dark-400">Configure notification channels: Email, Slack, Discord, Telegram, Webhooks</p>
      </div>
    </div>
  );
}

function AdvancedSettingsTab() {
  return (
    <div className="space-y-6">
      <div className="card p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <h3 className="text-lg font-semibold text-red-800 dark:text-red-400 mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> Danger Zone
        </h3>
        <p className="text-red-700 dark:text-red-300 mb-4">These actions are irreversible. Please proceed with caution.</p>
        <div className="flex items-center gap-4">
          <button className="btn-danger">Clear All Data</button>
          <button className="btn-secondary">Reset Settings</button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary-600" /> System Information
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-dark-500 dark:text-dark-400">Version</dt>
            <dd className="font-mono text-dark-900 dark:text-white">1.0.0</dd>
          </div>
          <div>
            <dt className="text-dark-500 dark:text-dark-400">Build Date</dt>
            <dd className="font-mono text-dark-900 dark:text-white">2026-11-05</dd>
          </div>
          <div>
            <dt className="text-dark-500 dark:text-dark-400">Node Version</dt>
            <dd className="font-mono text-dark-900 dark:text-white">{process.version || 'N/A'}</dd>
          </div>
          <div>
            <dt className="text-dark-500 dark:text-dark-400">Environment</dt>
            <dd className="font-mono text-dark-900 dark:text-white">{import.meta.env.MODE || 'development'}</dd>
          </div>
        </dl>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary-600" /> Debug Tools (Coming Soon)
        </h3>
        <p className="text-dark-500 dark:text-dark-400">Database inspector, API request log, WebSocket debug console</p>
      </div>
    </div>
  );
}

// Need to import Sun, Moon, Monitor, Loader2, Save, Trash2, AlertCircle, CheckCircle
import { Sun, Moon, Monitor, Loader2, Save, Trash2, AlertCircle, CheckCircle } from 'lucide-react';