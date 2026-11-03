# Agent bootstrap runbook

You are a Claude Code agent setting up and starting the War Room project on Scott's Windows machine. Follow this file top to bottom. Do not skip steps. Where a step says **ASK SCOTT**, stop and wait for his reply.

## Read first, in this order
1. `CLAUDE.md` (project rules)
2. This file
3. `docs/design-spec.md` and `docs/technical-design.md` (full design; see step 5 if missing)
4. `docs/contracts-draft.md` and `docs/charon-layout.md` (the concrete specs you will build from)
5. `TASKS-week1.md` (your task list)

## Environment facts
- OS: Windows. Claude Code's Bash tool runs Git Bash. Run PowerShell scripts with:
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./<script>.ps1`
- GPU: GTX 1060 6GB. Fine for development; do not attempt local AI 3D generation.
- Anaconda Python is installed. Do not use it for this project. The Blender MCP server runs through `uv`, which manages its own Python.
- Scott may have user-level Claude Code hooks (for example text-to-speech). Leave his user settings alone; only edit `.claude/` in this repo.

## Step 1: Check tools
Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./check-dev.ps1`

Every line must say `OK`. If anything says `MISS`, go to step 2. Otherwise go to step 3.

## Step 2: Install missing tools
Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./setup-dev.ps1`

- Installers may show Windows permission (UAC) prompts. **ASK SCOTT** to accept them.
- New tools are not on PATH until a new terminal starts. After the script finishes, **ASK SCOTT** to close and reopen Claude Code in this folder, then restart this runbook at step 1.
- If `winget` itself is missing, **ASK SCOTT** to install "App Installer" from the Microsoft Store.

## Step 3: Enable pnpm
Run `corepack enable`, then `pnpm -v`.
- If corepack fails with a permissions error, run `npm install -g pnpm` instead and check `pnpm -v` again.

## Step 4: Git
- If this folder is not a git repo: `git init`, `git add .`, `git commit -m "Starter kit"`.
- Check `gh auth status`. If not logged in, **ASK SCOTT** to run `gh auth login` himself (it opens a browser). Do not block T0 on this; it's needed only to push and run CI.

## Step 5: Design docs
Check that `docs/design-spec.md` and `docs/technical-design.md` exist (PDF versions are also fine). If either is missing, **ASK SCOTT** to download them from Claude (open each doc, use its download option, Markdown preferred) and save them into `docs/` with those names. You can still start T0 while waiting, but do not start T1 without them.

## Step 6: Human-only items (do not wait on these for T0)
Print this checklist for Scott, then continue:
- [ ] `gh auth login` (needed before pushing to GitHub)
- [ ] Blender add-on connected (see SETUP.md section 3), needed only from the week 6 asset pass, plus a quick test now if he wants
- [ ] Approve the `blender` MCP server when Claude Code asks
- [ ] Free accounts listed in SETUP.md section 4, needed from week 2

## Step 7: Start building
Begin `TASKS-week1.md` at T0. Rules while working:
- One task at a time, in order. Commit after each task: `git commit -m "T<n>: <summary>"`.
- After every task, use the `test-runner` subagent. For any change in `packages/sim`, also use `determinism-reviewer`.
- Never weaken a lint rule, skip a test, or use `// @ts-ignore` to make checks pass.
- If the same problem fails after two serious attempts, stop and report: what you tried, what failed, and two or three options.
- **ASK SCOTT** before: changing any contract after T1 is approved, adding a paid service, entering credentials, or deviating from the technical design. Record approved deviations in `docs/decisions.md`.
- At the end of each task, give Scott a short report: what was built, how to see it (a command or URL), test results, and anything he should decide.
