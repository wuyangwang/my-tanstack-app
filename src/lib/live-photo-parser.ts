import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from "mediabunny";

/**
 * Finds all 'ftyp' pattern positions in the file.
 */
async function findAllFtyps(file: File): Promise<number[]> {
	const size = file.size;
	const chunkSize = 1024 * 1024; // 1MB chunks for faster scan
	const overlap = 8;
	const pattern = [0x66, 0x74, 0x79, 0x70]; // 'ftyp'
	const positions: number[] = [];

	for (let start = 0; start < size; start += chunkSize - overlap) {
		const end = Math.min(size, start + chunkSize);
		const blob = file.slice(start, end);
		const buffer = new Uint8Array(await blob.arrayBuffer());

		for (let i = 0; i <= buffer.length - pattern.length; i++) {
			if (
				buffer[i] === pattern[0] &&
				buffer[i + 1] === pattern[1] &&
				buffer[i + 2] === pattern[2] &&
				buffer[i + 3] === pattern[3]
			) {
				positions.push(start + i);
			}
		}
	}
	return positions;
}

export async function parseLivePhoto(file: File) {
	// Optimization: Detect all ftyp markers
	const ftypPositions = await findAllFtyps(file);
	console.log(`[parseLivePhoto] File size: ${file.size}, ftyp positions: ${ftypPositions.join(", ")}`);

	// Usually, the last ftyp marks the beginning of the appended video
	const lastFtypPos = ftypPositions.length > 0 ? ftypPositions[ftypPositions.length - 1] : -1;
	const isAppended = ftypPositions.length > 1 || (ftypPositions.length === 1 && lastFtypPos > 1024);

	console.log(`[parseLivePhoto] isAppended: ${isAppended}, lastFtypPos: ${lastFtypPos}`);

	const photoBlob = isAppended ? file.slice(0, lastFtypPos - 4) : file;
	const videoBlob = isAppended ? file.slice(lastFtypPos - 4) : null;

	if (videoBlob) {
		console.log(`[parseLivePhoto] videoBlob size: ${videoBlob.size}`);
		const header = new Uint8Array(await videoBlob.slice(0, 16).arrayBuffer());
		console.log(`[parseLivePhoto] videoBlob header (hex): ${Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
	}

	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d")!;

	// Use mediabunny to parse the photo (HEIC is ISOBMFF)
	const photoSource = new BlobSource(photoBlob);
	const photoInput = new Input({ source: photoSource, formats: ALL_FORMATS });
	let imageBlob: Blob | null = null;
	try {
		await photoInput.ready;
		console.log(`[parseLivePhoto] photoInput ready. Tracks found: ${photoInput.tracks?.length || 0}`);
		if (photoInput.tracks) {
			photoInput.tracks.forEach((t, i) => console.log(`[parseLivePhoto] photo track ${i}: type=${t.type}, codec=${t.codec}`));
		}

		// Extract the first frame as a thumbnail
		// Try 'video' first (for HEIC/HEVC sequences), then 'image' if mediabunny supports it
		const imageTrack = photoInput.tracks?.find((t) => t.type === "video" || t.type === "image");
		if (imageTrack) {
			console.log(`[parseLivePhoto] Using track for image: ${imageTrack.type}`);
			const sink = new EncodedPacketSink(imageTrack);
			const packet = await sink.getPacket(0);

			if (packet) {
				await new Promise((resolve) => {
					const decoder = new VideoDecoder({
						output: (frame) => {
							canvas.width = frame.displayWidth;
							canvas.height = frame.displayHeight;
							ctx.drawImage(frame, 0, 0);
							frame.close();
							resolve(true);
						},
						error: (e) => {
							console.error("VideoDecoder error:", e);
							resolve(false);
						},
					});

					decoder.configure({
						codec: imageTrack.codec,
						description: packet.description,
						hardwareAcceleration: "prefer-hardware",
					});

					decoder.decode(
						new EncodedVideoChunk({
							type: packet.type === "key" ? "key" : "delta",
							timestamp: packet.timestamp,
							data: packet.data,
						}),
					);
					decoder.flush();
				});
				imageBlob = await new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, "image/png"),
				);
			}
		}
	} catch (e) {
		console.warn("Mediabunny failed to parse photo input (might be a standard image):", e);
	}

	const imagePreviewUrl = imageBlob
		? URL.createObjectURL(imageBlob)
		: photoBlob.type && !photoBlob.type.includes("heic") && !photoBlob.type.includes("heif")
			? URL.createObjectURL(photoBlob)
			: "";

	// Final fallback: if it's a common image but we still have no preview URL
	let finalPreviewUrl = imagePreviewUrl;
	if (!finalPreviewUrl && photoBlob.size > 0) {
		// If it's not HEIC/HEIF, or we don't know the type, try using it directly
		if (!file.name.toLowerCase().endsWith(".heic") && !file.name.toLowerCase().endsWith(".heif")) {
			finalPreviewUrl = URL.createObjectURL(photoBlob);
		}
	}

	const playLiveVideo = async () => {
		if (!videoBlob) return;
		try {
			const videoInput = new Input({
				source: new BlobSource(videoBlob),
				formats: ALL_FORMATS,
			});
			await videoInput.ready;
			console.log(`[playLiveVideo] videoInput ready. Tracks: ${videoInput.tracks?.length || 0}`);
			if (videoInput.tracks) {
				videoInput.tracks.forEach((t, i) => console.log(`[playLiveVideo] track ${i}: type=${t.type}, codec=${t.codec}`));
			}
			const track = videoInput.tracks?.find((t) => t.type === "video");
			if (!track) {
				console.warn("[playLiveVideo] No video track found!");
				return;
			}

			console.log("Live Photo Video Track:", track);
			// Return the input or track for the caller to use with a sink
			return { input: videoInput, track };
		} catch (e) {
			console.error("Failed to play live video:", e);
			return null;
		}
	};

	return {
		canvas,
		imageBlob,
		imagePreviewUrl: finalPreviewUrl,
		videoBlob,
		play: playLiveVideo,
	};
}
