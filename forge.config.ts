import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerDMG } from "@electron-forge/maker-dmg";
import MakerAppImage from "@pengx17/electron-forge-maker-appimage";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import path from "path";
import fs from "fs/promises";

const iconPath = path.resolve(__dirname, "assets", "icon");

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "DeepElegant-Kavim",
    executableName: "deepelegant-kavim", // Consistent executable name across all platforms
    appBundleId: "com.deepelegant.kavim", // Add if you don't have it
    extraResource: ["./assets"],
    icon: iconPath,
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      authors: "DeepElegant",
      iconUrl: "https://kavim.deepelegant.com/favicon.ico",
      name: "DeepElegantKavim", // No spaces for Windows
      description: "DeepElegant Kavim Application", // Plain ASCII only
    }),
    new MakerDMG({
      name: "DeepElegantKavim",
      format: "ULFO",
      icon: "./assets/icon.icns",
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({
      options: {
        name: "deepelegant-kavim", // Must match executableName
        productName: "DeepElegant Kavim",
        bin: "deepelegant-kavim",
      },
    }),
    new MakerDeb({
      options: {
        icon: "./assets/icon.png",
        name: "deepelegant-kavim", // Must match executableName
        productName: "DeepElegant Kavim", // Display name (can have spaces)
        bin: "deepelegant-kavim", // Must match executableName
      },
    }),
    new MakerAppImage({
      options: {
        name: "deepelegant-kavim", // Must match executableName
        productName: "DeepElegant Kavim", // Display name (can have spaces)
        bin: "deepelegant-kavim", // Must match executableName
        icon: "./assets/icon.png",
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.mts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.mts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),

    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    postMake: async (_forgeConfig, makeResults) => {
      for (const result of makeResults) {
        for (let i = 0; i < result.artifacts.length; i++) {
          const artifact = result.artifacts[i];
          const dirname = path.dirname(artifact);
          const ext = path.extname(artifact);
          const currentName = path.basename(artifact);
          let newName: string | null = null;

          if (result.platform === "win32") {
            if (ext === ".msi") {
              newName = `DeepElegantKavim-windows-${result.arch}.msi`;
            } else if (ext === ".exe") {
              newName = `DeepElegantKavim-windows-${result.arch}.exe`;
            }
          } else if (result.platform === "darwin") {
            if (ext === ".dmg") {
              newName = `DeepElegantKavim-macos-${result.arch}.dmg`;
            } else if (ext === ".zip") {
              newName = `DeepElegantKavim-macos-${result.arch}.zip`;
            }
          } else if (result.platform === "linux") {
            if (ext === ".rpm") {
              newName = `DeepElegantKavim-linux-${result.arch}.rpm`;
            } else if (ext === ".deb") {
              newName = `DeepElegantKavim-linux-${result.arch}.deb`;
            } else if (ext === ".AppImage") {
              newName = `DeepElegantKavim-linux-${result.arch}.AppImage`;
            } else if (currentName.endsWith(".tar.gz")) {
              newName = `DeepElegantKavim-linux-${result.arch}.tar.gz`;
            }
          }

          if (newName) {
            const newPath = path.join(dirname, newName);
            if (artifact !== newPath) {
              await fs.rename(artifact, newPath);
              console.log(`Renamed artifact to ${newPath}`);
              // IMPORTANT: Update the artifact path in the results object
              result.artifacts[i] = newPath;
            }
          }
        }
      }
    },
  },
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "deep-elegant",
          name: "kavim",
        },
        draft: true,
        prerelease: false,
        generateReleaseNotes: true,
        tagPrefix: "v",
        assetMatchers: [
          "out/make/**/*.{zip,dmg,exe,msi,deb,rpm,AppImage}",
          "out/make/**/*.nupkg",
          "out/make/**/RELEASES",
          "out/make/**/*.yml",
        ],
      },
    },
  ],
};

export default config;
