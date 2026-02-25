import { createFileRoute } from "@tanstack/react-router";
import { Camera, Loader2, Play, StopCircle, Settings2, Image as ImageIcon, Upload } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useObjectDetection } from "@/hooks/use-object-detection";
import { useVConsole } from "@/hooks/use-log";
import { translateLabel } from "@/lib/coco-labels";

export const Route = createFileRoute("/object-detection")({
	component: ObjectDetection,
});

function ObjectDetection() {
	const {
		model, setModel,
		detect,
		loading,
		status,
		progress,
		results
	} = useObjectDetection();

	const [isStreaming, setIsStreaming] = useState(false);
	const [threshold, setThreshold] = useState(0.5);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("camera");

	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
    const staticImageRef = useRef<HTMLImageElement>(null);
	const requestRef = useRef<number>();
	const lastDetectionTime = useRef<number>(0);
    const detectionInterval = 200; // 降低频率以兼顾性能

	useVConsole();

	const startCamera = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ 
				video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } } 
			});
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				setIsStreaming(true);
			}
		} catch (error: any) {
			toast.error(`无法访问摄像头: ${error.message}`);
		}
	};

	const stopCamera = () => {
		if (videoRef.current && videoRef.current.srcObject) {
			const stream = videoRef.current.srcObject as MediaStream;
			stream.getTracks().forEach(track => track.stop());
			videoRef.current.srcObject = null;
			setIsStreaming(false);
			if (requestRef.current) {
				cancelAnimationFrame(requestRef.current);
			}
		}
	};

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setSelectedImage(url);
            // 自动触发一次识别
            setTimeout(() => processStaticImage(url), 100);
        }
    };

    const processStaticImage = async (url: string) => {
        if (!staticImageRef.current) return;
        try {
            const imageBitmap = await createImageBitmap(staticImageRef.current);
            await detect(imageBitmap, threshold);
        } catch (err) {
            toast.error("识别图片失败");
        }
    };

	const drawDetections = useCallback(() => {
		if (!canvasRef.current) return;
        const targetElement = activeTab === "camera" ? videoRef.current : staticImageRef.current;
        if (!targetElement) return;

		const ctx = canvasRef.current.getContext("2d");
		if (!ctx) return;

        let width, height;
        if (targetElement instanceof HTMLVideoElement) {
            width = targetElement.videoWidth;
            height = targetElement.videoHeight;
        } else {
            width = targetElement.naturalWidth;
            height = targetElement.naturalHeight;
        }

        if (width === 0 || height === 0) return;

		canvasRef.current.width = width;
		canvasRef.current.height = height;

		ctx.clearRect(0, 0, width, height);

		results.forEach((detection) => {
			const { xmin, ymin, xmax, ymax } = detection.box;
			const x = xmin * width;
			const y = ymin * height;
			const w = (xmax - xmin) * width;
			const h = (ymax - ymin) * height;

			// Draw box
			ctx.strokeStyle = "#00FF00";
			ctx.lineWidth = Math.max(2, width / 200);
			ctx.strokeRect(x, y, w, h);

			// Draw label
            const labelZh = translateLabel(detection.label);
			ctx.fillStyle = "#00FF00";
			ctx.font = `bold ${Math.max(12, width / 40)}px sans-serif`;
			const label = `${labelZh} ${(detection.score * 100).toFixed(0)}%`;
			const textWidth = ctx.measureText(label).width;
            const labelHeight = Math.max(16, width / 30);
			ctx.fillRect(x, y - labelHeight, textWidth + 10, labelHeight);
			ctx.fillStyle = "#000000";
			ctx.fillText(label, x + 5, y - (labelHeight * 0.25));
		});
	}, [results, activeTab]);

	const detectionLoop = useCallback(async (time: number) => {
		if (activeTab === "camera" && isStreaming && videoRef.current && videoRef.current.readyState === 4) {
			if (time - lastDetectionTime.current >= detectionInterval) {
				try {
					const imageBitmap = await createImageBitmap(videoRef.current);
					await detect(imageBitmap, threshold);
				} catch (err) {
					console.error("Failed to capture frame:", err);
				}
				lastDetectionTime.current = time;
			}
		}
		requestRef.current = requestAnimationFrame(detectionLoop);
	}, [isStreaming, detect, threshold, activeTab]);

	useEffect(() => {
		if (isStreaming && activeTab === "camera") {
			requestRef.current = requestAnimationFrame(detectionLoop);
		}
		return () => {
			if (requestRef.current) cancelAnimationFrame(requestRef.current);
		};
	}, [isStreaming, detectionLoop, activeTab]);

	useEffect(() => {
		drawDetections();
	}, [results, drawDetections]);

    // 切换 Tab 时停止摄像头
    useEffect(() => {
        if (activeTab !== "camera" && isStreaming) {
            stopCamera();
        }
    }, [activeTab]);

	return (
		<div className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
			<div className="flex flex-col items-center space-y-4 text-center">
				<h1 className="font-black text-5xl text-primary uppercase tracking-tighter lg:text-7xl">
					实时目标检测
				</h1>
				<p className="max-w-xl text-muted-foreground text-lg font-medium">
					使用 RF-DETR 模型进行高效本地实时目标检测。
					支持摄像头实时监控与本地图片识别。
				</p>
			</div>

            <Tabs defaultValue="camera" onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-center mb-6">
                    <TabsList className="grid w-full max-w-md grid-cols-2">
                        <TabsTrigger value="camera"><Camera className="mr-2 h-4 w-4" /> 实时摄像头</TabsTrigger>
                        <TabsTrigger value="image"><ImageIcon className="mr-2 h-4 w-4" /> 图片识别</TabsTrigger>
                    </TabsList>
                </div>

                <div className="grid gap-6 lg:grid-cols-4">
                    <Card className="lg:col-span-3 overflow-hidden bg-black relative aspect-video flex items-center justify-center border-2 border-border shadow-2xl rounded-xl">
                        <TabsContent value="camera" className="mt-0 w-full h-full flex items-center justify-center">
                            {!isStreaming && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/20 z-10 space-y-4">
                                    <Camera className="h-16 w-16 text-muted-foreground/50" />
                                    <Button onClick={startCamera} size="lg" className="rounded-full px-8">
                                        启动摄像头
                                    </Button>
                                </div>
                            )}
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                muted 
                                className={`w-full h-full object-contain ${isStreaming ? 'block' : 'hidden'}`}
                            />
                        </TabsContent>

                        <TabsContent value="image" className="mt-0 w-full h-full flex items-center justify-center">
                            {!selectedImage ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/20 z-10 space-y-4">
                                    <ImageIcon className="h-16 w-16 text-muted-foreground/50" />
                                    <div className="relative">
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            onChange={handleImageUpload} 
                                            className="absolute inset-0 opacity-0 cursor-pointer" 
                                        />
                                        <Button size="lg" className="rounded-full px-8">
                                            <Upload className="mr-2 h-4 w-4" /> 上传图片
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <img 
                                    ref={staticImageRef} 
                                    src={selectedImage} 
                                    className="w-full h-full object-contain"
                                    onLoad={() => processStaticImage(selectedImage)}
                                />
                            )}
                        </TabsContent>
                        
                        <canvas 
                            ref={canvasRef} 
                            className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
                        />
                        
                        {loading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
                                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                                <p className="text-white font-bold">{status}</p>
                                {Object.keys(progress).length > 0 && (
                                    <div className="w-64 mt-4 space-y-2">
                                        {Object.entries(progress).map(([file, p]) => (
                                            <div key={file} className="space-y-1">
                                                <Progress value={p} className="h-1" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm uppercase tracking-widest text-primary flex items-center">
                                    <Settings2 className="mr-2 h-4 w-4" /> 控制面板
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-xs">检测阈值: {threshold.toFixed(2)}</Label>
                                    <Slider 
                                        value={[threshold]} 
                                        min={0.1} 
                                        max={0.9} 
                                        step={0.05} 
                                        onValueChange={(v) => {
                                            setThreshold(v[0]);
                                            if (activeTab === "image" && selectedImage) {
                                                processStaticImage(selectedImage);
                                            }
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs">模型</Label>
                                    <Select value={model} onValueChange={setModel}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="onnx-community/rfdetr_medium-ONNX">RF-DETR Medium</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {activeTab === "camera" ? (
                                    <Button 
                                        variant={isStreaming ? "destructive" : "default"} 
                                        className="w-full font-bold"
                                        onClick={isStreaming ? stopCamera : startCamera}
                                        disabled={loading}
                                    >
                                        {isStreaming ? (
                                            <><StopCircle className="mr-2 h-4 w-4" /> 停止检测</>
                                        ) : (
                                            <><Play className="mr-2 h-4 w-4" /> 开始检测</>
                                        )}
                                    </Button>
                                ) : (
                                    <div className="relative">
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            onChange={handleImageUpload} 
                                            className="absolute inset-0 opacity-0 cursor-pointer" 
                                        />
                                        <Button variant="outline" className="w-full font-bold">
                                            更换图片
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm uppercase tracking-widest text-primary">检测结果 ({results.length})</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                                    {results.length === 0 ? (
                                        <p className="text-xs text-muted-foreground text-center py-4">未检测到目标</p>
                                    ) : (
                                        results.map((res, i) => (
                                            <div key={i} className="flex justify-between items-center bg-muted p-2 rounded text-xs border-l-4 border-primary">
                                                <span className="font-bold">{translateLabel(res.label)}</span>
                                                <span className="text-primary font-mono">{(res.score * 100).toFixed(0)}%</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </Tabs>
            
            <div className="text-center text-sm text-muted-foreground">
                提示：RF-DETR 模型擅长处理复杂场景。您可以上传一张图片来测试模型的精准度。
            </div>
		</div>
	);
}
