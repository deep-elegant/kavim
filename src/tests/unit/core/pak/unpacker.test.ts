import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readPak} from "@/core/pak/unpacker";
import { getCanvasFromPak } from "@/core/pak/pak-utils";

describe("readPak", () => {
  it("loads provided sample - file integrity", async () => {
    const samplePath = path.join(__dirname, "samples", "sample1.pak");

    const pak = await readPak(samplePath, false);
    const imageAsset = await fs.readFile(path.join(__dirname, "samples", "assets", "dragonEagle.png"));

    expect(pak.fileCount).toEqual(3);
    expect(pak.version).toEqual(1);
    // Checking asset integrity
    expect(pak.files["assets/dragoneagle.png"]?.equals(imageAsset)).toBe(true);

    // Checking nodes
    const canvas = getCanvasFromPak(pak.files);
    expect(canvas.nodes).toEqual([
    {
        id: "d94ecf2b-ab6b-422f-875c-5ea7d0489cdd",
        type: "sticky-note",
        position: {
        x: 1816.0856163344624,
        y: 653.7073356675849,
        },
        data: {
        label: "<p>Rectangle</p>",
        isTyping: false,
        color: {
            background: "#ffe83f",
            border: "#E6D038",
            text: "#000000",
        },
        fontSize: "auto",
        shape: "rectangle",
        },
        width: 353,
        height: 143,
        style: {
        width: 291.0175807699966,
        height: 194.01172051333094,
        },
        selected: false,
        zIndex: 100,
        measured: {
        width: 353,
        height: 143,
        },
        resizing: false,
    },
    {
        id: "145ac5b5-25a5-4d40-9a38-43d195b64d25",
        type: "sticky-note",
        position: {
        x: 2271.0962709229466,
        y: 655.5187368694602,
        },
        data: {
        label: "<p>Triangle</p>",
        isTyping: false,
        color: {
            background: "#ffe83f",
            border: "#E6D038",
            text: "#000000",
        },
        fontSize: "auto",
        shape: "triangle",
        },
        width: 353,
        height: 143,
        style: {
        width: 291.0175807699966,
        height: 194.01172051333094,
        },
        selected: false,
        zIndex: 100,
        measured: {
        width: 353,
        height: 143,
        },
        resizing: false,
        dragging: false,
    },
    {
        id: "4ea3fd52-d272-4a93-ad0a-2a07c227ffee",
        type: "sticky-note",
        position: {
        x: 2107.6945663751885,
        y: 863.4675911167495,
        },
        data: {
        label: "<p>Circular</p>",
        isTyping: false,
        color: {
            background: "#ffe83f",
            border: "#E6D038",
            text: "#000000",
        },
        fontSize: "auto",
        shape: "ellipse",
        },
        width: 353,
        height: 143,
        style: {
        width: 291.0175807699966,
        height: 194.01172051333094,
        },
        selected: false,
        zIndex: 100,
        measured: {
        width: 353,
        height: 143,
        },
        resizing: false,
        dragging: false,
    },
    {
        id: "24a56cd4-47d7-4d49-9b16-d0f09041e651",
        type: "image-node",
        position: {
        x: 2613.3525303189317,
        y: 1118.1134346074296,
        },
        data: {
        src: "pak://assets/dragoneagle.png",
        alt: "dragonEagle.png",
        fileName: "dragonEagle.png",
        naturalWidth: 1024,
        naturalHeight: 1024,
        },
        width: 480,
        height: 480,
        style: {
        width: 480,
        height: 480,
        },
        selected: false,
        measured: {
        width: 480,
        height: 480,
        },
        dragging: false,
    },
    {
        id: "7338e08b-0ec2-4001-865d-0b06da493225",
        type: "sticky-note",
        position: {
        x: 2678.5283426788787,
        y: 1005.353579097997,
        },
        data: {
        label: "<p>Image node</p>",
        isTyping: false,
        color: {
            background: "#ffe83f",
            border: "#E6D038",
            text: "#000000",
        },
        fontSize: "auto",
        shape: "rectangle",
        },
        width: 343.15826766275313,
        height: 140.0522477503598,
        style: {
        width: 343.15826766275313,
        height: 140.0522477503598,
        },
        selected: false,
        zIndex: 100,
        measured: {
        width: 343,
        height: 140,
        },
        dragging: false,
    },
    {
        id: "1db44ef2-2fe9-4fb1-9a99-55bf2bf8eeee",
        type: "ai-node",
        position: {
        x: 1473.5336723031126,
        y: 1105.3908724876833,
        },
        data: {
        label: "<p>Hello</p>",
        model: "deepseek",
        status: "done",
        result: "Shapes on the canvas—let's connect them. What's the spark?",
        attachments: [
        ],
        },
        width: 605.6803954847535,
        height: 639.6323910673882,
        style: {
        width: 605.6803954847535,
        height: 639.6323910673882,
        },
        selected: false,
        measured: {
        width: 606,
        height: 640,
        },
    },
    {
        id: "7debdcf5-f268-4b86-9c8d-4314eb707338",
        type: "sticky-note",
        position: {
        x: 1570.5395325597779,
        y: 1041.7307766942467,
        },
        data: {
        label: "<p>AI NODE</p>",
        isTyping: false,
        color: {
            background: "#ffe83f",
            border: "#E6D038",
            text: "#000000",
        },
        fontSize: "auto",
        shape: "rectangle",
        },
        width: 346.1897007957739,
        height: 56.99099840798931,
        style: {
        width: 346.1897007957739,
        height: 56.99099840798931,
        },
        selected: false,
        zIndex: 100,
        measured: {
        width: 346,
        height: 57,
        },
    },
    ]);
  });
});
