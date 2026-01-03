# Tiya

<p align="center">
  </p>

LaTeX editor. Local. Freeeee


## Download & Editions

We offer two editions of Tiya depending on your needs.

### 1. Standalone Edition (if you just want to use it without much trouble, uses tectonic)
* Uses built-in LaTeX engine (Tectonic). No external installation required.
* **Size:** 60 - 100MBs.
* **Downloads:** 
  * **Windows**
    * [**Standard** - Download this one](https://github.com/saqib40/tiya/releases/download/v0.1.0-sidecar/tiya_0.1.0_x64-setup.exe)
    * [Enterprise/IT Installer](https://github.com/saqib40/tiya/releases/download/v0.1.0-sidecar/tiya_0.1.0_x64_en-US.msi)

  * **macOS**
    * [**Standard** - For M1/M2/M3 chips](https://github.com/saqib40/tiya/releases/download/v0.1.0-sidecar/tiya_0.1.0_aarch64.dmg)
    * [Manual/Binary compressed](https://github.com/saqib40/tiya/releases/download/v0.1.0-sidecar/tiya_aarch64.app.tar.gz)

  * **Linux**
    * [**Ubuntu / Debian / Mint / Kali**](https://github.com/saqib40/tiya/releases/download/v0.1.0-sidecar/tiya_0.1.0_amd64.deb)
    * [**Fedora / Red Hat / CentOS**](https://github.com/saqib40/tiya/releases/download/v0.1.0-sidecar/tiya-0.1.0-1.x86_64.rpm)
    * [**Universal** - Works on any distro, no install needed](https://github.com/saqib40/tiya/releases/download/v0.1.0-sidecar/tiya_0.1.0_amd64.AppImage)
* **Internet Connection:** Standalone Edition of Tiya automatically downloads LaTeX packages and fonts (like `geometry` or `amsmath`) from the internet the **first time** you use them. Though once a package is downloaded, it is saved to your computer and works **offline forever**.

### ️2. Standard Edition (Pure clone of overleaf, uses pdflatex)
* Use this if you already have a TeX environment.
  * You must have a LaTeX distribution installed and added to your PATH:
  * **Windows:** [MiKTeX](https://miktex.org/) (Requires [Strawberry Perl](https://strawberryperl.com/) for automation).
  * **macOS:** [MacTeX](https://www.tug.org/mactex/) (or `brew install basictex`).
  * **Linux:** TeX Live (`sudo apt install texlive-full`).
* Uses your system's existing LaTeX installation (`pdflatex` / `xelatex`).
* **Size:** 5 - 8MBs.
* **Downloads:** 
  * **Windows**
    * [**Standard** - Download this one](https://github.com/saqib40/tiya/releases/download/v0.1.0/tiya_0.1.0_x64-setup.exe)
    * [Enterprise/IT Installer](https://github.com/saqib40/tiya/releases/download/v0.1.0/tiya_0.1.0_x64_en-US.msi)

  * **macOS**
    * [**Standard** - For M1/M2/M3 chips](https://github.com/saqib40/tiya/releases/download/v0.1.0/tiya_0.1.0_aarch64.dmg)
    * [Manual/Binary compressed](https://github.com/saqib40/tiya/releases/download/v0.1.0/tiya_aarch64.app.tar.gz)

  * **Linux**
    * [**Ubuntu / Debian / Mint / Kali**](https://github.com/saqib40/tiya/releases/download/v0.1.0/tiya_0.1.0_amd64.deb)
    * [**Fedora / Red Hat / CentOS**](https://github.com/saqib40/tiya/releases/download/v0.1.0/tiya-0.1.0-1.x86_64.rpm)
    * [**Universal** - Works on any distro, no install needed](https://github.com/saqib40/tiya/releases/download/v0.1.0/tiya_0.1.0_amd64.AppImage)

Note for macOS Users: Because this app is not yet notarized by Apple, you may see a "Damaged" error.
To fix this, run 
```bash 
xattr -cr /Applications/Tiya.app 
```
in your terminal after dragging it to Applications. 

## Features
* **Live Preview:** See your PDF update as you type.
* **Cross-Platform:** Runs natively on Windows, macOS, and Linux.

## If you want to contribute :

Built with [Tauri](https://tauri.app/), [React](https://reactjs.org/), and [Rust](https://www.rust-lang.org/).

### Prerequisites
1.  **Node.js** (LTS) & **npm**
2.  **Rust** (Cargo)
3.  **Tauri CLI:** `cargo install tauri-cli`

### Setup
```bash
# Clone the repo
git clone [https://github.com/yourusername/tiya.git](https://github.com/yourusername/tiya.git)
cd tiya

# Install frontend dependencies
npm install

# Run in Development Mode
npm run tauri dev

# there are two branches
# main would need you to install external dependencies to work on
# sidecar would work smoothly with above prerequisites