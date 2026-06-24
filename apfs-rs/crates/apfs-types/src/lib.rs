use serde::Serialize;
use thiserror::Error;

pub const APFS_OBJECT_HEADER_SIZE: usize = 32;
pub const NX_SUPERBLOCK_MIN_SIZE: usize = 184;
pub const NX_MAGIC_BYTES: [u8; 4] = *b"NXSB";

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ParseError {
    #[error("input is too short for {structure}: need at least {needed} bytes, got {actual}")]
    TooShort {
        structure: &'static str,
        needed: usize,
        actual: usize,
    },
    #[error("APFS NX superblock magic mismatch at offset 32: expected NXSB, got {found:?}")]
    MagicMismatch { found: [u8; 4] },
    #[error("invalid APFS container block size {0}")]
    InvalidBlockSize(u32),
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ObjectHeader {
    pub checksum_hex: String,
    pub oid: u64,
    pub xid: u64,
    pub object_type_raw: u32,
    pub object_type: u16,
    pub object_flags: u16,
    pub object_subtype_raw: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ContainerSuperblock {
    pub object: ObjectHeader,
    pub magic: String,
    pub block_size: u32,
    pub block_count: u64,
    pub container_size_bytes: Option<u128>,
    pub features: u64,
    pub readonly_compatible_features: u64,
    pub incompatible_features: u64,
    pub uuid: String,
    pub next_oid: u64,
    pub next_xid: u64,
    pub checkpoint_descriptor_blocks_raw: u32,
    pub checkpoint_data_blocks_raw: u32,
    pub checkpoint_descriptor_base: u64,
    pub checkpoint_data_base: u64,
    pub checkpoint_descriptor_len: u32,
    pub checkpoint_data_len: u32,
    pub spaceman_oid: u64,
    pub omap_oid: u64,
    pub reaper_oid: u64,
    pub max_file_systems: u32,
}

pub fn parse_object_header(input: &[u8]) -> Result<ObjectHeader, ParseError> {
    require_len(input, APFS_OBJECT_HEADER_SIZE, "obj_phys_t")?;
    let checksum = &input[0..8];
    let object_type_raw = read_u32_le(input, 24)?;
    Ok(ObjectHeader {
        checksum_hex: bytes_to_lower_hex(checksum),
        oid: read_u64_le(input, 8)?,
        xid: read_u64_le(input, 16)?,
        object_type_raw,
        object_type: (object_type_raw & 0xffff) as u16,
        object_flags: (object_type_raw >> 16) as u16,
        object_subtype_raw: read_u32_le(input, 28)?,
    })
}

pub fn parse_nx_superblock(input: &[u8]) -> Result<ContainerSuperblock, ParseError> {
    require_len(input, NX_SUPERBLOCK_MIN_SIZE, "nx_superblock_t")?;
    let object = parse_object_header(&input[..APFS_OBJECT_HEADER_SIZE])?;
    let magic_bytes = read_array_4(input, 32)?;
    if magic_bytes != NX_MAGIC_BYTES {
        return Err(ParseError::MagicMismatch { found: magic_bytes });
    }

    let block_size = read_u32_le(input, 36)?;
    validate_block_size(block_size)?;
    let block_count = read_u64_le(input, 40)?;
    let container_size_bytes = u128::from(block_size).checked_mul(u128::from(block_count));

    Ok(ContainerSuperblock {
        object,
        magic: String::from("NXSB"),
        block_size,
        block_count,
        container_size_bytes,
        features: read_u64_le(input, 48)?,
        readonly_compatible_features: read_u64_le(input, 56)?,
        incompatible_features: read_u64_le(input, 64)?,
        uuid: format_uuid(&input[72..88]),
        next_oid: read_u64_le(input, 88)?,
        next_xid: read_u64_le(input, 96)?,
        checkpoint_descriptor_blocks_raw: read_u32_le(input, 104)?,
        checkpoint_data_blocks_raw: read_u32_le(input, 108)?,
        checkpoint_descriptor_base: read_u64_le(input, 112)?,
        checkpoint_data_base: read_u64_le(input, 120)?,
        checkpoint_descriptor_len: read_u32_le(input, 140)?,
        checkpoint_data_len: read_u32_le(input, 148)?,
        spaceman_oid: read_u64_le(input, 152)?,
        omap_oid: read_u64_le(input, 160)?,
        reaper_oid: read_u64_le(input, 168)?,
        max_file_systems: read_u32_le(input, 180)?,
    })
}

fn validate_block_size(block_size: u32) -> Result<(), ParseError> {
    if !(512..=1_048_576).contains(&block_size) || !block_size.is_power_of_two() {
        return Err(ParseError::InvalidBlockSize(block_size));
    }
    Ok(())
}

fn require_len(input: &[u8], needed: usize, structure: &'static str) -> Result<(), ParseError> {
    if input.len() < needed {
        return Err(ParseError::TooShort { structure, needed, actual: input.len() });
    }
    Ok(())
}

fn read_array_4(input: &[u8], offset: usize) -> Result<[u8; 4], ParseError> {
    require_len(input, offset + 4, "u32")?;
    let mut out = [0u8; 4];
    out.copy_from_slice(&input[offset..offset + 4]);
    Ok(out)
}

fn read_u32_le(input: &[u8], offset: usize) -> Result<u32, ParseError> {
    Ok(u32::from_le_bytes(read_array_4(input, offset)?))
}

fn read_u64_le(input: &[u8], offset: usize) -> Result<u64, ParseError> {
    require_len(input, offset + 8, "u64")?;
    let mut out = [0u8; 8];
    out.copy_from_slice(&input[offset..offset + 8]);
    Ok(u64::from_le_bytes(out))
}

fn format_uuid(bytes: &[u8]) -> String {
    debug_assert_eq!(bytes.len(), 16);
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
    )
}

fn bytes_to_lower_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use core::fmt::Write as _;
        let _ = write!(&mut out, "{byte:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_nxsb() -> [u8; 4096] {
        let mut block = [0u8; 4096];
        block[32..36].copy_from_slice(b"NXSB");
        block[36..40].copy_from_slice(&4096u32.to_le_bytes());
        block[40..48].copy_from_slice(&1024u64.to_le_bytes());
        block[180..184].copy_from_slice(&1u32.to_le_bytes());
        block
    }

    #[test]
    fn parses_minimal_nx_superblock_fields() {
        let block = minimal_nxsb();
        let parsed = parse_nx_superblock(&block).expect("valid minimal superblock");
        assert_eq!(parsed.magic, "NXSB");
        assert_eq!(parsed.block_size, 4096);
        assert_eq!(parsed.block_count, 1024);
        assert_eq!(parsed.container_size_bytes, Some(4_194_304));
        assert_eq!(parsed.max_file_systems, 1);
    }

    #[test]
    fn refuses_wrong_magic() {
        let mut block = minimal_nxsb();
        block[32..36].copy_from_slice(b"NOPE");
        let err = parse_nx_superblock(&block).unwrap_err();
        assert!(matches!(err, ParseError::MagicMismatch { .. }));
    }

    #[test]
    fn refuses_short_input() {
        let err = parse_nx_superblock(&[0u8; 16]).unwrap_err();
        assert!(matches!(err, ParseError::TooShort { .. }));
    }

    #[test]
    fn refuses_invalid_block_size() {
        let mut block = minimal_nxsb();
        block[36..40].copy_from_slice(&123u32.to_le_bytes());
        let err = parse_nx_superblock(&block).unwrap_err();
        assert_eq!(err, ParseError::InvalidBlockSize(123));
    }
}
