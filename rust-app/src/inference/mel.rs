use rustfft::{FftPlanner, num_complex::Complex};

const SAMPLES: usize = 480_000;
const FRAMES: usize = 3000;
const FFT: usize = 400;
const BINS: usize = 201;

pub fn log_mel(audio: &[f32]) -> Vec<f32> {
    let mut padded = vec![0.0; SAMPLES];
    let length = audio.len().min(SAMPLES);
    padded[..length].copy_from_slice(&audio[..length]);
    let window: Vec<f32> = (0..FFT)
        .map(|i| 0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / FFT as f32).cos())
        .collect();
    let filters = filters();
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT);
    let mut buffer = vec![Complex::new(0.0, 0.0); FFT];
    let mut scratch = vec![Complex::new(0.0, 0.0); fft.get_inplace_scratch_len()];
    let mut output = vec![0.0_f32; 80 * FRAMES];
    let mut powers = [0.0; BINS];
    for frame in 0..FRAMES {
        for (i, item) in buffer.iter_mut().enumerate() {
            let position = (frame * 160 + i) as isize - 200;
            let reflected = if position < 0 { -position } else { position } as usize;
            let index = if reflected >= SAMPLES {
                2 * SAMPLES - reflected - 2
            } else {
                reflected
            };
            *item = Complex::new(padded[index] * window[i], 0.0);
        }
        fft.process_with_scratch(&mut buffer, &mut scratch);
        for (power, value) in powers.iter_mut().zip(&buffer) {
            *power = value.norm_sqr();
        }
        for mel in 0..80 {
            let energy: f32 = filters[mel * BINS..(mel + 1) * BINS]
                .iter()
                .zip(powers)
                .map(|(weight, power)| weight * power)
                .sum();
            output[mel * FRAMES + frame] = energy.max(1e-10).log10();
        }
    }
    let maximum = output.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    for value in &mut output {
        *value = (value.max(maximum - 8.0) + 4.0) / 4.0;
    }
    output
}

fn filters() -> Vec<f32> {
    let mel_max = 15.0 + (8.0_f64).ln() * 27.0 / 6.4_f64.ln();
    let hz: Vec<f64> = (0..82)
        .map(|i| {
            let mel = i as f64 * mel_max / 81.0;
            if mel < 15.0 {
                mel * 200.0 / 3.0
            } else {
                1000.0 * ((mel - 15.0) * 6.4_f64.ln() / 27.0).exp()
            }
        })
        .collect();
    let mut output = vec![0.0; 80 * BINS];
    for mel in 0..80 {
        for bin in 0..BINS {
            let frequency = bin as f64 * 40.0;
            let rising = (frequency - hz[mel]) / (hz[mel + 1] - hz[mel]);
            let falling = (hz[mel + 2] - frequency) / (hz[mel + 2] - hz[mel + 1]);
            output[mel * BINS + bin] =
                (rising.min(falling).max(0.0) * 2.0 / (hz[mel + 2] - hz[mel])) as f32;
        }
    }
    output
}

#[cfg(test)]
mod tests {
    #[test]
    fn silence_has_whisper_floor() {
        // Given normalized silent PCM; when extracting; then all bins use the log floor.
        let result = super::log_mel(&[0.0; 1600]);
        assert_eq!(result.len(), 240_000);
        assert!(result.iter().all(|value| (*value + 1.5).abs() < 1e-6));
    }
}
