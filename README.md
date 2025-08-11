#Recency Bias


This is a VSCode plugin that colors your code based on when it was written. 

It goes through your git blame history and makes a gradient based on how far down it is, so you can quickly see what was written recently and what was from a while ago.

This is just a vibe coded thing I wanted while I was working on something else, it's not meant to be on all the time, but it puts a little button to toggle it from New -> Old -> Off so you can quickly check the relative time your code was committed.

## Settings

Add to your settings.json (these are the current defaults):

```json
{
  "recencyBias.enabled": true,
  "recencyBias.maxAgeMinutes": 50000,
  "recencyBias.updateIntervalMs": 1500,
  "recencyBias.mode": "commitOrder",          // "time" | "commitOrder"
  "recencyBias.colorMode": "hueCycle",        // "tint" | "hueCycle"

  "recencyBias.relativeScope": "file",        // "file" | "repo"
  "recencyBias.colorTarget": "foreground",    // "foreground" | "background"

  "recencyBias.reverseHue": false,
  "recencyBias.newHue": 325,
  "recencyBias.oldHue": 180,
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
  "recencyBias.useGitBlame": true
}
```

Notes:
- New/Old/Off button in the status bar cycles emphasis. “Old” makes oldest stand out (reverses alpha/saturation/lightness). “New” emphasizes newer lines.
- Background target clamps saturation and lightness to 0.4, and alpha to 0.4, to avoid overpowering themes.
- Repo relative scope ranks commit order across all visible editors; file scope ranks within each file.

## Commands

- Recency Bias: Recompute Decorations
- Recency Bias: Toggle Foreground/Background
- Recency Bias: Cycle Off/On/Reverse
- Recency Bias: Toggle Reverse (Oldest Stand Out)
