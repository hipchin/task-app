import { describe, expect, it } from 'vitest'
import { isTrustedRedirect } from './trustedClients'

describe('isTrustedRedirect', () => {
  it('ChatGPT / OpenAI の https は信頼する', () => {
    expect(isTrustedRedirect('https://chatgpt.com/connector/oauth/OWetq9k-fySr')).toBe(true)
    expect(isTrustedRedirect('https://platform.openai.com/callback')).toBe(true)
  })
  it('似せたドメイン・http・不正な URL は信頼しない', () => {
    expect(isTrustedRedirect('https://chatgpt.com.evil.example/cb')).toBe(false)
    expect(isTrustedRedirect('https://evilchatgpt.com/cb')).toBe(false)
    expect(isTrustedRedirect('https://chatgpt-com.example/cb')).toBe(false)
    expect(isTrustedRedirect('http://chatgpt.com/cb')).toBe(false)
    expect(isTrustedRedirect('https://user@evil.example/chatgpt.com')).toBe(false)
    expect(isTrustedRedirect('not a url')).toBe(false)
    expect(isTrustedRedirect('http://localhost:9/callback')).toBe(false)
  })
})
