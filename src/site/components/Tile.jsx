import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// One output in a rounded tile. Videos play while they're on screen, and the round button
// in the corner pauses them.
// preload="none" keeps offscreen videos from downloading; the poster shows the first frame.
export function VideoTile({ src, poster, label, className, pill = false, priority = false, children }) {
  const ref = useRef(null);
  const [paused, setPaused] = useState(reducedMotion());
  const userPaused = useRef(reducedMotion());

  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !userPaused.current) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (v.paused) { userPaused.current = false; v.play().catch(() => {}); } else { userPaused.current = true; v.pause(); }
  };

  return (
    <figure className={cn('relative overflow-hidden rounded-2xl bg-backdrop', className)}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload={priority ? 'auto' : 'none'}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        className="absolute inset-0 size-full object-cover"
      />
      <TileLabel pill={pill}>{label}</TileLabel>
      {children}
      <button
        type="button"
        onClick={toggle}
        aria-label={paused ? `Play ${label}` : `Pause ${label}`}
        className="absolute right-3 bottom-3 grid size-8 cursor-pointer place-items-center rounded-full bg-white/92 text-ink transition hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none md:size-9"
      >
        {paused ? <Play className="size-3.5 translate-x-px fill-current" /> : <Pause className="size-3.5 fill-current" />}
      </button>
    </figure>
  );
}

export function ImageTile({ src, label, href, alt, className, contain = false }) {
  return (
    <a
      href={href || src}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group relative block overflow-hidden rounded-2xl focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none',
        contain ? 'bg-well' : 'bg-backdrop',
        className,
      )}
    >
      {contain ? (
        <span className="absolute inset-0 flex items-center justify-center p-[7%] pb-[16%]">
          <img src={src} alt={alt} loading="lazy" className="max-h-full max-w-full shadow-[0_1px_3px_rgba(20,21,24,0.08)] transition duration-500 group-hover:scale-[1.03]" />
        </span>
      ) : (
        <img src={src} alt={alt} loading="lazy" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
      )}
      <TileLabel dark={contain}>{label}</TileLabel>
    </a>
  );
}

export function TileLabel({ children, pill = false, dark = false }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute bottom-5 left-4 text-[13px] leading-4 font-medium md:bottom-[22px] md:left-[18px]',
        pill ? 'bottom-[15px] left-3 rounded-full bg-white/94 px-2.5 py-[5px] text-ink md:bottom-[17px] md:left-3' : dark ? 'text-ink' : 'text-white',
      )}
    >
      {children}
    </span>
  );
}
