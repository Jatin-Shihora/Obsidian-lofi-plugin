# Contributing to Lofi Focus

Thank you for considering contributing to this project. This document will help you get started with development and understand how to submit your changes.

## Getting Started

### Prerequisites

You'll need the following installed on your system:

- Node.js (version 16 or higher)
- npm (comes with Node.js)
- Git
- Obsidian desktop application
- A text editor or IDE (VS Code recommended)

### Setting Up the Development Environment

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/your-username/Obsidian-lofi-plugin.git
   cd Obsidian-lofi-plugin
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Link the plugin to your Obsidian vault**

   The easiest way to develop is to work directly in your Obsidian vault's plugins folder. Copy or symlink this directory to:

   - Windows: `%APPDATA%\Obsidian\YourVault\.obsidian\plugins\Obsidian-lofi-plugin\`
   - macOS: `~/Library/Application Support/obsidian/YourVault/.obsidian/plugins/Obsidian-lofi-plugin/`
   - Linux: `~/.config/obsidian/YourVault/.obsidian/plugins/Obsidian-lofi-plugin/`

   Alternatively, you can work in your current directory and manually copy the built files after each build.

4. **Start the development build**

   ```bash
   npm run dev
   ```

   This command watches for file changes and automatically rebuilds the plugin. You'll need to reload Obsidian (or disable and re-enable the plugin) to see your changes.

5. **Enable the plugin in Obsidian**

   - Open Obsidian
   - Go to Settings → Community Plugins
   - Disable safe mode if needed
   - Find "Lofi Focus" and enable it

### Development Workflow

1. Make your changes in the source files (TypeScript files in the root directory)
2. The dev server will automatically rebuild
3. Reload Obsidian to test your changes
4. Check the browser console (Ctrl+Shift+I or Cmd+Option+I) for any errors

### Building for Production

When you're ready to create a production build:

```bash
npm run build
```

This runs TypeScript type checking and creates an optimized build. The output will be in `main.js`.

## Code Style and Standards

### TypeScript Guidelines

- Use TypeScript for all new code
- Enable strict type checking when possible
- Add appropriate type annotations for function parameters and return values
- Avoid using `any` unless absolutely necessary

### Code Formatting

This project follows Obsidian's plugin guidelines. Key points:

- Use tabs for indentation
- Use sentence case for all user-facing text
- Avoid direct style manipulation - use CSS classes or `setCssProps()` instead
- Always handle promises with `await`, `.catch()`, or the `void` operator
- Remove unused imports and variables

### Obsidian API Best Practices

- Use `normalizePath()` for all file paths
- Clean up event listeners and intervals in `onunload()`
- Use Obsidian's UI components (Setting, Notice, Modal) for consistency
- Test with both light and dark themes

## Testing Your Changes

Before submitting a pull request, verify:

1. **The plugin builds without errors**
   ```bash
   npm run build
   ```

2. **All features work as expected**
   - Test audio playback with both streams and local files
   - Verify timer functionality (start, pause, reset)
   - Check settings persistence after reload
   - Test in both light and dark themes

3. **No console errors**
   - Open the developer console and check for errors
   - Test edge cases (empty playlists, invalid folders, etc.)

4. **Code quality**
   - Remove commented-out code
   - Update documentation if you changed functionality
   - Follow the existing code style

## Submitting Changes

### Creating a Pull Request

1. **Create a new branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes and commit**
   ```bash
   git add .
   git commit -m "Add feature: brief description"
   ```

   Write clear commit messages that explain what and why, not just what changed.

3. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Open a pull request**
   - Go to the original repository on GitHub
   - Click "New Pull Request"
   - Select your branch
   - Fill out the PR template with details about your changes

### Pull Request Guidelines

- Describe what your PR does and why
- Reference any related issues
- Include screenshots if you changed the UI
- Keep PRs focused - one feature or fix per PR works best
- Be responsive to feedback and questions

## Reporting Issues

If you find a bug or have a feature request:

1. Check if the issue already exists in the GitHub issues
2. If not, create a new issue with:
   - A clear title
   - Steps to reproduce (for bugs)
   - Expected behavior vs actual behavior
   - Your Obsidian version and operating system
   - Any relevant screenshots or error messages

## Questions?

If you have questions about contributing, feel free to:

- Open a discussion on GitHub
- Comment on an existing issue
- Reach out to the maintainers

We appreciate your interest in improving this plugin. Every contribution, whether it's code, documentation, or bug reports, helps make this project better for everyone.
