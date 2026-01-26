'use client'

import { useState, useEffect } from 'react'

interface Registration {
  id: string
  name: string
  email: string
  company?: string
  linkedin?: string
  twitter?: string
  kolCode?: string
  createdAt: string
}

interface Stats {
  total: number
  byKol: Record<string, number>
  registrations: Registration[]
}

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedKol, setSelectedKol] = useState<string>('all')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/stats', {
        headers: {
          'Authorization': `Bearer ${password}`,
        },
      })

      if (!response.ok) {
        throw new Error('סיסמה שגויה')
      }

      const data = await response.json()
      setStats(data)
      setIsAuthenticated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  const refreshStats = async () => {
    if (!password) return
    setLoading(true)

    try {
      const response = await fetch('/api/stats', {
        headers: {
          'Authorization': `Bearer ${password}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = () => {
    if (!stats) return

    const headers = ['ID', 'Name', 'Email', 'Company', 'LinkedIn', 'Twitter', 'KOL Code', 'Created At']
    const filteredRegistrations = selectedKol === 'all'
      ? stats.registrations
      : stats.registrations.filter(r => (r.kolCode || 'direct') === selectedKol)

    const rows = filteredRegistrations.map(r => [
      r.id,
      r.name,
      r.email,
      r.company || '',
      r.linkedin || '',
      r.twitter || '',
      r.kolCode || 'direct',
      r.createdAt,
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `the-shift-registrations-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-6">כניסת מנהל</h1>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              סיסמה
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-background border border-white/10 rounded-lg px-4 py-3 text-text-primary mb-4"
              placeholder="הכנס סיסמת מנהל"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50"
            >
              {loading ? 'מתחבר...' : 'התחבר'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const filteredRegistrations = stats && selectedKol === 'all'
    ? stats.registrations
    : stats?.registrations.filter(r => (r.kolCode || 'direct') === selectedKol) || []

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-bold">לוח בקרה - השינוי</h1>
          <div className="flex gap-2">
            <button
              onClick={refreshStats}
              disabled={loading}
              className="px-4 py-2 bg-surface border border-white/10 rounded-lg hover:border-electric-blue/30 transition-colors disabled:opacity-50"
            >
              {loading ? 'מרענן...' : 'רענן'}
            </button>
            <button
              onClick={exportCSV}
              className="px-4 py-2 bg-electric-blue text-white rounded-lg hover:bg-electric-blue/80 transition-colors"
            >
              ייצא CSV
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            <p className="text-text-secondary text-sm mb-1">סה"כ נרשמים</p>
            <p className="text-4xl font-bold gradient-text">{stats?.total || 0}</p>
          </div>
          <div className="bg-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            <p className="text-text-secondary text-sm mb-1">KOL פעילים</p>
            <p className="text-4xl font-bold text-accent">{Object.keys(stats?.byKol || {}).filter(k => k !== 'direct').length}</p>
          </div>
          <div className="bg-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            <p className="text-text-secondary text-sm mb-1">הרשמות ישירות</p>
            <p className="text-4xl font-bold text-text-primary">{stats?.byKol?.direct || 0}</p>
          </div>
        </div>

        {/* KOL Stats */}
        <div className="bg-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">סטטיסטיקות לפי KOL</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setSelectedKol('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedKol === 'all'
                  ? 'bg-electric-blue text-white'
                  : 'bg-background border border-white/10 hover:border-electric-blue/30'
              }`}
            >
              הכל ({stats?.total || 0})
            </button>
            {Object.entries(stats?.byKol || {}).map(([code, count]) => (
              <button
                key={code}
                onClick={() => setSelectedKol(code)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedKol === code
                    ? 'bg-electric-blue text-white'
                    : 'bg-background border border-white/10 hover:border-electric-blue/30'
                }`}
              >
                {code} ({count})
              </button>
            ))}
          </div>
        </div>

        {/* Registrations Table */}
        <div className="bg-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h2 className="text-xl font-semibold">
              נרשמים {selectedKol !== 'all' && `(${selectedKol})`} - {filteredRegistrations.length}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-background/50">
                  <th className="text-right px-6 py-3 text-text-secondary text-sm font-medium">שם</th>
                  <th className="text-right px-6 py-3 text-text-secondary text-sm font-medium">אימייל</th>
                  <th className="text-right px-6 py-3 text-text-secondary text-sm font-medium">חברה</th>
                  <th className="text-right px-6 py-3 text-text-secondary text-sm font-medium">KOL</th>
                  <th className="text-right px-6 py-3 text-text-secondary text-sm font-medium">תאריך</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-text-secondary">
                      אין נרשמים עדיין
                    </td>
                  </tr>
                ) : (
                  filteredRegistrations.map((reg) => (
                    <tr key={reg.id} className="border-t border-white/5 hover:bg-background/30">
                      <td className="px-6 py-4">{reg.name}</td>
                      <td className="px-6 py-4 text-text-secondary" dir="ltr">{reg.email}</td>
                      <td className="px-6 py-4 text-text-secondary">{reg.company || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-sm ${
                          reg.kolCode
                            ? 'bg-electric-blue/20 text-electric-blue'
                            : 'bg-white/5 text-text-secondary'
                        }`}>
                          {reg.kolCode || 'direct'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-text-secondary text-sm" dir="ltr">
                        {new Date(reg.createdAt).toLocaleString('he-IL')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
