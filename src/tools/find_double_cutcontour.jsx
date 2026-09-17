//@target illustrator
/*
    Find_Double_CutContour.jsx
    DRAFT v1.2 - UNTESTED IN ILLUSTRATOR. Run on a COPY of a file first.

    What it does:
      1. Finds every stroked path whose stroke is the spot color named CutContour.
      2. Finds places where two DIFFERENT CutContour paths are closer than TOLERANCE_PT
         for a continuous stretch of at least MIN_RUN_PT.
      3. Moves both paths of each flagged pair to a layer named "duplicate cutlines".
         (Moving to a layer does NOT stop a cutter from cutting them. The layer is for review.)
      4. Optional: moves stray points (paths with a single anchor point) to a layer
         named "stray points". The layer is only created if stray points are found.
      5. Optional: finds CutContour paths whose stroke is NOT aligned to center and moves
         them to a layer named "wrong stroke alignment".
         Illustrator scripting has no stroke alignment property, so this is worked out by
         comparing each path's bounds with and without stroke width. Run
         Stroke_Alignment_Diagnostic.jsx on test shapes first to confirm this works
         in your version of Illustrator.

    Not checked in this version:
      - A single path that doubles back over itself.
      - Clipping paths are checked, but are NOT moved (moving them would break the mask).
      - Guide objects are skipped.
*/

(function () {

    // ======================= SETTINGS =======================
    // All distances are in POINTS (72 points = 1 inch).
    var TOLERANCE_PT   = 2.25;             // 0.03125 in. Flag lines LESS THAN this distance apart
    var MIN_RUN_PT     = 18;               // 0.25 in. Lines must stay that close for AT LEAST this length
    var SPOT_NAME      = "CutContour";     // exact, case-sensitive
    var LAYER_NAME     = "duplicate cutlines";

    var MOVE_STRAY_POINTS = true;          // true = move stray points, false = leave them alone
    var STRAY_SCOPE       = "all";         // "all" = any stray point, "cutcontour" = only CutContour-stroked
    var STRAY_LAYER_NAME  = "stray points";

    var CHECK_STROKE_ALIGNMENT   = true;                     // true = check CutContour stroke alignment
    var ALIGN_LAYER_NAME         = "wrong stroke alignment";
    var MOVE_UNDETERMINED_ALIGN  = false;  // true = also move paths whose alignment could not be determined
    var ALIGN_MIN_STROKE_PT      = 0.05;   // strokes thinner than this cannot be checked reliably
    // ========================================================

    // ---------------------------------------------------------------
    // CORE START (pure geometry; no Illustrator objects used in here)
    // ---------------------------------------------------------------
    function createAnalyzer(TOL, MIN_RUN) {
        var FLAT_ERR  = TOL / 20;   // max error when turning curves into straight pieces
        var MAX_PIECE = TOL * 4;    // target max straight piece length
        var SAMPLE    = TOL / 2;    // spacing of test points in the fine pass

        var PX1 = [], PY1 = [], PX2 = [], PY2 = [];
        var PS = [], PL = [], PP = [];   // arc start, piece length, path index
        var pathInfo = [];               // {closed, length}
        var maxPieceLen = 0;

        function dist(ax, ay, bx, by) {
            var dx = bx - ax, dy = by - ay;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function ptSegDist(px, py, ax, ay, bx, by) {
            var vx = bx - ax, vy = by - ay;
            var wx = px - ax, wy = py - ay;
            var c2 = vx * vx + vy * vy;
            var t = c2 > 0 ? (wx * vx + wy * vy) / c2 : 0;
            if (t < 0) { t = 0; } else if (t > 1) { t = 1; }
            var qx = ax + t * vx - px, qy = ay + t * vy - py;
            return Math.sqrt(qx * qx + qy * qy);
        }

        function cross(ox, oy, ax, ay, bx, by) {
            return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
        }

        function segSegDist(i, j) {
            var ax = PX1[i], ay = PY1[i], bx = PX2[i], by = PY2[i];
            var cx = PX1[j], cy = PY1[j], dx = PX2[j], dy = PY2[j];
            var d1 = cross(cx, cy, dx, dy, ax, ay);
            var d2 = cross(cx, cy, dx, dy, bx, by);
            var d3 = cross(ax, ay, bx, by, cx, cy);
            var d4 = cross(ax, ay, bx, by, dx, dy);
            if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
                ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
                return 0; // segments cross
            }
            return Math.min(
                ptSegDist(ax, ay, cx, cy, dx, dy),
                ptSegDist(bx, by, cx, cy, dx, dy),
                ptSegDist(cx, cy, ax, ay, bx, by),
                ptSegDist(dx, dy, ax, ay, bx, by)
            );
        }

        // One Bezier segment: anchor p0, out-handle p1, in-handle p2, anchor p3.
        function addSegment(p0, p1, p2, p3, pathIndex, s) {
            var x0 = p0[0], y0 = p0[1], x1 = p1[0], y1 = p1[1];
            var x2 = p2[0], y2 = p2[1], x3 = p3[0], y3 = p3[1];
            var ax = x0 - 2 * x1 + x2, ay = y0 - 2 * y1 + y2;
            var bx = x1 - 2 * x2 + x3, by = y1 - 2 * y2 + y3;
            var M = Math.max(Math.sqrt(ax * ax + ay * ay), Math.sqrt(bx * bx + by * by));
            var nFlat = Math.ceil(Math.sqrt(0.75 * M / FLAT_ERR));
            var poly = dist(x0, y0, x1, y1) + dist(x1, y1, x2, y2) + dist(x2, y2, x3, y3);
            var nLen = Math.ceil(poly / MAX_PIECE);
            var count = Math.max(1, nFlat, nLen);
            var px = x0, py = y0;
            for (var t = 1; t <= count; t++) {
                var nx, ny;
                if (t === count) {
                    nx = x3; ny = y3;
                } else {
                    var u = t / count, v = 1 - u;
                    var b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
                    nx = b0 * x0 + b1 * x1 + b2 * x2 + b3 * x3;
                    ny = b0 * y0 + b1 * y1 + b2 * y2 + b3 * y3;
                }
                var len = dist(px, py, nx, ny);
                if (len > 0) {
                    PX1.push(px); PY1.push(py); PX2.push(nx); PY2.push(ny);
                    PS.push(s); PL.push(len); PP.push(pathIndex);
                    if (len > maxPieceLen) { maxPieceLen = len; }
                    s += len;
                }
                px = nx; py = ny;
            }
            return s;
        }

        // anchors, lefts, rights: arrays of [x, y]; closed: boolean
        function addPath(anchors, lefts, rights, closed) {
            var n = anchors.length;
            var idx = pathInfo.length;
            var s = 0;
            if (n >= 2) {
                var segCount = closed ? n : n - 1;
                for (var g = 0; g < segCount; g++) {
                    var g2 = (g + 1) % n;
                    s = addSegment(anchors[g], rights[g], lefts[g2], anchors[g2], idx, s);
                }
            }
            pathInfo.push({ closed: closed, length: s });
            return idx;
        }

        function longestRun(pos, info) {
            pos.sort(function (x, y) { return x - y; });
            var gap = SAMPLE * 1.5;
            var runs = [];
            var start = pos[0], prev = pos[0];
            for (var r = 1; r < pos.length; r++) {
                if (pos[r] - prev > gap) { runs.push([start, prev]); start = pos[r]; }
                prev = pos[r];
            }
            runs.push([start, prev]);
            var best = 0;
            for (var r2 = 0; r2 < runs.length; r2++) {
                var len = runs[r2][1] - runs[r2][0];
                if (len > best) { best = len; }
            }
            // A closed path's run can be split where the path starts and ends.
            if (info.closed && runs.length > 1) {
                var first = runs[0], last = runs[runs.length - 1];
                if (first[0] <= gap && info.length - last[1] <= gap) {
                    var wrap = (first[1] - first[0]) + (last[1] - last[0]) +
                               (info.length - last[1]) + first[0];
                    if (wrap > best) { best = wrap; }
                }
            }
            return best;
        }

        // Returns { flagged: {pathIndex: true}, pairs: number, pieces: number }
        function run() {
            var np = PX1.length;
            var result = { flagged: {}, pairs: 0, pieces: np };
            if (np === 0) { return result; }

            // Grid by piece midpoint. Cell size guarantees near pieces are in neighbor cells.
            var CELL = maxPieceLen + TOL;
            var grid = {}, CX = [], CY = [];
            var i, key;
            for (i = 0; i < np; i++) {
                var cx = Math.floor(((PX1[i] + PX2[i]) / 2) / CELL);
                var cy = Math.floor(((PY1[i] + PY2[i]) / 2) / CELL);
                CX.push(cx); CY.push(cy);
                key = cx + "," + cy;
                if (!grid[key]) { grid[key] = []; }
                grid[key].push(i);
            }

            // Coarse pass: pairs of pieces from different paths closer than TOL.
            var cand = {};
            for (var a = 0; a < np; a++) {
                for (var gx = -1; gx <= 1; gx++) {
                    for (var gy = -1; gy <= 1; gy++) {
                        var list = grid[(CX[a] + gx) + "," + (CY[a] + gy)];
                        if (!list) { continue; }
                        for (var m = 0; m < list.length; m++) {
                            var b = list[m];
                            if (b <= a || PP[a] === PP[b]) { continue; }
                            if (Math.min(PX1[a], PX2[a]) - Math.max(PX1[b], PX2[b]) >= TOL) { continue; }
                            if (Math.min(PX1[b], PX2[b]) - Math.max(PX1[a], PX2[a]) >= TOL) { continue; }
                            if (Math.min(PY1[a], PY2[a]) - Math.max(PY1[b], PY2[b]) >= TOL) { continue; }
                            if (Math.min(PY1[b], PY2[b]) - Math.max(PY1[a], PY2[a]) >= TOL) { continue; }
                            if (segSegDist(a, b) < TOL) {
                                var lo = PP[a] < PP[b] ? a : b;
                                var hi = (lo === a) ? b : a;
                                var other = PP[hi];
                                if (!cand[lo]) { cand[lo] = {}; }
                                if (!cand[lo][other]) { cand[lo][other] = []; }
                                cand[lo][other].push(hi);
                            }
                        }
                    }
                }
            }

            // Fine pass: test points along each candidate piece.
            var hits = {};
            for (var pa in cand) {
                if (!cand.hasOwnProperty(pa)) { continue; }
                var ia = parseInt(pa, 10);
                var byPath = cand[pa];
                var steps = Math.max(1, Math.ceil(PL[ia] / SAMPLE));
                for (var op in byPath) {
                    if (!byPath.hasOwnProperty(op)) { continue; }
                    var blist = byPath[op];
                    var hk = PP[ia] + "_" + op;
                    if (!hits[hk]) { hits[hk] = { lo: PP[ia], hi: parseInt(op, 10), pos: [] }; }
                    for (var st = 0; st <= steps; st++) {
                        var f = st / steps;
                        var sx = PX1[ia] + (PX2[ia] - PX1[ia]) * f;
                        var sy = PY1[ia] + (PY2[ia] - PY1[ia]) * f;
                        for (var q = 0; q < blist.length; q++) {
                            var jb = blist[q];
                            if (ptSegDist(sx, sy, PX1[jb], PY1[jb], PX2[jb], PY2[jb]) < TOL) {
                                hits[hk].pos.push(PS[ia] + PL[ia] * f);
                                break;
                            }
                        }
                    }
                }
            }

            // Keep only pairs that run together for at least MIN_RUN.
            for (var hk2 in hits) {
                if (!hits.hasOwnProperty(hk2)) { continue; }
                var h = hits[hk2];
                if (h.pos.length < 2) { continue; }
                if (longestRun(h.pos, pathInfo[h.lo]) >= MIN_RUN) {
                    result.flagged[h.lo] = true;
                    result.flagged[h.hi] = true;
                    result.pairs++;
                }
            }
            return result;
        }

        return { addPath: addPath, run: run };
    }
    // ---------------------------------------------------------------
    // CORE END
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // ALIGN CORE START (pure; bounds arrays in, classification out)
    // ---------------------------------------------------------------
    // geo = geometricBounds (excludes stroke), vis = visibleBounds (includes stroke),
    // w = stroke width. How far the stroke extends past the path on each side:
    //   inside  -> 0 on every side
    //   center  -> half the stroke width where the path's outer edge is a flat edge or curve
    //   outside -> the full stroke width where the path's outer edge is a flat edge or curve
    // Sharp corners (miter joins) and dashes can change these amounts, so a path that
    // matches none of the patterns is reported as "unknown".
    function classifyStrokeAlignment(geo, vis, w, minW) {
        if (!(w >= minW)) { return "unknown"; }
        var e = [
            Math.abs(geo[0] - vis[0]),
            Math.abs(vis[1] - geo[1]),
            Math.abs(vis[2] - geo[2]),
            Math.abs(geo[3] - vis[3])
        ];
        var tol = Math.max(0.01, 0.05 * w);
        var allZero = true, anyHalf = false, anyFull = false;
        for (var i = 0; i < 4; i++) {
            if (Math.abs(e[i]) > tol) { allZero = false; }
            if (Math.abs(e[i] - 0.5 * w) <= tol) { anyHalf = true; }
            if (Math.abs(e[i] - w) <= tol) { anyFull = true; }
        }
        if (allZero) { return "inside"; }
        if (anyHalf) { return "center"; }
        if (anyFull) { return "outside"; }
        return "unknown";
    }
    // ---------------------------------------------------------------
    // ALIGN CORE END
    // ---------------------------------------------------------------

    // ----------------------- Illustrator part -----------------------
    if (app.documents.length === 0) {
        alert("Open a document before running this script.");
        return;
    }
    if (STRAY_SCOPE !== "all" && STRAY_SCOPE !== "cutcontour") {
        alert("Setup error:\nSTRAY_SCOPE must be \"all\" or \"cutcontour\".");
        return;
    }

    var startTime = new Date().getTime();
    var doc = app.activeDocument;
    var analyzer = createAnalyzer(TOLERANCE_PT, MIN_RUN_PT);

    var items = [];             // CutContour PathItems, same order as analyzer path indexes
    var alignInfo = [];         // per item: "center" | "inside" | "outside" | "unknown" | "error"
    var strays = [];            // stray point PathItems
    var readErrors = 0;
    var all = doc.pathItems;    // includes paths inside groups and compound paths
    var total = all.length;

    for (var i = 0; i < total; i++) {
        var p = all[i];
        var isCut = false, isGuide = false, pointCount = 0;
        try {
            isGuide = p.guides;
            pointCount = p.pathPoints.length;
            if (!isGuide && p.stroked) {
                var sc = p.strokeColor;
                if (sc.typename === "SpotColor" && sc.spot.name === SPOT_NAME) {
                    isCut = true;
                }
            }
        } catch (e1) {
            readErrors++;
            continue;
        }
        if (isGuide) { continue; }

        // Stray point: a path with exactly one anchor point.
        if (pointCount === 1) {
            if (MOVE_STRAY_POINTS && (STRAY_SCOPE === "all" || isCut)) {
                strays.push(p);
            }
            continue;
        }
        if (!isCut) { continue; }

        try {
            var pts = p.pathPoints;
            var anchors = [], lefts = [], rights = [];
            for (var k = 0; k < pointCount; k++) {
                var pt = pts[k];
                anchors.push(pt.anchor);
                lefts.push(pt.leftDirection);
                rights.push(pt.rightDirection);
            }
            analyzer.addPath(anchors, lefts, rights, p.closed);
            items.push(p);
            if (CHECK_STROKE_ALIGNMENT) {
                try {
                    alignInfo.push(classifyStrokeAlignment(p.geometricBounds, p.visibleBounds,
                                                           p.strokeWidth, ALIGN_MIN_STROKE_PT));
                } catch (e5) {
                    alignInfo.push("error");
                }
            }
        } catch (e2) {
            readErrors++;
        }
    }

    var result = analyzer.run();

    // Find a top-level layer by name, or create it.
    function getOrCreateLayer(name) {
        for (var li = 0; li < doc.layers.length; li++) {
            if (doc.layers[li].name === name) { return doc.layers[li]; }
        }
        var newLayer = doc.layers.add();
        newLayer.name = name;
        return newLayer;
    }

    // Move items to a layer. The layer is only looked up or created if there is something to move.
    function moveToLayer(targetList, layerName) {
        var counts = { moved: 0, already: 0, errors: 0 };
        if (targetList.length === 0) { return counts; }
        var layer = getOrCreateLayer(layerName);
        for (var t = 0; t < targetList.length; t++) {
            try {
                var tg = targetList[t];
                if (tg.parent.typename === "Layer" && tg.parent.name === layerName) {
                    counts.already++;
                    continue;
                }
                tg.move(layer, ElementPlacement.PLACEATEND);
                counts.moved++;
            } catch (e4) {
                counts.errors++;
            }
        }
        return counts;
    }

    // Duplicate cutlines: collect items to move.
    var flaggedCount = 0, clipNotMoved = 0, prepErrors = 0;
    var targets = [];
    for (var fk in result.flagged) {
        if (!result.flagged.hasOwnProperty(fk)) { continue; }
        flaggedCount++;
        var it = items[parseInt(fk, 10)];
        try {
            if (it.clipping) { clipNotMoved++; continue; }
            if (it.parent.typename === "CompoundPathItem") {
                targets.push(it.parent);   // move the whole compound path
            } else {
                targets.push(it);
            }
        } catch (e3) {
            prepErrors++;
        }
    }
    var dupCounts = moveToLayer(targets, LAYER_NAME);

    // Stroke alignment: paths already flagged as duplicates stay on the duplicate layer.
    var alignCounts = { moved: 0, already: 0, errors: 0 };
    var nInside = 0, nOutside = 0, nUnknown = 0, nAlignAlsoDup = 0, nAlignClip = 0;
    if (CHECK_STROKE_ALIGNMENT) {
        var alignTargets = [];
        for (var ai = 0; ai < items.length; ai++) {
            var cls = alignInfo[ai];
            if (cls === "center") { continue; }
            if (cls === "inside") { nInside++; }
            else if (cls === "outside") { nOutside++; }
            else { nUnknown++; }
            var shouldMove = (cls === "inside" || cls === "outside" || MOVE_UNDETERMINED_ALIGN);
            if (!shouldMove) { continue; }
            if (result.flagged[ai]) { nAlignAlsoDup++; continue; }
            try {
                var ait = items[ai];
                if (ait.clipping) { nAlignClip++; continue; }
                alignTargets.push(ait.parent.typename === "CompoundPathItem" ? ait.parent : ait);
            } catch (e6) {
                alignCounts.errors++;
            }
        }
        var ac = moveToLayer(alignTargets, ALIGN_LAYER_NAME);
        alignCounts.moved = ac.moved; alignCounts.already = ac.already; alignCounts.errors += ac.errors;
    }

    // Stray points: moved individually (a stray point inside a compound path is moved by itself).
    var strayCounts = moveToLayer(strays, STRAY_LAYER_NAME);

    app.redraw();

    var secs = ((new Date().getTime() - startTime) / 1000).toFixed(1);
    var msg =
        "Double CutContour check (" + TOLERANCE_PT + " pt, run " + MIN_RUN_PT + " pt)\n\n" +
        "CutContour paths checked: " + items.length + "\n" +
        "Close pairs found: " + result.pairs + "\n" +
        "Paths flagged: " + flaggedCount + "\n" +
        "Items moved to \"" + LAYER_NAME + "\": " + dupCounts.moved + "\n" +
        "Already on that layer: " + dupCounts.already + "\n" +
        "Clipping paths flagged, not moved: " + clipNotMoved + "\n" +
        "Could not move (locked/hidden or error): " + (dupCounts.errors + prepErrors) + "\n\n";
    if (CHECK_STROKE_ALIGNMENT) {
        msg +=
            "Stroke alignment (CutContour paths):\n" +
            "  Inside: " + nInside + "   Outside: " + nOutside + "   Could not determine: " + nUnknown + "\n" +
            "  Moved to \"" + ALIGN_LAYER_NAME + "\": " + alignCounts.moved + "\n" +
            "  Already on that layer: " + alignCounts.already + "\n" +
            "  Also duplicates (left on duplicate layer): " + nAlignAlsoDup + "\n" +
            "  Clipping paths, not moved: " + nAlignClip + "\n" +
            "  Could not move (locked/hidden or error): " + alignCounts.errors + "\n" +
            (MOVE_UNDETERMINED_ALIGN ? "" : "  (Undetermined paths were NOT moved)\n") + "\n";
    } else {
        msg += "Stroke alignment: not checked (CHECK_STROKE_ALIGNMENT is false)\n\n";
    }
    if (MOVE_STRAY_POINTS) {
        msg +=
            "Stray points found (" + STRAY_SCOPE + "): " + strays.length + "\n" +
            "Moved to \"" + STRAY_LAYER_NAME + "\": " + strayCounts.moved + "\n" +
            "Already on that layer: " + strayCounts.already + "\n" +
            "Could not move (locked/hidden or error): " + strayCounts.errors + "\n\n";
    } else {
        msg += "Stray points: not checked (MOVE_STRAY_POINTS is false)\n\n";
    }
    msg +=
        "Paths that could not be read: " + readErrors + "\n" +
        "Time: " + secs + " seconds";
    alert(msg);
})();
