#!/usr/bin/env python3
"""
multi-screen — bande-son électronique minimale (60 s, 100 BPM, 48 kHz, stéréo).

Entièrement synthétisée avec numpy, sans échantillon : nappe additive, kick doux,
charleston, basse, arpèges pincés, et des effets calés à l'image près sur les repères
de l'animation (out/cues.json, écrit par `node render.cjs cues`). Sortie : out/music.wav.

Vocabulaire sonore : un clic doux pour chaque panneau déposé, un ping bref pour chaque
message envoyé, un ping plus aigu à deux notes pour chaque accusé de réception, un
souffle à chaque changement de thème, un accord final sur le logo.
"""
import json
import math
import os
import wave

import numpy as np

SR = 48000
DUR = 60.0
N = int(SR * DUR)
BEAT = 0.6  # 100 BPM, une mesure = 2,4 s
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
rs = np.random.default_rng(11)

with open(os.path.join(OUT, "cues.json")) as f:
    CUES = json.load(f)["cues"]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tline(n):
    return np.arange(n) / SR


class Bus:
    def __init__(self):
        self.l = np.zeros(N + SR * 4)
        self.r = np.zeros(N + SR * 4)

    def add(self, t0, sig, gain=1.0, pan=0.0):
        i = int(round(t0 * SR))
        if i < 0:
            sig = sig[..., -i:]
            i = 0
        n = min(sig.shape[-1], len(self.l) - i)
        if n <= 0:
            return
        gl = gain * math.cos((pan + 1) * math.pi / 4) * math.sqrt(2)
        gr = gain * math.sin((pan + 1) * math.pi / 4) * math.sqrt(2)
        if sig.ndim == 1:
            self.l[i:i + n] += sig[:n] * gl
            self.r[i:i + n] += sig[:n] * gr
        else:
            self.l[i:i + n] += sig[0, :n] * gl
            self.r[i:i + n] += sig[1, :n] * gr

    def stereo(self):
        return np.stack([self.l, self.r])


def spectral(sig, fn):
    n = len(sig)
    m = 1 << (n - 1).bit_length()
    S = np.fft.rfft(sig, m)
    f = np.fft.rfftfreq(m, 1 / SR)
    return np.fft.irfft(S * fn(f), m)[:n]


def lp(sig, fc, order=2):
    return spectral(sig, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def hp(sig, fc, order=2):
    return spectral(sig, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order)))


def bp(sig, fc, q=1.0):
    return spectral(sig, lambda f: np.exp(-0.5 * (np.log2(np.maximum(f, 1) / fc) * q * 2) ** 2))


def sweep_noise(dur, f0, f1, q=1.2, shape=None):
    """Bruit filtré à bande glissante (STFT), pour les souffles."""
    n = int(dur * SR)
    x = rs.standard_normal(n + 4096)
    win, hop = 2048, 512
    out = np.zeros(n + 4096)
    wnd = np.hanning(win)
    freqs = np.fft.rfftfreq(win, 1 / SR)
    for s in range(0, n, hop):
        u = s / max(1, n)
        fc = f0 * (f1 / f0) ** (u if shape is None else shape(u))
        g = np.exp(-0.5 * (np.log2(np.maximum(freqs, 1) / fc) * q * 2) ** 2)
        fr = np.fft.irfft(np.fft.rfft(x[s:s + win] * wnd) * g, win)
        out[s:s + win] += fr * wnd
    out = out[:n]
    return out / (np.max(np.abs(out)) + 1e-9)


def bell(freq, dur=1.6, decay=0.6, bright=1.0):
    n = int(dur * SR)
    t = tline(n)
    s = np.zeros(n)
    for ratio, amp, dk in [(1, 1, 1), (2.0, 0.35 * bright, 0.6), (2.76, 0.28 * bright, 0.45), (5.4, 0.12 * bright, 0.25), (8.93, 0.05 * bright, 0.15)]:
        s += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / (decay * dk))
    s *= np.minimum(1, t / 0.002)
    return s / 1.8


def pluck(freq, dur=0.9, decay=0.22, bright=0.6):
    n = int(dur * SR)
    t = tline(n)
    s = np.zeros(n)
    for h in range(1, 7):
        s += (bright ** (h - 1)) / h * np.sin(2 * np.pi * freq * h * t + h) * np.exp(-t / (decay / (1 + 0.5 * (h - 1))))
    s *= np.minimum(1, t / 0.003)
    return s


def ping(freq, dur=0.22, decay=0.05):
    """Ping bref : sinus pur et une pointe d'harmonique, pour les messages."""
    n = int(dur * SR)
    t = tline(n)
    s = np.sin(2 * np.pi * freq * t) + 0.18 * np.sin(2 * np.pi * freq * 2 * t)
    return s * np.exp(-t / decay) * np.minimum(1, t / 0.0015)


def click(dur=0.03, tone=2200, noise=0.6):
    n = int(dur * SR)
    t = tline(n)
    s = np.sin(2 * np.pi * tone * t) * np.exp(-t / 0.006)
    s += noise * hp(rs.standard_normal(n), 3000) * np.exp(-t / 0.002)
    return s


def soft_click(dur=0.09):
    """Clic doux de dépôt : bruit filtré bas et petit corps grave."""
    n = int(dur * SR)
    t = tline(n)
    s = lp(rs.standard_normal(n), 1800) * np.exp(-t / 0.008) * 0.8
    s += np.sin(2 * np.pi * np.cumsum(180 + 220 * np.exp(-t * 60)) / SR) * np.exp(-t / 0.03)
    return s


def thump(dur=0.5, f0=70, f1=42):
    n = int(dur * SR)
    t = tline(n)
    return np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t * 12)) / SR) * np.exp(-t / 0.16) * np.minimum(1, t / 0.004)


def kick(dur=0.42):
    n = int(dur * SR)
    t = tline(n)
    f = 44 + 90 * np.exp(-t * 32)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    s += 0.2 * lp(rs.standard_normal(n), 2500) * np.exp(-t / 0.004)
    return np.tanh(1.3 * s)


def hat(dur=0.06, open_=False):
    n = int(dur * SR)
    t = tline(n)
    return hp(rs.standard_normal(n), 7000, 3) * np.exp(-t / (0.05 if open_ else 0.013))


def rim(dur=0.12):
    n = int(dur * SR)
    t = tline(n)
    s = bp(rs.standard_normal(n), 1900, 1.4) * np.exp(-t / 0.028)
    s += 0.5 * np.sin(2 * np.pi * 840 * t) * np.exp(-t / 0.011)
    return s


# ───────────────────────── Harmonie (ré majeur, couleurs 9e) ─────────────────────────
CH = {
    "Dmaj9": (38, [57, 61, 62, 64, 66]),
    "Bm9": (35, [54, 57, 61, 62, 66]),
    "Gmaj9": (31, [54, 57, 59, 62, 66]),
    "Em9": (40, [55, 59, 62, 64, 66]),
    "A6": (33, [54, 57, 61, 64, 66]),
    "Asus": (33, [57, 59, 62, 64, 69]),
    "Dfin": (26, [50, 57, 61, 64, 66, 69]),
}
SECTIONS = [
    (0, 4.8, "Dmaj9"), (4.8, 9.6, "Bm9"), (9.6, 14.4, "Gmaj9"), (14.4, 19.2, "Dmaj9"), (19.2, 21.6, "Em9"),
    (21.6, 26.4, "Bm9"), (26.4, 30.0, "Gmaj9"), (30.0, 34.8, "Dmaj9"), (34.8, 39.6, "A6"), (39.6, 44.4, "Bm9"),
    (44.4, 48.0, "Gmaj9"), (48.0, 52.8, "Em9"), (52.8, 54.75, "Asus"), (54.75, 60, "Dfin"),
]


def chord_at(t):
    for a, b, c in SECTIONS:
        if a <= t < b:
            return CH[c]
    return CH["Dfin"]


pad, bass, arp, drums, sfx, verb_send = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()

# Nappe additive, trois voix désaccordées par note, lent battement
for a, b, name in SECTIONS:
    root, notes = CH[name]
    rel = 1.4 if name != "Dfin" else 0.5
    n = int((b - a + rel) * SR)
    t = tline(n)
    sl = np.zeros(n)
    sr_ = np.zeros(n)
    for j, m in enumerate(notes):
        for v, det in enumerate([-0.07, 0.0, 0.07]):
            f = hz(m) * 2 ** (det / 12)
            ph = rs.uniform(0, 2 * np.pi)
            voice = np.zeros(n)
            for h in range(1, 6):
                voice += (1 / h ** 1.9) * np.sin(2 * np.pi * f * h * t + ph * h)
            lfo = 0.75 + 0.25 * np.sin(2 * np.pi * (0.1 + 0.03 * j) * t + j + v)
            p = (v - 1) * 0.6 + (j - 2) * 0.1
            sl += voice * lfo * math.cos((p + 1) * math.pi / 4)
            sr_ += voice * lfo * math.sin((p + 1) * math.pi / 4)
    att = 0.4 if a > 0 else 2.6
    env = np.minimum(1, t / att) * np.where(t > (b - a), np.exp(-(t - (b - a)) / 0.4), 1)
    if name == "Dfin":
        env = np.minimum(1, t / 0.02) * np.exp(-t / 3.2)
    gain = 0.07 * (1.8 if a < 4.8 else 2.0 if name == "Dfin" else 1.0)
    pad.add(a, np.stack([sl * env, sr_ * env]), gain=gain)

# Batterie
def in_ranges(t, ranges):
    return any(x0 <= t < x1 for x0, x1 in ranges)

KICK_ON = [(4.8, 14.35), (15.6, 39.0), (40.2, 53.4)]
K = kick()
kick_times = []
for i in range(int(60 / BEAT) + 1):
    t = round(i * BEAT, 4)
    if in_ranges(t, KICK_ON):
        drums.add(t, K, 0.28)
        kick_times.append(t)
for i in range(int(60 / (BEAT / 2)) + 1):
    t = round(i * BEAT / 2, 4)
    if not in_ranges(t, [(7.2, 53.4)]):
        continue
    if i % 2 == 1:
        drums.add(t, hat(0.09, open_=(i % 8 == 7)), 0.075 if in_ranges(t, [(14.35, 15.6), (39.0, 40.2)]) else 0.11, pan=0.25)
    elif t >= 22.0:
        drums.add(t, hat(0.04), 0.03, pan=-0.3)
for i in range(int(60 / BEAT) + 1):
    t = round(i * BEAT, 4)
    if 22.0 <= t < 53.4 and (i % 4) in (1, 3) and not in_ranges(t, [(39.0, 40.2)]):
        drums.add(t, rim(), 0.07, pan=-0.15)
        verb_send.add(t, rim(), 0.04)

# Basse sur les contretemps
for i in range(int(60 / (BEAT / 2)) + 1):
    t = round(i * BEAT / 2, 4)
    if not (7.2 <= t < 53.4) or (i % 2) == 0 or in_ranges(t, [(14.35, 15.6), (39.0, 40.2)]):
        continue
    root, _ = chord_at(t)
    f = hz(root + 12)
    n = int(0.36 * SR)
    tt = tline(n)
    s = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt) + 0.08 * np.sin(2 * np.pi * 3 * f * tt)
    s *= np.minimum(1, tt / 0.004) * np.exp(-tt / 0.15)
    bass.add(t, np.tanh(1.6 * s), 0.12)

# Arpèges pincés en doubles croches, à partir de 0:15
arp_r = np.random.default_rng(5)
pattern = [1, 0, 0.6, 0, 0.8, 0, 0.5, 0.4, 1, 0, 0.6, 0.3, 0.8, 0, 0.5, 0]
for i in range(int(60 / (BEAT / 4)) + 1):
    t = round(i * BEAT / 4, 4)
    if not (15.6 <= t < 53.4) or in_ranges(t, [(39.0, 40.2)]):
        continue
    g = pattern[i % 16]
    if g == 0 or arp_r.random() > 0.78:
        continue
    _, notes = chord_at(t)
    seq = sorted(notes) + [m + 12 for m in sorted(notes)]
    m = seq[(i * 3) % len(seq)] + 12
    s = pluck(hz(m), 0.8, 0.15, 0.5 if t < 30 else 0.6)
    amp = 0.055 * g
    arp.add(t, s, amp, 0.45 if i % 2 else -0.45)
    verb_send.add(t, s, amp * 0.6)

# ───────────────────────── Effets calés sur l'image ─────────────────────────
for c in CUES:
    t, ty = c["t"], c["type"]
    i = c.get("i", 0)
    if ty == "draw":
        n = int(0.9 * SR)
        sfx.add(t, sweep_noise(0.9, 400, 3500, 1.3, shape=lambda u: u ** 0.7) * np.hanning(n), 0.045)
        b = bell(hz(81), 2.4, 0.9, 0.6)
        sfx.add(t + 0.75, b, 0.06)
        verb_send.add(t + 0.75, b, 0.08)
    elif ty == "stretch":
        n = int(0.8 * SR)
        sfx.add(t, sweep_noise(0.8, 300, 2400, 1.0) * np.hanning(n), 0.05)
    elif ty == "split":
        s = pluck(hz([74, 78][i]), 1.0, 0.25, 0.5)
        sfx.add(t + 0.05, s, 0.07, pan=[-0.3, 0.3][i])
        verb_send.add(t + 0.05, s, 0.06)
        sfx.add(t + 0.05, soft_click(), 0.08)
    elif ty == "title":
        for j, m in enumerate([62, 69, 78]):
            b = bell(hz(m + 12), 3.0, 1.1, 0.6)
            sfx.add(t + j * 0.07, b, 0.045, pan=(j - 1) * 0.4)
            verb_send.add(t + j * 0.07, b, 0.07)
    elif ty == "land":
        n = int(0.8 * SR)
        sfx.add(t, sweep_noise(0.8, 3000, 400, 1.0) * np.sin(np.pi * np.linspace(0, 1, n)), 0.05)
    elif ty == "pick":
        sfx.add(t, click(0.025, 1500, 0.3), 0.07, pan=-0.3)
    elif ty == "drop":
        sfx.add(t, soft_click(), 0.18, pan=0.15)
        sfx.add(t, thump(0.45, 90, 50), 0.16)
        s = pluck(hz([78, 81][i]), 1.1, 0.28, 0.5)
        sfx.add(t + 0.03, s, 0.07, pan=0.2)
        verb_send.add(t + 0.03, s, 0.07)
    elif ty == "click":
        sfx.add(t, click(0.03, 2100, 0.45), 0.13, pan=0.15)
    elif ty == "key":
        n = int(0.06 * SR)
        tt = tline(n)
        s = 0.7 * np.sin(2 * np.pi * 170 * tt) * np.exp(-tt / 0.012) + hp(rs.standard_normal(n), 2500) * np.exp(-tt / 0.004) * 0.6
        sfx.add(t, s, 0.1, pan=0.35)
    elif ty == "enter":
        n = int(0.06 * SR)
        tt = tline(n)
        s = 0.8 * np.sin(2 * np.pi * 140 * tt) * np.exp(-tt / 0.015) + hp(rs.standard_normal(n), 2500) * np.exp(-tt / 0.005) * 0.6
        sfx.add(t, s, 0.14)
        sfx.add(t + 0.05, ping(hz(90), 0.3, 0.06), 0.05, pan=0.3)
    elif ty == "save":
        sfx.add(t, click(0.03, 1800, 0.4), 0.1)
        for j, m in enumerate([78, 85]):
            b = bell(hz(m + 12), 1.6, 0.6, 0.6)
            sfx.add(t + 0.05 + j * 0.09, b, 0.06, pan=(j - 0.5) * 0.5)
            verb_send.add(t + 0.05 + j * 0.09, b, 0.08)
    elif ty == "fold":
        d = c["d"]
        n = int(d * SR)
        s = sweep_noise(d, 4500, 350, 0.9, shape=lambda u: 1 - (1 - u) ** 2) * np.sin(np.pi * np.linspace(0, 1, n)) ** 0.7
        sfx.add(t, s, 0.09)
        verb_send.add(t, s, 0.04)
        sfx.add(t + d * 0.8, thump(0.8, 60, 36), 0.25)
    elif ty == "insert":
        s = pluck(hz(85), 0.8, 0.2, 0.5)
        sfx.add(t, s, 0.06, pan=-0.2)
        verb_send.add(t, s, 0.05)
    elif ty == "version":
        sfx.add(t, click(0.03, 2600, 0.3), 0.07)
        for j, m in enumerate([81, 86]):
            b = bell(hz(m + 12), 1.8, 0.7, 0.6)
            sfx.add(t + j * 0.11, b, 0.06, pan=0.3)
            verb_send.add(t + j * 0.11, b, 0.08)
    elif ty == "select":
        sfx.add(t, click(0.025, 2400, 0.3), 0.07)
    elif ty == "fly":
        d = c["d"]
        n = int(d * SR)
        sfx.add(t, sweep_noise(d, 800, 3600, 1.2) * np.hanning(n), 0.06, pan=-0.3)
    elif ty == "route":
        m = [74, 78, 81][i]
        s = pluck(hz(m), 0.9, 0.22, 0.55)
        sfx.add(t, s, 0.07, pan=-0.4)
        verb_send.add(t, s, 0.06)
        sfx.add(t, soft_click(), 0.07, pan=-0.4)
    elif ty == "navigate":
        sfx.add(t, ping(hz([86, 90][i]), 0.25, 0.05), 0.06, pan=[0.25, 0.6][i])
        sfx.add(t, click(0.02, 2800, 0.2), 0.05, pan=[0.25, 0.6][i])
    elif ty == "remove":
        for j, m in enumerate([81, 78, 74]):
            sfx.add(t + j * 0.06, pluck(hz(m), 0.5, 0.12, 0.45), 0.05, pan=-0.3)
        n = int(0.5 * SR)
        sfx.add(t, sweep_noise(0.5, 3000, 600, 1.2) * np.hanning(n), 0.04)
    elif ty == "follow":
        sfx.add(t, thump(0.4, 80, 55), 0.12)
        for p in (0.25, 0.6):
            sfx.add(t, ping(hz(66), 0.2, 0.04), 0.05, pan=p)
    elif ty == "hello":
        sfx.add(t, ping(hz(93 + 2 * i), 0.18, 0.035), 0.035, pan=0.5 - 0.3 * i)
    elif ty == "send":
        sfx.add(t, ping(hz(86), 0.25, 0.05), 0.07, pan=-0.4)
        n = int(c["d"] * SR)
        s = lp(rs.standard_normal(n), 2400) * np.sin(np.pi * np.linspace(0, 1, n)) ** 2
        sfx.add(t, s, 0.03, pan=0.1)
    elif ty == "arrive":
        b = ping(hz([90, 93][i]), 0.35, 0.07)
        sfx.add(t, b, 0.08, pan=[0.3, 0.7][i])
        verb_send.add(t, b, 0.06)
    elif ty == "ack":
        for j, m in enumerate([95, 100]):
            sfx.add(t + j * 0.05, ping(hz(m), 0.16, 0.03), 0.05, pan=-0.5 + 0.1 * i)
    elif ty == "patch":
        sfx.add(t, ping(hz(98), 0.12, 0.02), 0.05, pan=-0.4)
        sfx.add(t, click(0.02, 3200, 0.2), 0.04, pan=-0.4)
    elif ty == "patched":
        for p in (0.3, 0.7):
            b = ping(hz(97), 0.25, 0.05)
            sfx.add(t, b, 0.06, pan=p)
            verb_send.add(t, b, 0.05)
    elif ty == "zoom":
        d = c["d"]
        n = int(d * SR)
        sfx.add(t, sweep_noise(d, 600, 4000, 1.0, shape=lambda u: u ** 1.4) * np.sin(np.pi * np.linspace(0, 1, n)), 0.07)
    elif ty == "pivot":
        d = c["d"]
        n = int((d + 0.2) * SR)
        s = sweep_noise(d + 0.2, 300, 1600, 0.9) * np.sin(np.pi * np.linspace(0, 1, n))
        sfx.add(t, s, 0.08, pan=-0.3)
        sfx.add(t + d, thump(0.7, 75, 40), 0.24)
        sfx.add(t + d, soft_click(), 0.1)
    elif ty == "rotate":
        d = c["d"]
        n = int(d * SR)
        sfx.add(t, sweep_noise(d, 1600, 500, 1.1) * np.hanning(n), 0.05, pan=-0.3)
        s = pluck(hz(78), 1.0, 0.25, 0.5)
        sfx.add(t + d, s, 0.06)
        verb_send.add(t + d, s, 0.06)
    elif ty == "theme":
        d = c["d"]
        n = int((d + 0.3) * SR)
        s = sweep_noise(d + 0.3, 5000, 450, 0.9) * np.sin(np.pi * np.linspace(0, 1, n))
        sfx.add(t - 0.05, s, 0.09, pan=-0.4 + 0.8 * np.clip(i, 0, 1))
        b = bell(hz([81, 86][i] + 12), 1.8, 0.7, 0.6)
        sfx.add(t + d * 0.6, b, 0.05, pan=-0.3)
        verb_send.add(t + d * 0.6, b, 0.08)
    elif ty == "tabs":
        sfx.add(t, click(0.025, 2600, 0.3), 0.08, pan=-0.3)
        sfx.add(t + 0.06, click(0.025, 2200, 0.3), 0.06, pan=-0.3)
    elif ty == "lock":
        sfx.add(t, click(0.02, 3400, 0.6), 0.12, pan=-0.2)
        sfx.add(t + 0.07, click(0.03, 1400, 0.4), 0.12, pan=-0.2)
    elif ty == "identify":
        for j, m in enumerate([74, 81, 86]):
            b = bell(hz(m + 12), 2.2, 0.9, 0.7)
            sfx.add(t + j * 0.05, b, 0.05, pan=-0.3)
            verb_send.add(t + j * 0.05, b, 0.08)
        sfx.add(t, thump(0.6, 70, 45), 0.14)
    elif ty == "cards":
        for j, m in enumerate([74, 78, 81]):
            s = pluck(hz(m), 0.9, 0.22, 0.5)
            sfx.add(t + j * 0.15, s, 0.06, pan=-0.6 + 0.6 * j)
            verb_send.add(t + j * 0.15, s, 0.05)
    elif ty == "playlist":
        sfx.add(t, ping(hz(88), 0.25, 0.05), 0.045, pan=-0.5)
    elif ty == "gather":
        d = c["d"]
        n = int(d * SR)
        s = sweep_noise(d, 600, 5000, 1.0, shape=lambda u: u ** 1.6) * np.linspace(0, 1, n) ** 2
        sfx.add(t, s, 0.08)
    elif ty == "logo":
        for j, m in enumerate([50, 57, 61, 64, 66, 69]):
            b = bell(hz(m + 12), 5.0, 1.8, 0.5)
            sfx.add(t + j * 0.035, b, 0.045, pan=(j - 2.5) * 0.25)
            verb_send.add(t + j * 0.035, b, 0.09)
        nb = int(3 * SR)
        tb = tline(nb)
        sfx.add(t, np.sin(2 * np.pi * hz(26) * tb) * np.exp(-tb / 1.3) * np.minimum(1, tb / 0.01), 0.25)
    elif ty == "tagline":
        for j in range(4):
            sfx.add(t + j * 0.12, click(0.02, 2600 + 250 * j, 0.2), 0.035, pan=-0.45 + 0.3 * j)

# ───────────────────────── Mixage ─────────────────────────
L = len(pad.l)
side = np.zeros(L)
for t in kick_times:
    i = int(t * SR)
    n = min(int(0.4 * SR), L - i)
    side[i:i + n] = np.maximum(side[i:i + n], np.exp(-tline(n) / 0.11))
duck = 1 - 0.45 * side

st = lambda bus: bus.stereo()
mix = st(pad) * duck + st(bass) * duck + st(arp) * (1 - 0.25 * side) + st(drums) + st(sfx)

# écho ping-pong sur les arpèges (croche pointée)
arp_s = st(arp)
echo = np.zeros_like(arp_s)
for k in range(1, 6):
    sh = int(k * 0.45 * SR)
    g = 0.4 ** k
    echo[k % 2, sh:] += arp_s[(k + 1) % 2][:-sh] * g
mix += np.stack([lp(echo[0], 3500), lp(echo[1], 3500)])

# réverbération à convolution (réponse synthétique)
ir_n = int(2.8 * SR)
ti = tline(ir_n)
ir = np.stack([rs.standard_normal(ir_n), rs.standard_normal(ir_n)]) * np.exp(-ti / 0.55)
ir[:, : int(0.018 * SR)] = 0
ir = np.stack([lp(ir[0], 5000), lp(ir[1], 5000)])
ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
send = st(verb_send) + st(pad) * 0.5 + st(arp) * 0.4
m = 1 << (L + ir_n).bit_length()
wet = np.stack([np.fft.irfft(np.fft.rfft(send[c], m) * np.fft.rfft(ir[c], m), m)[:L] for c in range(2)])
mix += wet * 0.5

mix = mix[:, :N]
mix = np.stack([hp(mix[0], 28), hp(mix[1], 28)])
fade_in = np.clip(tline(N) / 0.02, 0, 1)
fade_out = np.clip((DUR - tline(N)) / 1.4, 0, 1) ** 1.5
mix *= fade_in * fade_out
rms = np.sqrt(np.mean(mix ** 2))
mix *= 0.115 / rms
mix = np.tanh(mix * 1.15) / 1.15
mix *= 0.89 / np.max(np.abs(mix))

pcm = (mix.T * 32767).astype(np.int16)
os.makedirs(OUT, exist_ok=True)
with wave.open(os.path.join(OUT, "music.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"out/music.wav · {DUR:.0f} s · RMS {20 * math.log10(np.sqrt(np.mean(mix ** 2))):.1f} dBFS · crête {20 * math.log10(np.max(np.abs(mix))):.1f} dBFS")
