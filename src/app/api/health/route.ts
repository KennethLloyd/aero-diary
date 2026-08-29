import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  void request.url;

  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Health check failed.', error);
    return NextResponse.json(
      { status: 'unhealthy' },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
