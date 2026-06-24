use apfs_types::{parse_nx_superblock, ContainerSuperblock, ParseError, NX_SUPERBLOCK_MIN_SIZE};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum InspectError {
    #[error(transparent)]
    Parse(#[from] ParseError),
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InspectStatus {
    ApfsContainerDetected,
    NotApfs,
    Refused,
}

#[derive(Debug, Clone, Serialize)]
pub struct InspectReport {
    pub schema_version: String,
    pub source_kind: String,
    pub source_size_bytes: u64,
    pub status: InspectStatus,
    pub container: Option<ContainerSuperblock>,
    pub errors: Vec<Diagnostic>,
    pub warnings: Vec<Diagnostic>,
    pub safety: SafetySummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct Diagnostic {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SafetySummary {
    pub read_only: bool,
    pub physical_write_supported: bool,
    pub mount_supported: bool,
    pub extraction_supported: bool,
}

impl Default for SafetySummary {
    fn default() -> Self {
        Self {
            read_only: true,
            physical_write_supported: false,
            mount_supported: false,
            extraction_supported: false,
        }
    }
}

pub fn inspect_bytes(input: &[u8]) -> InspectReport {
    let source_size_bytes = input.len() as u64;
    if input.len() < NX_SUPERBLOCK_MIN_SIZE {
        return InspectReport {
            schema_version: "0.1.0".to_owned(),
            source_kind: "image".to_owned(),
            source_size_bytes,
            status: InspectStatus::Refused,
            container: None,
            errors: vec![Diagnostic {
                code: "APFS-E-INPUT-TOO-SHORT".to_owned(),
                message: format!(
                    "source is too short for an APFS container superblock probe: need at least {NX_SUPERBLOCK_MIN_SIZE} bytes"
                ),
            }],
            warnings: Vec::new(),
            safety: SafetySummary::default(),
        };
    }

    match parse_nx_superblock(input) {
        Ok(container) => InspectReport {
            schema_version: "0.1.0".to_owned(),
            source_kind: "image".to_owned(),
            source_size_bytes,
            status: InspectStatus::ApfsContainerDetected,
            container: Some(container),
            errors: Vec::new(),
            warnings: vec![Diagnostic {
                code: "APFS-W-CHECKSUM-NOT-YET-VALIDATED".to_owned(),
                message: "object checksum bytes are parsed, but Fletcher checksum validation is not implemented yet".to_owned(),
            }],
            safety: SafetySummary::default(),
        },
        Err(ParseError::MagicMismatch { found }) => InspectReport {
            schema_version: "0.1.0".to_owned(),
            source_kind: "image".to_owned(),
            source_size_bytes,
            status: InspectStatus::NotApfs,
            container: None,
            errors: vec![Diagnostic {
                code: "APFS-E-NOT-APFS".to_owned(),
                message: format!("block zero does not contain NXSB magic at offset 32; found bytes {found:?}"),
            }],
            warnings: Vec::new(),
            safety: SafetySummary::default(),
        },
        Err(err) => InspectReport {
            schema_version: "0.1.0".to_owned(),
            source_kind: "image".to_owned(),
            source_size_bytes,
            status: InspectStatus::Refused,
            container: None,
            errors: vec![Diagnostic {
                code: "APFS-E-PARSE-REFUSED".to_owned(),
                message: err.to_string(),
            }],
            warnings: Vec::new(),
            safety: SafetySummary::default(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_nxsb() -> Vec<u8> {
        let mut block = vec![0u8; 4096];
        block[32..36].copy_from_slice(b"NXSB");
        block[36..40].copy_from_slice(&4096u32.to_le_bytes());
        block[40..48].copy_from_slice(&16u64.to_le_bytes());
        block[180..184].copy_from_slice(&1u32.to_le_bytes());
        block
    }

    #[test]
    fn detects_apfs_container() {
        let report = inspect_bytes(&minimal_nxsb());
        assert_eq!(report.status, InspectStatus::ApfsContainerDetected);
        assert_eq!(report.container.unwrap().block_size, 4096);
    }

    #[test]
    fn reports_not_apfs() {
        let report = inspect_bytes(&vec![0u8; 4096]);
        assert_eq!(report.status, InspectStatus::NotApfs);
        assert_eq!(report.errors[0].code, "APFS-E-NOT-APFS");
    }
}
