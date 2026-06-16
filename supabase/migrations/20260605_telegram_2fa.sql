-- Migration: Telegram 2FA Authentication Setup
-- 1) Alter profiles table to add telegram_chat_id and telegram_username
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64) UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100) UNIQUE;

-- 2) Create auth_pending_sessions table
CREATE TABLE IF NOT EXISTS public.auth_pending_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'EXPIRED')),
    device_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    jwt_payload JSONB -- Optional: stored just in case
);

-- 3) Enable Row Level Security (RLS) on auth_pending_sessions
ALTER TABLE public.auth_pending_sessions ENABLE ROW LEVEL SECURITY;

-- 4) Allow anonymous read on pending sessions (needed for the client check/fallback)
CREATE POLICY "Allow anonymous read on pending sessions" 
ON public.auth_pending_sessions FOR SELECT 
TO anon, authenticated 
USING (true);
