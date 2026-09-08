# 统一导航修复

用户在审查后授权直接修复并删除多余测试，要求不运行测试、不做浏览器自动化、不创建 worktree。审查依据是实际源码与用户交互要求；任务审查记录位于本机 `/root/dsh-navigation-review.md`。

navigateTo 区分 committed/cancelled/unhandled；取消和未保存内容拒绝不再落入新标签兜底。Markdown 和路径导航共享 opening request，在解析前创建取消归属；只有显式 workspacePath 的源使用文件路由。现有标签与回放都通过组提供的导航对象提交，移除旧的独立 activate/record 桥接接口。保留文档和关闭保护，不改变编辑器内容模型。

viewer 版本 0.1.6，要求 sidebar >=0.0.5 <0.1.0、user-files ^0.1.9。Markdown 包版本 0.1.3，要求 viewer ^0.1.6。独立版本不必相等。

验证采用受影响包的 owned build（包含源码类型编译）；不运行测试或浏览器交互。实际构建、激活与发布结果由本机维护 receipt 记录。编译成功不代表交互验收，连续历史快捷键和迟到结果焦点行为仍需人工观察。
