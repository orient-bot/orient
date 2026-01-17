import type { DashboardStats } from '../api';

interface StatsCardsProps {
  stats: DashboardStats;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Chats */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-surface-500">Configured Chats</p>
            <p className="text-2xl font-semibold text-surface-900 mt-1">{stats.totalChats}</p>
          </div>
          <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Read+Write */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-surface-500">Read + Write</p>
            <p className="text-2xl font-semibold text-surface-900 mt-1">{stats.byPermission.read_write}</p>
          </div>
          <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Read Only */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-surface-500">Read Only</p>
            <p className="text-2xl font-semibold text-surface-900 mt-1">{stats.byPermission.read_only}</p>
          </div>
          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Total Messages */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-surface-500">Total Messages</p>
            <p className="text-2xl font-semibold text-surface-900 mt-1">{stats.totalMessages.toLocaleString()}</p>
          </div>
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}



