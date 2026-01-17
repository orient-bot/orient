/**
 * Meeting Scheduler App
 *
 * Allows users to select a time slot and schedule a meeting.
 */

import React, { useEffect, useState } from 'react';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, DateTimePicker } from '../../_shared/ui';

interface MeetingForm {
  title: string;
  description: string;
  attendees: string;
  dateTime: Date | null;
  duration: number;
  sendReminder: boolean;
}

interface MeetingRecord {
  id: number;
  title: string;
  description: string | null;
  attendees: string | null;
  startTime: string;
  durationMinutes: number;
  sendReminder: boolean;
  createdAt: string;
}

export default function MeetingScheduler() {
  const apiBase = import.meta.env.VITE_DEMO_API_BASE || '';
  const [form, setForm] = useState<MeetingForm>({
    title: '',
    description: '',
    attendees: '',
    dateTime: null,
    duration: 60,
    sendReminder: true,
  });
  const [loading, setLoading] = useState(false);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMeetings = async () => {
    try {
      setLoadingMeetings(true);
      const response = await fetch(`${apiBase}/api/demo/meetings`);
      if (!response.ok) {
        throw new Error('Failed to load meetings');
      }
      const data = await response.json();
      setMeetings(data.meetings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings');
    } finally {
      setLoadingMeetings(false);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.dateTime) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/demo/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          attendees: form.attendees,
          dateTime: form.dateTime.toISOString(),
          durationMinutes: form.duration,
          sendReminder: form.sendReminder,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to save meeting');
      }

      setSuccess(true);
      await loadMeetings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meeting');
    } finally {
      setLoading(false);
    }
  };

  const formatMeetingTime = (value: string) => new Date(value).toLocaleString();

  if (success) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-green-600">Meeting Scheduled!</CardTitle>
            <CardDescription>
            Your meeting "{form.title}" has been saved to the demo database.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
            {form.sendReminder && 'Reminder preference saved for demo purposes.'}
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => { setSuccess(false); setForm({ title: '', description: '', attendees: '', dateTime: null, duration: 60, sendReminder: true }); }}>
              Schedule Another
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-md mx-auto mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
        <strong>Demo Mode</strong> - Meetings are stored in the local database for this demo.
      </div>
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Schedule a Meeting</CardTitle>
            <CardDescription>
              Save a meeting to the local demo database
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <Input
                label="Meeting Title"
                placeholder="Team Standup"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />

              <Input
                label="Description"
                placeholder="Weekly sync to discuss progress"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />

              <Input
                label="Attendees"
                placeholder="email1@example.com, email2@example.com"
                value={form.attendees}
                onChange={(e) => setForm({ ...form, attendees: e.target.value })}
                helperText="Comma-separated email addresses"
              />

              <DateTimePicker
                label="Date & Time"
                value={form.dateTime}
                onChange={(date) => setForm({ ...form, dateTime: date })}
                minDate={new Date()}
                required
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">Duration</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: parseInt(e.target.value) })}
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="reminder"
                  checked={form.sendReminder}
                  onChange={(e) => setForm({ ...form, sendReminder: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <label htmlFor="reminder" className="text-sm font-medium">
                  Store reminder preference (demo only)
                </label>
              </div>

              {error && (
                <div className="text-sm text-red-500 p-2 bg-red-50 rounded-md border border-red-200">
                  {error}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                loading={loading}
                disabled={!form.title || !form.dateTime}
                className="w-full"
              >
                Schedule Meeting
              </Button>
            </CardFooter>
          </form>
        </Card>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent Demo Meetings</CardTitle>
            <CardDescription>
              Stored entries from this local demo
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMeetings ? (
              <div className="text-sm text-muted-foreground">Loading meetings...</div>
            ) : meetings.length === 0 ? (
              <div className="text-sm text-muted-foreground">No meetings yet. Add one above.</div>
            ) : (
              <div className="space-y-3">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="rounded-md border border-border p-3 space-y-1"
                  >
                    <div className="font-medium text-foreground">{meeting.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatMeetingTime(meeting.startTime)} · {meeting.durationMinutes} min
                    </div>
                    {meeting.attendees && (
                      <div className="text-xs text-muted-foreground">
                        Attendees: {meeting.attendees}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
