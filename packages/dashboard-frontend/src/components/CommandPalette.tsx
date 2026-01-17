import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Types
export type CommandCategory = 'navigation' | 'action' | 'settings';

export interface Command {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

// Category labels and order
const CATEGORY_LABELS: Record<CommandCategory, string> = {
  navigation: 'Navigate',
  action: 'Actions',
  settings: 'Settings',
};

const CATEGORY_ORDER: CommandCategory[] = ['navigation', 'action', 'settings'];

// Fuzzy search scoring
function fuzzyMatch(query: string, text: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  
  // Exact match = highest score
  if (lowerText === lowerQuery) return 100;
  
  // Starts with = high score
  if (lowerText.startsWith(lowerQuery)) return 80;
  
  // Contains as substring = medium score
  if (lowerText.includes(lowerQuery)) return 60;
  
  // Fuzzy character matching
  let queryIndex = 0;
  let score = 0;
  let consecutiveMatches = 0;
  
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      score += 10 + consecutiveMatches * 5;
      consecutiveMatches++;
      queryIndex++;
    } else {
      consecutiveMatches = 0;
    }
  }
  
  // All query characters must be found
  if (queryIndex < lowerQuery.length) return 0;
  
  return score;
}

function scoreCommand(command: Command, query: string): number {
  if (!query) return 0;
  
  const labelScore = fuzzyMatch(query, command.label);
  const descScore = command.description ? fuzzyMatch(query, command.description) * 0.5 : 0;
  const keywordScores = (command.keywords || []).map(k => fuzzyMatch(query, k) * 0.7);
  const maxKeywordScore = Math.max(0, ...keywordScores);
  
  return Math.max(labelScore, descScore, maxKeywordScore);
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter and sort commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }
    
    return commands
      .map(cmd => ({ cmd, score: scoreCommand(cmd, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ cmd }) => cmd);
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<CommandCategory, Command[]> = {
      navigation: [],
      action: [],
      settings: [],
    };
    
    filteredCommands.forEach(cmd => {
      groups[cmd.category].push(cmd);
    });
    
    return groups;
  }, [filteredCommands]);

  // Flatten for keyboard navigation
  const flatCommands = useMemo(() => {
    return CATEGORY_ORDER.flatMap(cat => groupedCommands[cat]);
  }, [groupedCommands]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && flatCommands[selectedIndex]) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, flatCommands]);

  const executeCommand = useCallback((command: Command) => {
    command.action();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatCommands[selectedIndex]) {
          executeCommand(flatCommands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [flatCommands, selectedIndex, executeCommand, onClose]);

  if (!isOpen) return null;

  let globalIndex = -1;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
        <div 
          className="w-full max-w-xl bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-scale-in"
          onClick={e => e.stopPropagation()}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="text-muted-foreground shrink-0"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search..."
              className="flex-1 h-14 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground bg-secondary rounded border border-border">
              ESC
            </kbd>
          </div>

          {/* Command List */}
          <div 
            ref={listRef}
            className="max-h-[60vh] overflow-y-auto p-2"
          >
            {flatCommands.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground text-sm">No commands found</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Try a different search term</p>
              </div>
            ) : (
              CATEGORY_ORDER.map(category => {
                const categoryCommands = groupedCommands[category];
                if (categoryCommands.length === 0) return null;
                
                return (
                  <div key={category} className="mb-2 last:mb-0">
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {CATEGORY_LABELS[category]}
                    </div>
                    <div className="space-y-0.5">
                      {categoryCommands.map(command => {
                        globalIndex++;
                        const isSelected = globalIndex === selectedIndex;
                        const currentIndex = globalIndex;
                        
                        return (
                          <button
                            key={command.id}
                            data-index={currentIndex}
                            onClick={() => executeCommand(command)}
                            onMouseEnter={() => setSelectedIndex(currentIndex)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                              isSelected 
                                ? 'bg-accent text-accent-foreground' 
                                : 'text-foreground hover:bg-accent/50'
                            }`}
                          >
                            {command.icon && (
                              <span className={`shrink-0 ${isSelected ? 'text-accent-foreground' : 'text-muted-foreground'}`}>
                                {command.icon}
                              </span>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {command.label}
                              </div>
                              {command.description && (
                                <div className={`text-xs truncate ${isSelected ? 'text-accent-foreground/70' : 'text-muted-foreground'}`}>
                                  {command.description}
                                </div>
                              )}
                            </div>
                            {command.shortcut && (
                              <kbd className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                isSelected 
                                  ? 'bg-accent-foreground/10 text-accent-foreground' 
                                  : 'bg-secondary text-muted-foreground'
                              }`}>
                                {command.shortcut}
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/30">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px]">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px]">↓</kbd>
                <span>navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px]">↵</kbd>
                <span>select</span>
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {flatCommands.length} command{flatCommands.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Hook to manage command palette state and keyboard shortcut
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  return { isOpen, open, close, toggle };
}
