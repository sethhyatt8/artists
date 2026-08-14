# Template Checklist

Use this checklist each time you clone this repository for a new app.

## 1) Create the new app repo

- Clone this template repository.
- Rename the folder/repository to your new app name.
- Update `package.json` name to match the new app.

## 2) Install and run locally

- Run `npm install`
- Run `npm run dev`
- Confirm the app loads in the browser.

## 3) Set up GitHub Pages

- In GitHub repo settings, enable Pages with **GitHub Actions** as the source.
- Push to `main` and confirm `.github/workflows/deploy-pages.yml` runs successfully.
- Optionally run manual deploy with `npm run deploy`.

## 4) Agent workflow defaults

- Start broad requests in plan/discussion mode when requirements are ambiguous.
- After plan approval, execute end-to-end with minimal interruption.
- Ask concise questions only when blocked by missing external information.

## 5) Quality gates for substantive changes

- Run `npm run lint`
- Run `npm run build`
- Fix issues before opening PRs or shipping.

## 6) Safety defaults

- Avoid destructive git commands unless explicitly requested.
- Surface high-impact risks before taking action.

## 7) Kickoff prompt for each new app

Paste this into Cursor at the start of a new project:

```text
I cloned this web-app template. Help me build [APP NAME].
Start with a short plan, ask only critical clarifying questions, then implement end-to-end with minimal interruptions.
Stack: React + Vite + TypeScript.
Target: static app deployable to GitHub Pages.
```
