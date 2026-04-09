const LOG_TAG = "[heic-parser]";

export type HeicParseKind =
	| "independent-video"
	| "animated-heic-no-video-track"
	| "static-heic"
	| "unknown";

export interface HeicDiagnostics {
	majorBrand: string | null;
	hasMeta: boolean;
	hasTrackStructure: boolean;
	hasItemStructure: boolean;
	containerStarts: number[];
	videoContainerStart: number | null;
	decodedFrameCount: number;
	decodeFallback: boolean;
	synthesizedVideoFromSequence: boolean;
}

export interface HeicParseResult {
	kind: HeicParseKind;
	photoBlob: Blob;
	videoBlob: Blob | null;
	diagnostics: HeicDiagnostics;
}

export interface HeicStructure {
	majorBrand: string | null;
	hasMeta: boolean;
	hasTrackStructure: boolean;
	hasItemStructure: boolean;
	containerStarts: number[];
	videoContainerStart: number | null;
}

interface DecodeFramesResult {
	firstFrame: Blob | null;
	allFrames: Blob[];
	decodeFallback: boolean;
}

export interface ParsedLivePhoto {
	photoBlob: Blob;
	photoUrl: string;
	videoBlob: Blob | null;
	videoUrl: string | null;
	kind: HeicParseKind;
}

export async function parseHeicDirectly(
	buffer: ArrayBuffer,
	file: File,
): Promise<ParsedLivePhoto> {
	const result = await parseHeicContainer(buffer, file);

	return {
		photoBlob: result.photoBlob,
		photoUrl: URL.createObjectURL(result.photoBlob),
		videoBlob: result.videoBlob,
		videoUrl: result.videoBlob ? URL.createObjectURL(result.videoBlob) : null,
		kind: result.kind,
	};
}

export async function parseHeicContainer(
	buffer: ArrayBuffer,
	file: File,
): Promise<HeicParseResult> {
	const data = new Uint8Array(buffer);
	const structure = detectHeicStructure(data);
	let photoBlob: Blob = file;
	let videoBlob: Blob | null = null;

	if (
		structure.videoContainerStart != null &&
		structure.videoContainerStart > 0 &&
		structure.videoContainerStart < data.length
	) {
		photoBlob = new Blob([data.slice(0, structure.videoContainerStart)], {
			type: detectPhotoMime(data, file.name, file.type),
		});
		videoBlob = new Blob([data.slice(structure.videoContainerStart)], {
			type: detectVideoMime(data, structure.videoContainerStart),
		});
	}

	if (videoBlob) {
		const hasVideoTrack = await hasVideoTrackByMediabunny(videoBlob);
		if (!hasVideoTrack) {
			console.warn(
				`${LOG_TAG} candidate video blob has no video track, ignoring`,
			);
			videoBlob = null;
			photoBlob = file;
		}
	}

	const decodedFrames = await decodeHeicFramesToJpeg(photoBlob, file.name);
	if (decodedFrames.firstFrame) {
		photoBlob = decodedFrames.firstFrame;
	}

	const shouldEncodeSequenceMp4 =
		!videoBlob &&
		decodedFrames.allFrames.length > 1 &&
		(structure.hasItemStructure ||
			structure.majorBrand === "msf1" ||
			structure.majorBrand === "heic");

	if (shouldEncodeSequenceMp4) {
		videoBlob = await encodeFrameSequenceToMp4(decodedFrames.allFrames, 12);
	}
	const synthesizedVideoFromSequence = shouldEncodeSequenceMp4 && !!videoBlob;

	const kind = classifyKind({
		videoBlob,
		decodedFrameCount: decodedFrames.allFrames.length,
		hasItemStructure: structure.hasItemStructure,
		hasTrackStructure: structure.hasTrackStructure,
		synthesizedVideoFromSequence,
	});

	return {
		kind,
		photoBlob,
		videoBlob,
		diagnostics: {
			majorBrand: structure.majorBrand,
			hasMeta: structure.hasMeta,
			hasTrackStructure: structure.hasTrackStructure,
			hasItemStructure: structure.hasItemStructure,
			containerStarts: structure.containerStarts,
			videoContainerStart: structure.videoContainerStart,
			decodedFrameCount: decodedFrames.allFrames.length,
			decodeFallback: decodedFrames.decodeFallback,
			synthesizedVideoFromSequence,
		},
	};
}

export function detectHeicStructure(data: Uint8Array): HeicStructure {
	const majorBrand = readMajorBrandAtStart(data, 0);
	const hasMeta = findPattern(data, [0x6d, 0x65, 0x74, 0x61]) >= 0; // meta
	const hasMoov = findPattern(data, [0x6d, 0x6f, 0x6f, 0x76]) >= 0; // moov
	const hasTrak = findPattern(data, [0x74, 0x72, 0x61, 0x6b]) >= 0; // trak
	const hasItemStructure =
		hasMeta &&
		(findPattern(data, [0x69, 0x69, 0x6e, 0x66]) >= 0 || // iinf
			findPattern(data, [0x69, 0x6c, 0x6f, 0x63]) >= 0 || // iloc
			findPattern(data, [0x69, 0x70, 0x72, 0x70]) >= 0); // iprp
	const containerStarts = collectIsoContainerStarts(data);
	const videoContainerStart = pickLikelyVideoStart(data, containerStarts);

	return {
		majorBrand,
		hasMeta,
		hasTrackStructure: hasMoov && hasTrak,
		hasItemStructure,
		containerStarts,
		videoContainerStart,
	};
}

function classifyKind(input: {
	videoBlob: Blob | null;
	decodedFrameCount: number;
	hasItemStructure: boolean;
	hasTrackStructure: boolean;
	synthesizedVideoFromSequence: boolean;
}): HeicParseKind {
	if (input.synthesizedVideoFromSequence) {
		return "animated-heic-no-video-track";
	}

	if (input.videoBlob) {
		return "independent-video";
	}

	if (
		input.hasItemStructure &&
		(input.decodedFrameCount > 1 || input.hasTrackStructure)
	) {
		return "animated-heic-no-video-track";
	}

	if (input.hasItemStructure) {
		return "static-heic";
	}

	return "unknown";
}

async function hasVideoTrackByMediabunny(videoBlob: Blob): Promise<boolean> {
	try {
		const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
		const input = new Input({
			source: new BlobSource(videoBlob),
			formats: ALL_FORMATS,
		});
		await input.ready;
		const track = await input.getPrimaryVideoTrack();
		input.dispose();
		return !!track;
	} catch (error) {
		console.warn(`${LOG_TAG} Mediabunny failed to validate video blob`, error);
		return false;
	}
}

async function decodeHeicFramesToJpeg(
	photoBlob: Blob,
	fileName: string,
): Promise<DecodeFramesResult> {
	if (!isHeicLike(photoBlob.type, fileName) || typeof window === "undefined") {
		return {
			firstFrame: null,
			allFrames: [],
			decodeFallback: false,
		};
	}

	try {
		const mod = await import("heic2any");
		const heic2any = mod.default as (options: {
			blob: Blob;
			toType?: string;
			quality?: number;
			multiple?: true;
		}) => Promise<Blob | Blob[]>;

		const decoded = await heic2any({
			blob: photoBlob,
			toType: "image/jpeg",
			quality: 0.85,
			multiple: true,
		});

		if (Array.isArray(decoded)) {
			const frames = decoded.filter(Boolean);
			return {
				firstFrame: frames[0] ?? null,
				allFrames: frames,
				decodeFallback: false,
			};
		}

		return {
			firstFrame: decoded,
			allFrames: [decoded],
			decodeFallback: false,
		};
	} catch (error) {
		console.warn(`${LOG_TAG} heic2any decode failed`, error);
		return {
			firstFrame: null,
			allFrames: [],
			decodeFallback: true,
		};
	}
}

export async function encodeFrameSequenceToMp4(
	frames: Blob[],
	fps = 12,
): Promise<Blob | null> {
	if (typeof window === "undefined" || frames.length < 2) {
		return null;
	}

	try {
		const {
			BufferTarget,
			CanvasSource,
			Mp4OutputFormat,
			Output,
			QUALITY_HIGH,
		} = await import("mediabunny");

		const first = await createImageBitmap(frames[0]);
		const canvas = document.createElement("canvas");
		canvas.width = first.width;
		canvas.height = first.height;
		const ctx = canvas.getContext("2d");

		if (!ctx) {
			first.close();
			return null;
		}

		const output = new Output({
			format: new Mp4OutputFormat(),
			target: new BufferTarget(),
		});
		const source = new CanvasSource(canvas, {
			codec: "avc",
			bitrate: QUALITY_HIGH,
		});
		output.addVideoTrack(source, { frameRate: fps });
		await output.start();

		ctx.drawImage(first, 0, 0, canvas.width, canvas.height);
		first.close();
		await source.add(0, 1 / fps);

		for (let i = 1; i < frames.length; i++) {
			const bitmap = await createImageBitmap(frames[i]);
			ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			bitmap.close();
			await source.add(i / fps, 1 / fps);
		}

		await output.finalize();
		const target = output.target as { buffer: ArrayBuffer };
		return new Blob([target.buffer], { type: "video/mp4" });
	} catch (error) {
		console.warn(`${LOG_TAG} encode sequence to mp4 failed`, error);
		return null;
	}
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

function pickLikelyVideoStart(
	data: Uint8Array,
	starts: number[],
): number | null {
	const sorted = [...new Set(starts)].sort((a, b) => a - b);
	for (let i = sorted.length - 1; i >= 1; i--) {
		const start = sorted[i];
		const brand = readMajorBrandAtStart(data, start);
		if (!brand || isHeifBrand(brand)) continue;

		if (isLikelyVideoBrand(brand) || hasVideoBoxSignature(data, start)) {
			return start;
		}
	}
	return null;
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
		brand === "mif1" ||
		brand === "msf1"
	);
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

function hasVideoBoxSignature(data: Uint8Array, start: number): boolean {
	const end = Math.min(data.length, start + 512 * 1024);
	const probe = data.subarray(start, end);
	return (
		findPattern(probe, [0x6d, 0x6f, 0x6f, 0x76]) >= 0 ||
		findPattern(probe, [0x6d, 0x76, 0x68, 0x64]) >= 0 ||
		findPattern(probe, [0x74, 0x72, 0x61, 0x6b]) >= 0
	);
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
