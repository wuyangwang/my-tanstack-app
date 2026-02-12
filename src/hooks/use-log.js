import { useEffect, useRef } from 'react';

/**
 * 当 URL 包含 log=true 时自动初始化 vConsole
 */
export const useVConsole = () => {
  const vConsoleRef = useRef(null);

  useEffect(() => {
    // 1. 检查 URL 参数
    const params = new URLSearchParams(window.location.search);
    const shouldShowLog = params.get('log') === 'true';

    if (shouldShowLog && !vConsoleRef.current) {
      // 2. 动态加载 vConsole，避免在生产环境常规逻辑中占用包体积
      // 这里建议使用动态导入 (Dynamic Import)
      import('vconsole').then((VConsoleModule) => {
        const VConsole = VConsoleModule.default;
        
        // 3. 初始化实例
        vConsoleRef.current = new VConsole({
          // theme: 'dark', // 可选配置
          onReady: () => {
            console.log('vConsole 已激活');
          }
        });
      }).catch(err => {
        console.error('vConsole 加载失败', err);
      });
    }

    // 组件卸载时销毁实例（可选，通常 vConsole 在单页应用中保持全局存在即可）
    return () => {
      if (vConsoleRef.current) {
        // vConsoleRef.current.destroy();
      }
    };
  }, []);

  return vConsoleRef.current;
};