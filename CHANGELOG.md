# Changelog

## 1.0.0

First release. Brings the four existing prepress scripts under one launcher.

### Added

- `src/Prepress i360.jsx` — a ScriptUI launcher that lists the tools, shows what
  each one does, what it changes and its known limits, checks the document is in
  a fit state before running one, and reopens the list after every run.
- Per-tool preflight: blocks a run when no document is open, or when nothing is
  selected for a tool that needs a selection, with a message saying what to do.
- A confirmation prompt, defaulting to **No**, for tools flagged with a
  `caution`. Currently that is **Find Double CutContour**, whose own header
  marks it a draft that is untested in Illustrator.
- Auto-discovery: any `.jsx` or `.js` dropped into `tools/` appears in the list
  marked *unlisted*, so a script can be added without editing the launcher.
- A session log of what was run and how it went.
- Error reporting that gives the message, the line number and the file, with the
  line number pointing into the tool's own source.
- `README.md`, `INSTALL.md` and `docs/adding-a-tool.md`.

### Tools included, unmodified

The four scripts are byte-for-byte copies of the originals.

| File | Source |
| --- | --- |
| `used_colors_panel.jsx` | `Create_Swatch_Panel.jsx` |
| `find_double_cutcontour.jsx` | `Find_Double_CutContour.jsx` (draft v1.2) |
| `auto_measure_pro.jsx` | `AutoMeasurePro_v4.jsx` (v4.0-beta1-buildfix47) |
| `isometric_build_view.jsx` | `Isometric_Build_View.jsx` |

### Notes

- Built as ExtendScript rather than a CEP or UXP plugin. UXP is not publicly
  available for Illustrator to third-party developers, and an unsigned CEP
  extension needs a `PlayerDebugMode` registry or plist edit on every
  workstation. The reasoning is in `README.md`.
- The launcher is a modal dialog rather than a floating palette, because a
  ScriptUI palette's handlers have no reliable document access and would need
  BridgeTalk dispatch for every tool.
- Re-running tools in one Illustrator session was verified against all four
  files rather than assumed. See `README.md`.
