import { supabase } from '../lib/supabase';

// Strip trailing slash so URL concatenation never produces double slashes
const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');

if (!API_URL) {
  console.warn('[TelegramAuthService] EXPO_PUBLIC_API_URL is not set');
}

export interface TelegramAuthResponse {
  success: boolean;
  session_token: string;
  telegram_link: string;
  fallback_link: string;
}

export class TelegramAuthService {
  /**
   * Call the backend to create a pending auth session.
   * Returns the session token and Telegram deep links.
   */
  static async initiateTelegramAuth(deviceInfo: Record<string, any> = {}): Promise<TelegramAuthResponse | null> {
    const url = `${API_URL}/api/auth/telegram/initiate`;
    console.log('[TelegramAuthService] POST', url);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceInfo }),
      });

      const text = await response.text();

      if (!response.ok) {
        console.error(`[TelegramAuthService] HTTP ${response.status}:`, text);
        throw new Error(`Failed to initiate Telegram auth: HTTP ${response.status} — ${text}`);
      }

      const data: TelegramAuthResponse = JSON.parse(text);

      if (!data.success || !data.session_token) {
        console.error('[TelegramAuthService] Unexpected response:', data);
        throw new Error('Invalid response from auth server');
      }

      console.log('[TelegramAuthService] Session created:', data.session_token.substring(0, 8) + '...');
      return data;
    } catch (error) {
      console.error('[TelegramAuthService] initiateTelegramAuth failed:', error);
      return null;
    }
  }

  /**
   * Subscribe to AUTH_SUCCESS for a given session token.
   * Uses two channels for redundancy:
   *   1. Supabase Realtime broadcast  (fast path — pushed by bot webhook)
   *   2. Postgres DB change listener  (fallback — polls the row update)
   *
   * Returns an unsubscribe function.
   */
  static subscribeToAuthStatus(
    sessionToken: string,
    onAuthSuccess: (payload: any) => void
  ): () => void {
    console.log('[TelegramAuthService] Subscribing to session:', sessionToken.substring(0, 8) + '...');

    let settled = false;

    const handleSuccess = (payload: any) => {
      if (settled) return;
      settled = true;
      console.log('[TelegramAuthService] AUTH_SUCCESS received');
      onAuthSuccess(payload);
    };

    // ── Channel 1: Realtime broadcast ──────────────────────────────────────
    const broadcastChannel = supabase.channel(`auth:${sessionToken}`, {
      config: { broadcast: { self: false } },
    });

    broadcastChannel
      .on('broadcast', { event: 'AUTH_SUCCESS' }, (msg) => {
        console.log('[TelegramAuthService] Broadcast received');
        handleSuccess(msg.payload);
      })
      .subscribe((status) => {
        console.log('[TelegramAuthService] Broadcast channel status:', status);
      });

    // ── Channel 2: DB row change (fallback) ────────────────────────────────
    const dbChannel = supabase
      .channel(`auth_db:${sessionToken}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auth_pending_sessions',
          filter: `session_token=eq.${sessionToken}`,
        },
        (event) => {
          console.log('[TelegramAuthService] DB change received:', event.new?.status);
          const row = event.new as any;
          if (row?.status === 'APPROVED' && row?.jwt_payload) {
            handleSuccess(row.jwt_payload);
          }
        }
      )
      .subscribe((status) => {
        console.log('[TelegramAuthService] DB channel status:', status);
      });

    return () => {
      console.log('[TelegramAuthService] Unsubscribing from session:', sessionToken.substring(0, 8) + '...');
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(dbChannel);
    };
  }
}
