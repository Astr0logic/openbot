export type Provider = "openai" | "anthropic" | "google";

export interface ProviderAdapter {
    run(prompt: string): Promise<string>;
}
