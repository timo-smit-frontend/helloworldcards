const pulse = 'animate-pulse rounded-md bg-site-mulled-wine motion-reduce:animate-none'

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`${pulse} ${className}`} aria-hidden="true" />
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col" role="status" aria-live="polite" aria-label="Loading page">
      <span className="sr-only">Loading page…</span>
      <section className="bg-site-dark lg:mt-16 mt-12">
        <div className="container-full">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div className="flex flex-col gap-8 lg:h-full lg:gap-0">
              <div className="flex flex-col justify-center gap-4 lg:flex-1 lg:gap-8">
                <div className="flex flex-col gap-2 lg:gap-4">
                  <SkeletonBlock className="h-12 w-full max-w-2xl" />
                  <SkeletonBlock className="h-5 w-full max-w-xl" />
                  <SkeletonBlock className="h-5 w-4/5 max-w-lg" />
                </div>
                <SkeletonBlock className="h-12 w-40 rounded-full" />
              </div>
            </div>
            <SkeletonBlock className="aspect-4/3 w-full rounded-panel lg:aspect-square" />
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container-full">
          <div className="flex flex-col gap-10">
            <div className="flex max-w-4xl flex-col gap-4">
              <SkeletonBlock className="h-9 w-56" />
              <SkeletonBlock className="h-5 w-full max-w-2xl" />
            </div>
            <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="overflow-hidden rounded-panel bg-site-gunmetal shadow-card ring-1 ring-site-mulled-wine">
                  <SkeletonBlock className="aspect-square w-full rounded-none sm:aspect-5/7" />
                  <div className="flex flex-col gap-2 border-t border-site-mulled-wine px-4 py-3">
                    <SkeletonBlock className="h-4 w-24" />
                    <SkeletonBlock className="h-5 w-full" />
                    <SkeletonBlock className="h-4 w-16" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

export function ProductSkeleton() {
  return (
    <div className="flex flex-col" role="status" aria-live="polite" aria-label="Loading product">
      <span className="sr-only">Loading product…</span>
      <section className="lg:my-16 mt-12">
        <div className="container-full">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
            <div className="flex flex-col gap-8 lg:h-full lg:gap-0">
              <SkeletonBlock className="aspect-square w-full rounded-panel lg:hidden" />
              <div className="flex flex-col justify-center gap-4 lg:flex-1 lg:gap-8">
                <div className="flex flex-col gap-2 lg:gap-4">
                  <SkeletonBlock className="h-5 w-32" />
                  <SkeletonBlock className="h-12 w-full max-w-xl" />
                  <SkeletonBlock className="h-5 w-full max-w-lg" />
                  <SkeletonBlock className="h-8 w-24" />
                </div>
                <SkeletonBlock className="h-12 w-48 rounded-full" />
              </div>
            </div>
            <SkeletonBlock className="hidden aspect-square w-full rounded-panel lg:block" />
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container-full">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
            <div className="flex flex-col gap-4">
              <SkeletonBlock className="h-9 w-64" />
              <SkeletonBlock className="h-5 w-full max-w-xl" />
              <SkeletonBlock className="h-12 w-52 rounded-full" />
            </div>
            <SkeletonBlock className="aspect-square w-full max-w-sm rounded-panel" />
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container-full">
          <div className="flex flex-col gap-10">
            <SkeletonBlock className="h-9 w-48" />
            <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="overflow-hidden rounded-panel bg-site-gunmetal shadow-card ring-1 ring-site-mulled-wine">
                  <SkeletonBlock className="aspect-square w-full rounded-none sm:aspect-5/7" />
                  <div className="flex flex-col gap-2 border-t border-site-mulled-wine px-4 py-3">
                    <SkeletonBlock className="h-4 w-24" />
                    <SkeletonBlock className="h-5 w-full" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
