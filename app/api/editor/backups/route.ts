import { handleBackupRequest } from '@/lib/editor-backup-api';

export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handleBackupRequest(request, 'create');
}
