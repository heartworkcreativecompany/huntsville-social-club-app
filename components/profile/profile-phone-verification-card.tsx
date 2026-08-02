'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import {
  formatPhoneForDisplay,
  friendlyPhoneOtpError,
  logPhoneOtpDebug,
  normalizePhoneToE164,
  phonesMatchE164,
  PHONE_OTP_SEND_FAILED_MESSAGE,
  requireUsPhoneE164,
  US_PHONE_INPUT_HINT,
  US_PHONE_INPUT_PLACEHOLDER,
} from '@/lib/member-phone'
import {
  requestPhoneChangeOtp,
  verifyPhoneChangeOtp,
} from '@/lib/member-phone-auth'
import { buttonPrimaryClassName, inputClassName } from '@/lib/event-labels'
import {
  markPhonePendingReverification,
  syncPhoneVerificationAfterOtp,
} from '@/app/(club)/members/phone-verification-actions'

const RESEND_COOLDOWN_SECONDS = 60

/** Display-only: "6152901426" → "(615)2901426" */
function formatUsPhoneShort(digits: string): string {
  const cleaned = digits.replace(/\D/g, '')
  if (cleaned.length <= 3) return cleaned
  const area = cleaned.slice(0, 3)
  const rest = cleaned.slice(3)
  return `(${area})${rest}`
}

function nationalDigitsFromE164(e164: string | null | undefined): string {
  if (!e164) return ''
  const normalized = normalizePhoneToE164(e164)
  if (!normalized) return e164.replace(/\D/g, '').slice(-10)
  return normalized.slice(2)
}

type ProfilePhoneVerificationCardProps = {
  verifiedPhoneE164: string | null
  phoneVerified: boolean
  authPhoneE164: string | null
  /** When true, omit outer card chrome (for embedding in status rows). */
  embedded?: boolean
}

export default function ProfilePhoneVerificationCard({
  verifiedPhoneE164,
  phoneVerified,
  authPhoneE164,
  embedded = false,
}: ProfilePhoneVerificationCardProps) {
  const router = useRouter()
  const supabase = createClient()
  const initialDigits = nationalDigitsFromE164(
    verifiedPhoneE164 ?? authPhoneE164
  )

  const [phoneDigits, setPhoneDigits] = useState(initialDigits)
  const [otp, setOtp] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [isPending, startTransition] = useTransition()
  const lastResetPhone = useRef<string | null>(verifiedPhoneE164)
  const otpTargetPhoneE164 = useRef<string | null>(null)

  const isVerified =
    phoneVerified &&
    phonesMatchE164(phoneDigits, verifiedPhoneE164 ?? authPhoneE164)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => {
      setCooldown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const clearOtpState = (nextMessage?: string) => {
    setCodeSent(false)
    setOtp('')
    otpTargetPhoneE164.current = null
    if (nextMessage) {
      setMessage(nextMessage)
    }
  }

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    setPhoneDigits(digits)
    setError('')

    const normalized = normalizePhoneToE164(digits)
    if (
      codeSent &&
      otpTargetPhoneE164.current &&
      normalized &&
      !phonesMatchE164(normalized, otpTargetPhoneE164.current)
    ) {
      clearOtpState('Phone number changed. Send a new verification code.')
    } else {
      setMessage('')
    }

    if (
      normalized &&
      verifiedPhoneE164 &&
      !phonesMatchE164(normalized, verifiedPhoneE164) &&
      lastResetPhone.current !== normalized
    ) {
      lastResetPhone.current = normalized
      startTransition(async () => {
        await markPhonePendingReverification(normalized)
        router.refresh()
      })
    }
  }

  const handleSendCode = () => {
    setError('')
    setMessage('')

    const cleaned = phoneDigits.replace(/\D/g, '')
    if (cleaned.length !== 10) {
      const validationError = requireUsPhoneE164(cleaned).error
      logPhoneOtpDebug('validation', {
        rawInput: phoneDigits,
        note: 'Send blocked — need exactly 10 national digits',
        errorMessage: validationError,
      })
      setError(validationError ?? PHONE_OTP_SEND_FAILED_MESSAGE)
      return
    }

    const phoneE164 = `+1${cleaned}`
    logPhoneOtpDebug('ui_to_request', {
      rawInput: phoneDigits,
      normalized: phoneE164,
      exactPhone: phoneE164,
      note: `Passing to requestPhoneChangeOtp: ${phoneE164}`,
    })

    startTransition(async () => {
      try {
        if (
          verifiedPhoneE164 &&
          !phonesMatchE164(phoneE164, verifiedPhoneE164)
        ) {
          await markPhonePendingReverification(phoneE164)
        }

        const resend =
          codeSent &&
          otpTargetPhoneE164.current !== null &&
          phonesMatchE164(phoneE164, otpTargetPhoneE164.current)

        const { error: sendError } = await requestPhoneChangeOtp(
          supabase,
          phoneE164,
          { resend }
        )

        if (sendError) {
          setError(friendlyPhoneOtpError(sendError.message, 'send'))
          return
        }

        otpTargetPhoneE164.current = phoneE164
        setCodeSent(true)
        setOtp('')
        setCooldown(RESEND_COOLDOWN_SECONDS)
        setMessage(
          `Verification code sent to ${formatPhoneForDisplay(phoneE164)}.`
        )
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not send verification code.'
        logPhoneOtpDebug('provider_send', {
          rawInput: phoneDigits,
          exactPhone: phoneE164,
          errorMessage: message,
          note: 'Unexpected exception during phone OTP send',
        })
        setError(friendlyPhoneOtpError(message, 'send'))
      }
    })
  }

  const handleVerifyCode = () => {
    setError('')
    setMessage('')

    const cleaned = phoneDigits.replace(/\D/g, '')
    const phoneE164 =
      otpTargetPhoneE164.current ??
      (cleaned.length === 10 ? `+1${cleaned}` : null)

    if (!phoneE164) {
      const validationError = requireUsPhoneE164(cleaned).error
      logPhoneOtpDebug('validation', {
        note: 'Verify blocked — phone normalization failed',
        errorMessage: validationError,
      })
      setError(
        validationError ?? 'Send a verification code before entering the OTP.'
      )
      return
    }

    logPhoneOtpDebug('ui_to_request', {
      rawInput: phoneDigits,
      normalized: phoneE164,
      exactPhone: phoneE164,
      note: `Passing to verifyPhoneChangeOtp: ${phoneE164}`,
    })

    if (!phonesMatchE164(phoneDigits, phoneE164)) {
      setError(
        'Phone number changed since the code was sent. Request a new code.'
      )
      return
    }

    const token = otp.trim()
    if (!/^\d{6}$/.test(token)) {
      setError('Enter the 6-digit code from your text message.')
      return
    }

    startTransition(async () => {
      try {
        const { error: verifyError } = await verifyPhoneChangeOtp(
          supabase,
          phoneE164,
          token
        )

        if (verifyError) {
          setError(friendlyPhoneOtpError(verifyError.message, 'verify'))
          return
        }

        const syncResult = await syncPhoneVerificationAfterOtp(phoneE164)
        if (syncResult.error) {
          setError(syncResult.error)
          return
        }

        lastResetPhone.current = phoneE164
        clearOtpState()
        setMessage('Phone verified. Thanks for confirming your number.')
        router.refresh()
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not verify the code.'
        logPhoneOtpDebug('provider_verify', {
          e164: phoneE164,
          errorMessage: message,
          note: 'Unexpected exception during phone OTP verify',
        })
        setError(friendlyPhoneOtpError(message, 'verify'))
      }
    })
  }

  const body = (
    <>
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-display text-lg font-semibold">
              Phone verification
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verify your mobile number so staff can reach you if needed. Your
              number is never shown on your member profile.
            </p>
          </div>
          {isVerified ? <Badge variant="success">Verified</Badge> : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {/* Supabase Auth SMS under the hood; provider configured in Supabase. */}
          We&apos;ll text a verification code to your mobile number. Your number
          stays private.
        </p>
      )}

      <div className={embedded ? 'mt-3 grid max-w-lg gap-4' : 'mt-4 grid max-w-lg gap-4'}>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Mobile number</span>
          <input
            type="tel"
            autoComplete="tel"
            inputMode="numeric"
            placeholder={US_PHONE_INPUT_PLACEHOLDER}
            value={formatUsPhoneShort(phoneDigits)}
            onChange={(event) => handlePhoneChange(event.target.value)}
            className={inputClassName}
            disabled={isPending}
          />
          <span className="text-xs text-muted-foreground">
            {US_PHONE_INPUT_HINT}
          </span>
        </label>

        {codeSent ? (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Verification code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
              className={inputClassName}
              disabled={isPending}
            />
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSendCode}
            className={buttonPrimaryClassName}
            disabled={isPending || cooldown > 0}
          >
            {isPending
              ? 'Sending…'
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : codeSent
                  ? 'Resend code'
                  : 'Send code'}
          </button>

          {codeSent ? (
            <button
              type="button"
              onClick={handleVerifyCode}
              className={buttonPrimaryClassName}
              disabled={isPending}
            >
              {isPending ? 'Verifying…' : 'Verify code'}
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </>
  )

  if (embedded) {
    return <div className="rounded-md border border-border bg-background/40 p-3">{body}</div>
  }

  return <Card>{body}</Card>
}
