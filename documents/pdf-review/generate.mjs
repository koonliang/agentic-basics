import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(root, "assets");
const pdfDir = path.join(root, "pdfs");

const PAGE = { width: 595.28, height: 841.89 };
const COLORS = {
  navy: "#183153",
  blue: "#2E6FD8",
  paleBlue: "#EAF2FF",
  teal: "#177E89",
  paleTeal: "#E8F6F4",
  green: "#237A57",
  paleGreen: "#E8F5EE",
  amber: "#B96B16",
  paleAmber: "#FFF2DE",
  red: "#B33A3A",
  paleRed: "#FCE9E9",
  ink: "#243142",
  muted: "#667386",
  line: "#D9E0E8",
  white: "#FFFFFF",
  paper: "#FAFBFD",
};

const RETURN_TABLE = {
  headers: ["Product", "Region", "Return window", "Processing fee", "Evidence", "Resolution"],
  rows: [
    ["Electronics", "SG", "30 days", "10% if opened", "Serial + photo", "Refund"],
    ["Electronics", "AU", "30 days", "None", "Receipt", "Refund or replacement"],
    ["Home appliances", "SG", "21 days", "15% if installed", "Installation report", "Warranty review"],
    ["Furniture", "SG", "14 days", "20% if assembled", "Delivery photos", "Refund"],
    ["Wearables", "AU", "30 days", "None", "Device diagnostic", "Refund or replacement"],
    ["Clearance items", "All", "Final sale", "N/A", "Safety evidence", "Safety review only"],
  ],
};

const documents = [
  {
    filename: "sg-refund-policy-current.pdf",
    id: "POL-SG-REF-2026",
    title: "Singapore Refund Policy",
    subtitle: "Delivered, damaged, and cancellation requests",
    region: "Singapore",
    version: "3.2",
    effective: "1 September 2026",
    status: "CURRENT",
    accent: COLORS.blue,
    pages: [
      {
        heading: "Purpose and scope",
        lead: "This policy governs refund decisions for orders fulfilled to Singapore delivery addresses.",
        sections: [
          ["Principles", "Verify the order record, delivery state, customer identity, and case notes before making a recommendation. Never infer missing dates."],
          ["Evidence", "Accept clear photographs, delivery-partner damage annotations, or an assessment recorded by an approved service centre."],
          ["Ownership", "Frontline support may apply the standard outcomes in this policy. Exceptions require Support Operations approval."],
        ],
        note: "The eligibility thresholds are presented in the decision flow on the next page.",
      },
      {
        heading: "Damaged-delivery eligibility",
        lead: "Use the decision flow after confirming that the order was delivered and the reported item matches the order record.",
        visual: "sg-refund-current-flow",
        caption: "Figure 1. Current damaged-delivery eligibility decision flow.",
      },
      {
        heading: "Operational checklist",
        lead: "Complete each check before communicating a final outcome to the customer.",
        sections: [
          ["1. Verify", "Confirm order ID, customer, delivery date, report date, and affected item."],
          ["2. Record", "Attach the evidence and summarize the damage without adding unsupported conclusions."],
          ["3. Resolve", "Apply the outcome from Figure 1 and record the policy version used."],
          ["4. Escalate", "Send ambiguous evidence, suspected misuse, or safety issues to Support Operations."],
        ],
      },
    ],
  },
  {
    filename: "sg-refund-policy-superseded.pdf",
    id: "POL-SG-REF-2025",
    title: "Singapore Refund Policy",
    subtitle: "Archived damaged-delivery rules",
    region: "Singapore",
    version: "2.4",
    effective: "15 January 2025",
    status: "SUPERSEDED",
    accent: COLORS.red,
    pages: [
      {
        heading: "Archived policy notice",
        lead: "This document was replaced on 1 September 2026 and must not be used for new support decisions.",
        banner: "SUPERSEDED — retained only for retrieval and version-filtering exercises",
        sections: [
          ["Historical scope", "This version applied to Singapore deliveries handled under the former returns workflow."],
          ["Do not apply", "Use the current policy for all cases assessed on or after 1 September 2026."],
        ],
      },
      {
        heading: "Former damaged-delivery flow",
        lead: "The archived decision flow below is intentionally retained as a conflicting retrieval distractor.",
        visual: "sg-refund-superseded-flow",
        caption: "Figure 1. Superseded damaged-delivery decision flow.",
      },
    ],
  },
  {
    filename: "au-refund-policy-current.pdf",
    id: "POL-AU-REF-2026",
    title: "Australia Refund Policy",
    subtitle: "Damaged-item resolution matrix",
    region: "Australia",
    version: "4.0",
    effective: "1 July 2026",
    status: "CURRENT",
    accent: COLORS.teal,
    pages: [
      {
        heading: "Regional application",
        lead: "Use this policy only for orders delivered to Australian addresses.",
        sections: [
          ["Required checks", "Verify delivery, item identity, reported condition, report date, and available evidence."],
          ["Customer choice", "Where the matrix offers more than one remedy, record the customer's selected option."],
          ["Safety issues", "Do not wait for ordinary review when the report describes smoke, overheating, electric shock, or fire."],
        ],
        note: "Exact eligibility windows and remedies appear only in the visual matrix on page 2.",
      },
      {
        heading: "Resolution matrix",
        lead: "Match the verified issue category and reporting window to the approved outcome.",
        visual: "au-refund-matrix",
        caption: "Figure 1. Australia damaged-item resolution matrix.",
      },
    ],
  },
  {
    filename: "shipping-investigation-guide.pdf",
    id: "OPS-SHIP-2026",
    title: "Shipping Investigation Guide",
    subtitle: "When and how to open a delivery investigation",
    region: "Global",
    version: "2.1",
    effective: "20 August 2026",
    status: "CURRENT",
    accent: COLORS.amber,
    pages: [
      {
        heading: "Investigation scope",
        lead: "Use this guide for orders that remain in transit after the estimated delivery date or appear stalled in carrier tracking.",
        sections: [
          ["Before the threshold", "Reconfirm the delivery address and ask the customer to monitor carrier tracking."],
          ["At the threshold", "Open the appropriate carrier investigation and provide its reference number."],
          ["Refund decisions", "An investigation does not by itself establish refund eligibility. Apply the relevant regional refund policy."],
        ],
      },
      {
        heading: "Escalation timeline",
        lead: "Select the route based on shipment type and elapsed time after the estimated delivery date.",
        visual: "shipping-timeline",
        caption: "Figure 1. Investigation and lost-parcel escalation timeline.",
      },
      {
        heading: "Investigation record",
        lead: "Every investigation should leave enough evidence for another agent to continue the case.",
        sections: [
          ["Required fields", "Order ID, carrier, tracking number, estimated delivery date, last scan, route, and customer contact date."],
          ["Customer update", "Explain what was opened, when the next update is expected, and what remains undecided."],
          ["Closure", "Record the carrier result and link any later refund or replacement decision to its governing policy."],
        ],
      },
    ],
  },
  {
    filename: "product-warranty-guide.pdf",
    id: "POL-WAR-2026",
    title: "Product Warranty Guide",
    subtitle: "Coverage classification for support teams",
    region: "Global",
    version: "1.8",
    effective: "10 June 2026",
    status: "CURRENT",
    accent: COLORS.green,
    pages: [
      {
        heading: "Warranty assessment",
        lead: "Use the purchase date, product category, reported symptom, and evidence to select a coverage path.",
        sections: [
          ["Evidence", "Request a serial number, proof of purchase, and photographs when the condition is visible."],
          ["Exclusions", "Normal wear and unauthorized modification require manual review and are not automatically covered."],
          ["Relationship to refunds", "Warranty coverage does not replace a valid regional damaged-delivery remedy."],
        ],
      },
      {
        heading: "Coverage map",
        lead: "The visual map contains the standard coverage periods and default outcomes by issue type.",
        visual: "warranty-map",
        caption: "Figure 1. Standard warranty coverage map.",
      },
    ],
  },
  {
    filename: "support-escalation-guide.pdf",
    id: "OPS-ESC-2026",
    title: "Support Escalation Guide",
    subtitle: "Severity, ownership, and response targets",
    region: "Global",
    version: "3.0",
    effective: "5 September 2026",
    status: "CURRENT",
    accent: COLORS.navy,
    pages: [
      {
        heading: "Escalation principles",
        lead: "Escalate when impact, safety, legal exposure, or repeated operational failure exceeds frontline authority.",
        sections: [
          ["Evidence first", "Record verified facts separately from customer claims and agent assumptions."],
          ["Clear ownership", "Assign one accountable queue and record the next update time."],
          ["No silent downgrade", "A severity may be lowered only when new evidence removes the triggering condition."],
        ],
      },
      {
        heading: "Severity routing chart",
        lead: "Use the chart to identify ownership and the initial-response target.",
        visual: "escalation-chart",
        caption: "Figure 1. Support severity and routing chart.",
      },
    ],
  },
  {
    filename: "return-processing-table-native.pdf",
    id: "TEST-TABLE-NATIVE",
    title: "Return Processing Matrix",
    subtitle: "Table-extraction comparison fixture",
    region: "Global",
    version: "1.0",
    effective: "1 September 2026",
    status: "TEST FIXTURE",
    accent: COLORS.blue,
    pages: [
      {
        heading: "Return-processing lookup",
        lead: "Use the product and region columns together to identify the applicable processing rule.",
        table: RETURN_TABLE,
        caption: "Table 1. Return-processing rules.",
      },
    ],
  },
  {
    filename: "return-processing-table-image.pdf",
    id: "TEST-TABLE-IMAGE",
    title: "Return Processing Matrix",
    subtitle: "Table-extraction comparison fixture",
    region: "Global",
    version: "1.0",
    effective: "1 September 2026",
    status: "TEST FIXTURE",
    accent: COLORS.blue,
    pages: [
      {
        heading: "Return-processing lookup",
        lead: "Use the product and region columns together to identify the applicable processing rule.",
        visual: "return-processing-table",
        caption: "Table 1. Return-processing rules.",
      },
    ],
  },
];

await mkdir(assetsDir, { recursive: true });
await mkdir(pdfDir, { recursive: true });

const visuals = createVisuals();
for (const [name, svg] of Object.entries(visuals)) {
  await writeFile(path.join(assetsDir, `${name}.svg`), svg);
  await sharp(Buffer.from(svg))
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .png()
    .toFile(path.join(assetsDir, `${name}.png`));
}

for (const spec of documents) {
  await buildPdf(spec);
}

await writeFile(
  path.join(root, "catalog.json"),
  `${JSON.stringify(documents.map(({ filename, id, title, region, version, effective, status, pages }) => ({
    id,
    filename: `pdfs/${filename}`,
    title,
    region,
    version,
    effective,
    status: status.toLowerCase(),
    pages: pages.length,
  })), null, 2)}\n`,
);

console.log(`Generated ${documents.length} PDFs in ${pdfDir}`);

async function buildPdf(spec) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(spec.title);
  pdf.setSubject(spec.subtitle);
  pdf.setAuthor("Agentic AI Basics — synthetic training fixture");
  pdf.setKeywords(["synthetic", "training", "policy", spec.region]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (let index = 0; index < spec.pages.length; index += 1) {
    const content = spec.pages[index];
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    drawShell(page, spec, index + 1, spec.pages.length, regular, bold);
    drawPageContent(page, content, spec.accent, regular, bold);
    if (content.table) {
      drawNativeTable(page, content.table, content.caption, spec.accent, regular, bold);
    }
    if (content.visual) {
      const bytes = await sharp(Buffer.from(visuals[content.visual]))
        .flatten({ background: "#ffffff" })
        .removeAlpha()
        .png()
        .toBuffer();
      const image = await pdf.embedPng(bytes);
      const maxWidth = 499;
      const maxHeight = 390;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
      page.drawImage(image, {
        x: 48,
        y: 254,
        width: image.width * scale,
        height: image.height * scale,
      });
      page.drawText(content.caption, {
        x: 48,
        y: 230,
        size: 9.5,
        font: regular,
        color: hex(COLORS.muted),
      });
      page.drawText("Visual content contains policy facts not repeated in selectable text.", {
        x: 48,
        y: 206,
        size: 9,
        font: regular,
        color: hex(spec.accent),
      });
    }
  }

  await writeFile(path.join(pdfDir, spec.filename), await pdf.save({ useObjectStreams: false }));
}

function drawShell(page, spec, pageNumber, totalPages, regular, bold) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: hex(COLORS.paper) });
  page.drawRectangle({ x: 0, y: PAGE.height - 12, width: PAGE.width, height: 12, color: hex(spec.accent) });
  page.drawText("NORTHSTAR COMMERCE", { x: 48, y: 792, size: 10, font: bold, color: hex(spec.accent) });
  page.drawText("SYNTHETIC TRAINING DOCUMENT", { x: 383, y: 792, size: 8, font: bold, color: hex(COLORS.muted) });
  page.drawLine({ start: { x: 48, y: 777 }, end: { x: 547, y: 777 }, thickness: 1, color: hex(COLORS.line) });

  page.drawLine({ start: { x: 48, y: 55 }, end: { x: 547, y: 55 }, thickness: 1, color: hex(COLORS.line) });
  page.drawText(`${spec.id}  •  v${spec.version}  •  Effective ${spec.effective}`, {
    x: 48,
    y: 35,
    size: 8.5,
    font: regular,
    color: hex(COLORS.muted),
  });
  page.drawText(`Page ${pageNumber} of ${totalPages}`, { x: 487, y: 35, size: 8.5, font: regular, color: hex(COLORS.muted) });
}

function drawPageContent(page, content, accent, regular, bold) {
  page.drawText(content.heading, { x: 48, y: 735, size: 25, font: bold, color: hex(COLORS.ink) });
  drawWrapped(page, content.lead, 48, 704, 499, 11.5, 17, regular, COLORS.muted);

  if (content.banner) {
    page.drawRectangle({ x: 48, y: 624, width: 499, height: 54, color: hex(COLORS.paleRed), borderColor: hex(COLORS.red), borderWidth: 1 });
    drawWrapped(page, content.banner, 64, 650, 467, 10.5, 15, bold, COLORS.red);
  }

  if (content.sections) {
    let y = content.banner ? 582 : 630;
    for (const [title, body] of content.sections) {
      page.drawRectangle({ x: 48, y: y - 72, width: 499, height: 82, color: rgb(1, 1, 1), borderColor: hex(COLORS.line), borderWidth: 0.8 });
      page.drawRectangle({ x: 48, y: y - 72, width: 5, height: 82, color: hex(accent) });
      page.drawText(title, { x: 68, y: y - 12, size: 12, font: bold, color: hex(accent) });
      drawWrapped(page, body, 68, y - 34, 455, 10.2, 14, regular, COLORS.ink);
      y -= 101;
    }
  }

  if (content.note) {
    page.drawRectangle({ x: 48, y: 112, width: 499, height: 62, color: hex(COLORS.paleBlue) });
    page.drawText("LOOK AHEAD", { x: 65, y: 150, size: 9, font: bold, color: hex(accent) });
    drawWrapped(page, content.note, 65, 130, 460, 10, 14, regular, COLORS.ink);
  }
}

function drawWrapped(page, text, x, y, maxWidth, size, lineHeight, font, color) {
  const words = text.split(/\s+/);
  let line = "";
  let cursor = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    page.drawText(line, { x, y: cursor, size, font, color: hex(color) });
    cursor -= lineHeight;
    line = word;
  }
  if (line) page.drawText(line, { x, y: cursor, size, font, color: hex(color) });
  return cursor - lineHeight;
}

function drawNativeTable(page, table, caption, accent, regular, bold) {
  const x = 48;
  const top = 640;
  const widths = [104, 43, 72, 83, 105, 92];
  const headerHeight = 40;
  const rowHeight = 58;

  let cursorY = top;
  drawPdfTableRow(page, table.headers, x, cursorY, widths, headerHeight, COLORS.navy, COLORS.white, bold, 7.2);
  cursorY -= headerHeight;

  table.rows.forEach((row, index) => {
    const fill = index === table.rows.length - 1
      ? COLORS.paleRed
      : index % 2 === 0 ? COLORS.white : COLORS.paleBlue;
    const color = index === table.rows.length - 1 ? COLORS.red : COLORS.ink;
    drawPdfTableRow(page, row, x, cursorY, widths, rowHeight, fill, color, regular, 7.5);
    cursorY -= rowHeight;
  });

  page.drawText(caption, { x, y: 230, size: 9.5, font: regular, color: hex(COLORS.muted) });
  page.drawText("Table cells are selectable PDF text.", { x, y: 206, size: 9, font: regular, color: hex(accent) });
}

function drawPdfTableRow(page, values, x, top, widths, height, fill, color, font, size) {
  let cursorX = x;
  values.forEach((value, index) => {
    page.drawRectangle({
      x: cursorX,
      y: top - height,
      width: widths[index],
      height,
      color: hex(fill),
      borderColor: hex(COLORS.line),
      borderWidth: 0.8,
    });
    drawWrapped(page, value, cursorX + 7, top - 18, widths[index] - 14, size, 10, font, color);
    cursorX += widths[index];
  });
}

function createVisuals() {
  return {
    "sg-refund-current-flow": svgCanvas(`
      ${svgTitle("CURRENT SG DECISION FLOW", "Use verified delivery and report dates")}
      ${box(40, 120, 250, 110, "ORDER DELIVERED?", "Confirm carrier status", COLORS.paleBlue, COLORS.blue)}
      ${arrow(290, 175, 355, 175, "YES")}
      ${box(355, 120, 305, 110, "DAMAGE EVIDENCE?", "Photo or approved assessment", COLORS.paleTeal, COLORS.teal)}
      ${arrow(507, 230, 507, 300, "YES")}
      ${diamond(375, 300, 265, 130, "REPORTED WITHIN", "30 DAYS", COLORS.paleAmber, COLORS.amber)}
      ${arrow(375, 365, 260, 365, "YES")}
      ${box(40, 320, 220, 95, "FULL REFUND", "Original payment method", COLORS.paleGreen, COLORS.green)}
      ${arrow(640, 365, 755, 365, "NO")}
      ${box(755, 320, 220, 95, "WARRANTY REVIEW", "No automatic refund", COLORS.paleRed, COLORS.red)}
      ${smallNote(40, 500, "In-transit orders: do not use this flow. Follow the shipping investigation guide.")}
    `),
    "sg-refund-superseded-flow": svgCanvas(`
      ${svgTitle("SUPERSEDED SG DECISION FLOW", "Archived version — do not use for current cases", COLORS.red)}
      ${box(65, 135, 270, 110, "DELIVERED + DAMAGED", "Evidence required", COLORS.paleRed, COLORS.red)}
      ${arrow(335, 190, 440, 190, "THEN")}
      ${diamond(440, 125, 280, 130, "REPORTED WITHIN", "14 DAYS", COLORS.paleAmber, COLORS.amber)}
      ${arrow(580, 255, 580, 335, "YES")}
      ${box(430, 335, 300, 100, "STORE CREDIT", "Former standard remedy", COLORS.paleRed, COLORS.red)}
      ${smallNote(65, 510, "This historical threshold conflicts with the current policy and is included as a version-filtering test.")}
    `),
    "au-refund-matrix": svgCanvas(`
      ${svgTitle("AU DAMAGED-ITEM RESOLUTION MATRIX", "Apply the row matching the verified issue category")}
      ${matrixRow(60, 130, "ISSUE", "REPORT WINDOW", "APPROVED OUTCOME", COLORS.navy, COLORS.white)}
      ${matrixRow(60, 210, "Minor cosmetic", "Within 14 days", "Exchange", COLORS.paleBlue, COLORS.ink)}
      ${matrixRow(60, 290, "Functional damage", "Within 30 days", "Refund or replacement", COLORS.paleGreen, COLORS.ink)}
      ${matrixRow(60, 370, "Safety defect", "Any time", "Immediate safety escalation", COLORS.paleRed, COLORS.red)}
      ${smallNote(60, 500, "If the issue category cannot be verified, request evidence before selecting a remedy.")}
    `),
    "shipping-timeline": svgCanvas(`
      ${svgTitle("DELIVERY INVESTIGATION TIMELINE", "Elapsed time is measured after the estimated delivery date")}
      ${timeline(95, 205, COLORS.blue, "DOMESTIC", ["ETA", "+2 business days", "+7 business days"], ["Monitor", "Open carrier case", "Escalate as potentially lost"])}
      ${timeline(95, 385, COLORS.amber, "INTERNATIONAL", ["ETA", "+5 business days", "+10 business days"], ["Monitor", "Open carrier case", "Escalate as potentially lost"])}
      ${smallNote(60, 555, "Carrier investigation timing does not automatically create refund eligibility.")}
    `),
    "warranty-map": svgCanvas(`
      ${svgTitle("STANDARD WARRANTY COVERAGE MAP", "Coverage begins on the recorded purchase date")}
      ${box(55, 145, 280, 120, "MANUFACTURING DEFECT", "12 months • Repair or replace", COLORS.paleGreen, COLORS.green)}
      ${box(365, 145, 280, 120, "BATTERY CAPACITY", "6 months • Diagnostic review", COLORS.paleBlue, COLORS.blue)}
      ${box(675, 145, 280, 120, "ACCIDENTAL DAMAGE", "Not covered • Paid service", COLORS.paleRed, COLORS.red)}
      ${box(90, 350, 400, 120, "SAFETY-RELATED FAILURE", "Escalate immediately", COLORS.paleAmber, COLORS.amber)}
      ${box(550, 350, 400, 120, "UNAUTHORIZED MODIFICATION", "Manual review required", "#F1EDF9", "#7251A3")}
    `),
    "escalation-chart": svgCanvas(`
      ${svgTitle("SUPPORT SEVERITY ROUTING", "Choose the highest applicable severity")}
      ${severityRow(60, 130, "S1", "Safety risk or widespread outage", "Duty manager", "Immediate", COLORS.red, COLORS.paleRed)}
      ${severityRow(60, 230, "S2", "Material impact; workaround limited", "Support Operations", "Within 4 hours", COLORS.amber, COLORS.paleAmber)}
      ${severityRow(60, 330, "S3", "Single-customer issue; workaround available", "Standard queue", "1 business day", COLORS.blue, COLORS.paleBlue)}
      ${smallNote(60, 500, "Record the triggering evidence and next update time before handing off ownership.")}
    `),
    "return-processing-table": svgCanvas(`
      ${svgTitle("RETURN PROCESSING MATRIX", "Match product and region before selecting a rule")}
      ${svgTable(RETURN_TABLE)}
    `),
  };
}

function svgCanvas(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="620" viewBox="0 0 1040 620">
    <rect width="1040" height="620" rx="24" fill="#FFFFFF"/>
    <style>
      text { font-family: Arial, Helvetica, sans-serif; fill: ${COLORS.ink}; }
      .title { font-size: 29px; font-weight: 700; letter-spacing: 1px; }
      .subtitle { font-size: 17px; fill: ${COLORS.muted}; }
      .label { font-size: 20px; font-weight: 700; }
      .detail { font-size: 16px; }
      .tiny { font-size: 14px; font-weight: 700; }
    </style>${body}</svg>`;
}

function svgTitle(title, subtitle, color = COLORS.navy) {
  return `<rect x="0" y="0" width="1040" height="92" rx="24" fill="${color}"/>
    <text x="42" y="42" class="title" fill="#FFFFFF" style="fill:#FFFFFF">${escapeXml(title)}</text>
    <text x="42" y="70" class="subtitle" fill="#FFFFFF" style="fill:#FFFFFF;opacity:.82">${escapeXml(subtitle)}</text>`;
}

function box(x, y, width, height, title, detail, fill, stroke) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <text x="${x + width / 2}" y="${y + 43}" text-anchor="middle" class="label" style="fill:${stroke}">${escapeXml(title)}</text>
    <text x="${x + width / 2}" y="${y + 72}" text-anchor="middle" class="detail">${escapeXml(detail)}</text>`;
}

function diamond(x, y, width, height, title, detail, fill, stroke) {
  const points = `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`;
  return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <text x="${x + width / 2}" y="${y + 55}" text-anchor="middle" class="tiny" style="fill:${stroke}">${escapeXml(title)}</text>
    <text x="${x + width / 2}" y="${y + 83}" text-anchor="middle" class="label" style="fill:${stroke}">${escapeXml(detail)}</text>`;
}

function arrow(x1, y1, x2, y2, label) {
  const horizontal = y1 === y2;
  const points = horizontal
    ? `${x2},${y2} ${x2 - 13},${y2 - 8} ${x2 - 13},${y2 + 8}`
    : `${x2},${y2} ${x2 - 8},${y2 - 13} ${x2 + 8},${y2 - 13}`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS.muted}" stroke-width="3"/>
    <polygon points="${points}" fill="${COLORS.muted}"/>
    <text x="${horizontal ? (x1 + x2) / 2 : x1 + 18}" y="${horizontal ? y1 - 11 : (y1 + y2) / 2}" text-anchor="middle" class="tiny">${label}</text>`;
}

function smallNote(x, y, text) {
  return `<rect x="${x}" y="${y}" width="${1040 - x * 2}" height="70" rx="12" fill="#F4F6F9"/>
    <text x="${x + 22}" y="${y + 42}" class="detail">${escapeXml(text)}</text>`;
}

function matrixRow(x, y, c1, c2, c3, fill, color) {
  const widths = [280, 260, 380];
  const values = [c1, c2, c3];
  let cursor = x;
  return values.map((value, index) => {
    const cell = `<rect x="${cursor}" y="${y}" width="${widths[index]}" height="70" fill="${fill}" stroke="#CBD3DD"/>
      <text x="${cursor + 18}" y="${y + 42}" class="${y === 130 ? "tiny" : "detail"}" style="fill:${color}">${escapeXml(value)}</text>`;
    cursor += widths[index];
    return cell;
  }).join("");
}

function svgTable(table) {
  const x = 28;
  const widths = [190, 70, 130, 155, 195, 244];
  const rowHeight = 65;
  const values = [table.headers, ...table.rows];
  let output = "";

  values.forEach((row, rowIndex) => {
    let cursorX = x;
    const y = 112 + rowIndex * rowHeight;
    const fill = rowIndex === 0
      ? COLORS.navy
      : rowIndex === values.length - 1 ? COLORS.paleRed : rowIndex % 2 === 0 ? COLORS.paleBlue : COLORS.white;
    const color = rowIndex === 0 ? COLORS.white : rowIndex === values.length - 1 ? COLORS.red : COLORS.ink;
    row.forEach((value, columnIndex) => {
      output += `<rect x="${cursorX}" y="${y}" width="${widths[columnIndex]}" height="${rowHeight}" fill="${fill}" stroke="${COLORS.line}"/>
        <text x="${cursorX + 12}" y="${y + 38}" class="${rowIndex === 0 ? "tiny" : "detail"}" style="fill:${color}">${escapeXml(value)}</text>`;
      cursorX += widths[columnIndex];
    });
  });
  return output;
}

function timeline(x, y, color, label, milestones, actions) {
  const positions = [210, 520, 830];
  let output = `<text x="${x}" y="${y - 38}" class="label" style="fill:${color}">${label}</text>
    <line x1="${positions[0]}" y1="${y}" x2="${positions[2]}" y2="${y}" stroke="${color}" stroke-width="8"/>`;
  for (let i = 0; i < positions.length; i += 1) {
    output += `<circle cx="${positions[i]}" cy="${y}" r="16" fill="${COLORS.white}" stroke="${color}" stroke-width="7"/>
      <text x="${positions[i]}" y="${y + 42}" text-anchor="middle" class="tiny" style="fill:${color}">${escapeXml(milestones[i])}</text>
      <text x="${positions[i]}" y="${y + 70}" text-anchor="middle" class="detail">${escapeXml(actions[i])}</text>`;
  }
  return output;
}

function severityRow(x, y, severity, trigger, owner, target, color, fill) {
  return `<rect x="${x}" y="${y}" width="920" height="78" rx="14" fill="${fill}" stroke="${color}" stroke-width="2"/>
    <circle cx="${x + 50}" cy="${y + 39}" r="28" fill="${color}"/>
    <text x="${x + 50}" y="${y + 47}" text-anchor="middle" class="label" style="fill:#FFFFFF">${severity}</text>
    <text x="${x + 100}" y="${y + 31}" class="label">${escapeXml(trigger)}</text>
    <text x="${x + 100}" y="${y + 58}" class="detail">Owner: ${escapeXml(owner)}</text>
    <text x="${x + 895}" y="${y + 46}" text-anchor="end" class="label" style="fill:${color}">${escapeXml(target)}</text>`;
}

function hex(value) {
  const clean = value.replace("#", "");
  return rgb(
    Number.parseInt(clean.slice(0, 2), 16) / 255,
    Number.parseInt(clean.slice(2, 4), 16) / 255,
    Number.parseInt(clean.slice(4, 6), 16) / 255,
  );
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
