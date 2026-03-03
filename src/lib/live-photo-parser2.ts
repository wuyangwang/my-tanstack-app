interface Box {
	type: string;
	start: number;
	size: number;
	headerSize: number;
}

interface ParsedLivePhoto {
	photoBlob: Blob;
	photoUrl: string;
	videoBlob: Blob | null;
	videoUrl: string | null;
}

/**
 * Parse HEIC/Live Photo payload, split photo/video payload, and produce a displayable image blob.
 */
export async function parseHeicDirectly(
	buffer: ArrayBuffer,
	file: File,
): Promise<ParsedLivePhoto> {
	const u8 = new Uint8Array(buffer);
	const { photoBlob: rawPhotoBlob, videoBlob } = splitLivePhotoPayload(
		u8,
		file,
	);
	const photoBlob = await buildDisplayPhotoBlob(rawPhotoBlob, file.name);

	return {
		photoBlob,
		photoUrl: URL.createObjectURL(photoBlob),
		videoBlob,
		videoUrl: videoBlob ? URL.createObjectURL(videoBlob) : null,
	};
}

function splitLivePhotoPayload(
	data: Uint8Array,
	file: File,
): { photoBlob: Blob; videoBlob: Blob | null } {
	const starts = collectIsoContainerStarts(data);
	if (starts.length < 2) {
		return {
			photoBlob: file,
			videoBlob: null,
		};
	}

	const videoStart = starts[starts.length - 1];
	if (videoStart <= 0 || videoStart >= data.length) {
		return {
			photoBlob: file,
			videoBlob: null,
		};
	}

	const photoType = detectPhotoMime(data, file.name, file.type);
	const videoType = detectVideoMime(data, videoStart);

	return {
		photoBlob: new Blob([data.slice(0, videoStart)], { type: photoType }),
		videoBlob: new Blob([data.slice(videoStart)], { type: videoType }),
	};
}

function collectIsoContainerStarts(data: Uint8Array): number[] {
	const ftypPositions = findPatternAll(data, [0x66, 0x74, 0x79, 0x70]);
	if (!ftypPositions.length) return [];

	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const starts: number[] = [];

	for (const ftypPos of ftypPositions) {
		if (ftypPos < 4) continue;
		const start = ftypPos - 4;
		if (start + 8 > data.length) continue;
		const size = view.getUint32(start);
		if (size !== 0 && size < 8) continue;
		if (readAscii(data, start + 4, 4) !== "ftyp") continue;
		starts.push(start);
	}

	return [...new Set(starts)].sort((a, b) => a - b);
}

function detectPhotoMime(
	data: Uint8Array,
	fileName: string,
	fileType: string,
): string {
	const name = fileName.toLowerCase();
	if (name.endsWith(".heic") || name.endsWith(".heif")) return "image/heic";
	if (fileType.startsWith("image/")) return fileType;

	const firstFtyp = findPattern(data, [0x66, 0x74, 0x79, 0x70]);
	if (firstFtyp >= 0 && firstFtyp + 8 <= data.length) {
		const majorBrand = readAscii(data, firstFtyp + 4, 4);
		if (isHeifBrand(majorBrand)) {
			return "image/heic";
		}
	}

	return fileType || "application/octet-stream";
}

function isHeifBrand(brand: string): boolean {
	return (
		brand === "heic" ||
		brand === "heix" ||
		brand === "hevc" ||
		brand === "heim" ||
		brand === "heif" ||
		brand === "mif1"
	);
}

function detectVideoMime(data: Uint8Array, start: number): string {
	const ftypPos = start + 4;
	if (ftypPos + 12 <= data.length && readAscii(data, ftypPos, 4) === "ftyp") {
		const majorBrand = readAscii(data, ftypPos + 4, 4);
		if (majorBrand === "qt  ") return "video/quicktime";
	}
	return "video/mp4";
}

async function buildDisplayPhotoBlob(
	photoBlob: Blob,
	fileName: string,
): Promise<Blob> {
	if (!isHeicLike(photoBlob.type, fileName)) {
		return photoBlob;
	}

	try {
		const decoded = await decodeHeicToJpeg(photoBlob, fileName);
		return decoded ?? photoBlob;
	} catch {
		return photoBlob;
	}
}

function isHeicLike(mime: string, fileName: string): boolean {
	const lowerMime = mime.toLowerCase();
	const lowerName = fileName.toLowerCase();
	return (
		lowerMime.includes("heic") ||
		lowerMime.includes("heif") ||
		lowerName.endsWith(".heic") ||
		lowerName.endsWith(".heif")
	);
}

async function decodeHeicToJpeg(
	photoBlob: Blob,
	fileName: string,
): Promise<Blob | null> {
	const u8 = new Uint8Array(await photoBlob.arrayBuffer());
	const boxes = parseTopLevelBoxes(u8);

	const metaBox = boxes.find((box) => box.type === "meta");
	const mdatBox = boxes.find((box) => box.type === "mdat");
	if (!metaBox || !mdatBox) return null;

	const description = extractHvccDescription(u8, metaBox);
	const codec = buildCodecString(description, fileName);
	const firstChunk = readFirstMdatChunk(u8, mdatBox);
	if (!firstChunk) return null;

	const frame = await decodePacketToFrame(
		codec,
		description,
		firstChunk,
		0,
		"key",
	);
	try {
		return await frameToJpegBlob(frame);
	} finally {
		frame.close();
	}
}

function parseTopLevelBoxes(data: Uint8Array): Box[] {
	const boxes: Box[] = [];
	let offset = 0;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

	while (offset + 8 <= data.length) {
		let size = view.getUint32(offset);
		const type = readAscii(data, offset + 4, 4);
		let headerSize = 8;

		if (size === 1) {
			if (offset + 16 > data.length) break;
			size = Number(view.getBigUint64(offset + 8));
			headerSize = 16;
		}
		if (size === 0) {
			size = data.length - offset;
		}
		if (size < headerSize || offset + size > data.length) break;

		boxes.push({ type, start: offset, size, headerSize });
		offset += size;
	}

	return boxes;
}

function extractHvccDescription(data: Uint8Array, metaBox: Box): Uint8Array {
	const metaStart = metaBox.start + metaBox.headerSize + 4;
	const metaEnd = metaBox.start + metaBox.size;
	const metaContent = data.subarray(metaStart, metaEnd);
	const hvcCPos = findPattern(metaContent, [0x68, 0x76, 0x63, 0x43]);
	if (hvcCPos < 4) {
		throw new Error("hvcC box not found in HEIC meta box");
	}

	const sizeView = new DataView(
		metaContent.buffer,
		metaContent.byteOffset + hvcCPos - 4,
		4,
	);
	const hvcCSize = sizeView.getUint32(0);
	if (hvcCSize <= 8 || hvcCPos + hvcCSize > metaContent.length) {
		throw new Error("Invalid hvcC box size");
	}

	return metaContent.subarray(hvcCPos + 4, hvcCPos + hvcCSize - 4);
}

function buildCodecString(description: Uint8Array, fileName: string): string {
	if (description.length >= 13) {
		const profile = description[1];
		const tier = description[2] & 0x20 ? "H" : "L";
		const level = description[12];
		return `hvc1.${profile}.6.${tier}${level}.B0`;
	}

	if (fileName.toLowerCase().endsWith(".heic")) {
		return "hvc1.1.6.L93.B0";
	}
	return "hvc1";
}

function readFirstMdatChunk(data: Uint8Array, mdatBox: Box): Uint8Array | null {
	const bodyStart = mdatBox.start + mdatBox.headerSize;
	const bodyEnd = mdatBox.start + mdatBox.size;
	const payload = data.subarray(bodyStart, bodyEnd);
	const view = new DataView(
		payload.buffer,
		payload.byteOffset,
		payload.byteLength,
	);

	let offset = 0;
	while (offset + 4 <= payload.length) {
		const naluSize = view.getUint32(offset);
		const dataStart = offset + 4;
		const dataEnd = dataStart + naluSize;

		if (naluSize > 0 && dataEnd <= payload.length) {
			return payload.subarray(dataStart, dataEnd);
		}
		offset = dataEnd;
	}

	return null;
}

async function decodePacketToFrame(
	codec: string,
	description: Uint8Array | null | undefined,
	chunkData: Uint8Array,
	timestamp: number,
	type: "key" | "delta",
): Promise<VideoFrame> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const decoder = new VideoDecoder({
			output: (frame) => {
				if (settled) {
					frame.close();
					return;
				}
				settled = true;
				resolve(frame);
				decoder.close();
			},
			error: (error) => {
				if (!settled) {
					settled = true;
					reject(error);
				}
			},
		});

		decoder.configure(
			description
				? {
						codec,
						description,
						hardwareAcceleration: "prefer-hardware",
					}
				: {
						codec,
						hardwareAcceleration: "prefer-hardware",
					},
		);

		decoder.decode(
			new EncodedVideoChunk({
				type,
				timestamp,
				data: chunkData,
			}),
		);

		decoder.flush().catch((error) => {
			if (!settled) {
				settled = true;
				reject(error);
			}
		});
	});
}

async function frameToJpegBlob(frame: VideoFrame): Promise<Blob> {
	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Unable to get 2d context from OffscreenCanvas");
		}

		ctx.drawImage(frame, 0, 0);
		return canvas.convertToBlob({
			type: "image/jpeg",
			quality: 0.92,
		});
	}

	const canvas = document.createElement("canvas");
	canvas.width = frame.displayWidth;
	canvas.height = frame.displayHeight;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Unable to get 2d context from canvas");
	}

	ctx.drawImage(frame, 0, 0);
	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, "image/jpeg", 0.92);
	});
	if (!blob) {
		throw new Error("Failed to encode frame as JPEG");
	}
	return blob;
}

function readAscii(data: Uint8Array, offset: number, length: number): string {
	return String.fromCharCode(...data.subarray(offset, offset + length));
}

function findPattern(data: Uint8Array, pattern: number[]): number {
	outer: for (let i = 0; i <= data.length - pattern.length; i++) {
		for (let j = 0; j < pattern.length; j++) {
			if (data[i + j] !== pattern[j]) {
				continue outer;
			}
		}
		return i;
	}
	return -1;
}

function findPatternAll(data: Uint8Array, pattern: number[]): number[] {
	const positions: number[] = [];
	let from = 0;

	while (from <= data.length - pattern.length) {
		const found = findPattern(data.subarray(from), pattern);
		if (found < 0) break;
		const absolute = from + found;
		positions.push(absolute);
		from = absolute + 1;
	}

	return positions;
}
