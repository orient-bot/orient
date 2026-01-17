/**
 * Agents Tab Component
 *
 * Dashboard UI for managing the Agent Registry.
 * Allows CRUD operations on agents, skills, tools, and context rules.
 */

import { useState, useEffect } from 'react';
import {
  getAgents,
  getAgentStats,
  getAgentWithDetails,
  updateAgent,
  toggleAgent,
  setAgentSkills,
  setAgentTools,
  getAvailableSkills,
  assetUrl,
  type Agent,
  type AgentWithDetails,
  type AgentStats,
} from '../api';

interface AgentsTabProps {
  onUpdate?: () => void;
}

// Mascot images for each agent
const AGENT_MASCOTS: Record<string, string> = {
  'pm-assistant': '/mascot/variations/agent-pm-assistant.png',
  communicator: '/mascot/variations/agent-communicator.png',
  scheduler: '/mascot/variations/agent-scheduler.png',
  explorer: '/mascot/variations/agent-explorer.png',
  onboarder: '/mascot/variations/agent-onboarder.png',
  'app-builder': '/mascot/variations/agent-app-builder.png',
};

const getAgentMascot = (agentId: string): string => {
  return assetUrl(AGENT_MASCOTS[agentId] || '/mascot/variations/agents.png');
};

export default function AgentsTab({ onUpdate }: AgentsTabProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentWithDetails | null>(null);
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [editMode, setEditMode] = useState<'skills' | 'tools' | 'details' | null>(null);
  const [togglingAgents, setTogglingAgents] = useState<Set<string>>(new Set());

  // Form state for editing
  const [editSkills, setEditSkills] = useState<string[]>([]);
  const [editAllowTools, setEditAllowTools] = useState<string>('');
  const [editDenyTools, setEditDenyTools] = useState<string>('');
  const [editAskTools, setEditAskTools] = useState<string>('');
  const [editDetails, setEditDetails] = useState<{
    name: string;
    description: string;
    modelDefault: string;
    basePrompt: string;
  }>({ name: '', description: '', modelDefault: '', basePrompt: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [agentsResult, statsResult, skillsResult] = await Promise.all([
        getAgents(),
        getAgentStats(),
        getAvailableSkills(),
      ]);
      setAgents(agentsResult.agents);
      setStats(statsResult);
      setAvailableSkills(skillsResult.skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (agent: Agent) => {
    try {
      setTogglingAgents((prev) => new Set(prev).add(agent.id));
      const updated = await toggleAgent(agent.id, !agent.enabled);
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle agent');
    } finally {
      setTogglingAgents((prev) => {
        const next = new Set(prev);
        next.delete(agent.id);
        return next;
      });
    }
  };

  const handleSelectAgent = async (agent: Agent) => {
    try {
      const details = await getAgentWithDetails(agent.id);
      setSelectedAgent(details);
      setEditMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent details');
    }
  };

  const handleEditSkills = () => {
    if (!selectedAgent) return;
    setEditSkills(selectedAgent.skills.filter((s) => s.enabled).map((s) => s.skillName));
    setEditMode('skills');
  };

  const handleEditTools = () => {
    if (!selectedAgent) return;
    const tools = selectedAgent.tools ?? [];
    setEditAllowTools(
      tools
        .filter((t) => t.type === 'allow')
        .map((t) => t.pattern)
        .join(', ')
    );
    setEditAskTools(
      tools
        .filter((t) => t.type === 'ask')
        .map((t) => t.pattern)
        .join(', ')
    );
    setEditDenyTools(
      tools
        .filter((t) => t.type === 'deny')
        .map((t) => t.pattern)
        .join(', ')
    );
    setEditMode('tools');
  };

  const handleEditDetails = () => {
    if (!selectedAgent) return;
    setEditDetails({
      name: selectedAgent.name,
      description: selectedAgent.description || '',
      modelDefault: selectedAgent.modelDefault || '',
      basePrompt: selectedAgent.basePrompt || '',
    });
    setEditMode('details');
  };

  const handleSaveSkills = async () => {
    if (!selectedAgent) return;
    try {
      await setAgentSkills(selectedAgent.id, editSkills);
      const updated = await getAgentWithDetails(selectedAgent.id);
      setSelectedAgent(updated);
      setEditMode(null);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skills');
    }
  };

  const handleSaveTools = async () => {
    if (!selectedAgent) return;
    try {
      const allow = editAllowTools
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const ask = editAskTools
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const deny = editDenyTools
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await setAgentTools(selectedAgent.id, allow, deny, ask);
      const updated = await getAgentWithDetails(selectedAgent.id);
      setSelectedAgent(updated);
      setEditMode(null);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tools');
    }
  };

  const handleSaveDetails = async () => {
    if (!selectedAgent) return;
    try {
      await updateAgent(selectedAgent.id, editDetails);
      const updated = await getAgentWithDetails(selectedAgent.id);
      setSelectedAgent(updated);
      setAgents((prev) =>
        prev.map((a) => (a.id === updated.id ? { ...a, name: updated.name } : a))
      );
      setEditMode(null);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save details');
    }
  };

  const toggleSkill = (skillName: string) => {
    setEditSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
        <span className="ml-3 text-muted-foreground">Loading agents...</span>
      </div>
    );
  }

  // Agent details panel
  if (selectedAgent) {
    return (
      <div className="space-y-6">
        {/* Back button */}
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedAgent(null)} className="btn btn-ghost p-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
          <img
            src={getAgentMascot(selectedAgent.id)}
            alt={`${selectedAgent.name} mascot`}
            className="w-12 h-12 object-contain"
          />
          <h2 className="text-lg font-semibold">{selectedAgent.name}</h2>
          <span
            className={`px-2 py-0.5 text-xs rounded-full ${
              selectedAgent.enabled
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {selectedAgent.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
            {selectedAgent.mode}
          </span>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 hover:opacity-80">
              ×
            </button>
          </div>
        )}

        {/* Details Section */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Agent Details</h3>
            {editMode !== 'details' && (
              <button onClick={handleEditDetails} className="btn btn-ghost text-sm">
                Edit
              </button>
            )}
          </div>

          {editMode === 'details' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
                <input
                  type="text"
                  value={editDetails.name}
                  onChange={(e) => setEditDetails((d) => ({ ...d, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={editDetails.description}
                  onChange={(e) => setEditDetails((d) => ({ ...d, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={editDetails.modelDefault}
                  onChange={(e) => setEditDetails((d) => ({ ...d, modelDefault: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="anthropic/claude-sonnet-4-20250514"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Base Prompt
                </label>
                <textarea
                  value={editDetails.basePrompt}
                  onChange={(e) => setEditDetails((d) => ({ ...d, basePrompt: e.target.value }))}
                  rows={6}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background font-mono text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveDetails} className="btn btn-primary">
                  Save
                </button>
                <button onClick={() => setEditMode(null)} className="btn btn-ghost">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">ID:</span>{' '}
                <code className="px-1 py-0.5 bg-muted rounded">{selectedAgent.id}</code>
              </div>
              <div>
                <span className="text-muted-foreground">Description:</span>{' '}
                {selectedAgent.description || '-'}
              </div>
              <div>
                <span className="text-muted-foreground">Model:</span>{' '}
                <code className="px-1 py-0.5 bg-muted rounded">
                  {selectedAgent.modelDefault || 'default'}
                </code>
              </div>
              {selectedAgent.basePrompt && (
                <div>
                  <span className="text-muted-foreground">Base Prompt:</span>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap">
                    {selectedAgent.basePrompt.substring(0, 500)}
                    {selectedAgent.basePrompt.length > 500 && '...'}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Skills Section */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">
              Skills ({selectedAgent.skills.filter((s) => s.enabled).length})
            </h3>
            {editMode !== 'skills' && (
              <button onClick={handleEditSkills} className="btn btn-ghost text-sm">
                Edit
              </button>
            )}
          </div>

          {editMode === 'skills' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {availableSkills.map((skill) => (
                  <label
                    key={skill}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={editSkills.includes(skill)}
                      onChange={() => toggleSkill(skill)}
                      className="rounded"
                    />
                    <span className="text-sm truncate">{skill}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveSkills} className="btn btn-primary">
                  Save
                </button>
                <button onClick={() => setEditMode(null)} className="btn btn-ghost">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedAgent.skills
                .filter((s) => s.enabled)
                .map((skill) => (
                  <span
                    key={skill.id}
                    className="px-2 py-1 text-xs bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400 rounded-full"
                  >
                    {skill.skillName}
                  </span>
                ))}
              {selectedAgent.skills.filter((s) => s.enabled).length === 0 && (
                <span className="text-muted-foreground text-sm">No skills assigned</span>
              )}
            </div>
          )}
        </div>

        {/* Tools Section */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Tool Patterns</h3>
            {editMode !== 'tools' && (
              <button onClick={handleEditTools} className="btn btn-ghost text-sm">
                Edit
              </button>
            )}
          </div>

          {editMode === 'tools' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Allowed Tools (comma-separated patterns)
                </label>
                <input
                  type="text"
                  value={editAllowTools}
                  onChange={(e) => setEditAllowTools(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background font-mono text-sm"
                  placeholder="ai_first_*, discover_tools"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Ask Before Using (comma-separated patterns)
                </label>
                <input
                  type="text"
                  value={editAskTools}
                  onChange={(e) => setEditAskTools(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background font-mono text-sm"
                  placeholder="config_*, google_*"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Denied Tools (comma-separated patterns)
                </label>
                <input
                  type="text"
                  value={editDenyTools}
                  onChange={(e) => setEditDenyTools(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background font-mono text-sm"
                  placeholder="write, edit, bash"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveTools} className="btn btn-primary">
                  Save
                </button>
                <button onClick={() => setEditMode(null)} className="btn btn-ghost">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">Allowed:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(selectedAgent.tools ?? [])
                    .filter((t) => t.type === 'allow')
                    .map((tool) => (
                      <code
                        key={tool.id}
                        className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 rounded"
                      >
                        {tool.pattern}
                      </code>
                    ))}
                  {(selectedAgent.tools ?? []).filter((t) => t.type === 'allow').length === 0 && (
                    <span className="text-muted-foreground text-sm">None</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Ask Before Using:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(selectedAgent.tools ?? [])
                    .filter((t) => t.type === 'ask')
                    .map((tool) => (
                      <code
                        key={tool.id}
                        className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 rounded"
                      >
                        {tool.pattern}
                      </code>
                    ))}
                  {(selectedAgent.tools ?? []).filter((t) => t.type === 'ask').length === 0 && (
                    <span className="text-muted-foreground text-sm">None</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Denied:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(selectedAgent.tools ?? [])
                    .filter((t) => t.type === 'deny')
                    .map((tool) => (
                      <code
                        key={tool.id}
                        className="px-2 py-0.5 text-xs bg-destructive/10 text-destructive rounded"
                      >
                        {tool.pattern}
                      </code>
                    ))}
                  {(selectedAgent.tools ?? []).filter((t) => t.type === 'deny').length === 0 && (
                    <span className="text-muted-foreground text-sm">None</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Agents list view
  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
              Total Agents
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight mt-1">{stats.totalAgents}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.enabledAgents} enabled</p>
          </div>
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
              Skills Assigned
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight mt-1">{stats.totalSkills}</p>
          </div>
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
              Context Rules
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight mt-1">
              {stats.totalContextRules}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
              Available Skills
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight mt-1">
              {availableSkills.length}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agent Registry</h2>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:opacity-80">
            ×
          </button>
        </div>
      )}

      {/* Agents list */}
      <div className="card overflow-hidden">
        {agents.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {/* Ori Mascot - Agents coordinator */}
            <div className="w-24 h-24 mx-auto mb-4">
              <img
                src={assetUrl('/mascot/variations/agents.png')}
                alt="Ori is ready to coordinate agents"
                className="w-full h-full object-contain"
              />
            </div>
            <p className="text-lg font-medium">No agents configured yet</p>
            <p className="text-sm mt-1">Let me help you set up your agent team!</p>
            <code className="block mt-3 px-3 py-2 bg-muted rounded text-sm">
              npm run agents:seed
            </code>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Mode
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Model
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {agents.map((agent) => (
                <tr
                  key={agent.id}
                  className={`hover:bg-muted/30 transition-colors cursor-pointer ${
                    !agent.enabled ? 'opacity-60 grayscale' : ''
                  }`}
                  onClick={() => handleSelectAgent(agent)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={getAgentMascot(agent.id)}
                        alt={`${agent.name} mascot`}
                        className="w-10 h-10 object-contain flex-shrink-0"
                      />
                      <div>
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {agent.description?.substring(0, 60)}
                          {agent.description && agent.description.length > 60 ? '...' : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-transparent ${
                        agent.mode === 'primary'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}
                    >
                      {agent.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                    {agent.modelDefault?.split('/')[1] || 'default'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(agent);
                      }}
                      disabled={togglingAgents.has(agent.id)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        agent.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${
                          agent.enabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectAgent(agent);
                      }}
                      className="btn btn-ghost h-8 w-8 p-0"
                      title="View Details"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
