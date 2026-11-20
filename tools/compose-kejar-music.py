#!/usr/bin/env python3
"""Render original 90-second campus scores (Python + numpy + ffmpeg).

Each scenery has its own tempo, key, orchestration, groove and melodic spacing.
Tempos fit whole bars into 90 seconds. No samples, recordings, network services or third-party
compositions are used. Run: python3 tools/compose-kejar-music.py
"""
from pathlib import Path
import json
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'kejar-lapan/audio/music'
SR = 32000
DURATION = 90
N = int(SR * DURATION)

# Scale-degree motifs; spacing is set per scenery. None is a written rest.
SCORES = {
    'civic': ('Pagi di Kampus', 'Bright adventure / warm synth brass', 'brass',
              [0, 2, 4, None, 5, 4, 2, 1, 0, None, 2, 4, 6, 5, 4, 2],
              [4, 5, 7, None, 6, 5, 4, 2, 3, 4, 5, None, 4, 2, 1, None]),
    'college': ('Langkah Kolej', 'Playful city pop / electric piano', 'ep',
                [4, None, 2, 4, 5, None, 4, 2, 0, 2, None, 1, 2, None, 4, None],
                [7, None, 6, 5, 4, 2, None, 4, 5, 4, 2, None, 1, 2, 0, None]),
    'library': ('Halaman Ilmu', 'Gentle puzzle theme / celesta and soft keys', 'bell',
                [0, None, 4, None, 2, 1, None, 2, 4, None, 6, None, 5, 4, 2, None],
                [7, None, 6, None, 4, 5, None, 4, 2, None, 3, 4, 2, 1, 0, None]),
    'mosque': ('Laman Teduh', 'Peaceful garden / pentatonic mallets and strings', 'mallet',
               [0, None, None, 2, 4, None, 5, None, 7, None, 5, None, 4, 2, None, None],
               [4, None, 5, None, 7, None, 9, None, 7, 5, None, 4, 2, None, 0, None]),
    'sports': ('Rentak Juara', 'Energetic arcade / rounded pulse lead', 'pulse',
               [0, 0, 4, None, 5, 4, 2, None, 4, 4, 7, 6, 5, None, 4, 2],
               [7, 7, 6, 4, 5, None, 7, None, 9, 7, 6, 5, 4, 2, 1, None]),
    'health': ('Nafas Baharu', 'Airy restorative theme / soft electric piano', 'soft',
               [2, None, 4, None, 5, None, 4, 2, 1, None, 2, None, 0, None, None, None],
               [4, None, 6, None, 7, 6, None, 4, 5, None, 4, 2, 1, None, 0, None]),
    'engineering': ('Mesin Mimpi', 'Retro tech groove / FM synth and syncopated bass', 'fm',
                    [0, None, 0, 4, None, 2, 5, None, 4, 2, None, 0, 1, None, 2, 4],
                    [7, 4, None, 5, 6, None, 4, 2, 3, None, 4, 6, 5, 4, 2, None]),
    'faculty': ('Idea Berlari', 'Curious adventure / plucked synth and arpeggios', 'pluck',
                [0, 2, None, 4, 6, None, 4, 2, 1, 3, None, 5, 4, 2, 1, None],
                [4, 6, None, 7, 5, 4, None, 2, 3, 5, 4, None, 2, 1, 0, None]),
    'plaza': ('Cahaya Cendekia', 'Sunny reunion theme / marimba and shimmering keys', 'marimba',
              [0, 4, None, 5, 4, 2, None, 0, 2, 4, 5, None, 7, 5, 4, None],
              [7, 6, 5, None, 4, 5, 7, None, 6, 4, 2, 4, 5, 2, 0, None]),
}
MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]
PROFILES = {
    'civic': dict(bpm=112, meter=4, tonic=62, scale=MAJOR, key='D major', groove='march',
                  style='Bright adventure march / brass, strings and steady drums',
                  chords=[0, 4, 5, 3], pad='strings', pad_level=.06, step=.5, sustain=.6, bass='bass'),
    'college': dict(bpm=104, meter=4, tonic=65, scale=MAJOR, key='F major', groove='swing',
                    style='Laid-back swung city pop / electric piano, finger bass and rim clicks',
                    chords=[1, 4, 0, 5], pad='ep', pad_level=.045, step=.5, sustain=.5, bass='finger'),
    'library': dict(bpm=80, meter=4, tonic=60, scale=MAJOR, key='C major', groove='brush',
                    style='Slow music-box puzzle / celesta, warm pads and brushed percussion',
                    chords=[0, 2, 3, 0, 5, 1, 4, 0], pad='pad', pad_level=.07, step=1, sustain=1.4, bass='sub'),
    'mosque': dict(bpm=64, meter=4, tonic=62, scale=MAJOR, key='D major / pentatonic melody', groove='free',
                   style='Peaceful drum-free garden / breathy flute, long strings and sparse mallets',
                   chords=[0, 0, 3, 3], pad='strings', pad_level=.055, step=1, sustain=2, bass=None),
    'sports': dict(bpm=160, meter=4, tonic=64, scale=MINOR, key='E minor', groove='arcade',
                   style='Fast arcade sprint / pulse lead, driving octaves and four-on-the-floor drums',
                   chords=[0, 5, 2, 6], pad='pulse', pad_level=.035, step=.5, sustain=.34, bass='bass'),
    'health': dict(bpm=88, meter=4, tonic=67, scale=MAJOR, key='G major', groove='heartbeat',
                   style='Gentle restorative piano / airy choir and a soft heartbeat pulse',
                   chords=[0, 3, 1, 4], pad='choir', pad_level=.055, step=1, sustain=1.6, bass='sub'),
    'engineering': dict(bpm=144, meter=4, tonic=60, scale=MINOR, key='C minor', groove='machine',
                        style='Mechanical breakbeat / metallic FM, sequenced bass and syncopated drums',
                        chords=[0, 0, 5, 6], pad='fm', pad_level=.035, step=.25, sustain=.28, bass='fm'),
    'faculty': dict(bpm=120, meter=4, tonic=69, scale=[0, 2, 4, 6, 7, 9, 11], key='A lydian', groove='arpeggio',
                    style='Curious digital adventure / plucked sixteenth-note arpeggios and light drums',
                    chords=[0, 1, 3, 4], pad='pad', pad_level=.045, step=.5, sustain=.45, bass='finger'),
    'plaza': dict(bpm=96, meter=3, tonic=67, scale=MAJOR, key='G major', groove='waltz',
                  style='Sunny three-beat plaza dance / marimba, hand drums and pizzicato strings',
                  chords=[0, 3, 4, 0, 5, 1, 4, 0], pad='strings', pad_level=.04, step=.5, sustain=.45, bass='finger'),
}


def pitch(degree, base, scale):
    return int(base + scale[degree % 7] + 12 * (degree // 7))


def instrument(midi, duration, voice):
    t = np.arange(int(SR * duration), dtype=np.float32) / SR
    f = 440 * 2 ** ((midi - 69) / 12)
    p = 2 * np.pi * f * t
    vibrato = 0.018 * np.sin(2 * np.pi * 5 * t) * np.minimum(1, t * 5)
    if voice in ('ep', 'soft', 'piano'):
        y = np.sin(p + (1.7 if voice == 'ep' else .8) * np.exp(-t * 10) * np.sin(2 * p))
        y += .2 * np.sin(2 * p) * np.exp(-t * 7)
        env = np.exp(-t * (3 if voice == 'ep' else 2.5))
        if voice == 'piano':
            y = np.sin(p) + .32 * np.sin(2 * p) * np.exp(-t * 3) + .17 * np.sin(3 * p) * np.exp(-t * 5) + .06 * np.sin(4 * p) * np.exp(-t * 8)
            env = np.exp(-t * 1.5)
    elif voice in ('bell', 'mallet', 'marimba'):
        ratio = 2.01 if voice == 'bell' else 3.99
        y = np.sin(p) + .35 * np.sin(ratio * p) * np.exp(-t * 12) + .12 * np.sin(7 * p) * np.exp(-t * 18)
        env = np.exp(-t * (3.5 if voice == 'bell' else 7))
    elif voice in ('pad', 'strings', 'choir', 'flute'):
        y = .65 * np.sin(p + vibrato) + .22 * np.sin(p * 1.003) + .13 * np.sin(2 * p)
        if voice == 'strings':
            y += .16 * np.sin(3 * p) + .07 * np.sin(5 * p)
        elif voice == 'choir':
            y = .65 * np.sin(p) + .2 * np.sin(3 * p) + .08 * np.sin(5 * p)
            y *= 1 + .06 * np.sin(2 * np.pi * 1.3 * t)
        elif voice == 'flute':
            y = np.sin(p + vibrato) + .09 * np.sin(2 * p) + .03 * np.sin(3 * p)
        env = np.minimum(1, t / (.14 if voice == 'flute' else .3)) * np.exp(-t * .25)
    elif voice in ('bass', 'sub', 'finger'):
        y = np.sin(p + .45 * np.exp(-t * 12) * np.sin(2 * p)) + .18 * np.sin(2 * p)
        if voice == 'sub':
            y = np.sin(p)
        elif voice == 'finger':
            y += .25 * np.sin(3 * p) * np.exp(-t * 14)
        env = np.exp(-t * 4)
    elif voice == 'fm':
        y = np.sin(p + .9 * np.exp(-t * 5) * np.sin(2 * p)) + .15 * np.sin(p * 1.004)
        env = np.exp(-t * 3.2)
    elif voice == 'brass':
        y = .65 * np.sin(p + vibrato) + .22 * np.sin(2 * p) + .1 * np.sin(3 * p)
        env = np.minimum(1, t / .035) * np.exp(-t * 2)
    elif voice == 'pulse':
        y = .7 * np.sin(p + vibrato) + .2 * np.sin(3 * p) + .07 * np.sin(5 * p)
        env = np.exp(-t * 2.5)
    else:
        y = np.sin(p + 1.2 * np.exp(-t * 12) * np.sin(p)) + .15 * np.sin(3 * p)
        env = np.exp(-t * 6)
    # Every note has a gentle attack and release; no hard square-wave clicks.
    env *= np.minimum(1, t / .008) * np.minimum(1, (duration - t) / .07)
    return (y * env).astype(np.float32)


def percussion(kind, rng):
    length = {'kick': .28, 'snare': .2, 'hat': .07, 'open': .19, 'tom': .25, 'rim': .07, 'brush': .3, 'shaker': .1, 'hand': .18, 'metal': .14}[kind]
    t = np.arange(int(SR * length), dtype=np.float32) / SR
    noise = rng.uniform(-1, 1, len(t)).astype(np.float32)
    bright = noise - np.roll(noise, 1)
    if kind == 'kick':
        phase = 2 * np.pi * (48 * t + 90 * .025 * (1 - np.exp(-t / .025)))
        y = np.sin(phase) * np.exp(-t * 18) + .05 * bright * np.exp(-t * 100)
    elif kind == 'snare':
        smooth = (noise + np.roll(noise, 1) + np.roll(noise, 2)) / 3
        y = .65 * smooth * np.exp(-t * 22) + .22 * np.sin(2 * np.pi * 180 * t) * np.exp(-t * 25)
    elif kind in ('tom', 'hand'):
        y = np.sin(2 * np.pi * (110 * t + 25 * .05 * (1 - np.exp(-t / .05)))) * np.exp(-t * 17)
        if kind == 'hand':
            y += .25 * noise * np.exp(-t * 60)
    elif kind == 'rim':
        y = (.6 * np.sin(2 * np.pi * 840 * t) + .25 * np.sin(2 * np.pi * 1730 * t)) * np.exp(-t * 80)
    elif kind == 'brush':
        y = .22 * (noise + np.roll(noise, 1)) * np.exp(-t * 13)
    elif kind == 'shaker':
        y = .15 * bright * np.exp(-((t - .025) / .02) ** 2)
    elif kind == 'metal':
        y = (.4 * np.sin(2 * np.pi * 730 * t) + .22 * np.sin(2 * np.pi * 1193 * t)) * np.exp(-t * 38)
    else:
        y = .25 * bright * np.exp(-t * (55 if kind == 'hat' else 20))
    return y * np.minimum(1, t / .002) * np.minimum(1, (length - t) / .015)


def render(area, score):
    title, _, lead, motif_a, motif_b = score
    profile = PROFILES[area]
    bpm = profile['bpm']
    beat_seconds = 60 / bpm
    meter = profile['meter']
    bars = round(DURATION / (meter * beat_seconds))
    assert abs(bars * meter * beat_seconds - DURATION) < 1e-9
    mood = profile['style']
    if area == 'mosque':
        lead = 'flute'
    elif area == 'health':
        lead = 'piano'
    index = list(SCORES).index(area)
    rng = np.random.default_rng(900 + index)
    dry = np.zeros((N, 2), np.float32)
    wet = np.zeros_like(dry)
    cache = {}
    drums = {kind: percussion(kind, rng) for kind in ['kick', 'snare', 'hat', 'open', 'tom', 'rim', 'brush', 'shaker', 'hand', 'metal']}

    def add(samples, at, volume, pan=0, send=.2):
        start = int(at * SR) % N
        # Wrap note tails into the beginning, including reverb, for a musical loop.
        left, right = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
        stereo = samples[:, None] * np.array([left, right], np.float32) * volume
        for offset in range(0, len(stereo), N):
            part = stereo[offset:offset + N]
            split = min(len(part), N - start)
            dry[start:start + split] += part[:split]
            wet[start:start + split] += part[:split] * send
            if split < len(part):
                dry[:len(part) - split] += part[split:]
                wet[:len(part) - split] += part[split:] * send

    def note(midi, at, beats, voice, volume, pan=0, send=.25):
        duration = round(beats * beat_seconds + .12, 4)
        key = (midi, duration, voice)
        if key not in cache:
            cache[key] = instrument(midi, duration, voice)
        add(cache[key], at * beat_seconds, volume, pan, send)

    def tone(degree, octave=0):
        return pitch(degree, profile['tonic'] + 12 * octave, profile['scale'])

    groove = profile['groove']
    quiet = groove in ('free', 'brush', 'heartbeat')
    phrase_bars = max(4, round(bars / 6))
    for bar in range(bars):
        beat = bar * meter
        phrase = min(5, bar // phrase_bars)
        root = profile['chords'][bar % len(profile['chords'])]
        chord = [root, root + 2, root + 4, root + 6]
        # Each area has a different harmonic rhythm and chord instrument.
        if groove != 'free' or bar % 2 == 0:
            hold = meter * (2 if groove == 'free' else 1)
            for j, degree in enumerate(chord):
                note(tone(degree, -1), beat, hold, profile['pad'], profile['pad_level'], -.65 + j * .43, .5 if quiet else .25)
        comp = {
            'march': [0, 2], 'swing': [.65, 1.65, 2.65, 3.65], 'brush': [],
            'free': [], 'arcade': [.5, 1.5, 2.5, 3.5], 'heartbeat': [],
            'machine': [0, .75, 2.5], 'arpeggio': [], 'waltz': [1, 2],
        }[groove]
        for off in comp:
            for degree in chord[:3]:
                note(tone(degree, -1), beat + off, .28 if not quiet else .8, 'ep' if groove == 'swing' else 'pluck', .055, .35, .2)
        # Baselines vary from sustained sub notes to a sixteenth-note sequencer.
        bass_steps = {
            'march': [0, 1, 2, 3], 'swing': [0, 1.65, 2.5, 3.65], 'brush': [0],
            'free': [], 'arcade': list(np.arange(0, 4, .5)), 'heartbeat': [0, 2],
            'machine': [0, .5, .75, 1.5, 2, 2.75, 3.25, 3.5],
            'arpeggio': [0, 1.5, 2.5], 'waltz': [0, 1.5],
        }[groove]
        for j, off in enumerate(bass_steps):
            degree = root + (4 if j % 3 == 2 else 0)
            octave = -3 + (1 if groove == 'arcade' and j % 2 else 0)
            note(tone(degree, octave), beat + off, 1.8 if quiet else .38 if groove == 'machine' else .65,
                 profile['bass'], .18 if quiet else .25, 0, .03)
        motif = motif_b if phrase in (2, 4) else motif_a
        step = profile['step']
        slots = round(meter / step)
        for slot in range(slots):
            degree = motif[(bar * slots + slot) % len(motif)]
            if degree is None or (phrase == 4 and slot % 2):
                continue
            off = slot * step + (.12 if groove == 'swing' and slot % 2 else 0)
            transpose = 7 if phrase == 5 and bar % 4 >= 2 and not quiet else 0
            note(tone(degree + transpose), beat + off, profile['sustain'], lead,
                 .14 if quiet else .19, -.12, .55 if quiet else .28)
        if groove == 'free' and bar % 2 == 1:
            note(tone(root + 4, 1), beat + 2, 2.4, 'mallet', .06, .5, .65)
        elif groove == 'heartbeat' and bar % 2 == 0:
            note(tone(root + 4), beat + 2.5, 1.2, 'bell', .035, .5, .55)
        elif groove == 'arpeggio':
            for j in range(16):
                note(tone(chord[j % 4], 0 if j % 8 < 4 else 1), beat + j * .25,
                     .24, 'pluck', .055, -.55 if j % 2 else .55, .35)
        elif groove == 'waltz':
            for j, off in enumerate([.5, 1.5, 2.5]):
                note(tone(chord[j], 1), beat + off, .4, 'marimba', .055, .5, .35)
        elif not quiet and phrase in (1, 2, 3, 5):
            for j, off in enumerate([.25, 1.25, 2.25, 3.25]):
                note(tone(chord[j]), beat + off, .35, 'bell', .035, .55, .35)

        # Groove-specific percussion, rather than the same kit rhythm at different speeds.
        rhythms = {
            'march': [('kick', [0, 2], .28), ('snare', [1, 3], .19), ('hat', list(np.arange(0, 4, .5)), .08)],
            'swing': [('kick', [0, 2.5], .22), ('rim', [1, 3], .17), ('shaker', [0, .65, 1, 1.65, 2, 2.65, 3, 3.65], .2)],
            'brush': [('brush', [1, 3], .1), ('rim', [2.5], .04)],
            'free': [],
            'arcade': [('kick', [0, 1, 2, 3], .34), ('snare', [1, 3], .23), ('hat', list(np.arange(0, 4, .25)), .07), ('open', [.5, 2.5], .1)],
            'heartbeat': [('kick', [0, .4], .075), ('shaker', [2.5], .08)],
            'machine': [('kick', [0, .75, 2, 2.75], .3), ('snare', [1, 2.5, 3], .2), ('metal', [.5, 1.75, 3.5], .08), ('hat', [0, .5, 1.5, 2, 2.5, 3.75], .08)],
            'arpeggio': [('kick', [0, 2.5], .22), ('rim', [1, 3], .13), ('shaker', list(np.arange(0, 4, .5)), .14)],
            'waltz': [('hand', [0, 1, 2], .18), ('shaker', [.5, 1.5, 2.5], .2)],
        }[groove]
        for kind, offsets, level in rhythms:
            for off in offsets:
                add(drums[kind], (beat + off) * beat_seconds, level, -.2 if kind in ('hat', 'shaker') else .08, .12)
        if not quiet and bar % 8 == 7:
            for j, off in enumerate([meter - 1, meter - .5, meter - .25]):
                add(drums['hand' if groove == 'waltz' else 'tom'], (beat + off) * beat_seconds,
                    .12, -.35 + j * .35, .2)

    # Stereo early reflections and tempo-synchronised echoes wrap with the score.
    mix = dry.copy()
    for delay, gain in [(.071, .25), (.113, .21), (.173, .17), (beat_seconds * .75, .18), (beat_seconds * 1.5, .09)]:
        mix += np.roll(wet[:, ::-1], int(delay * SR), axis=0) * gain
    mix -= mix.mean(axis=0)
    mix = np.tanh(mix * 1.3)
    mix *= .86 / max(.001, np.max(np.abs(mix)))
    with tempfile.TemporaryDirectory(prefix='kl-score-') as temp:
        wav = Path(temp) / f'{area}.wav'
        with wave.open(str(wav), 'wb') as output:
            output.setnchannels(2)
            output.setsampwidth(2)
            output.setframerate(SR)
            output.writeframes((mix * 32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
                        '-af', 'loudnorm=I=-19:TP=-2:LRA=7', '-c:a', 'libmp3lame', '-b:a', '72k',
                        '-ar', str(SR), '-metadata', f'title={title}', '-metadata', 'artist=Kejar Lapan',
                        '-metadata', f'comment=Original campus score; {bpm} BPM; {meter}/4; {bars} bars; {mood}',
                        str(OUTPUT / f'{area}.mp3')], check=True)
    print(f'{area}: {bpm} BPM, {meter}/4, {bars} bars — {mood}', flush=True)
    return {'id': area, 'title': title, 'style': mood, 'bpm': bpm, 'meter': f'{meter}/4', 'key': profile['key'], 'groove': groove, 'bars': bars, 'seconds': DURATION, 'file': f'{area}.mp3'}


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    tracks = [render(area, score) for area, score in SCORES.items()]
    (OUTPUT / 'catalog.json').write_text(json.dumps(tracks, indent=2, ensure_ascii=False) + '\n')
