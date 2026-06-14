import { useState } from "react";

function ConfigPanel({ config, copy, onChange, compact = false, defaultOpen = false, onlyGroups = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  function updateField(group, field, value) {
    onChange({
      ...config,
      [group]: {
        ...config[group],
        [field]: value,
      },
    });
  }

  function clearHistory() {
    if (window.confirm("确定要清空所有历史记录吗？")) {
      localStorage.removeItem("memi-generation-history");
      window.dispatchEvent(new Event("memi-history-cleared"));
    }
  }

  const groups = onlyGroups || Object.keys(copy.config.labels);

  return (
    <details
      className="rounded-md border border-gray-200 bg-gray-50"
      open={isOpen}
      onToggle={(e) => setIsOpen(e.target.open)}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800">
        {copy.config.title}
        {compact && (
          <span className="ml-2 text-xs font-normal text-gray-500">
            {copy.common.savedLocally}
          </span>
        )}
      </summary>
      <div className="grid gap-4 border-t border-gray-200 p-4 lg:grid-cols-3">
        {groups.map((group) => (
          <section
            key={group}
            className="space-y-3 rounded-md border border-gray-200 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-900">
                {copy.config.labels[group]}
              </h2>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">
                {config[group].model || "No model"}
              </span>
            </div>
            {["baseUrl", "apiKey", "model"].map((field) => (
              <label key={field} className="block text-sm text-gray-600">
                <span className="mb-1 block">{field}</span>
                <input
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-900"
                  value={config[group][field]}
                  type={field === "apiKey" ? "password" : "text"}
                  onChange={(event) =>
                    updateField(group, field, event.target.value)
                  }
                />
              </label>
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}

export default ConfigPanel;
