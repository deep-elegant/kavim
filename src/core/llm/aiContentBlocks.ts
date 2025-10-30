export type AiMarkdownContentBlock = {
  type: "markdown";
  markdown: string;
};

export type AiImageContentBlock = {
  type: "image";
  url: string;
  altText?: string;
};

export type AiContentBlock = AiMarkdownContentBlock | AiImageContentBlock;

export const blocksFromLegacyResult = (
  result: string | null | undefined,
): AiContentBlock[] => {
  if (!result || result.trim().length === 0) {
    return [];
  }

  return [
    {
      type: "markdown",
      markdown: result,
    },
  ];
};

export const blocksToPlainText = (blocks: AiContentBlock[]): string => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return "";
  }

  return blocks
    .map((block) => {
      if (block.type === "markdown") {
        return block.markdown;
      }

      return block.altText ?? "";
    })
    .filter((value) => value.trim().length > 0)
    .join("\n\n");
};
