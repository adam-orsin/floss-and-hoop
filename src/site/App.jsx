import { useEffect } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExampleCard } from '@/components/ExampleCard';
import { MakeYourOwn, SectionHead } from '@/components/MakeYourOwn';
import { TileLabel, VideoTile } from '@/components/Tile';
import { REPO, examples, useLocalDesigns, viewerStill, viewerUrl } from '@/data';

function GitHubMark(props) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function App() {
  const yours = useLocalDesigns();
  const all = [...yours, ...examples];
  const heroVideo = examples.find((d) => d.key === 'monogram-star')?.files.stitchOn || all.find((d) => d.files.stitchOn)?.files.stitchOn;
  const heroViewer = examples.find((d) => d.key === 'scalloped-border') || all[0];

  // The gallery is opened with #design-key after a render, and cards appear after load.
  useEffect(() => {
    if (!location.hash) return;
    const t = setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 300);
    return () => clearTimeout(t);
  }, [yours.length]);

  return (
    <div className="mx-auto w-full max-w-[1232px] px-4">
      <header className="flex items-center justify-between py-[18px] md:py-6">
        <a href="#" className="text-base font-semibold tracking-[-0.01em] md:text-[17px]">Floss &amp; Hoop</a>
        <nav className="flex items-center gap-7 text-[15px]">
          <a href="#examples" className="hidden text-muted hover:text-ink md:inline">Examples</a>
          <a href="#make" className="hidden text-muted hover:text-ink md:inline">Make your own</a>
          <Button asChild className="h-9 rounded-full px-4 text-sm md:h-[38px] md:text-[15px]">
            <a href={REPO}><GitHubMark className="size-4" />GitHub</a>
          </Button>
        </nav>
      </header>

      <main>
        <section className="flex flex-col items-center gap-5 pt-12 pb-8 md:gap-[22px] md:pt-[88px] md:pb-14">
          <h1 className="text-center text-[30px] leading-[34px] font-medium tracking-[-0.03em] md:text-[60px] md:leading-[64px] md:tracking-[-0.035em]">
            <span className="block">Any logo, stitched in floss.</span>
            <span className="block text-faint">Clone it and make it yours.</span>
          </h1>
          <div className="flex gap-2 md:gap-2.5 md:pt-3">
            <Button asChild className="h-11 rounded-full px-[18px] text-[15px] md:h-12 md:px-[22px]">
              <a href={REPO}>Clone on GitHub</a>
            </Button>
            <Button asChild variant="secondary" className="h-11 rounded-full px-[18px] text-[15px] shadow-[inset_0_0_0_1px_var(--color-hairline)] hover:bg-white/70 md:h-12 md:px-[22px]">
              <a href={viewerUrl(heroViewer)}>Open in 3D</a>
            </Button>
          </div>
        </section>

        {(heroVideo || viewerStill) && (
          <section className="grid gap-3 md:grid-cols-2" aria-label="Featured renders">
            {heroVideo && <VideoTile src={heroVideo} label="Stitch-on" className="aspect-[358/420] md:aspect-[594/660] md:rounded-[20px]" />}
            {viewerStill && (
              <a href={viewerUrl(heroViewer)} className="group relative block aspect-[358/420] overflow-hidden rounded-2xl bg-backdrop focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none md:aspect-[594/660] md:rounded-[20px]">
                <img src={viewerStill} alt="The 3D viewer, with a hoop turned to one side" className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-[1.02]" />
                <TileLabel>Drag to turn it over</TileLabel>
                <span className="absolute right-3 bottom-3 inline-flex items-center gap-0.5 rounded-full bg-white/92 px-4 py-2 text-sm font-medium text-ink transition group-hover:bg-white md:right-5 md:bottom-5">
                  Open in 3D <ArrowUpRight className="size-4" />
                </span>
              </a>
            )}
          </section>
        )}

        {yours.length > 0 && (
          <section id="yours" className="scroll-mt-6 pt-24 md:pt-40">
            <SectionHead first="Your designs." second="Only on this computer." />
            <div className="mt-7 flex flex-col gap-3 md:mt-12 md:gap-4">
              {yours.map((d) => <ExampleCard key={d.key} design={d} />)}
            </div>
          </section>
        )}

        {examples.length > 0 && (
          <section id="examples" className="scroll-mt-6 pt-24 md:pt-40">
            <SectionHead first={`${examples.length === 5 ? 'Five' : examples.length} examples.`} second={<><span className="md:hidden">Every output, one command.</span><span className="hidden md:inline">Every output from one command.</span></>} />
            <div className="mt-7 flex flex-col gap-3 md:mt-12 md:gap-4">
              {examples.map((d) => <ExampleCard key={d.key} design={d} />)}
            </div>
          </section>
        )}

        <MakeYourOwn />
      </main>

      <footer className="flex flex-col justify-between gap-1.5 pt-18 pb-8 text-[13px] text-muted md:flex-row md:pt-30 md:pb-10 md:text-sm">
        <span>Floss &amp; Hoop · <a href={`${REPO}/blob/main/LICENSE`} className="hover:text-ink">MIT license</a></span>
        <span>Three.js, Vite, Playwright, and ffmpeg</span>
      </footer>
    </div>
  );
}
