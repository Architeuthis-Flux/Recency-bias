# Recency Bias


This is a VSCode plugin that colors your code based on when it was written. 

It goes through your git blame history and makes a gradient based on how far down it is, so you can quickly see what was written recently and what was from a while ago.


This is just a vibe coded thing I wanted while I was working on something else, it's not meant to be on all the time, but it puts a little button to toggle it from New -> Old -> Off so you can quickly check the relative time your code was committed. Kinda handy.

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






<img width="673" height="808" alt="Screenshot 2025-08-11 at 1 25 20 PM" src="https://github.com/user-attachments/assets/6901839c-615d-4bbb-988d-67d6c7cc33a1" />

<img width="878" height="931" alt="Screenshot 2025-08-11 at 1 15 52 PM" src="https://github.com/user-attachments/assets/71b774b6-07bc-44b6-a059-c869ba9ca9f4" />

<img width="505" height="1160" alt="Screenshot 2025-08-11 at 1 11 46 PM" src="https://github.com/user-attachments/assets/0219f57f-65dc-4586-a7d9-9e8404246194" />

<img width="682" height="1098" alt="Screenshot 2025-08-11 at 1 13 58 PM" src="https://github.com/user-attachments/assets/eb8bca50-76fb-4b54-ab11-742416183a7f" />

