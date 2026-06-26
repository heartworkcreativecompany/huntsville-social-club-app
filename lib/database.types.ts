// TEMPORARY: Replace this file with generated types from the Supabase dashboard
// (Project Settings → API → Generate types) or the Supabase CLI
// (`supabase gen types typescript --project-id <id> > lib/database.types.ts`).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          role: string | null
          created_at: string | null
          updated_at: string | null
          application_status: string
          membership_intent: string | null
          application_draft: Json | null
          application_submitted_at: string | null
          application_reviewed_at: string | null
          verified_at: string | null
          admin_review_notes: string | null
          location_area: string | null
          referral_source: string | null
          verification_state: Json
          approval_gates: Json
          locality_confirmation: Json
          premium_verification: Json
          membership_billing: Json
          discovery_intent: string | null
          location_city: string | null
          location_zip: string | null
          birth_year: number | null
          discovery_interests: string[]
          discovery_industry: string | null
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          role?: string | null
          created_at?: string | null
          updated_at?: string | null
          application_status?: string
          membership_intent?: string | null
          application_draft?: Json | null
          application_submitted_at?: string | null
          application_reviewed_at?: string | null
          verified_at?: string | null
          admin_review_notes?: string | null
          location_area?: string | null
          referral_source?: string | null
          verification_state?: Json
          approval_gates?: Json
          locality_confirmation?: Json
          premium_verification?: Json
          membership_billing?: Json
          discovery_intent?: string | null
          location_city?: string | null
          location_zip?: string | null
          birth_year?: number | null
          discovery_interests?: string[]
          discovery_industry?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          role?: string | null
          created_at?: string | null
          updated_at?: string | null
          application_status?: string
          membership_intent?: string | null
          application_draft?: Json | null
          application_submitted_at?: string | null
          application_reviewed_at?: string | null
          verified_at?: string | null
          admin_review_notes?: string | null
          location_area?: string | null
          referral_source?: string | null
          verification_state?: Json
          approval_gates?: Json
          locality_confirmation?: Json
          premium_verification?: Json
          membership_billing?: Json
          discovery_intent?: string | null
          location_city?: string | null
          location_zip?: string | null
          birth_year?: number | null
          discovery_interests?: string[]
          discovery_industry?: string | null
        }
        Relationships: []
      }
      member_vouches: {
        Row: {
          id: string
          voucher_id: string
          vouchee_id: string
          vouch_type: string
          relationship_context: string
          note: string | null
          status: string
          created_at: string
          updated_at: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
        }
        Insert: {
          id?: string
          voucher_id: string
          vouchee_id: string
          vouch_type: string
          relationship_context: string
          note?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
        }
        Update: {
          id?: string
          voucher_id?: string
          vouchee_id?: string
          vouch_type?: string
          relationship_context?: string
          note?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
        }
        Relationships: []
      }
      member_conversations: {
        Row: {
          id: string
          participant_a: string
          participant_b: string
          updated_at: string
        }
        Insert: {
          id?: string
          participant_a: string
          participant_b: string
          updated_at?: string
        }
        Update: {
          id?: string
          participant_a?: string
          participant_b?: string
          updated_at?: string
        }
        Relationships: []
      }
      member_messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          body: string
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          body: string
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          body?: string
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      member_intro_requests: {
        Row: {
          id: string
          requester_id: string
          target_member_id: string | null
          kind: string
          note: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          requester_id: string
          target_member_id?: string | null
          kind?: string
          note?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          requester_id?: string
          target_member_id?: string | null
          kind?: string
          note?: string | null
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          owner_id: string
          title: string
          description: string | null
          location: string | null
          starts_at: string
          ends_at: string | null
          visibility: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          title: string
          description?: string | null
          location?: string | null
          starts_at: string
          ends_at?: string | null
          visibility?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          title?: string
          description?: string | null
          location?: string | null
          starts_at?: string
          ends_at?: string | null
          visibility?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_attendees: {
        Row: {
          event_id: string
          user_id: string
          status: string
          created_at: string | null
        }
        Insert: {
          event_id: string
          user_id: string
          status?: string
          created_at?: string | null
        }
        Update: {
          event_id?: string
          user_id?: string
          status?: string
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}
