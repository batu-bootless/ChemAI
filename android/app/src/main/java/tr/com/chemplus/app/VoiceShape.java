package tr.com.chemplus.app;

/**
 * The shape of a stretch of Robert's voice, for his mouth on the voice screen: three numbers taken
 * from the waveform alone (no spectrum needed), all scaled to a 24 kHz rate so they mean the same
 * at any sample rate:
 *   bright - sqrt(Σ(Δx)² / Σx²): rises with the frequency content; above ~0.5 for s, ş, z;
 *   f1     - the same on the voice low-passed at 3 kHz: follows the first formant, i.e. how open
 *            the jaw is (a high; e, o in the middle; i, u low);
 *   f2     - sqrt(Σ(Δ²y)² / Σ(Δy)²) on that low-passed voice: how much of it sits up around the
 *            second formant - high for e, i (lips drawn back), low for o, u (lips rounded).
 * voiceShape() in naturalVoice.ts measures the same in the browser.
 */
final class VoiceShape {

    private VoiceShape() {}

    /** Two Butterworth low-pass sections at 3 kHz, fed one sample at a time. */
    static final class LowPass {
        private final double b0;
        private final double b1;
        private final double a1;
        private final double a2;
        private double x1;
        private double x2;
        private double y1;
        private double y2;
        private double u1;
        private double u2;
        private double v1;
        private double v2;

        LowPass(double rate) {
            double w = 2 * Math.PI * Math.min(3000.0, rate * 0.45) / rate;
            double cos = Math.cos(w);
            double alpha = Math.sin(w) / Math.sqrt(2.0);
            double a0 = 1 + alpha;
            b0 = (1 - cos) / 2 / a0;
            b1 = (1 - cos) / a0;
            a1 = -2 * cos / a0;
            a2 = (1 - alpha) / a0;
        }

        double next(double x) {
            double y = b0 * (x + x2) + b1 * x1 - a1 * y1 - a2 * y2;
            x2 = x1;
            x1 = x;
            y2 = y1;
            y1 = y;
            double v = b0 * (y + u2) + b1 * u1 - a1 * v1 - a2 * v2;
            u2 = u1;
            u1 = y;
            v2 = v1;
            v1 = v;
            return v;
        }
    }

    /** One stretch (20 ms of a clip, one capture of the speaker's output), sample by sample. */
    static final class Frame {
        private final double scale;
        private double raw0;
        private double raw1;
        private double low0;
        private double low1;
        private double low2;
        private double lastRaw;
        private double lastLow;
        private double lastStep;
        private int count;

        Frame(double rate) {
            scale = rate / 24000.0;
        }

        /** x: the voice; low: the same through LowPass. */
        void add(double x, double low) {
            if (count > 0) {
                double step = low - lastLow;
                raw1 += (x - lastRaw) * (x - lastRaw);
                low1 += step * step;
                if (count > 1) low2 += (step - lastStep) * (step - lastStep);
                lastStep = step;
            }
            raw0 += x * x;
            low0 += low * low;
            lastRaw = x;
            lastLow = low;
            count++;
        }

        float bright() {
            return raw0 <= 1e-12 ? 0f : (float) Math.min(2.0, Math.sqrt(raw1 / raw0) * scale);
        }

        float f1() {
            return low0 <= 1e-12 ? 0f : (float) Math.min(2.0, Math.sqrt(low1 / low0) * scale);
        }

        float f2() {
            return low1 <= 1e-12 ? 0f : (float) Math.min(2.0, Math.sqrt(low2 / low1) * scale);
        }
    }
}
