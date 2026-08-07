import { AiError, type ChatMessage, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

// Gemini's Generative Language REST API. The key goes in the
// `x-goog-api-key` header (not the URL) so it never lands in request
// logs or referers.
const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GoogleResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

/**
 * Gemini's `contents` uses roles `user` and `model` (its name for the
 * assistant) and — like Anthropic — wants the turns to start on the
 * user. Merge consecutive turns, map `assistant` → `model`, drop any
 * leading model turns, and guarantee a non-empty payload.
 */
function toGoogleContents(
  messages: ChatMessage[],
): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  const merged = mergeConsecutive(messages)
  while (merged.length > 0 && merged[0].role === 'assistant') {
    merged.shift()
  }
  if (merged.length === 0) {
    return [
      { role: 'user', parts: [{ text: '(The customer has not sent a message yet.)' }] },
    ]
  }
  return merged.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

/**
 * Call Gemini's `generateContent` endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateGoogle(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  // The model id is user-supplied free text — encode it so a stray space
  // or slash can't break the path.
  const url = `${GOOGLE_BASE}/${encodeURIComponent(model)}:generateContent`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: toGoogleContents(messages),
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('Google', res)
  }

  const data = (await res.json().catch(() => null)) as GoogleResponse | null
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter((t): t is string => typeof t === 'string')
    .join('')
    .trim()
  if (!text) {
    throw new AiError('Google returned an empty response.', {
      code: 'empty_response',
    })
  }
  const usage = normalizeUsage({
    prompt: data?.usageMetadata?.promptTokenCount,
    completion: data?.usageMetadata?.candidatesTokenCount,
    total: data?.usageMetadata?.totalTokenCount,
  })
  return { text, usage }
}
