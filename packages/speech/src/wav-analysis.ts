import { ProviderResponseError } from "@mediaforge/domain";

export interface WavMetadata {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number;
  readonly dataOffset: number;
  readonly dataSize: number;
  readonly durationSeconds: number;
}

export interface WavQualityMetrics {
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly zeroCrossingsRate: number;
  readonly clippedRatio: number;
  readonly normalizedEntropy: number;
}

export function makeWavHeader(sampleRate: number, channels: number, bitsPerSample: number, dataSize: number): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function describePayloadPrefix(buffer: Buffer): string {
  const prefix = buffer.subarray(0, Math.min(buffer.byteLength, 16));
  const ascii = prefix.toString("ascii").replace(/[^\x20-\x7E]/gu, ".");
  return `payloadPrefixAscii=${JSON.stringify(ascii)}, payloadPrefixHex=${prefix.toString("hex")}, byteLength=${buffer.byteLength}`;
}

export function parseWavMetadata(filePath: string, buffer: Buffer): WavMetadata {
  if (buffer.byteLength < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new ProviderResponseError(`Invalid WAV file: ${filePath}. ${describePayloadPrefix(buffer)}`);
  }
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let blockAlign = 0;
  let dataOffset = -1;
  let dataSize = -1;
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkId === "fmt ") {
      if (chunkEnd > buffer.byteLength) {
        throw new ProviderResponseError(`Invalid WAV chunk in ${filePath}. offset=${offset}, chunkId=${JSON.stringify(chunkId)}, chunkSize=${chunkSize}, ${describePayloadPrefix(buffer)}`);
      }
      if (chunkSize < 16) {
        throw new ProviderResponseError(`Invalid WAV fmt chunk in ${filePath}. offset=${offset}, chunkId=${JSON.stringify(chunkId)}, chunkSize=${chunkSize}, ${describePayloadPrefix(buffer)}`);
      }
      const audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      blockAlign = buffer.readUInt16LE(chunkStart + 12);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
      if (audioFormat !== 1) {
        throw new ProviderResponseError(`Unsupported WAV encoding in ${filePath}. offset=${offset}, chunkId=${JSON.stringify(chunkId)}, chunkSize=${chunkSize}, ${describePayloadPrefix(buffer)}`);
      }
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = chunkEnd > buffer.byteLength ? buffer.byteLength - chunkStart : chunkSize;
      break;
    } else if (chunkEnd > buffer.byteLength) {
      throw new ProviderResponseError(`Invalid WAV chunk in ${filePath}. offset=${offset}, chunkId=${JSON.stringify(chunkId)}, chunkSize=${chunkSize}, ${describePayloadPrefix(buffer)}`);
    }
    offset = chunkEnd + (chunkSize % 2);
  }
  if (sampleRate <= 0 || channels <= 0 || bitsPerSample !== 16 || blockAlign !== channels * 2 || dataOffset < 0 || dataSize <= 0) {
    throw new ProviderResponseError(`Invalid WAV header metadata in ${filePath}. ${describePayloadPrefix(buffer)}`);
  }
  const frames = dataSize / blockAlign;
  if (!Number.isFinite(frames) || frames <= 0 || !Number.isInteger(frames)) {
    throw new ProviderResponseError(`Invalid WAV duration metadata in ${filePath}. ${describePayloadPrefix(buffer)}`);
  }
  return {
    sampleRate,
    channels,
    bitsPerSample,
    dataOffset,
    dataSize,
    durationSeconds: frames / sampleRate,
  };
}

export function analyzeWavQuality(buffer: Buffer, metadata: WavMetadata): WavQualityMetrics {
  const sampleCount = metadata.dataSize / 2;
  let peak = 0;
  let sumSquares = 0;
  let zeroCrossings = 0;
  let clippedSamples = 0;
  let previousSign = 0;
  const histogram = new Array<number>(256).fill(0);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = buffer.readInt16LE(metadata.dataOffset + index * 2);
    const absSample = Math.abs(sample);
    if (absSample > peak) {
      peak = absSample;
    }
    sumSquares += sample * sample;
    if (absSample >= 32256) {
      clippedSamples += 1;
    }
    const sign = sample === 0 ? 0 : sample > 0 ? 1 : -1;
    if (sign !== 0 && previousSign !== 0 && sign !== previousSign) {
      zeroCrossings += 1;
    }
    if (sign !== 0) {
      previousSign = sign;
    }
    const histogramIndex = Math.min(255, Math.max(0, Math.floor(((sample + 32768) / 65536) * 256)));
    histogram[histogramIndex] = (histogram[histogramIndex] ?? 0) + 1;
  }
  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) {
      continue;
    }
    const probability = count / sampleCount;
    entropy -= probability * Math.log2(probability);
  }
  const peakDb = peak > 0 ? 20 * Math.log10(peak / 32767) : Number.NEGATIVE_INFINITY;
  const rms = Math.sqrt(sumSquares / sampleCount);
  const rmsDb = rms > 0 ? 20 * Math.log10(rms / 32767) : Number.NEGATIVE_INFINITY;
  return {
    peakDb,
    rmsDb,
    zeroCrossingsRate: zeroCrossings / Math.max(1, sampleCount - 1),
    clippedRatio: clippedSamples / sampleCount,
    normalizedEntropy: entropy / 8,
  };
}

function describeAudioPayload(buffer: Buffer): string {
  const prefix = buffer.subarray(0, Math.min(buffer.byteLength, 16));
  const ascii = prefix.toString("ascii").replace(/[^\x20-\x7E]/gu, ".");
  const hex = prefix.toString("hex");
  return `payloadPrefixAscii=${JSON.stringify(ascii)}, payloadPrefixHex=${hex}, byteLength=${buffer.byteLength}`;
}

export function validateSpeechAudioPayload(
  filePath: string,
  buffer: Buffer,
  targetDurationSeconds?: number
): WavMetadata {
  const metadata = parseWavMetadata(filePath, buffer);
  const quality = analyzeWavQuality(buffer, metadata);
  const reasons: string[] = [];
  if (metadata.durationSeconds <= 0) {
    reasons.push("duration is zero");
  }
  if (targetDurationSeconds !== undefined) {
    if (metadata.durationSeconds < Math.max(0.5, targetDurationSeconds * 0.45)) {
      reasons.push(`duration ${metadata.durationSeconds.toFixed(3)}s is far shorter than the target ${targetDurationSeconds.toFixed(3)}s`);
    }
    if (metadata.durationSeconds > targetDurationSeconds * 2.5) {
      reasons.push(`duration ${metadata.durationSeconds.toFixed(3)}s is far longer than the target ${targetDurationSeconds.toFixed(3)}s`);
    }
  }
  if (quality.peakDb < -35 || quality.rmsDb < -40) {
    reasons.push(
      `audio is too quiet (peak ${quality.peakDb.toFixed(2)} dB, rms ${quality.rmsDb.toFixed(2)} dB)`
    );
  }
  if (quality.zeroCrossingsRate > 0.55) {
    reasons.push(
      `audio looks like noise (zero crossings rate ${quality.zeroCrossingsRate.toFixed(3)})`
    );
  }
  if (quality.normalizedEntropy < 0.3) {
    reasons.push(
      `audio looks like a synthetic tone or static (entropy ${quality.normalizedEntropy.toFixed(3)})`
    );
  }
  if (quality.clippedRatio > 0.05) {
    reasons.push(`audio is heavily clipped (${(quality.clippedRatio * 100).toFixed(1)}% of samples)`);
  }
  if (reasons.length > 0) {
    throw new ProviderResponseError(
      `OpenAI speech provider returned audio that failed quality validation for ${filePath}: ${reasons.join("; ")}. ${describeAudioPayload(buffer)}`
    );
  }
  return metadata;
}
