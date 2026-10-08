import { ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ImageTile, VideoTile } from '@/components/Tile';
import { viewerUrl } from '@/data';

const tile = 'aspect-[4/5] w-full';

// One design: its name and size on top, then every output side by side.
export function ExampleCard({ design: d }) {
  const colors = d.floss.length;
  const spec = [
    d.height ? `${d.width} × ${d.height}` : `${d.width} across`,
    colors ? `${colors} ${colors === 1 ? 'color' : 'colors'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Card id={d.key} className="scroll-mt-6 gap-1.5 rounded-[20px] border-0 bg-card p-1.5 shadow-[0_1px_2px_rgba(20,21,24,0.04)] md:gap-2 md:rounded-3xl md:p-2">
      <div className="flex items-center justify-between gap-4 px-2.5 pt-2.5 pb-2 md:px-4 md:pt-3.5 md:pb-3">
        <div className="flex min-w-0 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
          <h3 className="truncate text-base font-medium md:text-[17px]">{d.label}</h3>
          <span className="font-mono text-xs whitespace-nowrap text-muted md:text-[13px]">{spec}</span>
        </div>
        <a href={viewerUrl(d)} className="inline-flex shrink-0 items-center gap-0.5 rounded-full text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none md:text-[15px]">
          Open in 3D <ArrowUpRight className="size-4" />
        </a>
      </div>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 md:gap-2">
        {d.files.still && <ImageTile className={tile} src={d.files.still} label="Still" alt={`${d.label}, stitched in a hoop`} />}
        {d.files.pushIn && <VideoTile className={tile} src={d.files.pushIn} label="Push-in" pill />}
        {d.files.stitchOn && <VideoTile className={tile} src={d.files.stitchOn} label="Stitch-on" />}
        {d.files.chart && <ImageTile className={tile} src={d.files.chart} label="Chart" alt={`${d.label} stitch chart`} contain />}
      </div>
    </Card>
  );
}
