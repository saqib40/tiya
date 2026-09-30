use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

pub fn create_file(path: &Path) -> io::Result<()> {
    OpenOptions::new().write(true).create_new(true).open(path)?;
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
