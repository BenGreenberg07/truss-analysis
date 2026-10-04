# Truss Lab

A 2D truss calculator for the engineering mechanics truss lab. Draw the truss (or type the joint coordinates), add supports and a load, and it shows which members are in tension or compression, the safety factors, and a cut list for machining the members out of metal stock.

Open `index.html` in a browser. No install or build step.

## What it does

- Draw joints and members on a grid, or enter exact coordinates.
- Solves with the direct stiffness method as you edit. Warns when the truss is a mechanism or needs supports.
- Member forces with T/C, stress, capacity and safety factor. Members at the mounting bracket can be left out of the overall safety factor.
- Cut list: rough cut and finish length for every member, using the stock offsets from the lab (tension: +1.30 / +1.25 in, compression: -4.13 / -4.25 in). Each piece is drawn to scale on a rule. Prints as a shop sheet.
- Total weight, using mass per length and end fittings fitted to the team spreadsheet.
- Save and open `.truss.json` files, CSV export, undo and redo.

All lab constants are editable under **Lab settings**.

## Files

- `solver.js`: the stiffness-method solver (no DOM, runs in Node too).
- `app.js`: the editor, results tables and cut list.
- `style.css`, `index.html`.

Based on [Truss Analysis](https://github.com/biligeyang/truss-analysis) by Bilige Yang, Swarthmore College (2016).
