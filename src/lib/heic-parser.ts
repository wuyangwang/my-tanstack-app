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
	mdatItemCount: number;
	mdatDecodedFrameCount: number;
	mdatSelectedFrameCount: number;
	mdatSelectedResolution: string | null;
	usingMdatFramesForVideo: boolean;
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

export interface HeifExtractedItem {
	itemId: number;
	itemType: string | null;
	constructionMethod: number;
	absoluteOffset: number;
	length: number;
	inMdat: boolean;
	bytes: Uint8Array;
}

interface DecodeFramesResult {
	firstFrame: Blob | null;
	allFrames: Blob[];
	decodeFallback: boolean;
}

interface MdatFrameExtractionResult {
	frames: Blob[];
	totalItems: number;
	selectedFrameCount: number;
	selectedResolution: string | null;
}

interface DecodedItemFrame {
	blob: Blob;
	width: number;
	height: number;
	absoluteOffset: number;
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
	const mdatExtraction = await extractImageFramesFromMdatItems(data);
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

	const preferredFramesForVideo =
		mdatExtraction.frames.length > 1
			? mdatExtraction.frames
			: decodedFrames.allFrames;
	const usingMdatFramesForVideo = mdatExtraction.frames.length > 1;
	if (usingMdatFramesForVideo && mdatExtraction.frames[0]) {
		photoBlob = mdatExtraction.frames[0];
	}

	const shouldEncodeSequenceMp4 =
		!videoBlob &&
		preferredFramesForVideo.length > 1 &&
		(structure.hasItemStructure ||
			structure.majorBrand === "msf1" ||
			structure.majorBrand === "heic");

	if (shouldEncodeSequenceMp4) {
		videoBlob = await encodeFrameSequenceToMp4(preferredFramesForVideo, 12);
	}
	const synthesizedVideoFromSequence = shouldEncodeSequenceMp4 && !!videoBlob;

	const kind = classifyKind({
		videoBlob,
		decodedFrameCount: decodedFrames.allFrames.length,
		hasItemStructure: structure.hasItemStructure,
		hasTrackStructure: structure.hasTrackStructure,
		synthesizedVideoFromSequence,
	});

	console.info(
		`${LOG_TAG} parse summary`,
		JSON.stringify({
			fileName: file.name,
			kind,
			majorBrand: structure.majorBrand,
			hasItemStructure: structure.hasItemStructure,
			hasTrackStructure: structure.hasTrackStructure,
			videoContainerStart: structure.videoContainerStart,
			hasVideoBlob: !!videoBlob,
			decodedFrameCount: decodedFrames.allFrames.length,
			mdatItemCount: mdatExtraction.totalItems,
			mdatDecodedFrameCount: mdatExtraction.frames.length,
			mdatSelectedFrameCount: mdatExtraction.selectedFrameCount,
			mdatSelectedResolution: mdatExtraction.selectedResolution,
			usingMdatFramesForVideo,
			hasImageSequence: decodedFrames.allFrames.length > 1,
			synthesizedVideoFromSequence,
			decodeFallback: decodedFrames.decodeFallback,
		}),
	);

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
			mdatItemCount: mdatExtraction.totalItems,
			mdatDecodedFrameCount: mdatExtraction.frames.length,
			mdatSelectedFrameCount: mdatExtraction.selectedFrameCount,
			mdatSelectedResolution: mdatExtraction.selectedResolution,
			usingMdatFramesForVideo,
			decodeFallback: decodedFrames.decodeFallback,
			synthesizedVideoFromSequence,
		},
	};
}

export function detectHeicStructure(data: Uint8Array): HeicStructure {
	const majorBrand = readMajorBrandAtStart(data, 0);
	const hasMeta = findPattern(data, [0x6d, 0x65, 0x74, 0x61]) >= 0; // meta
	const hasItemStructure =
		hasMeta &&
		(findPattern(data, [0x69, 0x69, 0x6e, 0x66]) >= 0 || // iinf
			findPattern(data, [0x69, 0x6c, 0x6f, 0x63]) >= 0 || // iloc
			findPattern(data, [0x69, 0x70, 0x72, 0x70]) >= 0); // iprp
	const containerStarts = collectIsoContainerStarts(data);
	const containerProbes = inspectIsoContainers(data, containerStarts);
	const primaryProbe = containerProbes[0] ?? null;
	const videoContainerStart =
		pickLikelyVideoStart(data, containerProbes) ?? pickTailFtypVideoStart(data);

	return {
		majorBrand,
		hasMeta,
		hasTrackStructure: !!(
			primaryProbe &&
			primaryProbe.hasMoov &&
			primaryProbe.trackCount > 0
		),
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

interface IsoContainerProbe {
	start: number;
	end: number;
	majorBrand: string | null;
	hasMoov: boolean;
	hasMdat: boolean;
	hasVideoTrack: boolean;
	trackCount: number;
}

interface IsoBoxInfo {
	start: number;
	size: number;
	headerSize: number;
	type: string;
	dataStart: number;
	end: number;
}

function inspectIsoContainers(
	data: Uint8Array,
	starts: number[],
): IsoContainerProbe[] {
	if (!starts.length) {
		return [];
	}

	const sorted = [...new Set(starts)].sort((a, b) => a - b);
	return sorted.map((start, index) => {
		const nextStart = sorted[index + 1] ?? data.length;
		return inspectIsoContainer(data, start, nextStart);
	});
}

function inspectIsoContainer(
	data: Uint8Array,
	start: number,
	endExclusive: number,
): IsoContainerProbe {
	const end = Math.max(start, Math.min(endExclusive, data.length));
	const topLevelBoxes = scanIsoBoxes(data, start, end);
	let hasMoov = false;
	let hasMdat = false;
	let hasVideoTrack = false;
	let trackCount = 0;

	for (const box of topLevelBoxes) {
		if (box.type === "mdat") {
			hasMdat = true;
			continue;
		}
		if (box.type !== "moov") {
			continue;
		}

		hasMoov = true;
		const moovBoxes = scanIsoBoxes(data, box.dataStart, box.end);
		for (const moovBox of moovBoxes) {
			if (moovBox.type !== "trak") {
				continue;
			}
			trackCount++;
			const handlerType = findTrackHandlerType(data, moovBox);
			if (handlerType === "vide") {
				hasVideoTrack = true;
			}
		}
	}

	return {
		start,
		end,
		majorBrand: readMajorBrandAtStart(data, start),
		hasMoov,
		hasMdat,
		hasVideoTrack,
		trackCount,
	};
}

function pickLikelyVideoStart(
	data: Uint8Array,
	probes: IsoContainerProbe[],
): number | null {
	for (let i = probes.length - 1; i >= 1; i--) {
		const probe = probes[i];
		if (!probe.hasVideoTrack || !probe.hasMdat) {
			continue;
		}

		if (
			(probe.majorBrand && isLikelyVideoBrand(probe.majorBrand)) ||
			(probe.majorBrand && !isHeifBrand(probe.majorBrand)) ||
			hasVideoBoxSignature(data, probe.start)
		) {
			return probe.start;
		}
	}
	return null;
}

function findTrackHandlerType(
	data: Uint8Array,
	trakBox: IsoBoxInfo,
): string | null {
	const trakBoxes = scanIsoBoxes(data, trakBox.dataStart, trakBox.end);
	const mdiaBox = trakBoxes.find((box) => box.type === "mdia");
	if (!mdiaBox) {
		return null;
	}

	const mdiaBoxes = scanIsoBoxes(data, mdiaBox.dataStart, mdiaBox.end);
	const hdlrBox = mdiaBoxes.find((box) => box.type === "hdlr");
	if (!hdlrBox) {
		return null;
	}

	// FullBox(version+flags=4) + pre_defined=4, then handler_type.
	const handlerOffset = hdlrBox.dataStart + 8;
	if (handlerOffset + 4 > hdlrBox.end) {
		return null;
	}

	return readAscii(data, handlerOffset, 4);
}

function scanIsoBoxes(
	data: Uint8Array,
	from: number,
	toExclusive: number,
): IsoBoxInfo[] {
	const boxes: IsoBoxInfo[] = [];
	if (toExclusive <= from || from < 0 || toExclusive > data.length) {
		return boxes;
	}

	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let offset = from;
	while (offset + 8 <= toExclusive) {
		const size32 = view.getUint32(offset);
		const type = readAscii(data, offset + 4, 4);
		let size = size32;
		let headerSize = 8;

		if (size32 === 1) {
			if (offset + 16 > toExclusive) break;
			const high = view.getUint32(offset + 8);
			const low = view.getUint32(offset + 12);
			size = high * 2 ** 32 + low;
			headerSize = 16;
		} else if (size32 === 0) {
			size = toExclusive - offset;
		}

		if (!Number.isFinite(size) || size < headerSize) {
			break;
		}

		const end = offset + size;
		if (end > toExclusive) {
			break;
		}

		boxes.push({
			start: offset,
			size,
			headerSize,
			type,
			dataStart: offset + headerSize,
			end,
		});

		offset = end;
	}

	return boxes;
}

function pickTailFtypVideoStart(data: Uint8Array): number | null {
	const starts = collectIsoContainerStarts(data);
	if (starts.length < 2) return null;

	// Fallback strategy: many Live Photo payloads place the embedded video near the end.
	const lastStart = starts[starts.length - 1];
	const brand = readMajorBrandAtStart(data, lastStart);
	if (!brand) return null;

	if (isLikelyVideoBrand(brand) || hasMp4BoxNearStart(data, lastStart)) {
		return lastStart;
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

function hasMp4BoxNearStart(data: Uint8Array, start: number): boolean {
	const end = Math.min(data.length, start + 8 * 1024);
	const probe = data.subarray(start, end);
	return (
		findPattern(probe, [0x6d, 0x6f, 0x6f, 0x76]) >= 0 || // moov
		findPattern(probe, [0x6d, 0x64, 0x61, 0x74]) >= 0 || // mdat
		findPattern(probe, [0x74, 0x72, 0x61, 0x6b]) >= 0 // trak
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

export function extractHeifItemsFromMdat(
	data: Uint8Array,
): HeifExtractedItem[] {
	const topBoxes = scanIsoBoxes(data, 0, data.length);
	const metaBox = topBoxes.find((box) => box.type === "meta");
	if (!metaBox) {
		return [];
	}

	const metaChildren = scanIsoBoxes(data, metaBox.dataStart + 4, metaBox.end);
	const ilocBox = metaChildren.find((box) => box.type === "iloc");
	if (!ilocBox) {
		return [];
	}

	const itemTypes = parseIinfItemTypes(data, metaChildren);
	const itemLocations = parseIlocEntries(data, ilocBox);
	if (!itemLocations.length) {
		return [];
	}

	const mdatRanges = topBoxes
		.filter((box) => box.type === "mdat")
		.map((box) => ({ start: box.dataStart, end: box.end }));

	const extracted: HeifExtractedItem[] = [];
	for (const entry of itemLocations) {
		if (entry.constructionMethod !== 0) {
			continue;
		}

		for (const extent of entry.extents) {
			const absoluteOffset = entry.baseOffset + extent.offset;
			if (absoluteOffset < 0 || extent.length <= 0) {
				continue;
			}
			if (absoluteOffset + extent.length > data.length) {
				continue;
			}

			const inMdat = mdatRanges.some(
				(range) =>
					absoluteOffset >= range.start &&
					absoluteOffset + extent.length <= range.end,
			);

			extracted.push({
				itemId: entry.itemId,
				itemType: itemTypes.get(entry.itemId) ?? null,
				constructionMethod: entry.constructionMethod,
				absoluteOffset,
				length: extent.length,
				inMdat,
				bytes: data.slice(absoluteOffset, absoluteOffset + extent.length),
			});
		}
	}

	return extracted;
}

async function extractImageFramesFromMdatItems(
	data: Uint8Array,
): Promise<MdatFrameExtractionResult> {
	if (typeof window === "undefined") {
		return {
			frames: [],
			totalItems: 0,
			selectedFrameCount: 0,
			selectedResolution: null,
		};
	}

	const items = extractHeifItemsFromMdat(data)
		.filter((item) => item.inMdat && item.length >= 64)
		.sort((a, b) => a.absoluteOffset - b.absoluteOffset);
	if (!items.length) {
		return {
			frames: [],
			totalItems: 0,
			selectedFrameCount: 0,
			selectedResolution: null,
		};
	}

	const decodedFrames: DecodedItemFrame[] = [];
	for (const item of items) {
		const mime = detectEmbeddedImageMime(item.bytes);
		if (!mime) {
			continue;
		}

		const normalizedBytes = new Uint8Array(item.bytes.byteLength);
		normalizedBytes.set(item.bytes);
		const blob = new Blob([normalizedBytes], { type: mime });
		const decoded = await decodeImageBlobInfo(blob);
		if (!decoded) {
			continue;
		}

		decodedFrames.push({
			blob,
			width: decoded.width,
			height: decoded.height,
			absoluteOffset: item.absoluteOffset,
		});
	}

	if (!decodedFrames.length) {
		return {
			frames: [],
			totalItems: items.length,
			selectedFrameCount: 0,
			selectedResolution: null,
		};
	}

	const selected = selectPrimarySequenceFrames(decodedFrames);

	return {
		frames: selected.frames,
		totalItems: items.length,
		selectedFrameCount: selected.frames.length,
		selectedResolution: selected.resolution,
	};
}

interface IlocExtent {
	offset: number;
	length: number;
}

interface IlocEntry {
	itemId: number;
	constructionMethod: number;
	baseOffset: number;
	extents: IlocExtent[];
}

function parseIinfItemTypes(
	data: Uint8Array,
	metaChildren: IsoBoxInfo[],
): Map<number, string> {
	const iinfBox = metaChildren.find((box) => box.type === "iinf");
	if (!iinfBox) {
		return new Map();
	}

	const itemTypes = new Map<number, string>();
	const infeBoxes = scanIsoBoxes(
		data,
		iinfBox.dataStart + 4,
		iinfBox.end,
	).filter((box) => box.type === "infe");
	for (const infeBox of infeBoxes) {
		const type = parseInfeItemType(data, infeBox);
		if (!type) {
			continue;
		}
		itemTypes.set(type.itemId, type.itemType);
	}

	return itemTypes;
}

function parseInfeItemType(
	data: Uint8Array,
	infeBox: IsoBoxInfo,
): { itemId: number; itemType: string } | null {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	if (infeBox.dataStart + 4 > infeBox.end) {
		return null;
	}

	const version = data[infeBox.dataStart];
	let offset = infeBox.dataStart + 4; // skip FullBox(version+flags)
	if (version >= 2) {
		const itemId =
			version === 2 ? view.getUint16(offset) : view.getUint32(offset);
		offset += version === 2 ? 2 : 4;
		offset += 2; // item_protection_index
		if (offset + 4 > infeBox.end) {
			return null;
		}
		return {
			itemId,
			itemType: readAscii(data, offset, 4),
		};
	}
	return null;
}

function parseIlocEntries(data: Uint8Array, ilocBox: IsoBoxInfo): IlocEntry[] {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let offset = ilocBox.dataStart;
	if (offset + 4 > ilocBox.end) {
		return [];
	}

	const version = data[offset];
	offset += 4; // FullBox(version+flags)
	if (offset + 2 > ilocBox.end) {
		return [];
	}

	const sizeByte = data[offset];
	const sizeByte2 = data[offset + 1];
	const offsetSize = (sizeByte & 0xf0) >> 4;
	const lengthSize = sizeByte & 0x0f;
	const baseOffsetSize = (sizeByte2 & 0xf0) >> 4;
	const indexSize = version === 1 || version === 2 ? sizeByte2 & 0x0f : 0;
	offset += 2;

	let itemCount = 0;
	if (version < 2) {
		if (offset + 2 > ilocBox.end) return [];
		itemCount = view.getUint16(offset);
		offset += 2;
	} else {
		if (offset + 4 > ilocBox.end) return [];
		itemCount = view.getUint32(offset);
		offset += 4;
	}

	const entries: IlocEntry[] = [];
	for (let i = 0; i < itemCount; i++) {
		if (offset >= ilocBox.end) break;

		let itemId = 0;
		if (version < 2) {
			if (offset + 2 > ilocBox.end) break;
			itemId = view.getUint16(offset);
			offset += 2;
		} else {
			if (offset + 4 > ilocBox.end) break;
			itemId = view.getUint32(offset);
			offset += 4;
		}

		let constructionMethod = 0;
		if (version === 1 || version === 2) {
			if (offset + 2 > ilocBox.end) break;
			const field = view.getUint16(offset);
			constructionMethod = field & 0x000f;
			offset += 2;
		}

		if (offset + 2 > ilocBox.end) break;
		offset += 2; // data_reference_index
		const baseOffset = readUintVariable(view, offset, baseOffsetSize);
		offset += baseOffsetSize;

		if (offset + 2 > ilocBox.end) break;
		const extentCount = view.getUint16(offset);
		offset += 2;

		const extents: IlocExtent[] = [];
		for (let j = 0; j < extentCount; j++) {
			if ((version === 1 || version === 2) && indexSize > 0) {
				offset += indexSize;
			}
			const extentOffset = readUintVariable(view, offset, offsetSize);
			offset += offsetSize;
			const extentLength = readUintVariable(view, offset, lengthSize);
			offset += lengthSize;
			extents.push({
				offset: extentOffset,
				length: extentLength,
			});
		}

		entries.push({
			itemId,
			constructionMethod,
			baseOffset,
			extents,
		});
	}

	return entries;
}

function readUintVariable(
	view: DataView,
	offset: number,
	byteLength: number,
): number {
	if (byteLength <= 0) {
		return 0;
	}
	let value = 0;
	for (let i = 0; i < byteLength; i++) {
		value = value * 256 + view.getUint8(offset + i);
	}
	return value;
}

function detectEmbeddedImageMime(bytes: Uint8Array): string | null {
	if (bytes.length < 12) {
		return null;
	}

	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg";
	}

	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	) {
		return "image/png";
	}

	if (readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP") {
		return "image/webp";
	}

	if (readAscii(bytes, 4, 4) === "ftyp") {
		const brand = readAscii(bytes, 8, 4);
		if (brand === "avif" || brand === "avis") {
			return "image/avif";
		}
	}

	return null;
}

function selectPrimarySequenceFrames(frames: DecodedItemFrame[]): {
	frames: Blob[];
	resolution: string | null;
} {
	const groups = new Map<string, DecodedItemFrame[]>();
	for (const frame of frames) {
		const key = `${frame.width}x${frame.height}`;
		const list = groups.get(key);
		if (list) {
			list.push(frame);
		} else {
			groups.set(key, [frame]);
		}
	}

	let bestKey: string | null = null;
	let bestGroup: DecodedItemFrame[] = [];
	for (const [key, group] of groups) {
		if (
			group.length > bestGroup.length ||
			(group.length === bestGroup.length &&
				compareResolutionKey(key, bestKey) > 0)
		) {
			bestKey = key;
			bestGroup = group;
		}
	}

	const ordered = [...bestGroup].sort(
		(a, b) => a.absoluteOffset - b.absoluteOffset,
	);
	return {
		frames: ordered.map((frame) => frame.blob),
		resolution: bestKey,
	};
}

function compareResolutionKey(a: string, b: string | null): number {
	if (!b) {
		return 1;
	}
	const [aw, ah] = a.split("x").map((v) => Number(v));
	const [bw, bh] = b.split("x").map((v) => Number(v));
	return aw * ah - bw * bh;
}

async function decodeImageBlobInfo(
	blob: Blob,
): Promise<{ width: number; height: number } | null> {
	try {
		const bitmap = await createImageBitmap(blob);
		const width = bitmap.width;
		const height = bitmap.height;
		bitmap.close();
		return { width, height };
	} catch {
		return null;
	}
}
