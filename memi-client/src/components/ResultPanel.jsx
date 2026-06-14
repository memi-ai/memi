import { useEffect, useRef, useState } from "react";

function ResultPanel({ copy, onRegenerate, result }) {
  const [copyLabel, setCopyLabel] = useState(copy.result.copyPrompt);
  const [imageError, setImageError] = useState("");
  const [renderedImageUrl, setRenderedImageUrl] = useState("");
  const totalSeconds = result.totalTime
    ? `${(result.totalTime / 1000).toFixed(1)}s`
    : "N/A";
  const originalForm = {
    prompt: result.originalPrompt || result.finalPrompt || "",
    aspectRatio: result.aspectRatio || "1:1",
    style: result.style || "None",
  };
  function getDisplayImageUrl(imageUrl) {
    if (!imageUrl) {
      return "";
    }

    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    }

    return imageUrl;
  }

  const displayImageUrl = getDisplayImageUrl(result.imageUrl);

  const blobUrlRef = useRef("");

  useEffect(() => {
    async function loadImage() {
      setImageError("");

      if (!displayImageUrl) {
        setImageError("图片地址为空");
        return;
      }

      if (displayImageUrl.startsWith("data:image")) {
        setRenderedImageUrl(displayImageUrl);
        return;
      }

      try {
        const response = await fetch(displayImageUrl, {
          headers: { "ngrok-skip-browser-warning": "1" },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
          const text = await response.text();
          throw new Error(`返回内容不是图片：${text.slice(0, 180)}`);
        }

        const blob = await response.blob();
        const newUrl = URL.createObjectURL(blob);

        // 先设置新 URL，再撤销旧 URL，避免 img 标签引用已撤销的 blob
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = newUrl;
        setRenderedImageUrl(newUrl);
      } catch (error) {
        setImageError(
          `代理图片加载失败：${error.message || "未知错误"}。代理地址：${displayImageUrl}`
        );
      }
    }

    loadImage();

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = "";
      }
    };
  }, [displayImageUrl]);

  function getBase64Blob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") throw new Error("无效的图片数据");
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex === -1) throw new Error("data URI 格式错误：缺少逗号分隔符");
    const meta = dataUrl.slice(0, commaIndex);
    const base64 = dataUrl.slice(commaIndex + 1);
    if (!base64) throw new Error("data URI 格式错误：base64 数据为空");
    const mime = meta.match(/data:(.*?);/)?.[1] || "image/jpeg";
    let bytes;
    try {
      bytes = atob(base64);
    } catch {
      throw new Error("base64 解码失败：数据格式不正确");
    }
    const buffer = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) {
      buffer[index] = bytes.charCodeAt(index);
    }
    return new Blob([buffer], { type: mime });
  }

  function downloadImage() {
    const link = document.createElement("a");
    link.download = `memi-${Date.now()}.jpg`;
    const url = result.imageUrl || "";

    if (url.startsWith("data:image")) {
      try {
        const blob = getBase64Blob(url);
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (e) {
        // base64 解析失败时降级为直接打开
        link.href = url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.click();
      }
      return;
    }

    link.href = renderedImageUrl || displayImageUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(result.finalPrompt || "");
    setCopyLabel(copy.result.copied);
    window.setTimeout(() => setCopyLabel(copy.result.copyPrompt), 2000);
  }

  return (
    <section className="grid gap-5 border-t border-gray-200 pt-5 lg:grid-cols-[minmax(0,1.2fr)_420px]">
      <div className="overflow-hidden rounded-md border border-gray-200 bg-gray-50 shadow-sm">
        {imageError ? (
          <div className="flex min-h-[420px] items-center justify-center p-6 text-center">
            <div>
              <p className="text-sm font-semibold text-red-700">图片加载失败</p>
              <p className="mt-2 break-all text-sm leading-6 text-gray-600">
                {imageError}
              </p>
            </div>
          </div>
        ) : !renderedImageUrl ? (
          <div className="flex min-h-[420px] items-center justify-center p-6 text-center text-sm text-gray-600">
            正在加载图片...
          </div>
        ) : (
          <img
            className="h-full max-h-[680px] w-full object-contain"
            src={renderedImageUrl}
            alt={result.finalPrompt || "Generated image"}
            onError={() => {
              setImageError(
                `代理图片加载失败，请检查后端 /api/proxy-image 是否可访问：${displayImageUrl}`
              );
            }}
          />
        )}
      </div>
      <aside className="space-y-4 rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-500">{copy.result.score}</p>
            <p className="text-3xl font-semibold text-gray-900">
              {result.score ?? "N/A"}
            </p>
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-500">{copy.result.totalTime}</p>
            <p className="text-2xl font-semibold text-gray-900">
              {totalSeconds}
            </p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-gray-500">{copy.result.finalPrompt}</p>
          <p className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-sm leading-6 text-gray-800">
            {result.finalPrompt}
          </p>
        </div>
        {Array.isArray(result.history) && result.history.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-gray-500">{copy.result.history}</p>
            <div className="space-y-3">
              {result.history.map((item) => (
                <div
                  className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm"
                  key={item.round}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">
                      {copy.result.round} {item.round}
                    </span>
                    <span className="text-gray-600">
                      {copy.result.score} {item.score}
                    </span>
                  </div>
                  <p className="mt-2 text-gray-600">
                    {copy.result.reason}: {item.reason}
                  </p>
                  <p className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-md bg-white p-2 text-xs leading-5 text-gray-700">
                    {item.prompt}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-white transition theme-bg"
            type="button"
            onClick={downloadImage}
          >
            {copy.result.download}
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:border-gray-900"
            type="button"
            onClick={copyPrompt}
          >
            {copyLabel}
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:border-gray-900"
            type="button"
            onClick={() => onRegenerate(originalForm)}
          >
            {copy.result.regenerate}
          </button>
        </div>
      </aside>
    </section>
  );
}

export default ResultPanel;
