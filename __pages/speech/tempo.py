"""Pitch-preserving tempo from mlx-indextts; see third-party/WSOLA-LICENSE.txt."""
import numpy as np


def time_stretch_wsola(
    audio: np.ndarray,
    rate: float,
    frame_ms: int = 30,
    sample_rate: int = 24000,
) -> np.ndarray:
    """Time-stretch audio using WSOLA (Waveform Similarity Overlap-Add).

    Much better than phase vocoder for speech — preserves timbre and naturalness.
    rate > 1.0 speeds up, rate < 1.0 slows down. No pitch change.
    """
    if abs(rate - 1.0) < 1e-3:
        return audio

    frame_len = int(sample_rate * frame_ms / 1000)
    if len(audio) <= frame_len:
        return audio.copy()
    half = frame_len // 2
    # How far the output pointer advances per frame
    syn_hop = half
    # How far the input pointer advances per frame
    ana_hop = int(syn_hop * rate)
    search = half // 2  # search range for best overlap

    n = len(audio)
    # Pre-allocate output buffer
    out_len = int(n / rate) + frame_len
    output = np.zeros(out_len, dtype=np.float32)
    window = np.hanning(frame_len).astype(np.float32)
    norm = np.zeros(out_len, dtype=np.float32)

    in_pos = 0
    out_pos = 0

    while in_pos + frame_len < n and out_pos + frame_len < out_len:
        if out_pos == 0:
            best_offset = 0
        else:
            # Search for best match in a region around the expected position
            lo = max(0, in_pos - search)
            hi = min(n - frame_len, in_pos + search)
            if lo >= hi:
                best_offset = 0
            else:
                # Cross-correlation to find best overlap
                ref = output[out_pos:out_pos + half]
                best_corr = -np.inf
                best_offset = 0
                for offset in range(lo, hi):
                    candidate = audio[offset:offset + half]
                    corr = np.dot(ref, candidate)
                    if corr > best_corr:
                        best_corr = corr
                        best_offset = offset - in_pos

        src_pos = in_pos + best_offset
        if src_pos < 0:
            src_pos = 0
        if src_pos + frame_len > n:
            break

        frame = audio[src_pos:src_pos + frame_len] * window
        output[out_pos:out_pos + frame_len] += frame
        norm[out_pos:out_pos + frame_len] += window

        in_pos += ana_hop
        out_pos += syn_hop

    # Normalize overlapping regions
    mask = norm > 1e-8
    output[mask] /= norm[mask]

    # Trim to actual content
    last_nonzero = np.max(np.where(mask)[0]) + 1 if np.any(mask) else out_pos
    return output[:last_nonzero]
