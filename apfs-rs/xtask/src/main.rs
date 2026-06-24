use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde_json::Value as JsonValue;
use std::fs;

#[derive(Parser)]
#[command(name = "xtask")]
#[command(about = "APFS-RS repository automation tasks")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    RegistryCheck,
    SafetyCheck,
    TaskContext { capability_id: String },
    ReleaseEvidence,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::RegistryCheck => registry_check(),
        Command::SafetyCheck => safety_check(),
        Command::TaskContext { capability_id } => task_context(&capability_id),
        Command::ReleaseEvidence => release_evidence(),
    }
}

fn registry_check() -> Result<()> {
    let pairs = [
        ("codev/resources/capabilities.yaml", "codev/resources/schemas/capabilities.schema.json"),
        ("codev/resources/safety-gates.yaml", "codev/resources/schemas/safety-gates.schema.json"),
    ];

    for (yaml, schema) in pairs {
        validate_schema(yaml, schema)?;
    }
    println!("registry-check: passed");
    Ok(())
}

fn validate_schema(yaml_path: &str, schema_path: &str) -> Result<()> {
    let yaml_text = fs::read_to_string(yaml_path).with_context(|| format!("read {yaml_path}"))?;
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(&yaml_text).with_context(|| format!("parse {yaml_path}"))?;
    let instance: JsonValue = serde_json::to_value(yaml_value).with_context(|| format!("convert {yaml_path}"))?;

    let schema_text = fs::read_to_string(schema_path).with_context(|| format!("read {schema_path}"))?;
    let schema: JsonValue = serde_json::from_str(&schema_text).with_context(|| format!("parse {schema_path}"))?;
    let validator = jsonschema::validator_for(&schema).with_context(|| format!("compile {schema_path}"))?;

    if let Err(error) = validator.validate(&instance) {
        anyhow::bail!("{yaml_path} failed schema validation: {error}");
    }
    Ok(())
}

fn safety_check() -> Result<()> {
    println!("safety-check: scaffold passed");
    Ok(())
}

fn task_context(capability_id: &str) -> Result<()> {
    println!("task-context for {capability_id}");
    println!("read codev/resources/capabilities.yaml and codev/resources/safety-gates.yaml");
    Ok(())
}

fn release_evidence() -> Result<()> {
    println!("release-evidence: no production release evidence yet");
    Ok(())
}
