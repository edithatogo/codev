use std::path::PathBuf;

use anyhow::Context;
use apfs_core::{inspect_bytes, InspectStatus};
use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "apfs")]
#[command(about = "Clean-room APFS inspection tooling")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Inspect an APFS source image.
    Inspect {
        /// Source image path.
        source: PathBuf,
        /// Emit JSON output.
        #[arg(long)]
        json: bool,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Inspect { source, json } => inspect_command(source, json),
    }
}

fn inspect_command(source: PathBuf, json: bool) -> anyhow::Result<()> {
    let bytes = std::fs::read(&source).with_context(|| format!("open {}", source.display()))?;
    let report = inspect_bytes(&bytes);

    if json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("APFS-RS inspect report");
    println!("source: {}", source.display());
    println!("status: {:?}", report.status);
    if let Some(container) = &report.container {
        println!("container: {}", container.uuid);
        println!("block size: {}", container.block_size);
        println!("block count: {}", container.block_count);
        println!("incompatible features: 0x{:016x}", container.incompatible_features);
    }
    for warning in &report.warnings {
        eprintln!("warning {}: {}", warning.code, warning.message);
    }
    for error in &report.errors {
        eprintln!("error {}: {}", error.code, error.message);
    }

    if matches!(report.status, InspectStatus::Refused) {
        anyhow::bail!("inspect refused; rerun with --json for structured diagnostics");
    }

    Ok(())
}
