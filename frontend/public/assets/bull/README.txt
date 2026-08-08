Drop the bull artwork here.

TRUE 360° (best):
  Export 24-36 renders of the bull, one every 10-15 degrees, named
  frame-01.png, frame-02.png, ... frame-36.png
  Then open src/components/dashboard/Bull360.jsx and set:
      const FRAMES = 36;         <- however many files you added
  Dragging then scrubs the frames, so the bull really turns all the way round.

SINGLE IMAGE (quick):
  Save one transparent PNG here as:  bull.png
  A flat image cannot rotate in 3D, so the podium and lighting spin under it
  and the bull banks with your drag. No code change needed.

NOTHING HERE:
  The built-in low-poly SVG bull is used instead. It is extruded across depth
  layers, so it does rotate in real 3D.
