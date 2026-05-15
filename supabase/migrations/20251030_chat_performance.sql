-- Chat performance optimizations: indexes and helper RPC functions

-- 1) Indexes to speed up common filters and ordering
CREATE INDEX IF NOT EXISTS idx_messages_new_chat_created_at
  ON public.messages_new (chat_id, created_at);

-- Partial index to speed up unread lookups by chat
CREATE INDEX IF NOT EXISTS idx_messages_new_unread_by_chat
  ON public.messages_new (chat_id)
  WHERE is_read = false;

-- Sender filter used often (optional, helps some workloads)
CREATE INDEX IF NOT EXISTS idx_messages_new_chat_sender
  ON public.messages_new (chat_id, sender_id);

-- 2) RPC: Batched unread counts for all chats for a user
CREATE OR REPLACE FUNCTION public.get_unread_counts(in_user_id uuid)
RETURNS TABLE(chat_id uuid, unread_count integer)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT m.chat_id, COUNT(*)::int AS unread_count
  FROM public.messages_new m
  JOIN public.chats c ON c.id = m.chat_id
  WHERE m.is_read = false
    AND m.sender_id <> in_user_id
    AND (c.customer_id = in_user_id OR c.tasker_id = in_user_id)
  GROUP BY m.chat_id
$$;

-- 3) Optional RPC: mark messages as read for a chat (excluding sender)
CREATE OR REPLACE FUNCTION public.mark_chat_read(in_chat_id uuid, in_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.messages_new
  SET is_read = true
  WHERE chat_id = in_chat_id
    AND is_read = false
    AND sender_id <> in_user_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- 4) RPC: Delete a message (only sender can delete)
CREATE OR REPLACE FUNCTION public.delete_message(in_message_id uuid, in_sender_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete the message only if the sender_id matches
  DELETE FROM public.messages_new
  WHERE id = in_message_id
    AND sender_id = in_sender_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;

-- 5) RPC: Delete chat and all its messages (only participants can delete)
CREATE OR REPLACE FUNCTION public.delete_chat_and_messages(in_chat_id uuid, in_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chat_exists boolean;
  deleted_chat_count integer;
BEGIN
  -- First verify the user is a participant in the chat
  SELECT EXISTS (
    SELECT 1 FROM public.chats
    WHERE id = in_chat_id
      AND (customer_id = in_user_id OR tasker_id = in_user_id)
  ) INTO chat_exists;
  
  IF NOT chat_exists THEN
    RETURN false;
  END IF;
  
  -- Delete all messages in the chat
  DELETE FROM public.messages_new
  WHERE chat_id = in_chat_id;
  
  -- Delete the chat itself
  DELETE FROM public.chats
  WHERE id = in_chat_id;
  
  GET DIAGNOSTICS deleted_chat_count = ROW_COUNT;
  RETURN deleted_chat_count > 0;
END;
$$;


