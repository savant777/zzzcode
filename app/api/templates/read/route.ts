import { handleTemplateRequest } from '@/lib/editor-backup-api';

export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handleTemplateRequest(request, 'read');
}
