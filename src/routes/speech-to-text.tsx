import { createFileRoute } from "@tanstack/react-router";
import { Mic, Upload, Link as LinkIcon, FileText, Download, Loader2, Play, StopCircle } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { exportToTxt, exportToJson } from "@/lib/audio-utils";
import { useTranscription } from "@/hooks/use-transcription";

export const Route = createFileRoute("/speech-to-text")({
	component: SpeechToText,
});

function SpeechToText() {
	const {
		model, setModel,
		task, setTask,
		language, setLanguage,
		transcribe,
		loading,
		status,
		progress,
		result
	} = useTranscription();

	const [audioUrl, setAudioUrl] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [isRecording, setIsRecording] = useState(false);
	const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
	
	const mediaRecorder = useRef<MediaRecorder | null>(null);
	const audioChunks = useRef<Blob[]>([]);

	const handleUrlProcess = async () => {
		if (!audioUrl) {
			toast.error("请输入音频 URL");
			return;
		}
		
		try {
			const response = await fetch(audioUrl);
			if (!response.ok) throw new Error("下载失败");
			const arrayBuffer = await response.arrayBuffer();
			await transcribe(arrayBuffer);
		} catch (error: any) {
			toast.error(`下载失败: ${error.message}`);
		}
	};

	const handleFileProcess = async () => {
		if (!file) {
			toast.error("请选择音频文件");
			return;
		}
		const arrayBuffer = await file.arrayBuffer();
		await transcribe(arrayBuffer);
	};

	const startRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder.current = new MediaRecorder(stream);
			audioChunks.current = [];

			mediaRecorder.current.ondataavailable = (event) => {
				audioChunks.current.push(event.data);
			};

			mediaRecorder.current.onstop = () => {
				const blob = new Blob(audioChunks.current, { type: "audio/wav" });
				setRecordingBlob(blob);
			};

			mediaRecorder.current.start();
			setIsRecording(true);
		} catch (error: any) {
			toast.error(`无法访问麦克风: ${error.message}`);
		}
	};

	const stopRecording = () => {
		if (mediaRecorder.current && isRecording) {
			mediaRecorder.current.stop();
			setIsRecording(false);
			mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
		}
	};

	const handleRecordingProcess = async () => {
		if (!recordingBlob) {
			toast.error("没有录音数据");
			return;
		}
		const arrayBuffer = await recordingBlob.arrayBuffer();
		await transcribe(arrayBuffer);
	};

	const handleExportTxt = () => {
		if (!result) return;
		exportToTxt(result.text, "transcription");
	};

	const handleExportJson = () => {
		if (!result) return;
		exportToJson(result, "transcription");
	};

	return (
		<div className="container mx-auto max-w-4xl space-y-8 px-4 py-10">
			<div className="flex flex-col items-center space-y-4 text-center">
				<h1 className="bg-gradient-to-r from-blue-500 to-teal-600 bg-clip-text font-extrabold text-4xl text-transparent tracking-tight lg:text-5xl">
					语音转文字
				</h1>
				<p className="max-w-lg text-muted-foreground">
					使用 Whisper 模型进行 ASR (Automatic Speech Recognition，自动语音识别)。在浏览器中直接将语音转换为文字，保护隐私且高效。
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-3">
				<Card className="md:col-span-2">
					<CardHeader>
						<CardTitle>音频输入</CardTitle>
						<CardDescription>选择一种方式加载音频</CardDescription>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue="file" className="w-full">
							<TabsList className="grid w-full grid-cols-3">
								<TabsTrigger value="file"><Upload className="mr-2 h-4 w-4" /> 文件</TabsTrigger>
								<TabsTrigger value="url"><LinkIcon className="mr-2 h-4 w-4" /> URL</TabsTrigger>
								<TabsTrigger value="record"><Mic className="mr-2 h-4 w-4" /> 录音</TabsTrigger>
							</TabsList>
							
							<TabsContent value="file" className="space-y-4 pt-4">
								<div className="grid w-full items-center gap-1.5">
									<Label htmlFor="audio-file">音频文件</Label>
									<Input 
										id="audio-file" 
										type="file" 
										accept="audio/*" 
										onChange={(e) => setFile(e.target.files?.[0] || null)}
									/>
								</div>
								<Button onClick={handleFileProcess} disabled={loading || !file} className="w-full">
									{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
									开始转换
								</Button>
							</TabsContent>
							
							<TabsContent value="url" className="space-y-4 pt-4">
								<div className="grid w-full items-center gap-1.5">
									<Label htmlFor="audio-url">音频 URL</Label>
									<Input 
										id="audio-url" 
										placeholder="https://example.com/audio.mp3" 
										value={audioUrl}
										onChange={(e) => setAudioUrl(e.target.value)}
									/>
								</div>
								<Button onClick={handleUrlProcess} disabled={loading || !audioUrl} className="w-full">
									{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
									开始转换
								</Button>
							</TabsContent>
							
							<TabsContent value="record" className="space-y-4 pt-4 text-center">
								<div className="flex flex-col items-center justify-center space-y-4 py-4">
									{isRecording ? (
										<Button variant="destructive" size="lg" onClick={stopRecording} className="h-16 w-16 rounded-full">
											<StopCircle className="h-8 w-8" />
										</Button>
									) : (
										<Button variant="outline" size="lg" onClick={startRecording} className="h-16 w-16 rounded-full">
											<Mic className="h-8 w-8" />
										</Button>
									)}
									<p className="text-sm text-muted-foreground">
										{isRecording ? "正在录音..." : recordingBlob ? "录音已完成" : "点击麦克风开始录音"}
									</p>
									{recordingBlob && !isRecording && (
										<audio controls src={URL.createObjectURL(recordingBlob)} className="w-full" />
									)}
								</div>
								<Button onClick={handleRecordingProcess} disabled={loading || !recordingBlob || isRecording} className="w-full">
									{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
									转换录音
								</Button>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>配置</CardTitle>
						<CardDescription>模型和任务设置</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>模型</Label>
							<Select value={model} onValueChange={setModel}>
								<SelectTrigger>
									<SelectValue placeholder="选择模型" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="onnx-community/whisper-tiny">Whisper Tiny (极快)</SelectItem>
									<SelectItem value="onnx-community/whisper-base">Whisper Base (准)</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>识别语言</Label>
							<Select value={language as string} onValueChange={(v) => setLanguage(v as any)}>
								<SelectTrigger>
									<SelectValue placeholder="选择语言" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="chinese">中文简体</SelectItem>
									<SelectItem value="english">英文</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>翻译为英文</Label>
								<p className="text-[0.8rem] text-muted-foreground">将非英文语音翻译为英文</p>
							</div>
							<Switch 
								checked={task === "translate"} 
								onCheckedChange={(checked) => setTask(checked ? "translate" : "transcribe")} 
							/>
						</div>
					</CardContent>
				</Card>
			</div>

			{loading && (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-10 space-y-6">
						<div className="flex flex-col items-center">
							<Loader2 className="h-10 w-10 animate-spin text-primary" />
							<p className="mt-4 font-medium">{status}</p>
						</div>
						
						{Object.keys(progress).length > 0 && (
							<div className="w-full max-w-md space-y-4">
								{Object.entries(progress).map(([file, p]) => (
									<div key={file} className="space-y-1">
										<div className="flex justify-between text-xs text-muted-foreground">
											<span className="truncate mr-4">{file}</span>
											<span>{Math.round(p)}%</span>
										</div>
										<Progress value={p} className="h-1" />
									</div>
								))}
							</div>
						)}
						
						<p className="text-sm text-muted-foreground text-center">
							首次加载模型可能需要一些时间 (约 40-150MB)，之后会从浏览器缓存读取。
						</p>
					</CardContent>
				</Card>
			)}

			{result && (
				<Card className="fade-in animate-in duration-500">
					<CardHeader className="flex flex-row items-center justify-between space-y-0">
						<div>
							<CardTitle>转换结果</CardTitle>
							<CardDescription>识别出的文字内容</CardDescription>
						</div>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={handleExportTxt}>
								<FileText className="mr-2 h-4 w-4" /> TXT
							</Button>
							<Button variant="outline" size="sm" onClick={handleExportJson}>
								<Download className="mr-2 h-4 w-4" /> JSON
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						<div className="rounded-md bg-muted p-4">
							<p className="whitespace-pre-wrap leading-relaxed">{result.text}</p>
						</div>
						{result.chunks && (
							<div className="mt-6 space-y-4">
								<h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">时间戳详情</h3>
								<div className="grid gap-2">
									{result.chunks.map((chunk: any, i: number) => (
										<div key={i} className="flex gap-4 text-sm border-b pb-2 last:border-0">
											<span className="font-mono text-muted-foreground w-24 shrink-0">
												[{chunk.timestamp[0].toFixed(2)}s - {chunk.timestamp[1]?.toFixed(2) || "..."}s]
											</span>
											<span>{chunk.text}</span>
										</div>
									))}
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}