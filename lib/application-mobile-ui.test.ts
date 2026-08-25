import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import ApplicationStepProgress from '@/components/application/application-step-progress'
import {
  APPLICATION_ACTIONS_CLASS,
  APPLICATION_STEP_CURRENT_LABEL_CLASS,
  APPLICATION_STEP_LIST_CLASS,
  CHOICE_ROW_CLASS,
  MOBILE_FULL_CONTROL_CLASS,
  applicationStepStatusLabel,
} from '@/lib/application-mobile-ui'
import {
  buttonPrimaryClassName,
  chipActiveClassName,
  inputClassName,
  marketingNavLinkClassName,
  mobileFullButtonClassName,
  textareaClassName,
} from '@/lib/event-labels'

const repoRoot = join(__dirname, '..')

describe('applicationStepStatusLabel', () => {
  it('names the current step for a 320px-wide compact presentation', () => {
    expect(applicationStepStatusLabel(3, 6, 'Work & interests')).toBe(
      'Step 3 of 6: Work & interests'
    )
  })
})

describe('application mobile layout classes', () => {
  it('hides the multi-step grid below sm and keeps a compact current-step label', () => {
    expect(APPLICATION_STEP_LIST_CLASS).toContain('hidden')
    expect(APPLICATION_STEP_LIST_CLASS).toContain('sm:grid')
    expect(APPLICATION_STEP_LIST_CLASS).toContain('lg:grid-cols-3')
    expect(APPLICATION_STEP_CURRENT_LABEL_CLASS).toContain('sm:hidden')
  })

  it('keeps action controls full-width on mobile and auto-width from sm up', () => {
    expect(APPLICATION_ACTIONS_CLASS).toContain('grid-cols-1')
    expect(APPLICATION_ACTIONS_CLASS).toContain('sm:flex')
    expect(MOBILE_FULL_CONTROL_CLASS).toContain('w-full')
    expect(MOBILE_FULL_CONTROL_CLASS).toContain('sm:w-auto')
    expect(mobileFullButtonClassName).toContain('w-full sm:w-auto')
  })

  it('gives form controls a 44px minimum touch target without desktop-only widths', () => {
    expect(inputClassName).toContain('min-h-11')
    expect(inputClassName).toContain('min-w-0')
    expect(buttonPrimaryClassName).toContain('min-h-11')
    expect(chipActiveClassName).toContain('min-h-11')
    expect(chipActiveClassName).toContain('max-w-full')
    expect(textareaClassName).toContain('min-h-[7.5rem]')
    expect(CHOICE_ROW_CLASS).toContain('min-h-11')
    expect(buttonPrimaryClassName).not.toContain('min-w-[')
  })

  it('keeps the public Sign in control visible on small screens', () => {
    expect(marketingNavLinkClassName).toContain('inline-flex')
    expect(marketingNavLinkClassName).toContain('min-h-11')
    expect(marketingNavLinkClassName).not.toContain('hidden')
  })
})

describe('ApplicationStepProgress markup', () => {
  it('renders compact progress plus a desktop step grid that stays hidden on mobile', () => {
    const html = renderToStaticMarkup(
      createElement(ApplicationStepProgress, { currentStep: 2 })
    )
    expect(html).toContain('Step 2 of 6')
    expect(html).toContain('Location')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain(APPLICATION_STEP_LIST_CLASS)
    expect(html).toContain(APPLICATION_STEP_CURRENT_LABEL_CLASS)
    expect(html).toContain('lg:grid-cols-3')
    expect(html).not.toContain('overflow-x-auto')
  })
})

describe('application journey source wiring', () => {
  it('keeps application actions stacked and reachable on mobile', () => {
    const source = readFileSync(
      join(repoRoot, 'app/(club)/application/application-form.tsx'),
      'utf8'
    )
    expect(source).toContain('APPLICATION_ACTIONS_CLASS')
    expect(source).toContain('MOBILE_FULL_CONTROL_CLASS')
    expect(source).toContain('textareaClassName')
    expect(source).toContain('saveApplicationDraft')
    expect(source).toContain('submitApplication')
    expect(source).toContain("scrollIntoView({ behavior: 'smooth', block: 'nearest' })")
  })

  it('uses email and tel keyboard hints on account and phone fields', () => {
    const signup = readFileSync(join(repoRoot, 'app/signup/page.tsx'), 'utf8')
    const login = readFileSync(join(repoRoot, 'app/login/page.tsx'), 'utf8')
    const phone = readFileSync(
      join(repoRoot, 'components/profile/profile-phone-verification-card.tsx'),
      'utf8'
    )
    expect(signup).toContain('inputMode="email"')
    expect(signup).toContain('autoComplete="email"')
    expect(login).toContain('inputMode="email"')
    expect(phone).toContain('type="tel"')
    expect(phone).toContain('inputMode="tel"')
    expect(phone).toContain('autoComplete="tel"')
  })

  it('hides the landing-header Join control below sm so Sign in and the wordmark fit at 320px', () => {
    const source = readFileSync(join(repoRoot, 'app/page.tsx'), 'utf8')
    expect(source).toContain('max-sm:hidden px-3 text-xs sm:px-6 sm:text-sm')
    expect(source).toContain('marketingNavLinkClassName')
    expect(source).toContain('w-full sm:w-auto')
  })

  it('clips horizontal overflow at the document root without hiding vertical scroll', () => {
    const layout = readFileSync(join(repoRoot, 'app/layout.tsx'), 'utf8')
    expect(layout).toContain("viewportFit: 'cover'")
    expect(layout).toContain('overflow-x-clip')
    expect(layout).not.toMatch(/<(?:html|body)[^>]*overflow-hidden/)
  })

  it('keeps photo add/remove controls full-width and wrapping on mobile', () => {
    const source = readFileSync(
      join(repoRoot, 'components/application/application-photos-field.tsx'),
      'utf8'
    )
    expect(source).toContain('w-full')
    expect(source).toContain('sm:w-auto')
    expect(source).toContain('min-h-11')
    expect(source).toContain('break-words')
    expect(source).toContain('uploadApplicationPhotoToStorage')
    expect(source).toContain('deleteApplicationPhotoFromStorage')
  })
})
