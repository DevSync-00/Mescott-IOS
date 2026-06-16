import { supabase } from '../lib/supabase';

// Get API URL from environment variables
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mchapaw.vercel.app';

export interface TelegramAuthResponse {
  success: boolean;
  session_token: string;
  telegram_link: string;
  fallback_link: string;
}

export class TelegramAuthService {
  // Initiate Telegram Auth and fetch the deep links
  static async initiateTelegramAuth(deviceInfo: any = {}): Promise<TelegramAuthResponse | null> {
    try {
      const response = await fetch(`${API_URL}/api/auth/telegram/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceInfo }),
      });

      if (!response.ok) {
        let errorDetails = '';
        try {
          errorDetails = await response.text();
        } catch (_) {}
        throw new Error(`Failed to initiate Telegram auth: HTTP ${response.status} ${response.statusText || ''} - ${errorDetails}`);
      }

      const data: TelegramAuthResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error in initiateTelegramAuth:', error);
      return null;
    }
  }

  // Subscribe to the Supabase Realtime channel for AUTH_SUCCESS event
  static subscribeToAuthStatus(sessionToken: string, onAuthSuccess: (payload: any) => void): () => void {
    console.log(`Subscribing to realtime channel for session: ${sessionToken}`);
    
    // 1. Subscribe to broadcast event
    const channel = supabase.channel(`auth:${sessionToken}`, {
      config: {
        broadcast: { self: false }
      }
    });

    channel
      .on('broadcast', { event: 'AUTH_SUCCESS' }, (payload) => {
        console.log('Received auth success via broadcast:', payload);
        onAuthSuccess(payload.payload);
      })
      .subscribe((status) => {
        console.log(`Realtime channel status: ${status}`);
      });

    // 2. Also subscribe to database changes for auth_pending_sessions table as fallback
    const dbSubscription = supabase
      .channel(`auth_pending_sessions_db:${sessionToken}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auth_pending_sessions',
          filter: `session_token=eq.${sessionToken}`,
        },
        (payload) => {
          console.log('Received database update for session:', payload.new);
          if (payload.new && payload.new.status === 'APPROVED' && payload.new.jwt_payload) {
            onAuthSuccess(payload.new.jwt_payload);
          }
        }
      )
      .subscribe();

    // Return unsubscribe function
    return () => {
      console.log(`Unsubscribing from channels for session: ${sessionToken}`);
      supabase.removeChannel(channel);
      supabase.removeChannel(dbSubscription);
    };
  }
}
