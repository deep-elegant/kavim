# Contributing to Kavim

We are excited that you want to help make **Kavim** better. This guide explains how to get set up, report issues, and propose changes to the project. Please read it carefully before opening an issue or pull request.

## Ground rules

- **Be kind.** We follow our [Code of Conduct](./CODE_OF_CONDUCT.md) in all repositories and community spaces.
- **Discuss before you build.** If you are unsure whether a feature or fix fits the project, open an issue or start a thread in [GitHub Discussions](https://github.com/orgs/deep-elegant/discussions) or [Discord](https://discord.com/invite/xTFEu5Q6q6).
- **Prefer small, focused changes.** Smaller PRs are easier to review and land faster.
- **Document behavior.** If your change affects the UI, CLI, or developer workflow, update README files, docs, or in-app copy as needed.

## Local development

### Prerequisites

- Node.js 22.x (we test on the latest active LTS release)
- npm 10+
- Git

### Setup

```bash
# 1. Clone your fork
 git clone https://github.com/<your-username>/kavim.git
 cd kavim

# 2. Install dependencies
 npm install

# 3. Start the desktop app in development mode
 npm run start
```

> The development server restarts automatically on file changes. Renderer changes trigger hot reloads; main-process changes restart Electron.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run start` | Launches Electron with Vite in development mode. |
| `npm run debug` | Starts Electron with the Chromium devtools debugger enabled. |
| `npm run lint` | Runs ESLint across the project. |
| `npm run format` | Checks formatting using Prettier. |
| `npm run format:write` | Applies Prettier formatting in-place. |
| `npm run test` | Executes the Vitest unit test suite. |
| `npm run package` | Produces a development build in `.vite/build`. |
| `npm run make` | Builds distributable installers for your platform. |

## Issue reporting

When reporting a bug, include:

- The Kavim version (see `Help → About`)
- Your OS and version
- Steps to reproduce the issue
- Expected vs. actual behavior
- Logs or screenshots, if available

For feature requests, describe the problem you want to solve, why it matters, and any constraints or ideas you have. We label issues to help new contributors find good first tasks.

## Pull request process

1. **Create a branch** your name + a short description of the work (for example, `shahar/focus-trap` or `shahar/canvas-export`).
2. **Stay in sync** with `main` by rebasing regularly to avoid large merge conflicts.
3. **Write clear commits.** Follow the conventional format `type(scope): message` when possible (e.g., `fix(editor): clamp zoom level`).
4. **Keep tests passing.** Run `npm run lint` and `npm run test` locally.
5. **Add coverage.** New features or bug fixes should come with tests when practical.
6. **Update docs.** Modify README files, in-app copy, or API docs if behavior changes.
7. **Request review.** Fill out the PR template, reference related issues (`Fixes #123`), and explain the change and validation steps.

We squash merge most pull requests. Please avoid force-pushing to shared branches.

## Coding standards

- Use TypeScript strict mode patterns (type everything, prefer `unknown` over `any`).
- Prefer functional React components and hooks. Avoid class components.
- Follow existing naming conventions for IPC channels and stores.
- Use Tailwind utility classes where possible, and co-locate shared styles under `src/style`.
- Do not include secrets, API keys, or proprietary assets in commits.

The repository includes configuration files for ESLint, Prettier, and TypeScript. Let the automated tooling guide style choices instead of reformatting by hand.

## Documentation and content changes

- UI copy lives with the component in `src/localization/i18n.ts`—update localization files where relevant.
- Public docs live at [docs.kavim.deepelegant.com](https://docs.kavim.deepelegant.com); propose updates via PRs to the docs repository or open an issue here if unsure.

## Releases
Only maintainers publish releases for now.

## 🔁 Auto-update & releases

Packaged builds now publish signed update artifacts to GitHub so the desktop app can discover and install new versions automatically.

1. **Set credentials** – export a `GITHUB_TOKEN` with permission to create releases in [`deep-elegant/kavim`](https://github.com/deep-elegant/kavim).
2. **Bump the version** – update `package.json` and commit the change before publishing.
3. **Publish** – run `npm run publish` to generate installers (`.dmg`, `.zip`, `.deb`, `.rpm`, `.nupkg`, etc.) and upload them alongside the required auto-update metadata (`latest.yml`, `RELEASES`, delta packages).
4. **Promote the release** – once the draft looks good, finalize it on GitHub. Clients on Windows, macOS, and Linux will receive the new version the next time they check for updates.

> **Tip:** auto-update checks are skipped while running `npm start`. Build a packaged app to exercise the full flow end-to-end.

## Need help?

- Open a question in [GitHub Discussions](https://github.com/orgs/deep-elegant/discussions)
- Join us on [Discord](https://discord.com/invite/xTFEu5Q6q6)

Thank you for helping build Kavim! 💜
