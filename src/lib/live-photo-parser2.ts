interface ParsedLivePhoto {
	photoBlob: Blob;
	photoUrl: string;
	videoBlob: Blob | null;
	videoUrl: string | null;
}

const LOG_TAG = "[live-photo-parser2]";

/**
 * Parse HEIC/Live Photo payload and split image/video payload.
 * Image is decoded to JPEG via WASM (heic2any) when HEIC-like.
 */
export async function parseHeicDirectly(
	buffer: ArrayBuffer,
	file: File,
): Promise<ParsedLivePhoto> {
	console.info(
		`${LOG_TAG} parse start`,
		JSON.stringify({
			name: file.name,
			type: file.type || "(empty)",
			size: file.size,
		}),
	);

	const u8 = new Uint8Array(buffer);
	const { photoBlob: rawPhotoBlob, videoBlob } = splitLivePhotoPayload(u8, file);
	const photoBlob = await buildDisplayPhotoBlob(rawPhotoBlob, file.name);

	console.info(
		`${LOG_TAG} parse done`,
		JSON.stringify({
			photoType: photoBlob.type || "(empty)",
			photoSize: photoBlob.size,
			videoType: videoBlob?.type || null,
			videoSize: videoBlob?.size || 0,
		}),
	);

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
	console.debug(`${LOG_TAG} ISO container starts:`, starts);

	if (starts.length < 2) {
		console.debug(`${LOG_TAG} no appended video container detected`);
		return {
			photoBlob: file,
			videoBlob: null,
		};
	}

	const videoStart = pickLikelyVideoStart(data, starts);
	if (videoStart == null || videoStart <= 0 || videoStart >= data.length) {
		console.debug(`${LOG_TAG} no reliable video start candidate, skip split`);
		return {
			photoBlob: file,
			videoBlob: null,
		};
	}

	const photoType = detectPhotoMime(data, file.name, file.type);
	const videoType = detectVideoMime(data, videoStart);
	const videoBrand = readMajorBrandAtStart(data, videoStart);

	console.info(
		`${LOG_TAG} split payload`,
		JSON.stringify({
			videoStart,
			videoBrand,
			photoType,
			videoType,
			photoBytes: videoStart,
			videoBytes: data.length - videoStart,
		}),
	);

	return {
		photoBlob: new Blob([data.slice(0, videoStart)], { type: photoType }),
		videoBlob: new Blob([data.slice(videoStart)], { type: videoType }),
	};
}

function pickLikelyVideoStart(
	data: Uint8Array,
	starts: number[],
): number | null {
	const sorted = [...new Set(starts)].sort((a, b) => a - b);
	for (let i = sorted.length - 1; i >= 1; i--) {
		const start = sorted[i];
		const brand = readMajorBrandAtStart(data, start);
		if (!brand) continue;
		console.debug(
			`${LOG_TAG} candidate container`,
			JSON.stringify({ start, brand }),
		);

		if (isHeifBrand(brand)) {
			continue;
		}

		if (isLikelyVideoBrand(brand) || hasVideoBoxSignature(data, start)) {
			return start;
		}
	}
	return null;
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

function readMajorBrandAtStart(data: Uint8Array, start: number): string | null {
	if (start + 12 > data.length) return null;
	if (readAscii(data, start + 4, 4) !== "ftyp") return null;
	return readAscii(data, start + 8, 4);
}

function isLikelyVideoBrand(brand: string): boolean {
	return (
		brand === "qt  " ||
		brand === "isom" ||
		brand === "iso2" ||
		brand === "mp41" ||
		brand === "mp42" ||
		brand === "avc1" ||
		brand === "hvc1" ||
		brand === "M4V "
	);
}

function detectVideoMime(data: Uint8Array, start: number): string {
	const brand = readMajorBrandAtStart(data, start);
	if (brand === "qt  ") return "video/quicktime";
	return "video/mp4";
}

function hasVideoBoxSignature(data: Uint8Array, start: number): boolean {
	const end = Math.min(data.length, start + 512 * 1024);
	const probe = data.subarray(start, end);
	return (
		findPattern(probe, [0x6d, 0x6f, 0x6f, 0x76]) >= 0 || // moov
		findPattern(probe, [0x6d, 0x76, 0x68, 0x64]) >= 0 || // mvhd
		findPattern(probe, [0x74, 0x72, 0x61, 0x6b]) >= 0 // trak
	);
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

async function buildDisplayPhotoBlob(
	photoBlob: Blob,
	fileName: string,
): Promise<Blob> {
	if (!isHeicLike(photoBlob.type, fileName)) {
		console.debug(
			`${LOG_TAG} photo is not HEIC-like, skip decode`,
			photoBlob.type || "(empty)",
		);
		return photoBlob;
	}

	const decoded = await decodeHeicToJpegByWasm(photoBlob);
	if (decoded) {
		console.info(
			`${LOG_TAG} HEIC decoded to JPEG by wasm`,
			JSON.stringify({
				inputType: photoBlob.type || "(empty)",
				inputSize: photoBlob.size,
				outputSize: decoded.size,
			}),
		);
		return decoded;
	}

	console.warn(`${LOG_TAG} wasm HEIC decode failed, using source blob`);
	return photoBlob;
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

async function decodeHeicToJpegByWasm(photoBlob: Blob): Promise<Blob | null> {
	if (typeof window === "undefined") {
		console.warn(`${LOG_TAG} wasm decode skipped on non-browser runtime`);
		return null;
	}

	try {
		const mod = await import("heic2any");
		const heic2any = mod.default as (options: {
			blob: Blob;
			toType?: string;
			quality?: number;
		}) => Promise<Blob | Blob[]>;

		const result = await heic2any({
			blob: photoBlob,
			toType: "image/jpeg",
			quality: 0.85,
		});

		if (Array.isArray(result)) {
			const first = result[0] ?? null;
			if (!first) {
				console.warn(`${LOG_TAG} wasm decode returned empty Blob[]`);
				return null;
			}
			return first;
		}

		return result;
	} catch (error) {
		console.warn(`${LOG_TAG} wasm(heic2any) decode failed`, error);
		return null;
	}
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
