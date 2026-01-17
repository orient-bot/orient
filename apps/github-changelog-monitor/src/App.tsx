import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../_shared/ui';
import { Button } from '../../_shared/ui';
import { Input } from '../../_shared/ui';

interface MonitorJob {
  id: number;
  repoUrl: string;
  slackChannel: string;
  scheduleTime: string;
  lastChecked?: string | null;
  status: 'active' | 'paused';
}

interface ReleaseData {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

const App: React.FC = () => {
  const apiBase = import.meta.env.VITE_DEMO_API_BASE || '';
  const [jobs, setJobs] = useState<MonitorJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [repoUrl, setRepoUrl] = useState('');
  const [slackChannel, setSlackChannel] = useState('#orienter-updates');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  
  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBase}/api/demo/github-monitors`);
      if (!response.ok) {
        throw new Error('Failed to load monitors');
      }
      const data = await response.json();
      const monitors = (data.monitors || []).map((monitor: any) => ({
        id: monitor.id,
        repoUrl: monitor.repoUrl,
        slackChannel: monitor.slackChannel,
        scheduleTime: monitor.scheduleTime,
        lastChecked: monitor.lastChecked,
        status: monitor.isActive ? 'active' as const : 'paused' as const,
      }));
      setJobs(monitors);
    } catch (err) {
      setError('Failed to load monitor jobs');
    } finally {
      setLoading(false);
    }
  };

  const extractRepoInfo = (url: string) => {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    return match ? { owner: match[1], repo: match[2] } : null;
  };

  const isRelevantToAI = (content: string): boolean => {
    const keywords = [
      'ai', 'artificial intelligence', 'machine learning', 'ml',
      'automation', 'project management', 'jira', 'slack', 'whatsapp',
      'workflow', 'integration', 'api', 'webhook', 'bot', 'assistant',
      'task', 'productivity', 'collaboration', 'agile', 'scrum'
    ];
    
    const lowerContent = content.toLowerCase();
    return keywords.some(keyword => lowerContent.includes(keyword));
  };

  const formatSlackMessage = (releases: ReleaseData[], repoName: string) => {
    const relevantReleases = releases.filter(release => 
      isRelevantToAI(release.name + ' ' + release.body)
    );
    
    if (relevantReleases.length === 0) return null;
    
    let message = `🚀 *New AI-relevant updates in ${repoName}*\n\n`;
    
    relevantReleases.forEach(release => {
      message += `*${release.name || release.tag_name}*\n`;
      message += `📅 Released: ${new Date(release.published_at).toLocaleDateString()}\n`;
      
      // Extract first few lines of release notes
      const bodyLines = release.body.split('\n').filter(line => line.trim());
      const summary = bodyLines.slice(0, 3).join('\n');
      message += `📝 ${summary}\n`;
      message += `🔗 <${release.html_url}|View Release>\n\n`;
    });
    
    return message;
  };

  const getNextRunTime = (timeValue: string): string | null => {
    const [hours, minutes] = timeValue.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    const next = new Date();
    next.setHours(hours, minutes, 0, 0);
    if (next < new Date()) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  };

  const createMonitorJob = async () => {
    if (!repoUrl.trim() || !slackChannel.trim()) {
      setError('Please provide both repository URL and Slack channel');
      return;
    }

    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      setError('Invalid GitHub repository URL. Please use format: https://github.com/owner/repo');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${apiBase}/api/demo/github-monitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          slackChannel,
          scheduleTime,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to create monitor');
      }

      setSuccess(`Monitor job created for ${repoInfo.owner}/${repoInfo.repo}`);
      setRepoUrl('');
      await loadJobs();
    } catch (err) {
      setError('Failed to create monitor job: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const testMonitor = async (job: MonitorJob) => {
    const repoInfo = extractRepoInfo(job.repoUrl);
    if (!repoInfo) {
      setError('Invalid GitHub repository URL for this monitor');
      return;
    }
    const { owner, repo } = repoInfo;

    try {
      setLoading(true);
      
      // Fetch latest releases from GitHub
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      const releases: ReleaseData[] = await response.json();
      
      if (releases.length === 0) {
        setError('No releases found in repository');
        return;
      }
      
      // Get releases from last 7 days for testing
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentReleases = releases.filter(release => 
        new Date(release.published_at) > weekAgo
      );
      
      const message = formatSlackMessage(recentReleases, `${owner}/${repo}`);
      
      if (message) {
        const preview = message.split('\n').slice(0, 6).join('\n');
        setSuccess(`Test complete. Preview:\n\n${preview}`);
      } else {
        setSuccess('No AI-relevant updates found in recent releases');
      }

      await fetch(`${apiBase}/api/demo/github-monitors/${job.id}/check`, { method: 'POST' });
      await loadJobs();
    } catch (err) {
      setError('Test failed: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const deleteJob = async (jobId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBase}/api/demo/github-monitors/${jobId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to delete monitor');
      }
      setSuccess('Monitor job deleted');
      await loadJobs();
    } catch (err) {
      setError('Failed to delete job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="max-w-2xl mx-auto p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
          <strong>Demo Mode</strong> - Monitors are stored in the local database for this demo.
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground mb-2">GitHub Changelog Monitor</h1>
          <p className="text-muted-foreground">
            Daily monitoring of repository changelogs for Orient Task Force updates
          </p>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <p className="text-red-800 text-sm">{error}</p>
            </CardContent>
          </Card>
        )}

        {success && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <p className="text-green-800 text-sm">{success}</p>
            </CardContent>
          </Card>
        )}

        {/* Create New Monitor */}
        <Card>
          <CardHeader>
            <CardTitle>Add Repository Monitor</CardTitle>
            <CardDescription>
              Configure a new GitHub repository to monitor for AI-relevant updates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="GitHub Repository URL"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
              helperText="Enter the full GitHub repository URL"
            />
            
            <Input
              label="Slack Channel"
              value={slackChannel}
              onChange={(e) => setSlackChannel(e.target.value)}
              placeholder="#orienter-updates"
              helperText="Channel where notifications will be sent"
            />
            
            <Input
              type="time"
              label="Daily Check Time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              helperText="When to check for updates each day"
            />
            
            <Button
              onClick={createMonitorJob}
              loading={loading}
              className="w-full"
            >
              Create Monitor
            </Button>
          </CardContent>
        </Card>

        {/* Active Monitors */}
        <Card>
          <CardHeader>
            <CardTitle>Active Monitors ({jobs.length})</CardTitle>
            <CardDescription>
              Manage your GitHub repository monitors
            </CardDescription>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No monitors configured yet. Add a repository above to get started.
              </p>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="border border-border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-medium text-foreground">{job.repoUrl}</h3>
                        <p className="text-sm text-muted-foreground">→ {job.slackChannel}</p>
                        <p className="text-sm text-muted-foreground">Schedule: {job.scheduleTime}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          job.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {job.status}
                        </span>
                      </div>
                    </div>
                    
                    {job.lastChecked && (
                      <p className="text-xs text-muted-foreground font-mono">
                        Last checked: {new Date(job.lastChecked).toLocaleString()}
                      </p>
                    )}
                    
                    {getNextRunTime(job.scheduleTime) && (
                      <p className="text-xs text-muted-foreground font-mono">
                        Next run: {new Date(getNextRunTime(job.scheduleTime) as string).toLocaleString()}
                      </p>
                    )}
                    
                    <div className="flex space-x-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => testMonitor(job)}
                        loading={loading}
                      >
                        Test Now
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteJob(job.id)}
                        loading={loading}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• Each monitor checks the specified GitHub repository daily at your chosen time</p>
            <p>• The system fetches the latest releases and analyzes them for AI-relevant keywords</p>
            <p>• Relevant keywords include: AI, automation, project management, JIRA, Slack, WhatsApp, etc.</p>
            <p>• Test runs show a preview message and update the last checked timestamp</p>
            <p>• Demo data is stored locally in the database for this session</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default App;