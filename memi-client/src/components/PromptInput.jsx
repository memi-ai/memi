import { useState } from "react";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3"];
const STYLES = [
  "Realistic",
  "Anime",
  "3D",
  "Cyberpunk",
  "Oil Painting",
  "Watercolor",
  "Pixel Art",
  "Cinematic",
  "Sketch",
  "None",
];
function PromptInput({ copy, onGenerate, isLoading }) {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [style, setStyle] = useState("None");

  function handleSubmit(event) {
    event.preventDefault();

    if (!prompt.trim()) {
      return;
    }

    onGenerate({
      prompt: prompt.trim(),
      aspectRatio,
      style,
    });
  }

  return (
    <form
      className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            {copy.prompt.title}
          </h2>
          <p className="text-sm text-gray-500">
            {copy.prompt.body}
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {prompt.length} {copy.prompt.characters}
        </div>
      </div>
      <textarea
        className="min-h-44 w-full resize-y rounded-md border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-900"
        placeholder={copy.prompt.placeholder}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {copy.prompt.presets.map((item) => (
          <button
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:border-gray-900"
            key={item}
            type="button"
            onClick={() => setPrompt(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-sm text-gray-600">
          <span className="mb-1 block">{copy.prompt.aspectRatio}</span>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.target.value)}
          >
            {ASPECT_RATIOS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 text-sm text-gray-600">
          <span className="mb-1 block">{copy.prompt.style}</span>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
          >
            {STYLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button
          className="h-10 rounded-md px-6 text-sm font-medium text-white transition theme-bg disabled:cursor-not-allowed disabled:bg-gray-400"
          type="submit"
          disabled={isLoading || !prompt.trim()}
        >
          {isLoading ? copy.prompt.generating : copy.prompt.generate}
        </button>
      </div>
    </form>
  );
}

export default PromptInput;
