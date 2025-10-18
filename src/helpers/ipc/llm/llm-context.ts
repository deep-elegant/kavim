import {
  LLM_STREAM_CHANNEL,
  LLM_STREAM_CHUNK_CHANNEL,
  LLM_STREAM_COMPLETE_CHANNEL,
  LLM_STREAM_ERROR_CHANNEL,
} from './llm-channels';
import type {
  LlmChunkPayload,
  LlmCompletePayload,
  LlmErrorPayload,
  LlmStreamRequestPayload,
} from './llm-types';

export function exposeLlmContext() {
  const { contextBridge, ipcRenderer } = window.require('electron');

  const subscribe = <T>(channel: string, callback: (payload: T) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: T) => {
      callback(payload);
    };

    ipcRenderer.on(channel, handler);

    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };

  contextBridge.exposeInMainWorld('llm', {
    stream: (payload: LlmStreamRequestPayload) => {
      ipcRenderer.send(LLM_STREAM_CHANNEL, payload);
    },
    onChunk: (callback: (payload: LlmChunkPayload) => void) =>
      subscribe(LLM_STREAM_CHUNK_CHANNEL, callback),
    onError: (callback: (payload: LlmErrorPayload) => void) =>
      subscribe(LLM_STREAM_ERROR_CHANNEL, callback),
    onComplete: (callback: (payload: LlmCompletePayload) => void) =>
      subscribe(LLM_STREAM_COMPLETE_CHANNEL, callback),
  });
}
