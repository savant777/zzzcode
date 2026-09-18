import { handleBackupRequest } from '@/lib/editor-backup-api';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    return handleBackupRequest(request, 'read', (await context.params).id);
}

export async function PUT(request: Request, context: Context) {
    return handleBackupRequest(request, 'save', (await context.params).id);
}
