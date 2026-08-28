# AgenticAI Desktop Application

AgenticAI is a desktop application interface for executing local GGUF Large Language Models via `llama-server`.

---

## 🚀 Developer Setup Guide (Building from Source)

If you are a developer contributing to or building AgenticAI from source, follow these steps:

### 1. Prerequisites
* **Node.js**: v18+ or v20+
* **Git**: Installed with submodule support
* **CMake & MSVC** (Windows): Visual Studio 2022 / C++ Build Tools with CMake installed

---

### 2. Clone the Repository (with Submodules)
Clone the repository and recursively pull the `llama.cpp` engine submodule:

```bash
git clone --recursive https://github.com/YOUR_USERNAME/AgenticAI.git
cd AgenticAI
```

> *If you already cloned without submodules, run:*
> ```bash
> git submodule update --init --recursive
> ```

---

### 3. Install Dependencies & Build Engine

Step 1: Install Node.js dependencies:
```bash
npm install
```

Step 2: Compile `llama-server` engine locally:
```bash
npm run build:engine
```
*(This automatically runs CMake and compiles `llama-server.exe` into `Engine/llama.cpp/build/bin/Release/`)*.

---

### 4. Run the Application in Development Mode

```bash
npm run dev
```

1. Select a `.gguf` model file using the **Browse Model** button.
2. Click **Start Server**.
3. Send prompts in the local chat window!

---

## 📦 Packaging Production Release Setup (`AgenticAI-Setup.exe`)

To package a standalone Windows installer (`AgenticAI-Setup.exe`):

```bash
npm run package
```
The installer will be generated in the `release/` folder.
