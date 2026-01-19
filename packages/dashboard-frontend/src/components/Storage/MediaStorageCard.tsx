import type { MediaStorageStats } from '../../api';

interface Props {
  stats: MediaStorageStats;
}

interface MediaTypeInfo {
  key: keyof MediaStorageStats['byType'];
  label: string;
  icon: React.ReactNode;
  color: string;
}

const mediaTypes: MediaTypeInfo[] = [
  {
    key: 'image',
    label: 'Images',
    color: 'bg-blue-500',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    ),
  },
  {
    key: 'audio',
    label: 'Audio',
    color: 'bg-violet-500',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    key: 'video',
    label: 'Video',
    color: 'bg-red-500',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m22 8-6 4 6 4V8Z" />
        <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
      </svg>
    ),
  },
  {
    key: 'document',
    label: 'Documents',
    color: 'bg-amber-500',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M10 9H8" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </svg>
    ),
  },
];

export function MediaStorageCard({ stats }: Props) {
  const total = stats.totalFiles;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <svg
            className="w-4 h-4 text-purple-600 dark:text-purple-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.29 7 12 12 20.71 7" />
            <line x1="12" x2="12" y1="22" y2="12" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold">Media Storage</h3>
          <p className="text-xs text-muted-foreground">Files from messages</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-secondary rounded-full overflow-hidden flex mb-4">
        {total > 0 ? (
          mediaTypes.map((type) => {
            const count = stats.byType[type.key];
            const percent = (count / total) * 100;
            if (percent === 0) return null;
            return (
              <div
                key={type.key}
                className={`${type.color} h-full`}
                style={{ width: `${percent}%` }}
                title={`${type.label}: ${count} (${percent.toFixed(1)}%)`}
              />
            );
          })
        ) : (
          <div className="w-full h-full bg-secondary" />
        )}
      </div>

      {/* Type breakdown */}
      <div className="grid grid-cols-2 gap-3">
        {mediaTypes.map((type) => {
          const count = stats.byType[type.key];
          const percent = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
          return (
            <div
              key={type.key}
              className="flex items-center gap-2 py-2 px-3 rounded-lg bg-secondary/50"
            >
              <div className={`w-3 h-3 rounded-full ${type.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {type.icon}
                  <span className="text-sm truncate">{type.label}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono font-semibold">{count.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground ml-1">({percent}%)</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Date range */}
      {(stats.oldestMedia || stats.newestMedia) && (
        <div className="mt-4 pt-4 border-t border-border space-y-1">
          {stats.oldestMedia && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Oldest media</span>
              <span>{new Date(stats.oldestMedia).toLocaleDateString()}</span>
            </div>
          )}
          {stats.newestMedia && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Newest media</span>
              <span>{new Date(stats.newestMedia).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total files</span>
          <span className="font-mono font-semibold">{total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
