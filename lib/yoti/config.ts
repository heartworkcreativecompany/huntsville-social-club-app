import fs from 'node:fs'
import path from 'node:path'
import { IDVClient } from 'yoti'
import { appBaseUrl } from '@/lib/stripe/config'

export const YOTI_SANDBOX_IDV_API_URL =
  'https://api.yoti.com/sandbox/idverify/v1'

let idvClient: IDVClient | null = null

function readYotiPem(): string {
  const keyFilePath = process.env.YOTI_KEY_FILE_PATH
  if (!keyFilePath?.trim()) {
    throw new Error('YOTI_KEY_FILE_PATH is not configured.')
  }

  const resolvedPath = path.isAbsolute(keyFilePath)
    ? keyFilePath
    : path.join(process.cwd(), keyFilePath)

  return fs.readFileSync(resolvedPath, 'utf8')
}

export function isYotiConfigured(): boolean {
  return Boolean(
    process.env.YOTI_CLIENT_SDK_ID?.trim() &&
      process.env.YOTI_KEY_FILE_PATH?.trim()
  )
}

export function getYotiIdvClient(): IDVClient {
  const clientSdkId = process.env.YOTI_CLIENT_SDK_ID?.trim()
  if (!clientSdkId) {
    throw new Error('YOTI_CLIENT_SDK_ID is not configured.')
  }

  if (!idvClient) {
    idvClient = new IDVClient(clientSdkId, readYotiPem(), {
      apiUrl: YOTI_SANDBOX_IDV_API_URL,
    })
  }

  return idvClient
}

export function yotiSandboxVerificationUrl(
  sessionId: string,
  clientSessionToken: string
): string {
  const params = new URLSearchParams({
    sessionID: sessionId,
    sessionToken: clientSessionToken,
  })

  return `${YOTI_SANDBOX_IDV_API_URL}/web/index.html?${params.toString()}`
}

export function yotiVerificationReturnUrls() {
  const baseUrl = appBaseUrl()
  return {
    successUrl: `${baseUrl}/profile?yoti=success`,
    errorUrl: `${baseUrl}/profile?yoti=error`,
  }
}
