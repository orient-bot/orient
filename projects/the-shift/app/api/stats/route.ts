import { NextRequest, NextResponse } from 'next/server';
import { getStats, getAllRegistrations } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Check admin password
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || token !== adminPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get stats and registrations
    const [stats, registrations] = await Promise.all([getStats(), getAllRegistrations()]);

    // Sort registrations by date (newest first)
    const sortedRegistrations = registrations.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({
      ...stats,
      registrations: sortedRegistrations,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'אירעה שגיאה בשרת' }, { status: 500 });
  }
}
