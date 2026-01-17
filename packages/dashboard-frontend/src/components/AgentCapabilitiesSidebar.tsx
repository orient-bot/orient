import { useState, useEffect, useMemo } from 'react';
import {
  getAgentCapabilities,
  type AgentCapabilities,
  type CategoryInfo,
  type SkillInfo,
  type ToolInfo,
} from '../api';

interface AgentCapabilitiesSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// Category color mapping - dark mode aware
const categoryColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  jira: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
  messaging: { bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-800', text: 'text-violet-700 dark:text-violet-300', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300' },
  whatsapp: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' },
  docs: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  system: { bg: 'bg-slate-50 dark:bg-slate-900/30', border: 'border-slate-200 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300' },
};

// Category icons
const categoryIcons: Record<string, JSX.Element> = {
  jira: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/>
    </svg>
  ),
  messaging: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  ),
  whatsapp: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.79 23.502l4.587-1.477A11.948 11.948 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-2.234 0-4.308-.722-5.996-1.945l-.43-.306-3.204 1.033 1.052-3.13-.335-.454A9.712 9.712 0 0 1 2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z"/>
    </svg>
  ),
  docs: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  system: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

function ToolItem({ tool, category }: { tool: ToolInfo; category: string }) {
  const colors = categoryColors[category] || categoryColors.system;
  
  return (
    <div className="py-2 px-3 hover:bg-accent/50 rounded-lg transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <code className="text-xs font-mono text-foreground break-all">{tool.name}</code>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
          {tool.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tool.keywords.slice(0, 4).map((keyword, i) => (
                <span
                  key={i}
                  className={`px-1.5 py-0.5 text-[10px] rounded ${colors.badge}`}
                >
                  {keyword}
                </span>
              ))}
              {tool.keywords.length > 4 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-secondary text-muted-foreground">
                  +{tool.keywords.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ category, isExpanded, onToggle, searchQuery }: { 
  category: CategoryInfo; 
  isExpanded: boolean; 
  onToggle: () => void;
  searchQuery: string;
}) {
  const colors = categoryColors[category.name] || categoryColors.system;
  const icon = categoryIcons[category.name] || categoryIcons.system;
  
  // Filter tools based on search
  const filteredTools = useMemo(() => {
    if (!searchQuery) return category.tools;
    const query = searchQuery.toLowerCase();
    return category.tools.filter(
      tool =>
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query) ||
        tool.keywords.some(k => k.toLowerCase().includes(query))
    );
  }, [category.tools, searchQuery]);

  if (searchQuery && filteredTools.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} overflow-hidden transition-all`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-background/50 transition-colors"
      >
        <div className={colors.text}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className={`font-semibold text-sm capitalize ${colors.text}`}>{category.name}</h4>
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
              {filteredTools.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{category.description}</p>
        </div>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isExpanded && (
        <div className="border-t border-border bg-card/80 max-h-64 overflow-y-auto">
          {filteredTools.map((tool, i) => (
            <ToolItem key={i} tool={tool} category={category.name} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillInfo }) {
  return (
    <div className="p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground">{skill.name}</h4>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
        </div>
      </div>
    </div>
  );
}

export default function AgentCapabilitiesSidebar({ isOpen, onClose }: AgentCapabilitiesSidebarProps) {
  const [capabilities, setCapabilities] = useState<AgentCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [skillsExpanded, setSkillsExpanded] = useState(true);

  useEffect(() => {
    if (isOpen && !capabilities) {
      loadCapabilities();
    }
  }, [isOpen]);

  const loadCapabilities = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAgentCapabilities();
      setCapabilities(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load capabilities');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Filter skills based on search
  const filteredSkills = useMemo(() => {
    if (!capabilities || !searchQuery) return capabilities?.skills || [];
    const query = searchQuery.toLowerCase();
    return capabilities.skills.filter(
      skill =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query)
    );
  }, [capabilities, searchQuery]);

  // Filter categories that have matching tools
  const filteredCategories = useMemo(() => {
    if (!capabilities) return [];
    if (!searchQuery) return capabilities.categories;
    
    const query = searchQuery.toLowerCase();
    return capabilities.categories.filter(cat =>
      cat.tools.some(
        tool =>
          tool.name.toLowerCase().includes(query) ||
          tool.description.toLowerCase().includes(query) ||
          tool.keywords.some(k => k.toLowerCase().includes(query))
      )
    );
  }, [capabilities, searchQuery]);

  // Calculate totals
  const totalTools = capabilities?.categories.reduce((sum, cat) => sum + cat.tools.length, 0) || 0;
  const totalSkills = capabilities?.skills.length || 0;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`capabilities-sidebar fixed right-0 top-0 h-full w-[380px] max-w-[90vw] bg-background border-l border-border shadow-xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Agent Capabilities</h2>
              <p className="text-xs text-muted-foreground">
                {totalSkills} skills · {totalTools} tools
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search skills and tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-background text-foreground border border-input rounded-lg focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-accent rounded"
              >
                <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ height: 'calc(100% - 140px)' }}>
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {error}
              <button
                onClick={loadCapabilities}
                className="block mt-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 underline text-xs"
              >
                Try again
              </button>
            </div>
          )}

          {capabilities && !isLoading && (
            <>
              {/* Skills Section */}
              {filteredSkills.length > 0 && (
                <div>
                  <button
                    onClick={() => setSkillsExpanded(!skillsExpanded)}
                    className="flex items-center gap-2 w-full text-left mb-2"
                  >
                    <svg
                      className={`w-4 h-4 text-muted-foreground transition-transform ${skillsExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Skills ({filteredSkills.length})
                    </h3>
                  </button>
                  
                  {skillsExpanded && (
                    <div className="space-y-2 ml-6">
                      {filteredSkills.map((skill, i) => (
                        <SkillCard key={i} skill={skill} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tools Section */}
              {filteredCategories.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 ml-6">
                    Tools by Category
                  </h3>
                  <div className="space-y-2">
                    {filteredCategories.map((category, i) => (
                      <CategoryCard
                        key={i}
                        category={category}
                        isExpanded={expandedCategories.has(category.name)}
                        onToggle={() => toggleCategory(category.name)}
                        searchQuery={searchQuery}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No results */}
              {searchQuery && filteredSkills.length === 0 && filteredCategories.length === 0 && (
                <div className="text-center py-8">
                  <svg
                    className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-muted-foreground">No matching skills or tools</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}



