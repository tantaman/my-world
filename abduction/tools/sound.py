#!/usr/bin/env python3
# The sound, measured: what is in a 72.5 s take, layer by layer, in numbers
# and pictures, so the original and ours can be set side by side without
# anyone listening (PLAN.md 5.16). Needs numpy and matplotlib.
#
#   python3 abduction/tools/sound.py measure reference/audio.wav
#   python3 abduction/tools/sound.py compare reference/audio.wav out/audio-ours.wav [tag]
#
# (node abduction/tools/sound.mjs renders ours and runs the second.)
#
# measure prints, for one file: loudness in five bands every half second,
# the stereo balance and width, the pulse (low thumps), the rain (its bed's
# spectrum and how many drops a second), and each event's envelope (the
# car, the saucer's tones, the end). compare does the same for two files and
# writes pictures into out/sound/: the band curves over each other, the two
# spectrograms one above the other, whole and zoomed on each event, named
# <tag>-*.png; and how far ours is from theirs per band and stretch.
#
# Levels are dBFS of the mid channel ((L + R) / 2). Band levels are summed
# power in the band from a 4096-point Hann STFT, scaled so a full-scale sine
# reads 0 dB; spectra are power per bin on the same scale.
import sys, os, wave, json
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'out', 'sound')

BANDS = [('sub', 20, 60), ('low', 60, 250), ('lowmid', 250, 1000), ('mid', 1000, 4000), ('high', 4000, 16000)]
FRAME_HZ = 10            # band curves' rate
N_FFT = 4096
# The moments worth a close look: [name, from s, to s].
EVENTS = [
    ['start', 0.0, 4.5], ['strike1', 4.0, 12.0], ['car', 17.0, 25.0], ['canopy', 25.0, 33.0],
    ['strike2', 40.0, 48.0], ['arrive', 46.0, 54.0], ['beam', 53.0, 61.0], ['leave', 59.0, 67.0],
    ['end', 68.0, 72.55],
]
# Stretches where the rain is heard over little else: [name, from s, to s].
RAIN_SPANS = [['open, start', 0.0, 3.5], ['open, walking', 17.0, 19.5], ['under the canopy', 27.0, 31.0],
              ['canopy, turning', 34.0, 37.0], ['verge', 45.0, 47.0], ['road edge', 62.0, 65.0]]
RAIN_POINTS = [1000, 2000, 4000, 8000, 12000, 15000]


def load(path):
    w = wave.open(path)
    n, ch, sr, sw = w.getnframes(), w.getnchannels(), w.getframerate(), w.getsampwidth()
    raw = w.readframes(n)
    if sw == 2:
        x = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        x = (np.where(v >= 1 << 23, v - (1 << 24), v) / float(1 << 23)).astype(np.float32)
    else:
        raise SystemExit(f'{path}: {sw * 8}-bit samples not read here')
    x = x.reshape(-1, ch)
    if ch == 1:
        x = np.repeat(x, 2, axis=1)
    return x[:, :2], sr


def stft(x, n=N_FFT, hop=480):
    w = np.hanning(n).astype(np.float32)
    pad = np.concatenate([np.zeros(n // 2, np.float32), x.astype(np.float32), np.zeros(n // 2, np.float32)])
    frames = 1 + (len(pad) - n) // hop
    out = np.empty((frames, n // 2 + 1), np.float32)
    for i in range(0, frames, 256):
        j = min(frames, i + 256)
        idx = (np.arange(i, j) * hop)[:, None] + np.arange(n)[None, :]
        out[i:j] = np.abs(np.fft.rfft(pad[idx] * w, axis=1)) ** 2
    out *= 4 / np.sum(w) ** 2
    return out


def db(p):
    return 10 * np.log10(np.asarray(p) + 1e-14)


def bandpass(x, sr, lo, hi):
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1 / sr)
    X[(f < lo) | (f >= hi)] = 0
    return np.fft.irfft(X, n=x.shape[0], axis=0)


class Take:
    """One file and everything measured from it."""

    def __init__(self, path):
        self.path = path
        self.name = os.path.splitext(os.path.basename(path))[0]
        self.label = self.name
        self.x, self.sr = load(path)
        sr = self.sr
        self.hop = sr // 100
        mid = self.x.mean(1)
        self.P = stft(mid, N_FFT, self.hop)
        self.PL = stft(self.x[:, 0], N_FFT, self.hop)
        self.PR = stft(self.x[:, 1], N_FFT, self.hop)
        self.f = np.fft.rfftfreq(N_FFT, 1 / sr)
        self.t = np.arange(self.P.shape[0]) * self.hop / sr
        self.length = len(mid) / sr

    def band(self, lo, hi, P=None):
        P = self.P if P is None else P
        return P[:, (self.f >= lo) & (self.f < hi)].sum(1)

    def curves(self):
        """Band levels at FRAME_HZ: {name: dB array}, and the times."""
        k = 100 // FRAME_HZ
        n = self.P.shape[0] // k
        out = {}
        for name, lo, hi in BANDS:
            out[name] = db(self.band(lo, hi)[:n * k].reshape(n, k).mean(1))
        L = self.PL.sum(1)[:n * k].reshape(n, k).mean(1)
        R = self.PR.sum(1)[:n * k].reshape(n, k).mean(1)
        out['balance'] = db(L) - db(R)          # + is left louder
        s = self.x[:, 0] - self.x[:, 1]
        m = self.x[:, 0] + self.x[:, 1]
        hop = self.sr // FRAME_HZ
        nn = min(n, len(s) // hop)
        es = (s[:nn * hop].reshape(nn, hop) ** 2).mean(1)
        em = (m[:nn * hop].reshape(nn, hop) ** 2).mean(1)
        width = np.full(n, np.nan)
        width[:nn] = db(es) - db(em)           # side over mid
        out['width'] = width
        return out, np.arange(n) / FRAME_HZ

    def thumps(self):
        """The low pulse: onsets in 25-90 Hz standing 10 dB over the second round them."""
        d = db(self.band(25, 90))
        med = np.array([np.median(d[max(0, i - 50):i + 50]) for i in range(len(d))])
        out = []
        for i in range(2, len(d) - 2):
            if d[i] == d[max(0, i - 15):i + 15].max() and d[i] - med[i] > 10 and d[i] > -45:
                out.append((round(float(self.t[i]), 2), round(float(d[i]), 1)))
        return out

    def drops(self, a, b):
        """Rain drops: peaks in the 2-16 kHz envelope (2 ms) 6 dB over its running median, a second."""
        sr = self.sr
        y = bandpass(self.x[int(a * sr):int(b * sr)].mean(1), sr, 2000, 16000)
        fr = int(0.002 * sr)
        e = db((y[:len(y) // fr * fr].reshape(-1, fr) ** 2).mean(1))
        med = np.array([np.median(e[max(0, i - 100):i + 100]) for i in range(0, len(e))])
        n = sum(1 for i in range(1, len(e) - 1) if e[i] >= e[i - 1] and e[i] > e[i + 1] and e[i] - med[i] > 6)
        k = np.mean(y ** 4) / np.mean(y ** 2) ** 2
        return n / (b - a), float(k)

    def rain_bed(self, a, b):
        """The bed: median power per bin over the span, at RAIN_POINTS (dB)."""
        m = (self.t >= a) & (self.t < b)
        med = np.median(self.P[m], axis=0)
        return [float(db(med[(self.f >= p / 1.1) & (self.f < p * 1.1)].mean())) for p in RAIN_POINTS]

    def track(self, a, b, lo, hi):
        """The strongest moving tone between lo and hi Hz, every 0.1 s from a to b: [(t, Hz, dB)].
        Each bin is taken over its median across the span first, so the held
        notes of the music (level lines) give way to what glides."""
        sr = self.sr
        n = 8192
        seg = self.x[int(a * sr):int(b * sr)].mean(1)
        P = stft(seg, n, sr // 10)
        f = np.fft.rfftfreq(n, 1 / sr)
        m = (f >= lo) & (f < hi)
        Pm = P[:, m]
        rel = Pm / (np.median(Pm, axis=0) + 1e-14)
        out = []
        for i in range(P.shape[0]):
            j = np.argmax(rel[i])
            out.append((round(a + i / 10, 1), round(float(f[m][j]), 1), round(float(db(Pm[i, j])), 1)))
        return out

    def car(self):
        """The pass: when it peaks, how loud over the bed before it, from which side."""
        out = {}
        m0 = (self.t >= 16.5) & (self.t < 18.5)
        win = (self.t >= 18.0) & (self.t < 24.0)
        for name, lo, hi in [('150-1500', 150, 1500), ('1.5k-8k', 1500, 8000), ('8k-16k', 8000, 16000)]:
            e = self.band(lo, hi)
            sm = np.convolve(e, np.ones(20) / 20, mode='same')
            bed = db(np.median(e[m0]))
            i = np.argmax(np.where(win, sm, 0))
            peak = db(sm[i])
            over = sm > 10 ** ((bed + 6) / 10)
            j0 = i
            while j0 > 0 and over[j0]:
                j0 -= 1
            j1 = i
            while j1 < len(over) - 1 and over[j1]:
                j1 += 1
            bal = db(self.band(lo, hi, self.PL)[i - 10:i + 10].sum()) - db(self.band(lo, hi, self.PR)[i - 10:i + 10].sum())
            out[name] = dict(peak_t=round(float(self.t[i]), 2), over_bed=round(float(peak - bed), 1),
                             peak=round(float(peak), 1), above_6dB=[round(float(self.t[j0]), 2), round(float(self.t[j1]), 2)],
                             balance_LR=round(float(bal), 1))
        return out

    def end(self):
        """The end: when the whole drops 20 and 40 dB under its level at 69-70 s; the last sound."""
        e = self.P.sum(1)
        ref = db(np.median(e[(self.t >= 69) & (self.t < 70)]))
        d = db(np.convolve(e, np.ones(5) / 5, mode='same'))
        out = {}
        for k in (10, 20, 40):
            idx = np.where((self.t > 70) & (d < ref - k))[0]
            out[f'down_{k}dB'] = round(float(self.t[idx[0]]), 2) if len(idx) else None
        hi = db(self.band(4000, 16000))
        idx = np.where((self.t > 70) & (hi < db(np.median(self.band(4000, 16000)[(self.t >= 69) & (self.t < 70)])) - 20))[0]
        out['highs_down_20dB'] = round(float(self.t[idx[0]]), 2) if len(idx) else None
        return out

    def summary(self):
        curves, ct = self.curves()
        out = {'file': self.path, 'length_s': round(self.length, 2)}
        mid = self.x.mean(1)
        out['rms_dB'] = round(float(db(np.mean(mid ** 2))), 1)
        out['peak_dB'] = round(float(20 * np.log10(np.abs(self.x).max() + 1e-9)), 1)
        out['LR_correlation'] = round(float(np.corrcoef(self.x[:, 0], self.x[:, 1])[0, 1]), 2)
        out['thumps'] = self.thumps()
        out['rain'] = {name: {'bed_dB_at_' + '/'.join(str(p) for p in RAIN_POINTS): [round(v, 1) for v in self.rain_bed(a, b)],
                              'drops_per_s_and_kurtosis': [round(v, 1) for v in self.drops(a, b)]} for name, a, b in RAIN_SPANS}
        out['car'] = self.car()
        out['end'] = self.end()
        return out, curves, ct


def half_second_table(curves, ct, other=None):
    rows = []
    head = '    t  ' + ' '.join(f'{n:>7}' for n, _, _ in BANDS) + '   bal  width'
    rows.append(head)
    for i in range(0, len(ct), FRAME_HZ // 2):
        sl = slice(i, i + FRAME_HZ // 2)
        vals = [float(db(np.mean(10 ** (curves[n][sl] / 10)))) for n, _, _ in BANDS]
        line = f'{ct[i]:5.1f}  ' + ' '.join(f'{v:7.1f}' for v in vals)
        line += f'  {np.nanmean(curves["balance"][sl]):+5.1f} {np.nanmean(curves["width"][sl]):6.1f}'
        if other is not None:
            oc, _ = other
            if i + FRAME_HZ // 2 <= len(oc['sub']):
                ov = [float(db(np.mean(10 ** (oc[n][sl] / 10)))) for n, _, _ in BANDS]
                line += '   ours-theirs ' + ' '.join(f'{b - a:+5.1f}' for a, b in zip(vals, ov))
        rows.append(line)
    return '\n'.join(rows)


def smooth_db(v, n):
    p = 10 ** (np.nan_to_num(v, nan=-120) / 10)
    return db(np.convolve(p, np.ones(n) / n, mode='same'))


def plot_curves(takes, path, smooth=5):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(len(BANDS) + 2, 1, figsize=(18, 16), sharex=True)
    colours = ['#d33', '#29c']
    for k, (take, (curves, ct)) in enumerate(takes):
        for ax, (name, lo, hi) in zip(axes, BANDS):
            ax.plot(ct, smooth_db(curves[name], smooth), color=colours[k], lw=1, label=take.label)
            ax.set_ylabel(f'{name}\n{lo}-{hi} Hz')
            ax.set_ylim(-75, -15)
            ax.grid(alpha=0.3)
        axes[-2].plot(ct, np.convolve(np.nan_to_num(curves['balance']), np.ones(smooth) / smooth, mode='same'), color=colours[k], lw=1)
        axes[-2].set_ylabel('L - R dB')
        axes[-2].set_ylim(-16, 16)
        axes[-2].grid(alpha=0.3)
        axes[-1].plot(ct, smooth_db(curves['width'], smooth), color=colours[k], lw=1)
        axes[-1].set_ylabel('side / mid dB')
        axes[-1].set_ylim(-40, 0)
        axes[-1].grid(alpha=0.3)
    axes[0].legend(loc='upper right')
    axes[-1].set_xlabel('s')
    axes[-1].set_xticks(np.arange(0, 73, 2))
    fig.tight_layout()
    fig.savefig(path, dpi=70)
    plt.close(fig)


def plot_specs(takes, path, a, b, fmin=30, fmax=16000, n=2048, title=''):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(len(takes), 1, figsize=(16, 5.2 * len(takes)), sharex=True)
    axes = np.atleast_1d(axes)
    for ax, take in zip(axes, takes):
        sr = take.sr
        seg = take.x[int(a * sr):int(b * sr)].mean(1)
        hop = max(48, int((b - a) * sr / 1600))
        P = stft(seg, n, hop)
        f = np.fft.rfftfreq(n, 1 / sr)
        t = a + np.arange(P.shape[0]) * hop / sr
        m = (f >= fmin) & (f <= fmax)
        ax.pcolormesh(t, f[m], db(P[:, m].T), vmin=-115, vmax=-30, cmap='inferno', shading='auto')
        ax.set_yscale('log')
        ax.set_ylim(fmin, fmax)
        ax.set_ylabel(f'{take.label}  Hz')
        ax.grid(alpha=0.2, which='both')
    axes[0].set_title(title)
    axes[-1].set_xlabel('s')
    fig.tight_layout()
    fig.savefig(path, dpi=70)
    plt.close(fig)


def print_summary(s):
    print(f"{s['file']}: {s['length_s']} s, rms {s['rms_dB']} dB, peak {s['peak_dB']} dB, L/R correlation {s['LR_correlation']}")
    th = s['thumps']
    print(f"  thumps: {len(th)}; " + ' '.join(f'{t:.2f}' for t, _ in th))
    if len(th) > 3:
        d = np.diff([t for t, _ in th])
        print(f"    median interval {np.median(d):.3f} s, median level {np.median([v for _, v in th]):.1f} dB")
    print('  rain (bed dB per bin at ' + '/'.join(str(p) for p in RAIN_POINTS) + ' Hz; drops a second; kurtosis 2-16 kHz):')
    for name, r in s['rain'].items():
        bed = list(r.values())[0]
        dk = r['drops_per_s_and_kurtosis']
        print(f"    {name:18} " + ' '.join(f'{v:6.1f}' for v in bed) + f"   {dk[0]:5.1f}/s  k {dk[1]:.1f}")
    print('  car:')
    for name, c in s['car'].items():
        print(f"    {name:9} peak {c['peak_t']} s, {c['over_bed']:+.1f} dB over the bed ({c['peak']} dB), "
              f"6 dB over from {c['above_6dB'][0]} to {c['above_6dB'][1]} s, L-R {c['balance_LR']:+.1f} dB")
    print(f"  end: {s['end']}")


def tracks(take):
    """The saucer's tones, followed: arrival whine, the lift, the departure."""
    out = {}
    for name, a, b, lo, hi in [['arrival whine 2-5 kHz', 49.4, 51.6, 2000, 5000],
                               ['arrival whistle 300-1500 Hz', 49.2, 52.6, 300, 1500],
                               ['lift 240-420 Hz', 56.5, 57.5, 240, 420],
                               ['departure 170-650 Hz', 61.0, 63.8, 170, 650]]:
        out[name] = take.track(a, b, lo, hi)
    return out


def main():
    if len(sys.argv) < 3:
        print('usage: sound.py measure take.wav | compare theirs.wav ours.wav [tag]')
        sys.exit(1)
    cmd = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    if cmd == 'measure':
        take = Take(sys.argv[2])
        s, curves, ct = take.summary()
        print_summary(s)
        print(half_second_table(curves, ct))
        for name, tr in tracks(take).items():
            print(f'  {name}: ' + ' '.join(f'{t:.1f}:{f:.0f}({d:.0f})' for t, f, d in tr))
        with open(os.path.join(OUT, f'{take.name}.json'), 'w') as fh:
            json.dump({**s, 'bands_10Hz': {k: [round(float(v), 1) for v in np.nan_to_num(c, nan=-120)] for k, c in curves.items()}}, fh)
        plot_curves([(take, (curves, ct))], os.path.join(OUT, f'{take.name}-bands.png'))
        plot_specs([take], os.path.join(OUT, f'{take.name}-spectrogram.png'), 0, min(72.55, take.length), n=4096)
    elif cmd == 'compare':
        a, b = Take(sys.argv[2]), Take(sys.argv[3])
        a.label = 'theirs'
        b.label = sys.argv[4] if len(sys.argv) > 4 else 'ours'
        sa, ca, ta = a.summary()
        sb, cb, tb = b.summary()
        print_summary(sa)
        print_summary(sb)
        print(half_second_table(ca, ta, (cb, tb)))
        # Over the whole take, and per stretch: how far ours is from theirs in each band (dB).
        spans = [[0, 9.5], [9.5, 16], [16, 19.5], [19.5, 22.5], [22.5, 31], [31, 42], [42, 47], [47, 53.2], [53.2, 56], [56, 58], [58, 61.5], [61.5, 65], [65, 70.5], [70.5, 72.5]]
        print('  ours - theirs, mean power per span (dB):')
        print('    span        ' + ' '.join(f'{n:>7}' for n, _, _ in BANDS))
        for s0, s1 in spans:
            ma = (ta >= s0) & (ta < s1)
            mb = (tb >= s0) & (tb < s1)
            diffs = [float(db(np.mean(10 ** (cb[n][mb] / 10))) - db(np.mean(10 ** (ca[n][ma] / 10)))) for n, _, _ in BANDS]
            print(f'    {s0:4.1f}-{s1:4.1f}  ' + ' '.join(f'{d:+7.1f}' for d in diffs))
        ta_tr, tb_tr = tracks(a), tracks(b)
        for name in ta_tr:
            print(f'  {name}:')
            print('    theirs ' + ' '.join(f'{t:.1f}:{f:.0f}({d:.0f})' for t, f, d in ta_tr[name]))
            print('    ours   ' + ' '.join(f'{t:.1f}:{f:.0f}({d:.0f})' for t, f, d in tb_tr[name]))
        tag = sys.argv[4] if len(sys.argv) > 4 else 'compare'
        plot_curves([(a, (ca, ta)), (b, (cb, tb))], os.path.join(OUT, f'{tag}-bands.png'))
        plot_specs([a, b], os.path.join(OUT, f'{tag}-spectrogram.png'), 0, 72.55, n=4096, title='whole take')
        plot_specs([a, b], os.path.join(OUT, f'{tag}-tones.png'), 0, 72.55, fmin=30, fmax=1500, n=16384, title='tones, 30-1500 Hz')
        for name, s0, s1 in EVENTS:
            plot_specs([a, b], os.path.join(OUT, f'{tag}-{name}.png'), s0, s1, title=name)
        print(f'  pictures in {OUT}/{tag}-*.png')
    else:
        raise SystemExit(f'unknown command {cmd}')


if __name__ == '__main__':
    main()
