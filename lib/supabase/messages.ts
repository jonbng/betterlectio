// Message protocol for content script ↔ background script Supabase communication.
// All Supabase operations run in the background to avoid Firefox cross-compartment errors.

import type { Database } from '@/database.types';

// ── Core types ──────────────────────────────────────────────────────

export type TableName = keyof Database['public']['Tables'];
export type FunctionName = keyof Database['public']['Functions'];

export interface Filter {
  column: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'not.is' | 'like' | 'ilike';
  value: unknown;
}

export interface OrderBy {
  column: string;
  ascending?: boolean;
}

// ── Messages ────────────────────────────────────────────────────────

export interface QueryMessage {
  type: 'bl-sb:query';
  table: TableName;
  select?: string;
  filters?: Filter[];
  order?: OrderBy;
  limit?: number;
  single?: boolean;
}

export interface MutateMessage {
  type: 'bl-sb:mutate';
  table: TableName;
  method: 'insert' | 'update' | 'upsert' | 'delete';
  data?: Record<string, unknown>;
  filters?: Filter[];
}

export interface RpcMessage {
  type: 'bl-sb:rpc';
  fn: FunctionName;
  args: Record<string, unknown>;
}

export interface SubscribeMessage {
  type: 'bl-sb:subscribe';
  channel: string;
  table: TableName;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  schoolId: string;
}

export interface UnsubscribeMessage {
  type: 'bl-sb:unsubscribe';
  channel: string;
}

// Auth messages
export interface AuthEnsureMessage {
  type: 'bl-sb:auth:ensure';
  schoolId: string;
  /**
   * Raw Lectio `elevid` for the currently logged-in student on this page.
   * When present, the background will verify that any existing Supabase
   * session is actually owned by this student before accepting it, and
   * otherwise sign the stale session out so the caller can re-auth.
   */
  expectedStudentId?: string;
  qrData?: { qrId: string; userId: string };
  source?: string;
}

export interface AuthGetSessionMessage {
  type: 'bl-sb:auth:session';
}

export interface AuthSignOutMessage {
  type: 'bl-sb:auth:signout';
}

/** Upload bytes to a private storage bucket (base64 payload from content scripts). */
export interface StorageUploadMessage {
  type: 'bl-sb:storage:upload';
  bucket: string;
  path: string;
  /** Base64-encoded file body (no data: URL prefix). */
  dataBase64: string;
  contentType: string;
  upsert?: boolean;
}

export type SupabaseMessage =
  | QueryMessage
  | MutateMessage
  | RpcMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | AuthEnsureMessage
  | AuthGetSessionMessage
  | AuthSignOutMessage
  | StorageUploadMessage;

// ── Response ────────────────────────────────────────────────────────

export type SupabaseResponse =
  | { ok: true; data?: unknown; session?: { expires_at: number; user_id?: string | null } | null }
  | { ok: false; error?: string };
