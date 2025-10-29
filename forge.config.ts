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

const iconPath = path.resolve(__dirname, "assets", "icon");

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: ["./assets"],
    icon: iconPath,
  },
  rebuildConfig: {},
  makers: [
    new MakerWix({
        manufacturer: "DeepElegant",
        icon: "./assets/icon.ico",
    }),
    new MakerDMG({
      format: "ULFO",
      icon: "./assets/icon.icns",
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({
      options: {
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
