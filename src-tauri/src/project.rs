use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
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

fn project_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    let base = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (base.len() == 4
            && (base.starts_with("COM") || base.starts_with("LPT"))
            && matches!(base.as_bytes()[3], b'1'..=b'9'));
    if name.is_empty()
        || matches!(name, "." | "..")
        || name.ends_with('.')
        || reserved
        || name
            .chars()
            .any(|character| character.is_control() || "\\/<>:\"|?*".contains(character))
    {
        return Err("Enter a valid project name".into());
    }
    Ok(name)
}

fn template_content(template: &str) -> Result<&'static str, String> {
    match template {
        "article" => Ok(concat!(
            r"\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath}
\usepackage{hyperref}
    ",
            r"\title{Untitled Article}
\author{Your Name}
\date{\today}
\begin{document}
\maketitle
\begin{abstract}
Your abstract.
\end{abstract}
\section{Introduction}
Your introduction.
\section{Results}
\begin{equation}
E = mc^2
\end{equation}
\end{document}
"
        )),
        "report" => Ok(concat!(
            r"\documentclass[11pt]{report}
\usepackage[margin=1in]{geometry}
\usepackage{hyperref}
",
            r"\title{Untitled Report}
\author{Your Name}
\date{\today}
\begin{document}
\maketitle
",
            r"\tableofcontents
\chapter{Introduction}
Your introduction.
\chapter{Results}
Your results.
\end{document}
"
        )),
        "cv" => Ok(concat!(
            r"\documentclass[11pt]{article}
\usepackage[margin=0.8in]{geometry}
\usepackage{hyperref}
\pagestyle{empty}
\begin{document}
\begin{center}
{\LARGE Your Name}\\[4pt]
\href{mailto:you@example.com}{you@example.com}
\end{center}
\section*{Education}
",
            r"\textbf{Your University} \hfill Graduation year\\
Degree and field of study
\section*{Experience}
",
            r"\textbf{Role, Organization} \hfill Dates
\begin{itemize}
\item A measurable contribution.
\end{itemize}
\section*{Skills}
Your skills.
\end{document}
"
        )),
        "presentation" => Ok(concat!(
            r"\documentclass{beamer}
\usetheme{default}
",
            r"\title{Untitled Presentation}
\author{Your Name}
\date{\today}
\begin{document}
\frame{\titlepage}
\begin{frame}{Introduction}
\begin{itemize}
\item Your first point.
\item Your second point.
\end{itemize}
\end{frame}
\end{document}
"
        )),
        _ => Err("Unknown project template".into()),
    }
}

pub fn create_project(parent: &Path, name: &str, template: &str) -> Result<ProjectInfo, String> {
    let content = template_content(template)?;
    let directory = fs::canonicalize(parent)
        .map_err(|error| error.to_string())?
        .join(project_name(name)?);
    fs::create_dir(&directory)
        .map_err(|error| format!("Could not create the project folder: {error}"))?;
    let result = (|| {
        fs::write(directory.join("main.tex"), content).map_err(|error| error.to_string())?;
        set_root(&directory, &directory.join("main.tex"))
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&directory);
    }
    result
}

pub fn import_project(archive: &Path, parent: &Path, name: &str) -> Result<ProjectInfo, String> {
    const MAX_FILE: u64 = 64 * 1024 * 1024;
    const MAX_PROJECT: u64 = 256 * 1024 * 1024;
    let file = fs::File::open(archive).map_err(|error| error.to_string())?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("Invalid ZIP archive: {error}"))?;
    if archive.len() > 10_000 {
        return Err("The ZIP archive contains too many files".into());
    }
    let mut total = 0u64;
    let mut paths = std::collections::HashSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let path = entry
            .enclosed_name()
            .ok_or("The ZIP archive contains a path outside the project")?;
        for component in path.components() {
            if let std::path::Component::Normal(name) = component {
                project_name(name.to_str().ok_or("ZIP file names must be UTF-8")?)?;
            }
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("ZIP archives containing symbolic links are not supported".into());
        }
        if !paths.insert(path) {
            return Err("The ZIP archive contains duplicate file names".into());
        }
        total = total
            .checked_add(entry.size())
            .ok_or("The ZIP archive is too large")?;
        if entry.size() > MAX_FILE || total > MAX_PROJECT {
            return Err("The ZIP archive exceeds the 64 MB file or 256 MB project limit".into());
        }
    }
    let directory = fs::canonicalize(parent)
        .map_err(|error| error.to_string())?
        .join(project_name(name)?);
    fs::create_dir(&directory)
        .map_err(|error| format!("Could not create the project folder: {error}"))?;
    let result = (|| {
        let mut extracted = 0u64;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
            let relative = entry.enclosed_name().ok_or("Invalid ZIP path")?;
            if relative.components().any(|component| {
                component.as_os_str().to_string_lossy().starts_with(".tiya")
                    || component.as_os_str() == ".git"
            }) {
                continue;
            }
            let path = directory.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(path).map_err(|error| error.to_string())?;
            } else {
                fs::create_dir_all(path.parent().ok_or("Invalid ZIP path")?)
                    .map_err(|error| error.to_string())?;
                let mut output = fs::OpenOptions::new()
                    .create_new(true)
                    .write(true)
                    .open(&path)
                    .map_err(|error| error.to_string())?;
                let limit = MAX_FILE.min(MAX_PROJECT - extracted);
                let written = std::io::copy(
                    &mut std::io::Read::by_ref(&mut entry).take(limit + 1),
                    &mut output,
                )
                .map_err(|error| error.to_string())?;
                if written > limit {
                    return Err("The extracted project exceeds the size limit".into());
                }
                if written != entry.size() {
                    return Err("A ZIP entry has an invalid uncompressed size".into());
                }
                extracted += written;
            }
        }
        load_project(&directory)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&directory);
    }
    result
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

    fn archive_fixture(path: &Path, file_name: &str) {
        let mut archive = zip::ZipWriter::new(fs::File::create(path).unwrap());
        archive
            .start_file(file_name, zip::write::SimpleFileOptions::default())
            .unwrap();
        archive
            .write_all(template_content("article").unwrap().as_bytes())
            .unwrap();
        archive.finish().unwrap();
    }

    #[test]
    fn creates_a_complete_template_without_overwriting_existing_projects() {
        let directory = tempfile::tempdir().unwrap();
        let project = create_project(directory.path(), "Paper", "article").unwrap();
        assert!(project.root_file.unwrap().ends_with("main.tex"));
        assert!(create_project(directory.path(), "Paper", "cv").is_err());
        assert!(fs::read_to_string(directory.path().join("Paper/main.tex"))
            .unwrap()
            .contains("Untitled Article"));
    }

    #[test]
    fn imports_an_overleaf_style_zip_and_detects_its_root() {
        let directory = tempfile::tempdir().unwrap();
        let archive = directory.path().join("paper.zip");
        archive_fixture(&archive, "main.tex");
        let project = import_project(&archive, directory.path(), "Imported").unwrap();
        assert!(project.root_file.unwrap().ends_with("Imported/main.tex"));
        assert!(import_project(&archive, directory.path(), "Imported").is_err());
    }

    #[test]
    fn rejects_zip_traversal_before_creating_a_project() {
        let directory = tempfile::tempdir().unwrap();
        let archive = directory.path().join("unsafe.zip");
        archive_fixture(&archive, "../outside.tex");
        assert!(import_project(&archive, directory.path(), "Imported").is_err());
        assert!(!directory.path().join("Imported").exists());
        assert!(!directory.path().join("outside.tex").exists());
    }

    #[test]
    fn rejects_zip_symlinks_before_creating_a_project() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("unsafe.zip");
        let mut archive = zip::ZipWriter::new(fs::File::create(&path).unwrap());
        archive
            .add_symlink(
                "link",
                "../outside",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
        archive.finish().unwrap();
        assert!(import_project(&path, directory.path(), "Imported")
            .err()
            .unwrap()
            .contains("symbolic links"));
        assert!(!directory.path().join("Imported").exists());
    }

    #[test]
    fn rejects_invalid_project_names_and_unknown_templates() {
        let directory = tempfile::tempdir().unwrap();
        assert!(create_project(directory.path(), "../outside", "article").is_err());
        assert!(create_project(directory.path(), "CON", "article").is_err());
        assert!(create_project(directory.path(), "Paper", "unknown").is_err());
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
        let output = std::process::Command::new(&binary)
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
        for template in ["article", "report", "cv", "presentation"] {
            let project = create_project(directory.path(), template, template).unwrap();
            let output = std::process::Command::new(&binary)
                .current_dir(&project.path)
                .args(["-X", "compile", "--untrusted", "main.tex"])
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{template}: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            assert!(fs::read(Path::new(&project.path).join("main.pdf"))
                .unwrap()
                .starts_with(b"%PDF-"));
        }
    }
}
