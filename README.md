# Prepress i360

An Adobe Illustrator tool set for the Allegra / Image360 prepress workflow. One
launcher shows every tool in a single list, so an operator can work down the
list and run whichever ones the job needs.

---

## What it is

`Prepress i360.jsx` is a launcher. It shows the available tools in one list
with, for each one, what it does, what it will change in the document, and its
known limits. It checks the document is in a fit state before running a tool,
runs it, and reports what happened.

By default it is a **floating panel that does not lock Illustrator**. It stays
open while you work: select artwork, zoom, edit, then click **Run tool**.

The four tools themselves are unmodified. They are the original `.jsx` files,
byte for byte, sitting in `src/tools/`.

## The tools

| Tool | Needs | What it does |
| --- | --- | --- |
| **Used Colors Panel** | Document | Scans visible, unlocked artwork for fill and stroke colours, adds any missing ones to the Swatches panel, and builds a labelled colour panel 0.25 in below the active artboard. Each 1 in swatch is labelled with name, CMYK, RGB, HEX and LAB. |
| **Find Double CutContour** | Document | Finds pairs of different CutContour-stroked paths running within 2.25 pt of each other for at least 18 pt and moves both to a `duplicate cutlines` layer for review. Also collects stray single-anchor points and CutContour paths whose stroke is not centre aligned. |
| **Auto Measure Pro** | Document | Opens the Auto Measure Pro control center and draws measurement-only overlays: dimensions, gaps and rounded-corner callouts. CutContour is the boundary when present, otherwise the artboard. |
| **Isometric Build View** | Document + selection | Copies the selection to a new layer, shears each copy into an isometric view, spreads the copies apart, and draws an arrow between each adjacent pair to show build order. The original artwork is untouched. |

Each tool's full description, the changes it makes and its limits are shown in
the launcher itself, and are listed in the `REGISTRY` array at the top of
`src/Prepress i360.jsx`.

### Read this before running Find Double CutContour

Its own header marks it **DRAFT v1.2, untested in Illustrator**, and says to run
it on a copy of the file first. It moves artwork between layers, which changes
the document. The launcher shows a confirmation prompt before it runs, with
**No** as the default. That warning is the script author's, carried through
unchanged, not an added disclaimer.

---

## Panel modes

One setting at the top of `src/Prepress i360.jsx` picks how the launcher
behaves:

```js
var PREPRESS_I360_PANEL_MODE = "palette";
```

| Mode | Behaviour |
| --- | --- |
| `"palette"` | **Default.** Floating panel. Does not lock Illustrator. Stays open while you work, so you can select artwork with the panel open. Tools are dispatched through BridgeTalk. |
| `"dialog"` | Modal dialog. Locks Illustrator while open, reopens after each run. Fewer moving parts, no BridgeTalk, no persistent engine. The fallback if the palette misbehaves on a given install. |

Both modes run the same tools through the same preflight checks and report
results the same way. Switching is a one-line edit.

### What "does not lock Illustrator" does and does not mean

**It does** mean the panel no longer blocks Illustrator while it sits open. You
can select artwork, zoom, and edit with the panel on screen. That was the part
getting in the way, and it is fixed.

**It does not** mean Illustrator stays responsive while a tool is actually
running. ExtendScript executes on Illustrator's main thread, with no threading
and no asynchronous execution. While a tool is doing its work, Illustrator is
busy, and the panel is frozen along with it. BridgeTalk changes which context
the code runs in, not whether it blocks.

Auto Measure Pro is 24,662 lines and will visibly pause the application while it
runs. That is not a bug in the launcher, and no ExtendScript, CEP or UXP plugin
can change it. The only way to shorten that pause is to make the tool itself do
less work.

## Install

See [INSTALL.md](INSTALL.md). In short: copy `src/` to wherever you keep
scripts, then run `Prepress i360.jsx` from **File > Scripts**. No certificate,
no registry edit, and no admin rights if you install to a user or network
folder.

## Adding your own tool

Drop a `.jsx` into the `tools` folder and it appears in the list straight away,
marked *unlisted*. To give it a description and a preflight check, add an entry
to `REGISTRY`. See [docs/adding-a-tool.md](docs/adding-a-tool.md).

---

## How it is built, and why

Three constraints decided the shape, each one checked rather than assumed.

**UXP is not an option.** UXP is Adobe's modern plugin framework, but it is not
publicly available for Illustrator to third-party developers. Porting
`auto_measure_pro.jsx` — 24,662 lines and 1,013 functions of ExtendScript — is
not on the table regardless.

**CEP would need IT involvement on every workstation.** A CEP HTML panel is the
only public panel framework for Illustrator, but an unsigned CEP extension will
not load unless `PlayerDebugMode` is set: a registry entry under
`HKEY_CURRENT_USER/Software/Adobe/CSXS.12` on Windows, or
`defaults write com.adobe.CSXS.12 PlayerDebugMode 1` on macOS. Avoiding that
means shipping a signed ZXP, which needs a code-signing certificate. It would
also not have helped with the lock: a CEP panel calls ExtendScript through
`evalScript`, which still runs on Illustrator's main thread.

**A ScriptUI palette cannot reach the document on its own.** A palette floats
instead of blocking, but code in its event handlers does not get a correct
Illustrator object model. The documented way round it is to hand the work to
Illustrator with a `BridgeTalk` message, which is what the launcher does in
palette mode. Two consequences shape the code:

- `$.fileName` is not available inside a BridgeTalk message, so the tools folder
  is resolved in the panel and each tool's absolute path is baked into the
  message as a string literal.
- The panel cannot see the document, so the preflight checks run inside the
  message, in Illustrator's context, and the answer comes back on `onResult`.

`#targetengine "main"` puts the launcher in a persistent, named engine so the
panel survives after the script that created it has finished. Without it the
panel closes the moment the script ends. `#include` is deliberately not used
anywhere, because a palette created in an included file closes itself on call.

## Re-running tools in one Illustrator session

Illustrator keeps a single ExtendScript engine alive for the whole application
session, and its state is cumulative across every script that has already run.
That makes re-running a script that defines globals a fair question, so it was
checked against these four files:

- `used_colors_panel`, `find_double_cutcontour` and `isometric_build_view` each
  wrap their whole body in a self-executing function and define nothing at
  global scope. Safe to run any number of times.
- `auto_measure_pro` defines 1,013 global functions and layers 61 override
  chains of the form `var X_BASE = X; X = function () { ... X_BASE ... };`.
  All 61 of those names also have a real `function NAME(...)` declaration in the
  same file. Function declarations are hoisted and assigned before any statement
  of the file runs, so each evaluation resets every name to its pristine version
  and rebuilds the override chain from scratch. The file declares no other
  top-level vars, no implicit globals, and never touches `$.global`. Safe to
  re-run.

A tool added later that assigns to a global without `var`, or that builds an
override chain over a name with no function declaration behind it, would
accumulate state across runs. `docs/adding-a-tool.md` has the check for that.

---

## Sources

- [Install and run scripts in Illustrator](https://helpx.adobe.com/illustrator/desktop/automate-visualize-data/automate-actions/install-and-run-scripts.html) — Adobe, script folder location and the restart requirement
- [How to Install Scripts in Adobe Illustrator](https://creativepro.com/how-to-install-scripts-in-adobe-illustrator/) — CreativePro, per-platform paths and the admin-access note
- [Executing Scripts — Adobe Illustrator Scripting Guide](https://ai-scripting.docsforadobe.dev/introduction/executingScripts/)
- [CEP 12 HTML Extension Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md) — Adobe, `PlayerDebugMode` requirement for unsigned extensions
- [UXP for Illustrator: Status & What to Use Today](https://mapsoft.com/posts/illustrator-uxp-status.html) — UXP availability for third-party Illustrator developers
- [Create a panel/palette to execute JavaScript code](https://community.adobe.com/t5/illustrator-discussions/create-a-panel-palette-to-execute-javascript-code/td-p/13297876) — Adobe Community, why a palette needs BridgeTalk to reach the Illustrator object model
- [ScriptPanel_2.jsx](https://github.com/Silly-V/Adobe-Illustrator/blob/master/Script%20Panel%202/ScriptPanel_2.jsx) — Silly-V, BridgeTalk dispatch from a palette, and `$.fileName` being unavailable in a BridgeTalk message
- [BridgeTalk palette demo](https://gist.github.com/mhulse/eb0ffb2bd365975632d2) — a minimal working Illustrator palette using `bt.target = 'illustrator'` and `#targetengine main`
- [Create persistent palette via ScriptUI](https://community.adobe.com/t5/illustrator-discussions/create-persistent-palette-via-scriptui/td-p/10757849) — Adobe Community, `#targetengine` for palette persistence, and `#include` closing palettes
- [Top 2 ExtendScript Mistakes and How to Avoid Them](https://hyperbrew.co/blog/top-2-extendscript-mistakes-and-how-to-avoid-them/) — Hyper Brew, Illustrator's persistent, cumulative ExtendScript engine
