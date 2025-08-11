import { getAllDiscoveredInferenceServers, clearInferenceServerCache } from '@/lib/db/inference-host-source';
import { RequestAuthedAdminUser, withAuthedAdminUser } from '@/lib/with-user';
import { NextResponse } from 'next/server';

export const GET = withAuthedAdminUser(async (request: RequestAuthedAdminUser) => {
  try {
    const servers = await getAllDiscoveredInferenceServers();
    return NextResponse.json({
      success: true,
      servers,
      total: servers.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error discovering inference servers:', error);
    return NextResponse.json(
      { error: 'Failed to discover inference servers' },
      { status: 500 }
    );
  }
});

export const POST = withAuthedAdminUser(async (request: RequestAuthedAdminUser) => {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'refresh') {
      clearInferenceServerCache();
      const servers = await getAllDiscoveredInferenceServers();
      return NextResponse.json({
        success: true,
        message: 'Inference server cache refreshed',
        servers,
        total: servers.length,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Supported actions: refresh' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error refreshing inference servers:', error);
    return NextResponse.json(
      { error: 'Failed to refresh inference servers' },
      { status: 500 }
    );
  }
});
