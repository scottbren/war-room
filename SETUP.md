# Dev environment setup (for Scott)

Most of this the agent can run itself by following `AGENT-BOOTSTRAP.md`. This file covers what only you can do, plus a manual path if you prefer.

## 0. Put the design docs in the repo (required)
Claude Code can't open claude.ai links. Open each doc in Claude, use its download option (Markdown preferred, PDF also works), and save:
- War Room — Prototype Design Spec → `docs/design-spec.md`
- War Room — Technical Design → `docs/technical-design.md`

Re-download whenever you change a doc.

## 1. Start the agent
Unzip the starter kit to a folder like `C:\dev\war-room`, open a terminal there, run `claude`, and say:
> Follow AGENT-BOOTSTRAP.md from the top.

It will check tools, install what's missing (accept any Windows permission prompts), and ask you to restart it once if new tools were installed.

## 2. Sign in (you, in your own terminal)
- `gh auth login` (opens a browser)
- If Claude Code auth ever fails, check for leftover `ANTHROPIC_BASE_URL` or `ANTHROPIC_AUTH_TOKEN` environment variables.

## 3. Connect Blender (needed by week 6; optional test now)
1. Download `addon.py` from the blender-mcp GitHub repository (ahujasid/blender-mcp). Check its README for current steps.
2. Blender: Edit → Preferences → Add-ons → Install from disk → `addon.py`, then enable it.
3. In the 3D viewport, press N, open the BlenderMCP tab, click Connect.
4. In Claude Code, approve the `blender` server, run `/mcp` to confirm, then try: "create a 10 m by 10 m floor and a 3 m wall in Blender".

Blender must be open and connected whenever an agent uses it.

## 3b. Browser access for agents
The repo's `.mcp.json` also registers Playwright MCP, which lets agents open the game in a browser and take screenshots. Approve the `playwright` server when Claude Code asks. If it fails on Windows, run `claude mcp add playwright -- cmd /c npx -y @playwright/mcp@latest` instead.

## 4. Free accounts (create when needed)
| Account | Used for | When |
| --- | --- | --- |
| GitHub | Repo and CI | Week 1 |
| Cloudflare (free) | LLM gateway | Week 2 |
| Anthropic API key | The game's advisor calls through the gateway (separate from your Claude Code login) | Week 2 |
| Adobe (free) for Mixamo | Character rigging and animations | Week 6 |
| Meshy (free tier) | AI props for gaps; requires crediting Meshy | Week 6 |
Poly Haven needs no account.

Never paste API keys into chat with the agent. When the gateway needs one, you'll set it yourself with Cloudflare's secret command.

## 5. Your review points
- **End of T1:** review the contracts (the agent will summarize them). Nothing else gets built until you approve.
- **End of T13:** walk the greybox and read the week-1 summary.
