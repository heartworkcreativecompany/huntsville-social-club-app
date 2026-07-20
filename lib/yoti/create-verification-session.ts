import {
  RequestedDocumentAuthenticityCheckBuilder,
  RequestedLivenessCheckBuilder,
  RequestedTextExtractionTaskBuilder,
  SdkConfigBuilder,
  SessionSpecificationBuilder,
} from 'yoti'
import {
  getYotiIdvClient,
  yotiSandboxVerificationUrl,
  yotiVerificationReturnUrls,
} from '@/lib/yoti/config'

export type YotiVerificationSession = {
  sessionId: string
  clientSessionToken: string
  clientSessionTokenTtl: number
  verificationUrl: string
}

export async function createYotiVerificationSession(
  userTrackingId: string
): Promise<YotiVerificationSession> {
  const { successUrl, errorUrl } = yotiVerificationReturnUrls()

  const sessionSpec = new SessionSpecificationBuilder()
    .withClientSessionTokenTtl(600)
    .withResourcesTtl(86_400)
    .withUserTrackingId(userTrackingId)
    .withRequestedCheck(
      new RequestedDocumentAuthenticityCheckBuilder().build()
    )
    .withRequestedCheck(
      new RequestedLivenessCheckBuilder()
        .forStaticLiveness()
        .withMaxRetries(3)
        .build()
    )
    .withRequestedTask(
      new RequestedTextExtractionTaskBuilder().withManualCheckAlways().build()
    )
    .withSdkConfig(
      new SdkConfigBuilder()
        .withAllowsCameraAndUpload()
        .withLocale('en-US')
        .withPresetIssuingCountry('USA')
        .withSuccessUrl(successUrl)
        .withErrorUrl(errorUrl)
        .build()
    )
    .build()

  const session = await getYotiIdvClient().createSession(sessionSpec)
  const sessionId = session.getSessionId()
  const clientSessionToken = session.getClientSessionToken()

  return {
    sessionId,
    clientSessionToken,
    clientSessionTokenTtl: session.getClientSessionTokenTtl(),
    verificationUrl: yotiSandboxVerificationUrl(sessionId, clientSessionToken),
  }
}
