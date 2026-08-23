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
          contact_email: string | null
          show_contact_email: boolean
          verified_phone_e164: string | null
          phone_verified_at: string | null
          sms_marketing_opt_in: boolean
          sms_marketing_opt_in_at: string | null
          sms_marketing_consent_version: string | null
          sms_marketing_consent_source: string | null
          sms_marketing_consent_phone_e164: string | null
          sms_marketing_opted_out_at: string | null
          identity_verification_status: string
          identity_verification_session_id: string | null
          identity_verified_at: string | null
          identity_verification_last_error: string | null
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
          connections_open_to: string[]
          connection_intents: string[]
          compatibility_questionnaire: Json | null
          compatibility_completed_at: string | null
          compatibility_updated_at: string | null
          wants_curated_matches: boolean
          curated_matches_paused_at: string | null
          curated_matches_pause_reason: string | null
          dating_connection_enabled_at: string | null
          dating_connection_removed_at: string | null
          messaging_entitlement_lost_at: string | null
          messaging_entitlement_restored_at: string | null
          last_match_generation_at: string | null
          last_match_review_at: string | null
          profile_pending_revision: Json | null
          profile_revision_status: string
          profile_revision_submitted_at: string | null
          profile_revision_reviewed_at: string | null
          profile_revision_admin_notes: string | null
          profile_revision_history: Json | null
          messaging_suspended_at: string | null
          messaging_suspension_reason: string | null
          messaging_suspended_by: string | null
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
          contact_email?: string | null
          show_contact_email?: boolean
          verified_phone_e164?: string | null
          phone_verified_at?: string | null
          sms_marketing_opt_in?: boolean
          sms_marketing_opt_in_at?: string | null
          sms_marketing_consent_version?: string | null
          sms_marketing_consent_source?: string | null
          sms_marketing_consent_phone_e164?: string | null
          sms_marketing_opted_out_at?: string | null
          identity_verification_status?: string
          identity_verification_session_id?: string | null
          identity_verified_at?: string | null
          identity_verification_last_error?: string | null
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
          connections_open_to?: string[]
          connection_intents?: string[]
          compatibility_questionnaire?: Json | null
          compatibility_completed_at?: string | null
          compatibility_updated_at?: string | null
          wants_curated_matches?: boolean
          curated_matches_paused_at?: string | null
          curated_matches_pause_reason?: string | null
          dating_connection_enabled_at?: string | null
          dating_connection_removed_at?: string | null
          messaging_entitlement_lost_at?: string | null
          messaging_entitlement_restored_at?: string | null
          last_match_generation_at?: string | null
          last_match_review_at?: string | null
          profile_pending_revision?: Json | null
          profile_revision_status?: string
          profile_revision_submitted_at?: string | null
          profile_revision_reviewed_at?: string | null
          profile_revision_admin_notes?: string | null
          profile_revision_history?: Json | null
          messaging_suspended_at?: string | null
          messaging_suspension_reason?: string | null
          messaging_suspended_by?: string | null
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
          contact_email?: string | null
          show_contact_email?: boolean
          verified_phone_e164?: string | null
          phone_verified_at?: string | null
          sms_marketing_opt_in?: boolean
          sms_marketing_opt_in_at?: string | null
          sms_marketing_consent_version?: string | null
          sms_marketing_consent_source?: string | null
          sms_marketing_consent_phone_e164?: string | null
          sms_marketing_opted_out_at?: string | null
          identity_verification_status?: string
          identity_verification_session_id?: string | null
          identity_verified_at?: string | null
          identity_verification_last_error?: string | null
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
          connections_open_to?: string[]
          connection_intents?: string[]
          compatibility_questionnaire?: Json | null
          compatibility_completed_at?: string | null
          compatibility_updated_at?: string | null
          wants_curated_matches?: boolean
          curated_matches_paused_at?: string | null
          curated_matches_pause_reason?: string | null
          dating_connection_enabled_at?: string | null
          dating_connection_removed_at?: string | null
          messaging_entitlement_lost_at?: string | null
          messaging_entitlement_restored_at?: string | null
          last_match_generation_at?: string | null
          last_match_review_at?: string | null
          profile_pending_revision?: Json | null
          profile_revision_status?: string
          profile_revision_submitted_at?: string | null
          profile_revision_reviewed_at?: string | null
          profile_revision_admin_notes?: string | null
          profile_revision_history?: Json | null
          messaging_suspended_at?: string | null
          messaging_suspension_reason?: string | null
          messaging_suspended_by?: string | null
        }
        Relationships: []
      }
      curated_match_batches: {
        Row: {
          id: string
          user_id: string
          status: string
          scheduled_for: string
          delivered_at: string | null
          match_count: number
          cancellation_reason: string | null
          created_at: string
          generation_source: string | null
          empty_reason: string | null
          top_candidate_score: number | null
          notification_status: string | null
          notification_sent_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          status?: string
          scheduled_for: string
          delivered_at?: string | null
          match_count?: number
          cancellation_reason?: string | null
          created_at?: string
          generation_source?: string | null
          empty_reason?: string | null
          top_candidate_score?: number | null
          notification_status?: string | null
          notification_sent_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          status?: string
          scheduled_for?: string
          delivered_at?: string | null
          match_count?: number
          cancellation_reason?: string | null
          created_at?: string
          generation_source?: string | null
          empty_reason?: string | null
          top_candidate_score?: number | null
          notification_status?: string | null
          notification_sent_at?: string | null
        }
        Relationships: []
      }
      curated_match_recommendations: {
        Row: {
          id: string
          batch_id: string
          user_id: string
          recommended_user_id: string
          compatibility_score: number
          score_breakdown: Json
          status: string
          created_at: string
          expires_at: string | null
          lifecycle_updated_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          user_id: string
          recommended_user_id: string
          compatibility_score: number
          score_breakdown?: Json
          status?: string
          created_at?: string
          expires_at?: string | null
          lifecycle_updated_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          user_id?: string
          recommended_user_id?: string
          compatibility_score?: number
          score_breakdown?: Json
          status?: string
          created_at?: string
          expires_at?: string | null
          lifecycle_updated_at?: string
        }
        Relationships: []
      }
      friendship_questionnaires: {
        Row: {
          user_id: string
          version: number
          answers: Json
          status: string
          completed_at: string | null
          updated_at: string
          created_at: string
        }
        Insert: {
          user_id: string
          version: number
          answers?: Json
          status?: string
          completed_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: {
          user_id?: string
          version?: number
          answers?: Json
          status?: string
          completed_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      friendship_match_batches: {
        Row: {
          id: string
          user_id: string
          status: string
          match_count: number
          created_at: string
          delivered_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          status?: string
          match_count?: number
          created_at?: string
          delivered_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          status?: string
          match_count?: number
          created_at?: string
          delivered_at?: string | null
        }
        Relationships: []
      }
      friendship_match_recommendations: {
        Row: {
          id: string
          batch_id: string
          user_id: string
          recommended_user_id: string
          compatibility_score: number
          score_breakdown: Json
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          user_id: string
          recommended_user_id: string
          compatibility_score: number
          score_breakdown?: Json
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          user_id?: string
          recommended_user_id?: string
          compatibility_score?: number
          score_breakdown?: Json
          status?: string
          created_at?: string
          updated_at?: string
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
      recognition_badges: {
        Row: {
          slug: string
          public_label: string
          public_description: string
          display_order: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          slug: string
          public_label: string
          public_description: string
          display_order: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          slug?: string
          public_label?: string
          public_description?: string
          display_order?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      member_recognition_badge_awards: {
        Row: {
          id: string
          user_id: string
          badge_slug: string
          awarded_at: string
          awarded_by: string
          admin_note: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          badge_slug: string
          awarded_at?: string
          awarded_by: string
          admin_note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          badge_slug?: string
          awarded_at?: string
          awarded_by?: string
          admin_note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: []
      }
      membership_access_overrides: {
        Row: {
          id: string
          user_id: string
          tier: string
          starts_at: string
          expires_at: string | null
          reason: string | null
          granted_by: string
          revoked_at: string | null
          revoked_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tier: string
          starts_at?: string
          expires_at?: string | null
          reason?: string | null
          granted_by: string
          revoked_at?: string | null
          revoked_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tier?: string
          starts_at?: string
          expires_at?: string | null
          reason?: string | null
          granted_by?: string
          revoked_at?: string | null
          revoked_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      member_member_blocks: {
        Row: {
          id: string
          blocker_id: string
          blocked_member_id: string
          created_at: string
        }
        Insert: {
          id?: string
          blocker_id: string
          blocked_member_id: string
          created_at?: string
        }
        Update: {
          id?: string
          blocker_id?: string
          blocked_member_id?: string
          created_at?: string
        }
        Relationships: []
      }
      member_conversation_reports: {
        Row: {
          id: string
          reporter_id: string
          conversation_id: string
          reported_member_id: string | null
          reason: string
          details: string | null
          status: string
          created_at: string
          admin_notes: string | null
          admin_reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          id?: string
          reporter_id: string
          conversation_id: string
          reported_member_id?: string | null
          reason: string
          details?: string | null
          status?: string
          created_at?: string
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          id?: string
          reporter_id?: string
          conversation_id?: string
          reported_member_id?: string | null
          reason?: string
          details?: string | null
          status?: string
          created_at?: string
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: []
      }
      moderation_actions: {
        Row: {
          id: string
          actor_id: string | null
          target_member_id: string | null
          action_type: string
          source_type: string | null
          source_id: string | null
          reason: string | null
          details: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          target_member_id?: string | null
          action_type: string
          source_type?: string | null
          source_id?: string | null
          reason?: string | null
          details?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          target_member_id?: string | null
          action_type?: string
          source_type?: string | null
          source_id?: string | null
          reason?: string | null
          details?: string | null
          created_at?: string
        }
        Relationships: []
      }
      member_conversations: {
        Row: {
          id: string
          participant_a: string
          participant_b: string
          updated_at: string
          status: string
          initiated_by: string | null
          recommendation_id: string | null
          responded_at: string | null
          declined_at: string | null
          recontact_status: string | null
          recontact_requested_at: string | null
          recontact_requested_by: string | null
          recontact_note: string | null
          recontact_admin_actor_id: string | null
          recontact_admin_reviewed_at: string | null
          recontact_recipient_responded_at: string | null
        }
        Insert: {
          id?: string
          participant_a: string
          participant_b: string
          updated_at?: string
          status?: string
          initiated_by?: string | null
          recommendation_id?: string | null
          responded_at?: string | null
          declined_at?: string | null
          recontact_status?: string | null
          recontact_requested_at?: string | null
          recontact_requested_by?: string | null
          recontact_note?: string | null
          recontact_admin_actor_id?: string | null
          recontact_admin_reviewed_at?: string | null
          recontact_recipient_responded_at?: string | null
        }
        Update: {
          id?: string
          participant_a?: string
          participant_b?: string
          updated_at?: string
          status?: string
          initiated_by?: string | null
          recommendation_id?: string | null
          responded_at?: string | null
          declined_at?: string | null
          recontact_status?: string | null
          recontact_requested_at?: string | null
          recontact_requested_by?: string | null
          recontact_note?: string | null
          recontact_admin_actor_id?: string | null
          recontact_admin_reviewed_at?: string | null
          recontact_recipient_responded_at?: string | null
        }
        Relationships: []
      }
      member_notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          body: string | null
          href: string
          read_at: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          body?: string | null
          href: string
          read_at?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          body?: string | null
          href?: string
          read_at?: string | null
          metadata?: Json
          created_at?: string
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
          is_system: boolean
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          body: string
          read_at?: string | null
          created_at?: string
          is_system?: boolean
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          body?: string
          read_at?: string | null
          created_at?: string
          is_system?: boolean
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
          recommendation_id: string | null
          admin_notes: string | null
          admin_reviewed_at: string | null
          conversation_id: string | null
        }
        Insert: {
          id?: string
          requester_id: string
          target_member_id?: string | null
          kind?: string
          note?: string | null
          status?: string
          created_at?: string
          recommendation_id?: string | null
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          conversation_id?: string | null
        }
        Update: {
          id?: string
          requester_id?: string
          target_member_id?: string | null
          kind?: string
          note?: string | null
          status?: string
          created_at?: string
          recommendation_id?: string | null
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          conversation_id?: string | null
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
          event_type: string
          fee_cents: number | null
          sponsorship_eligible: boolean
          priority_rsvp_opens_at: string | null
          general_rsvp_opens_at: string | null
          attendance_max: number | null
          cover_image_url: string | null
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
          event_type?: string
          fee_cents?: number | null
          sponsorship_eligible?: boolean
          priority_rsvp_opens_at?: string | null
          general_rsvp_opens_at?: string | null
          attendance_max?: number | null
          cover_image_url?: string | null
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
          event_type?: string
          fee_cents?: number | null
          sponsorship_eligible?: boolean
          priority_rsvp_opens_at?: string | null
          general_rsvp_opens_at?: string | null
          attendance_max?: number | null
          cover_image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_sponsorships: {
        Row: {
          id: string
          event_id: string
          sponsor_user_id: string | null
          sponsor_id: string | null
          business_name: string
          contact_email: string | null
          status: string
          amount_cents: number
          ticket_count: number
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          logo_url: string | null
          notes: string | null
          sort_order: number
          created_at: string
          updated_at: string
          paid_at: string | null
          approved_at: string | null
        }
        Insert: {
          id?: string
          event_id: string
          sponsor_user_id?: string | null
          sponsor_id?: string | null
          business_name?: string
          contact_email?: string | null
          status?: string
          amount_cents?: number
          ticket_count?: number
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          logo_url?: string | null
          notes?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          paid_at?: string | null
          approved_at?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          sponsor_user_id?: string | null
          sponsor_id?: string | null
          business_name?: string
          contact_email?: string | null
          status?: string
          amount_cents?: number
          ticket_count?: number
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          logo_url?: string | null
          notes?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          paid_at?: string | null
          approved_at?: string | null
        }
        Relationships: []
      }
      sponsors: {
        Row: {
          id: string
          business_name: string
          contact_email: string | null
          logo_url: string | null
          website_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_name: string
          contact_email?: string | null
          logo_url?: string | null
          website_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_name?: string
          contact_email?: string | null
          logo_url?: string | null
          website_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_sponsors: {
        Row: {
          id: string
          event_id: string
          sponsor_id: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          sponsor_id: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          sponsor_id?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'event_sponsors_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'event_sponsors_sponsor_id_fkey'
            columns: ['sponsor_id']
            isOneToOne: false
            referencedRelation: 'sponsors'
            referencedColumns: ['id']
          },
        ]
      }
      business_listings: {
        Row: {
          id: string
          owner_id: string
          business_name: string
          description: string
          industry: string
          category: string
          website_url: string | null
          contact_email: string | null
          phone: string | null
          city: string | null
          club_offer: string
          header_image_url: string | null
          status: string
          admin_notes: string | null
          created_at: string
          updated_at: string
          submitted_at: string | null
          reviewed_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          business_name: string
          description?: string
          industry?: string
          category?: string
          website_url?: string | null
          contact_email?: string | null
          phone?: string | null
          city?: string | null
          club_offer?: string
          header_image_url?: string | null
          status?: string
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
          submitted_at?: string | null
          reviewed_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          business_name?: string
          description?: string
          industry?: string
          category?: string
          website_url?: string | null
          contact_email?: string | null
          phone?: string | null
          city?: string | null
          club_offer?: string
          header_image_url?: string | null
          status?: string
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
          submitted_at?: string | null
          reviewed_at?: string | null
        }
        Relationships: []
      }
      event_attendees: {
        Row: {
          event_id: string
          user_id: string
          status: string
          created_at: string | null
          updated_at: string
          registration_method: string | null
          payment_status: string | null
          entitlement_cycle_id: string | null
          credit_consumed: boolean
          registered_at: string | null
          cancelled_at: string | null
          credit_returned: boolean
          guest_name: string | null
          guest_invite_consumed: boolean
        }
        Insert: {
          event_id: string
          user_id: string
          status?: string
          created_at?: string | null
          updated_at?: string
          registration_method?: string | null
          payment_status?: string | null
          entitlement_cycle_id?: string | null
          credit_consumed?: boolean
          registered_at?: string | null
          cancelled_at?: string | null
          credit_returned?: boolean
          guest_name?: string | null
          guest_invite_consumed?: boolean
        }
        Update: {
          event_id?: string
          user_id?: string
          status?: string
          created_at?: string | null
          updated_at?: string
          registration_method?: string | null
          payment_status?: string | null
          entitlement_cycle_id?: string | null
          credit_consumed?: boolean
          registered_at?: string | null
          cancelled_at?: string | null
          credit_returned?: boolean
          guest_name?: string | null
          guest_invite_consumed?: boolean
        }
        Relationships: []
      }
      membership_entitlement_cycles: {
        Row: {
          id: string
          user_id: string
          product_tier: string
          period_start: string
          period_end: string
          credits_granted: number | null
          credits_used: number
          guest_invites_granted: number
          guest_invites_used: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_tier: string
          period_start: string
          period_end: string
          credits_granted?: number | null
          credits_used?: number
          guest_invites_granted?: number
          guest_invites_used?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          product_tier?: string
          period_start?: string
          period_end?: string
          credits_granted?: number | null
          credits_used?: number
          guest_invites_granted?: number
          guest_invites_used?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      event_registration_ledger: {
        Row: {
          id: string
          user_id: string
          event_id: string
          action: string
          registration_method: string | null
          entitlement_cycle_id: string | null
          credit_delta: number
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          event_id: string
          action: string
          registration_method?: string | null
          entitlement_cycle_id?: string | null
          credit_delta?: number
          metadata?: import('./database.types').Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          event_id?: string
          action?: string
          registration_method?: string | null
          entitlement_cycle_id?: string | null
          credit_delta?: number
          metadata?: import('./database.types').Json
          created_at?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      member_profiles: {
        Row: Omit<
          Database['public']['Tables']['profiles']['Row'],
          'email'
        >
        Relationships: []
      }
      member_public_recognition_badges: {
        Row: {
          user_id: string
          badge_slug: string
          public_label: string
          display_order: number
        }
        Relationships: []
      }
    }
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}
