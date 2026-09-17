#target illustrator

/*
 * Prepress i360
 * ============================================================================
 * Adobe Illustrator ExtendScript (.jsx)
 *
 * A launcher panel for the Allegra / Image360 prepress tool set. It shows the
 * available tools in one list, describes what each one does and what it will
 * change, checks that the document is in a fit state to run it, runs it, then
 * comes back to the list so the next tool can be picked.
 *
 * Install and run:  see INSTALL.md
 *
 * ----------------------------------------------------------------------------
 * How tools are run
 * ----------------------------------------------------------------------------
 * Each tool is an ordinary, unmodified .jsx file in the "tools" folder next to
 * this launcher. Every one of them is a self-executing function, so the
 * launcher runs it with $.evalFile() rather than calling into it.
 *
 * Illustrator keeps one ExtendScript engine alive for the whole application
 * session, and its state is cumulative across every script that has already
 * run. That makes re-running a script that defines globals a fair question. It
 * was checked against these four files rather than assumed:
 *
 *   - used_colors_panel, find_double_cutcontour and isometric_build_view each
 *     wrap their entire body in a self-executing function and define nothing
 *     at global scope. They are safe to run any number of times.
 *
 *   - auto_measure_pro defines 1013 global functions and layers 61 override
 *     chains of the form  var X_BASE = X;  X = function () { ... X_BASE ... };
 *     Every one of those 61 names also has a real "function NAME(...)"
 *     declaration in the same file. Function declarations are hoisted and
 *     assigned before any statement of the file runs, so each evaluation resets
 *     every name to its pristine version and then rebuilds the override chain
 *     from scratch. The file declares no other top-level vars, no implicit
 *     globals, and never touches $.global. It is therefore also safe to
 *     re-run.
 *
 * If a tool is added later that assigns to a global without "var", or builds an
 * override chain over a name that has no function declaration behind it, that
 * tool will accumulate state across runs. See docs/adding-a-tool.md.
 *
 * ----------------------------------------------------------------------------
 * Why a modal list and not a docked panel
 * ----------------------------------------------------------------------------
 * A ScriptUI "palette" window can float and dock, but code running in its event
 * handlers has no reliable access to the Illustrator document object model, so
 * every tool would have to be dispatched through BridgeTalk. A "dialog" window
 * runs in Illustrator's own context with full document access and no
 * indirection, so the launcher is a dialog that reopens after each run.
 */

(function () {

    var APP_NAME       = "Prepress i360";
    var APP_VERSION    = "1.0.0";
    var TOOLS_DIR_NAME = "tools";

    /* =====================================================================
     * Tool registry
     *
     * Everything the operator reads in the launcher comes from here. To add a
     * tool, drop its .jsx into the tools folder and add an entry. A .jsx in
     * that folder with no entry still appears in the list, just without a
     * description or a preflight check.
     *
     * fileName      file in the tools folder
     * name          label shown in the list
     * summary       what the tool does
     * modifies      what it changes in the document, stated plainly
     * limits        what it does not or cannot do
     * caution       if set, the operator must confirm before it runs
     * needsDocument true if an open document is required
     * needsSelection true if artwork must be selected first
     * ================================================================== */
    var REGISTRY = [
        {
            fileName:      "used_colors_panel.jsx",
            name:          "Used Colors Panel",
            needsDocument: true,
            needsSelection:false,
            summary:       "Scans visible, unlocked artwork for fill and stroke colours, adds any that are " +
                           "missing to the Swatches panel, then builds a labelled colour panel 0.25 in below " +
                           "the active artboard. Each 1 in swatch is labelled with its name, CMYK, RGB, HEX " +
                           "and LAB values.",
            modifies:      "Adds the used colours to the Swatches panel. Creates a layer named USED COLORS, " +
                           "replacing any existing layer of that name.",
            limits:        "Placed raster images and linked artwork cannot be colour sampled. Gradients, " +
                           "patterns, meshes, symbol contents and some Appearance panel fills are skipped. " +
                           "No unused swatches are deleted."
        },
        {
            fileName:      "find_double_cutcontour.jsx",
            name:          "Find Double CutContour",
            version:       "Draft v1.2",
            needsDocument: true,
            needsSelection:false,
            summary:       "Finds places where two different paths stroked with the CutContour spot colour " +
                           "run closer than 2.25 pt to each other for a continuous stretch of at least 18 pt, " +
                           "and moves both onto a layer named \"duplicate cutlines\" for review. It also " +
                           "collects stray single-anchor points, and CutContour paths whose stroke is not " +
                           "centre aligned.",
            caution:       "The script's own header marks it DRAFT v1.2, untested in Illustrator, and says to " +
                           "run it on a copy of the file first. It moves artwork between layers, which changes " +
                           "the document.",
            modifies:      "Moves paths onto the layers \"duplicate cutlines\", \"wrong stroke alignment\" and " +
                           "\"stray points\". Those layers are created only if there is something to put on " +
                           "them. Clipping paths are flagged but never moved, because moving one would break " +
                           "the mask.",
            limits:        "A single path that doubles back over itself is not detected. Guide objects are " +
                           "skipped. Illustrator scripting exposes no stroke alignment property, so alignment " +
                           "is inferred by comparing each path's bounds with and without stroke width. Moving " +
                           "a path to a layer does not stop a cutter cutting it; the layer is for review only."
        },
        {
            fileName:      "auto_measure_pro.jsx",
            name:          "Auto Measure Pro",
            version:       "v4.0-beta1-buildfix47",
            needsDocument: true,
            needsSelection:false,
            summary:       "Opens the Auto Measure Pro control center and draws measurement-only overlays for " +
                           "the proofing workflow: dimensions, gaps and rounded corner callouts. CutContour is " +
                           "used as the final boundary when it is present, otherwise the artboard boundary is " +
                           "used.",
            modifies:      "Writes to the layers named \"measurements\", \"gaps\" and \"debug\".",
            limits:        "Measurement data only. Proof layout, job data, notes, title blocks and proof sheet " +
                           "composition are produced by the InDesign Auto Proofer, not by this tool. This is a " +
                           "beta test candidate build."
        },
        {
            fileName:      "isometric_build_view.jsx",
            name:          "Isometric Build View",
            needsDocument: true,
            needsSelection:true,
            summary:       "Copies the current selection onto a new layer, shears every copy into an isometric " +
                           "view, spreads the copies apart along the horizontal axis, and draws an arrow " +
                           "between each adjacent pair to show which element goes on top of which. A dialog " +
                           "lets you confirm or reorder the build order before anything is drawn.",
            modifies:      "Adds a new layer, named \"Build View\" unless you change it in the tool's dialog. " +
                           "The original artwork is left untouched on its own layer.",
            limits:        "Each top-level selected object becomes one element of the build. A layer's own " +
                           "objects are listed before the contents of its sublayers, because the two live in " +
                           "separate collections; reorder them in the tool's dialog if that matters."
        }
    ];

    /* =====================================================================
     * Locating this script and the tools folder
     * ================================================================== */

    /* Returns the File this launcher was run from, or null.
     *
     * $.fileName is the documented way to ask, and is what works when the
     * script is run from the Scripts menu. The fallback reads the path off a
     * deliberately thrown error, which carries the file being executed, for the
     * cases where $.fileName comes back empty. */
    function thisScriptFile() {
        var f = null;
        try {
            if ($.fileName) { f = new File($.fileName); }
        } catch (e) {}
        if (f && f.exists) { return f; }

        try {
            PREPRESS_I360_UNDEFINED_ON_PURPOSE.toString();
        } catch (err) {
            try {
                if (err.fileName) { f = new File(err.fileName); }
            } catch (e2) {}
        }
        return (f && f.exists) ? f : null;
    }

    /* The tools folder sits next to this launcher. If it cannot be found the
     * operator is asked to point at it once, so a launcher that has been copied
     * somewhere else on its own still works. */
    function resolveToolsFolder() {
        var me = thisScriptFile();
        if (me !== null) {
            var beside = new Folder(me.parent.fsName + "/" + TOOLS_DIR_NAME);
            if (beside.exists) { return beside; }
        }

        var answer = confirm(
            APP_NAME + " could not find its \"" + TOOLS_DIR_NAME + "\" folder.\n\n" +
            "It is normally in the same folder as this launcher.\n\n" +
            "Point at it now?", false, APP_NAME);
        if (!answer) { return null; }

        var picked = Folder.selectDlg("Select the " + APP_NAME + " \"" + TOOLS_DIR_NAME + "\" folder");
        return (picked && picked.exists) ? picked : null;
    }

    /* =====================================================================
     * Building the tool list
     * ================================================================== */

    function lower(s) { return String(s).toLowerCase(); }

    function buildToolList(folder) {
        var list = [];
        var known = {};
        var i;

        for (i = 0; i < REGISTRY.length; i++) {
            var entry = REGISTRY[i];
            var tool  = {
                fileName:       entry.fileName,
                name:           entry.name,
                version:        entry.version ? entry.version : "",
                summary:        entry.summary,
                modifies:       entry.modifies ? entry.modifies : "",
                limits:         entry.limits ? entry.limits : "",
                caution:        entry.caution ? entry.caution : "",
                needsDocument:  entry.needsDocument === true,
                needsSelection: entry.needsSelection === true,
                registered:     true,
                file:           new File(folder.fsName + "/" + entry.fileName),
                status:         ""
            };
            tool.status = tool.file.exists ? "Ready" : "File missing";
            known[lower(entry.fileName)] = true;
            list.push(tool);
        }

        var extras = discoverExtras(folder, known);
        for (i = 0; i < extras.length; i++) { list.push(extras[i]); }

        return list;
    }

    /* Any .jsx or .js in the tools folder that the registry does not mention is
     * still offered, so a script can be added by dropping the file in. Nothing
     * is known about it, so it gets no preflight check beyond "a document is
     * probably needed". */
    function discoverExtras(folder, known) {
        var found = [];
        var masks = ["*.jsx", "*.js"];
        var m, i;

        for (m = 0; m < masks.length; m++) {
            var files;
            try { files = folder.getFiles(masks[m]); } catch (e) { files = []; }
            for (i = 0; i < files.length; i++) {
                var f = files[i];
                if (!(f instanceof File)) { continue; }
                if (known[lower(f.name)]) { continue; }
                known[lower(f.name)] = true;

                found.push({
                    fileName:       f.name,
                    name:           f.name.replace(/\.jsx?$/i, ""),
                    version:        "",
                    summary:        "This script is in the tools folder but is not listed in the launcher's " +
                                    "registry, so nothing is known about what it does or what it changes. " +
                                    "Add an entry to REGISTRY in the launcher to give it a description and a " +
                                    "preflight check.",
                    modifies:       "Unknown.",
                    limits:         "",
                    caution:        "",
                    needsDocument:  true,
                    needsSelection: false,
                    registered:     false,
                    file:           f,
                    status:         "Ready (unlisted)"
                });
            }
        }

        found.sort(function (a, b) {
            var an = lower(a.name), bn = lower(b.name);
            if (an < bn) { return -1; }
            if (an > bn) { return 1; }
            return 0;
        });
        return found;
    }

    /* =====================================================================
     * Preflight and running
     * ================================================================== */

    function needsText(tool) {
        if (tool.needsSelection) { return "Document + selection"; }
        if (tool.needsDocument)  { return "Document"; }
        return "Nothing";
    }

    /* Checked before a tool is run, so the operator gets one clear message
     * instead of whatever the tool itself would have alerted. */
    function preflight(tool) {
        if (!tool.file || !tool.file.exists) {
            return { ok: false, message:
                "The script file for " + tool.name + " is not in the tools folder.\n\n" +
                "Expected: " + tool.fileName };
        }

        if (tool.needsDocument && app.documents.length === 0) {
            return { ok: false, message:
                tool.name + " needs an open document.\n\nOpen the artwork, then run it again." };
        }

        if (tool.needsSelection) {
            var selection = null;
            try { selection = app.activeDocument.selection; } catch (e) { selection = null; }
            if (selection === null || selection.length === 0) {
                /* The launcher is a modal dialog, so the operator cannot select
                 * anything while it is open. Say what to actually do. */
                return { ok: false, message:
                    tool.name + " works on whatever is selected, and nothing is selected.\n\n" +
                    "Close " + APP_NAME + ", select the artwork, then run " + APP_NAME + " again." };
            }
        }

        return { ok: true, message: "" };
    }

    function describeError(err) {
        var parts = [];
        try { parts.push(err && err.message ? err.message : String(err)); }
        catch (e) { parts.push("Unknown error."); }
        try { if (err.line)     { parts.push("Line " + err.line); } } catch (e2) {}
        try { if (err.fileName) { parts.push(decodeURI(err.fileName)); } } catch (e3) {}
        return parts.join("\n");
    }

    function timeStamp() {
        var d = new Date();
        function pad(n) { return (n < 10 ? "0" : "") + n; }
        return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }

    /* Runs one tool and returns what happened. The launcher window is always
     * closed before this is called: a modal dialog cannot be open while the
     * tool puts up a dialog of its own. */
    function runTool(tool) {
        try {
            $.evalFile(tool.file);
            return { status: "ok", label: "Ran " + timeStamp(), message: "" };
        } catch (err) {
            return { status: "error", label: "Error", message: describeError(err) };
        }
    }

    /* =====================================================================
     * Text shown in the description pane
     * ================================================================== */

    function describeTool(tool) {
        var lines = [];

        lines.push(tool.name);
        if (tool.version !== "") { lines.push(tool.version); }
        lines.push("");
        lines.push(tool.summary);

        if (tool.caution !== "") {
            lines.push("");
            lines.push("CAUTION");
            lines.push(tool.caution);
        }
        if (tool.modifies !== "") {
            lines.push("");
            lines.push("What it changes");
            lines.push(tool.modifies);
        }
        if (tool.limits !== "") {
            lines.push("");
            lines.push("Known limits");
            lines.push(tool.limits);
        }

        lines.push("");
        lines.push("Needs: " + needsText(tool));
        lines.push("Script file: " + tool.fileName);

        return lines.join("\n");
    }

    /* =====================================================================
     * The launcher window
     *
     * Returns { action: "run", tool: <tool>, index: <n> }
     *      or { action: "close" }
     * ================================================================== */

    function showLauncher(tools, state) {
        var w = new Window("dialog", APP_NAME + "  " + APP_VERSION);
        w.orientation   = "column";
        w.alignChildren = "fill";
        w.margins       = 16;
        w.spacing       = 10;

        /* ---- tool list --------------------------------------------------- */
        var pTools = w.add("panel", undefined, "Tools");
        pTools.orientation   = "column";
        pTools.alignChildren = "fill";
        pTools.margins       = 14;

        var lb = pTools.add("listbox", undefined, [], {
            numberOfColumns: 3,
            showHeaders:     true,
            columnTitles:    ["Tool", "Needs", "Status"],
            columnWidths:    [300, 140, 120]
        });
        lb.preferredSize.height = 170;

        var i;
        for (i = 0; i < tools.length; i++) {
            var t    = tools[i];
            var item = lb.add("item", t.name);
            item.subItems[0].text = needsText(t);
            item.subItems[1].text = t.status;
        }

        /* ---- description ------------------------------------------------- */
        var pAbout = w.add("panel", undefined, "About the selected tool");
        pAbout.orientation   = "column";
        pAbout.alignChildren = "fill";
        pAbout.margins       = 14;

        var about = pAbout.add("edittext", undefined, "", { multiline: true, readonly: true, scrolling: true });
        about.preferredSize.height = 190;

        /* ---- session log ------------------------------------------------- */
        var pLog = w.add("panel", undefined, "This session");
        pLog.orientation   = "column";
        pLog.alignChildren = "fill";
        pLog.margins       = 14;

        var log = pLog.add("edittext", undefined,
            state.log.length === 0 ? "Nothing run yet." : state.log.join("\n"),
            { multiline: true, readonly: true, scrolling: true });
        log.preferredSize.height = 80;

        /* ---- buttons ----------------------------------------------------- */
        var row = w.add("group");
        row.orientation = "row";
        row.alignChildren = "center";

        var btnFolder = row.add("button", undefined, "Open tools folder");

        var spacer = row.add("group");
        spacer.alignment = ["fill", "center"];

        var btnClose = row.add("button", undefined, "Close", { name: "cancel" });
        var btnRun   = row.add("button", undefined, "Run tool", { name: "ok" });

        /* ---- behaviour --------------------------------------------------- */
        var result = { action: "close" };

        function refreshAbout() {
            var sel = lb.selection;
            if (sel === null) {
                about.text  = "Select a tool from the list above.";
                btnRun.enabled = false;
                return;
            }
            var tool = tools[sel.index];
            about.text = describeTool(tool);
            btnRun.enabled = tool.file.exists;
        }

        function chooseRun() {
            var sel = lb.selection;
            if (sel === null) { return; }
            result = { action: "run", tool: tools[sel.index], index: sel.index };
            w.close();
        }

        lb.onChange      = refreshAbout;
        lb.onDoubleClick = chooseRun;
        btnRun.onClick   = chooseRun;
        btnClose.onClick = function () { result = { action: "close" }; w.close(); };

        btnFolder.onClick = function () {
            try { state.folder.execute(); }
            catch (e) { alert("Could not open the tools folder.\n\n" + state.folder.fsName, APP_NAME); }
        };

        if (tools.length > 0) {
            var start = state.selectedIndex;
            if (start < 0 || start >= tools.length) { start = 0; }
            lb.selection = start;
        }
        refreshAbout();

        w.show();
        return result;
    }

    /* =====================================================================
     * Main
     * ================================================================== */

    function main() {
        var folder = resolveToolsFolder();
        if (folder === null) {
            alert(APP_NAME + " cannot run without its tools folder.\n\n" +
                  "Reinstall the folder so that \"" + TOOLS_DIR_NAME + "\" sits next to the launcher, " +
                  "then run it again.", APP_NAME);
            return;
        }

        var tools = buildToolList(folder);
        if (tools.length === 0) {
            alert("No scripts were found in the tools folder.\n\n" + folder.fsName, APP_NAME);
            return;
        }

        var state = { selectedIndex: 0, log: [], folder: folder };

        /* The list reopens after every run, so the operator can work straight
         * down it without going back to the Scripts menu each time. */
        while (true) {
            var choice = showLauncher(tools, state);
            if (choice.action !== "run") { break; }

            state.selectedIndex = choice.index;
            var tool = choice.tool;

            var check = preflight(tool);
            if (!check.ok) {
                alert(check.message, APP_NAME);
                state.log.push(tool.name + " - not run: requirements not met");
                continue;
            }

            if (tool.caution !== "") {
                var go = confirm(tool.name + "\n\n" + tool.caution + "\n\nRun it now?", true, APP_NAME);
                if (!go) {
                    state.log.push(tool.name + " - cancelled at the confirmation");
                    continue;
                }
            }

            var outcome = runTool(tool);
            tool.status = outcome.label;

            if (outcome.status === "error") {
                state.log.push(tool.name + " - ERROR: " + outcome.message.split("\n")[0]);
                alert(tool.name + " stopped with an error.\n\n" + outcome.message, APP_NAME);
            } else {
                state.log.push(tool.name + " - finished " + timeStamp());
            }
        }
    }

    try {
        main();
    } catch (err) {
        alert(APP_NAME + " stopped:\n\n" + describeError(err), APP_NAME);
    }

})();
