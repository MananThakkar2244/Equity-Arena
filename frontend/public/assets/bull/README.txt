Optional: a sculpted bull model.

The bull is generated in code by src/components/Bull3D.jsx — real WebGL
geometry, no artwork required. Nothing needs to go in this folder for it to
work.

TO USE A SCULPTED MODEL INSTEAD:
  Save a glTF binary here as:  bull.glb

  Bull3D probes for that file on mount. If it is there, it is lazily loaded
  and swapped in over the generated mesh; if it is missing or unreadable, the
  generated bull stays. No code change either way.

  It is auto-scaled and stood on the podium, so authored units do not matter.
  Model it facing +X (nose toward positive X, spine along X) to match the
  lighting rig.

  Keep it under ~2 MB and bake materials into the file — this renders inside a
  live trading dashboard, so geometry and texture weight are a real budget.

PNG frames and flat SVG bulls are no longer used. The previous sprite-based
approach was removed along with Bull360.jsx and NeonBull.jsx.
