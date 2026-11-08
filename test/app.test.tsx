// Component test for the app shell (task 9.3).
//
// Loading a synthetic clip through the real pipeline (fake classifier +
// real measurement + buildEvents) must show ghosts, event-list entries and a
// working export (Requirements 6.1, 7.2, 8.1). The test injects:
//   - a decoder that returns synthetic stereo PCM with known bursts, so the
//     measurement side sees real audio (direction, loudness);
//   - the deterministic fake classifier scripted to label those bursts, so
//     families are known.
// It then drives the UI the way a user would (open file → watch) and asserts
// on the text equivalents (list rows, labels) and the export, which do not
// depend on a real canvas being available under jsdom.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { App } from '../src/ui/App';
import { synthesize } from './synth.ts';
import { makeFakeClassifier, makeFailingClassifier } from '../src/classify/fakeClassifier.ts';
import type { StereoPcm } from '../src/shared/types.ts';

/** A synthetic clip: footsteps hard-left, then an impact hard-right. */
function syntheticPcm(): StereoPcm {
  const { pcm } = synthesize(
    [
      { kind: 'noise', start: 0.2, end: 2.0, gain: 0.6, pan: -0.9 },
      { kind: 'noise', start: 3.0, end: 5.0, gain: 0.9, pan: 0.9 },
    ],
    { sampleRate: 16000, duration: 6 },
  );
  return pcm;
}

/** Decoder that ignores the File and returns our synthetic PCM. */
const decodeSynthetic = async (_file: File): Promise<StereoPcm> => syntheticPcm();

/** A classifier scripting footsteps then an impact over the bursts' times. */
function scriptedClassifier() {
  return makeFakeClassifier({
    script: [
      { name: 'Walk, footsteps', score: 0.8, from: 0.2, to: 2.0 },
      { name: 'Explosion', score: 0.85, from: 3.0, to: 5.0 },
    ],
  });
}

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'clip.webm', { type: 'video/webm' });
}

beforeEach(() => {
  // jsdom lacks these; the Player tolerates their absence but stub to be safe.
  if (!('createObjectURL' in URL)) {
    // @ts-expect-error test stub
    URL.createObjectURL = vi.fn(() => 'blob:mock');
  } else {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  }
  if (!('revokeObjectURL' in URL)) {
    // @ts-expect-error test stub
    URL.revokeObjectURL = vi.fn();
  } else {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  }
});

describe('app shell end to end (fake classifier)', () => {
  it('loads a synthetic clip and shows ghost events in the list', async () => {
    render(<App decode={decodeSynthetic} classifier={scriptedClassifier()} initialLang="en" />);

    // Intake → open a file.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    // After analysis we reach the watch screen with an event list.
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    // Header row + at least the footsteps and impact events.
    expect(rows.length).toBeGreaterThanOrEqual(3);

    // The two scripted families appear as text (ghosts carry text labels).
    expect(screen.getAllByText('footsteps').length).toBeGreaterThan(0);
    expect(screen.getAllByText('impact').length).toBeGreaterThan(0);

    // Direction is measured from the hard-panned bursts: left then right.
    expect(screen.getAllByText('from the left').length).toBeGreaterThan(0);
    expect(screen.getAllByText('from the right').length).toBeGreaterThan(0);
  });

  it('exports a valid WebVTT file without a server round-trip', async () => {
    render(<App decode={decodeSynthetic} classifier={scriptedClassifier()} initialLang="en" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    const exportBtn = await screen.findByRole('button', { name: 'Export captions' });
    expect(exportBtn).toBeEnabled();

    // Capture the text handed to the Blob the export builds (jsdom's Blob has
    // no async .text(), so read the constructor parts directly).
    let capturedText: string | null = null;
    const RealBlob = globalThis.Blob;
    const blobSpy = vi
      .spyOn(globalThis, 'Blob')
      .mockImplementation((parts?: BlobPart[], opts?: BlobPropertyBag) => {
        capturedText = (parts ?? []).map((p) => String(p)).join('');
        return new RealBlob(parts ?? [], opts);
      });

    fireEvent.click(exportBtn);
    blobSpy.mockRestore();

    expect(capturedText).not.toBeNull();
    const text = capturedText as unknown as string;
    expect(text.startsWith('WEBVTT')).toBe(true);
    expect(text).toContain('[footsteps, from the left]');
    expect(text).toContain('-->');
  });

  it('shows the labels-unavailable notice when the classifier fails', async () => {
    render(<App decode={decodeSynthetic} classifier={makeFailingClassifier()} initialLang="en" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() =>
      expect(
        screen.getByText(/Sound labels are unavailable/i),
      ).toBeInTheDocument(),
    );
  });

  it('switches language at any time', async () => {
    render(<App decode={decodeSynthetic} classifier={scriptedClassifier()} initialLang="en" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await screen.findByRole('table');

    const langSelect = screen.getByDisplayValue('English') as HTMLSelectElement;
    fireEvent.change(langSelect, { target: { value: 'ko' } });

    // The app title switches to the Korean string.
    await waitFor(() => expect(screen.getByDisplayValue('한국어')).toBeInTheDocument());
  });
});
