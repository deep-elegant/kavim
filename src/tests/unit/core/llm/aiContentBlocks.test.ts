import { describe, expect, it } from "vitest";

import {
  blocksFromLegacyResult,
  blocksToPlainText,
  type AiContentBlock,
} from "@/core/llm/aiContentBlocks";
import { getAiResponseBlocks } from "@/core/canvas/nodes/AINode";

describe("aiContentBlocks", () => {
  describe("blocksFromLegacyResult", () => {
    it("returns an empty array for nullish or whitespace input", () => {
      expect(blocksFromLegacyResult(undefined)).toEqual([]);
      expect(blocksFromLegacyResult(null)).toEqual([]);
      expect(blocksFromLegacyResult("")).toEqual([]);
      expect(blocksFromLegacyResult("   ")).toEqual([]);
    });

    it("wraps non-empty markdown strings in a markdown block", () => {
      const result = "**Hello** world";

      expect(blocksFromLegacyResult(result)).toEqual([
        { type: "markdown", markdown: result },
      ]);
    });
  });

  describe("blocksToPlainText", () => {
    it("returns combined plain text for markdown blocks", () => {
      const blocks: AiContentBlock[] = [
        { type: "markdown", markdown: "Hello" },
        { type: "markdown", markdown: "World" },
      ];

      expect(blocksToPlainText(blocks)).toBe("Hello\n\nWorld");
    });

    it("includes image alt text when available", () => {
      const blocks: AiContentBlock[] = [
        { type: "markdown", markdown: "Intro" },
        { type: "image", url: "https://example.com/cat.png", altText: "A cat" },
      ];

      expect(blocksToPlainText(blocks)).toBe("Intro\n\nA cat");
    });

    it("ignores non-textual image blocks without alt text", () => {
      const blocks: AiContentBlock[] = [
        { type: "markdown", markdown: "Intro" },
        { type: "image", url: "https://example.com/cat.png" },
      ];

      expect(blocksToPlainText(blocks)).toBe("Intro");
    });
  });

  describe("getAiResponseBlocks", () => {
    it("prefers explicit response blocks when present", () => {
      const blocks: AiContentBlock[] = [
        { type: "markdown", markdown: "Hello" },
      ];

      expect(
        getAiResponseBlocks({ result: "ignored", responseBlocks: blocks }),
      ).toBe(blocks);
    });

    it("falls back to wrapping the legacy result when blocks are absent", () => {
      const result = "Hello from legacy";

      expect(getAiResponseBlocks({ result })).toEqual([
        { type: "markdown", markdown: result },
      ]);
    });

    it("returns an empty array when data is undefined", () => {
      expect(getAiResponseBlocks(undefined)).toEqual([]);
    });
  });
});
