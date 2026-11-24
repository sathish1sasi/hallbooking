import { NextResponse, type NextRequest } from 'next/server';
import { runDailyJob } from '@/lib/server/daily-job';

export const dynamic = 'force-dynamic';

// Called once a day by Vercel Cron (see vercel.json). Vercel sends
// "Authorization: Bearer $CRON_SECRET" automatically when CRON_SECRET is set.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDailyJob());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
