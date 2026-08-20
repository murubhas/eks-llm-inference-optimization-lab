import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "assets");
const svgPath = path.join(assets, "keda-queue-scaleout.svg");
const pngPath = path.join(assets, "keda-queue-scaleout.png");

fs.mkdirSync(assets, { recursive: true });

const C = {
  ink: "#14213d",
  muted: "#506079",
  faint: "#f7f9fc",
  blue: "#3767e8",
  cyan: "#13a9c6",
  green: "#149447",
  greenBg: "#edf9f1",
  red: "#d83742",
  redBg: "#fff1f1",
  amber: "#f1a208",
  amberBg: "#fff8df",
  purple: "#6748d6",
  purpleBg: "#f4f0ff",
  border: "#263d78",
  white: "#ffffff",
};

const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function text(x, y, value, options = {}) {
  const {
    size = 18,
    weight = 500,
    fill = C.ink,
    anchor = "start",
    opacity = 1,
  } = options;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Chalkboard SE, Comic Sans MS, ui-rounded, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${esc(value)}</text>`;
}

function multiline(x, y, lines, options = {}) {
  const {
    size = 16,
    weight = 500,
    fill = C.ink,
    anchor = "start",
    lineHeight = size * 1.3,
  } = options;
  const spans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Chalkboard SE, Comic Sans MS, ui-rounded, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${spans}</text>`;
}

function box(x, y, width, height, options = {}) {
  const {
    fill = C.white,
    stroke = C.border,
    strokeWidth = 2,
    radius = 12,
    dash = "",
    shadow = true,
  } = options;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}${shadow ? ' filter="url(#softShadow)"' : ""}/>`;
}

function arrow(x1, y1, x2, y2, color = C.blue, dashed = false) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const size = 11;
  const half = 6;
  const bx = x2 - ux * size;
  const by = y2 - uy * size;
  const px = -uy * half;
  const py = ux * half;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3"${dashed ? ' stroke-dasharray="8 7"' : ""}/><polygon points="${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}" fill="${color}"/>`;
}

function statusPill(x, y, label, tone = "good", width = 118) {
  const fill = tone === "good" ? C.greenBg : tone === "bad" ? C.redBg : C.amberBg;
  const stroke = tone === "good" ? C.green : tone === "bad" ? C.red : C.amber;
  return [
    box(x, y, width, 32, { fill, stroke, radius: 16, shadow: false }),
    text(x + width / 2, y + 22, label, {
      size: 14,
      weight: 800,
      fill: stroke,
      anchor: "middle",
    }),
  ].join("");
}

function gpuNode(x, y, label, podLabel, tone = "ready") {
  const accent = tone === "ready" ? C.green : tone === "loading" ? C.amber : C.muted;
  const fill = tone === "ready" ? C.greenBg : tone === "loading" ? C.amberBg : C.faint;
  return [
    box(x, y, 166, 118, { fill, stroke: accent, radius: 10, shadow: false }),
    `<rect x="${x + 14}" y="${y + 17}" width="38" height="38" rx="8" fill="${accent}" opacity="0.12" stroke="${accent}" stroke-width="2"/>`,
    `<path d="M${x + 23} ${y + 26}h20v20h-20z M${x + 27} ${y + 21}v5 M${x + 35} ${y + 21}v5 M${x + 43} ${y + 21}v5 M${x + 27} ${y + 46}v5 M${x + 35} ${y + 46}v5 M${x + 43} ${y + 46}v5" fill="none" stroke="${accent}" stroke-width="2"/>`,
    text(x + 62, y + 34, label, { size: 15, weight: 800 }),
    text(x + 62, y + 55, "1 x L40S", { size: 12, fill: C.muted, weight: 700 }),
    text(x + 83, y + 82, podLabel, { size: 14, weight: 800, fill: accent, anchor: "middle" }),
    text(x + 83, y + 103, tone === "idle" ? "schedulable spare" : tone === "loading" ? "not an endpoint yet" : "Service endpoint", {
      size: 11,
      fill: C.muted,
      anchor: "middle",
    }),
  ].join("");
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  <defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#14213d" flood-opacity="0.12"/>
    </filter>
    <style>text { letter-spacing: 0; }</style>
  </defs>

  <rect width="1536" height="1024" fill="#fbfcfe"/>

  ${text(768, 47, "Queue pressure to a fourth ready replica", {
    size: 39,
    weight: 800,
    anchor: "middle",
  })}
  ${text(768, 79, "KEDA pod autoscaling on Amazon EKS | 3 ready vLLM replicas + 1 pre-provisioned GPU", {
    size: 19,
    weight: 650,
    fill: C.muted,
    anchor: "middle",
  })}

  <!-- Control loop -->
  ${box(42, 104, 198, 66, { stroke: C.amber })}
  ${text(141, 132, "1  AIPerf load", { size: 18, weight: 800, anchor: "middle" })}
  ${text(141, 154, "c=8 | n=200", { size: 13, fill: C.muted, anchor: "middle" })}
  ${arrow(249, 137, 302, 137, C.amber)}
  ${box(311, 104, 216, 66, { stroke: C.blue })}
  ${text(419, 132, "2  Ready endpoints", { size: 18, weight: 800, anchor: "middle" })}
  ${text(419, 154, "Kubernetes Service", { size: 13, fill: C.muted, anchor: "middle" })}
  ${arrow(536, 137, 589, 137, C.blue)}
  ${box(598, 104, 216, 66, { stroke: C.cyan })}
  ${text(706, 132, "3  Pod queues", { size: 18, weight: 800, anchor: "middle" })}
  ${text(706, 154, "independent waiting state", { size: 13, fill: C.muted, anchor: "middle" })}
  ${arrow(823, 137, 876, 137, C.cyan, true)}
  ${box(885, 104, 260, 66, { stroke: C.purple })}
  ${text(1015, 132, "4  Prometheus + KEDA", { size: 18, weight: 800, anchor: "middle" })}
  ${text(1015, 154, "sum(waiting) | Value target 1", { size: 13, fill: C.muted, anchor: "middle" })}
  ${arrow(1154, 137, 1207, 137, C.purple, true)}
  ${box(1216, 104, 278, 66, { stroke: C.green })}
  ${text(1355, 132, "5  HPA + Deployment", { size: 18, weight: 800, anchor: "middle" })}
  ${text(1355, 154, "desired replicas 3 → 4", { size: 13, fill: C.muted, anchor: "middle" })}

  <!-- Stage A -->
  ${box(28, 201, 478, 438, { fill: C.faint, stroke: C.blue, strokeWidth: 3, radius: 16 })}
  ${text(52, 239, "A. Idle baseline", { size: 27, weight: 800 })}
  ${statusPill(363, 216, "ACTIVE=FALSE", "mixed", 124)}
  ${text(52, 267, "Three ready replicas; one GPU has no model pod", { size: 14, fill: C.muted, weight: 650 })}
  ${gpuNode(52, 291, "GPU 1", "vLLM READY", "ready")}
  ${gpuNode(272, 291, "GPU 2", "vLLM READY", "ready")}
  ${gpuNode(52, 431, "GPU 3", "vLLM READY", "ready")}
  ${gpuNode(272, 431, "GPU 4", "NO MODEL POD", "idle")}
  ${box(52, 569, 386, 48, { fill: C.white, stroke: C.blue, radius: 8, shadow: false })}
  ${text(245, 599, "3 endpoints | queue 0 | active GPUs 3", { size: 15, weight: 800, anchor: "middle" })}

  <!-- Stage B -->
  ${box(529, 201, 478, 438, { fill: C.faint, stroke: C.purple, strokeWidth: 3, radius: 16 })}
  ${text(553, 239, "B. Queue triggers HPA", { size: 27, weight: 800 })}
  ${statusPill(864, 216, "ACTIVE=TRUE", "good", 124)}
  ${text(553, 267, "Aggregate waiting rises above the Value target", { size: 14, fill: C.muted, weight: 650 })}
  ${box(553, 292, 194, 112, { fill: C.purpleBg, stroke: C.purple, radius: 10 })}
  ${text(650, 325, "Queue pressure", { size: 16, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(650, 368, "peak 7", { size: 35, weight: 800, anchor: "middle" })}
  ${text(650, 390, "sum of pod queues", { size: 12, fill: C.muted, anchor: "middle" })}
  ${arrow(756, 348, 806, 348, C.purple)}
  ${box(815, 292, 168, 112, { fill: C.greenBg, stroke: C.green, radius: 10 })}
  ${text(899, 325, "HPA decision", { size: 16, weight: 800, fill: C.green, anchor: "middle" })}
  ${text(899, 368, "3 → 4", { size: 35, weight: 800, anchor: "middle" })}
  ${text(899, 390, "SuccessfulRescale", { size: 12, fill: C.muted, anchor: "middle" })}
  ${box(553, 430, 430, 116, { fill: C.amberBg, stroke: C.amber, radius: 10, shadow: false })}
  ${text(768, 462, "Why `Value` matters", { size: 17, weight: 800, fill: C.amber, anchor: "middle" })}
  ${multiline(768, 489, [
    "The trigger compares aggregate queue pressure with 1.",
    "AverageValue would dilute the signal across replicas.",
  ], { size: 14, weight: 700, anchor: "middle", lineHeight: 22 })}
  ${text(768, 590, "The summed metric is not a shared queue", { size: 15, weight: 800, fill: C.red, anchor: "middle" })}
  ${text(768, 612, "Each vLLM pod keeps its own waiting queue", { size: 13, fill: C.muted, anchor: "middle" })}

  <!-- Stage C -->
  ${box(1030, 201, 478, 438, { fill: C.faint, stroke: C.green, strokeWidth: 3, radius: 16 })}
  ${text(1054, 239, "C. Pod becomes Ready", { size: 27, weight: 800 })}
  ${statusPill(1366, 216, "SCALE-OUT", "good", 124)}
  ${text(1054, 267, "The spare GPU avoids node launch, not model loading", { size: 14, fill: C.muted, weight: 650 })}
  ${gpuNode(1054, 291, "GPU 4", "MODEL LOADING", "loading")}
  ${arrow(1230, 350, 1282, 350, C.green)}
  ${gpuNode(1291, 291, "GPU 4", "vLLM READY", "ready")}
  ${box(1054, 431, 403, 92, { fill: C.white, stroke: C.green, radius: 10, shadow: false })}
  ${text(1256, 465, "500 s / 8.3 min cold start", { size: 24, weight: 800, fill: C.green, anchor: "middle" })}
  ${text(1256, 493, "pod create → model load → readiness", { size: 13, fill: C.muted, anchor: "middle" })}
  ${box(1054, 545, 403, 72, { fill: C.greenBg, stroke: C.green, radius: 9, shadow: false })}
  ${text(1256, 574, "Endpoints 3 → 4 | active GPUs 3 → 4", { size: 17, weight: 800, anchor: "middle" })}
  ${text(1256, 598, "50 / 50 validation requests | 0 errors", { size: 14, fill: C.muted, anchor: "middle" })}

  <!-- Policy and result -->
  ${text(42, 678, "Safety policy and measured evidence", { size: 23, weight: 800 })}
  ${box(42, 697, 1452, 111, { fill: C.white, stroke: C.border, radius: 10, shadow: false })}
  ${[
    ["min / max", "3 / 4", C.blue],
    ["cooldown", "2,400 s", C.purple],
    ["stabilization", "2,400 s", C.cyan],
    ["scale-down", "1 pod / 300 s", C.amber],
    ["Service gate", "Ready only", C.green],
  ]
    .map(([label, value, color], index) => {
      const x = 62 + index * 284;
      return `${text(x, 731, label, { size: 13, weight: 800, fill: color })}${text(x, 771, value, { size: 25, weight: 800 })}`;
    })
    .join("")}

  ${box(42, 831, 1452, 76, { fill: C.amberBg, stroke: C.amber, radius: 10, shadow: false })}
  ${text(69, 863, "Experiment boundary", { size: 18, weight: 800, fill: C.amber })}
  ${text(263, 863, "Pod elasticity on pre-provisioned GPU capacity; node provisioning was validated separately and not measured here.", { size: 16, weight: 700 })}
  ${text(263, 888, "Without the spare: Pending pod → Cluster Autoscaler + EKS Managed Node Group, or Karpenter → GPU initialization → model loading.", { size: 15, fill: C.muted, weight: 650 })}

  ${box(42, 927, 1452, 62, { fill: C.greenBg, stroke: C.green, radius: 10, shadow: false })}
  ${text(69, 964, "Takeaway", { size: 18, weight: 800, fill: C.green })}
  ${text(177, 964, "KEDA converted queue pressure into a fourth ready replica; the spare GPU removed infrastructure delay, not the 8.3-minute model cold start.", { size: 16, weight: 750 })}
</svg>`;

fs.writeFileSync(svgPath, svg);

const conversion = spawnSync(
  "rsvg-convert",
  ["-w", "1536", "-h", "1024", "-o", pngPath, svgPath],
  { encoding: "utf-8" },
);

if (conversion.status !== 0) {
  throw new Error(
    `rsvg-convert failed: ${conversion.stderr || "install librsvg to render the PNG"}`,
  );
}

console.log(`SVG: ${svgPath}`);
console.log(`PNG: ${pngPath}`);
