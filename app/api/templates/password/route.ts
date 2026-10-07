import { handleTemplatePasswordRequest } from '@/lib/template-password-api';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handleTemplatePasswordRequest(request, 'read'); }
