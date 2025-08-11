import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';

type Milliseconds = number;

type Mode = 'time' | 'commitOrder';
type ColorMode = 'tint' | 'hueCycle';
type Curve = 'linear' | 'log' | 'revlog';
type ColorTarget = 'foreground' | 'background';
type RelativeScope = 'file' | 'repo';

interface ExtensionConfig {
  enabled: boolean;
  maxAgeMinutes: number;
  maxAlpha: number;
  tintColor: string;
  updateIntervalMs: number;
  useGitBlame: boolean;
  mode: Mode;
  colorMode: ColorMode;
  colorTarget: ColorTarget;
  relativeScope: RelativeScope;
  newHue: number; // newest lines hue
  oldHue: number; // oldest lines hue
  saturation: number; // 0..1
  lightness: number;  // 0..1
  useAlphaFade: boolean;
  debugLogging: boolean;
  reverseHue: boolean;
  hueCurve: Curve;
  minAlpha: number;
  reverseAlpha: boolean;
  alphaCurve: Curve;
  minSaturation: number;
  maxSaturation: number;
  reverseSaturation: boolean;
  saturationCurve: Curve;
  minLightness: number;
  maxLightness: number;
  reverseLightness: boolean;
  lightnessCurve: Curve;
}

function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('recencyBias');
  return {
    enabled: cfg.get<boolean>('enabled', true),
    maxAgeMinutes: cfg.get<number>('maxAgeMinutes', 500),
    maxAlpha: cfg.get<number>('maxAlpha', 0.50),
    tintColor: cfg.get<string>('tintColor', '#ff00ff'),
    updateIntervalMs: cfg.get<number>('updateIntervalMs', 1000),
    useGitBlame: cfg.get<boolean>('useGitBlame', true),
    mode: cfg.get<Mode>('mode', 'commitOrder'),
    colorMode: cfg.get<ColorMode>('colorMode', 'hueCycle'),
    colorTarget: cfg.get<ColorTarget>('colorTarget', 'foreground'),
    relativeScope: cfg.get<RelativeScope>('relativeScope', 'file'),
    newHue: cfg.get<number>('newHue', 330),
    oldHue: cfg.get<number>('oldHue', 180),
    hueCurve: cfg.get<Curve>('hueCurve', 'linear'),
    saturation: cfg.get<number>('saturation', 1.0),
    lightness: cfg.get<number>('lightness', 0.50),
    useAlphaFade: cfg.get<boolean>('useAlphaFade', true),
    debugLogging: cfg.get<boolean>('debugLogging', false),
    reverseHue: cfg.get<boolean>('reverseHue', true),
    minAlpha: cfg.get<number>('minAlpha', 0.05),
    reverseAlpha: cfg.get<boolean>('reverseAlpha', false),
    alphaCurve: cfg.get<Curve>('alphaCurve', 'linear'),
    minSaturation: cfg.get<number>('minSaturation', 1.0),
    maxSaturation: cfg.get<number>('maxSaturation', 1.0),
    reverseSaturation: cfg.get<boolean>('reverseSaturation', false),
    saturationCurve: cfg.get<Curve>('saturationCurve', 'linear'),
    minLightness: cfg.get<number>('minLightness', 0.5),
    maxLightness: cfg.get<number>('maxLightness', 0.5),
    reverseLightness: cfg.get<boolean>('reverseLightness', false),
    lightnessCurve: cfg.get<Curve>('lightnessCurve', 'linear'),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function countNewlines(text: string): number {
  if (text.length === 0) return 0;
  return (text.match(/\n/g) || []).length;
}

// removed unused hex parser

function rgbaString(rgb: { r: number; g: number; b: number }, alpha: number): string {
  const a = clamp(alpha, 0, 1);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a.toFixed(4)})`;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  // h: 0..360, s/l: 0..1
  const C = (1 - Math.abs(2 * l - 1)) * s;
  const Hp = (h % 360) / 60;
  const X = C * (1 - Math.abs((Hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (0 <= Hp && Hp < 1) [r1, g1, b1] = [C, X, 0];
  else if (1 <= Hp && Hp < 2) [r1, g1, b1] = [X, C, 0];
  else if (2 <= Hp && Hp < 3) [r1, g1, b1] = [0, C, X];
  else if (3 <= Hp && Hp < 4) [r1, g1, b1] = [0, X, C];
  else if (4 <= Hp && Hp < 5) [r1, g1, b1] = [X, 0, C];
  else if (5 <= Hp && Hp < 6) [r1, g1, b1] = [C, 0, X];
  const m = l - C / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return { r, g, b };
}

function applyCurve(x: number, curve: Curve): number {
  const clamped = clamp(x, 0, 1);
  switch (curve) {
    case 'log':
      // easeIn: slow start -> more weight to lower x
      return Math.log1p(clamped * 9) / Math.log1p(9);
    case 'revlog':
      // easeOut: fast start
      return 1 - Math.log1p((1 - clamped) * 9) / Math.log1p(9);
    case 'linear':
    default:
      return clamped;
  }
}

class DecorationPalette {
  private decorationTypes: vscode.TextEditorDecorationType[] = [];
  private steps: number;
  private maxAlpha: number;
  private colorMode: ColorMode;
  private colorTarget: ColorTarget;
  private newHue: number;
  private oldHue: number;
  private useAlphaFade: boolean;
  private reverseHue: boolean;
  private hueCurve: Curve;
  private minAlpha: number;
  private reverseAlpha: boolean;
  private alphaCurve: Curve;
  private minSaturationCfg: number;
  private maxSaturationCfg: number;
  private reverseSaturation: boolean;
  private saturationCurve: Curve;
  private minLightnessCfg: number;
  private maxLightnessCfg: number;
  private reverseLightness: boolean;
  private lightnessCurve: Curve;

  constructor(cfg: ExtensionConfig) {
    // Use a fixed high-resolution step count regardless of hue distance
    this.steps = 360;
    this.maxAlpha = clamp(cfg.maxAlpha, 0, 1);
    this.colorMode = cfg.colorMode;
    this.colorTarget = cfg.colorTarget;
    this.newHue = ((cfg.newHue % 360) + 360) % 360;
    this.oldHue = ((cfg.oldHue % 360) + 360) % 360;
    this.useAlphaFade = cfg.useAlphaFade;
    this.reverseHue = cfg.reverseHue;
    this.hueCurve = cfg.hueCurve;
    this.minAlpha = clamp(cfg.minAlpha, 0, 1);
    this.reverseAlpha = cfg.reverseAlpha;
    this.alphaCurve = cfg.alphaCurve;
    this.minSaturationCfg = clamp(cfg.minSaturation, 0, 1);
    this.maxSaturationCfg = clamp(cfg.maxSaturation, 0, 1);
    this.reverseSaturation = cfg.reverseSaturation;
    this.saturationCurve = cfg.saturationCurve;
    this.minLightnessCfg = clamp(cfg.minLightness, 0, 1);
    this.maxLightnessCfg = clamp(cfg.maxLightness, 0, 1);
    this.reverseLightness = cfg.reverseLightness;
    this.lightnessCurve = cfg.lightnessCurve;
    this.createDecorationTypes();
  }

  dispose(): void {
    for (const dt of this.decorationTypes) {
      dt.dispose();
    }
    this.decorationTypes = [];
  }

  private createDecorationTypes(): void {
    this.dispose();
    for (let i = 1; i <= this.steps; i += 1) {
      // Newest lines should be most opaque (highest alpha). Higher stepIndex => newer.
      const stepFraction = i / this.steps; // 0..1
      const newestFraction = stepFraction; // higher i => newer
      // Alpha mapping with curve and minAlpha; newestFraction represents newer lines
      const baseAlpha01 = this.useAlphaFade ? applyCurve(newestFraction, this.alphaCurve) : 1;
      const adjAlpha01 = this.reverseAlpha ? 1 - baseAlpha01 : baseAlpha01;
      let alpha = this.minAlpha + (this.maxAlpha - this.minAlpha) * adjAlpha01;
      if (this.colorTarget === 'background') {
        alpha = Math.min(alpha, 0.4);
      }
      let backgroundColor: string;
      if (this.colorMode === 'hueCycle') {
        // Direction through spectrum between oldHue (oldest) and newHue (newest)
        const forward = ((this.newHue - this.oldHue + 360) % 360);
        const distance = this.reverseHue ? (forward === 0 ? 0 : 360 - forward) : forward;
        const hueT = applyCurve(newestFraction, this.hueCurve);
        const h = (this.oldHue + (this.reverseHue ? -1 : 1) * distance * hueT + 3600) % 360;
        // Saturation and Lightness mapping
        const satCurveVal = applyCurve(newestFraction, this.saturationCurve);
        const sat01 = this.reverseSaturation ? 1 - satCurveVal : satCurveVal;
        let s = this.minSaturationCfg + (this.maxSaturationCfg - this.minSaturationCfg) * sat01;
        if (this.colorTarget === 'background') {
          s = Math.min(s, 0.4);
        }
        const lightCurveVal = applyCurve(newestFraction, this.lightnessCurve);
        const light01 = this.reverseLightness ? 1 - lightCurveVal : lightCurveVal;
        let l = this.minLightnessCfg + (this.maxLightnessCfg - this.minLightnessCfg) * light01;
        if (this.colorTarget === 'background') {
          l = Math.min(l, 0.4);
        }
        const rgb = hslToRgb(h, s, l);
        backgroundColor = rgbaString(rgb, alpha);
      } else {
        // For tint mode, vary S/L similarly by mixing toward the tint color in HSL space
        const satCurveVal = applyCurve(newestFraction, this.saturationCurve);
        const sat01 = this.reverseSaturation ? 1 - satCurveVal : satCurveVal;
        let s = this.minSaturationCfg + (this.maxSaturationCfg - this.minSaturationCfg) * sat01;
        if (this.colorTarget === 'background') {
          s = Math.min(s, 0.4);
        }
        const lightCurveVal = applyCurve(newestFraction, this.lightnessCurve);
        const light01 = this.reverseLightness ? 1 - lightCurveVal : lightCurveVal;
        let l = this.minLightnessCfg + (this.maxLightnessCfg - this.minLightnessCfg) * light01;
        if (this.colorTarget === 'background') {
          l = Math.min(l, 0.4);
        }
        // Convert tint to HSL-ish approximation by scanning hue; simpler: scale toward gray via s and adjust l
        const rgb = hslToRgb(this.newHue, s, l);
        backgroundColor = rgbaString(rgb, alpha);
      }
      const type = this.colorTarget === 'foreground'
        ? vscode.window.createTextEditorDecorationType({
            color: backgroundColor,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
          })
        : vscode.window.createTextEditorDecorationType({
            backgroundColor: backgroundColor,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
          });
      this.decorationTypes.push(type);
    }
  }

  getTypeForStep(stepIndex: number): vscode.TextEditorDecorationType | undefined {
    if (stepIndex < 1 || stepIndex > this.decorationTypes.length) return undefined;
    return this.decorationTypes[stepIndex - 1];
  }

  getStepCount(): number {
    return this.steps;
  }
}

class RecencyHighlighter {
  private config: ExtensionConfig;
  private palette: DecorationPalette;
  private intervalTimer: NodeJS.Timeout | null = null;
  private output: vscode.OutputChannel | null = null;
  private isIntervalRefreshRunning: boolean = false;

  // Map from document URI string to per-line last-edit timestamp (ms since epoch)
  private documentLineEpochs: Map<string, (Milliseconds | null)[]> = new Map();
  private documentLineCommits: Map<string, (string | null)[]> = new Map();

  constructor() {
    this.config = getConfig();
    this.palette = new DecorationPalette(this.config);
    this.output = vscode.window.createOutputChannel('Recency Bias');
  }

  dispose(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.palette.dispose();
    this.documentLineEpochs.clear();
  }

  onConfigChanged(): void {
    this.config = getConfig();
    this.palette.dispose();
    this.palette = new DecorationPalette(this.config);
    this.triggerFullRefresh();
    this.startTimers();
  }

  startTimers(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    this.intervalTimer = setInterval(async () => {
      if (!this.config.enabled) return;
      if (this.isIntervalRefreshRunning) return;
      this.isIntervalRefreshRunning = true;
      try {
        const editors = vscode.window.visibleTextEditors;
        await Promise.all(
          editors.map(async (editor) => {
            await this.seedFromGitIfEnabled(editor.document);
          })
        );
        this.updateVisibleEditors();
      } finally {
        this.isIntervalRefreshRunning = false;
      }
    }, this.config.updateIntervalMs);
  }

  async initializeOpenEditors(): Promise<void> {
    const editors = vscode.window.visibleTextEditors;
    for (const editor of editors) {
      await this.ensureDocumentInitialized(editor.document);
    }
    this.updateVisibleEditors();
  }

  toggleEnabled(): void {
    const cfg = vscode.workspace.getConfiguration('recencyBias');
    const current = cfg.get<boolean>('enabled', true);
    cfg.update('enabled', !current, vscode.ConfigurationTarget.Global);
  }

  async ensureDocumentInitialized(document: vscode.TextDocument): Promise<void> {
    if (document.uri.scheme !== 'file') return;
    const key = document.uri.toString();
    if (this.documentLineEpochs.has(key)) {
      // Ensure array length stays in sync with document
      const arr = this.documentLineEpochs.get(key)!;
      if (arr.length !== document.lineCount) {
        this.documentLineEpochs.set(key, this.resizeEpochArray(arr, document.lineCount));
      }
      const commits = this.documentLineCommits.get(key);
      if (commits && commits.length !== document.lineCount) {
        this.documentLineCommits.set(key, this.resizeCommitArray(commits, document.lineCount));
      }
      return;
    }

    const epochs: (Milliseconds | null)[] = new Array(document.lineCount).fill(null);
    this.documentLineEpochs.set(key, epochs);
    const commits: (string | null)[] = new Array(document.lineCount).fill(null);
    this.documentLineCommits.set(key, commits);
    await this.seedFromGitIfEnabled(document);
  }

  private resizeEpochArray(existing: (Milliseconds | null)[], newLength: number): (Milliseconds | null)[] {
    if (existing.length === newLength) return existing;
    const copy = existing.slice();
    if (copy.length < newLength) {
      const toAdd = newLength - copy.length;
      for (let i = 0; i < toAdd; i += 1) copy.push(null);
      return copy;
    }
    return copy.slice(0, newLength);
  }

  private resizeCommitArray(existing: (string | null)[], newLength: number): (string | null)[] {
    if (existing.length === newLength) return existing;
    const copy = existing.slice();
    if (copy.length < newLength) {
      const toAdd = newLength - copy.length;
      for (let i = 0; i < toAdd; i += 1) copy.push(null);
      return copy;
    }
    return copy.slice(0, newLength);
  }

  handleDocumentChange(e: vscode.TextDocumentChangeEvent): void {
    if (!this.config.enabled) return;
    const document = e.document;
    if (document.uri.scheme !== 'file') return;
    const key = document.uri.toString();
    const now = Date.now();
    let epochs = this.documentLineEpochs.get(key);
    let commits = this.documentLineCommits.get(key);
    if (!epochs) {
      epochs = new Array(document.lineCount).fill(null);
      this.documentLineEpochs.set(key, epochs);
    }
    if (!commits) {
      commits = new Array(document.lineCount).fill(null);
      this.documentLineCommits.set(key, commits);
    }

    // Apply each change sequentially to keep indices aligned.
    for (const change of e.contentChanges) {
      const startLine = change.range.start.line;
      const endLine = change.range.end.line;
      const deletedLines = endLine - startLine;
      const insertedLines = countNewlines(change.text);

      // Mark affected line(s) as edited now
      const firstTouched = Math.min(startLine, epochs.length - 1);
      if (firstTouched >= 0) {
        epochs[firstTouched] = now;
        if (commits) commits[firstTouched] = null; // unknown commit until saved & blamed
      }
      // Splice epochs to account for line structure changes
      if (deletedLines !== 0 || insertedLines !== 0) {
        const insertArray: (Milliseconds | null)[] = new Array(insertedLines).fill(now);
        epochs.splice(startLine, deletedLines, ...insertArray);
        const insertCommits: (string | null)[] = new Array(insertedLines).fill(null);
        commits.splice(startLine, deletedLines, ...insertCommits);
      }
    }

    // Ensure length consistency after all changes
    if (epochs.length !== document.lineCount) {
      this.documentLineEpochs.set(key, this.resizeEpochArray(epochs, document.lineCount));
    }

    this.updateEditor(vscode.window.activeTextEditor);
  }

  async seedFromGitIfEnabled(document: vscode.TextDocument): Promise<void> {
    if (!this.config.useGitBlame) return;
    if (document.uri.scheme !== 'file') return;
    try {
      const meta = await blameFileLineMeta(document.uri.fsPath);
      if (this.config.debugLogging) this.output?.appendLine(`[blame] ${path.basename(document.uri.fsPath)} -> ${meta.length} lines`);
      if (meta && meta.length > 0) {
        const targetLen = document.lineCount;
        const epochs: (Milliseconds | null)[] = new Array(targetLen).fill(null);
        const commits: (string | null)[] = new Array(targetLen).fill(null);
        const copyLen = Math.min(targetLen, meta.length);
        for (let i = 0; i < copyLen; i += 1) {
          epochs[i] = meta[i]?.epochMs ?? null;
          commits[i] = meta[i]?.commit ?? null;
        }
        // If blame is shorter by 1 (common for files without trailing newline), pad last line as nulls
        this.documentLineEpochs.set(document.uri.toString(), epochs);
        this.documentLineCommits.set(document.uri.toString(), commits);
        if (this.config.debugLogging && meta.length !== targetLen) {
          this.output?.appendLine(`[blame] line count mismatch (tolerated): doc=${targetLen} blame=${meta.length}`);
        }
      } else if (this.config.debugLogging) {
        this.output?.appendLine(`[blame] no blame data returned`);
      }
    } catch (e) {
      if (this.config.debugLogging) this.output?.appendLine(`[blame:error] ${(e as Error).message}`);
    }
  }

  updateVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateEditor(editor);
    }
  }

  triggerFullRefresh(): void {
    const editors = vscode.window.visibleTextEditors;
    Promise.all(
      editors.map(async (editor) => {
        await this.seedFromGitIfEnabled(editor.document);
      })
    ).finally(() => {
      this.updateVisibleEditors();
    });
  }

  private updateEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor) return;
    const steps = this.palette.getStepCount();
    if (!this.config.enabled) {
      // clear decorations when disabled
      for (let i = 1; i <= steps; i += 1) {
        const type = this.palette.getTypeForStep(i);
        if (type) editor.setDecorations(type, []);
      }
      return;
    }

    const document = editor.document;
    const key = document.uri.toString();
    const epochs = this.documentLineEpochs.get(key);
    const commits = this.documentLineCommits.get(key);
    if (!epochs) return;

    const now = Date.now();
    const maxAgeMs = this.config.maxAgeMinutes * 60 * 1000;

    // Prepare buckets: index 1..steps; index 0 means no decoration
    const bucketRanges: vscode.Range[][] = Array.from({ length: steps + 1 }, () => []);

    const totalLines = document.lineCount;
    if (this.config.mode === 'time') {
      for (let line = 0; line < totalLines; line += 1) {
        const epoch = epochs[line];
        if (epoch == null) continue;
        const age = now - epoch;
        if (age >= maxAgeMs) continue;
        // fractionOld: 0 newest .. 1 oldest; newest should map to highest step so it is most opaque
        const fractionOld = clamp(age / maxAgeMs, 0, 1);
        const stepIndex = Math.max(1, Math.ceil((1 - fractionOld) * steps));
        if (stepIndex <= 0) continue;
        const lineEnd = document.lineAt(line).range.end.character;
        const range = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, lineEnd));
        bucketRanges[stepIndex].push(range);
      }
    } else {
      // commitOrder mode: order commits by epoch and map each line by its commit rank
      let populated = false;
      if (commits) {
        const commitToEpoch = new Map<string, number>();
        const pushCommit = (c: string | null, e: Milliseconds | null) => {
          if (!c || typeof e !== 'number') return;
          const existing = commitToEpoch.get(c);
          if (existing == null) commitToEpoch.set(c, e);
          else commitToEpoch.set(c, Math.min(existing, e));
        };
        if (this.config.relativeScope === 'repo') {
          for (const ed of vscode.window.visibleTextEditors) {
            const k = ed.document.uri.toString();
            const eArr = this.documentLineEpochs.get(k);
            const cArr = this.documentLineCommits.get(k);
            if (!eArr || !cArr) continue;
            const lines = ed.document.lineCount;
            for (let line = 0; line < lines; line += 1) {
              pushCommit(cArr[line], eArr[line]);
            }
          }
        } else {
          for (let line = 0; line < totalLines; line += 1) {
            pushCommit(commits[line], epochs[line]);
          }
        }
        const uniqueCommits = Array.from(commitToEpoch.entries());
        if (uniqueCommits.length > 0) {
          // sort by epoch ascending (oldest first)
          uniqueCommits.sort((a, b) => a[1] - b[1]);
          const commitToRank = new Map<string, number>();
          for (let i = 0; i < uniqueCommits.length; i += 1) commitToRank.set(uniqueCommits[i][0], i);
          const denom = Math.max(1, uniqueCommits.length - 1);
          for (let line = 0; line < totalLines; line += 1) {
            const c = commits[line];
            if (!c) continue;
            const rank = commitToRank.get(c);
            if (rank == null) continue;
            // rank: 0 oldest .. max newest. Newest should have highest step index for strongest alpha.
            const newestFraction = clamp(rank / denom, 0, 1);
            const stepIndex = Math.max(1, Math.ceil(newestFraction * steps));
            if (stepIndex <= 0) continue;
            const lineEnd = document.lineAt(line).range.end.character;
            const range = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, lineEnd));
            bucketRanges[stepIndex].push(range);
            populated = true;
          }
        }
      }
      if (!populated) {
        // Fallback: rank by epoch ignoring maxAgeMinutes
        const linesWithEpoch: Array<{ line: number; epoch: number }> = [];
        for (let line = 0; line < totalLines; line += 1) {
          const e = epochs[line];
          if (typeof e === 'number') linesWithEpoch.push({ line, epoch: e });
        }
        if (linesWithEpoch.length > 0) {
          linesWithEpoch.sort((a, b) => a.epoch - b.epoch); // oldest first
          const denom = Math.max(1, linesWithEpoch.length - 1);
          for (let i = 0; i < linesWithEpoch.length; i += 1) {
            const { line } = linesWithEpoch[i];
            const newestFraction = clamp(i / denom, 0, 1);
            const stepIndex = Math.max(1, Math.ceil(newestFraction * steps));
            if (stepIndex <= 0) continue;
            const lineEnd = document.lineAt(line).range.end.character;
            const range = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, lineEnd));
            bucketRanges[stepIndex].push(range);
          }
        }
      }
    }

    for (let i = 1; i <= steps; i += 1) {
      const type = this.palette.getTypeForStep(i);
      if (type) editor.setDecorations(type, bucketRanges[i]);
    }
  }
}

interface BlameLineMeta { commit: string | null; epochMs: Milliseconds | null }

async function blameFileLineMeta(filePath: string): Promise<BlameLineMeta[]> {
  return new Promise<BlameLineMeta[]>((resolve) => {
    const fileDir = path.dirname(filePath);
    execFile('git', ['rev-parse', '--show-toplevel'], { cwd: fileDir, windowsHide: true, maxBuffer: 1024 * 1024 * 50 }, (rootErr, rootStdout) => {
      const gitRoot = rootErr ? fileDir : rootStdout.trim();
      const rel = path.relative(gitRoot, filePath);
      const args = ['-C', gitRoot, 'blame', '--line-porcelain', '--', rel];
      execFile('git', args, { windowsHide: true, maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
        const parse = (text: string): BlameLineMeta[] => {
          const lines = text.split(/\r?\n/);
          const meta: BlameLineMeta[] = [];
          let currentEpoch: Milliseconds | null = null;
          let currentCommit: string | null = null;
          for (const line of lines) {
            const header = /^\^?([0-9a-f]{8,40})\s+\d+\s+\d+\s+\d+/.exec(line);
            if (header) { currentCommit = header[1]; currentEpoch = null; continue; }
            if (line.startsWith('author-time ')) {
              const secs = Number(line.substring('author-time '.length).trim());
              if (!Number.isNaN(secs)) currentEpoch = secs * 1000; continue;
            }
            if (line.startsWith('\t')) { meta.push({ commit: currentCommit, epochMs: currentEpoch }); continue; }
          }
          return meta;
        };

        if (!error && stdout && stdout.length > 0) {
          resolve(parse(stdout));
          return;
        }
        // Fallback: run blame from file directory with absolute path
        const fallbackArgs = ['blame', '--line-porcelain', '--', filePath];
        execFile('git', fallbackArgs, { cwd: fileDir, windowsHide: true, maxBuffer: 1024 * 1024 * 50 }, (fbErr, fbStdout) => {
          if (fbErr || !fbStdout) {
            resolve([]);
            return;
          }
          resolve(parse(fbStdout));
        });
      });
    });
  });
}

let highlighter: RecencyHighlighter | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  highlighter = new RecencyHighlighter();
  // Status bar toggle
  const toggleItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const updateToggleText = () => {
    const cfg = vscode.workspace.getConfiguration('recencyBias');
    const enabled = cfg.get<boolean>('enabled', true);
    const revA = cfg.get<boolean>('reverseAlpha', false);
    const revS = cfg.get<boolean>('reverseSaturation', false);
    const revL = cfg.get<boolean>('reverseLightness', false);
    // Correct: reverse=true => Old (oldest stand out), reverse=false => New
    const mode = !enabled ? 'Off' : (revA || revS || revL ? 'Old' : 'New');
    const icon = !enabled ? '$(circle-slash)' : '$(paintcan)';
    toggleItem.text = `${icon} Recency: ${mode}`;
    toggleItem.tooltip = 'Cycle Recency Bias: Off → New → Old';
    toggleItem.command = 'recencyBias.cycleToggle';
    toggleItem.show();
  };
  updateToggleText();

  context.subscriptions.push(
    toggleItem,
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      await highlighter?.ensureDocumentInitialized(doc);
      // Seed from git on open as well so editors show history immediately
      await (highlighter as RecencyHighlighter)?.seedFromGitIfEnabled(doc);
      highlighter?.updateVisibleEditors();
    }),
    vscode.window.onDidChangeActiveTextEditor(async (ed) => {
      if (ed) {
        await (highlighter as RecencyHighlighter)?.seedFromGitIfEnabled(ed.document);
      }
      highlighter?.updateVisibleEditors();
    }),
    vscode.workspace.onDidChangeTextDocument((e) => highlighter?.handleDocumentChange(e)),
    vscode.workspace.onDidChangeConfiguration(() => { updateToggleText(); highlighter?.onConfigChanged(); }),
    vscode.commands.registerCommand('recencyBias.toggle', () => { highlighter?.toggleEnabled(); updateToggleText(); }),
    vscode.commands.registerCommand('recencyBias.cycleToggle', async () => {
      const cfg = vscode.workspace.getConfiguration('recencyBias');
      const enabled = cfg.get<boolean>('enabled', true);
      const revA = cfg.get<boolean>('reverseAlpha', false);
      const revS = cfg.get<boolean>('reverseSaturation', false);
      const revL = cfg.get<boolean>('reverseLightness', false);
      if (!enabled) {
        // Go to New: reverse flags false
        await Promise.all([
          cfg.update('enabled', true, vscode.ConfigurationTarget.Global),
          cfg.update('reverseAlpha', false, vscode.ConfigurationTarget.Global),
          cfg.update('reverseSaturation', false, vscode.ConfigurationTarget.Global),
          cfg.update('reverseLightness', false, vscode.ConfigurationTarget.Global),
        ]);
        updateToggleText();
        highlighter?.onConfigChanged();
        return;
      }
      if (!(revA || revS || revL)) {
        // Currently New -> go to Old (set reverse flags true)
        await Promise.all([
          cfg.update('reverseAlpha', true, vscode.ConfigurationTarget.Global),
          cfg.update('reverseSaturation', true, vscode.ConfigurationTarget.Global),
          cfg.update('reverseLightness', true, vscode.ConfigurationTarget.Global),
        ]);
        updateToggleText();
        highlighter?.onConfigChanged();
        return;
      }
      // Currently Old -> go to Off
      await Promise.all([
        cfg.update('enabled', false, vscode.ConfigurationTarget.Global),
        cfg.update('reverseAlpha', false, vscode.ConfigurationTarget.Global),
        cfg.update('reverseSaturation', false, vscode.ConfigurationTarget.Global),
        cfg.update('reverseLightness', false, vscode.ConfigurationTarget.Global),
      ]);
      updateToggleText();
      highlighter?.onConfigChanged();
    }),
    vscode.commands.registerCommand('recencyBias.recompute', () => highlighter?.triggerFullRefresh()),
    vscode.commands.registerCommand('recencyBias.toggleColorTarget', async () => {
      const cfg = vscode.workspace.getConfiguration('recencyBias');
      const current = cfg.get<'foreground' | 'background'>('colorTarget', 'foreground');
      await cfg.update('colorTarget', current === 'foreground' ? 'background' : 'foreground', vscode.ConfigurationTarget.Global);
      highlighter?.onConfigChanged();
    }),
    vscode.commands.registerCommand('recencyBias.toggleReverseAll', async () => {
      const cfg = vscode.workspace.getConfiguration('recencyBias');
      const newReverseAlpha = !(cfg.get<boolean>('reverseAlpha', false));
      const newReverseSat = !(cfg.get<boolean>('reverseSaturation', false));
      const newReverseLight = !(cfg.get<boolean>('reverseLightness', false));
      await Promise.all([
        cfg.update('reverseAlpha', newReverseAlpha, vscode.ConfigurationTarget.Global),
        cfg.update('reverseSaturation', newReverseSat, vscode.ConfigurationTarget.Global),
        cfg.update('reverseLightness', newReverseLight, vscode.ConfigurationTarget.Global),
      ]);
      highlighter?.onConfigChanged();
    })
  );

  await highlighter.initializeOpenEditors();
  highlighter.startTimers();
}

export function deactivate(): void {
  highlighter?.dispose();
  highlighter = null;
}


