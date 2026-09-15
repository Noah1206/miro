import { OpenAICompatibleProvider } from './openai-compatible'
/** Separate private inference service; never load model weights in the application server. */
export class MiroSLMProvider extends OpenAICompatibleProvider {
  constructor(endpoint: string, key: string, modelVersion: string) { super('miro-slm', key, modelVersion, endpoint.replace(/\/$/, '')) }
}
