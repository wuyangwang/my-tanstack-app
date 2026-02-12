import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Video,
  Mic,
  ArrowRight,
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const features = [
    {
      icon: <Video className="w-12 h-12" />,
      title: '抖音工具',
      description: '高效的抖音视频下载与分析工具。',
      link: '/douyin-tool'
    },
    {
      icon: <Mic className="w-12 h-12" />,
      title: '语音转文字',
      description: '基于 OpenAI Whisper 的高性能本地语音识别。',
      link: '/speech-to-text'
    },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <section className="relative py-32 px-6 text-center border-b border-border">
        <div className="relative max-w-5xl mx-auto">
          <div className="flex items-center justify-center mb-6">
            <h1 className="text-7xl md:text-9xl font-black uppercase tracking-tighter text-primary">
              工具箱
            </h1>
          </div>
          <p className="text-xl md:text-2xl text-muted-foreground mb-12 font-medium tracking-tight max-w-2xl mx-auto">
            一系列高效、现代化的工具集合，旨在提升您的工作效率。
          </p>
          <div className="flex flex-col items-center gap-4">
            <Link
              to="/douyin-tool"
              className="group flex items-center gap-2 px-10 py-4 bg-primary text-primary-foreground font-bold rounded-full transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
            >
              立刻开始
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold mb-12 uppercase tracking-widest text-center">核心功能</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <Link
              key={index}
              to={feature.link}
              className="group block bg-card border border-border rounded-2xl p-8 hover:border-primary/50 hover:bg-accent transition-all duration-300 shadow-sm"
            >
              <div className="mb-6 text-primary transition-all duration-300 group-hover:scale-110">{feature.icon}</div>
              <h3 className="text-2xl font-bold mb-4 uppercase tracking-tight">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed text-lg transition-colors">
                {feature.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <footer className="py-12 border-t border-border text-center text-muted-foreground text-sm uppercase tracking-widest">
        &copy; {new Date().getFullYear()} 工具箱. Built with TanStack Start.
      </footer>
    </div>
  )
}
