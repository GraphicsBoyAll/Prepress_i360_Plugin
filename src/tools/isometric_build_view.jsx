/*
 * Isometric Build View
 * ============================================================================
 * Adobe Illustrator ExtendScript (.jsx)
 *
 * Copies the current selection onto a new layer, shears every copy into the
 * isometric view used in Build_example.pdf, spreads the copies apart along the
 * horizontal axis, and draws an arrow between each adjacent pair to show which
 * element goes on top of which. The original artwork stays untouched on its
 * own layer.
 *
 * Run with File > Scripts > Other Script...  (Ctrl+F12 / Cmd+F12)
 *
 * Written against the documented Illustrator ExtendScript API (CS6 and later).
 * Values marked "sample" were measured out of Build_example.pdf; see
 * illustrator/README.md for the measurements and how they were taken.
 */

#target illustrator

(function () {

    var PT_PER_INCH = 72.0;

    /* ---------------------------------------------------------------------
     * Arrow proportions, measured from Build_example.pdf
     *
     *   element spacing            59.42 pt
     *   overall arrow length       43.84 pt   = 0.738 x spacing
     *   stroked line length        37.81 pt   = 0.862 x arrow length
     *   arrowhead length            8.547 pt  = 0.195 x arrow length
     *   arrowhead half width        4.756 pt  = 0.108 x arrow length
     *   stroke weight               1.0 pt
     * ------------------------------------------------------------------- */
    var ARROW_LEN_PER_SPACING = 0.738;
    var ARROW_LINE_FRACTION   = 0.862;
    var ARROW_STROKE_WEIGHT   = 1.0;

    /* Arrowhead outline lifted from the sample PDF, tip at (0,0) pointing +x,
     * quoted at its native 43.84 pt arrow length and scaled from there. */
    var HEAD_REF_ARROW_LEN = 43.84;
    var HEAD = {
        len:       8.547,   /* tip to back corners      */
        halfWidth: 4.756,   /* back corner offset in y  */
        notch:     6.827,   /* concave back of the head */
        c1:       [2.840, 1.054],   /* bezier handle at the tip          */
        c2:       [6.363, 2.852]    /* bezier handle at the back corners */
    };

    var DEFAULTS = {
        spacingIn:   0.125,
        angleDeg:    30,
        gapIn:       0.5,
        arrowLenIn:  0,          /* 0 = derive from spacing */
        frontOnLeft: true,
        drawArrows:  true,
        layerName:   "Build View"
    };

    /* =====================================================================
     * Entry point
     * ================================================================== */
    function main() {
        if (app.documents.length === 0) {
            alert("Open a document first.");
            return;
        }

        var doc = app.activeDocument;
        var elements = collectInStackingOrder(doc);

        if (elements.length === 0) {
            alert("Nothing usable is selected.\n\n" +
                  "Select the artwork you want to build. Each top-level " +
                  "selected object (path, text object or group) becomes one " +
                  "element of the build.");
            return;
        }

        /* The dialog hands back the build order the user confirmed, top of the
         * build first. */
        var opts = askOptions(elements);
        if (opts === null) { return; }
        elements = opts.order;

        var spacing  = opts.spacingIn * PT_PER_INCH;
        var gap      = opts.gapIn * PT_PER_INCH;
        var arrowLen = (opts.arrowLenIn > 0)
                     ? opts.arrowLenIn * PT_PER_INCH
                     : spacing * ARROW_LEN_PER_SPACING;

        var srcBounds = unionBounds(elements);
        var layer     = addLayer(doc, opts.layerName);

        /* Copy top of the build first, each one placed at the end, so the
         * copies come out stacked in the same order they were listed. */
        var copies = [];
        var i;
        for (i = 0; i < elements.length; i++) {
            copies.push(elements[i].duplicate(layer, ElementPlacement.PLACEATEND));
        }

        /* One shear applied to one group keeps every element's position
         * relative to the others, which is what the sample does: all element
         * centres stay on a single horizontal line. */
        var group = layer.groupItems.add();
        for (i = 0; i < copies.length; i++) {
            copies[i].move(group, ElementPlacement.PLACEATEND);
        }
        group.transform(isoMatrix(opts.angleDeg),
                        true, true, true, true, 100, Transformation.CENTER);

        /* Explode. copies[0] is the top of the build. */
        var dir = opts.frontOnLeft ? 1 : -1;
        for (i = 1; i < copies.length; i++) {
            copies[i].left = copies[i].left + (dir * i * spacing);
        }

        if (opts.drawArrows && copies.length > 1 && arrowLen > 0) {
            drawArrows(group, copies, arrowLen, dir, blackColor(doc));
        }

        /* Park the finished build clear of the original artwork, on the same
         * horizontal centreline. */
        var srcCenterY = (srcBounds.top + srcBounds.bottom) / 2;
        group.left = srcBounds.right + gap;
        group.top  = srcCenterY + (group.height / 2);

        doc.selection = [group];
        app.redraw();
    }

    /* =====================================================================
     * Selection and stacking order
     * ================================================================== */

    /* Walks the layer tree and returns the top-level selected objects in
     * stacking order, front first.
     *
     * The order is taken from the collections themselves: doc.layers[0] is the
     * topmost layer, and a layer's or group's pageItems[0] is its frontmost
     * child. Layer.pageItems and GroupItem.pageItems hold immediate children
     * only, unlike Document.pageItems, so recursing into unselected groups
     * visits every object exactly once.
     *
     * zOrderPosition is deliberately not used. It came back undiscriminating in
     * testing, which silently scrambled the build order; the dialog shows the
     * order that comes out of here so it can be checked before anything is
     * drawn.
     *
     * Known limit: a layer's own objects are listed before the contents of its
     * sublayers, because the two live in separate collections with nothing
     * reliable to interleave them by. Reorder in the dialog if that matters. */
    function collectInStackingOrder(doc) {
        var out = [];
        walkLayers(doc.layers, out);
        return out;
    }

    function walkLayers(layers, out) {
        for (var i = 0; i < layers.length; i++) {
            var lyr = layers[i];
            var skip = false;
            try { skip = (lyr.locked || !lyr.visible); } catch (e) { skip = false; }
            if (skip) { continue; }
            walkContainer(lyr, out);
            try { walkLayers(lyr.layers, out); } catch (e2) {}
        }
    }

    function walkContainer(container, out) {
        var items;
        try { items = container.pageItems; } catch (e) { return; }
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var sel = false;
            try { sel = (it.selected === true); } catch (e2) { sel = false; }
            if (sel) {
                out.push(it);                     /* never recurse into it:   */
            } else if (it.typename === "GroupItem") {   /* a selected group is */
                walkContainer(it, out);           /* one element, whole       */
            }
        }
    }

    /* =====================================================================
     * Geometry
     * ================================================================== */

    /* Orthographic projection of a vertical plane turned `angle` degrees away
     * from the viewer about the vertical axis:
     *
     *     [ cos(a)   0 ]      x' = cos(a) * x
     *     [ -sin(a)  1 ]      y' = -sin(a) * x + y
     *
     * Vertical edges stay vertical and keep their length; horizontal edges tilt
     * down to the right at exactly `angle`. At 30 degrees that is a horizontal
     * scale of 86.603% and a 30 degree shear, which is what the sample
     * measures: edges at 29.8-30.0 degrees and a width-to-height ratio of
     * 0.858 against cos(30) = 0.866.
     *
     * Illustrator's Matrix is the PostScript convention: mValueA = x scale,
     * mValueB = y skew, mValueC = x skew, mValueD = y scale. Script coordinates
     * put y increasing upward, so a negative mValueB tilts edges downward to
     * the right. */
    function isoMatrix(angleDeg) {
        var rad = angleDeg * Math.PI / 180.0;
        var m;
        try { m = app.getIdentityMatrix(); }
        catch (e) { m = app.getScaleMatrix(100, 100); }
        m.mValueA  =  Math.cos(rad);
        m.mValueB  = -Math.sin(rad);
        m.mValueC  =  0;
        m.mValueD  =  1;
        m.mValueTX =  0;
        m.mValueTY =  0;
        return m;
    }

    function unionBounds(items) {
        var b = null;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var l = it.left;
            var t = it.top;
            var r = l + it.width;
            var bo = t - it.height;
            if (b === null) {
                b = { left: l, top: t, right: r, bottom: bo };
            } else {
                if (l  < b.left)   { b.left = l; }
                if (t  > b.top)    { b.top = t; }
                if (r  > b.right)  { b.right = r; }
                if (bo < b.bottom) { b.bottom = bo; }
            }
        }
        return b;
    }

    function centerX(item) { return item.left + (item.width / 2); }

    /* =====================================================================
     * Arrows
     * ================================================================== */

    /* One arrow per adjacent pair, on the build's horizontal centreline,
     * centred between the two element centres, pointing from the element on
     * top toward the element it sits on. */
    function drawArrows(group, copies, arrowLen, dir, color) {
        var cy = group.top - (group.height / 2);
        for (var i = 0; i < copies.length - 1; i++) {
            var cx = (centerX(copies[i]) + centerX(copies[i + 1])) / 2;
            drawArrow(group, cx, cy, arrowLen, dir, color);
        }
    }

    function drawArrow(group, cx, cy, arrowLen, dir, color) {
        var startX = cx - (dir * arrowLen / 2);
        var tipX   = cx + (dir * arrowLen / 2);
        var lineEndX = startX + (dir * arrowLen * ARROW_LINE_FRACTION);

        var line = group.pathItems.add();
        line.setEntirePath([[startX, cy], [lineEndX, cy]]);
        line.filled = false;
        line.stroked = true;
        line.strokeWidth = ARROW_STROKE_WEIGHT;
        line.strokeColor = color;

        var k = arrowLen / HEAD_REF_ARROW_LEN;
        var head = group.pathItems.add();
        head.stroked = false;
        head.filled = true;
        head.fillColor = color;

        /* tip -> lower back corner -> notch -> upper back corner -> tip */
        addPoint(head,
            [tipX, cy],
            [tipX - (dir * HEAD.c1[0] * k), cy + (HEAD.c1[1] * k)],
            [tipX - (dir * HEAD.c1[0] * k), cy - (HEAD.c1[1] * k)]);
        addPoint(head,
            [tipX - (dir * HEAD.len * k), cy - (HEAD.halfWidth * k)],
            [tipX - (dir * HEAD.c2[0] * k), cy - (HEAD.c2[1] * k)],
            [tipX - (dir * HEAD.len * k), cy - (HEAD.halfWidth * k)]);
        addPoint(head,
            [tipX - (dir * HEAD.notch * k), cy], null, null);
        addPoint(head,
            [tipX - (dir * HEAD.len * k), cy + (HEAD.halfWidth * k)],
            [tipX - (dir * HEAD.len * k), cy + (HEAD.halfWidth * k)],
            [tipX - (dir * HEAD.c2[0] * k), cy + (HEAD.c2[1] * k)]);
        head.closed = true;
    }

    function addPoint(path, anchor, leftDir, rightDir) {
        var p = path.pathPoints.add();
        p.anchor = anchor;
        p.leftDirection  = leftDir  ? leftDir  : anchor;
        p.rightDirection = rightDir ? rightDir : anchor;
        p.pointType = PointType.CORNER;
        return p;
    }

    /* =====================================================================
     * Document helpers
     * ================================================================== */

    function blackColor(doc) {
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            var c = new CMYKColor();
            c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = 100;
            return c;
        }
        var r = new RGBColor();
        r.red = 0; r.green = 0; r.blue = 0;
        return r;
    }

    function addLayer(doc, name) {
        var layer = doc.layers.add();      /* added at the top of the stack */
        layer.name = uniqueLayerName(doc, name, layer);
        return layer;
    }

    function uniqueLayerName(doc, name, ignore) {
        var taken = {};
        for (var i = 0; i < doc.layers.length; i++) {
            var l = doc.layers[i];
            if (l === ignore) { continue; }
            taken[l.name] = true;
        }
        if (!taken[name]) { return name; }
        var n = 2;
        while (taken[name + " " + n]) { n++; }
        return name + " " + n;
    }

    /* =====================================================================
     * Describing an element in the order list
     * ================================================================== */

    function describe(item, index) {
        var bits = [];
        var name = "";
        try { name = trim(item.name); } catch (e) {}
        bits.push(name !== "" ? name : friendlyType(item));

        var col = fillDescription(item);
        if (col !== "") { bits.push(col); }

        try {
            bits.push(inches(item.width) + " x " + inches(item.height) + " in");
        } catch (e2) {}

        return (index + 1) + ".  " + bits.join("   -   ");
    }

    function friendlyType(item) {
        switch (item.typename) {
            case "PathItem":         return "Path";
            case "CompoundPathItem": return "Compound path";
            case "GroupItem":        return "Group";
            case "TextFrame":        return "Text";
            case "RasterItem":       return "Image";
            case "PlacedItem":       return "Linked image";
            case "SymbolItem":       return "Symbol";
            case "MeshItem":         return "Mesh";
            case "PluginItem":       return "Live object";
            default:                 return item.typename;
        }
    }

    /* Colour of the first path found inside the element, so a red square reads
     * as red in the list rather than as "PathItem". */
    function fillDescription(item) {
        var p = firstPath(item, 0);
        if (p === null) { return ""; }
        try {
            if (p.filled !== true) { return "no fill"; }
            return colorName(p.fillColor);
        } catch (e) { return ""; }
    }

    function firstPath(item, depth) {
        if (depth > 6) { return null; }
        var t = item.typename;
        if (t === "PathItem") { return item; }
        try {
            if (t === "CompoundPathItem") {
                return (item.pathItems.length > 0) ? item.pathItems[0] : null;
            }
            if (t === "GroupItem") {
                for (var i = 0; i < item.pageItems.length; i++) {
                    var r = firstPath(item.pageItems[i], depth + 1);
                    if (r !== null) { return r; }
                }
            }
        } catch (e) {}
        return null;
    }

    function colorName(c) {
        try {
            switch (c.typename) {
                case "CMYKColor":
                    return "C" + rnd(c.cyan) + " M" + rnd(c.magenta) +
                           " Y" + rnd(c.yellow) + " K" + rnd(c.black);
                case "RGBColor":
                    return "R" + rnd(c.red) + " G" + rnd(c.green) +
                           " B" + rnd(c.blue);
                case "GrayColor":    return "Gray " + rnd(c.gray);
                case "SpotColor":    return c.spot.name;
                case "GradientColor":return "gradient";
                case "PatternColor": return "pattern";
                case "NoColor":      return "no fill";
                default:             return "";
            }
        } catch (e) { return ""; }
    }

    function rnd(v) { return Math.round(v); }

    function inches(pt) {
        var v = pt / PT_PER_INCH;
        return String(Math.round(v * 100) / 100);
    }

    /* =====================================================================
     * Dialog
     * ================================================================== */

    function askOptions(elements) {
        var d = DEFAULTS;
        var order = elements.slice(0);

        var w = new Window("dialog", "Isometric Build View");
        w.orientation = "column";
        w.alignChildren = "fill";
        w.margins = 16;
        w.spacing = 10;

        /* ---- build order ------------------------------------------------ */
        var pOrder = w.add("panel", undefined, "Build order");
        pOrder.orientation = "column";
        pOrder.alignChildren = "fill";
        pOrder.margins = 14;
        pOrder.spacing = 6;

        pOrder.add("statictext", undefined,
            "Top of the build first. Read from the artwork's stacking order; " +
            "fix it here if it is wrong.");

        var listRow = pOrder.add("group");
        listRow.orientation = "row";
        listRow.alignChildren = "fill";

        var lb = listRow.add("listbox", undefined, [], { multiselect: false });
        lb.preferredSize.width = 380;
        lb.preferredSize.height = Math.max(90, Math.min(200, order.length * 22 + 10));

        var btnCol = listRow.add("group");
        btnCol.orientation = "column";
        btnCol.alignChildren = "fill";
        var btnUp   = btnCol.add("button", undefined, "Move up");
        var btnDown = btnCol.add("button", undefined, "Move down");
        var btnRev  = btnCol.add("button", undefined, "Reverse");

        function refill(selectIndex) {
            lb.removeAll();
            for (var i = 0; i < order.length; i++) {
                lb.add("item", describe(order[i], i));
            }
            if (selectIndex !== null && selectIndex >= 0 &&
                selectIndex < order.length) {
                lb.selection = selectIndex;
            }
        }
        refill(0);

        function swap(i, j) {
            var t = order[i]; order[i] = order[j]; order[j] = t;
        }
        btnUp.onClick = function () {
            var s = lb.selection;
            if (!s || s.index <= 0) { return; }
            var i = s.index;
            swap(i, i - 1);
            refill(i - 1);
        };
        btnDown.onClick = function () {
            var s = lb.selection;
            if (!s || s.index >= order.length - 1) { return; }
            var i = s.index;
            swap(i, i + 1);
            refill(i + 1);
        };
        btnRev.onClick = function () {
            order.reverse();
            refill(0);
        };
        if (order.length < 2) {
            btnUp.enabled = btnDown.enabled = btnRev.enabled = false;
        }

        /* ---- layout ------------------------------------------------------ */
        var pLayout = w.add("panel", undefined, "Layout");
        pLayout.orientation = "column";
        pLayout.alignChildren = "left";
        pLayout.margins = 14;
        pLayout.spacing = 8;

        var fSpacing = labelledField(pLayout, "Spacing between elements (in):", d.spacingIn);
        var fAngle   = labelledField(pLayout, "Isometric angle (degrees):",      d.angleDeg);
        var fGap     = labelledField(pLayout, "Gap from original artwork (in):", d.gapIn);

        var rowDir = pLayout.add("group");
        rowDir.add("statictext", undefined, "Top element sits on the:");
        var rbLeft  = rowDir.add("radiobutton", undefined, "Left");
        var rbRight = rowDir.add("radiobutton", undefined, "Right");
        rbLeft.value  = d.frontOnLeft;
        rbRight.value = !d.frontOnLeft;

        /* ---- arrows ------------------------------------------------------ */
        var pArrows = w.add("panel", undefined, "Arrows");
        pArrows.orientation = "column";
        pArrows.alignChildren = "left";
        pArrows.margins = 14;
        pArrows.spacing = 8;

        var cbArrows = pArrows.add("checkbox", undefined,
            "Draw an arrow between each pair");
        cbArrows.value = d.drawArrows;
        var fArrowLen = labelledField(pArrows, "Arrow length (in, 0 = auto):", d.arrowLenIn);

        /* ---- destination -------------------------------------------------- */
        var pLayer = w.add("panel", undefined, "Destination");
        pLayer.orientation = "column";
        pLayer.alignChildren = "left";
        pLayer.margins = 14;
        var fLayer = labelledField(pLayer, "New layer name:", d.layerName, 160);

        var buttons = w.add("group");
        buttons.alignment = "right";
        var cancel = buttons.add("button", undefined, "Cancel", { name: "cancel" });
        var ok     = buttons.add("button", undefined, "Build",  { name: "ok" });

        var result = null;
        ok.onClick = function () {
            var spacingIn  = parseFloat(fSpacing.text);
            var angleDeg   = parseFloat(fAngle.text);
            var gapIn      = parseFloat(fGap.text);
            var arrowLenIn = parseFloat(fArrowLen.text);
            var layerName  = trim(fLayer.text);

            if (isNaN(spacingIn) || spacingIn < 0) {
                alert("Spacing must be a number of inches, 0 or greater."); return;
            }
            if (isNaN(angleDeg) || angleDeg <= 0 || angleDeg >= 90) {
                alert("Isometric angle must be between 0 and 90 degrees. " +
                      "The sample uses 30."); return;
            }
            if (isNaN(gapIn) || gapIn < 0) {
                alert("Gap must be a number of inches, 0 or greater."); return;
            }
            if (isNaN(arrowLenIn) || arrowLenIn < 0) {
                alert("Arrow length must be a number of inches, 0 or greater. " +
                      "Use 0 to size arrows from the spacing."); return;
            }
            if (layerName === "") { layerName = DEFAULTS.layerName; }

            result = {
                order:       order,
                spacingIn:   spacingIn,
                angleDeg:    angleDeg,
                gapIn:       gapIn,
                arrowLenIn:  arrowLenIn,
                frontOnLeft: rbLeft.value,
                drawArrows:  cbArrows.value,
                layerName:   layerName
            };
            w.close();
        };
        cancel.onClick = function () { result = null; w.close(); };

        w.show();
        return result;
    }

    function labelledField(parent, label, value, width) {
        var row = parent.add("group");
        row.orientation = "row";
        var st = row.add("statictext", undefined, label);
        st.preferredSize.width = 200;
        var field = row.add("edittext", undefined, String(value));
        field.characters = 8;
        if (width) { field.preferredSize.width = width; }
        return field;
    }

    function trim(s) {
        return String(s).replace(/^\s+/, "").replace(/\s+$/, "");
    }

    /* =====================================================================
     * Run
     * ================================================================== */
    try {
        main();
    } catch (err) {
        alert("Isometric Build View stopped:\n\n" + err +
              (err.line ? ("\n\nLine " + err.line) : ""));
    }

})();
