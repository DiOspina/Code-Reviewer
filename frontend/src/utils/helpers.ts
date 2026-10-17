import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    critical: 'text-red-600 dark:text-red-400',
    high: 'text-orange-600 dark:text-orange-400',
    medium: 'text-yellow-600 dark:text-yellow-400',
    low: 'text-blue-600 dark:text-blue-400',
    info: 'text-gray-600 dark:text-gray-400',
  };
  return colors[severity] || 'text-gray-600';
}

export function getSeverityBadgeClass(severity: string): string {
  const classes: Record<string, string> = {
    critical: 'badge-critical',
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low',
    info: 'badge-info',
  };
  return classes[severity] || 'badge-info';
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    security: '🔒',
    performance: '⚡',
    maintainability: '🔧',
    style: '🎨',
    bug: '🐛',
    duplication: '📋',
    antipattern: '⚠️',
  };
  return icons[category] || '📄';
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    security: 'Security',
    performance: 'Performance',
    maintainability: 'Maintainability',
    style: 'Code Style',
    bug: 'Bug',
    duplication: 'Duplication',
    antipattern: 'Anti-pattern',
  };
  return labels[category] || category;
}

export function calculateTechnicalDebtScore(findings: Array<{ severity: string }>): number {
  const weights = { critical: 20, high: 10, medium: 5, low: 2, info: 1 };
  return findings.reduce((sum, f) => sum + (weights[f.severity as keyof typeof weights] || 0), 0);
}

export function parseDiff(diff: string): Array<{ type: 'added' | 'removed' | 'unchanged'; content: string; lineNumber?: number }> {
  const lines = diff.split('\n');
  const result: Array<{ type: 'added' | 'removed' | 'unchanged'; content: string; lineNumber?: number }> = [];

  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
      // Parse line numbers from @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10) - 1;
        newLineNum = parseInt(match[2], 10) - 1;
      }
      continue;
    }

    if (line.startsWith('+')) {
      result.push({ type: 'added', content: line.slice(1), lineNumber: newLineNum++ });
    } else if (line.startsWith('-')) {
      result.push({ type: 'removed', content: line.slice(1), lineNumber: oldLineNum++ });
    } else {
      result.push({ type: 'unchanged', content: line, lineNumber: newLineNum++ });
      oldLineNum++;
      newLineNum++;
    }
  }

  return result;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
}

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2);
}

export function getLanguageFromExtension(ext: string): string {
  const languages: Record<string, string> = {
    py: 'python',
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
  };
  return languages[ext.toLowerCase()] || 'plaintext';
}