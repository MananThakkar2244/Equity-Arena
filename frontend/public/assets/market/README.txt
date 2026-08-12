Optional artwork for the market-state hero.

The bull and bear are generated in code (a wireframe particle mesh), so this
folder can stay empty and the hero still works.

TO USE ARTWORK INSTEAD:
  Save two files here, exactly these names:

    bull.png     bull facing RIGHT  (it stands on the left, charging inward)
    bear.png     bear facing LEFT   (it stands on the right, charging inward)

  Each side is probed independently at mount. Whichever file is present is used;
  whichever is missing keeps the generated mesh. No code change either way, and
  a missing file costs nothing — nothing is imported, so the build never breaks.

REQUIREMENTS:
  - PNG with a TRANSPARENT background. The hero panel is near-black; a white or
    boxed background will show as an obvious rectangle.
  - Roughly 3:2 (landscape). Each animal is fitted into a 100 x 64 box with its
    aspect preserved, so anything close works — very tall art will letterbox.
  - Put the head near the INNER edge (bull's head at the right of its image,
    bear's head at the left of its). The collision beam is anchored to fixed
    muzzle points between them, so a head sitting at the outer edge leaves the
    beam starting in mid-air.
  - Around 900-1400px wide is plenty. These render at roughly 300-400 CSS px.
    Keep both files under ~400 KB; this sits on a live trading dashboard.

WHAT STILL RUNS OVER THE ARTWORK:
  The colliding particle beam, the flare and sparks where the two meet, the
  coloured glow behind each animal, a slow float, and the dimming of whichever
  side is losing. Those are drawn in code and do not come from the images.

LICENSING:
  Whatever you drop here ships with your app. Use art you generated, bought, or
  that is licensed for the purpose.
