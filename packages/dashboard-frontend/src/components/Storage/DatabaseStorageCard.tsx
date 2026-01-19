import { useState } from 'react';
import type { DatabaseStorageStats } from '../../api';

interface Props {
  stats: DatabaseStorageStats;
}

export function DatabaseStorageCard({ stats }: Props) {
  const [expanded, setExpanded] = useState(false);

  const sortedTables = [...stats.tables].sort((a, b) => b.rowCount - a.rowCount);
  const displayTables = expanded ? sortedTables : sortedTables.slice(0, 5);
  const hasMore = sortedTables.length > 5;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-blue-600 dark:text-blue-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5V19A9 3 0 0 0 21 19V5" />
              <path d="M3 12A9 3 0 0 0 21 12" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">Database Storage</h3>
            <p className="text-xs text-muted-foreground">PostgreSQL tables</p>
          </div>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            stats.connectionStatus === 'connected'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}
        >
          {stats.connectionStatus === 'connected' ? 'Connected' : 'Error'}
        </span>
      </div>

      {stats.error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400">{stats.error}</p>
        </div>
      )}

      <div className="space-y-2">
        {displayTables.map((table) => (
          <div
            key={table.tableName}
            className="flex items-center justify-between py-2 border-b border-border last:border-0"
          >
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2 2 3 4 3h8c2 0 4-1 4-3V7c0-2-2-3-4-3H8c-2 0-4 1-4 3z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
              </svg>
              <code className="text-sm">{table.tableName}</code>
            </div>
            <span className="text-sm font-mono text-muted-foreground">
              {table.rowCount.toLocaleString()} rows
            </span>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
        >
          {expanded ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
              Show less
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
              Show {sortedTables.length - 5} more tables
            </>
          )}
        </button>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total rows</span>
          <span className="font-mono font-semibold">{stats.totalRows.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
