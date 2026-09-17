#targetengine "main"

/*
 * Prepress i360 - startup loader
 * ============================================================================
 * Adobe Illustrator ExtendScript (.jsx)
 *
 * Put this ONE file in Illustrator's "Startup Scripts" folder and the Prepress
 * i360 panel opens by itself every time Illustrator starts. No File > Scripts,
 * no clicking anything.
 *
 * It is a loader only. The launcher and the tools stay wherever you installed
 * them; this file just points at them.
 *
 * ----------------------------------------------------------------------------
 * Setting it up
 * ----------------------------------------------------------------------------
 * 1. Edit PREPRESS_I360_HOME below to the folder that holds
 *    "Prepress i360.jsx" and the "tools" folder.
 *
 *    Use forward slashes on both platforms. Backslashes have to be escaped in
 *    JavaScript and are an easy thing to get wrong:
 *
 *        Windows   "C:/Prepress i360"
 *        macOS     "/Users/Shared/Prepress i360"
 *        Network   "//server/share/Prepress i360"
 *
 * 2. Copy this file into Illustrator's "Startup Scripts" folder, creating that
 *    folder if it is not already there. See INSTALL.md for the paths.
 *
 * 3. Restart Illustrator.
 *
 * ----------------------------------------------------------------------------
 * Why this file is so defensive
 * ----------------------------------------------------------------------------
 * It runs while Illustrator is starting, so a fault here would greet whoever
 * opens Illustrator instead of their artwork. Two rules follow from that:
 *
 *   - It never shows an alert and never throws. A wrong path, a missing folder
 *     or a moved launcher makes it do nothing at all. Illustrator starts
 *     normally and the panel is simply absent, which is a far better failure
 *     than a dialog blocking launch on every machine in the shop.
 *
 *   - Startup scripts are documented to run when Illustrator launches AND when
 *     a script is chosen from the Scripts menu, and there are reports of panels
 *     stacking up because of it. PREPRESS_I360_AUTOSTART tells the launcher it
 *     was loaded from here, so it leaves an already-open panel alone instead of
 *     opening a second one.
 *
 * If the panel does not appear, run "Prepress i360.jsx" from File > Scripts
 * once. That path does report errors, so it will tell you what is wrong.
 */

/* ============================================================================
 * EDIT THIS LINE
 * ========================================================================= */

var PREPRESS_I360_HOME = "C:/Prepress i360";

/* ========================================================================= */

(function () {
    try {
        var home = new Folder(PREPRESS_I360_HOME);
        if (!home.exists) { return; }

        var launcher = new File(home.fsName + "/Prepress i360.jsx");
        if (!launcher.exists) { return; }

        /* The launcher reads both of these. HOME matters because $.fileName is
         * not dependable when a script is loaded from the Startup Scripts
         * folder, so the launcher is told where it lives rather than having to
         * work it out. */
        $.global.PREPRESS_I360_HOME      = home.fsName;
        $.global.PREPRESS_I360_AUTOSTART = true;

        $.evalFile(launcher);

    } catch (e) {
        /* Deliberately silent. Nothing here may interrupt Illustrator's
         * launch. */
    } finally {
        try { $.global.PREPRESS_I360_AUTOSTART = false; } catch (e2) {}
    }
})();
