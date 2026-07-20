'use server'

export async function approveCuratedIntroRequest(
  _introRequestId: string,
  _adminNotes?: string
) {
  return {
    error:
      'Staff intro approval has been retired. Members accept or decline message requests directly.',
  }
}

export async function declineCuratedIntroRequestAction(
  _introRequestId: string,
  _adminNotes?: string
) {
  return {
    error:
      'Staff intro approval has been retired. Members accept or decline message requests directly.',
  }
}
