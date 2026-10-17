import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, Lock, Unlock, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useUIStore } from '../hooks/useStore';
import { cn } from '../utils/helpers';

export default function Login() {
  const navigate = useNavigate();
  const { addNotification } = useUIStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Simulate login - in production, call auth API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock successful login
      localStorage.setItem('auth_token', 'mock-jwt-token-' + Date.now());
      localStorage.setItem('user', JSON.stringify({ email, name: email.split('@')[0] }));
      
      addNotification({ type: 'success', message: 'Welcome back!' });
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGithubLogin = () => {
    // In production, redirect to GitHub OAuth
    addNotification({ type: 'info', message: 'GitHub OAuth would redirect here' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-50 dark:bg-dark-950 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600">
              <Github className="w-7 h-7 text-white" />
            </div>
          </Link>
          <h1 className="text-3xl font-bold text-dark-900 dark:text-white">Welcome Back</h1>
          <p className="text-dark-500 dark:text-dark-400 mt-2">Sign in to Agent Reviewer to continue</p>
        </div>

        {/* Login Form */}
        <div className="card p-8">
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-3 text-red-700 dark:text-red-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-12"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600"
                >
                  {showPassword ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-dark-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-dark-700 dark:text-dark-300">Remember me</span>
              </label>
              <a href="#" className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Unlock className="w-5 h-5" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-dark-200 dark:border-dark-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-dark-900 text-dark-500 dark:text-dark-400">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGithubLogin}
            disabled={loading}
            className="btn-secondary w-full"
          >
            <Github className="w-5 h-5" />
            Continue with GitHub
          </button>
        </div>

        {/* Demo Notice */}
        <div className="mt-6 p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
            <div className="text-sm text-primary-800 dark:text-primary-200">
              <p className="font-medium">Demo Mode</p>
              <p>Use any email/password to sign in. No real authentication in demo.</p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-dark-500 dark:text-dark-400">
          Don't have an account?{' '}
          <a href="#" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

// Need to import Link
import { Link } from 'react-router-dom';