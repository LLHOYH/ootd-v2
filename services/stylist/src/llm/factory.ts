// Provider factory. Mock-by-default unless a real Anthropic key is present
// and the mode hasn't been explicitly forced to 'mock'.

import { loadConfig, type StellaConfig } from '../config';
import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';
import type { LLMProvider } from './provider';

export function getProvider(config?: StellaConfig): LLMProvider {
  const cfg = config ?? loadConfig();
  if (cfg.llmMode === 'mock' || !cfg.anthropicApiKey) {
    return new MockProvider();
  }
  return new AnthropicProvider({ apiKey: cfg.anthropicApiKey });
}
