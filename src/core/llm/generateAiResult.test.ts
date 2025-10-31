import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  LlmChunkPayload,
  LlmCompletePayload,
  LlmErrorPayload,
  LlmStreamRequestPayload,
} from "@/helpers/ipc/llm/llm-types";

type ListenerMap = {
  chunk?: (payload: LlmChunkPayload) => void;
  error?: (payload: LlmErrorPayload) => void;
  complete?: (payload: LlmCompletePayload) => void;
};

const createWindowStub = (listenerMap: ListenerMap) => {
  const subscribe = <K extends keyof ListenerMap>(key: K) =>
    vi.fn((callback: NonNullable<ListenerMap[K]>) => {
      listenerMap[key] = callback;

      return () => {
        if (listenerMap[key] === callback) {
          listenerMap[key] = undefined;
        }
      };
    });

  return {
    setTimeout: (...args: Parameters<typeof setTimeout>) =>
      setTimeout(...args),
    clearTimeout: (id: Parameters<typeof clearTimeout>[0]) =>
      clearTimeout(id),
    settingsStore: {
      getProvider: vi.fn(() => ({ apiKey: "test-api-key" })),
      setProvider: vi.fn(),
      getGateway: vi.fn(() => undefined),
      setGateway: vi.fn(),
      getPreprompt: vi.fn(() => ""),
      setPreprompt: vi.fn(),
    },
    llm: {
      stream: vi.fn<[LlmStreamRequestPayload], void>(),
      onChunk: subscribe("chunk"),
      onError: subscribe("error"),
      onComplete: subscribe("complete"),
    },
  };
};

type WindowStub = ReturnType<typeof createWindowStub>;

let listeners: ListenerMap;
let windowStub: WindowStub;
let generateAiResult: (typeof import("./generateAiResult"))["generateAiResult"];

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();

  listeners = {};
  windowStub = createWindowStub(listeners);

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub,
  });

  let requestCounter = 0;
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
    () => `request-${++requestCounter}`,
  );

  ({ generateAiResult } = await import("./generateAiResult"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (globalThis as { window?: unknown }).window;
});

const getActiveRequest = (): LlmStreamRequestPayload => {
  expect(windowStub.llm.stream).toHaveBeenCalledTimes(1);
  const [payload] = windowStub.llm.stream.mock.calls[0];
  return payload;
};

const getChunkListener = () => {
  expect(typeof listeners.chunk).toBe("function");
  return listeners.chunk!;
};

const getCompleteListener = () => {
  expect(typeof listeners.complete).toBe("function");
  return listeners.complete!;
};

const getErrorListener = () => {
  expect(typeof listeners.error).toBe("function");
  return listeners.error!;
};

describe("generateAiResult", () => {
  it("throttles text updates while streaming structured progress", async () => {
    let currentTime = 0;
    vi.spyOn(performance, "now").mockImplementation(() => currentTime);

    const onUpdate = vi.fn();
    const onProgress = vi.fn();

    const resultPromise = generateAiResult({
      model: "chatgpt",
      messages: [],
      onUpdate,
      onProgress,
      minimumUpdateIntervalMs: 10,
    });

    const payload = getActiveRequest();
    expect(payload.capabilities.output).toBe("text");

    const chunkListener = getChunkListener();

    currentTime = 0;
    chunkListener({
      requestId: payload.requestId,
      type: "text",
      delta: "Hello",
    });

    expect(onProgress).toHaveBeenNthCalledWith(1, {
      aggregatedText: "Hello",
      newBlocks: [{ type: "text", delta: "Hello" }],
    });
    expect(onUpdate).not.toHaveBeenCalled();

    currentTime = 5;
    vi.advanceTimersByTime(5);
    expect(onUpdate).not.toHaveBeenCalled();

    currentTime = 10;
    vi.advanceTimersByTime(5);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenNthCalledWith(1, "Hello");

    currentTime = 12;
    chunkListener({
      requestId: payload.requestId,
      type: "text",
      delta: " world",
    });

    expect(onProgress).toHaveBeenNthCalledWith(2, {
      aggregatedText: "Hello world",
      newBlocks: [{ type: "text", delta: " world" }],
    });

    currentTime = 19;
    vi.advanceTimersByTime(7);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    currentTime = 20;
    vi.advanceTimersByTime(1);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenNthCalledWith(2, "Hello world");

    const completeListener = getCompleteListener();
    currentTime = 30;
    completeListener({ requestId: payload.requestId });

    await expect(resultPromise).resolves.toBeUndefined();

    expect(onUpdate).toHaveBeenCalledTimes(3);
    expect(onUpdate).toHaveBeenNthCalledWith(3, "Hello world");
  });

  it("emits image blocks without disturbing aggregated text", async () => {
    let currentTime = 0;
    vi.spyOn(performance, "now").mockImplementation(() => currentTime);

    const onUpdate = vi.fn();
    const onProgress = vi.fn();

    const resultPromise = generateAiResult({
      model: "gemini-2-5-pro",
      messages: [],
      onUpdate,
      onProgress,
      minimumUpdateIntervalMs: 0,
    });

    const payload = getActiveRequest();
    expect(payload.capabilities.output).toBe("text+image");

    const chunkListener = getChunkListener();

    currentTime = 0;
    chunkListener({
      requestId: payload.requestId,
      type: "text",
      delta: "Hello",
    });

    expect(onProgress).toHaveBeenNthCalledWith(1, {
      aggregatedText: "Hello",
      newBlocks: [{ type: "text", delta: "Hello" }],
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenNthCalledWith(1, "Hello");

    const firstAsset = {
      path: "assets/ai-image.png",
      uri: "pak://assets/ai-image.png",
      fileName: "ai-image.png",
    } as const;

    chunkListener({
      requestId: payload.requestId,
      type: "image-placeholder",
      asset: firstAsset,
    });

    expect(onProgress).toHaveBeenNthCalledWith(2, {
      aggregatedText: "Hello",
      newBlocks: [
        {
          type: "image-placeholder",
          asset: firstAsset,
        },
      ],
    });

    chunkListener({
      requestId: payload.requestId,
      type: "image",
      asset: firstAsset,
      alt: "a description",
    });

    expect(onProgress).toHaveBeenNthCalledWith(3, {
      aggregatedText: "Hello",
      newBlocks: [
        {
          type: "image",
          asset: firstAsset,
          alt: "a description",
        },
      ],
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);

    const completeListener = getCompleteListener();
    currentTime = 5;
    completeListener({ requestId: payload.requestId });

    await expect(resultPromise).resolves.toBeUndefined();

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenNthCalledWith(2, "Hello");
  });

  it("supports image-only models while keeping aggregated text empty", async () => {
    const onUpdate = vi.fn();
    const onProgress = vi.fn();

    const resultPromise = generateAiResult({
      model: "gemini-2-5-flash-image",
      messages: [],
      onUpdate,
      onProgress,
      minimumUpdateIntervalMs: 0,
    });

    const payload = getActiveRequest();
    expect(payload.capabilities.output).toBe("image");

    const chunkListener = getChunkListener();

    const secondAsset = {
      path: "assets/ai-image-2.png",
      uri: "pak://assets/ai-image-2.png",
      fileName: "ai-image-2.png",
    } as const;

    chunkListener({
      requestId: payload.requestId,
      type: "image-placeholder",
      asset: secondAsset,
    });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      aggregatedText: "",
      newBlocks: [
        {
          type: "image-placeholder",
          asset: secondAsset,
        },
      ],
    });

    chunkListener({
      requestId: payload.requestId,
      type: "image",
      asset: secondAsset,
      alt: "prompt alt",
    });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      aggregatedText: "",
      newBlocks: [
        {
          type: "image",
          asset: secondAsset,
          alt: "prompt alt",
        },
      ],
    });
    expect(onUpdate).not.toHaveBeenCalled();

    const completeListener = getCompleteListener();
    completeListener({ requestId: payload.requestId });

    await expect(resultPromise).resolves.toBeUndefined();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenNthCalledWith(1, "");
  });

  it("flushes buffered text and rejects on error", async () => {
    let currentTime = 0;
    vi.spyOn(performance, "now").mockImplementation(() => currentTime);

    const onUpdate = vi.fn();
    const onProgress = vi.fn();

    const resultPromise = generateAiResult({
      model: "chatgpt",
      messages: [],
      onUpdate,
      onProgress,
      minimumUpdateIntervalMs: 25,
    });

    const payload = getActiveRequest();
    const chunkListener = getChunkListener();

    currentTime = 0;
    chunkListener({
      requestId: payload.requestId,
      type: "text",
      delta: "Oops",
    });

    expect(onProgress).toHaveBeenCalledTimes(1);

    const errorListener = getErrorListener();
    currentTime = 10;
    errorListener({ requestId: payload.requestId, error: "Boom" });

    await expect(resultPromise).rejects.toThrow("Boom");

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenNthCalledWith(1, "Oops");
  });
});

