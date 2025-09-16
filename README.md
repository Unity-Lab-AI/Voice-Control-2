# Unity Chat

[![Main Build Status](https://github.com/unityailab/Voice-Control-2/actions/workflows/main-branch-pipeline.yml/badge.svg?branch=main&job=Build%20and%20Upload%20Artifacts)](https://github.com/unityailab/Voice-Control-2/actions/workflows/main-branch-pipeline.yml)
[![Main Tests Status](https://github.com/unityailab/Voice-Control-2/actions/workflows/main-branch-pipeline.yml/badge.svg?branch=main&job=Run%20Tests)](https://github.com/unityailab/Voice-Control-2/actions/workflows/main-branch-pipeline.yml)

Unity Chat is a static Pollinations AI workspace with configurable models, voices, and visual themes. The interface is built for GitHub Pages deployment and includes automated workflows for validation, testing, and publishing.

## Theme support

The application dynamically loads every theme in the `themes/` directory. The interface stores the selected theme in local storage and keeps the dropdown in sync with the active choice, ensuring a consistent experience across reloads.

## Automated workflows

Two GitHub Actions workflows keep the project healthy:

- **Pull Request Quality Checks** – runs the Pollinations text generation smoke test for every pull request and records the outcome in the job summary.
- **Main Branch Pipeline** – builds the static site, runs the smoke test against the `/tests` suite, reports build and test status summaries, and deploys the latest build to GitHub Pages.

The badges above surface the live build and test status from the `main` branch pipeline.

## Local development

Install dependencies once:

```bash
npm ci
```

Run the bundled validation checks:

```bash
npm test
```

Execute the Pollinations text smoke tests:

```bash
# Run the /test suite (matches pull request checks)
npm run test:pollinations:pr

# Run the /tests suite (matches the main pipeline)
npm run test:pollinations
```

Build the static site locally:

```bash
npm run build
```

## Project structure

- `script.js` – main application logic, including Pollinations API integration, state management, and theme handling.
- `themes/` – CSS variable overrides for all interface themes.
- `tests/` & `test/` – lightweight smoke tests that exercise the Pollinations text endpoint using Node's built-in test runner.
- `.github/workflows/` – GitHub Actions workflows for pull request checks and main branch deployments.
