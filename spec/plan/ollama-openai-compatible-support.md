# Plan: Add custom OpenAI-compatible (Ollama) model support

1) Map current flow and constraints
- Trace how models/providers are declared (`src/core/llm/aiModels.ts`) and consumed in availability resolution, selection UI, settings store, and IPC (`src/core/llm/llmAvailability.ts`, `SingleLlmSelect.tsx`, `SettingsModal.tsx`, `src/helpers/ipc/llm` files).
- Note gateway behavior: OpenRouter shortcut is applied when `useForAllModels` is true; new custom endpoints should bypass gateway logic.

2) Extend model/provider metadata to accept a user-supplied OpenAI-compatible entry
- Add a provider/model placeholder (e.g., `custom-ollama`) in `aiModels.ts` with capabilities set to text (and images only if supported) and with `baseURL`/`modelId` resolved from settings instead of hardcoded constants.
- Update related types/unions so the new provider value is valid across the app, and keep a label that clarifies it must follow the OpenAI API spec.
- Ensure defaults allow the option to remain disabled until the user supplies endpoint/model values.

3) Persist custom endpoint/model (and optional API key) in settings storage
- Extend the Electron settings bridge to store `baseURL`, `model`, and `apiKey`, dynamic capabilities (input/output types) for the custom provider, mirroring existing provider storage shape.
- Add minimal validation/normalization (trim, ensure URL-like string) and keep compatibility with existing stored keys.
- Document in the note that the endpoint must be OpenAI-standard (e.g., Ollama’s OpenAI-compatible API).

4) Update Settings modal UI to capture the custom provider configuration
- Add a separator line, the configuration for "Ollama (local)" inputs for “Endpoint URL”, “Model name”, and API key (Mention apiKey "ollama" will be sent if not provided) to `SettingsModal.tsx` and capabilties section (support image input toggle, support image output toggle), grouped under a “Ollama (local)” section with the OpenAI-standards note.
- Wire these fields into the new settings store entries and ensure visibility toggles work for the API key.
- Make the Save action persist the custom data and emit the availability update event so dropdowns refresh.

5) Surface the custom model in the LLM selector with correct enablement
- Update `SingleLlmSelect.tsx` (and availability resolver) to treat the custom entry as enabled only when endpoint and model are present (When model name and endpoint provided); otherwise keep it visible but disabled.
- Display the user-specified model name in the label so users can identify which custom model they configured.

6) Pipe the custom endpoint/model through the streaming path
- In `generateAiResult`, resolve the model name/baseURL from settings for the custom entry, skip gateway overrides, and pass through the capabilities.
- In IPC listeners (`src/helpers/ipc/llm/*`), allow the custom provider value and route it through the OpenAI client with the supplied `baseURL` and headers; keep existing safety checks/errors for missing config.

7) Tests and validation
- Update/extend unit tests (e.g., `SingleLlmSelect` and `generateAiResult`) to cover custom-model enablement logic and payload construction.
- Add manual QA notes: set a local Ollama endpoint + model, confirm selection becomes enabled, and verify the stream hits the custom URL and responds; also verify non-configured state stays disabled.
