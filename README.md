# Truss Lab

A 2D truss calculator for the engineering mechanics truss lab. Draw the truss (or type the joint coordinates), add supports and a load, and it shows which members are in tension or compression, the safety factors, and a cut list for machining the members out of metal stock.

Open `index.html` in a browser. No install or build step.

The switch in the top bar picks how much to show. **Simple** shows only what you need to machine the pieces: member lengths, tension or compression, and rough cut and finish lengths. **Detailed** adds safety factors, end tabs, weight, reactions, displacements and the drawn-to-scale cut list.

## What it does

- Draw joints and members on a grid, or enter exact coordinates.
- Solves with the direct stiffness method as you edit. Warns when the truss is a mechanism or needs supports.
- The four lab stocks, with the formulas from the E6 Lab 3 design sheet. Each member picks its stock automatically from tension or compression, or you choose one:

  | Stock | Rough cut | Finish | Weight (g) | Capacity (lbf) |
  |---|---|---|---|---|
  | 1/4 x 1 flat bar | c-c + 1.30 | c-c + 1.25 | 11.5 x finish | 3000 |
  | 1/8 x 1 flat bar | c-c + 1.30 | c-c + 1.25 | 5.75 x finish | 1500 |
  | 1 x 1 tube | c-c - 4.13 | c-c - 4.25 | 11.41 x finish + 122.6 | 3000 centered, 2140 - 6 x finish offset |
  | 3/4 x 3/4 tube | c-c - 3.63 | c-c - 3.75 | 7.64 x finish + 72 | 2200 centered, 1470 - 14 x finish offset |

- Member forces with T/C, stress, capacity and safety factor. The overall safety factor leaves out members at the (0, 0) bracket, as the lab sheet says.
- Total weight (pin hardware = (joints - 2) x 57.5 g) and the predicted lab score: 60 / (weight in lb x deflection) + 30 x safety factor.
- Checks the E6 lab design rules: supports at (0, 0) and (0, 12), no member between them, member lengths 2 to 15.3 in, at most 5 members and 3 compression members at a joint, at least 30° between members, nothing more than 1 in below the bottom support, load at (30, 18) as the highest point, no right angle at the load point.
- Cut list with every piece drawn to scale. Prints as a shop sheet with a box to tick off each piece.
- Save and open `.truss.json` files, CSV export, undo and redo.

All lab constants are editable under **Lab settings**.

## Files

- `solver.js`: the stiffness-method solver (no DOM, runs in Node too).
- `app.js`: the editor, results tables and cut list.
- `style.css`, `index.html`.
- `tests/solver.test.js`: solver checks against hand solutions. Run `node --test tests/solver.test.js`.

Based on [Truss Analysis](https://github.com/biligeyang/truss-analysis) by Bilige Yang, Swarthmore College (2016).
