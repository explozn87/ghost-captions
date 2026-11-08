// Component test for the DemoPicker (task 11.1, Req 1.3, NFR-4).
//
// The picker must show each clip's title, author and licence before playback
// (Req 1.3), run every string through i18n (Req 9.2), be keyboard operable
// (Req 10.1 — real buttons), and when a clip is chosen fetch the app's own
// asset and hand the resulting File plus its credit to the parent. A failed
// fetch shows a notice instead of crashing. A fake fetch keeps the test off the
// binaries.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DemoPicker } from '../src/ui/DemoPicker.tsx';
import { t } from '../src/i18n/index.ts';
import type { DemoClip } from '../src/ui/demoClips.ts';

const CLIPS: DemoClip[] = [
  {
    id: 'a',
    title: 'Clip A',
    author: 'Author A',
    licence: 'CC-BY-3',
    sourceUrl: 'https://example.org/a',
    src: '/demo/a.webm',
    mime: 'video/webm',
    note: 'first',
  },
  {
    id: 'b',
    title: 'Clip B',
    author: 'Author B',
    licence: 'public-domain',
    sourceUrl: 'https://example.org/b',
    src: '/demo/b.ogg',
    mime: 'audio/ogg',
    note: 'second',
  },
];

describe('DemoPicker (task 11.1)', () => {
  it('shows each clip title, author and licence (Req 1.3, NFR-4)', () => {
    render(<DemoPicker strings={t('en')} onFile={() => {}} clips={CLIPS} />);

    expect(screen.getByText('Clip A')).toBeInTheDocument();
    expect(screen.getByText('Clip B')).toBeInTheDocument();
    expect(screen.getByText(/Author A/)).toBeInTheDocument();
    expect(screen.getByText(/CC BY 3.0/)).toBeInTheDocument();
    expect(screen.getByText(/Public domain/)).toBeInTheDocument();

    // Source links point at the originals for attribution.
    const sources = screen.getAllByRole('link', { name: 'Source' });
    expect(sources).toHaveLength(2);
    expect((sources[0] as HTMLAnchorElement).href).toContain('example.org/a');
  });

  it('renders every clip as a real button for keyboard use (Req 10.1)', () => {
    render(<DemoPicker strings={t('en')} onFile={() => {}} clips={CLIPS} />);
    // Two pick buttons (one per clip).
    const pickButtons = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('demos__pick'));
    expect(pickButtons).toHaveLength(2);
  });

  it('fetches the chosen clip and hands the File plus credit to the parent', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const fakeFetch = vi.fn(async () => new Response(bytes, { status: 200 })) as unknown as typeof fetch;
    const onFile = vi.fn();

    render(
      <DemoPicker strings={t('en')} onFile={onFile} clips={CLIPS} fetchImpl={fakeFetch} />,
    );

    fireEvent.click(screen.getByText('Clip B'));

    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1));
    const [file, clip] = onFile.mock.calls[0]!;
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe('audio/ogg');
    expect((clip as DemoClip).id).toBe('b');
  });

  it('shows a notice when a clip fails to load, without crashing', async () => {
    const fakeFetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const onFile = vi.fn();

    render(
      <DemoPicker strings={t('en')} onFile={onFile} clips={CLIPS} fetchImpl={fakeFetch} />,
    );

    fireEvent.click(screen.getByText('Clip A'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i),
    );
    expect(onFile).not.toHaveBeenCalled();
  });

  it('translates to Korean (Req 9.2)', () => {
    render(<DemoPicker strings={t('ko')} onFile={() => {}} clips={CLIPS} />);
    expect(screen.getByRole('region', { name: '데모 클립' })).toBeInTheDocument();
    expect(screen.getByText(/퍼블릭 도메인/)).toBeInTheDocument();
  });
});
