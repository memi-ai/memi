function OnboardingPanel({ copy, onStart, onSettings, onHide }) {
  return (
    <section className="rounded-md border border-gray-200 bg-gray-50 p-5">
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium theme-text">{copy.onboarding.title}</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">
            memi
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
            {copy.onboarding.intro}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-md px-4 py-2 text-sm font-medium theme-bg"
              type="button"
              onClick={onStart}
            >
              {copy.onboarding.start}
            </button>
            <button
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:border-gray-900"
              type="button"
              onClick={onSettings}
            >
              {copy.onboarding.settings}
            </button>
            <button
              className="rounded-md px-3 py-2 text-sm text-gray-500 hover:text-gray-900"
              type="button"
              onClick={onHide}
            >
              {copy.onboarding.hide}
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {copy.onboarding.steps.map((step, index) => (
            <div className="rounded-md border border-gray-200 bg-white p-4" key={step.title}>
              <div className="text-xs font-semibold text-gray-500">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-950">
                {step.title}
              </div>
              <p className="mt-1 text-sm leading-6 text-gray-600">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default OnboardingPanel;
