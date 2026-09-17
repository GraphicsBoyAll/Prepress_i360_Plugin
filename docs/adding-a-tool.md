# Adding a tool to Prepress i360

## The quick way

Drop the `.jsx` into the `tools` folder. It appears in the launcher immediately,
marked **Ready (unlisted)**, and runs.

An unlisted tool gets no description and only the default preflight check (an
open document). That is fine for a script you wrote this morning; it is not fine
for something an operator will run on a live job without knowing what it
changes.

## The proper way

Add an entry to the `REGISTRY` array near the top of `src/Prepress i360.jsx`:

```js
{
    fileName:      "trim_marks_qc.jsx",
    name:          "Trim Marks QC",
    version:       "v1.0",
    needsDocument: true,
    needsSelection:false,
    summary:       "What the tool does, in plain language.",
    caution:       "Set this only if the operator should confirm before it runs. " +
                   "It is shown in a Yes/No prompt that defaults to No.",
    modifies:      "Exactly what it changes in the document.",
    limits:        "What it does not or cannot do."
},
```

| Field | Required | Purpose |
| --- | --- | --- |
| `fileName` | yes | File in the `tools` folder. Case-sensitive on macOS. |
| `name` | yes | Label in the list. |
| `summary` | yes | Shown in the description pane. |
| `needsDocument` | yes | `true` blocks the run when no document is open. |
| `needsSelection` | yes | `true` blocks the run when nothing is selected. |
| `version` | no | Shown under the name. |
| `caution` | no | If set, a confirmation prompt appears, defaulting to **No**. |
| `modifies` | no | What it changes. Write this one; the operator relies on it. |
| `limits` | no | What it will not catch or cannot do. |

Order in `REGISTRY` is the order in the list. Put the tools used most often, or
the ones that run earliest in the workflow, at the top.

## Write the tool as a self-executing function

```js
(function () {
    // everything goes in here
})();
```

This is what the existing tools do, and it is what keeps them safe to run more
than once. It matters because of how Illustrator runs scripts.

### Why it matters

Illustrator keeps **one ExtendScript engine alive for the whole application
session**, and its state is cumulative across every script that has already run.
Anything a tool leaves at global scope is still there the next time a tool runs.

Wrapping the body in a self-executing function means the tool leaves nothing
behind and starts clean every time.

### If you cannot wrap it

`auto_measure_pro.jsx` is not wrapped — it defines 1,013 global functions and
layers 61 override chains on top of them. It is still safe to re-run, and the
reason is worth understanding if you add something similar:

```js
function AMP_drawLabel(...) { ... }                 // real declaration
// ... thousands of lines later ...
var AMP_drawLabel_BASE = AMP_drawLabel;             // capture
AMP_drawLabel = function (...) { ... AMP_drawLabel_BASE(...) ... };   // override
```

Function declarations are hoisted: every `function NAME(...)` in the file is
created and assigned **before any statement in that file runs**. So on the
second run, `AMP_drawLabel` is reset to its pristine declaration first, and then
the override chain is rebuilt from scratch. The result is identical to the first
run.

That only holds because **every** overridden name has a real declaration behind
it. If a name is only ever created by assignment, the second run captures the
already-overridden version and wraps it again — the chain grows on every run.

### Check a tool for this

```sh
cd src/tools

# names reassigned at top level
grep -oE '^([A-Za-z_$][A-Za-z0-9_$]*) = function' your_tool.jsx \
  | sed 's/ = function//' | sort -u > /tmp/patched.txt

# names with a real top-level function declaration
grep -oE '^function ([A-Za-z_$][A-Za-z0-9_$]*)' your_tool.jsx \
  | sed 's/^function //' | sort -u > /tmp/declared.txt

# anything printed here will double-wrap on a second run
comm -23 /tmp/patched.txt /tmp/declared.txt

# implicit globals: assignment at top level with no var
grep -nE '^[A-Za-z_$][A-Za-z0-9_$]* *=' your_tool.jsx | grep -v '= function'

# top-level vars that are not part of an override chain
grep -oE '^var ([A-Za-z_$][A-Za-z0-9_$]*)' your_tool.jsx \
  | sed 's/^var //' | grep -v '_BASE_' | sort -u
```

All four commands printing nothing means the tool is safe to re-run. Anything
printed is state that survives into the next run, and needs either a wrapper or
a reason why it is harmless.

## If your tool looks up its own file path

In palette mode the launcher hands your tool to Illustrator inside a
`BridgeTalk` message. `$.fileName` is documented as unavailable inside a
BridgeTalk message, which is why the launcher resolves the tools folder in the
panel and passes each tool's absolute path into the message rather than looking
it up on the far side.

Your tool is then loaded with `$.evalFile()`, one level down from that. Whether
`$.fileName` reports your tool's own path at that point has **not** been
verified here, and it is not worth guessing about. So:

- A tool that never asks where it lives is unaffected. All four shipped tools
  are in this category.
- A tool that uses `$.fileName` to find a sidecar file, a preset or an icon
  needs testing in palette mode specifically, not just dialog mode. If it comes
  back empty, either hard-code the location, ask the operator once and remember
  the answer, or add the path to the tool's registry entry and have the launcher
  pass it in.

## Syntax check before committing

ExtendScript is close enough to ES3 that Node will catch syntax errors. Strip
the preprocessor directives first, since they are not valid JavaScript:

```sh
sed 's/^#target .*$//; s/^#targetengine .*$//' src/tools/your_tool.jsx > /tmp/chk.js
node --check /tmp/chk.js
```

This catches typos. It does **not** check Illustrator API use — only Illustrator
can do that.

## Things ExtendScript does not have

ExtendScript is an ES3-era engine. Avoid:

- `let`, `const`, arrow functions, template literals, `class`
- trailing commas in array and object literals
- `JSON.parse` / `JSON.stringify`
- `Array.prototype.indexOf`, `map`, `filter`, `forEach`
- `String.prototype.trim`

Write plain ES3 and loop with `for (var i = 0; ...)`.

## Before you ship it

- [ ] Runs from the launcher with a document open
- [ ] Runs twice in a row in the same Illustrator session, same result both times
- [ ] Blocks cleanly with no document open, and with nothing selected if it needs a selection
- [ ] `modifies` names every layer, swatch and object it creates, moves or deletes
- [ ] If it changes artwork destructively, `caution` is set
- [ ] Tested on a copy of a real job file, not just a test shape

## Sources

- [Top 2 ExtendScript Mistakes and How to Avoid Them](https://hyperbrew.co/blog/top-2-extendscript-mistakes-and-how-to-avoid-them/) — Hyper Brew: Illustrator's persistent, cumulative ExtendScript engine and global leakage
- [Adobe Illustrator Scripting Guide](https://ai-scripting.docsforadobe.dev/) — the Illustrator scripting object model
