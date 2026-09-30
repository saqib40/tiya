use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct ProjectInfo {
    pub path: String,
    pub root_file: Option<String>,
    pub tex_files: Vec<String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
struct ProjectSettings {
    root_file: Option<PathBuf>,
}

fn collect_sources(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || matches!(name.as_ref(), "node_modules" | "target" | "build") {
            continue;
        }
        if file_type.is_dir() {
            collect_sources(&entry.path(), files)?;
        } else if file_type.is_file()
            && entry
                .path()
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("tex"))
        {
            files.push(entry.path());
        }
    }
    Ok(())
}

pub fn load_project(path: &Path) -> Result<ProjectInfo, String> {
    let directory = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !directory.is_dir() {
        return Err("Select a project folder".into());
    }
    let settings_path = directory.join(".tiya.json");
    let settings: ProjectSettings = if settings_path.exists() {
        serde_json::from_slice(&fs::read(settings_path).map_err(|error| error.to_string())?)
            .map_err(|error| format!("Invalid project settings: {error}"))?
    } else {
        ProjectSettings::default()
    };
    let mut sources = Vec::new();
    collect_sources(&directory, &mut sources)?;
    sources.sort();
    let saved_root = settings
        .root_file
        .and_then(|relative| fs::canonicalize(directory.join(relative)).ok())
        .filter(|root| root.starts_with(&directory) && sources.contains(root));
    let candidates: Vec<_> = sources
        .iter()
        .filter(|source| {
            fs::read_to_string(source).is_ok_and(|content| {
                content
                    .lines()
                    .any(|line| line.trim_start().starts_with("\\documentclass"))
            })
        })
        .collect();
    let root = saved_root.or_else(|| {
        candidates
            .iter()
            .find(|source| **source == &directory.join("main.tex"))
            .copied()
            .cloned()
            .or_else(|| (candidates.len() == 1).then(|| candidates[0].clone()))
    });
    Ok(ProjectInfo {
        path: directory.to_string_lossy().into_owned(),
        root_file: root.map(|root| root.to_string_lossy().into_owned()),
        tex_files: sources
            .into_iter()
            .map(|source| source.to_string_lossy().into_owned())
            .collect(),
    })
}

pub fn resolve_file(project: &Path, root: &Path, requested: &Path) -> Result<PathBuf, String> {
    let directory = fs::canonicalize(project).map_err(|error| error.to_string())?;
    let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    if !root.starts_with(&directory) {
        return Err("The root document is outside this project".into());
    }
    let resolved = fs::canonicalize(
        root.parent()
            .ok_or("Invalid root document")?
            .join(requested),
    )
    .map_err(|error| format!("Source file is not available in this project: {error}"))?;
    if !resolved.starts_with(&directory) || !resolved.is_file() {
        return Err("The source file is outside this project".into());
    }
    Ok(resolved)
}

pub fn set_root(project: &Path, root: &Path) -> Result<ProjectInfo, String> {
    let directory = fs::canonicalize(project).map_err(|error| error.to_string())?;
    let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let relative = root
        .strip_prefix(&directory)
        .map_err(|_| "Root document must belong to this project")?;
    if !root.is_file()
        || !root
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("tex"))
    {
        return Err("Root document must be a LaTeX source file".into());
    }
    let settings = ProjectSettings {
        root_file: Some(relative.to_path_buf()),
    };
    let mut temporary = tempfile::Builder::new()
        .prefix(".tiya-settings-")
        .tempfile_in(&directory)
        .map_err(|error| error.to_string())?;
    temporary
        .write_all(&serde_json::to_vec_pretty(&settings).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temporary
        .persist(directory.join(".tiya.json"))
        .map_err(|error| error.to_string())?;
    load_project(&directory)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> tempfile::TempDir {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("chapters")).unwrap();
        fs::write(
            directory.path().join("main.tex"),
            "\\documentclass{article}\n\\input{chapters/intro}",
        )
        .unwrap();
        fs::write(directory.path().join("chapters/intro.tex"), "A chapter").unwrap();
        fs::write(directory.path().join("references.bib"), "@article{example}").unwrap();
        directory
    }

    #[test]
    fn detects_the_root_in_a_multi_file_project() {
        let directory = fixture();
        let project = load_project(directory.path()).unwrap();
        assert_eq!(
            project.root_file.unwrap(),
            directory.path().join("main.tex").to_string_lossy()
        );
        assert_eq!(project.tex_files.len(), 2);
    }

    #[test]
    fn persists_a_root_choice_relative_to_the_project() {
        let directory = fixture();
        let root = directory.path().join("paper.tex");
        fs::write(&root, "\\documentclass{article}").unwrap();
        set_root(directory.path(), &root).unwrap();
        assert_eq!(
            load_project(directory.path()).unwrap().root_file.unwrap(),
            root.to_string_lossy()
        );
        let settings: ProjectSettings =
            serde_json::from_slice(&fs::read(directory.path().join(".tiya.json")).unwrap())
                .unwrap();
        assert_eq!(settings.root_file.unwrap(), PathBuf::from("paper.tex"));
    }

    #[test]
    fn does_not_guess_between_ambiguous_documents() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(
            directory.path().join("article.tex"),
            "\\documentclass{article}",
        )
        .unwrap();
        fs::write(
            directory.path().join("letter.tex"),
            "\\documentclass{letter}",
        )
        .unwrap();
        assert!(load_project(directory.path()).unwrap().root_file.is_none());
    }

    #[test]
    fn ignores_commented_document_classes_and_generated_directories() {
        let directory = fixture();
        fs::create_dir(directory.path().join("build")).unwrap();
        fs::write(
            directory.path().join("build/generated.tex"),
            "\\documentclass{article}",
        )
        .unwrap();
        fs::write(
            directory.path().join("notes.tex"),
            "% \\documentclass{article}",
        )
        .unwrap();
        let project = load_project(directory.path()).unwrap();
        assert_eq!(project.tex_files.len(), 3);
        assert!(project.root_file.unwrap().ends_with("main.tex"));
    }

    #[test]
    fn resolves_diagnostic_files_within_the_project() {
        let directory = fixture();
        let path = resolve_file(
            directory.path(),
            &directory.path().join("main.tex"),
            Path::new("chapters/intro.tex"),
        )
        .unwrap();
        assert_eq!(path, directory.path().join("chapters/intro.tex"));
    }

    #[test]
    fn refuses_diagnostic_files_outside_the_project() {
        let directory = fixture();
        let outside = fixture();
        assert!(resolve_file(
            directory.path(),
            &directory.path().join("main.tex"),
            &outside.path().join("main.tex")
        )
        .is_err());
    }

    #[test]
    fn rejects_a_root_outside_the_project() {
        let directory = fixture();
        let outside = fixture();
        assert!(set_root(directory.path(), &outside.path().join("main.tex")).is_err());
        assert!(!directory.path().join(".tiya.json").exists());
    }

    #[test]
    #[ignore = "requires the platform sidecar binary and first-run package downloads"]
    fn bundled_engine_builds_chapters_and_bibliography() {
        let directory = fixture();
        fs::write(
            directory.path().join("main.tex"),
            r"\documentclass{article}
\begin{document}
\input{chapters/intro}
\cite{example}
\bibliographystyle{plain}
\bibliography{references}
\end{document}",
        )
        .unwrap();
        fs::write(
            directory.path().join("references.bib"),
            r"@article{example,
author={Example Author}, title={A Sample Paper}, journal={Sample Journal}, year={2026}}",
        )
        .unwrap();
        let binary_name = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("linux", "x86_64") => "tectonic-x86_64-unknown-linux-gnu",
            ("macos", "aarch64") => "tectonic-aarch64-apple-darwin",
            ("macos", "x86_64") => "tectonic-x86_64-apple-darwin",
            ("windows", "x86_64") => "tectonic-x86_64-pc-windows-msvc.exe",
            _ => panic!("No sidecar binary configured for this platform"),
        };
        let binary = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(binary_name);
        let output_directory = directory.path().join(".tiya-build-test");
        fs::create_dir(&output_directory).unwrap();
        let output = std::process::Command::new(binary)
            .current_dir(directory.path())
            .args([
                "-X",
                "compile",
                "--keep-logs",
                "--print",
                "--synctex",
                "--untrusted",
                "--outdir",
            ])
            .arg(&output_directory)
            .arg(directory.path().join("main.tex"))
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let pdf = fs::read(output_directory.join("main.pdf")).unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
        assert!(output_directory.join("main.synctex.gz").exists());
        let log = fs::read_to_string(output_directory.join("main.log")).unwrap();
        assert!(!log.contains("There were undefined references"));
    }
}
