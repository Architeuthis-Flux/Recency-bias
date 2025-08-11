# Recency Bias


This is a VSCode plugin that colors your code based on when it was written. 

It goes through your git blame history and makes a gradient based on how far down it is, so you can quickly see what was written recently and what was from a while ago.


This is just a vibe coded thing I wanted while I was working on something else, it's not meant to be on all the time, but it puts a little button to toggle it from New -> Old -> Off so you can quickly check the relative time your code was committed. Kinda handy.


## Commands

- Recency Bias: Recompute Decorations
  - Forces a fresh Git blame seed and reapplies decorations for all visible editors.

- Recency Bias: Toggle Foreground/Background
  - Switches `recencyBias.colorTarget` between `foreground` and `background` and rebuilds the palette.

- Recency Bias: Cycle Off/On/Reverse
  - Cycles status: `Off` → `New` → `Old`.
  - Like pushing the Status Bar Button, but with text

- Recency Bias: Reverse 
  - Switches from emphasizing newest to oldest code

## Status Bar Button

- Shows “Recency: Off/New/Old”. Click to run Cycle Off/On/Reverse.
- Behavior mapping:
  - `Off`: `enabled: false` (decorations cleared)
  - `New`: `enabled: true`, highlights newest code (in pink by default)
  - `Old`: `enabled: true`, reverse flags to highlight oldest code (blue by default)



## Settings

You can add any of these to your settings.json to change them (these are the defautls shown here.)

```json
{
  "recencyBias.enabled": true,
  "recencyBias.maxAgeMinutes": 50000,
  "recencyBias.updateIntervalMs": 1500,
  "recencyBias.mode": "commitOrder",          // "time" | "commitOrder"
  "recencyBias.colorMode": "hueCycle",        // "tint" | "hueCycle"


  "recencyBias.colorTarget": "foreground",    // "foreground" | "background"

  "recencyBias.reverseHue": false,            // changes the direction the colors cycle around the color circle
  "recencyBias.newHue": 325,                  // pink
  "recencyBias.oldHue": 180,                  // blue
  "recencyBias.hueCurve": "linear",           // "linear" | "log" | "revlog"

  "recencyBias.maxSaturation": 1,
  "recencyBias.minSaturation": 0.15,
  "recencyBias.saturationCurve": "revlog",    // "linear" | "log" | "revlog"

  "recencyBias.maxLightness": 0.72,
  "recencyBias.minLightness": 0.48,
  "recencyBias.lightnessCurve": "revlog",     // "linear" | "log" | "revlog"

  "recencyBias.maxAlpha": 1,
  "recencyBias.minAlpha": 0.75,
  "recencyBias.alphaCurve": "log",            // "linear" | "log" | "revlog"

  "recencyBias.reverseAlpha": false,
  "recencyBias.reverseSaturation": false,
  "recencyBias.reverseLightness": false,

  "recencyBias.useAlphaFade": true,
  "recencyBias.debugLogging": false,
  "recencyBias.useGitBlame": true,
  "recencyBias.relativeScope": "file",        // "file" | "repo" 
}
```

Notes:
- Background target clamps saturation and lightness to 0.4, and alpha to 0.4, to avoid overpowering themes.
- Repo relative scope ranks commit order across all visible editors; file scope ranks within each file.

## Install from a VSIX file

If you downloaded a `.vsix` file (e.g., from GitHub Releases):

1) Open VS Code → Extensions view
2) Click the "…" menu in the top-right → Install from VSIX…
3) Select the downloaded `.vsix` file
4) Reload when prompted

Command line alternative:

```bash
code --install-extension recency-bias-*.vsix
```

Showing Newest
<img width="1053" height="673" alt="Screenshot 2025-08-11 at 2 35 26 PM" src="https://github.com/user-attachments/assets/a07088e7-c7ee-4f4c-9ff3-2fb0a13bbddd" />


Showing Oldest
<img width="1033" height="549" alt="Screenshot 2025-08-11 at 2 33 41 PM" src="https://github.com/user-attachments/assets/21debedf-9123-49e6-8198-d0724e167b46" />


<img width="580" height="413" alt="Screenshot 2025-08-11 at 2 28 02 PM" src="https://github.com/user-attachments/assets/892e3d15-1a60-4e2f-894b-d31d998e3844" />


<img width="505" height="1160" alt="Screenshot 2025-08-11 at 1 11 46 PM" src="https://github.com/user-attachments/assets/0ecc0b98-764f-4c5c-bffe-0861e285ed7b" />

<img width="663" height="736" alt="Screenshot 2025-08-11 at 1 11 03 PM" src="https://github.com/user-attachments/assets/5ef91eb8-d170-4a6b-97d3-3c1e6cfa1616" />
