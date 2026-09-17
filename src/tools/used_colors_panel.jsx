/*
USED COLORS PANEL
Illustrator ExtendScript (.jsx)

What this script does:
- Scans visible, unlocked artwork in the active Illustrator document.
- Collects used fill and stroke colors.
- Adds missing used colors to the Swatches panel.
- Creates a new layer named "USED COLORS".
- Builds a horizontal used-color panel 0.25" below the active artboard.
- Uses 1" x 1" swatches with 0.5" spacing.
- Displays:
    Color Name
    CMYK values
    RGB values
    HEX value
    LAB value
- Does NOT delete unused swatches.
- Does NOT access files, internet, shell commands, or external resources.

Limitations:
- Placed raster images and linked artwork cannot be color sampled accurately.
- Complex Appearance panel fills, gradients, patterns, meshes, and some effects may not be fully detected.
*/

(function () {
    if (app.documents.length === 0) {
        alert("No Illustrator document is open.");
        return;
    }

    var doc = app.activeDocument;

    var PT_PER_IN = 72;
    var SWATCH_SIZE = 72;       // 1"
    var SWATCH_GAP = 36;        // 0.5"
    var PANEL_OFFSET = 18;      // 0.25" below artboard
    var TEXT_GAP = 8;
    var LINE_SPACING = 13;
    var TITLE_SIZE = 18;
    var BODY_SIZE = 8.5;
    var BLOCK_WIDTH = 128;      // wider than swatch to allow one-line values
    var ROW_HEIGHT = 160;       // enough for swatch + 5 lines of text
    var MARGIN_LEFT = 0;

    var used = {};
    var usedList = [];

    function round2(n) {
        return Math.round(n * 100) / 100;
    }

    function padHex(n) {
        var s = n.toString(16).toUpperCase();
        return s.length === 1 ? "0" + s : s;
    }

    function rgbToHex(r, g, b) {
        return "#" + padHex(r) + padHex(g) + padHex(b);
    }

    function clamp255(n) {
        n = Math.round(n);
        if (n < 0) return 0;
        if (n > 255) return 255;
        return n;
    }

    function cmykToRgb(c, m, y, k) {
        c = c / 100;
        m = m / 100;
        y = y / 100;
        k = k / 100;
        return {
            r: clamp255(255 * (1 - c) * (1 - k)),
            g: clamp255(255 * (1 - m) * (1 - k)),
            b: clamp255(255 * (1 - y) * (1 - k))
        };
    }

    function grayToRgb(g) {
        var v = clamp255(255 * (1 - (g / 100)));
        return { r: v, g: v, b: v };
    }

    function rgbToCmyk(r, g, b) {
        r = r / 255;
        g = g / 255;
        b = b / 255;

        var k = 1 - Math.max(r, g, b);
        if (k >= 1) {
            return { c: 0, m: 0, y: 0, k: 100 };
        }

        var c = (1 - r - k) / (1 - k);
        var m = (1 - g - k) / (1 - k);
        var y = (1 - b - k) / (1 - k);

        return {
            c: round2(c * 100),
            m: round2(m * 100),
            y: round2(y * 100),
            k: round2(k * 100)
        };
    }

    function rgbToLab(r, g, b) {
        var rr = r / 255;
        var gg = g / 255;
        var bb = b / 255;

        rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
        gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
        bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

        var x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
        var y = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) / 1.00000;
        var z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;

        x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
        y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
        z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);

        return {
            l: round2((116 * y) - 16),
            a: round2(500 * (x - y)),
            b: round2(200 * (y - z))
        };
    }

    function labToRgbApprox(l, a, b) {
        // Approximate LAB to RGB conversion for preview swatches only.
        var y = (l + 16) / 116;
        var x = a / 500 + y;
        var z = y - b / 200;

        function pivotInv(t) {
            var t3 = t * t * t;
            return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
        }

        x = 0.95047 * pivotInv(x);
        y = 1.00000 * pivotInv(y);
        z = 1.08883 * pivotInv(z);

        var r = x * 3.2406 + y * -1.5372 + z * -0.4986;
        var g = x * -0.9689 + y * 1.8758 + z * 0.0415;
        var bl = x * 0.0557 + y * -0.2040 + z * 1.0570;

        function comp(v) {
            v = v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v;
            return clamp255(v * 255);
        }

        return { r: comp(r), g: comp(g), b: comp(bl) };
    }

    function duplicateColor(color) {
        var newColor;
        if (color.typename === "CMYKColor") {
            newColor = new CMYKColor();
            newColor.cyan = color.cyan;
            newColor.magenta = color.magenta;
            newColor.yellow = color.yellow;
            newColor.black = color.black;
            return newColor;
        }
        if (color.typename === "RGBColor") {
            newColor = new RGBColor();
            newColor.red = color.red;
            newColor.green = color.green;
            newColor.blue = color.blue;
            return newColor;
        }
        if (color.typename === "GrayColor") {
            newColor = new GrayColor();
            newColor.gray = color.gray;
            return newColor;
        }
        if (color.typename === "LabColor") {
            newColor = new LabColor();
            newColor.l = color.l;
            newColor.a = color.a;
            newColor.b = color.b;
            return newColor;
        }
        if (color.typename === "SpotColor") {
            newColor = new SpotColor();
            newColor.spot = color.spot;
            newColor.tint = color.tint;
            return newColor;
        }
        return null;
    }

    function colorToRgb(color) {
        if (!color || color.typename === "NoColor") {
            return null;
        }

        if (color.typename === "RGBColor") {
            return {
                r: clamp255(color.red),
                g: clamp255(color.green),
                b: clamp255(color.blue)
            };
        }

        if (color.typename === "CMYKColor") {
            return cmykToRgb(color.cyan, color.magenta, color.yellow, color.black);
        }

        if (color.typename === "GrayColor") {
            return grayToRgb(color.gray);
        }

        if (color.typename === "LabColor") {
            return labToRgbApprox(color.l, color.a, color.b);
        }

        if (color.typename === "SpotColor") {
            var base = color.spot.color;
            var rgb = colorToRgb(base);
            if (!rgb) return null;

            // Approximate tint by mixing with white.
            var tint = color.tint / 100;
            return {
                r: clamp255(255 - ((255 - rgb.r) * tint)),
                g: clamp255(255 - ((255 - rgb.g) * tint)),
                b: clamp255(255 - ((255 - rgb.b) * tint))
            };
        }

        return null;
    }

    function colorName(color) {
        if (!color) return "Unknown";

        if (color.typename === "SpotColor") {
            var spotName = color.spot.name;
            if (Math.round(color.tint) !== 100) {
                return spotName + " " + round2(color.tint) + "%";
            }
            return spotName;
        }

        if (color.typename === "CMYKColor") {
            return "CMYK " + round2(color.cyan) + "," + round2(color.magenta) + "," + round2(color.yellow) + "," + round2(color.black);
        }

        if (color.typename === "RGBColor") {
            return "RGB " + Math.round(color.red) + "," + Math.round(color.green) + "," + Math.round(color.blue);
        }

        if (color.typename === "GrayColor") {
            return "Gray " + round2(color.gray) + "%";
        }

        if (color.typename === "LabColor") {
            return "LAB " + round2(color.l) + "," + round2(color.a) + "," + round2(color.b);
        }

        return color.typename;
    }

    function colorKey(color) {
        if (!color || color.typename === "NoColor") {
            return "";
        }

        if (color.typename === "SpotColor") {
            return "SPOT|" + color.spot.name + "|" + round2(color.tint);
        }

        if (color.typename === "CMYKColor") {
            return "CMYK|" + round2(color.cyan) + "|" + round2(color.magenta) + "|" + round2(color.yellow) + "|" + round2(color.black);
        }

        if (color.typename === "RGBColor") {
            return "RGB|" + Math.round(color.red) + "|" + Math.round(color.green) + "|" + Math.round(color.blue);
        }

        if (color.typename === "GrayColor") {
            return "GRAY|" + round2(color.gray);
        }

        if (color.typename === "LabColor") {
            return "LAB|" + round2(color.l) + "|" + round2(color.a) + "|" + round2(color.b);
        }

        return "";
    }

    function colorInfo(color) {
        var rgb = colorToRgb(color);
        if (!rgb) return null;

        var cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
        var lab = rgbToLab(rgb.r, rgb.g, rgb.b);

        if (color.typename === "CMYKColor") {
            cmyk = {
                c: round2(color.cyan),
                m: round2(color.magenta),
                y: round2(color.yellow),
                k: round2(color.black)
            };
        }

        if (color.typename === "SpotColor" && color.spot.color.typename === "CMYKColor") {
            var sc = color.spot.color;
            cmyk = {
                c: round2(sc.cyan),
                m: round2(sc.magenta),
                y: round2(sc.yellow),
                k: round2(sc.black)
            };
        }

        if (color.typename === "LabColor") {
            lab = {
                l: round2(color.l),
                a: round2(color.a),
                b: round2(color.b)
            };
        }

        return {
            name: colorName(color),
            key: colorKey(color),
            originalColor: duplicateColor(color),
            rgb: rgb,
            cmyk: cmyk,
            hex: rgbToHex(rgb.r, rgb.g, rgb.b),
            lab: lab,
            type: color.typename
        };
    }

    function addUsedColor(color) {
        if (!color || color.typename === "NoColor") return;

        // Gradients/patterns are intentionally skipped because their internal colors are not reliable through simple object color.
        if (color.typename === "GradientColor" || color.typename === "PatternColor") return;

        var key = colorKey(color);
        if (key === "" || used[key]) return;

        var info = colorInfo(color);
        if (!info) return;

        used[key] = true;
        usedList.push(info);
    }

    function isItemUsable(item) {
        if (!item) return false;
        if (item.locked || item.hidden) return false;

        var parent = item.parent;
        while (parent && parent.typename !== "Document") {
            if (parent.locked || parent.hidden || parent.visible === false) return false;
            parent = parent.parent;
        }
        return true;
    }

    function scanTextFrame(tf) {
        try {
            if (tf.textRange) {
                addUsedColor(tf.textRange.characterAttributes.fillColor);
                addUsedColor(tf.textRange.characterAttributes.strokeColor);
            }
        } catch (e) {}

        // Character-by-character scan helps detect mixed-color text.
        try {
            var chars = tf.characters;
            for (var i = 0; i < chars.length; i++) {
                try {
                    addUsedColor(chars[i].characterAttributes.fillColor);
                    addUsedColor(chars[i].characterAttributes.strokeColor);
                } catch (e2) {}
            }
        } catch (e3) {}
    }

    function scanItem(item) {
        if (!isItemUsable(item)) return;

        try {
            switch (item.typename) {
                case "PathItem":
                    if (item.filled) addUsedColor(item.fillColor);
                    if (item.stroked) addUsedColor(item.strokeColor);
                    break;

                case "CompoundPathItem":
                    for (var c = 0; c < item.pathItems.length; c++) {
                        scanItem(item.pathItems[c]);
                    }
                    break;

                case "GroupItem":
                    for (var g = 0; g < item.pageItems.length; g++) {
                        scanItem(item.pageItems[g]);
                    }
                    break;

                case "TextFrame":
                    scanTextFrame(item);
                    break;

                case "SymbolItem":
                    // Symbol internals are not reliably accessible without expanding.
                    break;

                default:
                    // Try generic fill/stroke where available.
                    try {
                        if (item.filled) addUsedColor(item.fillColor);
                    } catch (e1) {}
                    try {
                        if (item.stroked) addUsedColor(item.strokeColor);
                    } catch (e2) {}
                    break;
            }
        } catch (err) {}
    }

    function scanDocument() {
        for (var i = 0; i < doc.pageItems.length; i++) {
            scanItem(doc.pageItems[i]);
        }
    }

    function swatchExistsByName(name) {
        try {
            doc.swatches.getByName(name);
            return true;
        } catch (e) {
            return false;
        }
    }

    function addMissingSwatches() {
        for (var i = 0; i < usedList.length; i++) {
            var info = usedList[i];
            if (!info.originalColor) continue;

            // Spot colors already have a spot swatch by definition.
            if (info.originalColor.typename === "SpotColor") continue;

            var name = info.name;
            if (swatchExistsByName(name)) continue;

            try {
                var sw = doc.swatches.add();
                sw.name = name;
                sw.color = info.originalColor;
            } catch (e) {}
        }
    }

    function makeRGBColor(r, g, b) {
        var col = new RGBColor();
        col.red = r;
        col.green = g;
        col.blue = b;
        return col;
    }

    function makeBlack() {
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var c = new CMYKColor();
            c.cyan = 0;
            c.magenta = 0;
            c.yellow = 0;
            c.black = 100;
            return c;
        }
        return makeRGBColor(0, 0, 0);
    }

    function formatNum(n) {
        var v = round2(n);
        return String(v);
    }

    function addText(layer, contents, left, top, size, bold) {
        var tf = layer.textFrames.add();
        tf.contents = contents;
        tf.left = left;
        tf.top = top;
        tf.textRange.characterAttributes.size = size;
        tf.textRange.characterAttributes.fillColor = makeBlack();

        try {
            if (bold) {
                tf.textRange.characterAttributes.textFont = app.textFonts.getByName("Arial-BoldMT");
            } else {
                tf.textRange.characterAttributes.textFont = app.textFonts.getByName("ArialMT");
            }
        } catch (e) {}

        return tf;
    }

    function removeExistingPanelLayer() {
        try {
            var lyr = doc.layers.getByName("USED COLORS");
            lyr.locked = false;
            lyr.visible = true;
            lyr.remove();
        } catch (e) {}
    }

    function createPanel() {
        removeExistingPanelLayer();

        var layer = doc.layers.add();
        layer.name = "USED COLORS";

        var abIndex = doc.artboards.getActiveArtboardIndex();
        var rect = doc.artboards[abIndex].artboardRect;
        var abLeft = rect[0];
        var abTop = rect[1];
        var abRight = rect[2];
        var abBottom = rect[3];

        var startX = abLeft + MARGIN_LEFT;
        var titleTop = abBottom - PANEL_OFFSET;
        var firstRowTop = titleTop - 34;

        addText(layer, "USED COLORS", startX, titleTop, TITLE_SIZE, true);

        var availableWidth = abRight - abLeft;
        var stepX = BLOCK_WIDTH + SWATCH_GAP;
        var maxCols = Math.max(1, Math.floor((availableWidth + SWATCH_GAP) / stepX));

        for (var i = 0; i < usedList.length; i++) {
            var info = usedList[i];

            var col = i % maxCols;
            var row = Math.floor(i / maxCols);

            var x = startX + (col * stepX);
            var yTop = firstRowTop - (row * ROW_HEIGHT);

            var swatchRect = layer.pathItems.rectangle(yTop, x, SWATCH_SIZE, SWATCH_SIZE);

            if (info.originalColor && info.originalColor.typename !== "LabColor") {
                try {
                    swatchRect.fillColor = info.originalColor;
                } catch (e) {
                    swatchRect.fillColor = makeRGBColor(info.rgb.r, info.rgb.g, info.rgb.b);
                }
            } else {
                swatchRect.fillColor = makeRGBColor(info.rgb.r, info.rgb.g, info.rgb.b);
            }

            swatchRect.stroked = true;
            swatchRect.strokeColor = makeBlack();
            swatchRect.strokeWidth = 0.5;

            var textX = x;
            var textTop = yTop - SWATCH_SIZE - TEXT_GAP;

            addText(layer, info.name, textX, textTop, BODY_SIZE, true);
            addText(layer, "CMYK: " + formatNum(info.cmyk.c) + "," + formatNum(info.cmyk.m) + "," + formatNum(info.cmyk.y) + "," + formatNum(info.cmyk.k), textX, textTop - LINE_SPACING, BODY_SIZE, false);
            addText(layer, "RGB: " + info.rgb.r + "," + info.rgb.g + "," + info.rgb.b, textX, textTop - (LINE_SPACING * 2), BODY_SIZE, false);
            addText(layer, "HEX: " + info.hex, textX, textTop - (LINE_SPACING * 3), BODY_SIZE, false);
            addText(layer, "LAB: " + formatNum(info.lab.l) + "," + formatNum(info.lab.a) + "," + formatNum(info.lab.b), textX, textTop - (LINE_SPACING * 4), BODY_SIZE, false);
        }
    }

    function sortColors() {
        usedList.sort(function (a, b) {
            function rank(x) {
                if (x.type === "SpotColor") return 0;
                if (x.type === "CMYKColor") return 1;
                if (x.type === "RGBColor") return 2;
                if (x.type === "GrayColor") return 3;
                if (x.type === "LabColor") return 4;
                return 9;
            }
            var ra = rank(a);
            var rb = rank(b);
            if (ra !== rb) return ra - rb;
            var an = a.name.toLowerCase();
            var bn = b.name.toLowerCase();
            if (an < bn) return -1;
            if (an > bn) return 1;
            return 0;
        });
    }

    scanDocument();

    if (usedList.length === 0) {
        alert("No usable fill or stroke colors were found.");
        return;
    }

    sortColors();
    addMissingSwatches();
    createPanel();

    alert("USED COLORS panel created below the active artboard.\n\nColors found: " + usedList.length + "\nNo unused swatches were deleted.");
})();
