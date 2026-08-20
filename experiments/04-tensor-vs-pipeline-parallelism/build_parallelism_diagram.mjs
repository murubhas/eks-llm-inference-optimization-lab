import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "assets");
const svgPath = path.join(assets, "qwen36-g7-inter-node-parallelism.svg");
const pngPath = path.join(assets, "qwen36-g7-inter-node-parallelism.png");

fs.mkdirSync(assets, { recursive: true });

const C = {
  ink: "#14213d",
  muted: "#506079",
  faint: "#f7f9fc",
  line: "#263d78",
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
    family = "Chalkboard SE, Comic Sans MS, ui-rounded, sans-serif",
    opacity = 1,
  } = options;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${esc(value)}</text>`;
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

function line(x1, y1, x2, y2, options = {}) {
  const {
    stroke = C.blue,
    width = 3,
    dash = "",
    arrow = true,
    both = false,
  } = options;

  const arrowHead = (fromX, fromY, tipX, tipY) => {
    const dx = tipX - fromX;
    const dy = tipY - fromY;
    const length = Math.hypot(dx, dy) || 1;
    const unitX = dx / length;
    const unitY = dy / length;
    const size = 10;
    const halfWidth = 5;
    const baseX = tipX - unitX * size;
    const baseY = tipY - unitY * size;
    const perpX = -unitY * halfWidth;
    const perpY = unitX * halfWidth;

    return `<polygon points="${tipX},${tipY} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}" fill="${stroke}"/>`;
  };

  const start = both ? arrowHead(x2, y2, x1, y1) : "";
  const end = arrow ? arrowHead(x1, y1, x2, y2) : "";
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>${start}${end}`;
}

function gpuNode(x, y, label, detail, accent = C.blue) {
  return [
    box(x, y, 176, 70, { fill: C.white, stroke: accent, radius: 10 }),
    `<rect x="${x + 12}" y="${y + 14}" width="38" height="38" rx="7" fill="${accent}" opacity="0.12" stroke="${accent}" stroke-width="2"/>`,
    `<path d="M${x + 22} ${y + 26}h18v18h-18z M${x + 26} ${y + 22}v4 M${x + 34} ${y + 22}v4 M${x + 42} ${y + 22}v4 M${x + 26} ${y + 44}v4 M${x + 34} ${y + 44}v4 M${x + 42} ${y + 44}v4" fill="none" stroke="${accent}" stroke-width="2"/>`,
    text(x + 60, y + 29, label, { size: 14, weight: 700 }),
    text(x + 60, y + 52, detail, { size: 12, fill: C.muted }),
  ].join("");
}

function statusPill(x, y, label, tone) {
  const fill = tone === "good" ? C.greenBg : tone === "bad" ? C.redBg : C.amberBg;
  const stroke = tone === "good" ? C.green : tone === "bad" ? C.red : C.amber;
  return [
    box(x, y, 112, 32, { fill, stroke, radius: 16, shadow: false }),
    text(x + 56, y + 22, label, { size: 14, weight: 700, fill: stroke, anchor: "middle" }),
  ].join("");
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  <defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#14213d" flood-opacity="0.12"/>
    </filter>
    <style>
      text { letter-spacing: 0; }
    </style>
  </defs>

  <rect width="1536" height="1024" fill="#fbfcfe"/>

  ${text(768, 49, "Tensor vs pipeline parallelism on Amazon EKS", { size: 40, weight: 800, anchor: "middle" })}
  ${text(768, 83, "Qwen3.6 27B FP8 on the same four g7.2xlarge Spot nodes", { size: 21, weight: 650, fill: C.muted, anchor: "middle" })}

  ${box(52, 103, 206, 68, { fill: C.white, stroke: C.amber })}
  ${text(155, 131, "1  AIPerf 0.11", { size: 19, weight: 800, anchor: "middle" })}
  ${text(155, 154, "c=8  n=200  fixed output", { size: 13, fill: C.muted, anchor: "middle" })}
  ${line(266, 137, 340, 137, { stroke: C.amber })}
  ${box(348, 103, 230, 68, { fill: C.white, stroke: C.cyan })}
  ${text(463, 131, "2  Kubernetes Service", { size: 18, weight: 800, anchor: "middle" })}
  ${text(463, 154, "direct path; no llm-d", { size: 13, fill: C.muted, anchor: "middle" })}
  ${line(586, 137, 660, 137, { stroke: C.cyan })}
  ${box(668, 103, 236, 68, { fill: C.white, stroke: C.purple })}
  ${text(786, 131, "3  Ready API head", { size: 18, weight: 800, anchor: "middle" })}
  ${text(786, 154, "selects one logical replica", { size: 13, fill: C.muted, anchor: "middle" })}
  ${box(942, 103, 542, 68, { fill: C.amberBg, stroke: C.amber, radius: 10 })}
  ${text(1213, 129, "Controlled boundary", { size: 17, weight: 800, fill: C.ink, anchor: "middle" })}
  ${text(1213, 153, "same 4 nodes and cost | max-num-seqs=1 | NCCL NET/Socket", { size: 14, fill: C.muted, anchor: "middle" })}

  <!-- TP=2 card -->
  ${box(25, 197, 482, 365, { fill: C.faint, stroke: C.green, strokeWidth: 3, radius: 16 })}
  ${text(48, 231, "A. TP=2", { size: 27, weight: 800 })}
  ${text(48, 258, "2 logical replicas | 2 nodes each", { size: 16, weight: 650, fill: C.muted })}
  ${statusPill(374, 211, "SERVED", "good")}
  ${text(52, 288, "Replica A", { size: 15, weight: 800, fill: C.green })}
  ${gpuNode(52, 300, "N1 / rank 0", "half-layer tensor shard", C.green)}
  ${gpuNode(306, 300, "N2 / rank 1", "half-layer tensor shard", C.green)}
  ${line(230, 335, 300, 335, { stroke: C.green, both: true })}
  ${text(265, 322, "collective", { size: 11, weight: 700, fill: C.green, anchor: "middle" })}
  ${text(52, 392, "Replica B", { size: 15, weight: 800, fill: C.green })}
  ${gpuNode(52, 404, "N3 / rank 0", "half-layer tensor shard", C.green)}
  ${gpuNode(306, 404, "N4 / rank 1", "half-layer tensor shard", C.green)}
  ${line(230, 439, 300, 439, { stroke: C.green, both: true })}
  ${text(265, 426, "collective", { size: 11, weight: 700, fill: C.green, anchor: "middle" })}
  ${box(52, 491, 430, 51, { fill: C.greenBg, stroke: C.green, radius: 8, shadow: false })}
  ${multiline(267, 511, ["Every layer is split across 2 GPUs.", "Repeated cross-node collectives during inference."], { size: 13, weight: 650, fill: C.ink, anchor: "middle", lineHeight: 18 })}

  <!-- TP=4 card -->
  ${box(527, 197, 482, 365, { fill: C.faint, stroke: C.red, strokeWidth: 3, radius: 16 })}
  ${text(550, 231, "B. TP=4", { size: 27, weight: 800 })}
  ${text(550, 258, "1 logical replica | 4 nodes", { size: 16, weight: 650, fill: C.muted })}
  ${statusPill(876, 211, "BLOCKED", "bad")}
  ${gpuNode(551, 296, "N1 / rank 0", "quarter tensor shard", C.red)}
  ${gpuNode(809, 296, "N2 / rank 1", "quarter tensor shard", C.red)}
  ${gpuNode(551, 390, "N3 / rank 2", "quarter tensor shard", C.red)}
  ${gpuNode(809, 390, "N4 / rank 3", "quarter tensor shard", C.red)}
  ${line(728, 331, 802, 331, { stroke: C.red, both: true })}
  ${line(728, 425, 802, 425, { stroke: C.red, both: true })}
  ${line(640, 369, 640, 387, { stroke: C.red, both: true })}
  ${line(898, 369, 898, 387, { stroke: C.red, both: true })}
  ${box(551, 479, 434, 63, { fill: C.redBg, stroke: C.red, radius: 8, shadow: false })}
  ${multiline(768, 500, ["NCCL 4-rank group formed; endpoint did not.", "GDN FP8 shard width 24 failed 16-alignment."], { size: 13, weight: 700, fill: C.red, anchor: "middle", lineHeight: 19 })}

  <!-- PP=2 card -->
  ${box(1029, 197, 482, 365, { fill: C.faint, stroke: C.cyan, strokeWidth: 3, radius: 16 })}
  ${text(1052, 231, "C. PP=2", { size: 27, weight: 800 })}
  ${text(1052, 258, "2 logical replicas | 2 stages each", { size: 16, weight: 650, fill: C.muted })}
  ${statusPill(1378, 211, "SERVED", "good")}
  ${text(1054, 288, "Replica A", { size: 15, weight: 800, fill: C.cyan })}
  ${gpuNode(1054, 300, "N1 / stage 0", "first group of layers", C.cyan)}
  ${gpuNode(1308, 300, "N2 / stage 1", "remaining layers", C.cyan)}
  ${line(1232, 335, 1302, 335, { stroke: C.cyan })}
  ${text(1267, 321, "activations", { size: 11, weight: 700, fill: C.cyan, anchor: "middle" })}
  ${text(1054, 392, "Replica B", { size: 15, weight: 800, fill: C.cyan })}
  ${gpuNode(1054, 404, "N3 / stage 0", "first group of layers", C.cyan)}
  ${gpuNode(1308, 404, "N4 / stage 1", "remaining layers", C.cyan)}
  ${line(1232, 439, 1302, 439, { stroke: C.cyan })}
  ${text(1267, 425, "activations", { size: 11, weight: 700, fill: C.cyan, anchor: "middle" })}
  ${box(1054, 491, 430, 51, { fill: "#eafafd", stroke: C.cyan, radius: 8, shadow: false })}
  ${multiline(1269, 511, ["Whole layers stay intact on each stage.", "Activations cross one stage boundary."], { size: 13, weight: 650, fill: C.ink, anchor: "middle", lineHeight: 18 })}

  <!-- Platform and observability strip -->
  ${text(38, 593, "Shared platform and evidence path", { size: 20, weight: 800 })}
  ${box(31, 609, 1474, 87, { fill: C.white, stroke: "#7a8baa", radius: 12, dash: "8 6", shadow: false })}
  ${box(48, 625, 230, 53, { fill: C.white, stroke: C.amber, radius: 8, shadow: false })}
  ${text(163, 648, "FSx for Lustre", { size: 15, weight: 800, anchor: "middle" })}
  ${text(163, 668, "FP8 checkpoint, read-only", { size: 12, fill: C.muted, anchor: "middle" })}
  ${line(286, 651, 326, 651, { stroke: C.muted, dash: "5 5" })}
  ${box(334, 625, 240, 53, { fill: C.white, stroke: C.green, radius: 8, shadow: false })}
  ${text(454, 648, "NVIDIA GPU Operator", { size: 15, weight: 800, anchor: "middle" })}
  ${text(454, 668, "open driver 595 + DCGM", { size: 12, fill: C.muted, anchor: "middle" })}
  ${line(582, 651, 622, 651, { stroke: C.muted, dash: "5 5" })}
  ${box(630, 625, 224, 53, { fill: C.white, stroke: C.blue, radius: 8, shadow: false })}
  ${text(742, 648, "vLLM 0.24", { size: 15, weight: 800, anchor: "middle" })}
  ${text(742, 668, "mp executor + NCCL 2.28", { size: 12, fill: C.muted, anchor: "middle" })}
  ${line(862, 651, 902, 651, { stroke: C.muted, dash: "5 5" })}
  ${box(910, 625, 250, 53, { fill: C.white, stroke: C.purple, radius: 8, shadow: false })}
  ${text(1035, 648, "Standard network", { size: 15, weight: 800, anchor: "middle" })}
  ${text(1035, 668, "NET/Socket on eth0; no EFA", { size: 12, fill: C.muted, anchor: "middle" })}
  ${line(1168, 651, 1208, 651, { stroke: C.muted, dash: "5 5" })}
  ${box(1216, 625, 270, 53, { fill: C.white, stroke: C.cyan, radius: 8, shadow: false })}
  ${text(1351, 648, "Prometheus + Grafana", { size: 15, weight: 800, anchor: "middle" })}
  ${text(1351, 668, "ServiceMonitor and DCGM", { size: 12, fill: C.muted, anchor: "middle" })}

  <!-- Results table -->
  ${text(38, 728, "Fixed-output saturation result", { size: 22, weight: 800 })}
  ${text(1498, 728, "200 requests | ISL 256 | OSL 128 | streaming", { size: 14, fill: C.muted, anchor: "end" })}
  ${box(31, 743, 1474, 179, { fill: C.white, stroke: "#7a8baa", radius: 10, shadow: false })}
  <rect x="31" y="743" width="1474" height="35" rx="10" fill="${C.ink}"/>
  ${text(55, 767, "Metric", { size: 14, weight: 800, fill: C.white })}
  ${text(582, 767, "TP=2", { size: 14, weight: 800, fill: C.white, anchor: "middle" })}
  ${text(836, 767, "TP=4", { size: 14, weight: 800, fill: C.white, anchor: "middle" })}
  ${text(1088, 767, "PP=2", { size: 14, weight: 800, fill: C.white, anchor: "middle" })}
  ${text(1380, 767, "PP=2 vs TP=2", { size: 14, weight: 800, fill: C.white, anchor: "middle" })}
  <line x1="430" y1="743" x2="430" y2="922" stroke="#b9c3d3"/>
  <line x1="708" y1="743" x2="708" y2="922" stroke="#b9c3d3"/>
  <line x1="962" y1="743" x2="962" y2="922" stroke="#b9c3d3"/>
  <line x1="1238" y1="743" x2="1238" y2="922" stroke="#b9c3d3"/>
  ${[
    ["Successful requests", "200 / 200", "not served", "200 / 200", "--"],
    ["Output throughput", "46.98 tok/s", "--", "47.60 tok/s", "+1.31%"],
    ["Average TTFT", "16.44 s", "--", "16.13 s", "-1.87%"],
    ["p99 TTFT", "33.78 s", "--", "36.28 s", "+7.41%"],
    ["p99 E2E / average ITL", "38.43 s / 36.84 ms", "--", "41.35 s / 39.90 ms", "+7.60% / +8.31%"],
  ]
    .map((row, index) => {
      const y = 804 + index * 27;
      const shade = index % 2 === 0 ? "#f7f9fc" : C.white;
      return `<rect x="32" y="${y - 20}" width="1472" height="27" fill="${shade}"/>${text(55, y, row[0], { size: 13, weight: 700 })}${text(582, y, row[1], { size: 13, anchor: "middle" })}${text(836, y, row[2], { size: 13, anchor: "middle", fill: row[2] === "not served" ? C.red : C.muted, weight: row[2] === "not served" ? 700 : 500 })}${text(1088, y, row[3], { size: 13, anchor: "middle" })}${text(1380, y, row[4], { size: 13, anchor: "middle", weight: 700, fill: index === 1 || index === 2 ? C.green : index === 0 ? C.muted : C.red })}`;
    })
    .join("")}

  ${box(31, 942, 1474, 57, { fill: C.amberBg, stroke: C.amber, radius: 10, shadow: false })}
  ${text(58, 976, "Takeaway", { size: 18, weight: 800, fill: C.ink })}
  ${text(170, 976, "PP=2 preserved whole tensor shapes and served. Throughput matched TP=2; tail latency was worse. TP=4 is a compatibility result, not a performance result.", { size: 15, weight: 650, fill: C.ink })}
</svg>`;

fs.writeFileSync(svgPath, svg);
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);

console.log(`SVG: ${svgPath}`);
console.log(`PNG: ${pngPath}`);
