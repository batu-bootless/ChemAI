package tr.com.chemplus.app;

/**
 * A PCM WAV file in memory (Robert's natural voice arrives as one from the website's /api/ai/tts):
 * where the samples are, their format, and how loud each 20 ms of them is and what shape it has,
 * so Robert's face on the voice screen can speak with the voice while it plays.
 */
final class Wav {

    static final int LEVEL_FRAME_MS = 20;

    final byte[] bytes;
    final int sampleRate;
    final int channels;
    final int dataOffset;
    final int dataLength;

    private Wav(byte[] bytes, int sampleRate, int channels, int dataOffset, int dataLength) {
        this.bytes = bytes;
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.dataOffset = dataOffset;
        this.dataLength = dataLength;
    }

    /** 16-bit PCM only (what Gemini's speech models return); null for anything else. */
    static Wav parse(byte[] bytes) {
        if (bytes == null || bytes.length < 44) return null;
        if (!ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WAVE")) return null;
        int sampleRate = 0;
        int channels = 0;
        int bits = 0;
        int format = 0;
        int offset = 12;
        while (offset + 8 <= bytes.length) {
            int size = int32(bytes, offset + 4);
            int body = offset + 8;
            if (ascii(bytes, offset, "fmt ") && body + 16 <= bytes.length) {
                format = int16(bytes, body);
                channels = int16(bytes, body + 2);
                sampleRate = int32(bytes, body + 4);
                bits = int16(bytes, body + 14);
            } else if (ascii(bytes, offset, "data")) {
                if (format != 1 || bits != 16 || channels < 1 || channels > 2 || sampleRate <= 0) return null;
                // A streamed WAV may leave the size unset: take the rest of the file.
                int length = size <= 0 || body + size > bytes.length ? bytes.length - body : size;
                length -= length % (2 * channels);
                return length > 0 ? new Wav(bytes, sampleRate, channels, body, length) : null;
            }
            if (size < 0) return null;
            offset = body + size + (size & 1);
        }
        return null;
    }

    int frames() {
        return dataLength / (2 * channels);
    }

    /** Loudness of every 20 ms, 0…1 relative to the loudest moment of the clip. */
    float[] levels() {
        int perFrame = Math.max(1, sampleRate * LEVEL_FRAME_MS / 1000) * channels;
        int samples = dataLength / 2;
        int count = (samples + perFrame - 1) / perFrame;
        float[] out = new float[count];
        float peak = 1e-6f;
        for (int i = 0; i < count; i++) {
            int from = i * perFrame;
            int to = Math.min(samples, from + perFrame);
            double sum = 0;
            for (int s = from; s < to; s++) {
                int index = dataOffset + s * 2;
                short value = (short) ((bytes[index] & 0xFF) | (bytes[index + 1] << 8));
                sum += (double) value * value;
            }
            float rms = (float) Math.sqrt(sum / Math.max(1, to - from)) / 32768f;
            out[i] = rms;
            if (rms > peak) peak = rms;
        }
        for (int i = 0; i < count; i++) {
            float relative = out[i] / peak;
            // Quiet breaths stay still; speech fills the range.
            out[i] = relative < 0.04f ? 0f : (float) Math.min(1.0, Math.pow(relative, 0.7));
        }
        return out;
    }

    /**
     * The shape (VoiceShape: bright, f1, f2) of every 20 ms, from the first channel: what Robert's
     * mouth follows - teeth together for s/ş/z, open for a, drawn back for e/i, rounded for o/u.
     */
    float[][] shapes() {
        int perFrame = Math.max(1, sampleRate * LEVEL_FRAME_MS / 1000);
        int total = frames();
        int count = (total + perFrame - 1) / perFrame;
        float[][] out = new float[3][count];
        VoiceShape.LowPass filter = new VoiceShape.LowPass(sampleRate);
        for (int i = 0; i < count; i++) {
            VoiceShape.Frame frame = new VoiceShape.Frame(sampleRate);
            int to = Math.min(total, (i + 1) * perFrame);
            for (int f = i * perFrame; f < to; f++) {
                int index = dataOffset + f * channels * 2;
                double x = (short) ((bytes[index] & 0xFF) | (bytes[index + 1] << 8)) / 32768.0;
                frame.add(x, filter.next(x));
            }
            out[0][i] = frame.bright();
            out[1][i] = frame.f1();
            out[2][i] = frame.f2();
        }
        return out;
    }

    private static boolean ascii(byte[] bytes, int offset, String text) {
        if (offset + text.length() > bytes.length) return false;
        for (int i = 0; i < text.length(); i++) if (bytes[offset + i] != text.charAt(i)) return false;
        return true;
    }

    private static int int16(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8);
    }

    private static int int32(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8) | ((bytes[offset + 2] & 0xFF) << 16) | ((bytes[offset + 3] & 0xFF) << 24);
    }
}
