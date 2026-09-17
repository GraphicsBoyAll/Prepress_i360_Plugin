# Installing Prepress i360

Two ways in. Pick based on whether you have admin rights on the workstation.

Either way, keep `Prepress i360.jsx` and the `tools` folder **together in the
same folder**. The launcher finds its tools by looking next to itself.

```
Prepress i360.jsx          <- the launcher
tools/
    used_colors_panel.jsx
    find_double_cutcontour.jsx
    auto_measure_pro.jsx
    isometric_build_view.jsx
startup/
    Prepress i360 Startup.jsx   <- only for Option C; does not live here once installed
```

`startup/Prepress i360 Startup.jsx` is a separate loader used only by Option C
below. It is the one file that gets copied somewhere else.

---

## Option A — no admin rights (recommended for locked-down machines)

1. Copy the contents of `src/` anywhere the operator can read: a user folder, a
   shared drive, a network share.
2. In Illustrator: **File > Scripts > Other Script...** (`Ctrl+F12` on Windows,
   `Cmd+F12` on macOS).
3. Pick `Prepress i360.jsx`.

Nothing is installed and nothing is configured. A network share also means one
copy to update when a tool changes.

---

## Option B — in the Scripts menu

This puts **Prepress i360** directly in the **File > Scripts** menu. It needs
write access to the Illustrator application folder, which usually means admin
rights.

1. Quit Illustrator.
2. Copy the contents of `src/` into Illustrator's Scripts folder:

   **Windows**
   ```
   C:\Program Files\Adobe\Adobe Illustrator <version>\Presets\en_US\Scripts
   ```

   **macOS**
   ```
   /Applications/Adobe Illustrator <version>/Presets/<language>/Scripts
   ```

   Replace `<version>` with your Illustrator version and `en_US` /
   `<language>` with your interface language.

3. Start Illustrator. **Prepress i360** now appears under **File > Scripts**.

Scripts added while Illustrator is running do not appear in the menu until the
next launch, so the restart in step 1 is not optional.

---

## Option C — open by itself every time Illustrator starts

This is the closest thing to a real plugin. The panel is there when Illustrator
opens and nobody runs anything. It needs write access to the Illustrator
application folder, so admin rights.

Do Option A or B first, so the launcher and tools are installed somewhere.

1. Open `startup/Prepress i360 Startup.jsx` in a text editor and set one line to
   the folder holding `Prepress i360.jsx` and `tools`:

   ```js
   var PREPRESS_I360_HOME = "C:/Prepress i360";
   ```

   Use forward slashes on both platforms. Backslashes have to be escaped in
   JavaScript and are easy to get wrong.

   | | Example |
   | --- | --- |
   | Windows | `"C:/Prepress i360"` |
   | macOS | `"/Users/Shared/Prepress i360"` |
   | Network share | `"//server/share/Prepress i360"` |

2. Quit Illustrator.

3. Copy **only that one file** into Illustrator's `Startup Scripts` folder,
   creating the folder if it is not already there:

   **Windows**
   ```
   C:\Program Files\Adobe\Adobe Illustrator <version>\Startup Scripts\
   ```

   **macOS**
   ```
   /Applications/Adobe Illustrator <version>/Startup Scripts/
   ```

   On Windows there is also a shared location that applies across installs, if
   you prefer it:
   ```
   C:\Program Files\Common Files\Adobe\Startup Scripts CC\Illustrator\
   ```

4. Start Illustrator. The panel opens on its own.

The launcher itself stays where you put it in step 1. Only the loader goes in
`Startup Scripts`, so updating a tool never means touching the application
folder again.

### If it does not appear

The loader is deliberately silent. It runs while Illustrator is starting, so a
wrong path or a missing folder makes it do nothing rather than put a dialog in
front of whoever opens Illustrator. Nothing is broken; the panel is just absent.

To find out why, run `Prepress i360.jsx` from **File > Scripts** once. That path
does report errors and will tell you what is wrong — almost always
`PREPRESS_I360_HOME` pointing at the wrong folder.

### Closing and reopening it

Closing the panel closes it for that Illustrator session. To get it back without
restarting, run `Prepress i360.jsx` from **File > Scripts**. Option C and the
Scripts menu coexist; installing one does not rule out the other.

---

## Using it

The launcher opens as a **floating panel that does not lock Illustrator**. It
stays on screen while you work.

1. Open the artwork.
2. Run **Prepress i360**. The panel appears and stays open.
3. Pick a tool. The panel below the list tells you what it does, what it will
   change, and its limits.
4. Select artwork if the tool needs it. You can do this with the panel open.
5. Click **Run tool**, or double-click the tool in the list.
6. The tool runs. Pick the next one when it is done.
7. **Close** when you are finished.

If a tool needs something that is not there — no document open, nothing
selected — the panel says so and nothing runs. Fix it and click **Run tool**
again; there is no need to close the panel.

The **This session** box logs what was run and how it went. The **Status**
column shows the result of the last run of each tool.

### Illustrator pauses while a tool runs

This is expected. ExtendScript runs on Illustrator's main thread, so while a
tool is doing its work the whole application is busy, including the panel. Auto
Measure Pro is the largest tool and pauses Illustrator the longest. The panel
not locking Illustrator applies to the time it sits open, not to the seconds a
tool spends working.

### Switching to modal dialog mode

If the floating panel gives trouble on a particular machine, change one line at
the top of `Prepress i360.jsx`:

```js
var PREPRESS_I360_PANEL_MODE = "dialog";
```

That gives a modal dialog that locks Illustrator while open and reopens after
each run. It uses no BridgeTalk and no persistent engine, so there is less to go
wrong. Everything else behaves the same.

In dialog mode you cannot select artwork while the panel is open, so
**Isometric Build View** needs its selection made before you run the launcher.

---

## Troubleshooting

**The panel opens and closes again straight away**
The persistent engine did not take. Run the launcher from **File > Scripts**
rather than by double-clicking the `.jsx` in Explorer or Finder. If it still
closes, switch `PREPRESS_I360_PANEL_MODE` to `"dialog"`.

**Run tool does nothing, or reports a BridgeTalk error**
BridgeTalk could not reach Illustrator on that install. Switch
`PREPRESS_I360_PANEL_MODE` to `"dialog"`, which does not use BridgeTalk.

**A tool reports "needs an open document" when a document is open**
The panel asks Illustrator itself, so this means the message reached the wrong
place. Switch to `"dialog"` mode and report it.

**Illustrator freezes while a tool runs**
Expected, not a fault. See *Illustrator pauses while a tool runs* above.

**"Prepress i360 could not find its tools folder"**
The launcher was moved away from the `tools` folder. Either put them back
together, or click through the prompt and point at the `tools` folder manually.

**A tool shows "File missing" in the Status column**
The `.jsx` named in the registry is not in the `tools` folder. Check the file
name matches exactly, including case, on macOS.

**Prepress i360 does not appear under File > Scripts**
You installed with Option B but did not restart Illustrator, or the file went
into the wrong `Presets` language folder.

**Two panels appeared**
Startup scripts are documented to run at launch and again when a script is
chosen from the Scripts menu. The launcher guards against this by leaving an
already-open panel alone when it is auto-started. If you still see two, close
both and run `Prepress i360.jsx` from **File > Scripts** once; that closes any
open panel and builds exactly one.

**The auto-start panel did not open**
See *If it does not appear* under Option C. The loader fails silently on
purpose.

**I edited the registry and the panel still shows the old list**
Run the launcher again from **File > Scripts**. It closes the open panel and
builds a fresh one, so edits show up without restarting Illustrator.

**A tool stops with an error**
The launcher reports the message, the line number and the file. That line number
is inside the tool's own `.jsx`, which is where to look.

---

## Sources

- [Install and run scripts in Illustrator](https://helpx.adobe.com/illustrator/desktop/automate-visualize-data/automate-actions/install-and-run-scripts.html) — Adobe: the Scripts folder, and that scripts added while Illustrator is running do not appear until the next launch
- [How to Install Scripts in Adobe Illustrator](https://creativepro.com/how-to-install-scripts-in-adobe-illustrator/) — CreativePro: per-platform paths, the `Presets/<language>` layout, and the admin-access note
- [Executing Scripts — Adobe Illustrator Scripting Guide](https://ai-scripting.docsforadobe.dev/introduction/executingScripts/) — running a script from outside the Scripts folder
- [Run script on startup](https://community.adobe.com/t5/illustrator-discussions/run-script-on-startup/td-p/12138028) — Adobe Community: the `Startup Scripts` folder, and the shared `Common Files/Adobe/Startup Scripts CC/Illustrator` location on Windows
- [Create persistent palette via ScriptUI](https://community.adobe.com/t5/illustrator-discussions/create-persistent-palette-via-scriptui/td-p/10757849) — Adobe Community: `#targetengine` and palette persistence
