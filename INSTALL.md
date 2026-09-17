# Installing Prepress i360

Two ways in. Pick based on whether you have admin rights on the workstation.

Either way, keep `Prepress i360.jsx` and the `tools` folder **together in the
same folder**. The launcher finds its tools by looking next to itself.

```
Prepress i360.jsx
tools/
    used_colors_panel.jsx
    find_double_cutcontour.jsx
    auto_measure_pro.jsx
    isometric_build_view.jsx
```

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

## Using it

1. Open the artwork.
2. Run **Prepress i360**.
3. Pick a tool. The panel below the list tells you what it does, what it will
   change, and its limits.
4. Click **Run tool**, or double-click the tool in the list.
5. The tool runs. The list comes back so you can pick the next one.
6. **Close** when you are done.

**Isometric Build View** needs artwork selected before you run the launcher. The
others just need an open document. If something is missing, the launcher says so
and returns to the list without running anything.

The **This session** box at the bottom logs what was run and how it went.

---

## Troubleshooting

**"Prepress i360 could not find its tools folder"**
The launcher was moved away from the `tools` folder. Either put them back
together, or click through the prompt and point at the `tools` folder manually.

**A tool shows "File missing" in the Status column**
The `.jsx` named in the registry is not in the `tools` folder. Check the file
name matches exactly, including case, on macOS.

**Prepress i360 does not appear under File > Scripts**
You installed with Option B but did not restart Illustrator, or the file went
into the wrong `Presets` language folder.

**A tool stops with an error**
The launcher reports the message, the line number and the file. That line number
is inside the tool's own `.jsx`, which is where to look.

---

## Sources

- [Install and run scripts in Illustrator](https://helpx.adobe.com/illustrator/desktop/automate-visualize-data/automate-actions/install-and-run-scripts.html) — Adobe: the Scripts folder, and that scripts added while Illustrator is running do not appear until the next launch
- [How to Install Scripts in Adobe Illustrator](https://creativepro.com/how-to-install-scripts-in-adobe-illustrator/) — CreativePro: per-platform paths, the `Presets/<language>` layout, and the admin-access note
- [Executing Scripts — Adobe Illustrator Scripting Guide](https://ai-scripting.docsforadobe.dev/introduction/executingScripts/) — running a script from outside the Scripts folder
