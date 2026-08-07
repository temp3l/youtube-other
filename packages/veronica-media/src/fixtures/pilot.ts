import { createHash } from "node:crypto";

const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function createFixturePng(label: string): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = Buffer.from([
    0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
  ]);
  const chunks = [
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ];
  const body = Buffer.concat(chunks);
  const comment = Buffer.from(`label=${label}`, "utf8");
  void comment;
  return Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIGNATURE), body]));
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createFixtureSvg(text: string): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="10" y="40">${text}</text></svg>`;
  return Buffer.from(svg, "utf8");
}

export function createFixturePptx(slideCount: number): Uint8Array {
  const slideParts = Array.from({ length: slideCount }, (_, index) =>
    `ppt/slides/slide${index + 1}.xml`,
  );
  const content = ["[Content_Types].xml", ...slideParts, "ppt/presentation.xml"].join("\n");
  const payload = Buffer.from(content, "utf8");
  const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  return Uint8Array.from(Buffer.concat([zipHeader, payload]));
}

export function createFixturePdf(pageCount: number): Uint8Array {
  const pages = Array.from({ length: pageCount }, () => "/Type /Page").join("\n");
  return Buffer.from(`%PDF-1.4\n${pages}\n%%EOF\n`, "utf8");
}

export const VERONICA_PILOT_NARRATION = {
  original:
    "Benvenuti. Oggi esploriamo come reinventarsi professionalmente. " +
    "La prima slide mostra il percorso. La seconda evidenzia i rischi.",
  revised:
    "Benvenuti. Oggi esploriamo come reinventarsi professionalmente con chiarezza. " +
    "La prima slide introduce il percorso. La seconda evidenzia i rischi principali.",
} as const;

export function createVeronicaPilotFixtures() {
  return {
    narration: VERONICA_PILOT_NARRATION,
    files: [
      {
        assetId: "source-slide-deck",
        filename: "reinvention-deck.pptx",
        bytes: createFixturePptx(3),
        declaredMimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
      {
        assetId: "source-diagram",
        filename: "framework.svg",
        bytes: createFixtureSvg("Percorso di reinvenzione"),
        declaredMimeType: "image/svg+xml",
      },
      {
        assetId: "source-photo",
        filename: "portrait.png",
        bytes: createFixturePng("portrait"),
        declaredMimeType: "image/png",
      },
      {
        assetId: "source-handout",
        filename: "handout.pdf",
        bytes: createFixturePdf(2),
        declaredMimeType: "application/pdf",
      },
    ],
    alignedSegments: [
      { text: VERONICA_PILOT_NARRATION.revised.split(". ")[0] + ".", startSeconds: 0, endSeconds: 4 },
      { text: VERONICA_PILOT_NARRATION.revised.split(". ")[1] + ".", startSeconds: 4, endSeconds: 8 },
      { text: VERONICA_PILOT_NARRATION.revised.split(". ")[2] + ".", startSeconds: 8, endSeconds: 12 },
      { text: VERONICA_PILOT_NARRATION.revised.split(". ")[3] + ".", startSeconds: 12, endSeconds: 16 },
    ],
    contentHashSeed: createHash("sha256")
      .update(VERONICA_PILOT_NARRATION.revised)
      .digest("hex"),
  };
}
