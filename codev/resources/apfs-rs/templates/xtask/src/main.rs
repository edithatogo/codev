use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde_json::Value as JsonValue;
use std::{fs, path::PathBuf};

#[derive(Parser)]
#[command(name = "xtask")]
#[command(about = "APFS-RS repository automation tasks")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Validate registry files against JSON schemas and cross-links.
    RegistryCheck,
    /// Validate one fixture by ID.
    FixtureCheck { fixture_id: String },
    /// Validate safety policy for the current tree or changed files.
    SafetyCheck {
        #[arg(long)]
        changed_files: Option<PathBuf>,
    },
    /// Print context for an agent task.
    TaskContext { capability_id: String },
    /// Validate docs, diagrams, and links.
    DocsCheck,
    /// Produce release evidence skeleton.
    ReleaseEvidence,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::RegistryCheck => registry_check(),
        Command::FixtureCheck { fixture_id } => fixture_check(&fixture_id),
        Command::SafetyCheck { changed_files } => safety_check(changed_files),
        Command::TaskContext { capability_id } => task_context(&capability_id),
        Command::DocsCheck => docs_check(),
        Command::ReleaseEvidence => release_evidence(),
    }
}

fn registry_check() -> Result<()> {
    validate_schema(
        "codev/resources/apfs-rs/capabilities.yaml",
        "codev/resources/apfs-rs/schemas/capabilities.schema.json",
    )?;
    validate_schema(
        "codev/resources/apfs-rs/fixtures.yaml",
        "codev/resources/apfs-rs/schemas/fixtures.schema.json",
    )?;
    validate_schema(
        "codev/resources/apfs-rs/safety-gates.yaml",
        "codev/resources/apfs-rs/schemas/safety-gates.schema.json",
    )?;
    validate_schema(
        "codev/resources/apfs-rs/dependency-policy.yaml",
        "codev/resources/apfs-rs/schemas/dependency-policy.schema.json",
    )?;
    println!("registry-check: schema validation passed");
    println!("registry-check: cross-registry validation TODO");
    Ok(())
}

fn validate_schema(yaml_path: &str, schema_path: &str) -> Result<()> {
    let yaml_text = fs::read_to_string(yaml_path).with_context(|| format!("read {yaml_path}"))?;
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(&yaml_text).with_context(|| format!("parse {yaml_path}"))?;
    let instance: JsonValue = serde_json::to_value(yaml_value).with_context(|| format!("convert {yaml_path} to json"))?;

    let schema_text = fs::read_to_string(schema_path).with_context(|| format!("read {schema_path}"))?;
    let schema: JsonValue = serde_json::from_str(&schema_text).with_context(|| format!("parse {schema_path}"))?;
    let validator = jsonschema::validator_for(&schema).with_context(|| format!("compile {schema_path}"))?;

    if let Err(error) = validator.validate(&instance) {
        anyhow::bail!("{yaml_path} failed schema validation: {error}");
    }
    Ok(())
}

fn fixture_check(fixture_id: &str) -> Result<()> {
    println!("fixture-check: {fixture_id}");
    println!("TODO: load fixtures.yaml, validate capability mappings, then run fixture-specific checks");
    Ok(())
}

fn safety_check(changed_files: Option<PathBuf>) -> Result<()> {
    if let Some(path) = changed_files {
        println!("safety-check: using changed files from {}", path.display());
    } else {
        println!("safety-check: full-tree mode");
    }
    println!("TODO: enforce unsafe, dependency, raw-write, and capability-update policies");
    Ok(())
}

fn task_context(capability_id: &str) -> Result<()> {
    println!("task-context: {capability_id}");
    println!("TODO: print capability row, required safety gates, fixtures, tests, and docs");
    Ok(())
}

fn docs_check() -> Result<()> {
    println!("docs-check: TODO markdown, links, Mermaid, and changelog/version consistency");
    Ok(())
}

fn release_evidence() -> Result<()> {
    fs::create_dir_all("target/release-evidence")?;
    fs::write("target/release-evidence/README.md", "# APFS-RS Release Evidence\n\nTODO\n")?;
    println!("release-evidence: wrote target/release-evidence");
    Ok(())
}
