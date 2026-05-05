import { useState } from "react";
import { AppRouter } from "./router";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

function App() {
  const [showHelp, setShowHelp] = useState(false);
  useKeyboardShortcuts(() => setShowHelp(true));

  return (
    <>
      <AppRouter />
      {showHelp ? (
        <div className="fixed bottom-4 right-4 z-50 rounded border border-border-default bg-bg-panel p-3 text-xs shadow">
          <div className="mb-1 font-semibold">快捷键</div>
          <div>/ 聚焦搜索</div>
          <div>g s 打开设置</div>
          <div>g c 回主会话</div>
          <button className="mt-2 rounded bg-accent px-2 py-1 text-white" onClick={() => setShowHelp(false)}>
            关闭
          </button>
        </div>
      ) : null}
    </>
  );
}

export default App;
