import { parseHeicContainer, type HeicParseKind } from "@/lib/heic-parser";

interface ParsedLivePhoto {
	photoBlob: Blob;
	photoUrl: string;
	videoBlob: Blob | null;
	videoUrl: string | null;
	kind: HeicParseKind;
}

const LOG_TAG = "[live-photo-parser2]";

/**
 * Parse HEIC/Live Photo payload and split image/video payload.
 * For HEIC item sequences, this can synthesize an MP4 in-browser.
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

	const result = await parseHeicContainer(buffer, file);

	console.info(
		`${LOG_TAG} parse done`,
		JSON.stringify({
			kind: result.kind,
			photoType: result.photoBlob.type || "(empty)",
			photoSize: result.photoBlob.size,
			videoType: result.videoBlob?.type || null,
			videoSize: result.videoBlob?.size || 0,
			diagnostics: result.diagnostics,
		}),
	);

	return {
		photoBlob: result.photoBlob,
		photoUrl: URL.createObjectURL(result.photoBlob),
		videoBlob: result.videoBlob,
		videoUrl: result.videoBlob ? URL.createObjectURL(result.videoBlob) : null,
		kind: result.kind,
	};
}
