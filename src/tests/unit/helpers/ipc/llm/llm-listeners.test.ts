import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LLM_STREAM_CHANNEL,
  LLM_STREAM_CHUNK_CHANNEL,
  LLM_STREAM_COMPLETE_CHANNEL,
} from "@/helpers/ipc/llm/llm-channels";
import type { LlmStreamRequestPayload } from "@/helpers/ipc/llm/llm-types";

const ensureActivePakMock = vi.fn();
const upsertPakAssetMock = vi.fn();
const getAssetDataMock = vi.fn();
const ensureAssetFileMetadataMock = vi.fn(() => ({
  assetFileName: "ai-image.png",
  displayFileName: "ai-image.png",
}));
const reserveAssetPathMock = vi.fn(() => "assets/ai-image.png");
const buildPakUriMock = vi.fn((path: string) => `pak://${path}`);

const generateImagesMock = vi.fn();
const generateContentStreamMock = vi.fn();
const registeredHandlers: Record<string, (...args: unknown[]) => void> = {};

vi.mock("electron", () => ({
  ipcMain: {
    on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
      registeredHandlers[channel] = handler;
    }),
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(() => ({
    models: {
      generateContentStream: generateContentStreamMock,
      generateImages: generateImagesMock,
    },
  })),
}));

vi.mock("@/core/pak/pak-manager", () => ({
  ensureActivePak: ensureActivePakMock,
  upsertPakAsset: upsertPakAssetMock,
}));

vi.mock("@/helpers/ipc/pak/getAssetData", () => ({
  getAssetData: getAssetDataMock,
}));

vi.mock("@/core/pak/assetPaths", () => ({
  ensureAssetFileMetadata: ensureAssetFileMetadataMock,
  reserveAssetPath: reserveAssetPathMock,
  buildPakUri: buildPakUriMock,
}));

let addLlmEventListeners: (
  typeof import("@/helpers/ipc/llm/llm-listeners")
)["addLlmEventListeners"];

describe("addLlmEventListeners", () => {
  beforeEach(async () => {
    Object.keys(registeredHandlers).forEach((key) => {
      delete registeredHandlers[key];
    });
    generateImagesMock.mockReset();
    generateContentStreamMock.mockReset();
    ensureActivePakMock.mockReset();
    ensureActivePakMock.mockReturnValue({ files: {} });
    upsertPakAssetMock.mockReset();
    getAssetDataMock.mockReset();
    getAssetDataMock.mockReturnValue(null);
    ensureAssetFileMetadataMock.mockClear();
    reserveAssetPathMock.mockClear();
    buildPakUriMock.mockClear();
    vi.resetModules();
    ({ addLlmEventListeners } = await import("@/helpers/ipc/llm/llm-listeners"));
    addLlmEventListeners();
  });

  it("streams Google models with image output via generateContentStream", async () => {
    const stream = (async function* () {
      yield { text: "A castle at sunrise" };
      yield {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: { data: "AAAA", mimeType: "image/png" },
                  altText: "Better prompt",
                },
              ],
            },
          },
        ],
      };
    })();
    generateContentStreamMock.mockResolvedValue(stream);

    const handler = registeredHandlers[LLM_STREAM_CHANNEL];
    expect(typeof handler).toBe("function");

    const sendMock = vi.fn();
    const payload: LlmStreamRequestPayload = {
      requestId: "request-1",
      provider: "google",
      resolvedProvider: "google",
      modelName: "gemini-2.5-flash-image",
      baseURL: undefined,
      apiKey: "api-key",
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: "Use cinematic lighting." }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "A castle at sunrise" }],
        },
      ],
      headers: undefined,
      capabilities: { input: ["text", "image"], output: ["text", "image"] },
    };

    handler?.(
      { sender: { send: sendMock } } as unknown as Parameters<
        NonNullable<typeof handler>
      >[0],
      payload,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(generateContentStreamMock).toHaveBeenCalledWith({
      model: "gemini-2.5-flash-image",
      contents: expect.any(Array),
      systemInstruction: {
        role: "system",
        parts: [{ text: "Use cinematic lighting." }],
      },
    });
    expect(generateImagesMock).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const placeholderCall = sendMock.mock.calls.find(
      ([channel, message]) =>
        channel === LLM_STREAM_CHUNK_CHANNEL &&
        (message as { type?: string }).type === "image-placeholder",
    );
    expect(placeholderCall).toBeTruthy();
    expect(placeholderCall?.[1]).toEqual({
      requestId: payload.requestId,
      type: "image-placeholder",
      asset: {
        path: "assets/ai-image.png",
        uri: "pak://assets/ai-image.png",
        fileName: "ai-image.png",
      },
    });

    const chunkCall = sendMock.mock.calls.find(
      ([channel, message]) =>
        channel === LLM_STREAM_CHUNK_CHANNEL &&
        (message as { type?: string }).type === "image",
    );
    expect(chunkCall).toBeTruthy();
    expect(chunkCall?.[1]).toEqual({
      requestId: payload.requestId,
      type: "image",
      asset: {
        path: "assets/ai-image.png",
        uri: "pak://assets/ai-image.png",
        fileName: "ai-image.png",
      },
      alt: "Better prompt",
    });

    expect(ensureAssetFileMetadataMock).toHaveBeenCalledWith(
      "Better prompt",
      "png",
    );
    expect(reserveAssetPathMock).toHaveBeenCalledWith(
      expect.any(Set),
      "ai-image.png",
    );
    expect(upsertPakAssetMock).toHaveBeenCalledWith({
      path: "assets/ai-image.png",
      data: expect.any(Buffer),
    });
    expect(buildPakUriMock).toHaveBeenCalledWith("assets/ai-image.png");

    expect(sendMock).toHaveBeenCalledWith(LLM_STREAM_COMPLETE_CHANNEL, {
      requestId: payload.requestId,
    });
  });
});
