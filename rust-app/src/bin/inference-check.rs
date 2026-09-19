#[path = "../inference/mod.rs"]
mod inference;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let root = std::path::Path::new(
        args.get(1)
            .ok_or_else(|| anyhow::anyhow!("model root required"))?,
    );
    let mut engine = inference::Engine::load(root, true)?;
    println!(
        "translation={}",
        engine.translate("Hello, welcome to our video. Today we will learn about science.")?
    );
    if let Some(audio) = args.get(2) {
        let data = std::fs::read(audio)?;
        anyhow::ensure!(data.len() % 4 == 0, "expected raw little endian f32 PCM");
        let samples: Vec<f32> = data
            .as_chunks::<4>()
            .0
            .iter()
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();
        println!("recognition={}", engine.recognize(&samples)?);
    }
    Ok(())
}
