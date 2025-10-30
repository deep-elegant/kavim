import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerWix } from "@electron-forge/maker-wix";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerDMG } from "@electron-forge/maker-dmg";
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
    new MakerWix({
      manufacturer: "DeepElegant",
      icon: "./assets/icon.ico",
      name: "DeepElegantKavim", // No spaces for Windows
      // language: 1033, // English
      description: "DeepElegant Kavim Application", // Plain ASCII only
      appUserModelId: "com.deepelegant.kavim",
      upgradeCode: "9bd05423-a0a9-41c9-a443-138f35c133e0", // DO-NOT Change this GUID
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
    postMake: async (forgeConfig, makeResults) => {
      for (const result of makeResults) {
        if (result.platform === "darwin") {
          // it's a mac build — apply rename logic for the DMG artifact
          for (const artifact of result.artifacts) {
            if (artifact.endsWith(".dmg")) {
              const dirname = path.dirname(artifact);
              const newName = `DeepElegantKavim-${result.platform}-${result.arch}.dmg`;
              const newPath = path.join(dirname, newName);
              await fs.rename(artifact, newPath);
              console.log(`Renamed DMG to ${newPath}`);
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
