import { BlobSource, Input, MP4 } from "mediabunny";

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
 * Parse HEIC/Live Photo payload and extract a preview image + optional video blob.
 */
export async function parseHeicDirectly(
	buffer: ArrayBuffer,
	file: File,
): Promise<ParsedLivePhoto> {
	// Validate container upfront through mediabunny (lightweight parse guard)
	const input = new Input({
		source: new BlobSource(file),
		formats: [MP4],
	});
	await input.ready;

	const u8 = new Uint8Array(buffer);
	const boxes = parseTopLevelBoxes(u8);

	const metaBox = boxes.find((b) => b.type === "meta");
	const mdatBox = boxes.find((b) => b.type === "mdat");
	const moovBox = boxes.find((b) => b.type === "moov");

	if (!metaBox || !mdatBox) {
		throw new Error("Missing essential HEIC boxes (meta/mdat)");
	}

	const description = extractHvccDescription(u8, metaBox);
	const codec = buildCodecString(description);

	const firstChunk = readFirstMdatChunk(u8, mdatBox);
	if (!firstChunk) {
		throw new Error("No decodable frame payload found in mdat");
	}

	const previewFrame = await decodeFirstFrame(codec, description, firstChunk);
	const photoBlob = await frameToJpegBlob(previewFrame);
	previewFrame.close();

	const videoBlob = moovBox
		? new Blob([u8.subarray(Math.max(0, moovBox.start - 4))], {
				type: "video/mp4",
			})
		: null;

	return {
		photoBlob,
		photoUrl: URL.createObjectURL(photoBlob),
		videoBlob,
		videoUrl: videoBlob ? URL.createObjectURL(videoBlob) : null,
	};
}

function parseTopLevelBoxes(data: Uint8Array): Box[] {
	const boxes: Box[] = [];
	let offset = 0;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

	while (offset + 8 <= data.length) {
		let size = view.getUint32(offset);
		const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
		let headerSize = 8;

		if (size === 1) {
			if (offset + 16 > data.length) break;
			const largeSize = view.getBigUint64(offset + 8);
			size = Number(largeSize);
			headerSize = 16;
		}

		if (size < headerSize || offset + size > data.length) break;

		boxes.push({ type, start: offset, size, headerSize });
		offset += size;
	}

	return boxes;
}

function extractHvccDescription(data: Uint8Array, metaBox: Box): Uint8Array {
	const metaStart = metaBox.start + metaBox.headerSize + 4; // FullBox version/flags
	const metaEnd = metaBox.start + metaBox.size;
	const metaContent = data.subarray(metaStart, metaEnd);
	const hvcCPos = findPattern(metaContent, [0x68, 0x76, 0x63, 0x43]); // 'hvcC'

	if (hvcCPos < 4) {
		throw new Error("hvcC box not found in meta box");
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

function buildCodecString(description: Uint8Array): string {
	if (description.length < 13) {
		throw new Error("Invalid hvcC configuration data");
	}

	const profile = description[1];
	const tier = description[2] & 0x20 ? "H" : "L";
	const level = description[12];
	return `hvc1.${profile}.6.${tier}${level}.B0`;
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

async function decodeFirstFrame(
	codec: string,
	description: Uint8Array,
	chunkData: Uint8Array,
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

		decoder.configure({
			codec,
			description,
			hardwareAcceleration: "prefer-hardware",
		});

		decoder.decode(
			new EncodedVideoChunk({
				type: "key",
				timestamp: 0,
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
	const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Unable to get 2d context from OffscreenCanvas");
	}

	ctx.drawImage(frame, 0, 0);
	return canvas.convertToBlob({
		type: "image/jpeg",
		quality: 0.9,
	});
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
