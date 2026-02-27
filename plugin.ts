import fs from 'fs';
import path from 'path';

export const wasmCleaner = () => ({
	  name: 'wasm-cleaner',
	    apply: 'build', 
	      closeBundle() {
		          const distPath = path.resolve(__dirname, 'dist');
			      
			      const unlinkWasm = (dir) => {
				            if (!fs.existsSync(dir)) return;
					          fs.readdirSync(dir).forEach((file) => {
							          const fullPath = path.join(dir, file);
								          if (fs.statSync(fullPath).isDirectory()) {
										            unlinkWasm(fullPath); // 递归查找子目录
											            } else if (file.endsWith('.wasm')) {
													              fs.unlinkSync(fullPath); // 执行物理删除
														                console.log(`🗑️ 已删除冗余 WASM: ${file}`);
																        }
																	      });
																	          };

																		      console.log('🚀 正在清理 dist 目录中的 .wasm 文件...');
																		          unlinkWasm(distPath);
																			    }
});
