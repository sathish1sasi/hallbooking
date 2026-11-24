import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { runDailyJob } from '@/lib/server/daily-job';

export const dynamic = 'force-dynamic';

// Lets an admin run the daily job by hand ("Send now") or preview it (?dry=1).
export async function POST(req: NextRequest) {
  const store = cookies();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: () => {} },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { data: me } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Only admins can run reminders.' }, { status: 403 });

  try {
    const dryRun = req.nextUrl.searchParams.get('dry') === '1';
    return NextResponse.json(await runDailyJob({ dryRun }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
