# Sagittarius A*'s accretion flow

The model of the hot gas falling into Sgr A* that Skyfold draws, and the independent reference the app's own ray
march is checked against. It shares no code with the TypeScript or the GLSL. Full description, sources and checks:
`docs/data/blackholes.md`, section 7.

| File | What it does | Needs |
| --- | --- | --- |
| `riaf_model.py` | The model (a radiatively inefficient accretion flow of the Broderick & Loeb 2006 type: thermal and power-law synchrotron with self-absorption) and the ray tracer that fitted it, for a camera far away | numpy, scipy |
| `fit_riaf.py` | Re-images the three fitted models (A, drawn; B at 60°; C, the pessimistic one) from their fitted parameters into `riaf_results.json`, with pictures | numpy, scipy |
| `riaf_results.json` | The fit's fluxes, surface brightnesses and ring sizes | — |
| `flow_camera.py` | The same model seen from a camera at a finite distance, hovering or falling as a raindrop, inside the horizon included: intensity at infinity along any look direction | numpy, scipy |
| `flow_tables.py` | Writes `src/sim/blackholes/sgraFlow.json` (the model, its axis, the flux against viewing angle, the scene's numbers) and the references in `ref/` | numpy, scipy |
| `ref/` | `far_i30_V.npy`, `far_i30_230.npy` (the fit's own pictures from far away at 30°); `near_*.npy` (cameras at 20, 6 and 2.02 M hovering, 1 M falling); `index.json` describes them | — |

Run from anywhere:

```
python scripts/sgra-flow/flow_tables.py                      # about 33 minutes on three processes
python scripts/sgra-flow/flow_tables.py --quick              # a coarse version in two minutes, for trying things out
python scripts/sgra-flow/flow_tables.py --angles-from-json   # keep the viewing-angle table, redo the rest
python scripts/sgra-flow/fit_riaf.py riaf_results.json       # from this folder: about 10 minutes
```

The output is deterministic. `npx vitest run src/render/flow src/sim/blackholes` then checks the app against it.
