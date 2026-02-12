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
      icon: <Video className="w-12 h-12 text-white" />,
      title: '抖音工具',
      description: '高效的抖音视频下载与分析工具。',
      link: '/douyin-tool'
    },
    {
      icon: <Mic className="w-12 h-12 text-white" />,
      title: '语音转文字',
      description: '基于 OpenAI Whisper 的高性能本地语音识别。',
      link: '/speech-to-text'
    },
  ]

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <section className="relative py-32 px-6 text-center border-b border-white/10">
        <div className="relative max-w-5xl mx-auto">
          <div className="flex items-center justify-center mb-6">
            <h1 className="text-7xl md:text-9xl font-black uppercase tracking-tighter">
              工具箱
            </h1>
          </div>
          <p className="text-xl md:text-2xl text-zinc-400 mb-12 font-medium tracking-tight max-w-2xl mx-auto">
            一系列高效、现代化的工具集合，旨在提升您的工作效率。
          </p>
          <div className="flex flex-col items-center gap-4">
            <Link
              to="/douyin-tool"
              className="group flex items-center gap-2 px-10 py-4 bg-white text-black font-bold rounded-full transition-all hover:scale-105 active:scale-95"
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
              className="group block bg-zinc-900 border border-white/10 rounded-2xl p-8 hover:bg-white hover:text-black transition-all duration-500"
            >
              <div className="mb-6 group-hover:invert transition-all duration-500">{feature.icon}</div>
              <h3 className="text-2xl font-bold mb-4 uppercase tracking-tight">
                {feature.title}
              </h3>
              <p className="text-zinc-400 group-hover:text-zinc-800 leading-relaxed text-lg transition-colors">
                {feature.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <footer className="py-12 border-t border-white/10 text-center text-zinc-500 text-sm uppercase tracking-widest">
        &copy; {new Date().getFullYear()} 工具箱. Built with TanStack Start.
      </footer>
    </div>
  )
}
