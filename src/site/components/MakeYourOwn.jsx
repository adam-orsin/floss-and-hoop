import { useState } from 'react';
import { ArrowUpRight, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PROMPT, REPO } from '@/data';

const COMMANDS = `git clone ${REPO.replace('https://github.com/', 'https://github.com/\n  ')}
cd floss-and-hoop
npm install
npm run make -- my-logo.png`;

export function MakeYourOwn() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked. The prompt stays selectable on the page.
    }
  };

  return (
    <section id="make" className="scroll-mt-6 pt-24 md:pt-40">
      <SectionHead first="Bring your own logo." second="Your agent does the rest." />
      <Card className="mt-7 flex-col gap-1.5 rounded-[20px] border-0 bg-card p-1.5 shadow-[0_1px_2px_rgba(20,21,24,0.04)] md:mt-12 md:flex-row md:gap-2 md:rounded-3xl md:p-2">
        <div className="flex flex-1 flex-col justify-between gap-5 rounded-2xl bg-well p-5 md:gap-8 md:p-7">
          <p className="text-xs font-medium text-muted md:text-[13px]">Paste into Claude Code, Codex, or any coding agent</p>
          <p className="font-mono text-[13px] leading-[21px] md:text-[15px] md:leading-[25px]">{PROMPT}</p>
          <Button onClick={copy} className="h-11 rounded-full px-5 text-sm md:self-start" aria-live="polite">
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy prompt'}
          </Button>
        </div>
        <div className="flex shrink-0 flex-col justify-between gap-4 rounded-2xl bg-ink p-5 md:w-[420px] md:gap-8 md:p-7">
          <p className="text-xs font-medium text-[#9a9ea5] md:text-[13px]">Or by hand</p>
          <pre className="overflow-x-auto font-mono text-xs leading-[22px] text-hairline md:text-sm md:leading-[26px]">{COMMANDS}</pre>
          <a href={`${REPO}#readme`} className="inline-flex items-center gap-0.5 self-start text-sm font-medium text-white hover:underline">
            Read the README <ArrowUpRight className="size-4" />
          </a>
        </div>
      </Card>
    </section>
  );
}

// Two-line heading: the statement in ink, the follow-up in gray.
export function SectionHead({ first, second, as: Tag = 'h2', className = '' }) {
  return (
    <Tag className={`text-center text-[25px] leading-[30px] font-medium tracking-[-0.03em] md:text-[40px] md:leading-[46px] ${className}`}>
      <span className="block">{first}</span>
      <span className="block text-faint">{second}</span>
    </Tag>
  );
}
