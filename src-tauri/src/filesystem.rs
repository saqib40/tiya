use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct SaveFailure {
    pub message: String,
    pub disk_content: Option<String>,
}

pub fn save_checked(path: &Path, content: &str, expected: &str) -> Result<(), SaveFailure> {
    let disk_content = fs::read_to_string(path).map_err(|error| SaveFailure {
        message: error.to_string(),
        disk_content: None,
    })?;
    if disk_content != expected {
        return Err(SaveFailure {
            message: "This file changed on disk. Review the disk version before saving.".into(),
            disk_content: Some(disk_content),
        });
    }
    save_file(path, content).map_err(|error| SaveFailure {
        message: error.to_string(),
        disk_content: None,
    })
}

pub fn create_file(path: &Path) -> io::Result<()> {
    OpenOptions::new().write(true).create_new(true).open(path)?;
    Ok(())
}

pub fn read_text_file(path: &Path) -> io::Result<String> {
    const LIMIT: u64 = 8 * 1024 * 1024;
    let file = fs::File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > LIMIT {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Only text files up to 8 MB can be edited",
        ));
    }
    let mut bytes = Vec::new();
    file.take(LIMIT + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > LIMIT || bytes.contains(&0) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "This file is binary or too large to edit",
        ));
    }
    String::from_utf8(bytes).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "Only UTF-8 text files can be edited",
        )
    })
}

pub fn import_file(source: &Path, destination: &Path) -> io::Result<()> {
    const LIMIT: u64 = 64 * 1024 * 1024;
    let file = fs::File::open(source)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > LIMIT {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Only files up to 64 MB can be imported",
        ));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Invalid destination"))?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".tiya-import-")
        .tempfile_in(parent)?;
    if io::copy(&mut file.take(LIMIT + 1), &mut temporary)? > LIMIT {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "The imported file exceeds 64 MB",
        ));
    }
    temporary.as_file().sync_all()?;
    temporary
        .persist_noclobber(destination)
        .map_err(|failure| failure.error)?;
    Ok(())
}

pub fn move_node(source: &Path, destination: &Path) -> io::Result<()> {
    match fs::symlink_metadata(destination) {
        Ok(_) => {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "A file or folder already exists at the destination",
            ))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Move symbolic links with your system file manager",
        ));
    }
    let parent = fs::canonicalize(
        destination
            .parent()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Invalid destination"))?,
    )?;
    if metadata.is_dir() && parent.starts_with(fs::canonicalize(source)?) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "A folder cannot be moved into itself",
        ));
    }
    if metadata.is_file() {
        fs::hard_link(source, destination)?;
        if let Err(error) = fs::remove_file(source) {
            let _ = fs::remove_file(destination);
            return Err(error);
        }
        Ok(())
    } else {
        fs::rename(source, destination)
    }
}

pub fn save_file(path: &Path, content: &str) -> io::Result<()> {
    let target = fs::canonicalize(path)?;
    let metadata = fs::metadata(&target)?;
    if !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Not a regular file",
        ));
    }
    if metadata.permissions().readonly() {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "File is read-only",
        ));
    }
    let parent = target.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "File has no parent directory")
    })?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".tiya-save-")
        .tempfile_in(parent)?;
    temporary
        .as_file()
        .set_permissions(metadata.permissions())?;
    temporary.write_all(content.as_bytes())?;
    temporary.as_file().sync_all()?;
    temporary
        .persist(&target)
        .map_err(|failure| failure.error)?;
    #[cfg(unix)]
    fs::File::open(parent)?.sync_all()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_binary_files_without_replacing_existing_assets() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("original.png");
        let destination = directory.path().join("figure.png");
        fs::write(&source, [0x89, 0x50, 0x4e, 0x47, 0]).unwrap();
        import_file(&source, &destination).unwrap();
        fs::write(&source, "different file").unwrap();
        assert_eq!(
            import_file(&source, &destination).unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(fs::read(&destination).unwrap(), [0x89, 0x50, 0x4e, 0x47, 0]);
    }

    #[test]
    fn rejects_binary_and_oversized_editor_reads() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("data.bin");
        fs::write(&path, b"binary\0data").unwrap();
        assert!(read_text_file(&path).is_err());
        fs::File::create(&path)
            .unwrap()
            .set_len(8 * 1024 * 1024 + 1)
            .unwrap();
        assert!(read_text_file(&path).is_err());
        fs::write(&path, "ordinary text").unwrap();
        assert_eq!(read_text_file(&path).unwrap(), "ordinary text");
    }

    #[test]
    fn refuses_to_overwrite_external_changes() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("main.tex");
        fs::write(&path, "external edit").unwrap();
        let failure = save_checked(&path, "local edit", "original").unwrap_err();
        assert_eq!(failure.disk_content.as_deref(), Some("external edit"));
        assert_eq!(fs::read_to_string(path).unwrap(), "external edit");
    }

    #[test]
    fn saves_when_the_disk_version_matches() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("main.tex");
        fs::write(&path, "original").unwrap();
        save_checked(&path, "edited", "original").unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "edited");
    }

    #[test]
    fn moving_a_file_never_overwrites_an_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("first.tex");
        let destination = directory.path().join("second.tex");
        fs::write(&source, "first document").unwrap();
        fs::write(&destination, "second document").unwrap();
        assert_eq!(
            move_node(&source, &destination).unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(fs::read_to_string(source).unwrap(), "first document");
        assert_eq!(fs::read_to_string(destination).unwrap(), "second document");
    }

    #[test]
    fn renaming_preserves_content_and_removes_the_old_path() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("first.tex");
        let destination = directory.path().join("renamed.tex");
        fs::write(&source, "document").unwrap();
        move_node(&source, &destination).unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read_to_string(destination).unwrap(), "document");
    }

    #[test]
    fn rejects_moving_a_folder_into_itself() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("nested")).unwrap();
        assert_eq!(
            move_node(directory.path(), &directory.path().join("nested/child"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::InvalidInput
        );
    }

    #[test]
    fn duplicate_creation_preserves_existing_content() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("main.tex");
        create_file(&path).unwrap();
        fs::write(&path, "important manuscript").unwrap();

        assert_eq!(
            create_file(&path).unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "important manuscript");
    }

    #[test]
    fn saving_replaces_the_complete_file_without_leaving_temporary_files() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("main.tex");
        fs::write(&path, "original long content").unwrap();

        save_file(&path, "new").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn saving_does_not_recreate_a_deleted_or_moved_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("missing.tex");

        assert_eq!(
            save_file(&path, "stale buffer").unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        assert!(!path.exists());
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
    }

    #[test]
    fn saving_rejects_a_directory_without_modifying_it() {
        let directory = tempfile::tempdir().unwrap();

        assert_eq!(
            save_file(directory.path(), "content").unwrap_err().kind(),
            io::ErrorKind::InvalidInput
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn saving_preserves_permissions_and_symbolic_links() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("main.tex");
        let link = directory.path().join("linked.tex");
        fs::write(&target, "original").unwrap();
        fs::set_permissions(&target, fs::Permissions::from_mode(0o640)).unwrap();
        symlink(&target, &link).unwrap();

        save_file(&link, "edited").unwrap();

        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read_to_string(&target).unwrap(), "edited");
        assert_eq!(
            fs::metadata(&target).unwrap().permissions().mode() & 0o777,
            0o640
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_read_only_file_remains_unchanged() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("main.tex");
        fs::write(&path, "original").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();

        assert_eq!(
            save_file(&path, "edited").unwrap_err().kind(),
            io::ErrorKind::PermissionDenied
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}
