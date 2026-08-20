import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "assets");
const svgPath = path.join(assets, "vllm-vs-tensorrt-llm-h100.svg");
const pngPath = path.join(assets, "vllm-vs-tensorrt-llm-h100.png");

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

function arrow(x1, y1, x2, y2, color = C.blue) {
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
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3"/><polygon points="${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}" fill="${color}"/>`;
}

function statusPill(x, y, label, tone = "good") {
  const fill = tone === "good" ? C.greenBg : tone === "bad" ? C.redBg : C.amberBg;
  const stroke = tone === "good" ? C.green : tone === "bad" ? C.red : C.amber;
  return [
    box(x, y, 118, 32, { fill, stroke, radius: 16, shadow: false }),
    text(x + 59, y + 22, label, {
      size: 14,
      weight: 800,
      fill: stroke,
      anchor: "middle",
    }),
  ].join("");
}

function gpu(x, y, accent, label = "H100 80 GiB") {
  return [
    box(x, y, 164, 92, { fill: C.white, stroke: accent, radius: 10 }),
    `<rect x="${x + 15}" y="${y + 17}" width="42" height="42" rx="8" fill="${accent}" opacity="0.12" stroke="${accent}" stroke-width="2"/>`,
    `<path d="M${x + 25} ${y + 27}h22v22h-22z M${x + 29} ${y + 22}v5 M${x + 38} ${y + 22}v5 M${x + 47} ${y + 22}v5 M${x + 29} ${y + 49}v5 M${x + 38} ${y + 49}v5 M${x + 47} ${y + 49}v5" fill="none" stroke="${accent}" stroke-width="2"/>`,
    text(x + 69, y + 36, label, { size: 15, weight: 800 }),
    text(x + 69, y + 59, "TP=1", { size: 13, weight: 700, fill: C.muted }),
    text(x + 82, y + 79, "1 dedicated GPU", {
      size: 12,
      fill: C.muted,
      anchor: "middle",
    }),
  ].join("");
}

function softwareStack(x, y, width, accent, lines) {
  return [
    box(x, y, width, 92, { fill: C.white, stroke: accent, radius: 10 }),
    text(x + 18, y + 27, lines[0], { size: 16, weight: 800, fill: accent }),
    text(x + 18, y + 51, lines[1], { size: 14, weight: 700 }),
    text(x + 18, y + 73, lines[2], { size: 12, fill: C.muted }),
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

  ${text(768, 48, "vLLM vs TensorRT-LLM on H100", {
    size: 40,
    weight: 800,
    anchor: "middle",
  })}
  ${text(768, 80, "Qwen3.6 27B BF16 | same p5.48xlarge Spot node | controlled A/B/B/A replay", {
    size: 20,
    weight: 650,
    fill: C.muted,
    anchor: "middle",
  })}

  <!-- Request and evidence flow -->
  ${box(44, 103, 205, 66, { stroke: C.amber })}
  ${text(146, 130, "1  AIPerf 0.11", { size: 18, weight: 800, anchor: "middle" })}
  ${text(146, 153, "c=8 | n=200 per arm", { size: 13, fill: C.muted, anchor: "middle" })}
  ${arrow(258, 136, 319, 136, C.amber)}
  ${box(328, 103, 222, 66, { stroke: C.cyan })}
  ${text(439, 130, "2  Direct Service", { size: 18, weight: 800, anchor: "middle" })}
  ${text(439, 153, "no llm-d in either arm", { size: 13, fill: C.muted, anchor: "middle" })}
  ${arrow(559, 136, 620, 136, C.cyan)}
  ${box(629, 103, 232, 66, { stroke: C.purple })}
  ${text(745, 130, "3  Runtime API", { size: 18, weight: 800, anchor: "middle" })}
  ${text(745, 153, "one endpoint under load", { size: 13, fill: C.muted, anchor: "middle" })}
  ${arrow(870, 136, 931, 136, C.purple)}
  ${box(940, 103, 222, 66, { stroke: C.green })}
  ${text(1051, 130, "4  Dedicated H100", { size: 18, weight: 800, anchor: "middle" })}
  ${text(1051, 153, "BF16 model, TP=1", { size: 13, fill: C.muted, anchor: "middle" })}
  ${arrow(1171, 136, 1232, 136, C.green)}
  ${box(1241, 103, 251, 66, { stroke: C.blue })}
  ${text(1367, 130, "5  Evidence", { size: 18, weight: 800, anchor: "middle" })}
  ${text(1367, 153, "AIPerf + Prometheus + DCGM", { size: 13, fill: C.muted, anchor: "middle" })}

  ${box(44, 186, 1448, 48, { fill: C.amberBg, stroke: C.amber, radius: 9, shadow: false })}
  ${text(768, 216, "8-H100 P5 node | 2 GPUs benchmarked: 1 vLLM + 1 TensorRT-LLM | 6 excluded | identical fixed-output replay", {
    size: 15,
    weight: 700,
    anchor: "middle",
  })}

  <!-- vLLM -->
  ${box(32, 256, 724, 286, { fill: C.faint, stroke: C.blue, strokeWidth: 3, radius: 16 })}
  ${text(58, 292, "A. vLLM 0.24.0", { size: 28, weight: 800 })}
  ${statusPill(612, 270, "SERVED", "good")}
  ${text(58, 318, "Direct OpenAI-compatible endpoint", { size: 15, fill: C.muted, weight: 650 })}
  ${gpu(58, 342, C.blue)}
  ${softwareStack(244, 342, 272, C.blue, [
    "Serving runtime",
    "vLLM engine",
    "BF16 checkpoint | prefix cache on",
  ])}
  ${softwareStack(534, 342, 194, C.green, [
    "GPU evidence",
    "70.54 GiB FB",
    "~530 W peak | 100% util",
  ])}
  ${box(58, 454, 670, 66, { fill: C.white, stroke: C.blue, radius: 9, shadow: false })}
  ${text(170, 482, "344.80 tok/s", { size: 20, weight: 800, fill: C.blue, anchor: "middle" })}
  ${text(394, 482, "160.18 ms TTFT", { size: 20, weight: 800, fill: C.ink, anchor: "middle" })}
  ${text(616, 482, "22.00 ms ITL", { size: 20, weight: 800, fill: C.ink, anchor: "middle" })}
  ${text(393, 505, "400 / 400 measured requests succeeded", { size: 13, fill: C.muted, anchor: "middle" })}

  <!-- TensorRT-LLM -->
  ${box(780, 256, 724, 286, { fill: C.faint, stroke: C.purple, strokeWidth: 3, radius: 16 })}
  ${text(806, 292, "B. TensorRT-LLM 1.3.0rc24", { size: 28, weight: 800 })}
  ${statusPill(1360, 270, "SERVED", "good")}
  ${text(806, 318, "PyTorch backend; Qwen3.6 AutoDeploy path unavailable", { size: 15, fill: C.red, weight: 700 })}
  ${gpu(806, 342, C.purple)}
  ${softwareStack(992, 342, 272, C.purple, [
    "Serving runtime",
    "trtllm-serve",
    "--backend pytorch | BF16 checkpoint",
  ])}
  ${softwareStack(1282, 342, 194, C.green, [
    "GPU evidence",
    "73.50 GiB FB",
    "~533 W peak | 100% util",
  ])}
  ${box(806, 454, 670, 66, { fill: C.white, stroke: C.purple, radius: 9, shadow: false })}
  ${text(918, 482, "346.11 tok/s", { size: 20, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(1142, 482, "254.20 ms TTFT", { size: 20, weight: 800, fill: C.red, anchor: "middle" })}
  ${text(1364, 482, "21.11 ms ITL", { size: 20, weight: 800, fill: C.green, anchor: "middle" })}
  ${text(1141, 505, "400 / 400 measured requests succeeded", { size: 13, fill: C.muted, anchor: "middle" })}

  <!-- Compatibility gate -->
  ${text(44, 577, "Compatibility gate before benchmarking", { size: 22, weight: 800 })}
  ${box(44, 594, 699, 68, { fill: C.redBg, stroke: C.red, radius: 10, shadow: false })}
  ${statusPill(61, 612, "BLOCKED", "bad")}
  ${multiline(201, 620, [
    "Compressed-tensors FP8 failed before readiness.",
    "Qwen hybrid scale layout mismatch: 5120 vs 48.",
  ], { size: 14, weight: 700, fill: C.red, lineHeight: 21 })}
  ${box(769, 594, 723, 68, { fill: C.greenBg, stroke: C.green, radius: 10, shadow: false })}
  ${statusPill(786, 612, "SERVED", "good")}
  ${multiline(926, 620, [
    "BF16 removed the checkpoint-format variable.",
    "H100 capacity was not the FP8 compatibility blocker.",
  ], { size: 14, weight: 700, fill: C.green, lineHeight: 21 })}

  <!-- Results table -->
  ${text(44, 699, "Steady-state A/B/B/A result", { size: 22, weight: 800 })}
  ${text(1492, 699, "Two measured arms per runtime | higher throughput is better | lower latency is better", {
    size: 13,
    fill: C.muted,
    anchor: "end",
  })}
  ${box(44, 715, 1448, 210, { fill: C.white, stroke: "#7a8baa", radius: 10, shadow: false })}
  <rect x="44" y="715" width="1448" height="35" rx="10" fill="${C.ink}"/>
  ${text(70, 739, "Metric", { size: 14, weight: 800, fill: C.white })}
  ${text(631, 739, "vLLM", { size: 14, weight: 800, fill: C.white, anchor: "middle" })}
  ${text(954, 739, "TensorRT-LLM", { size: 14, weight: 800, fill: C.white, anchor: "middle" })}
  ${text(1332, 739, "TensorRT-LLM delta", { size: 14, weight: 800, fill: C.white, anchor: "middle" })}
  <line x1="414" y1="715" x2="414" y2="925" stroke="#b9c3d3"/>
  <line x1="792" y1="715" x2="792" y2="925" stroke="#b9c3d3"/>
  <line x1="1116" y1="715" x2="1116" y2="925" stroke="#b9c3d3"/>
  ${[
    ["Output throughput", "344.80 tok/s", "346.11 tok/s", "+0.38% | effectively similar", C.muted],
    ["Mean TTFT", "160.18 ms", "254.20 ms", "+58.70% | worse", C.red],
    ["p99 TTFT", "241.34 ms", "299.17 ms", "+23.96% | worse", C.red],
    ["Mean time to second token", "29.40 ms", "27.41 ms", "-6.77% | better", C.green],
    ["Mean ITL", "22.00 ms", "21.11 ms", "-4.04% | better", C.green],
    ["Mean E2E", "2953.65 ms", "2934.69 ms", "-0.64% | effectively similar", C.muted],
  ]
    .map((row, index) => {
      const y = 778 + index * 29;
      const shade = index % 2 === 0 ? "#f7f9fc" : C.white;
      return `<rect x="45" y="${y - 21}" width="1446" height="29" fill="${shade}"/>${text(70, y, row[0], { size: 13, weight: 700 })}${text(631, y, row[1], { size: 13, anchor: "middle" })}${text(954, y, row[2], { size: 13, anchor: "middle" })}${text(1332, y, row[3], { size: 13, anchor: "middle", weight: 700, fill: row[4] })}`;
    })
    .join("")}

  ${box(44, 944, 1448, 56, { fill: C.amberBg, stroke: C.amber, radius: 10, shadow: false })}
  ${text(70, 978, "Takeaway", { size: 18, weight: 800 })}
  ${text(180, 968, "Runtime swap held throughput and E2E nearly flat; TensorRT-LLM improved token cadence slightly but worsened TTFT.", { size: 15, weight: 700 })}
  ${text(180, 989, "AutoDeploy graph compilation was unavailable for this Qwen3.6 checkpoint in the evaluated release.", { size: 15, weight: 700 })}
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
