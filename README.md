# Prepress i360

An Adobe Illustrator tool set for the Allegra / Image360 prepress workflow. One
launcher shows every tool in a single list, so an operator can work down the
list and run whichever ones the job needs.

![list-driven](https://img.shields.io/badge/UI-ScriptUI%20dialog-informational)

---

## What it is

`Prepress i360.jsx` is a launcher. It shows the available tools in one list
with, for each one, what it does, what it will change in the document, and its
known limits. It checks the document is in a fit state before running a tool,
runs it, then reopens the list so the next tool can be picked without going back
to the **File > Scripts** menu.

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

## Why this shape and not a docked panel

Three constraints decided it, each one checked rather than assumed.

**UXP is not an option.** UXP is Adobe's modern plugin framework, but it is not
publicly available for Illustrator to third-party developers. Porting
`auto_measure_pro.jsx` — 24,662 lines and 1,013 functions of ExtendScript — is
not on the table regardless.

**CEP would need IT involvement on every workstation.** A CEP HTML panel is the
only public panel framework for Illustrator, but an unsigned CEP extension will
not load unless `PlayerDebugMode` is set: a registry entry under
`HKEY_CURRENT_USER/Software/Adobe/CSXS.12` on Windows, or
`defaults write com.adobe.CSXS.12 PlayerDebugMode 1` on macOS. Avoiding that
means shipping a signed ZXP, which needs a code-signing certificate.

**A ScriptUI palette cannot reach the document.** A palette window can float and
dock, but code in its event handlers has no reliable access to the Illustrator
document object model, so every tool would have to be dispatched through
`BridgeTalk`. A `dialog` window runs in Illustrator's own context with full
document access and no indirection.

So: a modal list that reopens after each run. Nothing to sign, nothing to
configure, full document access, and it works on any Illustrator that runs
ExtendScript.

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
- [ScriptPanel_2.jsx](https://github.com/Silly-V/Adobe-Illustrator/blob/master/Script%20Panel%202/ScriptPanel_2.jsx) — Silly-V, the BridgeTalk dispatch a ScriptUI palette requires, and the Startup Scripts folder
- [Top 2 ExtendScript Mistakes and How to Avoid Them](https://hyperbrew.co/blog/top-2-extendscript-mistakes-and-how-to-avoid-them/) — Hyper Brew, Illustrator's persistent, cumulative ExtendScript engine
