import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Hand } from 'lucide-react';
import { TileLabel } from '@/components/Tile';
import { viewerUrl } from '@/data';
import { cn } from '@/lib/utils';

// The 3D viewer, live in a tile. It loads when the tile scrolls into view on desktop. On
// touch screens it waits for a tap, so a finger scrolling past doesn't turn the hoop. The
// still stays underneath until the hoop has drawn its first frame.
export function LiveHoop({ design, still, className }) {
  const ref = useRef(null);
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    if (touch || load) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setLoad(true); }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [touch, load]);

  useEffect(() => {
    const onMessage = (e) => { if (e.origin === location.origin && e.data?.type === 'floss-hoop-ready') setReady(true); };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div ref={ref} className={cn('relative overflow-hidden rounded-2xl bg-backdrop', className)}>
      {still && <img src={still} alt="" className="absolute inset-0 size-full object-cover" />}
      {load && (
        <iframe
          title={`${design?.label || 'Design'} in 3D. Drag to turn it over.`}
          src={`${viewerUrl(design)}&embed=1`}
          className={cn('absolute inset-0 size-full border-0 transition-opacity duration-700', ready ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {touch && !load && (
        <button
          type="button"
          onClick={() => setLoad(true)}
          className="absolute inset-0 grid cursor-pointer place-items-center focus-visible:outline-none"
          aria-label="Load the 3D hoop"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/92 px-4 py-2 text-sm font-medium text-ink">
            <Hand className="size-4" /> Tap to turn it
          </span>
        </button>
      )}
      <TileLabel>Drag to turn it over</TileLabel>
      <a
        href={viewerUrl(design)}
        className="absolute right-3 bottom-3 inline-flex items-center gap-0.5 rounded-full bg-white/92 px-4 py-2 text-sm font-medium text-ink transition hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none md:right-5 md:bottom-5"
      >
        Full screen <ArrowUpRight className="size-4" />
      </a>
    </div>
  );
}
