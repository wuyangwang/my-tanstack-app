export interface DetectionResult {
	label: string;
	score: number;
	box: {
		xmin: number;
		ymin: number;
		xmax: number;
		ymax: number;
	};
}

export type TranscriptionTask = "transcribe" | "translate";
export type TranscriptionLanguage = "chinese" | "english";

export interface TranscriptionResult {
	text: string;
	chunks: Array<{
		timestamp: [number, number];
		text: string;
	}>;
}

export type WorkerCommonStatus = "init" | "progress" | "ready" | "error";

export interface WorkerInitMessage {
	status: "init";
	requestId: number;
	message: string;
}

export interface WorkerProgressMessage {
	status: "progress";
	requestId: number;
	file?: string;
	progress: number;
}

export interface WorkerReadyMessage {
	status: "ready";
	requestId: number;
	message: string;
}

export interface WorkerErrorMessage {
	status: "error";
	requestId: number;
	error: string;
}

export interface ObjectDetectionWorkerRequest {
	type: "object-detection:run";
	requestId: number;
	image: string | ImageBitmap;
	model: string;
	threshold: number;
}

export interface ObjectDetectionCompleteMessage {
	status: "complete";
	requestId: number;
	result: DetectionResult[];
}

export type ObjectDetectionWorkerResponse =
	| WorkerInitMessage
	| WorkerProgressMessage
	| WorkerReadyMessage
	| ObjectDetectionCompleteMessage
	| WorkerErrorMessage;

export interface TranscriptionWorkerRequest {
	type: "transcription:run";
	requestId: number;
	audio: Float32Array;
	model: string;
	task: TranscriptionTask;
	language: TranscriptionLanguage;
}

export interface TranscriptionProcessingMessage {
	status: "processing";
	requestId: number;
	message: string;
}

export interface TranscriptionCompleteMessage {
	status: "complete";
	requestId: number;
	result: TranscriptionResult;
}

export type TranscriptionWorkerResponse =
	| WorkerInitMessage
	| WorkerProgressMessage
	| WorkerReadyMessage
	| TranscriptionProcessingMessage
	| TranscriptionCompleteMessage
	| WorkerErrorMessage;
