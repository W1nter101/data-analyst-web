import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

export interface Session {
  userId: string;
  email?: string;
}

/**
 * Extract session từ Authorization: Bearer <accessToken> header.
 * Access token là JWT ký bởi Express với ACCESS_TOKEN_SECRET.
 * Payload chứa { userId: user._id }.
 */
export async function getSession(req: NextRequest): Promise<Session | null> {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    const secret = new TextEncoder().encode(process.env.ACCESS_TOKEN_SECRET);

    const { payload } = await jwtVerify(token, secret);

    const userId = (payload.userId ?? payload.sub) as string | undefined;
    if (!userId) return null;

    return { userId, email: payload.email as string | undefined };
  } catch {
    return null;
  }
}
