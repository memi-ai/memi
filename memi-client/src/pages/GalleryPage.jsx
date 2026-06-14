import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const MAX_RETRIES = 30;

function getImageSrc(imageUrl) {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("data:")) return imageUrl;
  if (imageUrl.startsWith("http")) {
    return "/api/proxy-image?url=" + encodeURIComponent(imageUrl);
  }
  return imageUrl;
}

function loadHistory() {
  try {
    const saved = localStorage.getItem("memi-generation-history");
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return [];
  }
}

function GalleryPage({ copy, onNavigate }) {
  const [history, setHistory] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState("");
  // itemId → retry count, 达到 MAX_RETRIES 后停止重试
  const retryRef = useRef(new Map());

  useEffect(() => {
    setHistory(loadHistory());
    retryRef.current = new Map();

    function handleHistoryCleared() {
      setHistory([]);
      retryRef.current = new Map();
    }

    window.addEventListener("memi-history-cleared", handleHistoryCleared);

    return () => {
      window.removeEventListener("memi-history-cleared", handleHistoryCleared);
    };
  }, []);

  function handleImgError(itemId, originalUrl, e) {
    if (!originalUrl) return;
    const count = retryRef.current.get(itemId) || 0;
    if (count >= MAX_RETRIES) return;

    retryRef.current.set(itemId, count + 1);
    // 通过代理重试，附加 cache busting 参数
    if (originalUrl.startsWith("http")) {
      const separator = originalUrl.includes("?") ? "&" : "?";
      const bustedUrl = originalUrl + separator + "_retry=" + (count + 1);
      e.target.src = getImageSrc(bustedUrl);
    } else if (originalUrl.startsWith("data:")) {
      e.target.src = originalUrl;
    }
  }

  function clearHistory() {
    if (window.confirm(copy.gallery.confirmClear || "确定要清空所有历史记录吗？")) {
      localStorage.removeItem("memi-generation-history");
      setHistory([]);
      retryRef.current = new Map();
    }
  }

  if (history.length === 0) {
    return (
      <section className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-950">
          {copy.gallery.emptyTitle}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-600">
          {copy.gallery.emptyBody}
        </p>
        <button
          className="mt-5 rounded-md px-4 py-2 text-sm font-medium text-white theme-bg"
          type="button"
          onClick={() => onNavigate("studio")}
        >
          {copy.gallery.goStudio}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium theme-text">{copy.gallery.eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">
            {copy.gallery.title}
          </h1>
        </div>
        <button
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:border-gray-900"
          type="button"
          onClick={clearHistory}
        >
          {copy.gallery.clear}
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {history.map((item) => {
          const firstSrc = getImageSrc(item.imageUrl);
          return (
            <article
              className="overflow-hidden rounded-md border border-gray-200 bg-white"
              key={item.id}
            >
              <div
                className="aspect-square bg-gray-50 cursor-pointer"
                onClick={() => setLightboxUrl(firstSrc)}
              >
                <img
                  className="h-full w-full object-cover"
                  src={firstSrc}
                  alt={item.finalPrompt || item.prompt}
                  onError={(e) => handleImgError(item.id, item.imageUrl, e)}
                />
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-gray-950">
                    {copy.result.score} {item.score ?? "N/A"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="line-clamp-3 text-sm leading-6 text-gray-600">
                  {item.finalPrompt || item.prompt}
                </p>
                <button
                  className="inline-flex rounded-md px-3 py-2 text-sm font-medium text-white theme-bg"
                  type="button"
                  onClick={() => setLightboxUrl(firstSrc)}
                >
                  {copy.result.openImage}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setLightboxUrl("")}
          onKeyDown={(e) => { if (e.key === "Escape") setLightboxUrl(""); }}
        >
          <img
            src={lightboxUrl}
            alt="full size"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            type="button"
            onClick={() => setLightboxUrl("")}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </section>
  );
}

export default GalleryPage;
