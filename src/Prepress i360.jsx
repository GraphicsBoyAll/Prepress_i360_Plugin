#targetengine "main"

/*
 * Prepress i360
 * ============================================================================
 * Adobe Illustrator ExtendScript (.jsx)
 *
 * A launcher panel for the Allegra / Image360 prepress tool set. It shows the
 * available tools in one list, describes what each one does and what it will
 * change, checks the document is in a fit state to run it, runs it, and reports
 * what happened.
 *
 * Install and run:  see INSTALL.md
 *
 * ----------------------------------------------------------------------------
 * Two panel modes
 * ----------------------------------------------------------------------------
 * PANEL_MODE below picks how the launcher behaves.
 *
 *   "palette"  Default. A floating panel that does NOT lock Illustrator. It
 *              stays open while you work: select artwork, zoom, edit, then
 *              click Run tool. Tools are dispatched through BridgeTalk.
 *
 *   "dialog"   A modal dialog that locks Illustrator while it is open and
 *              reopens after each run. Fewer moving parts. Keep it as the
 *              fallback if the palette misbehaves on a particular install.
 *
 * ----------------------------------------------------------------------------
 * What "does not lock Illustrator" does and does not mean
 * ----------------------------------------------------------------------------
 * The palette does not block Illustrator while it sits open. That is the part
 * that was blocking normal work, and it is fixed.
 *
 * It does NOT mean Illustrator stays responsive while a tool is actually
 * running. ExtendScript executes on Illustrator's main thread, and has no
 * threading and no asynchronous execution. While a tool is doing its work,
 * Illustrator is busy, and the panel is frozen along with it. BridgeTalk
 * changes which context the code runs in, not whether it blocks. Auto Measure
 * Pro is 24,662 lines and will visibly pause the application while it runs.
 * Nothing in ExtendScript, CEP or UXP changes that.
 *
 * ----------------------------------------------------------------------------
 * Why BridgeTalk, and why #targetengine main
 * ----------------------------------------------------------------------------
 * A ScriptUI "palette" window floats instead of blocking, but code running in
 * its event handlers does not get a correct Illustrator object model. The
 * documented way round it is to hand the work to Illustrator itself with a
 * BridgeTalk message, which is what runTool does in palette mode.
 *
 * #targetengine main puts the script in a persistent, named engine so the
 * palette survives after the script that created it has finished. Without it
 * the panel closes the moment the script ends.
 *
 * Two consequences of BridgeTalk that shape the code below:
 *
 *   1. $.fileName is not available inside a BridgeTalk message. The tools
 *      folder is therefore resolved here, in the panel, and each tool's
 *      absolute path is baked into the message as a string literal.
 *
 *   2. The panel cannot see the document, so the preflight checks (is a
 *      document open, is anything selected) have to run inside the message,
 *      in Illustrator's context. The answer comes back through onResult.
 *
 * #include is deliberately not used anywhere: a palette created in an included
 * file closes itself on call.
 *
 * ----------------------------------------------------------------------------
 * Re-running tools in one Illustrator session
 * ----------------------------------------------------------------------------
 * Illustrator keeps one ExtendScript engine alive for the whole application
 * session and its state is cumulative, so re-running a script that defines
 * globals is a fair question. It was checked against these four files:
 *
 *   - used_colors_panel, find_double_cutcontour and isometric_build_view each
 *     wrap their entire body in a self-executing function and define nothing at
 *     global scope. Safe to run any number of times.
 *
 *   - auto_measure_pro defines 1013 global functions and layers 61 override
 *     chains of the form  var X_BASE = X;  X = function () { ... X_BASE ... };
 *     Every one of those 61 names also has a real "function NAME(...)"
 *     declaration in the same file. Function declarations are hoisted and
 *     assigned before any statement of the file runs, so each evaluation resets
 *     every name to its pristine version and rebuilds the override chain from
 *     scratch. It declares no other top-level vars, no implicit globals, and
 *     never touches $.global. Safe to re-run.
 *
 * See docs/adding-a-tool.md before adding a tool that is not wrapped.
 */

/* ============================================================================
 * SETTINGS
 * ========================================================================= */

/* "palette" = floating, does not lock Illustrator.
 * "dialog"  = modal, locks Illustrator, reopens after each run. */
var PREPRESS_I360_PANEL_MODE = "palette";

/* ========================================================================= */

(function () {

    var APP_NAME       = "Prepress i360";
    var APP_VERSION    = "1.1.0";
    var TOOLS_DIR_NAME = "tools";

    /* =====================================================================
     * Tool registry
     *
     * Everything the operator reads in the launcher comes from here. To add a
     * tool, drop its .jsx into the tools folder and add an entry. A .jsx in
     * that folder with no entry still appears in the list, just without a
     * description or a preflight check.
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
                           "beta test candidate build. It is the largest tool here and will pause Illustrator " +
                           "noticeably while it runs."
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
     *
     * This runs in the panel's own context, where $.fileName is available.
     * It must NOT be called from inside a BridgeTalk message.
     * ================================================================== */

    function thisScriptFile() {
        var f = null;
        try {
            if ($.fileName) { f = new File($.fileName); }
        } catch (e) {}
        if (f && f.exists) { return f; }

        /* Fallback: a deliberately thrown error carries the path of the file
         * being executed. */
        try {
            PREPRESS_I360_UNDEFINED_ON_PURPOSE.toString();
        } catch (err) {
            try {
                if (err.fileName) { f = new File(err.fileName); }
            } catch (e2) {}
        }
        return (f && f.exists) ? f : null;
    }

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

    function needsText(tool) {
        if (tool.needsSelection) { return "Document + selection"; }
        if (tool.needsDocument)  { return "Document"; }
        return "Nothing";
    }

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

    function timeStamp() {
        var d = new Date();
        function pad(n) { return (n < 10 ? "0" : "") + n; }
        return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }

    function describeError(err) {
        var parts = [];
        try { parts.push(err && err.message ? err.message : String(err)); }
        catch (e) { parts.push("Unknown error."); }
        try { if (err.line)     { parts.push("Line " + err.line); } } catch (e2) {}
        try { if (err.fileName) { parts.push(decodeURI(err.fileName)); } } catch (e3) {}
        return parts.join("\n");
    }

    /* =====================================================================
     * The work itself
     *
     * PI360_remoteRun is the body of the BridgeTalk message. It is serialised
     * with Function.toString() and sent to Illustrator, so it must be entirely
     * self-contained: it cannot see anything outside itself. It also cannot use
     * $.fileName, which is why it takes the tool's path as an argument.
     *
     * It returns a string in the form  "<STATUS>|<message>", which comes back
     * on the other side as res.body.
     * ================================================================== */
    function PI360_remoteRun(fileURI, toolName, needsDocument, needsSelection) {
        try {
            var f = new File(fileURI);
            if (!f.exists) {
                return "BLOCKED|The script file is missing:\n" + fileURI;
            }

            if (needsDocument && app.documents.length === 0) {
                return "BLOCKED|" + toolName + " needs an open document.\n\n" +
                       "Open the artwork, then click Run tool again.";
            }

            if (needsSelection) {
                var sel = null;
                try { sel = app.activeDocument.selection; } catch (e) { sel = null; }
                if (sel === null || sel.length === 0) {
                    return "BLOCKED|" + toolName + " works on whatever is selected, and nothing " +
                           "is selected.\n\nSelect the artwork, then click Run tool again.";
                }
            }

            $.evalFile(f);
            return "OK|";

        } catch (err) {
            var msg;
            try { msg = (err && err.message) ? err.message : String(err); }
            catch (e2) { msg = "Unknown error."; }
            try { if (err.line)     { msg += "\nLine " + err.line; } } catch (e3) {}
            try { if (err.fileName) { msg += "\n" + decodeURI(err.fileName); } } catch (e4) {}
            return "ERROR|" + msg;
        }
    }

    /* Quotes a value as a JavaScript string literal for embedding in a
     * BridgeTalk message body. */
    function jsString(value) {
        var out = String(value);
        out = out.replace(/\\/g, "\\\\");
        out = out.replace(/'/g,  "\\'");
        out = out.replace(/\r/g, "\\r");
        out = out.replace(/\n/g, "\\n");
        return "'" + out + "'";
    }

    /* Splits "<STATUS>|<message>" into its parts. */
    function parseOutcome(body) {
        var text = String(body === null || body === undefined ? "" : body);
        var bar  = text.indexOf("|");
        if (bar < 0) { return { status: "OK", message: text }; }
        return { status: text.substring(0, bar), message: text.substring(bar + 1) };
    }

    /* =====================================================================
     * PALETTE MODE
     *
     * Floating panel. Does not lock Illustrator while it is open. Tools are
     * handed to Illustrator through BridgeTalk.
     * ================================================================== */

    function showPalette(tools, folder) {
        var w = new Window("palette", APP_NAME + "  " + APP_VERSION);
        w.orientation   = "column";
        w.alignChildren = "fill";
        w.margins       = 14;
        w.spacing       = 9;

        /* ---- tool list --------------------------------------------------- */
        var pTools = w.add("panel", undefined, "Tools");
        pTools.orientation   = "column";
        pTools.alignChildren = "fill";
        pTools.margins       = 12;

        var lb = pTools.add("listbox", undefined, [], {
            numberOfColumns: 3,
            showHeaders:     true,
            columnTitles:    ["Tool", "Needs", "Status"],
            columnWidths:    [280, 140, 120]
        });
        lb.preferredSize.height = 150;

        var i;
        for (i = 0; i < tools.length; i++) {
            var item = lb.add("item", tools[i].name);
            item.subItems[0].text = needsText(tools[i]);
            item.subItems[1].text = tools[i].status;
        }

        /* ---- description ------------------------------------------------- */
        var pAbout = w.add("panel", undefined, "About the selected tool");
        pAbout.orientation   = "column";
        pAbout.alignChildren = "fill";
        pAbout.margins       = 12;

        var about = pAbout.add("edittext", undefined, "",
            { multiline: true, readonly: true, scrolling: true });
        about.preferredSize.height = 170;

        /* ---- session log ------------------------------------------------- */
        var pLog = w.add("panel", undefined, "This session");
        pLog.orientation   = "column";
        pLog.alignChildren = "fill";
        pLog.margins       = 12;

        var log = pLog.add("edittext", undefined, "Nothing run yet.",
            { multiline: true, readonly: true, scrolling: true });
        log.preferredSize.height = 72;

        /* ---- buttons ----------------------------------------------------- */
        var row = w.add("group");
        row.orientation   = "row";
        row.alignChildren = "center";

        var btnFolder = row.add("button", undefined, "Open tools folder");

        var spacer = row.add("group");
        spacer.alignment = ["fill", "center"];

        var btnClose = row.add("button", undefined, "Close");
        var btnRun   = row.add("button", undefined, "Run tool");

        /* ---- state ------------------------------------------------------- */
        var logLines = [];
        var busy     = false;

        function addLog(line) {
            logLines.push(line);
            log.text = logLines.join("\n");
        }

        function setStatus(index, text) {
            tools[index].status = text;
            try { lb.items[index].subItems[1].text = text; } catch (e) {}
        }

        function refreshAbout() {
            var sel = lb.selection;
            if (sel === null) {
                about.text = "Select a tool from the list above.";
                btnRun.enabled = false;
                return;
            }
            about.text = describeTool(tools[sel.index]);
            btnRun.enabled = !busy && tools[sel.index].file.exists;
        }

        function setBusy(on) {
            busy = on;
            btnRun.enabled    = !on && lb.selection !== null;
            btnFolder.enabled = !on;
            btnClose.enabled  = !on;
        }

        /* ---- running ----------------------------------------------------- */

        function finish(index, outcome) {
            var tool = tools[index];

            if (outcome.status === "OK") {
                setStatus(index, "Ran " + timeStamp());
                addLog(tool.name + " - finished " + timeStamp());
            } else if (outcome.status === "BLOCKED") {
                setStatus(index, "Not run");
                addLog(tool.name + " - not run: requirements not met");
                alert(outcome.message, APP_NAME);
            } else {
                setStatus(index, "Error");
                addLog(tool.name + " - ERROR: " + outcome.message.split("\n")[0]);
                alert(tool.name + " stopped with an error.\n\n" + outcome.message, APP_NAME);
            }

            setBusy(false);
            refreshAbout();
        }

        function runTool() {
            var sel = lb.selection;
            if (sel === null || busy) { return; }

            var index = sel.index;
            var tool  = tools[index];

            if (!tool.file.exists) {
                alert("The script file for " + tool.name + " is not in the tools folder.\n\n" +
                      "Expected: " + tool.fileName, APP_NAME);
                return;
            }

            if (tool.caution !== "") {
                var go = confirm(tool.name + "\n\n" + tool.caution + "\n\nRun it now?", true, APP_NAME);
                if (!go) {
                    addLog(tool.name + " - cancelled at the confirmation");
                    return;
                }
            }

            setBusy(true);
            setStatus(index, "Running...");

            /* Force the repaint now. Once the tool starts, Illustrator is busy
             * and the panel will not redraw until it finishes. */
            try { w.update(); } catch (e) {}

            /* BridgeTalk is how a palette gets work done in Illustrator's own
             * context. If it is not there for any reason, run the tool straight
             * from here rather than failing: it may work, and if it does not
             * the error is reported the same way. */
            if (typeof BridgeTalk === "undefined") {
                var direct;
                try {
                    direct = parseOutcome(PI360_remoteRun(
                        tool.file.absoluteURI, tool.name,
                        tool.needsDocument, tool.needsSelection));
                } catch (e) {
                    direct = { status: "ERROR", message: describeError(e) };
                }
                finish(index, direct);
                return;
            }

            var bt = new BridgeTalk();
            bt.target = "illustrator";
            bt.body =
                "(" + PI360_remoteRun.toString() + ")(" +
                jsString(tool.file.absoluteURI) + ", " +
                jsString(tool.name) + ", " +
                (tool.needsDocument  ? "true" : "false") + ", " +
                (tool.needsSelection ? "true" : "false") + ");";

            bt.onResult = function (message) {
                finish(index, parseOutcome(message.body));
            };

            bt.onError = function (message) {
                var detail = "";
                try { detail = String(message.body); } catch (e) { detail = "No detail available."; }
                finish(index, { status: "ERROR", message: "BridgeTalk could not run the tool.\n\n" + detail });
            };

            try {
                bt.send();
            } catch (err) {
                finish(index, { status: "ERROR", message: describeError(err) });
            }
        }

        /* ---- wiring ------------------------------------------------------ */
        lb.onChange      = refreshAbout;
        lb.onDoubleClick = runTool;
        btnRun.onClick   = runTool;

        btnClose.onClick = function () { w.close(); };

        btnFolder.onClick = function () {
            try { folder.execute(); }
            catch (e) { alert("Could not open the tools folder.\n\n" + folder.fsName, APP_NAME); }
        };

        w.onClose = function () {
            try { $.global.PREPRESS_I360_PANEL = null; } catch (e) {}
            return true;
        };

        if (tools.length > 0) { lb.selection = 0; }
        refreshAbout();

        w.show();
        return w;
    }

    /* =====================================================================
     * DIALOG MODE
     *
     * Modal. Locks Illustrator while open, reopens after each run. Kept as the
     * fallback: no BridgeTalk, no persistent engine, fewer moving parts.
     * ================================================================== */

    function showDialog(tools, state) {
        var w = new Window("dialog", APP_NAME + "  " + APP_VERSION);
        w.orientation   = "column";
        w.alignChildren = "fill";
        w.margins       = 16;
        w.spacing       = 10;

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
            var item = lb.add("item", tools[i].name);
            item.subItems[0].text = needsText(tools[i]);
            item.subItems[1].text = tools[i].status;
        }

        var pAbout = w.add("panel", undefined, "About the selected tool");
        pAbout.orientation   = "column";
        pAbout.alignChildren = "fill";
        pAbout.margins       = 14;

        var about = pAbout.add("edittext", undefined, "",
            { multiline: true, readonly: true, scrolling: true });
        about.preferredSize.height = 190;

        var pLog = w.add("panel", undefined, "This session");
        pLog.orientation   = "column";
        pLog.alignChildren = "fill";
        pLog.margins       = 14;

        var log = pLog.add("edittext", undefined,
            state.log.length === 0 ? "Nothing run yet." : state.log.join("\n"),
            { multiline: true, readonly: true, scrolling: true });
        log.preferredSize.height = 80;

        var row = w.add("group");
        row.orientation   = "row";
        row.alignChildren = "center";

        var btnFolder = row.add("button", undefined, "Open tools folder");
        var spacer = row.add("group");
        spacer.alignment = ["fill", "center"];
        var btnClose = row.add("button", undefined, "Close",    { name: "cancel" });
        var btnRun   = row.add("button", undefined, "Run tool", { name: "ok" });

        var result = { action: "close" };

        function refreshAbout() {
            var sel = lb.selection;
            if (sel === null) {
                about.text = "Select a tool from the list above.";
                btnRun.enabled = false;
                return;
            }
            about.text = describeTool(tools[sel.index]);
            btnRun.enabled = tools[sel.index].file.exists;
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

    /* In dialog mode the panel is already modal and running in Illustrator's
     * context, so the tool is run directly. No BridgeTalk is involved. */
    function dialogLoop(tools, folder) {
        var state = { selectedIndex: 0, log: [], folder: folder };

        while (true) {
            var choice = showDialog(tools, state);
            if (choice.action !== "run") { break; }

            state.selectedIndex = choice.index;
            var tool = choice.tool;

            if (tool.caution !== "") {
                var go = confirm(tool.name + "\n\n" + tool.caution + "\n\nRun it now?", true, APP_NAME);
                if (!go) {
                    state.log.push(tool.name + " - cancelled at the confirmation");
                    continue;
                }
            }

            var outcome;
            try {
                outcome = parseOutcome(PI360_remoteRun(
                    tool.file.absoluteURI, tool.name,
                    tool.needsDocument, tool.needsSelection));
            } catch (err) {
                outcome = { status: "ERROR", message: describeError(err) };
            }

            if (outcome.status === "OK") {
                tool.status = "Ran " + timeStamp();
                state.log.push(tool.name + " - finished " + timeStamp());
            } else if (outcome.status === "BLOCKED") {
                tool.status = "Not run";
                state.log.push(tool.name + " - not run: requirements not met");
                alert(outcome.message, APP_NAME);
            } else {
                tool.status = "Error";
                state.log.push(tool.name + " - ERROR: " + outcome.message.split("\n")[0]);
                alert(tool.name + " stopped with an error.\n\n" + outcome.message, APP_NAME);
            }
        }
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

        if (PREPRESS_I360_PANEL_MODE === "dialog") {
            dialogLoop(tools, folder);
            return;
        }

        /* Palette mode. Running the launcher again closes the panel that is
         * already open and builds a fresh one, so an edit to the registry shows
         * up without restarting Illustrator. */
        try {
            if ($.global.PREPRESS_I360_PANEL) {
                $.global.PREPRESS_I360_PANEL.close();
            }
        } catch (e) {}

        $.global.PREPRESS_I360_PANEL = showPalette(tools, folder);
    }

    try {
        main();
    } catch (err) {
        alert(APP_NAME + " stopped:\n\n" + describeError(err), APP_NAME);
    }

})();
