import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { Upload, Download, Loader2, Image as ImageIcon, Play, Disc, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { parseHeicDirectly } from '@/lib/live-photo-parser2'

export const Route = createFileRoute('/live-photo-tool')({
  component: LivePhotoTool,
})

function LivePhotoTool() {
  const [loading, setLoading] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [result, setResult] = useState<any>()
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    try {
      const buffer = await file.arrayBuffer()
      const { photoUrl, photoBlob, videoUrl, videoBlob } = await parseHeicDirectly(buffer, file)

      setResult({
        imagePreviewUrl: photoUrl,
        imageBlob: photoBlob,
        videoUrl: videoUrl || undefined,
        videoBlob: videoBlob || undefined,
      })
      toast.success(videoBlob ? 'Live Photo 解析成功' : '图片读取成功')
    } catch (err: any) {
      console.error(err)
      toast.error(`解析失败: ${err.message || '该文件解析出错'}`)
    } finally {
      setLoading(false)
    }
  }

  const downloadFile = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  useEffect(() => {
    if (isHovering && videoRef.current && result?.videoUrl) {
      videoRef.current.play().catch(console.error)
    } else if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [isHovering, result])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (result) {
        URL.revokeObjectURL(result.imagePreviewUrl)
        if (result.videoUrl) URL.revokeObjectURL(result.videoUrl)
      }
    }
  }, [result])

  return (
    <div className="container mx-auto py-10 px-4 max-w-5xl">
      <div className="flex flex-col items-center space-y-4 text-center mb-10">
        <h1 className="font-black text-5xl text-primary uppercase tracking-tighter lg:text-7xl">
          Live Photo 解析器
        </h1>
        <p className="max-w-xl text-muted-foreground text-lg font-medium">
          在浏览器中解析 Apple Live Photo (HEIF/HEIC)，提取并预览动态效果。
          也支持普通图片上传。无需上传到服务器，保护您的隐私。
        </p>
      </div>

      <Card className="w-full overflow-hidden border-2 border-border shadow-2xl rounded-xl bg-card">
        <CardContent className="p-0">
          {!result ? (
            <div className="aspect-video flex flex-col items-center justify-center bg-muted/20 space-y-6 p-10">
              {loading ? (
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="h-16 w-16 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="text-xl font-bold text-primary">正在解析中...</p>
                    <p className="text-sm text-muted-foreground mt-1">正在提取图像或视频轨道</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-primary/10 p-8 rounded-full ring-8 ring-primary/5">
                    <ImageIcon className="h-16 w-16 text-primary" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold">上传您的 Live Photo 或图片</h3>
                    <p className="text-muted-foreground max-w-sm">
                      支持 .heic, .heif, .mov, .jpg, .png 等格式。
                    </p>
                  </div>
                  <div className="relative group">
                    <input
                      type="file"
                      accept=".heic,.heif,.mov,.mp4,.jpg,.jpeg,.png,.webp"
                      onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    <Button size="lg" className="rounded-full px-10 h-14 text-lg font-bold shadow-lg transition-transform group-hover:scale-105 active:scale-95">
                      <Upload className="mr-2 h-6 w-6" /> 选择文件
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="relative aspect-video bg-black flex items-center justify-center group overflow-hidden">
              {/* Static Image */}
              <img
                src={result.imagePreviewUrl}
                alt="Static Preview"
                className={`w-full h-full object-contain transition-opacity duration-500 ease-in-out ${isHovering && result.videoUrl ? 'opacity-0' : 'opacity-100'}`}
              />
              
              {/* Video Player */}
              {result.videoUrl && (
                <video
                  ref={videoRef}
                  src={result.videoUrl}
                  loop
                  muted
                  playsInline
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget
                    console.info("[live-photo-tool] video metadata loaded", {
                      duration: video.duration,
                      width: video.videoWidth,
                      height: video.videoHeight,
                      currentSrc: video.currentSrc,
                    })
                  }}
                  onError={(e) => {
                    const video = e.currentTarget
                    console.error("[live-photo-tool] video playback error", {
                      code: video.error?.code,
                      message: video.error?.message,
                      currentSrc: video.currentSrc,
                    })
                  }}
                  className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ease-in-out ${isHovering ? 'opacity-100' : 'opacity-0'}`}
                />
              )}

              {/* Live Icon Overlay */}
              {result.videoUrl && (
                <div 
                  className="absolute top-6 left-6 z-20"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                >
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-xl border border-white/30 transition-all duration-300 cursor-help ${isHovering ? 'bg-primary text-white scale-110 shadow-[0_0_20px_rgba(var(--primary),0.5)]' : 'bg-black/40 text-white/90'}`}>
                    <Disc className={`h-5 w-5 ${isHovering ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                    <span className="text-sm font-bold tracking-widest uppercase">Live</span>
                  </div>
                  {/* Tooltip hint */}
                  {!isHovering && (
                    <div className="absolute top-full left-0 mt-2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                      悬停此处播放
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Action Bar */}
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300 flex justify-between items-center">
                <div className="flex gap-3">
                  <Button 
                    variant="secondary" 
                    className="rounded-full font-bold shadow-xl backdrop-blur-md bg-white/20 hover:bg-white/30 text-white border-none"
                    onClick={() => downloadFile(result.imageBlob, 'image.jpg')}
                  >
                    <Download className="mr-2 h-4 w-4" /> {result.videoUrl ? 'JPG' : '下载'}
                  </Button>
                  {result.videoBlob && (
                    <Button 
                      variant="secondary" 
                      className="rounded-full font-bold shadow-xl backdrop-blur-md bg-white/20 hover:bg-white/30 text-white border-none"
                      onClick={() => downloadFile(result.videoBlob, 'live-photo.mp4')}
                    >
                      <Download className="mr-2 h-4 w-4" /> MP4
                    </Button>
                  )}
                </div>
                <Button 
                  variant="destructive" 
                  size="icon"
                  className="rounded-full shadow-xl"
                  onClick={() => {
                    setResult(null)
                    setIsHovering(false)
                  }}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-muted/30 border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <Disc className="h-4 w-4" /> 什么是 Live Photo？
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground leading-relaxed">
            Apple Live Photo 在拍摄瞬间记录了前后 1.5 秒的影音。
            在 HEIF 容器中，它通常包含一个高质量图像轨道和一个 HEVC 短视频轨道。
          </CardContent>
        </Card>
        
        <Card className="bg-muted/30 border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <Play className="h-4 w-4" /> 交互预览
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground leading-relaxed">
            解析完成后，将鼠标悬停在左上角的 <span className="font-bold text-foreground">LIVE</span> 图标上即可触发动态播放，移开后自动恢复静态。
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <Download className="h-4 w-4" /> 导出提取
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground leading-relaxed">
            您可以单独提取高清静态图片（PNG）或原始视频片段（MP4），方便在非 Apple 设备或社交平台上使用。
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
